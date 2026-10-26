/**
 * WortCoach - Coach (yapay zeka destekli icerik analizi ve deste olusturma)
 * Belge / gorsel / metin -> analiz -> kullanici talimati -> lemma listesi -> sozluk ile zenginlestirilmis kartlar.
 * Gemini cagrilari yalnizca sunucu tarafindaki sabit gorevler uzerinden yapilir (js/config.js).
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const EMOJI_RE = /[\p{Extended_Pictographic}\u200d\ufe0f]/gu;
  const stripEmoji = (s) => String(s || '').replace(EMOJI_RE, '').trim();

  const MAX_PDF_BYTES = 4 * 1024 * 1024;
  const MAX_IMG_SIDE = 1600;

  const POS_LABEL = { NOUN: 'Nomen', VERB: 'Verb', ADJ: 'Adjektiv', ADV: 'Adverb', PHRASE: 'Wendung' };
  const POS_CARD = { NOUN: 'NOUN', VERB: 'VERB', ADJ: 'ADJECTIVE', ADV: 'ADVERB', PHRASE: 'OTHER' };

  const state = { file: null, fileName: '', busy: false, words: [], deckTitle: '' };

  function toast(msg) {
    if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(msg);
  }

  function setStatus(msg, isError) {
    const el = $('coach-status');
    if (!el) return;
    if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.toggle('error', !!isError);
  }

  function setBusy(busy) {
    state.busy = busy;
    ['btn-coach-analyze', 'btn-coach-build', 'btn-coach-save', 'btn-coach-pick'].forEach((id) => {
      const b = $(id);
      if (b) b.disabled = busy;
    });
  }

  // ---------- Dosya isleme ----------
  function readAsBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(new Error('Dosya okunamadi.'));
      fr.readAsDataURL(blob);
    });
  }

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
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gorsel acilamadi.')); };
      img.src = url;
    });
  }

  async function handleFile(file) {
    if (!file) return;
    const name = file.name || 'dosya';
    const lower = name.toLowerCase();
    setStatus('Dosya hazirlaniyor...');
    try {
      if (file.type.startsWith('image/')) {
        state.file = { mime: 'image/jpeg', data: await downscaleImage(file) };
      } else if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        if (file.size > MAX_PDF_BYTES) throw new Error('PDF en fazla 4 MB olabilir.');
        state.file = { mime: 'application/pdf', data: await readAsBase64(file) };
      } else if (lower.endsWith('.docx')) {
        if (!window.mammoth) throw new Error('DOCX okuyucu yuklenemedi.');
        const res = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        $('coach-text-input').value = (res.value || '').slice(0, 30000);
        state.file = null;
      } else if (lower.endsWith('.txt')) {
        $('coach-text-input').value = (await file.text()).slice(0, 30000);
        state.file = null;
      } else {
        throw new Error('Desteklenen turler: gorsel, PDF, DOCX, TXT.');
      }
      state.fileName = name;
      if (state.file) {
        $('coach-file-name').textContent = name;
        $('coach-file-chip').classList.remove('hidden');
      } else {
        $('coach-file-chip').classList.add('hidden');
      }
      setStatus('');
    } catch (e) {
      state.file = null;
      $('coach-file-chip').classList.add('hidden');
      setStatus(e.message || 'Dosya islenemedi.', true);
    }
  }

  function currentPayload() {
    const text = $('coach-text-input').value.trim();
    const payload = {};
    if (text) payload.text = text;
    if (state.file) payload.file = state.file;
    return payload;
  }

  // ---------- Adim 1: Analiz ----------
  async function analyze() {
    const payload = currentPayload();
    if (!payload.text && !payload.file) {
      setStatus('Once bir metin yapistirin veya dosya secin.', true);
      return;
    }
    setBusy(true);
    setStatus('Icerik inceleniyor...');
    $('coach-result').classList.add('hidden');
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
        b.addEventListener('click', () => { $('coach-instruction').value = stripEmoji(s); });
        box.appendChild(b);
      });
      $('coach-analysis').classList.remove('hidden');
      setStatus('');
    } catch (e) {
      setStatus(e.message || 'Analiz yapilamadi.', true);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Adim 2: Deste onerisi ----------
  async function buildDeck() {
    const payload = currentPayload();
    payload.instruction = $('coach-instruction').value.trim() || 'Ogrenmeye deger kelimeleri sec.';
    setBusy(true);
    setStatus('Kelimeler cikariliyor...');
    try {
      const r = await window.coachRequest('deck', payload);
      state.words = (r.words || []).map((w) => ({ ...w, selected: true }));
      state.deckTitle = stripEmoji(r.deckTitle) || 'Coach Destesi';
      $('coach-deck-name').value = state.deckTitle;
      renderWords();
      $('coach-result').classList.remove('hidden');
      $('coach-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setStatus('');
    } catch (e) {
      setStatus(e.message || 'Kelime cikarilamadi.', true);
    } finally {
      setBusy(false);
    }
  }

  function renderWords() {
    const list = $('coach-word-list');
    list.innerHTML = '';
    state.words.forEach((w, i) => {
      const row = document.createElement('label');
      row.className = 'coach-word-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = w.selected;
      cb.addEventListener('change', () => { w.selected = cb.checked; updateCount(); });
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
    updateCount();
  }

  function updateCount() {
    const n = state.words.filter((w) => w.selected).length;
    $('coach-count').textContent = `${n} / ${state.words.length} kelime secili`;
    const all = $('btn-coach-toggle-all');
    all.textContent = n === state.words.length ? 'Tumunu Kaldir' : 'Tumunu Sec';
    $('btn-coach-save').disabled = state.busy || n === 0;
  }

  // ---------- Adim 3: Sozluk ile zenginlestirme ve kaydetme ----------
  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

  function uniqueMeanings(list) {
    const seen = new Set();
    const out = [];
    list.forEach((m) => {
      const v = String(m || '').trim();
      const k = v.toLowerCase();
      if (v && !seen.has(k)) { seen.add(k); out.push(v); }
    });
    return out;
  }

  async function lookupEntry(lemma) {
    try {
      if (!window.executeSmartSearchPipeline) return null;
      const res = await withTimeout(window.executeSmartSearchPipeline(lemma, new AbortController().signal), 8000);
      if (!res || !res.entry || (res.status !== 'exact' && res.status !== 'stem')) return null;
      let entry = res.entry;
      // Lemma ile eslesmeyen (kok bulma ile gelen) girdiler yanlis kelimeye ait olabilir.
      if (String(entry.germanWord || '').toLowerCase() !== lemma.toLowerCase()) return null;
      if (!entry.exampleSentence && window.DictionaryService && window.DictionaryService.enrichWithNetwork) {
        const enriched = await withTimeout(
          window.DictionaryService.enrichWithNetwork(entry, new AbortController().signal), 6000);
        if (enriched) entry = enriched;
      }
      return entry;
    } catch (_) {
      return null;
    }
  }

  async function buildCardPayload(w, deckId) {
    const entry = await lookupEntry(w.lemma);
    const meanings = uniqueMeanings([w.contextMeaning, ...(entry && entry.meaningsTr ? String(entry.meaningsTr).split(',') : [])]).slice(0, 4);
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
    const selected = state.words.filter((w) => w.selected);
    if (!selected.length) return;
    const name = ($('coach-deck-name').value || '').trim() || state.deckTitle || 'Coach Destesi';
    const saveBtn = $('btn-coach-save');
    setBusy(true);
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
        try { if (window.WordGameService) await window.WordGameService.initPool(); } catch (_) {}
        try { await app.renderDecksTab(); await app.renderCardsList(); await app.refreshHomeDashboard(); } catch (_) {}
      }
      toast(`"${name}" destesi olusturuldu (${added} kart).`);
      $('coach-result').classList.add('hidden');
    } catch (e) {
      setStatus(e.message || 'Deste kaydedilemedi.', true);
    } finally {
      saveBtn.textContent = 'Desteyi Kaydet';
      setBusy(false);
      updateCount();
    }
  }

  // ---------- Gorunum degistirme ----------
  function switchView(view) {
    document.querySelectorAll('.coach-switch-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.coachView === view));
    $('coach-pane').classList.toggle('hidden', view !== 'coach');
    $('reader-setup-pane').classList.toggle('hidden', view !== 'reader');
  }

  function init() {
    if (!$('coach-pane')) return;
    document.querySelectorAll('.coach-switch-btn').forEach((b) =>
      b.addEventListener('click', () => switchView(b.dataset.coachView)));
    $('btn-coach-pick').addEventListener('click', () => $('coach-file-input').click());
    $('coach-file-input').addEventListener('change', (e) => {
      handleFile(e.target.files[0]);
      e.target.value = '';
    });
    $('btn-coach-file-remove').addEventListener('click', () => {
      state.file = null;
      $('coach-file-chip').classList.add('hidden');
    });
    $('btn-coach-analyze').addEventListener('click', analyze);
    $('btn-coach-build').addEventListener('click', buildDeck);
    $('btn-coach-save').addEventListener('click', saveDeck);
    $('btn-coach-toggle-all').addEventListener('click', () => {
      const allSelected = state.words.every((w) => w.selected);
      state.words.forEach((w) => { w.selected = !allSelected; });
      renderWords();
    });
    $('coach-instruction').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') buildDeck();
    });
  }

  init();
})();
