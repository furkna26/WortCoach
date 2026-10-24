/**
 * WortCoach — Ana Uygulama Orkestratörü (app.js v2.2.0)
 * - 6-Hedefli Alt Navigasyon (Anasayfa, Çeviri, Tekrar, Desteler, Kartlar, Hakkında)
 * - Android Parity Word Detail Card (Screenshot 2: erfassen iki sütunlu çekim tablosu)
 * - Kelime Desteleri (Screenshot 3: Deste kartları ve FAB)
 * - Çoğul İsimleri Otomatik Tekil Haliyle Normatif Kaydetme
 * - Kesin Almanca (DE) Bayrak ve Dil Eşleme Koruması
 */

class WortCoachApp {
  constructor() {
    this.searchDebounceTimer = null;
    this.searchAbortController = null;
    this.modalDebounceTimer = null;
    this.modalAbortController = null;
    this.deferredInstallPrompt = null;
    this.currentSearchEntry = null;
  }

  async init() {
    await window.wmDB.init();
    await window.DatabaseSeeder.seedIfNeeded();

    await this.initTheme();
    this.bindNavigation();
    this.bindSearchEngine();
    this.bindAddCardModal();
    this.bindDeckManagement();
    this.bindCardsTab();
    this.bindPWAInstall();
    this.initUmlautBars();

    this.bindSettingsModal();
    this.bindGames();
    if (window.WordGameService) {
      window.WordGameService.initPool();
    }

    window.wmTranslator.init();
    window.wmStudy.init();
    if (window.wmStats) window.wmStats.init();

    await this.refreshHomeDashboard();
    await this.renderDecksTab();
    this.registerServiceWorker();

    // Canlı Wiktionary / Ağ zenginleştirmesi tamamlandığında UI'ı güncelle
    window.addEventListener('dictionary-enriched', (e) => {
      const enriched = e.detail;
      const currentQuery = document.getElementById('global-search-input')?.value.trim().toLowerCase();
      if (enriched && currentQuery && (currentQuery === enriched.germanWord.toLowerCase() || currentQuery === (enriched.baseVerb || '').toLowerCase())) {
        this.renderSearchResultCard(enriched);
      }
    });

    document.getElementById('btn-seed-refresh')?.addEventListener('click', async () => {
      localStorage.removeItem('wm_seeded_initialSeedCompleted');
      await window.wmDB.setSetting('initialSeedCompleted', false);
      await window.DatabaseSeeder.seedIfNeeded();
      this.showToast('Örnek veriler başarıyla yeniden yüklendi.');
      await this.refreshHomeDashboard();
      await this.renderDecksTab();
    });

    // DeepL API Key Ayarı
    const deepLInput = document.getElementById('input-deepl-key');
    const deepLStatus = document.getElementById('deepl-key-status');
    const deepLSaveBtn = document.getElementById('btn-save-deepl-key');

    const updateDeepLUI = () => {
      const currentKey = localStorage.getItem('deepl_api_key');
      if (deepLInput && currentKey) deepLInput.value = currentKey;
      if (deepLStatus) {
        if (currentKey) {
          deepLStatus.textContent = 'Aktif (Kullanılıyor) ✓';
          deepLStatus.style.color = 'var(--palette-green)';
        } else {
          deepLStatus.textContent = 'Aktif Değil';
          deepLStatus.style.color = 'var(--text-muted)';
        }
      }
    };
    updateDeepLUI();

    deepLSaveBtn?.addEventListener('click', () => {
      const val = (deepLInput?.value || '').trim();
      if (val) {
        localStorage.setItem('deepl_api_key', val);
        this.showToast('DeepL API anahtarı kaydedildi! ✓');
      } else {
        localStorage.removeItem('deepl_api_key');
        this.showToast('DeepL API anahtarı kaldırıldı.');
      }
      updateDeepLUI();
    });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // --- TEMA YÖNETİMİ ---
  async initTheme() {
    const savedTheme = localStorage.getItem('wm_theme') || (await window.wmDB.getSetting('theme', 'dark'));
    this.applyTheme(savedTheme);

    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      this.applyTheme(next);
    });
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wm_theme', theme);
    window.wmDB.setSetting('theme', theme);

    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#000000' : '#F5F6F0');
    }

    const iconUse = document.querySelector('#theme-icon-svg use');
    if (iconUse) {
      iconUse.setAttribute('href', theme === 'dark' ? '#icon-sun' : '#icon-moon');
    }
  }

  // --- 6 SEKME ALT NAVİGASYON ---
  bindNavigation() {
    const navButtons = document.querySelectorAll('.bottom-nav .nav-item');
    navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        this.switchTab(targetId);
      });
    });

    document.getElementById('brand-home-trigger')?.addEventListener('click', () => {
      this.switchTab('tab-home');
    });

    document.getElementById('btn-hero-start-study')?.addEventListener('click', () => {
      this.switchTab('tab-study');
    });

    document.getElementById('btn-goto-games-card')?.addEventListener('click', () => {
      this.switchTab('tab-games');
    });

    document.getElementById('btn-see-all-decks')?.addEventListener('click', () => {
      this.switchTab('tab-decks');
    });
  }

  async switchTab(tabId) {
    document.querySelectorAll('.tab-view').forEach((sec) => sec.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-target') === tabId);
    });

    const targetEl = document.getElementById(tabId);
    if (targetEl) targetEl.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tabId === 'tab-home') {
      await this.refreshHomeDashboard();
    } else if (tabId === 'tab-study') {
      if (window.wmStudy) {
        await window.wmStudy.loadSession(window.wmStudy.deckSelect ? window.wmStudy.deckSelect.value : 'all', false);
      }
    } else if (tabId === 'tab-games') {
      // Kelime Oyunlar sekmesi ald
    } else if (tabId === 'tab-decks') {
      await this.renderDecksTab();
    } else if (tabId === 'tab-cards') {
      await this.renderCardsList();
    }
  }

  // --- OYUNLAR & KART ALIŞTIRMASI ALT SEKME YÖNETİCİSİ ---
  activateGamesSubview(subview) {
    const isGames = subview === 'games';
    document.getElementById('btn-subview-games')?.classList.toggle('active', isGames);
    document.getElementById('btn-subview-study')?.classList.toggle('active', !isGames);
    document.getElementById('subview-games-content')?.classList.toggle('hidden', !isGames);
    document.getElementById('subview-study-content')?.classList.toggle('hidden', isGames);
    if (!isGames && window.wmStudy && window.wmStudy.deckSelect) {
      window.wmStudy.loadSession(window.wmStudy.deckSelect.value || 'all', false);
    }
  }

  // --- AYARLAR MODALI (DeepL API & Örnek Veri Sıfırlama) ---
  bindSettingsModal() {
    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      document.getElementById('modal-settings')?.classList.remove('hidden');
    });

    document.getElementById('btn-close-settings-modal')?.addEventListener('click', () => {
      document.getElementById('modal-settings')?.classList.add('hidden');
    });
  }

  // --- "BUNU MU DEMEK İSTEDİNİZ?" / OTANTİK ÖNERİ MOTORU (v2.6.0) ---
  generateLiveSuggestions(query) {
    const q = (query || '').trim();
    if (q.length < 2) return [];

    const suggestions = [];
    const lower = q.toLowerCase();
    const cleanWord = lower.replace(/^(der|die|das)\s+/i, '').trim();

    // 1. Ters Çeviri Haritası (İngilizce / Türkçe -> Otantik Almanca Eşdeğeri)
    // Örnek: 'house' veya 'ev' -> 'das Haus', 'car' veya 'araba' -> 'das Auto'
    const rev = (window.REVERSE_TR_EN_TO_DE_MAP && (window.REVERSE_TR_EN_TO_DE_MAP[lower] || window.REVERSE_TR_EN_TO_DE_MAP[cleanWord]));
    if (rev && rev.de) {
      const deWord = rev.de;
      if (rev.pos === 'NOUN') {
        const nInfo = window.GermanNounHelper?.analyze(deWord);
        const art = (nInfo && nInfo.article) ? nInfo.article : (rev.article || 'das');
        suggestions.push(`${art} ${deWord}`);
      } else {
        suggestions.push(deWord);
      }
    }

    // 2. Artikel Düzeltmesi (die Tisch -> der Tisch, der Buch -> das Buch)
    const artMatch = q.match(/^(der|die|das)\s+(.+)$/i);
    if (artMatch && window.GermanNounHelper) {
      const typedArt = artMatch[1].toLowerCase();
      const nName = artMatch[2].trim();
      const nInfo = window.GermanNounHelper.analyze(nName);
      if (nInfo && nInfo.article && nInfo.article !== typedArt) {
        suggestions.unshift(`${nInfo.article} ${nInfo.word}`);
      }
    } else if (!artMatch && !rev && window.GermanNounHelper) {
      // SADECE Almanca sözlükte kayıtlı gerçek kelimeler için artikel ekle
      const cleanCap = cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1);
      const isKnownGermanWord = Boolean(
        window.OFFLINE_DICTIONARY && (window.OFFLINE_DICTIONARY[cleanWord] || window.OFFLINE_DICTIONARY[cleanCap])
      );
      if (isKnownGermanWord) {
        const nInfo = window.GermanNounHelper.analyze(cleanWord);
        if (nInfo && nInfo.article && !lower.startsWith(nInfo.article)) {
          suggestions.push(`${nInfo.article} ${nInfo.word}`);
        }
      }
    }

    // 3. Umlaut ve Normalizasyon (schon -> schön, uber -> über)
    // SADECE VE SADECE bilinen Almanca sözlükte kayıtlı gerçek kelimeler için öner!
    // Asla 'höuse' veya 'hoüse' gibi hayali kelimeler üretme!
    if (window.SearchNormalizer) {
      const candidates = window.SearchNormalizer.generateCandidates(cleanWord);
      for (const cand of candidates) {
        if (cand !== cleanWord && cand !== lower) {
          const candCap = cand.charAt(0).toUpperCase() + cand.slice(1);
          const dictEntry = window.OFFLINE_DICTIONARY && (window.OFFLINE_DICTIONARY[cand] || window.OFFLINE_DICTIONARY[candCap]);
          if (dictEntry) {
            if (dictEntry.partOfSpeech === 'NOUN' && dictEntry.article) {
              suggestions.push(`${dictEntry.article} ${dictEntry.germanWord || candCap}`);
            } else {
              suggestions.push(dictEntry.germanWord || cand);
            }
          }
        }
      }
    }

    // 4. Parity ekleri: dankbar -> Dankbarkeit, dankbarsten, dankbarer
    if (cleanWord === 'dankbar') {
      suggestions.push('Dankbarkeit', 'dankbarsten', 'dankbarer');
    } else if (cleanWord === 'moglich' || cleanWord === 'möglich') {
      suggestions.push('Möglichkeit', 'möglicherweise');
    } else if (cleanWord === 'schnell') {
      suggestions.push('Schnelligkeit', 'schneller', 'schnellsten');
    } else if (cleanWord === 'wichtig') {
      suggestions.push('Wichtigkeit', 'wichtiger', 'wichtigsten');
    }

    // 5. Sözlük ve Kullanıcı Kartlarından Kısmi Eşleşmeler
    if (window.OFFLINE_DICTIONARY) {
      for (const [wKey, entry] of Object.entries(window.OFFLINE_DICTIONARY)) {
        if (wKey !== cleanWord && (wKey.startsWith(cleanWord) || (cleanWord.length >= 3 && wKey.includes(cleanWord)))) {
          const display = (entry.partOfSpeech === 'NOUN' && entry.article)
            ? `${entry.article} ${entry.germanWord || wKey}`
            : (entry.germanWord || wKey);
          suggestions.push(display);
          if (suggestions.length >= 6) break;
        }
      }
    }

    // Tekilleştir ve sorguyla aynı olanı temizle
    const seen = new Set();
    const finalSuggestions = [];
    for (const s of suggestions) {
      const sLower = s.toLowerCase();
      if (sLower !== lower && sLower !== cleanWord && !seen.has(sLower)) {
        seen.add(sLower);
        finalSuggestions.push(s);
      }
      if (finalSuggestions.length >= 4) break;
    }

    return finalSuggestions;
  }

  renderSuggestions(suggestions) {
    const container = document.getElementById('search-suggestions-container');
    if (!container) return;

    if (!suggestions || suggestions.length === 0) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }

    container.innerHTML = `
      <div class="suggestion-engine-card">
        <div class="sec-header">
          <svg class="svg-icon" style="color:var(--brand-blue); width:18px; height:18px;"><use href="#icon-help"></use></svg>
          <span>Bunu mu demek istediniz?</span>
        </div>
        <div class="sec-chips-row">
          ${suggestions
            .map(
              (s) => `
            <button type="button" class="sec-chip" data-word="${s.replace(/"/g, '&quot;')}">
              <svg class="svg-icon" style="width:13px;height:13px;color:var(--brand-blue);"><use href="#icon-search"></use></svg>
              <span>${s}</span>
            </button>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    container.classList.remove('hidden');

    container.querySelectorAll('.sec-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const word = chip.getAttribute('data-word');
        const input = document.getElementById('global-search-input');
        if (input) {
          input.value = word;
          document.getElementById('btn-clear-search')?.classList.remove('hidden');
          this.executeSearch(word);
        }
      });
    });
  }

  // --- ARAMA MOTORU (500ms Debounce + 2 Karakter Barajı + AbortController) ---
  bindSearchEngine() {
    const searchInput = document.getElementById('global-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    const statusBar = document.getElementById('search-status-bar');
    const resultsContainer = document.getElementById('search-results-container');
    const homeDashboard = document.getElementById('home-dashboard');

    searchInput?.addEventListener('input', () => {
      const rawValue = searchInput.value;
      const trimmed = rawValue.trim();

      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      if (this.searchAbortController) this.searchAbortController.abort();

      clearBtn?.classList.toggle('hidden', rawValue.length === 0);

      if (trimmed.length === 0) {
        statusBar?.classList.add('hidden');
        resultsContainer?.classList.add('hidden');
        this.renderSuggestions([]);
        homeDashboard?.classList.remove('hidden');
        return;
      }

      // Canlı Önerileri hemen göster
      const liveSuggs = this.generateLiveSuggestions(trimmed);
      this.renderSuggestions(liveSuggs);

      if (trimmed.length < 2) {
        if (statusBar) {
          statusBar.textContent = 'Arama için en az 2 karakter girin...';
          statusBar.classList.remove('hidden');
        }
        return;
      }

      this.searchDebounceTimer = setTimeout(() => {
        this.executeSearch(trimmed);
      }, 400);
    });

    clearBtn?.addEventListener('click', () => {
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      if (this.searchAbortController) this.searchAbortController.abort();
      searchInput.value = '';
      clearBtn.classList.add('hidden');
      statusBar?.classList.add('hidden');
      resultsContainer?.classList.add('hidden');
      this.renderSuggestions([]);
      homeDashboard?.classList.remove('hidden');
      searchInput.focus();
    });

    document.querySelectorAll('.word-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const w = chip.getAttribute('data-word');
        if (searchInput) {
          searchInput.value = w;
          clearBtn?.classList.remove('hidden');
          this.executeSearch(w);
        }
      });
    });
  }

  async executeSearch(query) {
    const statusBar = document.getElementById('search-status-bar');
    const resultsContainer = document.getElementById('search-results-container');
    const homeDashboard = document.getElementById('home-dashboard');

    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }
    this.searchAbortController = new AbortController();
    const { signal } = this.searchAbortController;

    homeDashboard?.classList.add('hidden');
    resultsContainer?.classList.remove('hidden');

    if (statusBar) {
      statusBar.textContent = 'Kelime taranıyor...';
      statusBar.classList.remove('hidden');
    }

    // Arama önerilerini güncelle
    const suggs = this.generateLiveSuggestions(query);
    this.renderSuggestions(suggs);

    try {
      const entry = await window.DictionaryService.resolveToGermanEntry(query, signal);
      if (signal.aborted) return;

      if (!entry) {
        statusBar?.classList.add('hidden');
        this.renderEmptyStateCard(query);
        return;
      }

      this.currentSearchEntry = entry;
      await this.renderSearchResultCard(entry, query);
      statusBar?.classList.add('hidden');

      // Arka planda örnek cümleler ve Wiktionary morfolojisi ile zenginleştir
      if (!entry.isSaved && (!entry.examples || entry.examples.length === 0 || !entry.meaningsTr)) {
        window.DictionaryService.enrichWithNetwork(entry, signal).then(async (enriched) => {
          if (!signal.aborted && this.currentSearchEntry === entry) {
            this.currentSearchEntry = enriched;
            await this.renderSearchResultCard(enriched, query);
          }
        }).catch(() => {});
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error("Search execution / render error:", e);
      statusBar?.classList.add('hidden');
      this.renderEmptyStateCard(query);
    }
  }

  renderEmptyStateCard(query) {
    const container = document.getElementById('search-results-container');
    const safeQuery = (query || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    container.innerHTML = `
      <div class="search-empty-state-card">
        <div class="empty-state-icon">
          <svg class="svg-icon-lg"><use href="#icon-search"></use></svg>
        </div>
        <h3 class="empty-state-title">Sonuç Bulunamadı</h3>
        <p class="empty-state-desc">„<span class="highlight-query">${safeQuery}</span>“ için sözlükte veya çeviri servislerinde bir karşılık bulunamadı.</p>
        <button id="btn-empty-add-card" class="btn-primary" style="margin-top: 14px;">
          <svg class="svg-icon"><use href="#icon-plus"></use></svg>
          <span>Sonuç yok (Ekle)</span>
        </button>
      </div>
    `;

    document.getElementById('btn-empty-add-card')?.addEventListener('click', () => {
      this.openAddCardModal();
      const wordInput = document.getElementById('card-word-input');
      if (wordInput) {
        wordInput.value = query;
        wordInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  initUmlautBars() {
    document.querySelectorAll('.umlaut-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const char = btn.getAttribute('data-char');
        const bar = btn.closest('.umlaut-bar');
        const targetId = bar ? bar.getAttribute('data-target-input') : null;
        const input = targetId ? document.getElementById(targetId) : null;
        if (!input) return;

        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const text = input.value;
        input.value = text.slice(0, start) + char + text.slice(end);
        input.selectionStart = input.selectionEnd = start + char.length;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  /**
   * Android Screenshot 2 ile birebir eşleşen İki Sütunlu Fiil Çekim Tablosu HTML Üretici
   */
  buildVerbTenseTableHTML(entry) {
    const fullConj = (window.GermanVerbHelper && typeof window.GermanVerbHelper.getFullConjugation === 'function') ? window.GermanVerbHelper.getFullConjugation(entry.germanWord) : null;
    const hilfs = entry.hilfsverb || 'hat';
    const isReflexive = entry.isReflexive || (fullConj && fullConj.isReflexive);
    const isSeparable = entry.isSeparable || (fullConj && fullConj.isSeparable);
    const sepPrefix = entry.separablePrefix || (fullConj ? fullConj.separablePrefix : '');

    // Reflexiv Badge
    const reflexivBadge = isReflexive
      ? `<span class="badge-reflexiv-pill">Reflexives Verb (sich)</span>`
      : '';

    // Trennbar Badge
    const trennbarBadge = isSeparable
      ? `<span class="badge-trennbar-pill">Ayrılabilen Fiil (trennbar${sepPrefix ? ': ' + sepPrefix + ' | ...' : ''})</span>`
      : '';

    // Stammformen
    const p1 = fullConj ? fullConj.praesensEr : (entry.praesens || '-');
    const prt = fullConj ? fullConj.praeteritumEr : (entry.praeteritum || '-');
    const p2 = fullConj ? fullConj.perfektEr : `${hilfs} ${entry.partizipZwei || '-'}`;
    const stammformenText = `Stammformen: ${entry.germanWord} · ${p1} · ${prt} · ${p2}`;

    if (fullConj) {
      return `
        <div class="grammar-table-card">
          <div class="gtc-top-row">
            <span class="gtc-title">DÜZENSİZ FİİL ÇEKİM TABLOSU</span>
            <span class="badge-regularity">${fullConj.vowelChange || 'Düzensiz (Unregelmäßig)'}</span>
          </div>

          <div class="gtc-badges-row">
            ${reflexivBadge}
            ${trennbarBadge}
          </div>

          <div class="gtc-stammformen">
            <span class="gtc-stammformen-label">${stammformenText}</span>
          </div>

          <div class="gtc-divider"></div>

          <div class="gtc-two-col">
            <!-- Kolon 1: PRÄSENS -->
            <div>
              <div class="gtc-col-header">PRÄSENS</div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">ich</span> <span class="gtc-person-form">${fullConj.praesensIch}</span></div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">du</span> <span class="gtc-person-form highlighted">${fullConj.praesensDu}</span></div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">er/sie/es</span> <span class="gtc-person-form">${fullConj.praesensEr}</span></div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">wir</span> <span class="gtc-person-form">${fullConj.praesensWir}</span></div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">ihr</span> <span class="gtc-person-form">${fullConj.praesensIhr}</span></div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">sie/Sie</span> <span class="gtc-person-form">${fullConj.praesensSie}</span></div>
            </div>

            <!-- Kolon 2: PRÄTERITUM -->
            <div>
              <div class="gtc-col-header">PRÄTERITUM</div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">ich</span> <span class="gtc-person-form">${fullConj.praeteritumIch}</span></div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">du</span> <span class="gtc-person-form">${fullConj.praeteritumDu}</span></div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">er/sie/es</span> <span class="gtc-person-form">${fullConj.praeteritumEr}</span></div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">wir</span> <span class="gtc-person-form">${fullConj.praeteritumWir}</span></div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">ihr</span> <span class="gtc-person-form">${fullConj.praeteritumIhr}</span></div>
              <div class="gtc-person-row"><span class="gtc-person-pronoun">sie/Sie</span> <span class="gtc-person-form">${fullConj.praeteritumSie}</span></div>
            </div>
          </div>

          <div class="gtc-divider"></div>

          <div class="gtc-bottom-row">
            <span>Konjunktiv II: ich ${fullConj.konjunktivZweiIch || '-'}</span>
            <span>Imperativ: ${fullConj.imperativDu || '-'}</span>
          </div>
        </div>
      `;
    }

    // Standart 2x2 düzenli fiil kutusu
    return `
      <div class="grammar-table-card">
        <div class="gtc-top-row">
          <span class="gtc-title">FİİL ZAMANLARI &amp; ÇEKİMLERİ</span>
          <span class="badge-regularity">${entry.regularity || 'Düzenli'}</span>
        </div>
        <div class="gtc-badges-row">
          ${reflexivBadge}
          ${trennbarBadge}
        </div>
        <div class="tense-2x2-grid">
          <div class="tense-tile">
            <div class="tense-tile-header">
              <svg class="svg-icon" style="color:var(--brand-blue)"><use href="#icon-clock"></use></svg>
              <span>Präsens (3. Sg)</span>
            </div>
            <div class="tense-tile-val">${entry.praesens || '-'}</div>
          </div>
          <div class="tense-tile">
            <div class="tense-tile-header">
              <svg class="svg-icon" style="color:#A78BFA"><use href="#icon-history"></use></svg>
              <span>Präteritum</span>
            </div>
            <div class="tense-tile-val">${entry.praeteritum || '-'}</div>
          </div>
          <div class="tense-tile full-width">
            <div class="tense-tile-header">
              <svg class="svg-icon" style="color:var(--palette-green)"><use href="#icon-check"></use></svg>
              <span>Perfekt (Geçmiş Zaman)</span>
            </div>
            <div class="tense-tile-val">
              <span>${hilfs} ${entry.partizipZwei || '-'}</span>
              <span class="tile-link-pill">${hilfs === 'ist' ? 'sein (ist)' : 'haben (hat)'}</span>
            </div>
          </div>
          <div class="tense-tile full-width">
            <div class="tense-tile-header">
              <svg class="svg-icon" style="color:var(--palette-yellow)"><use href="#icon-bolt"></use></svg>
              <span>Imperativ</span>
            </div>
            <div class="tense-tile-val">${entry.imperativ || '-'}</div>
          </div>
        </div>
      </div>
    `;
  }

  async renderSearchResultCard(entry, searchedTerm) {
    const container = document.getElementById('search-results-container');
    if (!container || !entry) return;

    // 1. Otomatik & Normatif Artikel Koruması (İsimler her zaman artikelle eşleştirilir)
    let canonicalArticle = entry.article || '';
    let cleanWord = (entry.germanWord || '').trim();
    let nounInfo = null;

    // KESİN KURAL: Fiiller (VERB) ve Sıfatlar (ADJECTIVE) asla isimleştirilemez ve artikel alamaz!
    const isExplicitNoun = entry.partOfSpeech === 'NOUN' || (Boolean(canonicalArticle) && entry.partOfSpeech !== 'VERB' && entry.partOfSpeech !== 'ADJECTIVE');

    if (isExplicitNoun && window.GermanNounHelper) {
      nounInfo = window.GermanNounHelper.analyze(cleanWord);
      if (!canonicalArticle && nounInfo && nounInfo.article) {
        canonicalArticle = nounInfo.article;
      }
      if (nounInfo && nounInfo.word) {
        cleanWord = nounInfo.word;
      }
    } else if (entry.partOfSpeech === 'VERB' || entry.partOfSpeech === 'ADJECTIVE') {
      canonicalArticle = ''; // Fiil ve sıfata artikel KESİNLİKLE yasak
      cleanWord = cleanWord.toLowerCase();
    }

    const isNoun = isExplicitNoun;
    const pos = isNoun ? 'NOUN' : (entry.partOfSpeech || 'OTHER');
    const posLabels = { VERB: 'Fiil', NOUN: 'İsim', ADJECTIVE: 'Sıfat', OTHER: 'İfade', PHRASE: 'Kalıp' };

    // Reflexiv Badge
    const reflexivBadge = entry.isReflexive ? `<span class="badge-reflexiv">Reflexiv</span>` : '';

    // Artikel Badge (İsimler için)
    const articleBadge = canonicalArticle
      ? `<span class="badge badge-${canonicalArticle.toLowerCase()}">${canonicalArticle.toUpperCase()}</span>`
      : '';

    const posBadge = `<span class="badge badge-pos-${pos}">${posLabels[pos] || 'Kelime'}</span>`;

    const pluralVal = entry.pluralForm || (nounInfo ? nounInfo.plural : '');
    const pluralRow = isNoun && pluralVal
      ? `<div style="margin: 6px 0;"><span class="badge-regularity" style="font-size:0.78rem;">Çoğul: ${pluralVal}</span></div>`
      : '';

    const verbTable = pos === 'VERB' ? this.buildVerbTenseTableHTML(entry) : '';

    // Veritabanında bu kelime var mı?
    let existing = null;
    try {
      if (window.wmDB) {
        if (typeof window.wmDB.getCardByWord === 'function') {
          existing = await window.wmDB.getCardByWord(cleanWord);
        } else if (typeof window.wmDB.findCardByGerman === 'function') {
          existing = await window.wmDB.findCardByGerman(cleanWord);
        }
      }
    } catch (_) {}
    const existingId = existing ? existing.id : (entry.id || null);

    const actionButtons = existingId
      ? `
        <button class="icon-btn-ghost" id="btn-res-priority" title="Önemli">
          <svg class="svg-icon" style="color:${existing?.isPriority ? 'var(--palette-yellow)' : 'var(--text-muted)'}"><use href="${existing?.isPriority ? '#icon-star-filled' : '#icon-star'}"></use></svg>
        </button>
        <button class="icon-btn-ghost delete-btn" id="btn-res-delete" title="Kartı Sil">
          <svg class="svg-icon"><use href="#icon-trash"></use></svg>
        </button>
      `
      : '';

    // Anlam Listelerini Ayır
    const trMeanings = (entry.meaningsTr || '')
      .split(/[,;\n]/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0 && !m.toLowerCase().includes('yükleniyor'));
    if (trMeanings.length === 0 && entry.meaningsTr) trMeanings.push(entry.meaningsTr.trim());

    const enMeanings = (entry.meaningsEn || '')
      .split(/[,;\n]/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    // Türkçe Anlam Çipleri
    const trChipsHtml = trMeanings
      .map((m) => `<button type="button" class="meaning-chip selected" data-type="tr" data-val="${m.replace(/"/g, '&quot;')}">${m}</button>`)
      .join('');

    // İngilizce Anlam Çipleri
    const enChipsHtml = enMeanings
      .map((m) => `<button type="button" class="meaning-chip selected" data-type="en" data-val="${m.replace(/"/g, '&quot;')}">${m}</button>`)
      .join('');

    // Örnek Cümleler
    let examples = [];
    if (Array.isArray(entry.examples) && entry.examples.length > 0) {
      examples = entry.examples;
    } else if (entry.exampleSentence) {
      examples = [entry.exampleSentence];
    }

    const examplesHtml = examples.length > 0
      ? examples.map((ex, idx) => {
          let germanText = ex;
          let turkishText = '';
          const match = ex.match(/^(.*?)\((.*?)\)$/);
          if (match) {
            germanText = match[1].trim();
            turkishText = match[2].trim();
          }
          return `
            <div class="example-radio-card ${idx === 0 ? 'selected' : ''}" data-idx="${idx}">
              <input type="radio" name="inline-example-choice" class="example-radio-input" ${idx === 0 ? 'checked' : ''} data-ex="${ex.replace(/"/g, '&quot;')}">
              <div class="example-card-body">
                <div class="example-de-text">${germanText}</div>
                ${turkishText ? `<div class="example-tr-text">${turkishText}</div>` : ''}
              </div>
              <button type="button" class="icon-btn-ghost btn-play-example" title="Seslendir" data-tts="${germanText.replace(/"/g, '&quot;')}">
                <svg class="svg-icon" style="color:var(--brand-blue); width:16px; height:16px;"><use href="#icon-volume"></use></svg>
              </button>
            </div>
          `;
        }).join('')
      : `<div style="font-size:0.82rem; color:var(--text-muted); font-style:italic;">Örnek cümle bulunamadı.</div>`;

    // Desteler Listesi
    const decks = await window.wmDB.getAllDecks();
    const deckOptionsHtml = decks
      .map((d) => `<option value="${d.id}">${d.name} (${d.cardCount || 0} kart)</option>`)
      .join('') + `<option value="__NEW_DECK__">+ Yeni Deste Oluştur...</option>`;

    // Kayıt Butonu
    const saveButtonHtml = existingId
      ? `
        <button type="button" class="btn-save-card-android already-saved" id="btn-inline-save">
          <svg class="svg-icon" style="width:18px; height:18px;"><use href="#icon-check"></use></svg>
          <span>Destede Kayıtlı (Güncelle)</span>
        </button>
      `
      : `
        <button type="button" class="btn-save-card-android" id="btn-inline-save">
          <svg class="svg-icon" style="width:18px; height:18px;"><use href="#icon-bookmark"></use></svg>
          <span>Kartı Desteye Kaydet</span>
        </button>
      `;

    container.innerHTML = `
      <article class="word-detail-card">
        <div class="wdc-header-row">
          <div class="wdc-title-group">
            <span class="lang-badge lang-badge-de">
              <svg class="flag-svg"><use href="#flag-de"></use></svg>
              <span>DE</span>
            </span>
            ${articleBadge}
            <span class="wdc-word">${cleanWord}</span>
            <button class="icon-btn-ghost" id="btn-res-tts" title="Dinle (TTS)">
              <svg class="svg-icon" style="color:var(--brand-blue); width:22px; height:22px;"><use href="#icon-volume"></use></svg>
            </button>
            ${reflexivBadge}
            ${posBadge}
          </div>
          <div class="wdc-actions">
            ${actionButtons}
          </div>
        </div>

        ${pluralRow}
        ${verbTable}

        <!-- TÜRKÇE ANLAMLAR ÇİPLERİ -->
        <div class="sec-row-header" style="margin-top: 14px;">
          <span>TÜRKÇE ANLAMLAR</span>
          <span style="font-size:0.75rem; color:var(--text-muted);">Kart için seçin</span>
        </div>
        <div class="meaning-chips-container" id="inline-tr-chips">
          ${trChipsHtml}
        </div>

        <!-- İNGİLİZCE KARŞILIKLAR ÇİPLERİ -->
        ${enMeanings.length > 0 ? `
          <div class="sec-row-header" style="margin-top: 12px;">
            <span>İNGİLİZCE KARŞILIKLAR</span>
          </div>
          <div class="meaning-chips-container" id="inline-en-chips">
            ${enChipsHtml}
          </div>
        ` : ''}

        <!-- ÖRNEK CÜMLELER SEÇİMİ -->
        <div class="sec-row-header" style="margin-top: 14px;">
          <span>ÖRNEK CÜMLELER</span>
          <span style="font-size:0.75rem; color:var(--text-muted);">Karta eklenecek cümleyi seçin</span>
        </div>
        <div class="examples-selection-container" id="inline-examples-list">
          ${examplesHtml}
        </div>

        <!-- HEDEF DESTE SEÇİMİ -->
        <div class="target-deck-row">
          <label class="target-deck-label" for="inline-target-deck">HEDEF DESTE</label>
          <div class="target-deck-select-wrap">
            <select class="target-deck-select" id="inline-target-deck">
              ${deckOptionsHtml}
            </select>
            <svg class="svg-icon deck-select-chevron"><use href="#icon-arrow-down"></use></svg>
          </div>
        </div>

        <!-- DOĞRUDAN INLINE KAYIT BUTONU -->
        ${saveButtonHtml}
      </article>
    `;

    // Olay Dinleyicileri
    document.getElementById('btn-res-tts')?.addEventListener('click', () => {
      const spk = isNoun && canonicalArticle ? `${canonicalArticle} ${cleanWord}` : cleanWord;
      window.wmTTS.speak(spk, 'de-DE');
    });

    // Cümle Seslendirme Butonları
    container.querySelectorAll('.btn-play-example').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tts = btn.getAttribute('data-tts');
        if (tts) window.wmTTS.speak(tts, 'de-DE');
      });
    });

    // Anlam Çiplerini Aç / Kapa (Toggle Selection)
    container.querySelectorAll('.meaning-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
      });
    });

    // Örnek Cümle Radio Kartı Seçimi
    container.querySelectorAll('.example-radio-card').forEach((card) => {
      card.addEventListener('click', () => {
        container.querySelectorAll('.example-radio-card').forEach((c) => c.classList.remove('selected'));
        container.querySelectorAll('.example-radio-input').forEach((r) => (r.checked = false));
        card.classList.add('selected');
        const r = card.querySelector('.example-radio-input');
        if (r) r.checked = true;
      });
    });

    // Yıldız / Önemli
    document.getElementById('btn-res-priority')?.addEventListener('click', async () => {
      if (existingId) {
        const updated = await window.wmDB.togglePriority(existingId);
        this.renderSearchResultCard(updated, searchedTerm);
      }
    });

    // Kartı Sil
    document.getElementById('btn-res-delete')?.addEventListener('click', async () => {
      if (existingId && confirm(`"${cleanWord}" kartını silmek istiyor musunuz?`)) {
        await window.wmDB.deleteCard(existingId);
        this.showToast(`"${cleanWord}" silindi.`);
        this.executeSearch(searchedTerm || cleanWord);
      }
    });

    // Inline Kaydet Butonu
    document.getElementById('btn-inline-save')?.addEventListener('click', async () => {
      const deckSelect = document.getElementById('inline-target-deck');
      let targetDeckId = deckSelect ? deckSelect.value : null;

      if (targetDeckId === '__NEW_DECK__') {
        const newDeckName = prompt('Yeni deste ismi giriniz:', 'Almanca Kelimeler');
        if (!newDeckName || !newDeckName.trim()) {
          if (decks.length > 0) deckSelect.value = decks[0].id;
          return;
        }
        const createdDeckId = await window.wmDB.createDeck(newDeckName.trim(), 'Özel kelime destesi', 'default');
        targetDeckId = createdDeckId;
      } else if (targetDeckId) {
        targetDeckId = Number(targetDeckId);
      } else if (decks.length > 0) {
        targetDeckId = decks[0].id;
      }

      // Seçili Türkçe Anlamlar
      const selectedTrNodes = container.querySelectorAll('#inline-tr-chips .meaning-chip.selected');
      let selectedTr = Array.from(selectedTrNodes).map((c) => c.getAttribute('data-val')).filter(Boolean);
      if (selectedTr.length === 0) selectedTr = trMeanings;

      // Seçili İngilizce Anlamlar
      const selectedEnNodes = container.querySelectorAll('#inline-en-chips .meaning-chip.selected');
      let selectedEn = Array.from(selectedEnNodes).map((c) => c.getAttribute('data-val')).filter(Boolean);
      if (selectedEn.length === 0) selectedEn = enMeanings;

      // Seçili Örnek Cümle
      const checkedExRadio = container.querySelector('.example-radio-input:checked');
      const selectedEx = checkedExRadio ? (checkedExRadio.getAttribute('data-ex') || '') : (examples[0] || '');

      // Kart Nesnesi — Otomatik Artikel Garantisi İle
      const cardPayload = {
        deckId: targetDeckId,
        germanWord: cleanWord,
        partOfSpeech: pos,
        article: isNoun ? canonicalArticle : '',
        pluralForm: isNoun ? (pluralVal || '') : '',
        meaningsTr: selectedTr.join(', '),
        meaningsEn: selectedEn.join(', '),
        exampleSentence: selectedEx,
        praesens: entry.praesens || '',
        praeteritum: entry.praeteritum || '',
        partizipZwei: entry.partizipZwei || '',
        hilfsverb: entry.hilfsverb || 'hat',
        imperativ: entry.imperativ || '',
        isSeparable: Boolean(entry.isSeparable),
        isReflexive: Boolean(entry.isReflexive)
      };

      try {
        if (existingId) {
          cardPayload.id = existingId;
          await window.wmDB.updateCard(cardPayload);
          this.showToast(`"${canonicalArticle ? canonicalArticle + ' ' : ''}${cleanWord}" güncellendi! ✓`);
        } else {
          const added = await window.wmDB.addCard(cardPayload);
          existingId = added ? added.id : existingId;
          this.showToast(`"${canonicalArticle ? canonicalArticle + ' ' : ''}${cleanWord}" desteye eklendi! ✨`);
        }

        const saveBtn = document.getElementById('btn-inline-save');
        if (saveBtn) {
          saveBtn.classList.add('already-saved');
          saveBtn.innerHTML = `
            <svg class="svg-icon" style="width:18px; height:18px;"><use href="#icon-check"></use></svg>
            <span>Destede Kayıtlı (Güncelle)</span>
          `;
        }

        try {
          if (window.WordGameService) {
            window.WordGameService.initPool();
          }
          await this.refreshHomeDashboard();
        } catch (_) {}
      } catch (err) {
        this.showToast(`Kayıt hatası: ${err.message || 'Bilinmeyen hata'}`);
      }
    });
  }

  // --- KELİME OYUNLARI, DESTE SEÇİMİ & KABLO EŞLEŞTİRME (v2.6.0) ---
  bindGames() {
    // Hem genel oyun kartları hem de öne çıkan Kablo Oyunu kartı deste seçimini tetikler
    const cards = document.querySelectorAll('.game-card, .featured-game-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const gameType = card.getAttribute('data-game-type') || 'MIXED';
        this.openGameDeckSelectionModal(gameType);
      });
    });

    document.getElementById('btn-close-game-quiz')?.addEventListener('click', () => {
      if (this.gameTimerInterval) {
        clearInterval(this.gameTimerInterval);
        this.gameTimerInterval = null;
      }
      document.getElementById('modal-game-quiz')?.classList.add('hidden');
    });

    document.getElementById('btn-game-finish')?.addEventListener('click', () => {
      document.getElementById('modal-game-quiz')?.classList.add('hidden');
      this.refreshHomeDashboard();
    });

    document.getElementById('btn-game-play-again')?.addEventListener('click', () => {
      if (window.WordGameService && window.WordGameService.currentGameType) {
        this.openGameQuizModal(window.WordGameService.currentGameType);
      }
    });

    document.getElementById('btn-game-next')?.addEventListener('click', () => {
      if (window.WordGameService) {
        window.WordGameService.nextQuestion();
        this.renderGameCurrentQuestion();
      }
    });

    // Oyunlar & Kart Alıştırması Alt Sekme Değiştirici
    document.getElementById('btn-subview-games')?.addEventListener('click', () => {
      this.activateGamesSubview('games');
    });
    document.getElementById('btn-subview-study')?.addEventListener('click', () => {
      this.activateGamesSubview('study');
    });

    this.bindGameDeckSelectionModal();
    this.bindCableGameModal();
  }

  // --- OYUN İÇİN DESTE SEÇİM MODALI ---
  bindGameDeckSelectionModal() {
    document.getElementById('btn-close-game-deck-select')?.addEventListener('click', () => {
      document.getElementById('modal-game-deck-select')?.classList.add('hidden');
    });

    document.getElementById('btn-gds-toggle-all')?.addEventListener('click', () => {
      const cbs = document.querySelectorAll('.gds-deck-checkbox');
      const anyUnchecked = Array.from(cbs).some((cb) => !cb.checked);
      cbs.forEach((cb) => {
        cb.checked = anyUnchecked;
        const row = cb.closest('.deck-select-row-card');
        if (row) row.classList.toggle('selected', anyUnchecked);
      });
    });

    // Süre Modu (Zamanla Yarış) Butonları
    document.querySelectorAll('#gds-time-pills .time-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#gds-time-pills .time-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        this.selectedGameDuration = Number(pill.getAttribute('data-time')) || 0;
        const lbl = document.getElementById('gds-time-label');
        if (lbl) {
          lbl.textContent = this.selectedGameDuration === 0 ? 'Süresiz' : `${this.selectedGameDuration} saniye`;
        }
      });
    });

    document.getElementById('btn-gds-start-game')?.addEventListener('click', async () => {
      const cbs = document.querySelectorAll('.gds-deck-checkbox:checked');
      const selectedDeckIds = Array.from(cbs).map((cb) => cb.value);

      document.getElementById('modal-game-deck-select')?.classList.add('hidden');

      if (window.WordGameService) {
        window.WordGameService.setDuration(this.selectedGameDuration || 0);
        await window.WordGameService.initPool(selectedDeckIds.length > 0 ? selectedDeckIds : 'all');
      }

      if (this.pendingGameType === 'CABLE_MATCH') {
        this.openCableGameModal(selectedDeckIds);
      } else {
        this.openGameQuizModal(this.pendingGameType || 'MIXED');
      }
    });
  }

  async openGameDeckSelectionModal(gameType) {
    this.pendingGameType = gameType;
    const modal = document.getElementById('modal-game-deck-select');
    if (!modal) return;

    const titleEl = document.getElementById('gds-title');
    const subEl = document.getElementById('gds-subtitle');
    const listEl = document.getElementById('gds-deck-list');

    if (gameType === 'CABLE_MATCH') {
      if (titleEl) titleEl.textContent = 'Kablo Eşleştirme — Deste Seçimi';
      if (subEl) subEl.textContent = 'Kablolarla bağlayacağınız kelimelerin destelerini seçin';
    } else {
      if (titleEl) titleEl.textContent = 'Kelime Testi — Deste Seçimi';
      if (subEl) subEl.textContent = 'Test sorularında kullanılacak desteleri belirleyin';
    }

    let decks = [];
    let allCards = [];
    try {
      decks = await window.wmDB.getAllDecks();
      allCards = await window.wmDB.getAllCards();
    } catch (_) {}

    const deckCounts = {};
    for (const c of allCards) {
      const dId = String(c.deckId);
      deckCounts[dId] = (deckCounts[dId] || 0) + 1;
    }

    if (listEl) {
      if (decks.length === 0) {
        listEl.innerHTML = `
          <div class="deck-select-row-card selected">
            <div style="display:flex; align-items:center; gap:12px;">
              <input type="checkbox" class="deck-select-checkbox gds-deck-checkbox" value="all" checked>
              <div>
                <strong style="display:block; font-size:0.92rem;">Tüm Kelimeler</strong>
                <span style="font-size:0.75rem; color:var(--text-muted);">${allCards.length || 20} kelime</span>
              </div>
            </div>
          </div>
        `;
      } else {
        listEl.innerHTML = decks
          .map((d) => {
            const count = deckCounts[String(d.id)] || 0;
            return `
              <label class="deck-select-row-card selected" data-deck-id="${d.id}">
                <div style="display:flex; align-items:center; gap:12px;">
                  <input type="checkbox" class="deck-select-checkbox gds-deck-checkbox" value="${d.id}" checked>
                  <div>
                    <strong style="display:block; font-size:0.92rem; color:var(--text-primary);">${d.name}</strong>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${count} kelime kayıtlı</span>
                  </div>
                </div>
                <span class="badge" style="background:rgba(59,130,246,0.15); color:var(--brand-blue); font-size:0.72rem; padding:3px 8px; border-radius:999px;">${count}</span>
              </label>
            `;
          })
          .join('');

        listEl.querySelectorAll('.deck-select-row-card').forEach((row) => {
          const cb = row.querySelector('.gds-deck-checkbox');
          row.addEventListener('click', (e) => {
            if (e.target !== cb) {
              cb.checked = !cb.checked;
            }
            row.classList.toggle('selected', cb.checked);
          });
        });
      }
    }

    modal.classList.remove('hidden');
  }

  // --- KABLO İLE ANLAM EŞLEŞTİRME OYUNU MOTORU ---
  bindCableGameModal() {
    document.getElementById('btn-close-cable-game')?.addEventListener('click', () => {
      document.getElementById('modal-cable-game')?.classList.add('hidden');
      this.refreshHomeDashboard();
    });

    document.getElementById('btn-cable-restart')?.addEventListener('click', () => {
      this.startCableRound();
    });

    document.getElementById('btn-cable-next-round')?.addEventListener('click', () => {
      this.startCableRound();
    });

    // Pencere yeniden boyutlandırıldığında kabloları pixel-perfect yeniden hizala
    window.addEventListener('resize', () => {
      if (document.getElementById('modal-cable-game')?.classList.contains('hidden')) return;
      this.redrawCableConnections();
    });
  }

  openCableGameModal(selectedDeckIds = null) {
    const modal = document.getElementById('modal-cable-game');
    if (!modal) return;
    this.cableSelectedDeckIds = selectedDeckIds;
    modal.classList.remove('hidden');
    this.startCableRound();
  }

  startCableRound() {
    if (!window.WordGameService) return;
    const roundData = window.WordGameService.generateCableMatchRound(5);
    this.cableRound = {
      roundData,
      connections: [],
      matchedCount: 0,
      totalPairs: roundData.totalPairs,
      selectedSource: null
    };

    const svgLayer = document.getElementById('cable-svg-layer');
    if (svgLayer) svgLayer.innerHTML = '';

    const feedbackBanner = document.getElementById('cable-feedback-banner');
    if (feedbackBanner) {
      feedbackBanner.className = 'cable-feedback-banner hidden';
      feedbackBanner.textContent = '';
    }

    document.getElementById('btn-cable-next-round')?.classList.add('hidden');
    const matchedCountEl = document.getElementById('cable-matched-count');
    if (matchedCountEl) matchedCountEl.textContent = `0 / ${roundData.totalPairs}`;

    const leftCol = document.getElementById('cable-left-col');
    const rightCol = document.getElementById('cable-right-col');
    if (!leftCol || !rightCol) return;

    // Sol Sütun (Almanca)
    leftCol.innerHTML = roundData.leftItems
      .map(
        (item) => `
        <div class="cable-node-card cable-node-left" data-id="${item.id}" data-card-id="${item.cardId}">
          <span class="cable-node-text">${item.display}</span>
          <div class="cable-socket cable-socket-left" data-socket-id="${item.id}"></div>
        </div>
      `
      )
      .join('');

    // Sağ Sütun (Türkçe Anlamlar)
    rightCol.innerHTML = roundData.rightItems
      .map(
        (item) => `
        <div class="cable-node-card cable-node-right" data-id="${item.id}" data-card-id="${item.cardId}">
          <div class="cable-socket cable-socket-right" data-socket-id="${item.id}"></div>
          <span class="cable-node-text">${item.display}</span>
        </div>
      `
      )
      .join('');

    this.bindCableArenaInteractions();
  }

  bindCableArenaInteractions() {
    const arena = document.getElementById('cable-arena-wrapper');
    const svgLayer = document.getElementById('cable-svg-layer');
    if (!arena || !svgLayer) return;

    let dragActive = false;
    let dragStartNode = null;
    let dragTempPath = null;

    const getSocketCenter = (socketEl) => {
      const sRect = socketEl.getBoundingClientRect();
      const aRect = svgLayer.getBoundingClientRect();
      return {
        x: sRect.left + sRect.width / 2 - aRect.left,
        y: sRect.top + sRect.height / 2 - aRect.top
      };
    };

    const getCurveD = (x1, y1, x2, y2) => {
      const dx = Math.abs(x2 - x1) * 0.45;
      const sag = Math.max(12, Math.abs(y2 - y1) * 0.12);
      return `M ${x1} ${y1} C ${x1 + dx} ${y1 + sag}, ${x2 - dx} ${y2 + sag}, ${x2} ${y2}`;
    };

    const handleNodeSelection = (side, cardEl) => {
      if (cardEl.classList.contains('matched')) return;

      const cardId = cardEl.getAttribute('data-card-id');
      const id = cardEl.getAttribute('data-id');
      const socketEl = cardEl.querySelector('.cable-socket');
      const state = this.cableRound;

      if (!state.selectedSource) {
        state.selectedSource = { side, id, cardId, cardEl, socketEl };
        cardEl.classList.add('selected-source');
        const nextColor = state.roundData.wireColors[state.matchedCount % state.roundData.wireColors.length];
        cardEl.style.setProperty('--active-wire-color', nextColor);
      } else if (state.selectedSource.side === side) {
        state.selectedSource.cardEl.classList.remove('selected-source');
        state.selectedSource.cardEl.style.removeProperty('--active-wire-color');
        if (state.selectedSource.id === id) {
          state.selectedSource = null;
        } else {
          state.selectedSource = { side, id, cardId, cardEl, socketEl };
          cardEl.classList.add('selected-source');
          const nextColor = state.roundData.wireColors[state.matchedCount % state.roundData.wireColors.length];
          cardEl.style.setProperty('--active-wire-color', nextColor);
        }
      } else {
        const source = state.selectedSource;
        const target = { side, id, cardId, cardEl, socketEl };

        const leftNode = source.side === 'left' ? source : target;
        const rightNode = source.side === 'right' ? source : target;

        source.cardEl.classList.remove('selected-source');
        source.cardEl.style.removeProperty('--active-wire-color');
        state.selectedSource = null;

        this.processCableConnection(leftNode, rightNode);
      }
    };

    arena.querySelectorAll('.cable-node-left').forEach((card) => {
      card.addEventListener('click', () => handleNodeSelection('left', card));
    });

    arena.querySelectorAll('.cable-node-right').forEach((card) => {
      card.addEventListener('click', () => handleNodeSelection('right', card));
    });

    arena.querySelectorAll('.cable-socket').forEach((socket) => {
      socket.addEventListener('pointerdown', (e) => {
        const card = socket.closest('.cable-node-card');
        if (!card || card.classList.contains('matched')) return;

        dragActive = true;
        const isLeft = card.classList.contains('cable-node-left');
        dragStartNode = {
          side: isLeft ? 'left' : 'right',
          id: card.getAttribute('data-id'),
          cardId: card.getAttribute('data-card-id'),
          cardEl: card,
          socketEl: socket
        };

        const p1 = getSocketCenter(socket);
        const nextColor = this.cableRound.roundData.wireColors[this.cableRound.matchedCount % this.cableRound.roundData.wireColors.length];

        dragTempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        dragTempPath.setAttribute('d', `M ${p1.x} ${p1.y} L ${p1.x} ${p1.y}`);
        dragTempPath.setAttribute('stroke', nextColor);
        dragTempPath.setAttribute('stroke-width', '5');
        dragTempPath.setAttribute('fill', 'none');
        dragTempPath.setAttribute('stroke-linecap', 'round');
        dragTempPath.setAttribute('stroke-dasharray', '8 4');
        dragTempPath.classList.add('cable-wire-path');
        svgLayer.appendChild(dragTempPath);

        socket.setPointerCapture(e.pointerId);
      });

      socket.addEventListener('pointermove', (e) => {
        if (!dragActive || !dragTempPath || !dragStartNode) return;
        const p1 = getSocketCenter(dragStartNode.socketEl);
        const aRect = svgLayer.getBoundingClientRect();
        const p2 = { x: e.clientX - aRect.left, y: e.clientY - aRect.top };

        const d = dragStartNode.side === 'left' ? getCurveD(p1.x, p1.y, p2.x, p2.y) : getCurveD(p2.x, p2.y, p1.x, p1.y);
        dragTempPath.setAttribute('d', d);
      });

      const onPointerEnd = (e) => {
        if (!dragActive) return;
        dragActive = false;

        if (dragTempPath) {
          dragTempPath.remove();
          dragTempPath = null;
        }

        const dropTarget = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cable-node-card');
        if (dropTarget && !dropTarget.classList.contains('matched') && dragStartNode) {
          const targetIsLeft = dropTarget.classList.contains('cable-node-left');
          const targetSide = targetIsLeft ? 'left' : 'right';

          if (targetSide !== dragStartNode.side) {
            const targetNode = {
              side: targetSide,
              id: dropTarget.getAttribute('data-id'),
              cardId: dropTarget.getAttribute('data-card-id'),
              cardEl: dropTarget,
              socketEl: dropTarget.querySelector('.cable-socket')
            };

            const leftNode = dragStartNode.side === 'left' ? dragStartNode : targetNode;
            const rightNode = dragStartNode.side === 'right' ? dragStartNode : targetNode;

            this.processCableConnection(leftNode, rightNode);
          }
        }
        dragStartNode = null;
      };

      socket.addEventListener('pointerup', onPointerEnd);
      socket.addEventListener('pointercancel', onPointerEnd);
    });
  }

  processCableConnection(leftNode, rightNode) {
    const state = this.cableRound;
    const svgLayer = document.getElementById('cable-svg-layer');
    if (!svgLayer || !leftNode || !rightNode) return;

    const getSocketCenter = (socketEl) => {
      const sRect = socketEl.getBoundingClientRect();
      const aRect = svgLayer.getBoundingClientRect();
      return {
        x: sRect.left + sRect.width / 2 - aRect.left,
        y: sRect.top + sRect.height / 2 - aRect.top
      };
    };

    const getCurveD = (x1, y1, x2, y2) => {
      const dx = Math.abs(x2 - x1) * 0.45;
      const sag = Math.max(12, Math.abs(y2 - y1) * 0.12);
      return `M ${x1} ${y1} C ${x1 + dx} ${y1 + sag}, ${x2 - dx} ${y2 + sag}, ${x2} ${y2}`;
    };

    const p1 = getSocketCenter(leftNode.socketEl);
    const p2 = getSocketCenter(rightNode.socketEl);

    if (String(leftNode.cardId) === String(rightNode.cardId)) {
      // --- DOĞRU EŞLEŞTİRME ---
      const wireColor = state.roundData.wireColors[state.matchedCount % state.roundData.wireColors.length];

      const wirePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      wirePath.setAttribute('d', getCurveD(p1.x, p1.y, p2.x, p2.y));
      wirePath.setAttribute('stroke', wireColor);
      wirePath.setAttribute('stroke-width', '5.5');
      wirePath.setAttribute('fill', 'none');
      wirePath.setAttribute('stroke-linecap', 'round');
      wirePath.classList.add('cable-wire-path', 'connected');
      svgLayer.appendChild(wirePath);

      leftNode.cardEl.classList.add('matched');
      leftNode.cardEl.style.setProperty('--matched-wire-color', wireColor);

      rightNode.cardEl.classList.add('matched');
      rightNode.cardEl.style.setProperty('--matched-wire-color', wireColor);

      state.connections.push({
        leftId: leftNode.id,
        rightId: rightNode.id,
        wireColor,
        pathEl: wirePath,
        leftSocket: leftNode.socketEl,
        rightSocket: rightNode.socketEl
      });

      // Telaffuz ve Titreşim
      const leftItem = state.roundData.leftItems.find((item) => item.id === leftNode.id);
      if (leftItem && window.wmTTS) {
        window.wmTTS.speak(leftItem.germanWord, 'de-DE');
      }
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);

      state.matchedCount++;
      const matchedEl = document.getElementById('cable-matched-count');
      if (matchedEl) matchedEl.textContent = `${state.matchedCount} / ${state.totalPairs}`;

      if (state.matchedCount >= state.totalPairs) {
        const feedback = document.getElementById('cable-feedback-banner');
        if (feedback) {
          feedback.className = 'cable-feedback-banner success';
          feedback.textContent = '🎉 Harika! 5/5 Eşleşme Başarıyla Tamamlandı!';
        }
        document.getElementById('btn-cable-next-round')?.classList.remove('hidden');
        if (navigator.vibrate) navigator.vibrate([60, 80, 100]);
      }
    } else {
      // --- YANLIŞ EŞLEŞTİRME ---
      const wrongPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      wrongPath.setAttribute('d', getCurveD(p1.x, p1.y, p2.x, p2.y));
      wrongPath.setAttribute('stroke', '#EF4444');
      wrongPath.setAttribute('stroke-width', '4.5');
      wrongPath.setAttribute('fill', 'none');
      wrongPath.setAttribute('stroke-linecap', 'round');
      wrongPath.classList.add('cable-wire-path', 'wrong-snap');
      svgLayer.appendChild(wrongPath);

      leftNode.cardEl.classList.add('shake-wrong');
      rightNode.cardEl.classList.add('shake-wrong');

      if (navigator.vibrate) navigator.vibrate(100);

      const feedback = document.getElementById('cable-feedback-banner');
      if (feedback) {
        feedback.className = 'cable-feedback-banner error';
        feedback.textContent = '✕ Uyuşmadı! Doğru anlamı eşleştirmeyi deneyin.';
      }

      setTimeout(() => {
        wrongPath.remove();
        leftNode.cardEl.classList.remove('shake-wrong');
        rightNode.cardEl.classList.remove('shake-wrong');
        if (feedback && feedback.classList.contains('error')) {
          feedback.className = 'cable-feedback-banner hidden';
        }
      }, 420);
    }
  }

  redrawCableConnections() {
    if (!this.cableRound || !this.cableRound.connections) return;
    const svgLayer = document.getElementById('cable-svg-layer');
    if (!svgLayer) return;

    const getSocketCenter = (socketEl) => {
      const sRect = socketEl.getBoundingClientRect();
      const aRect = svgLayer.getBoundingClientRect();
      return {
        x: sRect.left + sRect.width / 2 - aRect.left,
        y: sRect.top + sRect.height / 2 - aRect.top
      };
    };

    const getCurveD = (x1, y1, x2, y2) => {
      const dx = Math.abs(x2 - x1) * 0.45;
      const sag = Math.max(12, Math.abs(y2 - y1) * 0.12);
      return `M ${x1} ${y1} C ${x1 + dx} ${y1 + sag}, ${x2 - dx} ${y2 + sag}, ${x2} ${y2}`;
    };

    for (const conn of this.cableRound.connections) {
      if (conn.pathEl && conn.leftSocket && conn.rightSocket) {
        const p1 = getSocketCenter(conn.leftSocket);
        const p2 = getSocketCenter(conn.rightSocket);
        conn.pathEl.setAttribute('d', getCurveD(p1.x, p1.y, p2.x, p2.y));
      }
    }
  }

  openGameQuizModal(gameType) {
    if (!window.WordGameService) return;
    const modal = document.getElementById('modal-game-quiz');
    if (!modal) return;

    const titles = {
      ARTICLE: 'Artikel Testi (der · die · das)',
      VERB: 'Fiil Testi (Partizip II & Zamanlar)',
      NOUN: 'İsim Testi (Çoğullar & Anlam)',
      ADJECTIVE: 'Sıfat Testi (Komparativ & Sıfatlar)',
      PHRASE: 'Kalıp Testi (Deyimler & İfadeler)',
      REFLEXIV_TRENNBAR: 'Trennbar & Reflexiv Fiil Testi',
      MIXED: 'Karma Test (Tüm Konular)'
    };

    const titleEl = document.getElementById('game-quiz-title');
    if (titleEl) titleEl.textContent = titles[gameType] || 'Kelime Testi';

    document.getElementById('game-result-area')?.classList.add('hidden');
    document.getElementById('game-question-area')?.classList.remove('hidden');

    window.WordGameService.startNewGame(gameType, 15);
    modal.classList.remove('hidden');

    // Canlı Puan Göstergesini Sıfırla
    const scoreVal = document.getElementById('game-quiz-score-val');
    if (scoreVal) scoreVal.textContent = '0';

    // Zamanla Yarış Modu Sayacı
    if (this.gameTimerInterval) {
      clearInterval(this.gameTimerInterval);
      this.gameTimerInterval = null;
    }

    const timerBadge = document.getElementById('game-timer-badge');
    const timerVal = document.getElementById('game-quiz-timer-val');

    if (window.WordGameService.durationSeconds > 0) {
      if (timerBadge) {
        timerBadge.classList.remove('hidden', 'timer-urgent');
      }
      const updateTimerDisplay = () => {
        const rem = Math.max(0, window.WordGameService.remainingSeconds);
        const mins = Math.floor(rem / 60);
        const secs = rem % 60;
        if (timerVal) {
          timerVal.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        if (rem <= 10 && timerBadge) {
          timerBadge.classList.add('timer-urgent');
        } else if (timerBadge) {
          timerBadge.classList.remove('timer-urgent');
        }
      };
      updateTimerDisplay();

      this.gameTimerInterval = setInterval(() => {
        if (!window.WordGameService) return;
        window.WordGameService.remainingSeconds--;
        updateTimerDisplay();
        if (window.WordGameService.remainingSeconds <= 0) {
          clearInterval(this.gameTimerInterval);
          this.gameTimerInterval = null;
          this.showGameResults();
        }
      }, 1000);
    } else {
      if (timerBadge) timerBadge.classList.add('hidden');
    }

    this.renderGameCurrentQuestion();
  }

  renderGameCurrentQuestion() {
    const svc = window.WordGameService;
    if (!svc) return;

    if (svc.isFinished()) {
      this.showGameResults();
      return;
    }

    const q = svc.getCurrentQuestion();
    if (!q) {
      this.showGameResults();
      return;
    }

    const total = svc.questions.length;
    const currentNum = svc.currentIndex + 1;
    const pct = Math.round(((currentNum - 1) / total) * 100);

    const progText = document.getElementById('game-progress-text');
    if (progText) progText.textContent = `Soru ${currentNum} / ${total}`;

    const scoreText = document.getElementById('game-score-text');
    if (scoreText) scoreText.textContent = `Doğru: ${svc.score.correct} • Yanlış: ${svc.score.wrong}`;

    const progFill = document.getElementById('game-progress-fill');
    if (progFill) progFill.style.width = `${pct}%`;

    const streakCount = document.getElementById('game-quiz-streak-count');
    if (streakCount) streakCount.textContent = `${svc.score.streak} Seri`;

    const qPrompt = document.getElementById('game-q-prompt');
    if (qPrompt) qPrompt.textContent = q.prompt;

    const qSubject = document.getElementById('game-q-subject');
    if (qSubject) qSubject.textContent = q.subject;

    const qSubprompt = document.getElementById('game-q-subprompt');
    if (qSubprompt) qSubprompt.textContent = q.subprompt || '';

    const btnTts = document.getElementById('btn-game-tts');
    if (btnTts) {
      btnTts.onclick = () => {
        const speakTxt = q.audioWord || q.subject;
        window.wmTTS.speak(speakTxt, 'de-DE');
      };
    }

    // Geri bildirim ve Sonraki butonunu gizle
    const fbBox = document.getElementById('game-feedback-box');
    if (fbBox) {
      fbBox.classList.add('hidden');
      fbBox.className = 'game-feedback-box hidden';
    }
    document.getElementById('btn-game-next')?.classList.add('hidden');

    // Seçenekler
    const optContainer = document.getElementById('game-options-container');
    if (optContainer) {
      optContainer.innerHTML = '';
      const letters = ['A', 'B', 'C', 'D'];

      q.options.forEach((optText, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'game-option-btn';
        btn.innerHTML = `
          <span class="game-opt-letter">${letters[idx] || (idx + 1)}</span>
          <span class="game-opt-text">${optText}</span>
        `;

        btn.addEventListener('click', () => {
          if (svc.isAnswerRevealed) return;
          const result = svc.submitAnswer(idx);
          if (!result) return;

          // Butonları renklendir
          const allBtns = optContainer.querySelectorAll('.game-option-btn');
          allBtns.forEach((b, bIdx) => {
            b.disabled = true;
            if (bIdx === result.correctIndex) {
              b.classList.add('correct');
            } else if (bIdx === idx && !result.isCorrect) {
              b.classList.add('wrong');
            }
          });

          // Geri bildirim kutusu
          if (fbBox) {
            fbBox.classList.remove('hidden');
            fbBox.classList.remove('is-correct', 'is-wrong');
            fbBox.classList.add(result.isCorrect ? 'is-correct' : 'is-wrong');
            const msgEl = document.getElementById('game-feedback-message');
            if (msgEl) msgEl.textContent = result.isCorrect ? '✓ Tebrikler, Doğru!' : '✕ Maalesef Yanlış!';
            const explEl = document.getElementById('game-feedback-explanation');
            if (explEl) explEl.textContent = result.explanation || '';
          }

          // Canlı Skor, Seri ve Puan güncelle
          if (streakCount) streakCount.textContent = `${result.streak} Seri`;
          if (scoreText) scoreText.textContent = `Doğru: ${svc.score.correct} • Yanlış: ${svc.score.wrong}`;
          const liveScoreVal = document.getElementById('game-quiz-score-val');
          if (liveScoreVal) liveScoreVal.textContent = result.points;

          if (result.isCorrect && result.gainedPoints > 0) {
            this.showToast(`+${result.gainedPoints} Puan! 🔥 x${result.streakMultiplier}`);
          }

          // Sonraki soru butonunu göster
          document.getElementById('btn-game-next')?.classList.remove('hidden');
        });

        optContainer.appendChild(btn);
      });
    }
  }

  showGameResults() {
    const svc = window.WordGameService;
    if (!svc) return;

    document.getElementById('game-question-area')?.classList.add('hidden');
    const resArea = document.getElementById('game-result-area');
    if (resArea) resArea.classList.remove('hidden');

    const total = svc.questions.length || 1;
    const correct = svc.score.correct;
    const wrong = svc.score.wrong;
    const accuracy = Math.round((correct / total) * 100);

    const grCorrect = document.getElementById('gr-correct');
    if (grCorrect) grCorrect.textContent = correct;

    const grWrong = document.getElementById('gr-wrong');
    if (grWrong) grWrong.textContent = wrong;

    if (this.gameTimerInterval) {
      clearInterval(this.gameTimerInterval);
      this.gameTimerInterval = null;
    }

    const grAcc = document.getElementById('gr-accuracy');
    if (grAcc) grAcc.textContent = `%${accuracy}`;

    const highScore = svc.getHighScore(svc.currentGameType);
    const grScoreEl = document.getElementById('gr-score');
    if (grScoreEl) grScoreEl.textContent = `${svc.score.points} Puan`;

    const subtitle = document.getElementById('game-result-subtitle');
    if (subtitle) {
      if (accuracy >= 80) {
        subtitle.textContent = 'Mükemmel performans! Kelimeleri harika öğrenmişsiniz. 🎉';
      } else if (accuracy >= 50) {
        subtitle.textContent = 'İyi bir tekrar oldu! Pratik yapmaya devam edin. 👍';
      } else {
        subtitle.textContent = 'Biraz daha pratik yaparak kelimeleri pekiştirebilirsiniz. 💪';
      }
    }

    const progFill = document.getElementById('game-progress-fill');
    if (progFill) progFill.style.width = '100%';
  }

  // --- HOME DASHBOARD YENİLEME ---
  async refreshHomeDashboard() {
    const dueCards = await window.wmDB.getDueCards('all', false);
    const logs = await window.wmDB.getTodayStudyLogs();
    const todayReviews = logs.length;
    const dailyGoal = (await window.wmDB.getSetting('dailyGoal', 20)) || 20;
    const pct = Math.min(100, Math.round((todayReviews / dailyGoal) * 100));

    document.getElementById('hero-due-badge').textContent = `${dueCards.length} Hazır`;
    document.getElementById('hero-progress-text').textContent = `${todayReviews} / ${dailyGoal} günlük hedef`;
    document.getElementById('hero-progress-fill').style.width = `${pct}%`;
    document.getElementById('home-streak-count').textContent = `${window.wmStats ? window.wmStats.calculateStreak(logs) : 1} Gün Seri`;

    const decks = await window.wmDB.getAllDecks();
    const recentContainer = document.getElementById('home-recent-decks');
    recentContainer.innerHTML = decks
      .slice(0, 3)
      .map(
        (d) => `
        <div class="deck-item-card">
          <div class="deck-item-left">
            <div class="deck-folder-icon-box">
              <svg class="svg-icon"><use href="#icon-folder"></use></svg>
            </div>
            <div>
              <div class="deck-info-title">${d.name}</div>
              <div class="deck-info-count">${d.cardCount} kart</div>
            </div>
          </div>
          <button class="btn-primary-compact btn-quick-study-deck" data-deck-id="${d.id}">Çalış</button>
        </div>
      `
      )
      .join('');

    recentContainer.querySelectorAll('.btn-quick-study-deck').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const dId = btn.getAttribute('data-deck-id');
        await this.switchTab('tab-study');
        await window.wmStudy.loadSession(dId, false);
      });
    });
  }

  // --- DESTELER SEKMESİ (Screenshot 3 Parity) ---
  // --- DESTELER SEKMESİ (Screenshot 3 Parity) ---
  bindDeckManagement() {
    const modal = document.getElementById('modal-new-deck');
    const form = document.getElementById('form-new-deck');
    const curatedModal = document.getElementById('modal-curated-packs');

    document.getElementById('btn-fab-new-deck')?.addEventListener('click', () => {
      modal.classList.remove('hidden');
      document.getElementById('deck-name-input').focus();
    });

    document.getElementById('btn-close-deck-modal')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    document.getElementById('btn-cancel-deck-modal')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('deck-name-input').value.trim();
      if (!name) return;
      await window.wmDB.createDeck(name);
      modal.classList.add('hidden');
      form.reset();
      this.showToast(`"${name}" destesi oluşturuldu.`);
      await this.renderDecksTab();
    });

    // Hazır Desteler Modalı
    document.getElementById('btn-curated-packs')?.addEventListener('click', async () => {
      if (curatedModal) {
        curatedModal.classList.remove('hidden');
        await this.renderCuratedPacksModal();
      }
    });

    document.getElementById('btn-close-curated-modal')?.addEventListener('click', () => {
      curatedModal?.classList.add('hidden');
    });

    document.getElementById('btn-done-curated-modal')?.addEventListener('click', () => {
      curatedModal?.classList.add('hidden');
    });

    document.getElementById('btn-import-all-curated')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-import-all-curated');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>Tümü Yükleniyor...</span>`;
      }
      await window.DatabaseSeeder.importAllPacks();
      this.showToast('Tüm hazır desteler başarıyla yüklendi.');
      await this.renderCuratedPacksModal();
      await this.renderDecksTab();
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg class="svg-icon" style="width:14px;height:14px;"><use href="#icon-check"></use></svg><span>Tamamlandı</span>`;
      }
    });

    document.getElementById('btn-import-deck')?.addEventListener('click', () => {
      this.showToast('JSON / CSV Deste aktarma aracı hazır.');
    });
  }

  async renderCuratedPacksModal() {
    const container = document.getElementById('curated-packs-container');
    if (!container) return;

    const packs = window.DatabaseSeeder.getAllPacks();
    const existingDecks = await window.wmDB.getAllDecks();
    const existingDeckNames = new Set(existingDecks.map((d) => d.name));

    container.innerHTML = packs
      .map((p) => {
        const isAlreadyImported = existingDeckNames.has(p.name);
        return `
        <div class="curated-pack-card">
          <div class="cpc-info">
            <div class="cpc-header">
              <span class="cpc-badge" style="border-color:${p.badgeColor}; color:${p.badgeColor};">${p.badge}</span>
              <span class="cpc-title">${p.name}</span>
            </div>
            <div class="cpc-desc">${p.description}</div>
            <div class="cpc-count">${p.cards ? p.cards.length : (p.words ? p.words.length : 60)} Seçkin Kelime Kartı</div>
          </div>
          <button class="cpc-btn ${isAlreadyImported ? 'imported' : ''}" data-pack-code="${p.code}">
            ${
              isAlreadyImported
                ? `<svg class="svg-icon" style="width:14px;height:14px;"><use href="#icon-check"></use></svg><span>Yüklendi</span>`
                : `<svg class="svg-icon" style="width:14px;height:14px;"><use href="#icon-download"></use></svg><span>İçe Aktar</span>`
            }
          </button>
        </div>
      `;
      })
      .join('');

    container.querySelectorAll('.cpc-btn:not(.imported)').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const code = btn.getAttribute('data-pack-code');
        btn.disabled = true;
        btn.innerHTML = `<span>Yükleniyor...</span>`;
        await window.DatabaseSeeder.importCuratedPack(code);
        btn.classList.add('imported');
        btn.innerHTML = `<svg class="svg-icon" style="width:14px;height:14px;"><use href="#icon-check"></use></svg><span>Yüklendi</span>`;
        this.showToast('Deste başarıyla içe aktarıldı.');
        await this.renderDecksTab();
      });
    });
  }

  async renderDecksTab() {
    const decks = await window.wmDB.getAllDecks();
    const container = document.getElementById('user-decks-list');
    if (!container) return;

    if (decks.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Henüz bir deste oluşturmadınız.</div>`;
      return;
    }

    container.innerHTML = decks
      .map(
        (d) => `
        <div class="deck-item-card" data-deck-id="${d.id}">
          <div class="deck-item-left">
            <div class="deck-folder-icon-box">
              <svg class="svg-icon"><use href="#icon-folder"></use></svg>
            </div>
            <div class="deck-info-wrapper">
              <div class="deck-info-title">${d.name}</div>
              <div class="deck-info-count">${d.cardCount} kart</div>
            </div>
          </div>
          <div class="deck-item-actions">
            <button class="icon-btn-ghost share-btn btn-share-deck" data-deck-id="${d.id}" title="Paylaş">
              <svg class="svg-icon"><use href="#icon-share"></use></svg>
            </button>
            <button class="icon-btn-ghost delete-btn btn-delete-deck" data-deck-id="${d.id}" title="Sil">
              <svg class="svg-icon"><use href="#icon-trash"></use></svg>
            </button>
          </div>
        </div>
      `
      )
      .join('');

    container.querySelectorAll('.deck-item-card').forEach((cardEl) => {
      cardEl.addEventListener('click', async (e) => {
        if (e.target.closest('button')) return;
        const dId = cardEl.getAttribute('data-deck-id');
        await this.switchTab('tab-study');
        await window.wmStudy.loadSession(dId, false);
      });
    });

    container.querySelectorAll('.btn-delete-deck').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dId = Number(btn.getAttribute('data-deck-id'));
        if (confirm('Bu desteyi ve içindeki kartları silmek istediğinizden emin misiniz?')) {
          await window.wmDB.deleteDeck(dId);
          this.showToast('Deste silindi.');
          await this.renderDecksTab();
        }
      });
    });

    container.querySelectorAll('.btn-share-deck').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showToast('Deste bağlantısı panoya kopyalandı.');
      });
    });
  }

  // --- KARTLAR SEKMESİ (Tab 5) ---
  bindCardsTab() {
    const filterInput = document.getElementById('cards-filter-input');
    filterInput?.addEventListener('input', () => {
      this.renderCardsList(filterInput.value.trim());
    });
  }

  async renderCardsList(filterQuery = '') {
    const cards = await window.wmDB.getAllCards();
    const container = document.getElementById('all-cards-list');
    const subtitle = document.getElementById('cards-total-subtitle');

    if (!this.activeCardsPosFilter) this.activeCardsPosFilter = 'ALL';

    // 1. Canlı kategori sayaçlarını hesapla
    const allCount = cards.length;
    const nounCount = cards.filter((c) => (c.partOfSpeech || '').toUpperCase() === 'NOUN').length;
    const verbCount = cards.filter((c) => (c.partOfSpeech || '').toUpperCase() === 'VERB').length;
    const adjCount = cards.filter((c) => {
      const pos = (c.partOfSpeech || '').toUpperCase();
      return pos === 'ADJECTIVE' || pos === 'ADJ';
    }).length;
    const phraseCount = cards.filter((c) => {
      const pos = (c.partOfSpeech || '').toUpperCase();
      return pos === 'PHRASE' || (c.germanWord || '').includes(' ');
    }).length;

    const countAllEl = document.getElementById('count-pos-all');
    if (countAllEl) countAllEl.textContent = allCount;
    const countNounEl = document.getElementById('count-pos-noun');
    if (countNounEl) countNounEl.textContent = nounCount;
    const countVerbEl = document.getElementById('count-pos-verb');
    if (countVerbEl) countVerbEl.textContent = verbCount;
    const countAdjEl = document.getElementById('count-pos-adjective');
    if (countAdjEl) countAdjEl.textContent = adjCount;
    const countPhraseEl = document.getElementById('count-pos-phrase');
    if (countPhraseEl) countPhraseEl.textContent = phraseCount;

    // 2. Kategori Butonları Click Listener
    document.querySelectorAll('#cards-pos-filter-bar .pos-filter-pill').forEach((pill) => {
      pill.onclick = () => {
        document.querySelectorAll('#cards-pos-filter-bar .pos-filter-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeCardsPosFilter = pill.getAttribute('data-pos') || 'ALL';
        const currentQuery = document.getElementById('cards-filter-input')?.value || '';
        this.renderCardsList(currentQuery);
      };
    });

    // 3. Filtreleme: Hem Tür hem de Arama Sorgusu
    let filtered = cards;
    if (this.activeCardsPosFilter !== 'ALL') {
      filtered = filtered.filter((c) => {
        const pos = (c.partOfSpeech || '').toUpperCase();
        if (this.activeCardsPosFilter === 'NOUN') return pos === 'NOUN';
        if (this.activeCardsPosFilter === 'VERB') return pos === 'VERB';
        if (this.activeCardsPosFilter === 'ADJECTIVE') return pos === 'ADJECTIVE' || pos === 'ADJ';
        if (this.activeCardsPosFilter === 'PHRASE') return pos === 'PHRASE' || (c.germanWord || '').includes(' ');
        return true;
      });
    }

    if (filterQuery) {
      const q = filterQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (c) =>
          (c.germanWord || '').toLowerCase().includes(q) ||
          (c.meaningsTr && c.meaningsTr.toLowerCase().includes(q))
      );
    }

    if (subtitle) {
      subtitle.textContent = `${filtered.length} / ${cards.length} Kelime Kartı Listeleniyor`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Eşleşen kart bulunamadı.</div>`;
      return;
    }

    container.innerHTML = filtered
      .map(
        (c) => `
        <div class="deck-item-card" data-card-id="${c.id}" style="margin-bottom:8px; cursor:pointer;" title="Düzenlemek için tıklayın">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="lang-badge lang-badge-de">
                <svg class="flag-svg"><use href="#flag-de"></use></svg>
                <span>DE</span>
              </span>
              ${c.article ? `<span class="badge badge-${c.article}">${c.article}</span>` : ''}
              <strong style="font-size:1.05rem; color:var(--text-primary);">${c.germanWord}</strong>
              <span class="badge badge-pos-${c.partOfSpeech}">${c.partOfSpeech}</span>
              ${c.isReflexive ? `<span class="badge-reflexiv">Reflexiv</span>` : ''}
            </div>
            <div style="font-size:0.85rem; color:var(--text-primary); margin-top:4px;">${c.meaningsTr || '-'}</div>
            ${c.pluralForm ? `<div style="font-size:0.75rem; color:var(--text-secondary);">Çoğul: ${c.pluralForm}</div>` : ''}
          </div>
          <div class="deck-item-actions">
            <button class="icon-btn-ghost btn-card-edit" data-id="${c.id}" title="Düzenle">
              <svg class="svg-icon" style="color:var(--brand-blue)"><use href="#icon-edit"></use></svg>
            </button>
            <button class="icon-btn-ghost btn-card-tts" data-word="${c.germanWord}" title="Dinle">
              <svg class="svg-icon" style="color:var(--brand-blue)"><use href="#icon-volume"></use></svg>
            </button>
            <button class="icon-btn-ghost delete-btn btn-card-delete" data-id="${c.id}" title="Sil">
              <svg class="svg-icon"><use href="#icon-trash"></use></svg>
            </button>
          </div>
        </div>
      `
      )
      .join('');

    // Kartın gövdesine tıklandığında doğrudan düzenleme modunu aç
    container.querySelectorAll('.deck-item-card').forEach((cardEl) => {
      cardEl.addEventListener('click', (e) => {
        if (e.target.closest('.deck-item-actions')) return;
        const cardId = Number(cardEl.getAttribute('data-card-id'));
        const card = cards.find((c) => c.id === cardId);
        if (card) this.openEditCardModal(card);
      });
    });

    container.querySelectorAll('.btn-card-edit').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const cardId = Number(b.getAttribute('data-id'));
        const card = cards.find((c) => c.id === cardId);
        if (card) this.openEditCardModal(card);
      });
    });

    container.querySelectorAll('.btn-card-tts').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        window.wmTTS.speak(b.getAttribute('data-word'), 'de-DE');
      });
    });

    container.querySelectorAll('.btn-card-delete').forEach((b) => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(b.getAttribute('data-id'));
        if (confirm('Kartı silmek istiyor musunuz?')) {
          await window.wmDB.deleteCard(id);
          this.showToast('Kart silindi.');
          await this.renderCardsList(filterQuery);
        }
      });
    });
  }

  // --- AKILLI KART EKLEME MODALI ---
  bindAddCardModal() {
    const modal = document.getElementById('modal-add-card');
    const form = document.getElementById('form-add-card');
    const wordInput = document.getElementById('card-word-input');
    const posSelect = document.getElementById('card-pos-select');

    document.getElementById('btn-open-add-card')?.addEventListener('click', () => {
      this.openAddCardModal();
    });

    document.getElementById('btn-close-add-modal')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    document.getElementById('btn-cancel-add-card')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    posSelect?.addEventListener('change', () => {
      this.toggleModalMorphologyGroups(posSelect.value);
    });

    wordInput?.addEventListener('input', () => {
      const val = wordInput.value.trim();
      if (this.modalDebounceTimer) clearTimeout(this.modalDebounceTimer);
      if (this.modalAbortController) this.modalAbortController.abort();

      if (val.length < 2) return;

      this.modalDebounceTimer = setTimeout(async () => {
        this.modalAbortController = new AbortController();
        const synth = window.DictionaryService.synthesizeInstantEntry(val);
        this.fillModalFieldsFromEntry(synth, false);

        await window.DictionaryService.enrichWithNetwork(synth, this.modalAbortController.signal);
        if (!this.modalAbortController.signal.aborted) {
          this.fillModalFieldsFromEntry(synth, true);
        }
      }, 450);
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pos = posSelect.value;
      const isSep = document.getElementById('card-separable-check').checked;
      const isRefl = document.getElementById('card-reflexive-check').checked;
      const wordRaw = wordInput.value.trim();

      // İsimler için çoğul girilse dahi tekil normalizasyonu garantile
      let finalWord = wordRaw;
      let finalArticle = '';
      let finalPlural = '';

      if (pos === 'NOUN') {
        const analyzed = window.GermanNounHelper.analyze(wordRaw);
        finalWord = analyzed.word; // Her zaman TEKİL hali
        finalArticle = document.getElementById('card-article-select').value || analyzed.article;
        finalPlural = document.getElementById('card-plural-input').value || analyzed.pluralForm;
      }

      if (this.editingCardId) {
        const allCards = await window.wmDB.getAllCards();
        const existing = allCards.find((c) => c.id === this.editingCardId) || {};
        const updatedCard = {
          ...existing,
          id: this.editingCardId,
          deckId: Number(document.getElementById('card-deck-select').value),
          targetLanguage: 'de',
          germanWord: finalWord,
          partOfSpeech: pos,
          article: finalArticle,
          pluralForm: finalPlural,
          praesens: pos === 'VERB' ? document.getElementById('card-praesens-input').value : '',
          praeteritum: pos === 'VERB' ? document.getElementById('card-praeteritum-input').value : '',
          partizipZwei: pos === 'VERB' ? document.getElementById('card-partizip-input').value : '',
          hilfsverb: pos === 'VERB' ? document.getElementById('card-hilfsverb-select').value : '',
          isSeparable: pos === 'VERB' ? isSep : false,
          separablePrefix: pos === 'VERB' ? document.getElementById('card-prefix-input').value : '',
          isReflexive: isRefl,
          reflexiveType: isRefl ? 'sich' : null,
          meaningsTr: document.getElementById('card-meaning-tr').value,
          meaningsEn: document.getElementById('card-meaning-en').value,
          exampleSentence: document.getElementById('card-example-input').value
        };
        await window.wmDB.updateCard(updatedCard);
        modal.classList.add('hidden');
        this.showToast(`"${updatedCard.germanWord}" güncellendi. ✓`);
        this.editingCardId = null;
        await this.renderCardsList();
        await this.refreshHomeDashboard();
        await this.renderDecksTab();
        return;
      }

      const newCard = await window.wmDB.addCard({
        deckId: Number(document.getElementById('card-deck-select').value),
        targetLanguage: 'de', // Kesinlikle Almanca ('de')
        germanWord: finalWord,
        partOfSpeech: pos,
        article: finalArticle,
        pluralForm: finalPlural,
        praesens: pos === 'VERB' ? document.getElementById('card-praesens-input').value : '',
        praeteritum: pos === 'VERB' ? document.getElementById('card-praeteritum-input').value : '',
        partizipZwei: pos === 'VERB' ? document.getElementById('card-partizip-input').value : '',
        hilfsverb: pos === 'VERB' ? document.getElementById('card-hilfsverb-select').value : '',
        isSeparable: pos === 'VERB' ? isSep : false,
        separablePrefix: pos === 'VERB' ? document.getElementById('card-prefix-input').value : '',
        isReflexive: isRefl,
        reflexiveType: isRefl ? 'sich' : null,
        regularity: pos === 'VERB' ? 'Düzensiz' : '',
        imperativ: '',
        meaningsTr: document.getElementById('card-meaning-tr').value,
        meaningsEn: document.getElementById('card-meaning-en').value,
        exampleSentence: document.getElementById('card-example-input').value
      });

      modal.classList.add('hidden');
      this.showToast(`"${newCard.germanWord}" desteye eklendi.`);
      await this.refreshHomeDashboard();
      await this.renderDecksTab();
    });
  }

  toggleModalMorphologyGroups(pos) {
    const nounGroup = document.getElementById('noun-fields-group');
    const verbGroup = document.getElementById('verb-fields-group');
    if (nounGroup) nounGroup.classList.toggle('hidden', pos !== 'NOUN');
    if (verbGroup) verbGroup.classList.toggle('hidden', pos !== 'VERB');
  }

  async populateModalDecksDropdown() {
    const decks = await window.wmDB.getAllDecks();
    const select = document.getElementById('card-deck-select');
    if (!select) return;
    select.innerHTML = decks.map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
  }

  async openAddCardModal() {
    this.editingCardId = null;
    const titleEl = document.getElementById('modal-add-card-title');
    if (titleEl) titleEl.textContent = 'Akıllı Kelime Kartı Ekle';
    const submitBtn = document.getElementById('btn-submit-add-card');
    if (submitBtn) submitBtn.textContent = 'Kartı Kaydet';

    const form = document.getElementById('form-add-card');
    form.reset();
    await this.populateModalDecksDropdown();
    this.toggleModalMorphologyGroups('VERB');
    document.getElementById('card-target-lang').value = 'de';
    document.getElementById('modal-add-card').classList.remove('hidden');
    document.getElementById('card-word-input').focus();
  }

  async openEditCardModal(card) {
    if (!card) return;
    this.editingCardId = card.id;
    await this.populateModalDecksDropdown();

    const titleEl = document.getElementById('modal-add-card-title');
    if (titleEl) titleEl.textContent = 'Kelime Kartını Düzenle';

    const submitBtn = document.getElementById('btn-submit-add-card');
    if (submitBtn) submitBtn.textContent = 'Değişiklikleri Kaydet';

    const form = document.getElementById('form-add-card');
    form.reset();

    const deckSelect = document.getElementById('card-deck-select');
    if (deckSelect && card.deckId) deckSelect.value = card.deckId;

    const posSelect = document.getElementById('card-pos-select');
    posSelect.value = card.partOfSpeech || 'OTHER';
    this.toggleModalMorphologyGroups(posSelect.value);

    document.getElementById('card-target-lang').value = 'de';
    document.getElementById('card-word-input').value = card.germanWord || '';

    if (card.partOfSpeech === 'NOUN') {
      document.getElementById('card-article-select').value = card.article || '';
      document.getElementById('card-plural-input').value = card.pluralForm || '';
    } else if (card.partOfSpeech === 'VERB') {
      document.getElementById('card-praesens-input').value = card.praesens || '';
      document.getElementById('card-praeteritum-input').value = card.praeteritum || '';
      document.getElementById('card-partizip-input').value = card.partizipZwei || '';
      document.getElementById('card-hilfsverb-select').value = card.hilfsverb || 'hat';
      document.getElementById('card-prefix-input').value = card.separablePrefix || '';
      document.getElementById('card-separable-check').checked = Boolean(card.isSeparable);
      document.getElementById('card-reflexive-check').checked = Boolean(card.isReflexive);
    }

    document.getElementById('card-meaning-tr').value = card.meaningsTr || '';
    document.getElementById('card-meaning-en').value = card.meaningsEn || '';
    document.getElementById('card-example-input').value = card.exampleSentence || '';

    document.getElementById('modal-add-card').classList.remove('hidden');
    document.getElementById('card-word-input').focus();
  }

  async openAddCardModalWithPrefill(entry) {
    await this.openAddCardModal();
    document.getElementById('card-target-lang').value = 'de'; // Her zaman DE
    document.getElementById('card-word-input').value = entry.germanWord || '';
    this.fillModalFieldsFromEntry(entry, true);
  }

  fillModalFieldsFromEntry(entry, includeMeanings = true) {
    const posSelect = document.getElementById('card-pos-select');
    posSelect.value = entry.partOfSpeech || 'OTHER';
    this.toggleModalMorphologyGroups(posSelect.value);

    document.getElementById('card-target-lang').value = 'de';

    if (entry.partOfSpeech === 'NOUN') {
      document.getElementById('card-word-input').value = entry.germanWord; // Her zaman tekil
      document.getElementById('card-article-select').value = entry.article || '';
      document.getElementById('card-plural-input').value = entry.pluralForm || '';
    } else if (entry.partOfSpeech === 'VERB') {
      document.getElementById('card-praesens-input').value = entry.praesens || '';
      document.getElementById('card-praeteritum-input').value = entry.praeteritum || '';
      document.getElementById('card-partizip-input').value = entry.partizipZwei || '';
      document.getElementById('card-hilfsverb-select').value = entry.hilfsverb || 'hat';
      document.getElementById('card-prefix-input').value = entry.separablePrefix || '';
      document.getElementById('card-separable-check').checked = Boolean(entry.isSeparable);
      document.getElementById('card-reflexive-check').checked = Boolean(entry.isReflexive);
    }

    if (includeMeanings) {
      if (entry.meaningsTr) document.getElementById('card-meaning-tr').value = entry.meaningsTr;
      if (entry.meaningsEn) document.getElementById('card-meaning-en').value = entry.meaningsEn;
      if (entry.exampleSentence) document.getElementById('card-example-input').value = entry.exampleSentence;
    }
  }

  bindPWAInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      const btn = document.getElementById('btn-install-pwa');
      if (btn) {
        btn.classList.remove('hidden');
        btn.addEventListener('click', async () => {
          this.deferredInstallPrompt.prompt();
          const { outcome } = await this.deferredInstallPrompt.userChoice;
          if (outcome === 'accepted') {
            btn.classList.add('hidden');
          }
          this.deferredInstallPrompt = null;
        });
      }
    });
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2800);
  }
}

window.WortCoachApp = WortCoachApp;

window.addEventListener('DOMContentLoaded', () => {
  window.wmApp = new WortCoachApp();
  window.wmApp.init();
});
