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
  const TYPE_NAMES = {
    CLOZE: 'Boşluk Doldurma',
    MATCHING: 'Eşleştirme Oyunu',
    GRAMMAR: 'Dilbilgisi Çalışması',
    DECK: 'Deste Önerisi',
  };

  function renderInteractiveExercise(exercise, container) {
    if (!exercise || exercise.type === 'NONE') return;

    const card = document.createElement('div');
    card.className = 'coach-exercise-card';
    card.style.cursor = 'pointer';
    card.style.background = 'var(--bg-elevated)';
    card.style.border = '1px solid var(--border-medium)';
    card.style.borderRadius = '16px';
    card.style.padding = '14px 16px';
    card.style.marginTop = '8px';

    const head = document.createElement('div');
    head.className = 'coach-exercise-head';
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.gap = '8px';
    head.style.marginBottom = '6px';

    const typeBadge = document.createElement('span');
    typeBadge.className = 'coach-exercise-badge';
    typeBadge.style.background = 'var(--accent-primary-soft)';
    typeBadge.style.color = 'var(--brand-blue-hover)';
    typeBadge.style.fontSize = '0.74rem';
    typeBadge.style.fontWeight = '800';
    typeBadge.style.padding = '3px 8px';
    typeBadge.style.borderRadius = '6px';
    typeBadge.textContent = TYPE_NAMES[exercise.type] || 'Alıştırma';

    const titleText = document.createElement('span');
    titleText.className = 'coach-exercise-title';
    titleText.style.fontWeight = '800';
    titleText.style.fontSize = '0.94rem';
    titleText.textContent = exercise.title || exercise.instruction || 'Pratik Çalışması';
    head.append(typeBadge, titleText);
    card.appendChild(head);

    if (exercise.sentence) {
      const sentSnippet = document.createElement('div');
      sentSnippet.style.fontSize = '0.9rem';
      sentSnippet.style.color = 'var(--text-secondary)';
      sentSnippet.style.margin = '4px 0 8px';
      sentSnippet.innerHTML = exercise.sentence.replace('___', '<strong style="color:var(--brand-blue); text-decoration:underline;">______</strong>');
      card.appendChild(sentSnippet);
    }

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'btn-coach-build-full';
    startBtn.style.padding = '9px 14px';
    startBtn.style.fontSize = '0.86rem';
    startBtn.style.marginTop = '6px';
    startBtn.innerHTML = '<svg class="svg-icon" style="width:15px;height:15px;"><use href="#icon-bolt"></use></svg><span>Alıştırmayı Başlat / Testi Çöz</span>';
    
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openExercisePlayerModal(exercise);
    });
    card.addEventListener('click', () => openExercisePlayerModal(exercise));

    card.appendChild(startBtn);
    container.appendChild(card);
  }

  // TAM EKRAN OYUN & TEST POPUP'I
  function openExercisePlayerModal(rawExercise) {
    const modal = $('modal-coach-exercise-player');
    const badgeEl = $('cep-badge');
    const titleEl = $('cep-title');
    const bodyEl = $('cep-body');
    if (!modal || !bodyEl || !rawExercise) return;

    // Normalizasyon & Format Güvencesi (Yapay zeka format sapmalarını tolere et)
    const rawType = String(rawExercise.type || '').toUpperCase();
    let type = rawType;
    if (['CLOZE', 'GAP_FILL', 'FILL_IN_THE_BLANK', 'FILL_BLANK'].includes(rawType)) type = 'CLOZE';
    else if (['GRAMMAR', 'QUIZ', 'TEST', 'MULTIPLE_CHOICE'].includes(rawType)) type = 'GRAMMAR';
    else if (['MATCHING', 'MATCH', 'PAIRS'].includes(rawType)) type = 'MATCHING';
    else if (['DECK', 'CARDS', 'VOCAB'].includes(rawType)) type = 'DECK';
    else type = 'GRAMMAR';

    const options = Array.isArray(rawExercise.options) ? rawExercise.options : (Array.isArray(rawExercise.choices) ? rawExercise.choices : (Array.isArray(rawExercise.answers) ? rawExercise.answers : []));
    const sentence = rawExercise.sentence || rawExercise.question || rawExercise.text || '';
    const pairs = Array.isArray(rawExercise.pairs) ? rawExercise.pairs : (Array.isArray(rawExercise.matchingPairs) ? rawExercise.matchingPairs : []);
    const words = Array.isArray(rawExercise.words) ? rawExercise.words : (Array.isArray(rawExercise.cards) ? rawExercise.cards : []);
    const correctIndex = typeof rawExercise.correctIndex === 'number' ? rawExercise.correctIndex : (typeof rawExercise.answerIndex === 'number' ? rawExercise.answerIndex : 0);

    const exercise = {
      ...rawExercise,
      type,
      options,
      sentence,
      pairs,
      words,
      correctIndex,
      title: rawExercise.title || rawExercise.instruction || (type === 'CLOZE' ? 'Boşluk Doldurma Alıştırması' : 'Dilbilgisi Çalışması')
    };

    // Boş popup koruması: Soru, şık veya eşleştirme yoksa boş pencere açılmasını engelle
    const hasClozeContent = (type === 'CLOZE' || type === 'GRAMMAR') && (options.length > 0 || sentence);
    const hasMatchingContent = type === 'MATCHING' && pairs.length > 0;
    const hasDeckContent = type === 'DECK' && words.length > 0;

    if (!hasClozeContent && !hasMatchingContent && !hasDeckContent) {
      toast('Alıştırma içeriği eksik oluşturuldu. Lütfen koçtan yeni bir alıştırma isteyiniz.');
      return;
    }

    if (badgeEl) badgeEl.textContent = TYPE_NAMES[exercise.type] || 'Alıştırma';
    if (titleEl) titleEl.textContent = exercise.title;
    bodyEl.innerHTML = '';

    // 1. CLOZE veya GRAMMAR TESTİ
    if ((exercise.type === 'CLOZE' || exercise.type === 'GRAMMAR') && Array.isArray(exercise.options)) {
      if (exercise.sentence) {
        const sentEl = document.createElement('div');
        sentEl.style.padding = '18px';
        sentEl.style.background = 'var(--bg-elevated)';
        sentEl.style.border = '1px solid var(--border-medium)';
        sentEl.style.borderRadius = '14px';
        sentEl.style.fontSize = '1.08rem';
        sentEl.style.fontWeight = '700';
        sentEl.style.lineHeight = '1.55';
        sentEl.style.color = 'var(--text-primary)';
        sentEl.innerHTML = exercise.sentence.replace('___', '<span style="display:inline-block; min-width:80px; padding:2px 8px; border-bottom:3px solid var(--brand-blue); color:var(--brand-blue); text-align:center;">______</span>');
        bodyEl.appendChild(sentEl);
      }

      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
      grid.style.gap = '10px';

      let answered = false;
      const startTime = Date.now();

      exercise.options.forEach((optText, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'coach-quiz-option-btn';
        btn.style.padding = '14px 16px';
        btn.style.fontSize = '0.96rem';
        const letter = LETTERS[idx] ? `${LETTERS[idx]}-)` : `${idx + 1}-)`;
        btn.innerHTML = `<span class="coach-opt-letter" style="font-weight:900;">${letter}</span><span class="coach-opt-label" style="font-weight:700;">${optText}</span>`;

        btn.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const isCorrect = idx === exercise.correctIndex;
          const respTime = Date.now() - startTime;
          const chosenOpt = optText;
          const correctOpt = exercise.options[exercise.correctIndex] || '';

          const allBtns = grid.querySelectorAll('.coach-quiz-option-btn');
          allBtns.forEach((b, bIdx) => {
            b.disabled = true;
            if (bIdx === exercise.correctIndex) {
              b.classList.add('correct');
              b.style.background = 'rgba(16, 185, 129, 0.2)';
              b.style.borderColor = '#10B981';
            } else if (bIdx === idx && !isCorrect) {
              b.classList.add('wrong');
              b.style.background = 'rgba(239, 68, 68, 0.2)';
              b.style.borderColor = '#EF4444';
            }
          });

          // Supabase Aktivite & ELO Kaydı
          if (window.wmSocial && window.wmSocial.recordActivity) {
            window.wmSocial.recordActivity({
              type: 'cloze',
              isCorrect,
              responseTimeMs: respTime,
              comboCount: 0,
              isHardWord: false
            });
          }

          // Açıklama & Sonuç Kutusu
          const resultBox = document.createElement('div');
          resultBox.className = `coach-explanation-box ${isCorrect ? 'correct' : 'wrong'}`;
          resultBox.style.padding = '14px';
          resultBox.style.borderRadius = '12px';
          resultBox.style.marginTop = '12px';
          resultBox.innerHTML = `
            <div style="font-weight:900; font-size:1rem; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              <span>${isCorrect ? 'Tebrikler! Doğru Cevap (+12 ELO)' : 'Yanlış Cevap (-10 ELO)'}</span>
            </div>
            <div style="font-size:0.88rem; line-height:1.5;">${exercise.explanation || (isCorrect ? 'Dilbilgisi kuralını doğru uyguladınız.' : `Doğru seçenek: ${correctOpt}`)}</div>
          `;
          bodyEl.appendChild(resultBox);

          // Koç'a Bildir ve Açıklama İste Butonu
          const notifyCoachBtn = document.createElement('button');
          notifyCoachBtn.type = 'button';
          notifyCoachBtn.className = 'btn-coach-build-full';
          notifyCoachBtn.style.marginTop = '14px';
          notifyCoachBtn.innerHTML = '<svg class="svg-icon" style="width:16px;height:16px;"><use href="#icon-send"></use></svg><span>Sonucu Koç\'a Gönder &amp; Değerlendirme Al</span>';

          notifyCoachBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            let feedbackMsg = '';
            if (isCorrect) {
              feedbackMsg = `Hazırladığın alıştırmayı çözdüm! Soru: "${exercise.sentence || exercise.title}" Cevabım: "${chosenOpt}" idi ve DOĞRU bildim. Bu konu hakkında kısa bir değerlendirme veya pekiştirici kural paylaşır mısın?`;
            } else {
              feedbackMsg = `Hazırladığın alıştırmayı çözdüm. Soru: "${exercise.sentence || exercise.title}" Ben "${chosenOpt}" seçeneğini işaretledim ancak YANLIŞ çıktı (doğru cevap "${correctOpt}" imiş). Neden bu cevabın yanlış olduğunu ve kuralını bana açıklar mısın?`;
            }
            sendCoachMessage(feedbackMsg, 'EXERCISE_FEEDBACK');
          });

          bodyEl.appendChild(notifyCoachBtn);
        });

        grid.appendChild(btn);
      });

      bodyEl.appendChild(grid);
    }

    // 2. EŞLEŞTİRME OYUNU
    if (exercise.type === 'MATCHING' && Array.isArray(exercise.pairs) && exercise.pairs.length > 0) {
      const matchWrap = document.createElement('div');
      matchWrap.className = 'coach-matching-arena';
      matchWrap.style.display = 'grid';
      matchWrap.style.gridTemplateColumns = '1fr 1fr';
      matchWrap.style.gap = '14px';

      let selectedDeBtn = null;
      let matchedCount = 0;
      const totalPairs = exercise.pairs.length;

      const deCol = document.createElement('div');
      deCol.className = 'coach-matching-col';
      deCol.style.display = 'flex';
      deCol.style.flexDirection = 'column';
      deCol.style.gap = '8px';

      const trCol = document.createElement('div');
      trCol.className = 'coach-matching-col';
      trCol.style.display = 'flex';
      trCol.style.flexDirection = 'column';
      trCol.style.gap = '8px';

      const deList = exercise.pairs.map((p, i) => ({ text: p.de, id: i }));
      const trList = exercise.pairs.map((p, i) => ({ text: p.tr, id: i })).sort(() => Math.random() - 0.5);

      deList.forEach((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'coach-match-btn';
        b.style.padding = '12px 14px';
        b.style.borderRadius = '10px';
        b.style.fontWeight = '700';
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
        b.style.padding = '12px 14px';
        b.style.borderRadius = '10px';
        b.style.fontWeight = '700';
        b.textContent = item.text;
        b.dataset.pairId = String(item.id);
        b.addEventListener('click', () => {
          if (b.classList.contains('matched') || !selectedDeBtn) return;
          if (selectedDeBtn.dataset.pairId === b.dataset.pairId) {
            selectedDeBtn.classList.remove('selected');
            selectedDeBtn.classList.add('matched');
            selectedDeBtn.style.background = 'rgba(16,185,129,0.2)';
            selectedDeBtn.style.borderColor = '#10B981';
            b.classList.add('matched');
            b.style.background = 'rgba(16,185,129,0.2)';
            b.style.borderColor = '#10B981';
            selectedDeBtn = null;
            matchedCount++;

            if (matchedCount === totalPairs) {
              const winBox = document.createElement('div');
              winBox.className = 'coach-explanation-box correct';
              winBox.style.padding = '14px';
              winBox.style.borderRadius = '12px';
              winBox.style.marginTop = '14px';
              winBox.innerHTML = '<strong>Tebrikler!</strong> Tüm kelimeleri başarıyla eşleştirdiniz.';
              bodyEl.appendChild(winBox);

              if (window.wmSocial && window.wmSocial.recordActivity) {
                window.wmSocial.recordActivity({ type: 'cloze', isCorrect: true, responseTimeMs: 4000 });
              }

              const doneBtn = document.createElement('button');
              doneBtn.type = 'button';
              doneBtn.className = 'btn-coach-build-full';
              doneBtn.style.marginTop = '12px';
              doneBtn.innerHTML = '<span>Koç\'a Bildir &amp; Devam Et</span>';
              doneBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
                sendCoachMessage(`Hazırladığın eşleştirme oyunundaki tüm kelimeleri (${totalPairs} çift) eksiksiz eşleştirdim! Bir sonraki konuya geçelim mi?`, 'EXERCISE_FEEDBACK');
              });
              bodyEl.appendChild(doneBtn);
            }
          } else {
            b.classList.add('wrong');
            b.style.borderColor = '#EF4444';
            setTimeout(() => {
              b.classList.remove('wrong');
              b.style.borderColor = '';
            }, 600);
          }
        });
        trCol.appendChild(b);
      });

      matchWrap.append(deCol, trCol);
      bodyEl.appendChild(matchWrap);
    }

    // 3. DECK ÖNERİSİ
    if (exercise.type === 'DECK' && Array.isArray(exercise.words) && exercise.words.length > 0) {
      const listWrap = document.createElement('div');
      listWrap.style.display = 'flex';
      listWrap.style.flexDirection = 'column';
      listWrap.style.gap = '8px';
      listWrap.style.maxHeight = '320px';
      listWrap.style.overflowY = 'auto';

      exercise.words.forEach(w => {
        const row = document.createElement('div');
        row.style.padding = '8px 12px';
        row.style.background = 'var(--bg-elevated)';
        row.style.borderRadius = '8px';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.innerHTML = `<span style="font-weight:800;">${w.lemma}</span><span style="color:var(--text-secondary); font-size:0.85rem;">${w.contextMeaning}</span>`;
        listWrap.appendChild(row);
      });

      bodyEl.appendChild(listWrap);

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn-coach-build-full';
      saveBtn.style.marginTop = '12px';
      saveBtn.innerHTML = '<span>Desteyi Kütüphaneme Kaydet</span>';
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>Kaydediliyor...</span>';
        try {
          const deck = await window.wmDB.createDeck(exercise.title || 'Koç Destesi', 'Koç tarafından üretildi', 'default');
          const targetDeckId = deck && deck.id ? deck.id : Date.now();
          for (const w of exercise.words) {
            await window.wmDB.addCard({
              deckId: targetDeckId,
              germanWord: w.lemma,
              meaningsTr: w.contextMeaning || '',
              partOfSpeech: w.pos || 'NOUN',
              exampleSentence: w.sourceSentence || ''
            });
          }
          saveBtn.innerHTML = '<span>Desteye Kaydedildi</span>';
          toast(`"${exercise.title || 'Koç Destesi'}" destelerinize eklendi.`);
          setTimeout(() => modal.classList.add('hidden'), 1000);
        } catch (e) {
          saveBtn.disabled = false;
          toast('Kayıt hatası: ' + e.message);
        }
      });
      bodyEl.appendChild(saveBtn);
    }

    modal.classList.remove('hidden');
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
      // Mobil klavye açılınca bottom nav'ı sakla
      chatInput.addEventListener('focus', () => {
        document.body.classList.add('coach-chat-focused');
      });
      chatInput.addEventListener('blur', () => {
        document.body.classList.remove('coach-chat-focused');
      });

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

    // 4.1 Oyun & Alıştırma Modalı Kapatma
    $('btn-close-coach-exercise')?.addEventListener('click', () => {
      $('modal-coach-exercise-player')?.classList.add('hidden');
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
