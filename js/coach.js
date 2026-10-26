/**
 * WortCoach - Coach & AI Deste Oluşturma & İnteraktif Akademik Çalışma
 * - AI Deste Oluşturma (sözlük uyumlu lemma çıkarımı ve deste kaydetme)
 * - İnteraktif Almanca Koçu & Akademik Çalışma (Chat, Cloze testleri, Eşleştirme oyunları, Dilbilgisi alıştırmaları)
 * - Akıllı Okuyucu Görsel OCR desteği
 * Sıfır emoji, analitik, pedagojik ve kurumsal tasarım.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const EMOJI_RE = /[\p{Extended_Pictographic}\u200d\ufe0f]/gu;
  const stripEmoji = (s) => String(s || '').replace(EMOJI_RE, '').trim();

  const MAX_PDF_BYTES = 4 * 1024 * 1024;
  const MAX_IMG_SIDE = 1600;

  const POS_LABEL = { NOUN: 'Nomen', VERB: 'Verb', ADJ: 'Adjektiv', ADV: 'Adverb', PHRASE: 'Wendung' };
  const POS_CARD = { NOUN: 'NOUN', VERB: 'VERB', ADJ: 'ADJECTIVE', ADV: 'ADVERB', PHRASE: 'OTHER' };
  const LETTERS = ['A', 'B', 'C', 'D'];

  // Global helper for image processing (also used by Akıllı Okuyucu)
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

  const deckState = { file: null, fileName: '', busy: false, words: [], deckTitle: '' };
  const chatState = { file: null, fileName: '', history: [], busy: false };

  function toast(msg) {
    if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(msg);
  }

  function setDeckStatus(msg, isError) {
    const el = $('coach-status');
    if (!el) return;
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.toggle('error', !!isError);
  }

  // =========================================================================
  // BÖLÜM 1: AI DESTE OLUŞTURMA (DECK BUILDER)
  // =========================================================================
  async function handleDeckFile(file) {
    if (!file) return;
    const name = file.name || 'dosya';
    const lower = name.toLowerCase();
    setDeckStatus('Dosya hazırlanıyor...');
    try {
      if (file.type.startsWith('image/')) {
        deckState.file = { mime: 'image/jpeg', data: await window.coachHelper.downscaleImage(file) };
      } else if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        if (file.size > MAX_PDF_BYTES) throw new Error('PDF en fazla 4 MB olabilir.');
        deckState.file = { mime: 'application/pdf', data: await window.coachHelper.readAsBase64(file) };
      } else if (lower.endsWith('.docx')) {
        if (!window.mammoth) throw new Error('DOCX okuyucu yüklenemedi.');
        const res = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        $('coach-text-input').value = (res.value || '').slice(0, 35000);
        deckState.file = null;
      } else if (lower.endsWith('.txt')) {
        $('coach-text-input').value = (await file.text()).slice(0, 35000);
        deckState.file = null;
      } else {
        throw new Error('Desteklenen türler: görsel, PDF, DOCX, TXT.');
      }
      deckState.fileName = name;
      if (deckState.file) {
        $('coach-file-name').textContent = name;
        $('coach-file-chip').classList.remove('hidden');
      } else {
        $('coach-file-chip').classList.add('hidden');
      }
      setDeckStatus('');
    } catch (e) {
      deckState.file = null;
      $('coach-file-chip').classList.add('hidden');
      setDeckStatus(e.message || 'Dosya işlenemedi.', true);
    }
  }

  function getDeckPayload() {
    const text = $('coach-text-input').value.trim();
    const payload = {};
    if (text) payload.text = text;
    if (deckState.file) payload.file = deckState.file;
    return payload;
  }

  async function analyzeForDeck() {
    const payload = getDeckPayload();
    if (!payload.text && !payload.file) {
      setDeckStatus('Lütfen önce bir metin yapıştırın veya dosya seçin.', true);
      return;
    }
    deckState.busy = true;
    $('btn-coach-analyze').disabled = true;
    setDeckStatus('İçerik inceleniyor...');
    $('coach-result')?.classList.add('hidden');
    try {
      const r = await window.coachRequest('analyze', payload);
      $('coach-type').textContent = stripEmoji(r.contentType);
      $('coach-level').textContent = r.estimatedLevel ? `Seviye: ${stripEmoji(r.estimatedLevel)}` : '';
      $('coach-summary').textContent = stripEmoji(r.summary);
      const box = $('coach-suggestions');
      box.innerHTML = '';
      (r.suggestions || []).forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'coach-suggestion';
        b.textContent = stripEmoji(s);
        b.addEventListener('click', () => {
          $('coach-instruction').value = stripEmoji(s);
        });
        box.appendChild(b);
      });
      $('coach-analysis').classList.remove('hidden');
      setDeckStatus('');
    } catch (e) {
      setDeckStatus(e.message || 'İnceleme yapılamadı.', true);
    } finally {
      deckState.busy = false;
      $('btn-coach-analyze').disabled = false;
    }
  }

  async function buildDeck() {
    const payload = getDeckPayload();
    payload.instruction = $('coach-instruction').value.trim() || 'Öğrenmeye değer kelimeleri seç.';
    const buildBtn = $('btn-coach-build');

    deckState.busy = true;
    buildBtn.disabled = true;
    buildBtn.innerHTML = '<span>Koç düşünüyor...</span>';
    setDeckStatus('Koç düşünüyor...');

    try {
      const r = await window.coachRequest('deck', payload);
      deckState.words = (r.words || []).map((w) => ({ ...w, selected: true }));
      deckState.deckTitle = stripEmoji(r.deckTitle) || 'Coach Destesi';
      $('coach-deck-name').value = deckState.deckTitle;
      renderDeckWords();
      $('coach-result').classList.remove('hidden');
      $('coach-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setDeckStatus('');
    } catch (e) {
      setDeckStatus(e.message || 'Kelime çıkarılamadı.', true);
    } finally {
      deckState.busy = false;
      buildBtn.disabled = false;
      buildBtn.innerHTML = '<span>Deste Oluştur</span>';
    }
  }

  function renderDeckWords() {
    const list = $('coach-word-list');
    list.innerHTML = '';
    deckState.words.forEach((w, i) => {
      const row = document.createElement('label');
      row.className = 'coach-word-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = w.selected;
      cb.addEventListener('change', () => {
        w.selected = cb.checked;
        updateDeckCount();
      });
      const main = document.createElement('div');
      main.className = 'coach-word-main';
      const lemma = document.createElement('span');
      lemma.className = 'coach-word-lemma';
      lemma.textContent = w.lemma;
      const meta = document.createElement('span');
      meta.className = 'coach-word-meta';
      meta.textContent = [POS_LABEL[w.pos] || '', w.cefr || ''].filter(Boolean).join(' / ');
      const mean = document.createElement('span');
      mean.className = 'coach-word-meaning';
      mean.textContent = stripEmoji(w.contextMeaning);
      main.append(lemma, meta, mean);
      row.append(cb, main);
      row.dataset.index = String(i);
      list.appendChild(row);
    });
    updateDeckCount();
  }

  function updateDeckCount() {
    const n = deckState.words.filter((w) => w.selected).length;
    $('coach-count').textContent = `${n} / ${deckState.words.length} kelime seçili`;
    const all = $('btn-coach-toggle-all');
    all.textContent = n === deckState.words.length ? 'Tümünü Kaldır' : 'Tümünü Seç';
    $('btn-coach-save').disabled = deckState.busy || n === 0;
  }

  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

  function uniqueMeanings(list) {
    const seen = new Set();
    const out = [];
    list.forEach((m) => {
      const v = String(m || '').trim();
      const k = v.toLowerCase();
      if (v && !seen.has(k)) {
        seen.add(k);
        out.push(v);
      }
    });
    return out;
  }

  async function lookupEntry(lemma) {
    try {
      if (!window.executeSmartSearchPipeline) return null;
      const res = await withTimeout(window.executeSmartSearchPipeline(lemma, new AbortController().signal), 7000);
      if (!res || !res.entry || (res.status !== 'exact' && res.status !== 'stem')) return null;
      let entry = res.entry;
      if (String(entry.germanWord || '').toLowerCase() !== lemma.toLowerCase()) return null;
      if (!entry.exampleSentence && window.DictionaryService && window.DictionaryService.enrichWithNetwork) {
        const enriched = await withTimeout(
          window.DictionaryService.enrichWithNetwork(entry, new AbortController().signal),
          5000
        );
        if (enriched) entry = enriched;
      }
      return entry;
    } catch (_) {
      return null;
    }
  }

  async function buildCardPayload(w, deckId) {
    const entry = await lookupEntry(w.lemma);
    const meanings = uniqueMeanings([
      w.contextMeaning,
      ...(entry && entry.meaningsTr ? String(entry.meaningsTr).split(',') : []),
    ]).slice(0, 4);
    const isNoun = w.pos === 'NOUN';
    return {
      deckId: Number(deckId),
      germanWord: w.lemma,
      partOfSpeech: (entry && entry.partOfSpeech) || POS_CARD[w.pos] || 'OTHER',
      article: isNoun && entry ? entry.article || '' : '',
      pluralForm: isNoun && entry ? entry.pluralForm || '' : '',
      meaningsTr: meanings.join(', '),
      meaningsEn: entry ? entry.meaningsEn || '' : '',
      exampleSentence: w.sourceSentence || (entry && entry.exampleSentence) || '',
      praesens: entry ? entry.praesens || '' : '',
      praeteritum: entry ? entry.praeteritum || '' : '',
      partizipZwei: entry ? entry.partizipZwei || '' : '',
      hilfsverb: entry ? entry.hilfsverb || 'hat' : 'hat',
      imperativ: entry ? entry.imperativ || '' : '',
      isSeparable: entry ? Boolean(entry.isSeparable) : false,
      isReflexive: entry ? Boolean(entry.isReflexive) : /^sich\s/i.test(w.lemma),
      cefr: w.cefr || (entry && entry.cefr) || '',
    };
  }

  async function saveDeck() {
    const selected = deckState.words.filter((w) => w.selected);
    if (!selected.length) return;
    const name = ($('coach-deck-name').value || '').trim() || deckState.deckTitle || 'Coach Destesi';
    const saveBtn = $('btn-coach-save');
    deckState.busy = true;
    saveBtn.disabled = true;
    try {
      const deck = await window.wmDB.createDeck(name);
      let done = 0;
      let added = 0;
      const queue = selected.slice();
      const worker = async () => {
        while (queue.length) {
          const w = queue.shift();
          try {
            const payload = await buildCardPayload(w, deck.id);
            await window.wmDB.addCard(payload);
            added++;
          } catch (_) {}
          done++;
          saveBtn.textContent = `Kaydediliyor ${done} / ${selected.length}`;
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      const app = window.wmApp;
      if (app) {
        try {
          if (window.WordGameService) await window.WordGameService.initPool();
        } catch (_) {}
        try {
          await app.renderDecksTab();
          await app.renderCardsList();
          await app.refreshHomeDashboard();
        } catch (_) {}
      }
      toast(`"${name}" destesi kaydedildi (${added} kart).`);
      $('coach-result').classList.add('hidden');
    } catch (e) {
      setDeckStatus(e.message || 'Deste kaydedilemedi.', true);
    } finally {
      saveBtn.textContent = 'Desteyi Kaydet';
      deckState.busy = false;
      updateDeckCount();
    }
  }

  // =========================================================================
  // BÖLÜM 2: İNTERAKTİF KOÇ & AKADEMİK ÇALIŞMA & OYUNLAR (COACH CHAT)
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
      $('coach-chat-file-name').textContent = name;
      $('coach-chat-file-chip').classList.remove('hidden');
      toast(`"${name}" çalışma bağlamı olarak eklendi.`);
    } catch (e) {
      chatState.file = null;
      $('coach-chat-file-chip').classList.add('hidden');
      toast(e.message || 'Dosya eklenemedi.');
    }
  }

  function appendChatMessage(role, text) {
    const stream = $('coach-chat-stream');
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

  function renderInteractiveExercise(exercise, container) {
    if (!exercise || exercise.type === 'NONE') return;

    const card = document.createElement('div');
    card.className = 'coach-exercise-card';

    // Başlık & Tür Rozeti
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

    // 1. CLOZE veya GRAMMAR (Çoktan seçmeli interaktif alıştırma)
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
              responseTimeMs: 2800,
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

    // 2. MATCHING (İnteraktif Eşleştirme Oyunu)
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

      // Almanca ve Türkçe butonları karıştır
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
              const doneEl = document.createElement('div');
              doneEl.className = 'coach-explanation-box correct';
              doneEl.textContent = `Tüm eşleştirmeler doğru tamamlandı (${totalPairs}/${totalPairs}).`;
              card.appendChild(doneEl);
            }
          } else {
            b.classList.add('wrong');
            setTimeout(() => {
              b.classList.remove('wrong');
              if (selectedDeBtn) selectedDeBtn.classList.remove('selected');
              selectedDeBtn = null;
            }, 600);
          }
        });
        trCol.appendChild(b);
      });

      matchWrap.append(deCol, trCol);
      card.appendChild(matchWrap);
    }

    // 3. DECK (Doğrudan Deste Olarak Kaydetme Kartı)
    if (exercise.type === 'DECK' && Array.isArray(exercise.words) && exercise.words.length > 0) {
      const deckPreview = document.createElement('div');
      deckPreview.className = 'coach-deck-widget';

      const listEl = document.createElement('div');
      listEl.className = 'coach-word-list';
      listEl.style.maxHeight = '240px';

      exercise.words.forEach((w) => {
        const row = document.createElement('div');
        row.className = 'coach-word-row';
        row.style.cursor = 'default';
        row.innerHTML = `
          <div class="coach-word-main">
            <span class="coach-word-lemma">${w.lemma}</span>
            <span class="coach-word-meta">${POS_LABEL[w.pos] || ''} ${w.cefr ? '/ ' + w.cefr : ''}</span>
            <span class="coach-word-meaning">${stripEmoji(w.contextMeaning)}</span>
          </div>
        `;
        listEl.appendChild(row);
      });
      deckPreview.appendChild(listEl);

      const saveDeckBtn = document.createElement('button');
      saveDeckBtn.type = 'button';
      saveDeckBtn.className = 'btn-primary-compact coach-save-btn';
      saveDeckBtn.style.marginTop = '10px';
      saveDeckBtn.textContent = `Bu Kelimeleri Desteye Kaydet (${exercise.words.length} Kart)`;

      saveDeckBtn.addEventListener('click', async () => {
        saveDeckBtn.disabled = true;
        saveDeckBtn.textContent = 'Kaydediliyor...';
        try {
          const deckName = exercise.title || 'Koç Çalışma Destesi';
          const newDeck = await window.wmDB.createDeck(deckName);
          for (const w of exercise.words) {
            const payload = await buildCardPayload(w, newDeck.id);
            await window.wmDB.addCard(payload);
          }
          if (window.wmApp) {
            try {
              if (window.WordGameService) await window.WordGameService.initPool();
            } catch (_) {}
            await window.wmApp.renderDecksTab();
            await window.wmApp.renderCardsList();
          }
          toast(`"${deckName}" destesi oluşturuldu.`);
          saveDeckBtn.textContent = 'Destede Kayıtlı';
        } catch (err) {
          toast(`Hata: ${err.message || 'Kaydedilemedi'}`);
          saveDeckBtn.disabled = false;
          saveDeckBtn.textContent = 'Tekrar Dene';
        }
      });
      deckPreview.appendChild(saveDeckBtn);
      card.appendChild(deckPreview);
    }

    container.appendChild(card);
  }

  async function sendCoachMessage(userMsg, action = null) {
    if (chatState.busy) return;
    const msg = (userMsg || $('coach-chat-input').value).trim();
    if (!msg && !action) return;

    chatState.busy = true;
    $('btn-coach-chat-send').disabled = true;
    $('coach-chat-input').value = '';

    const stream = $('coach-chat-stream');

    if (msg) {
      appendChatMessage('user', msg);
      chatState.history.push({ role: 'user', text: msg });
    }

    const typingEl = document.createElement('div');
    typingEl.className = 'coach-chat-bubble coach-bubble-model coach-typing-indicator';
    typingEl.textContent = 'Koç düşünüyor...';
    stream.appendChild(typingEl);
    stream.scrollTop = stream.scrollHeight;

    const payload = {
      message: msg || (action === 'cloze' ? 'Boşluk doldurma alıştırması hazırla' : action),
      userLevel: $('coach-user-level')?.value || 'B1',
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

      stream.scrollTop = stream.scrollHeight;
    } catch (err) {
      typingEl.textContent = `Bağlantı hatası: ${err.message || 'Yanıt alınamadı.'}`;
      typingEl.classList.add('error');
    } finally {
      chatState.busy = false;
      $('btn-coach-chat-send').disabled = false;
    }
  }

  // =========================================================================
  // GÖRÜNÜM GEÇİŞİ (3 SEKME: AI DESTE OLUŞTUR / COACH / AKILLI OKUYUCU)
  // =========================================================================
  function switchView(view) {
    document.querySelectorAll('.coach-switch-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.coachView === view)
    );
    $('deck-builder-pane')?.classList.toggle('hidden', view !== 'deck');
    $('coach-interactive-pane')?.classList.toggle('hidden', view !== 'coach');
    $('reader-setup-pane')?.classList.toggle('hidden', view !== 'reader');
  }

  function init() {
    // 1. Switcher butonları
    document.querySelectorAll('.coach-switch-btn').forEach((b) => {
      b.addEventListener('click', () => switchView(b.dataset.coachView));
    });

    // 2. Deste Oluşturucu dinleyicileri
    $('btn-coach-pick')?.addEventListener('click', () => $('coach-file-input').click());
    $('coach-file-input')?.addEventListener('change', (e) => {
      handleDeckFile(e.target.files[0]);
      e.target.value = '';
    });
    $('btn-coach-file-remove')?.addEventListener('click', () => {
      deckState.file = null;
      $('coach-file-chip').classList.add('hidden');
    });
    $('btn-coach-analyze')?.addEventListener('click', analyzeForDeck);
    $('btn-coach-build')?.addEventListener('click', buildDeck);
    $('btn-coach-save')?.addEventListener('click', saveDeck);
    $('btn-coach-toggle-all')?.addEventListener('click', () => {
      const allSelected = deckState.words.every((w) => w.selected);
      deckState.words.forEach((w) => {
        w.selected = !allSelected;
      });
      renderDeckWords();
    });
    $('coach-instruction')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        buildDeck();
      }
    });

    // 3. Koç Etkileşim & Akademik Çalışma dinleyicileri
    $('btn-coach-attach-file')?.addEventListener('click', () => $('coach-chat-file-input').click());
    $('coach-chat-file-input')?.addEventListener('change', (e) => {
      handleChatContextFile(e.target.files[0]);
      e.target.value = '';
    });
    $('btn-coach-chat-file-remove')?.addEventListener('click', () => {
      chatState.file = null;
      chatState.contextText = '';
      $('coach-chat-file-chip').classList.add('hidden');
      toast('Çalışma dosyası kaldırıldı.');
    });

    $('btn-coach-chat-send')?.addEventListener('click', () => sendCoachMessage());
    $('coach-chat-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendCoachMessage();
      }
    });

    // Hızlı alıştırma aksiyon butonları
    document.querySelectorAll('.coach-quick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const ACTION_PROMPTS = {
          cloze: 'Bana seviyeme uygun interaktif bir boşluk doldurma (Cloze) alıştırması hazırla.',
          matching: 'Bana seviyeme uygun Almanca-Türkçe kelime eşleştirme oyunu oluştur.',
          grammar: 'Bana seviyeme uygun bir dilbilgisi (fiil çekimi, artikel veya sıfat) testi hazırla.',
          academic: 'Çalışma metnini veya güncel konuyu akademik dilbilgisi ve cümle yapıları açısından incele.',
          deck: 'Bu konudan veya çalışma metninden kaydedilmeye hazır bir kelime destesi oluştur.',
        };
        sendCoachMessage(ACTION_PROMPTS[action] || action, action);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
