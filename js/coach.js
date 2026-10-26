/**
 * WortCoach - Coach (Saf Chat & İnteraktif Almanca Koçu)
 * - Doğrudan Sohbet Akışı (Sorular, Dilbilgisi, Metin/Görsel Analizi)
 * - İnteraktif Oyun/Alıştırma Kartları (Cloze, Matching, Grammar, Deste)
 * - Katı Almanca Sınırlandırması ve Token Koruma Kalkanı
 * - Sıfır emoji, analitik ve pedagojik tasarım.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const EMOJI_RE = /[\p{Extended_Pictographic}\u200d\ufe0f]/gu;
  const stripEmoji = (s) => String(s || '').replace(EMOJI_RE, '').trim();

  const MAX_PDF_BYTES = 4 * 1024 * 1024;
  const MAX_IMG_SIDE = 1600;
  const LETTERS = ['A', 'B', 'C', 'D'];

  const chatState = {
    file: null,
    fileName: '',
    contextText: '',
    history: [],
    busy: false
  };

  // Global helper for image processing (OCR / Coach)
  window.coachHelper = {
    downscaleImage(file) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const scale = Math.min(1, MAX_IMG_SIDE / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Görsel açılamadı.'));
        };
        img.src = url;
      });
    },
    readAsBase64(blob) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
        fr.onerror = () => reject(new Error('Dosya okunamadı.'));
        fr.readAsDataURL(blob);
      });
    },
  };

  function toast(msg) {
    if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(msg);
  }

  // =========================================================================
  // ÇALIŞMA DOSYASI YÜKLEME (PDF, DOCX, TXT, GÖRSEL)
  // =========================================================================
  async function handleChatContextFile(file) {
    if (!file) return;
    const name = file.name || 'dosya';
    const lower = name.toLowerCase();
    try {
      if (file.type.startsWith('image/')) {
        chatState.file = { mime: 'image/jpeg', data: await window.coachHelper.downscaleImage(file) };
      } else if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        if (file.size > MAX_PDF_BYTES) throw new Error('PDF en fazla 4 MB olabilir.');
        chatState.file = { mime: 'application/pdf', data: await window.coachHelper.readAsBase64(file) };
      } else if (lower.endsWith('.docx')) {
        if (!window.mammoth) throw new Error('DOCX okuyucu yüklenemedi.');
        const res = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        chatState.contextText = (res.value || '').slice(0, 15000);
        chatState.file = null;
      } else if (lower.endsWith('.txt')) {
        chatState.contextText = (await file.text()).slice(0, 15000);
        chatState.file = null;
      }
      chatState.fileName = name;
      if ($('coach-chat-file-name')) $('coach-chat-file-name').textContent = name;
      $('coach-chat-file-chip')?.classList.remove('hidden');
      toast(`"${name}" çalışma bağlamı olarak eklendi.`);

      appendChatMessage('system', `Çalışma dosyası eklendi: ${name}. Bu belge hakkında soru sorabilir veya alıştırma isteyebilirsiniz.`);
    } catch (e) {
      chatState.file = null;
      $('coach-chat-file-chip')?.classList.add('hidden');
      toast(e.message || 'Dosya eklenemedi.');
    }
  }

  // =========================================================================
  // MESAJ OLUŞTURMA & AKIŞ
  // =========================================================================
  function appendChatMessage(role, text) {
    const stream = $('coach-chat-stream');
    if (!stream) return null;
    const msgEl = document.createElement('div');
    msgEl.className = `coach-chat-bubble coach-bubble-${role}`;
    const content = document.createElement('div');
    content.className = 'coach-chat-text';
    content.textContent = stripEmoji(text);
    msgEl.appendChild(content);
    stream.appendChild(msgEl);
    stream.scrollTop = stream.scrollHeight;
    return msgEl;
  }

  // =========================================================================
  // İNTERAKTİF ALIŞTIRMALAR (CLOZE, MATCHING, GRAMMAR, DECK)
  // =========================================================================
  function renderInteractiveExercise(exercise, container) {
    if (!exercise || exercise.type === 'NONE') return;

    const card = document.createElement('div');
    card.className = 'coach-exercise-card';

    const head = document.createElement('div');
    head.className = 'coach-exercise-head';
    const typeBadge = document.createElement('span');
    typeBadge.className = 'coach-exercise-badge';

    const TYPE_NAMES = {
      CLOZE: 'Boşluk Doldurma',
      MATCHING: 'Eşleştirme Oyunu',
      GRAMMAR: 'Dilbilgisi Çalışması',
      DECK: 'Deste Önerisi',
    };
    typeBadge.textContent = TYPE_NAMES[exercise.type] || 'Alıştırma';
    const titleText = document.createElement('span');
    titleText.className = 'coach-exercise-title';
    titleText.textContent = exercise.title || exercise.instruction || 'Pratik';
    head.append(typeBadge, titleText);
    card.appendChild(head);

    // 1. CLOZE veya GRAMMAR
    if ((exercise.type === 'CLOZE' || exercise.type === 'GRAMMAR') && Array.isArray(exercise.options)) {
      if (exercise.sentence) {
        const sentEl = document.createElement('div');
        sentEl.className = 'coach-exercise-sentence';
        sentEl.innerHTML = exercise.sentence.replace('___', '<span class="coach-cloze-blank">______</span>');
        card.appendChild(sentEl);
      }

      const grid = document.createElement('div');
      grid.className = 'coach-quiz-grid';

      let answered = false;
      exercise.options.forEach((optText, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'coach-quiz-option-btn';
        const letter = LETTERS[idx] ? `${LETTERS[idx]}-)` : `${idx + 1}-)`;
        btn.innerHTML = `<span class="coach-opt-letter">${letter}</span><span class="coach-opt-label">${optText}</span>`;

        btn.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const isCorrect = idx === exercise.correctIndex;
          const allBtns = grid.querySelectorAll('.coach-quiz-option-btn');
          allBtns.forEach((b, bIdx) => {
            b.disabled = true;
            if (bIdx === exercise.correctIndex) b.classList.add('correct');
            else if (bIdx === idx && !isCorrect) b.classList.add('wrong');
          });

          // Supabase Cloze / Kontext Stat Hook
          if (window.wmSocial && window.wmSocial.recordActivity) {
            window.wmSocial.recordActivity({
              type: 'cloze',
              isCorrect,
              responseTimeMs: 2500,
              comboCount: 0,
              isHardWord: false
            });
          }

          if (exercise.explanation) {
            const expEl = document.createElement('div');
            expEl.className = `coach-explanation-box ${isCorrect ? 'correct' : 'wrong'}`;
            expEl.textContent = `${isCorrect ? 'Doğru!' : 'Yanlış.'} ${exercise.explanation}`;
            card.appendChild(expEl);
          }
        });
        grid.appendChild(btn);
      });
      card.appendChild(grid);
    }

    // 2. MATCHING (Eşleştirme)
    if (exercise.type === 'MATCHING' && Array.isArray(exercise.pairs) && exercise.pairs.length > 0) {
      const matchWrap = document.createElement('div');
      matchWrap.className = 'coach-matching-arena';

      let selectedDeBtn = null;
      let matchedCount = 0;
      const totalPairs = exercise.pairs.length;

      const deCol = document.createElement('div');
      deCol.className = 'coach-matching-col';
      const trCol = document.createElement('div');
      trCol.className = 'coach-matching-col';

      const deList = exercise.pairs.map((p, i) => ({ text: p.de, id: i }));
      const trList = exercise.pairs.map((p, i) => ({ text: p.tr, id: i })).sort(() => Math.random() - 0.5);

      deList.forEach((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'coach-match-btn';
        b.textContent = item.text;
        b.dataset.pairId = String(item.id);
        b.addEventListener('click', () => {
          if (b.classList.contains('matched')) return;
          deCol.querySelectorAll('.coach-match-btn').forEach((x) => x.classList.remove('selected'));
          b.classList.add('selected');
          selectedDeBtn = b;
        });
        deCol.appendChild(b);
      });

      trList.forEach((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'coach-match-btn';
        b.textContent = item.text;
        b.dataset.pairId = String(item.id);
        b.addEventListener('click', () => {
          if (b.classList.contains('matched') || !selectedDeBtn) return;
          if (selectedDeBtn.dataset.pairId === b.dataset.pairId) {
            selectedDeBtn.classList.remove('selected');
            selectedDeBtn.classList.add('matched');
            b.classList.add('matched');
            selectedDeBtn = null;
            matchedCount++;
            if (matchedCount === totalPairs) {
              const winBox = document.createElement('div');
              winBox.className = 'coach-explanation-box correct';
              winBox.textContent = 'Harika! Tüm eşleştirmeleri doğru tamamladınız.';
              card.appendChild(winBox);
            }
          } else {
            b.classList.add('wrong');
            setTimeout(() => b.classList.remove('wrong'), 600);
          }
        });
        trCol.appendChild(b);
      });

      matchWrap.append(deCol, trCol);
      card.appendChild(matchWrap);
    }

    // 3. DECK ÖNERİSİ
    if (exercise.type === 'DECK' && Array.isArray(exercise.words) && exercise.words.length > 0) {
      const deckPreview = document.createElement('div');
      deckPreview.className = 'coach-deck-preview-box';
      const countLabel = document.createElement('div');
      countLabel.style.fontSize = '0.78rem';
      countLabel.style.color = 'var(--text-secondary)';
      countLabel.style.marginBottom = '8px';
      countLabel.textContent = `${exercise.words.length} kelimelik deste önerisi hazırlandı:`;
      deckPreview.appendChild(countLabel);

      const saveDeckBtn = document.createElement('button');
      saveDeckBtn.type = 'button';
      saveDeckBtn.className = 'btn-coach-build-full';
      saveDeckBtn.style.padding = '8px 14px';
      saveDeckBtn.style.fontSize = '0.84rem';
      saveDeckBtn.innerHTML = '<span>Bu Kelimeleri Destelerime Kaydet</span>';
      saveDeckBtn.addEventListener('click', async () => {
        saveDeckBtn.disabled = true;
        saveDeckBtn.innerHTML = '<span>Kaydediliyor...</span>';
        try {
          const deckId = 'coach_deck_' + Date.now();
          await window.wmDB.addDeck({
            id: deckId,
            name: exercise.title || 'Koç Destesi',
            color: '#2563EB',
            icon: 'book',
            isDefault: false
          });
          for (const w of exercise.words) {
            await window.wmDB.addCard({
              deckId,
              word: w.lemma,
              meaning: w.contextMeaning || '',
              partOfSpeech: w.pos || 'NOUN',
              exampleSentence: w.sourceSentence || '',
              srsStage: 0
            });
          }
          saveDeckBtn.innerHTML = '<span>Desteye Kaydedildi</span>';
          toast(`"${exercise.title || 'Koç Destesi'}" destelerinize eklendi.`);
        } catch (err) {
          saveDeckBtn.disabled = false;
          saveDeckBtn.innerHTML = '<span>Kaydet</span>';
          toast('Kayıt başarısız: ' + err.message);
        }
      });
      deckPreview.appendChild(saveDeckBtn);
      card.appendChild(deckPreview);
    }

    container.appendChild(card);
  }

  // =========================================================================
  // MESAJ GÖNDERİMİ & TOKEN KORUMASI
  // =========================================================================
  async function sendCoachMessage(userMsg, action = null) {
    if (chatState.busy) return;
    const inputEl = $('coach-chat-input');
    const msg = (userMsg || (inputEl ? inputEl.value : '')).trim();
    if (!msg && !action && !chatState.file && !chatState.contextText) return;

    chatState.busy = true;
    const sendBtn = $('btn-coach-chat-send');
    if (sendBtn) sendBtn.disabled = true;
    if (inputEl) {
      inputEl.value = '';
      inputEl.style.height = '';
    }

    const stream = $('coach-chat-stream');

    if (msg) {
      appendChatMessage('user', msg);
      chatState.history.push({ role: 'user', text: msg });
    }

    // Katı Konu ve Token Koruması (Yalnızca Almanca Öğrenimi)
    const OFF_TOPIC_RE = /(python|javascript|typescript|php|html|css|kod yaz|programlama|hava durumu|dolar kaç|borsa|bitcoin|kripto|felsefe|siyaset|seçim|magazin|yemek tarifi|burç|astroloji|matematik|fizik|kuantum|bana bir hikaye|fıkra anlat)/i;
    if (msg && !action && !chatState.file && !chatState.contextText && OFF_TOPIC_RE.test(msg)) {
      setTimeout(() => {
        appendChatMessage('model', 'Maalesef bu konuda yardımcı olamam. Ben yalnızca Almanca öğreniminizde size rehberlik etmek üzere tasarlanmış bir dil koçuyum. Lütfen Almanca dilbilgisi, kelimeler veya metinlerinizle ilgili bir soru sorunuz.');
        chatState.busy = false;
        if (sendBtn) sendBtn.disabled = false;
      }, 250);
      return;
    }

    const typingEl = document.createElement('div');
    typingEl.className = 'coach-chat-bubble coach-bubble-model coach-typing-indicator';
    typingEl.textContent = 'Koç düşünüyor...';
    stream?.appendChild(typingEl);
    if (stream) stream.scrollTop = stream.scrollHeight;

    const payload = {
      message: msg || (action === 'cloze' ? 'Boşluk doldurma alıştırması hazırla' : action),
      userLevel: 'B1',
      action: action || '',
      history: chatState.history.slice(-6),
    };
    if (chatState.contextText) payload.contextText = chatState.contextText;
    if (chatState.file) payload.file = chatState.file;

    try {
      const res = await window.coachRequest('chat', payload);
      typingEl.remove();

      const modelMsgEl = appendChatMessage('model', res.reply || '');
      chatState.history.push({ role: 'model', text: res.reply || '' });

      if (res.exercise && res.exercise.type !== 'NONE') {
        renderInteractiveExercise(res.exercise, modelMsgEl);
      }

      if (Array.isArray(res.suggestedPrompts) && res.suggestedPrompts.length > 0) {
        const promptsRow = document.createElement('div');
        promptsRow.className = 'coach-chat-suggested-row';
        res.suggestedPrompts.forEach((pText) => {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'coach-chat-prompt-pill';
          pill.textContent = stripEmoji(pText);
          pill.addEventListener('click', () => sendCoachMessage(pText));
          promptsRow.appendChild(pill);
        });
        modelMsgEl.appendChild(promptsRow);
      }

      if (stream) stream.scrollTop = stream.scrollHeight;
    } catch (err) {
      typingEl.textContent = `Bağlantı hatası: ${err.message || 'Yanıt alınamadı.'}`;
      typingEl.classList.add('error');
    } finally {
      chatState.busy = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  // =========================================================================
  // BAŞLATMA & OLAY DİNLEYİCİLERİ
  // =========================================================================
  function init() {
    // 1. Dosya Ataş Butonu
    $('btn-coach-attach-file')?.addEventListener('click', () => {
      $('coach-chat-file-input')?.click();
    });
    $('coach-chat-file-input')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleChatContextFile(e.target.files[0]);
        e.target.value = '';
      }
    });

    // 2. Ekli Dosya Kaldırma
    $('btn-coach-chat-file-remove')?.addEventListener('click', () => {
      chatState.file = null;
      chatState.contextText = '';
      $('coach-chat-file-chip')?.classList.add('hidden');
      toast('Çalışma dosyası kaldırıldı.');
    });

    // 3. Yazdıkça Genişleyen Chatbox (Auto-expanding textarea)
    const chatInput = $('coach-chat-input');
    if (chatInput) {
      chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(160, chatInput.scrollHeight) + 'px';
      });
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendCoachMessage();
        }
      });
    }

    // 4. Kağıt Uçak Gönder Butonu
    $('btn-coach-chat-send')?.addEventListener('click', () => {
      sendCoachMessage();
    });

    // 5. İlk Karşılama Mesajı (Eğer akış boşsa)
    const stream = $('coach-chat-stream');
    if (stream && stream.children.length === 0) {
      appendChatMessage('model', 'Merhaba! Ben sizin Almanca Dil Koçunuzum. Dilbilgisi kurallarını sorabilir, cümlelerinizi düzelttirebilir veya ataş butonuna tıklayarak bir belge/görsel yükleyip üzerinde analiz başlatabilirsiniz.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
