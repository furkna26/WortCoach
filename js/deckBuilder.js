/**
 * WortCoach - Koç ile Deste Oluşturma (AI Deste Motoru)
 * Metin, Görsel (OCR), PDF, DOCX -> Seviye Analizi -> Kullanıcı Talimatı -> Sözlük Zenginleştirmeli Deste
 * Sıfır emoji, kurumsal, pedagojik ve yüksek performanslı mimari.
 */

(function () {
  const $ = (id) => document.getElementById(id);
  const EMOJI_RE = /[\p{Extended_Pictographic}\u200d\ufe0f]/gu;
  const cleanStr = (s) => String(s || '').replace(EMOJI_RE, '').trim();

  const MAX_PDF_BYTES = 4.5 * 1024 * 1024;
  const MAX_IMG_SIDE = 1600;

  const POS_LABEL = { NOUN: 'İsim (Nomen)', VERB: 'Fiil (Verb)', ADJ: 'Sıfat (Adjektiv)', ADV: 'Zarf (Adverb)', PHRASE: 'Kalıp (Wendung)' };
  const POS_CARD = { NOUN: 'NOUN', VERB: 'VERB', ADJ: 'ADJECTIVE', ADV: 'ADVERB', PHRASE: 'OTHER' };

  const state = {
    file: null,
    fileName: '',
    busy: false,
    words: [],
    deckTitle: ''
  };

  function toast(msg) {
    if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(msg);
  }

  function setStatus(msg, isError = false) {
    const el = $('deck-builder-status');
    if (!el) return;
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.color = isError ? 'var(--palette-red)' : 'var(--brand-blue-hover)';
  }

  function setBusy(busy, btnText = null) {
    state.busy = busy;
    const btnPick = $('btn-deck-builder-pick');
    const btnAnalyze = $('btn-deck-builder-analyze');
    const btnBuild = $('btn-deck-builder-build');
    const btnSave = $('btn-deck-builder-save');

    if (btnPick) btnPick.disabled = busy;
    if (btnAnalyze) btnAnalyze.disabled = busy;
    if (btnBuild) {
      btnBuild.disabled = busy;
      if (btnText && busy) {
        btnBuild.innerHTML = `<span class="spinner-border spinner-border-sm" style="display:inline-block; width:14px; height:14px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 0.6s linear infinite; margin-right:8px;"></span><span>${btnText}</span>`;
      } else {
        btnBuild.innerHTML = '<span>Deste Oluştur</span>';
      }
    }
    if (btnSave) btnSave.disabled = busy;
  }

  // Dosya İşleme (Görsel küçültme, PDF, DOCX, TXT)
  function downscaleImage(file) {
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
        reject(new Error('Görsel okunamadı.'));
      };
      img.src = url;
    });
  }

  function readAsBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(new Error('Dosya okunamadı.'));
      fr.readAsDataURL(blob);
    });
  }

  async function handleFile(file) {
    if (!file) return;
    const name = file.name || 'dosya';
    const lower = name.toLowerCase();
    setStatus('Dosya yükleniyor ve inceleniyor...');

    try {
      if (file.type.startsWith('image/')) {
        state.file = { mime: 'image/jpeg', data: await downscaleImage(file) };
      } else if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        if (file.size > MAX_PDF_BYTES) throw new Error('PDF en fazla 4.5 MB olabilir.');
        state.file = { mime: 'application/pdf', data: await readAsBase64(file) };
      } else if (lower.endsWith('.docx')) {
        if (!window.mammoth) throw new Error('DOCX ayrıştırıcı hazır değil.');
        const res = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        $('deck-builder-text-input').value = (res.value || '').slice(0, 30000);
        state.file = null;
      } else if (lower.endsWith('.txt')) {
        $('deck-builder-text-input').value = (await file.text()).slice(0, 30000);
        state.file = null;
      } else {
        throw new Error('Desteklenen dosya türleri: Görsel (PNG/JPG), PDF, DOCX veya TXT.');
      }

      state.fileName = name;
      if (state.file) {
        $('deck-builder-file-name').textContent = name;
        $('deck-builder-file-chip').classList.remove('hidden');
      } else {
        $('deck-builder-file-chip').classList.add('hidden');
      }
      setStatus('');
    } catch (e) {
      state.file = null;
      $('deck-builder-file-chip').classList.add('hidden');
      setStatus(e.message || 'Dosya işlenemedi.', true);
    }
  }

  function currentPayload() {
    const text = ($('deck-builder-text-input')?.value || '').trim();
    const payload = {};
    if (text) payload.text = text;
    if (state.file) payload.file = state.file;
    return payload;
  }

  // Adım 1: İçerik Seviye ve Konu Analizi
  async function analyze() {
    const payload = currentPayload();
    if (!payload.text && !payload.file) {
      setStatus('Lütfen metin girin veya bir dosya yükleyin.', true);
      return;
    }

    setBusy(true);
    setStatus('İçerik analiz ediliyor...');

    try {
      const out = await window.coachRequest('analyze', payload);
      $('deck-builder-type').textContent = out.contentType || 'Belge';
      $('deck-builder-level').textContent = out.estimatedLevel || 'B1';
      $('deck-builder-summary').textContent = out.summary || 'İçerik incelendi.';

      const sugWrap = $('deck-builder-suggestions');
      sugWrap.innerHTML = '';
      (out.suggestions || []).forEach((sugText) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'coach-quick-btn';
        btn.textContent = sugText;
        btn.addEventListener('click', () => {
          $('deck-builder-instruction').value = sugText;
          buildDeck(sugText);
        });
        sugWrap.appendChild(btn);
      });

      $('deck-builder-analysis').classList.remove('hidden');
      setStatus('');
      $('deck-builder-analysis').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      setStatus(e.message || 'Analiz yapılamadı.', true);
    } finally {
      setBusy(false);
    }
  }

  // Adım 2: Kelime Listesi Çıkarma (Deste Oluşturma)
  async function buildDeck(forceInstruction = null) {
    const payload = currentPayload();
    if (!payload.text && !payload.file) {
      setStatus('Lütfen önce metin yapıştırın veya dosya yükleyin.', true);
      return;
    }

    const instruction = (forceInstruction !== null && typeof forceInstruction === 'string')
      ? forceInstruction
      : ($('deck-builder-instruction')?.value || '').trim();

    payload.instruction = instruction;

    setBusy(true, 'Koç düşünüyor...');
    setStatus('Koç içeriği inceliyor ve kelimeleri ayıklıyor...');

    try {
      const out = await window.coachRequest('deck', payload);
      if (!out || !out.words || !out.words.length) {
        throw new Error('İçerikten uygun kelime çıkarılamadı. Lütfen talimatı değiştirerek tekrar deneyin.');
      }

      state.deckTitle = out.deckTitle || 'Koç Destesi';
      state.words = out.words.map((w) => ({
        lemma: cleanStr(w.lemma),
        pos: w.pos || 'PHRASE',
        cefr: w.cefr || '',
        contextMeaning: cleanStr(w.contextMeaning),
        sourceSentence: cleanStr(w.sourceSentence),
        selected: true
      }));

      $('deck-builder-deck-name').value = state.deckTitle;
      renderWords();
      $('deck-builder-result').classList.remove('hidden');
      setStatus('');
      $('deck-builder-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      setStatus(e.message || 'Deste oluşturulamadı.', true);
    } finally {
      setBusy(false);
    }
  }

  function renderWords() {
    const container = $('deck-builder-word-list');
    if (!container) return;
    container.innerHTML = '';

    state.words.forEach((w, index) => {
      const item = document.createElement('div');
      item.className = 'coach-word-item';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.padding = '10px 12px';
      item.style.background = 'var(--bg-elevated)';
      item.style.border = '1px solid var(--border-subtle)';
      item.style.borderRadius = '10px';
      item.style.marginBottom = '6px';
      item.style.gap = '8px';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '10px';
      left.style.flex = '1';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = w.selected;
      chk.style.cursor = 'pointer';
      chk.style.width = '17px';
      chk.style.height = '17px';
      chk.addEventListener('change', () => {
        w.selected = chk.checked;
        updateCount();
      });

      const info = document.createElement('div');
      info.innerHTML = `
        <div style="font-weight:800; font-size:0.94rem; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
          <span>${w.lemma}</span>
          <span class="badge" style="background:var(--accent-primary-soft); color:var(--brand-blue-hover); font-size:0.68rem; padding:2px 6px; border-radius:6px;">${POS_LABEL[w.pos] || w.pos}</span>
          ${w.cefr ? `<span class="badge" style="background:rgba(16,185,129,0.15); color:#34D399; font-size:0.68rem; padding:2px 6px; border-radius:6px;">${w.cefr}</span>` : ''}
        </div>
        <div style="font-size:0.82rem; color:var(--text-secondary); margin-top:2px;">${w.contextMeaning}</div>
      `;

      left.appendChild(chk);
      left.appendChild(info);
      item.appendChild(left);
      container.appendChild(item);
    });

    updateCount();
  }

  function updateCount() {
    const selCount = state.words.filter((w) => w.selected).length;
    const countEl = $('deck-builder-count');
    if (countEl) countEl.textContent = `${selCount} / ${state.words.length} kelime seçildi`;
  }

  // Adım 3: Sözlük Zenginleştirmesi & Desteyi Kaydetme
  async function lookupEntry(lemma) {
    if (!lemma) return null;
    try {
      if (window.DictionaryService) {
        if (typeof window.DictionaryService.searchExact === 'function') {
          const match = window.DictionaryService.searchExact(lemma);
          if (match) return match;
        }
        if (typeof window.DictionaryService.synthesizeInstantEntry === 'function') {
          return window.DictionaryService.synthesizeInstantEntry(lemma);
        }
      }
    } catch (_) {}
    return null;
  }

  async function saveDeck() {
    const selected = state.words.filter((w) => w.selected);
    if (!selected.length) {
      toast('Lütfen en az bir kelime seçin.');
      return;
    }

    const deckName = ($('deck-builder-deck-name')?.value || '').trim() || state.deckTitle || 'Koç Destesi';
    const saveBtn = $('btn-deck-builder-save');
    setBusy(true);

    try {
      const createdDeck = await window.wmDB.createDeck(deckName, 'Koç tarafından üretildi', 'default');
      const targetDeckId = createdDeck && createdDeck.id ? createdDeck.id : Date.now();

      let added = 0;
      for (let i = 0; i < selected.length; i++) {
        const w = selected[i];
        if (saveBtn) saveBtn.textContent = `Sözlükten Zenginleştiriliyor: ${i + 1} / ${selected.length}`;

        const entry = await lookupEntry(w.lemma);
        const isNoun = w.pos === 'NOUN' || (entry && entry.partOfSpeech === 'NOUN');

        await window.wmDB.addCard({
          deckId: targetDeckId,
          germanWord: w.lemma,
          meaningsTr: w.contextMeaning || (entry ? entry.meaningsTr : ''),
          partOfSpeech: (entry && entry.partOfSpeech) || POS_CARD[w.pos] || 'OTHER',
          article: isNoun && entry ? entry.article || '' : '',
          pluralForm: isNoun && entry ? entry.pluralForm || '' : '',
          exampleSentence: w.sourceSentence || (entry && entry.exampleSentence) || '',
          praesens: entry ? entry.praesens || '' : '',
          praeteritum: entry ? entry.praeteritum || '' : '',
          partizipZwei: entry ? entry.partizipZwei || '' : '',
          hilfsverb: entry ? entry.hilfsverb || 'hat' : 'hat',
          cefr: w.cefr || (entry && entry.cefr) || 'A1'
        });
        added++;
      }

      toast(`"${deckName}" destesi oluşturuldu (${added} kart eklendi).`);

      // Buluta da yedekle (eğer oturum açıksa)
      if (window.wmSocial && window.wmSocial.isCloudConnected()) {
        try {
          await window.wmSocial.apiCall('decks/save', {
            ownerId: window.wmSocial.user.id,
            title: deckName,
            words: selected.map(w => ({ lemma: w.lemma, pos: w.pos, cefr: w.cefr, contextMeaning: w.contextMeaning }))
          });
        } catch (_) {}
      }

      // Kapat ve Desteler sekmesini yenile
      $('modal-deck-builder')?.classList.add('hidden');
      if (window.wmApp && window.wmApp.renderDecksTab) {
        await window.wmApp.renderDecksTab();
      }
      if (window.wmApp && window.wmApp.switchTab) {
        window.wmApp.switchTab('tab-decks');
      }
    } catch (e) {
      setStatus('Deste kaydedilirken hata oluştu: ' + e.message, true);
    } finally {
      if (saveBtn) saveBtn.textContent = 'Desteyi Kütüphaneme Kaydet';
      setBusy(false);
    }
  }

  function openDeckBuilderModal() {
    const modal = $('modal-deck-builder');
    if (!modal) return;
    modal.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function closeDeckBuilderModal() {
    $('modal-deck-builder')?.classList.add('hidden');
  }

  function init() {
    // 1. Çalış sekmesindeki kart tıklandığında aç
    $('btn-open-deck-builder-card')?.addEventListener('click', openDeckBuilderModal);
    $('btn-close-deck-builder')?.addEventListener('click', closeDeckBuilderModal);

    // 2. Dosya seçme ve kaldırma
    $('btn-deck-builder-pick')?.addEventListener('click', () => $('deck-builder-file-input')?.click());
    $('deck-builder-file-input')?.addEventListener('change', (e) => {
      handleFile(e.target.files[0]);
      e.target.value = '';
    });
    $('btn-deck-builder-file-remove')?.addEventListener('click', () => {
      state.file = null;
      $('deck-builder-file-chip')?.classList.add('hidden');
    });

    // 3. İncele & Deste Oluştur & Kaydet Butonları
    $('btn-deck-builder-analyze')?.addEventListener('click', analyze);
    $('btn-deck-builder-build')?.addEventListener('click', () => buildDeck());
    $('btn-deck-builder-save')?.addEventListener('click', saveDeck);

    // 4. Tümünü Seç / Kaldır
    $('btn-deck-builder-toggle-all')?.addEventListener('click', () => {
      const allSelected = state.words.every((w) => w.selected);
      state.words.forEach((w) => { w.selected = !allSelected; });
      renderWords();
    });

    // 5. Enter tuşuyla deste oluşturma
    $('deck-builder-instruction')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        buildDeck();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.openDeckBuilder = openDeckBuilderModal;
})();
