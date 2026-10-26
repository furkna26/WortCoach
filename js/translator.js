/**
 * WortMeister — Hızlı Çeviri Sekmesi (tab-translate) Yöneticisi
 * - DeepL API & Google Translate & MyMemory Hibrit Motoru
 * - Segmented Language Switcher [TR] [DE] [EN] <-> [TR] [DE]
 * - Otomatik Morfoloji Çıkarımı ve Hatasız Bayrak / Dil Eşleme
 */

class WortMeisterTranslator {
  constructor() {
    this.sourceLang = 'tr';
    this.targetLang = 'de';
    this.inputEl = document.getElementById('trans-input-text');
    this.outputEl = document.getElementById('trans-output-text');
    this.resultWrapper = document.getElementById('trans-result-wrapper');
    this.grammarHintEl = document.getElementById('trans-grammar-hint');
    this.counterEl = document.getElementById('trans-char-counter');
    this.btnToCard = document.getElementById('btn-trans-to-card');

    this.lastResult = null;
    this.abortController = null;
  }

  init() {
    if (!this.inputEl) return;

    // Karakter Sayacı
    this.inputEl.addEventListener('input', () => {
      const len = this.inputEl.value.length;
      this.counterEl.textContent = `${len}`;
    });

    // Kaynak Dil Segment Butonları [TR] [DE] [EN]
    const sourceBtns = document.querySelectorAll('#source-lang-segments .lang-pill-btn');
    sourceBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        sourceBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.sourceLang = btn.getAttribute('data-lang');
        this.syncSourceFlag();
      });
    });

    // Hedef Dil Segment Butonları [TR] [DE]
    const targetBtns = document.querySelectorAll('#target-lang-segments .lang-pill-btn');
    targetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        targetBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.targetLang = btn.getAttribute('data-lang');
        this.syncTargetFlag();
      });
    });

    // Dilleri Değiştir (Swap) Butonu
    document.getElementById('btn-swap-langs').addEventListener('click', () => {
      const oldSrc = this.sourceLang;
      const oldTgt = this.targetLang;

      this.sourceLang = oldTgt;
      this.targetLang = oldSrc === 'en' ? 'tr' : oldSrc;

      // Segment butonlarını güncelle
      document.querySelectorAll('#source-lang-segments .lang-pill-btn').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-lang') === this.sourceLang);
      });
      document.querySelectorAll('#target-lang-segments .lang-pill-btn').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-lang') === this.targetLang);
      });

      this.syncSourceFlag();
      this.syncTargetFlag();

      if (this.inputEl.value.trim()) {
        this.translateNow();
      }
    });

    document.getElementById('btn-run-translate').addEventListener('click', () => {
      this.translateNow();
    });

    document.getElementById('btn-tts-target').addEventListener('click', () => {
      if (this.lastResult && this.lastResult.translatedText) {
        window.wmTTS.speak(this.lastResult.translatedText, this.targetLang === 'en' ? 'en-US' : 'de-DE');
      }
    });

    this.btnToCard.addEventListener('click', () => {
      if (this.lastResult && window.wmApp) {
        window.wmApp.openAddCardModalWithPrefill(this.lastResult);
      }
    });

    this.syncSourceFlag();
    this.syncTargetFlag();
  }

  syncSourceFlag() {
    const el = document.getElementById('trans-source-flag-badge');
    const flagClass = `lang-badge-${this.sourceLang}`;
    const flagId = `#flag-${this.sourceLang}`;
    el.innerHTML = `
      <span class="lang-badge ${flagClass}">
        <svg class="flag-svg"><use href="${flagId}"></use></svg>
        <span>${this.sourceLang.toUpperCase()}</span>
      </span>
    `;
  }

  syncTargetFlag() {
    const el = document.getElementById('trans-target-flag-badge');
    const flagClass = `lang-badge-${this.targetLang}`;
    const flagId = `#flag-${this.targetLang}`;
    el.innerHTML = `
      <span class="lang-badge ${flagClass}">
        <svg class="flag-svg"><use href="${flagId}"></use></svg>
        <span>${this.targetLang.toUpperCase()}</span>
      </span>
    `;
  }

  // Uzun metinleri URL limitini asmamak icin cumle/satir sinirlarinda parcalara boler
  splitIntoChunks(text, maxLen = 1200) {
    const parts = text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) || [text];
    const chunks = [];
    let cur = '';
    for (const p of parts) {
      if ((cur + p).length > maxLen && cur) { chunks.push(cur); cur = ''; }
      let piece = p;
      while (piece.length > maxLen) { chunks.push(piece.slice(0, maxLen)); piece = piece.slice(maxLen); }
      cur += piece;
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  async translateTextHybrid(text, src, tgt, signal) {
    const cleanText = text.trim();

    // 1. Google Translate Web Client (Hızlı, Ücretsiz, API Key Gerektirmez) - parçalı çeviri
    try {
      const out = [];
      for (const chunk of this.splitIntoChunks(cleanText)) {
        if (!chunk.trim()) { out.push(chunk); continue; }
        const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${tgt}&dt=t&q=${encodeURIComponent(chunk)}`;
        const res = await fetch(gUrl, { signal });
        const raw = await res.json();
        if (!(raw && Array.isArray(raw[0]))) throw new Error('bad response');
        const lead = chunk.match(/^\s*/)[0], trail = chunk.match(/\s*$/)[0];
        out.push(lead + raw[0].map((item) => item[0]).join('').trim() + trail);
      }
      const joined = out.join('').trim();
      if (joined) return joined;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }

    // 2. MyMemory Fallback (kısa metinler)
    try {
      const mUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText.slice(0, 450))}&langpair=${src}|${tgt}`;
      const res = await fetch(mUrl, { signal });
      const data = await res.json();
      const txt = data?.responseData?.translatedText;
      if (txt && !txt.includes('MYMEMORY WARNING')) {
        return txt.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }

    // 3. WortCoach Cloud Proxy Fallback
    try {
      const pRes = await fetch('https://wortcoach-proxy.mosmandurmaz26.workers.dev/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: cleanText, sl: src, tl: tgt }),
        signal
      }).then(r => r.json()).catch(() => null);
      if (pRes && pRes.translation) return pRes.translation;
    } catch (_) {}

    return 'Çeviri yapılamadı (Çevrimdışı)';
  }

  async translateNow() {
    const rawText = this.inputEl.value.trim();
    if (!rawText) return;

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.resultWrapper.classList.remove('hidden');
    this.outputEl.textContent = 'Çevriliyor...';

    const src = this.sourceLang;
    const tgt = this.targetLang;

    try {
      const translated = await this.translateTextHybrid(rawText, src, tgt, this.abortController.signal);
      this.outputEl.textContent = translated;

      // Almanca kelime adayı belirleme
      const germanCandidate = src === 'de' ? rawText : tgt === 'de' ? translated : '';
      const trCandidate = src === 'tr' ? rawText : tgt === 'tr' ? translated : '';
      const enCandidate = src === 'en' ? rawText : tgt === 'en' ? translated : '';

      if (germanCandidate && germanCandidate.split(/\s+/).length <= 3) {
        const synth = window.DictionaryService.synthesizeInstantEntry(germanCandidate);
        this.lastResult = {
          ...synth,
          targetLanguage: 'de', // Kesinlikle Almanca ('de')
          translatedText: translated,
          meaningsTr: trCandidate || synth.meaningsTr,
          meaningsEn: enCandidate || synth.meaningsEn
        };

        if (synth.partOfSpeech === 'VERB') {
          const reflStr = synth.isReflexive ? ' • Reflexiv (sich)' : '';
          this.grammarHintEl.textContent = `Fiil Analizi: ${synth.regularity}${reflStr} | Präsens: ${synth.praesens} | Perfekt: ${synth.hilfsverb} ${synth.partizipZwei}`;
          this.grammarHintEl.classList.remove('hidden');
        } else if (synth.partOfSpeech === 'NOUN') {
          this.grammarHintEl.textContent = `İsim Analizi: Artikel: ${synth.article} | Çoğul: ${synth.pluralForm}`;
          this.grammarHintEl.classList.remove('hidden');
        } else {
          this.grammarHintEl.classList.add('hidden');
        }
      } else {
        this.lastResult = {
          germanWord: germanCandidate || rawText,
          targetLanguage: tgt === 'de' || src === 'de' ? 'de' : 'en',
          partOfSpeech: 'OTHER',
          meaningsTr: trCandidate || translated,
          meaningsEn: enCandidate || '',
          exampleSentence: '',
          translatedText: translated
        };
        this.grammarHintEl.classList.add('hidden');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      this.outputEl.textContent = 'Bağlantı hatası oluştu.';
    }
  }
}

window.wmTranslator = new WortMeisterTranslator();
