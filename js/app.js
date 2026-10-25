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
    this.activeTabId = 'tab-home';
    this.routeHistoryStack = [];
    this.isHandlingRoute = false;
  }

  async init() {
    await window.wmDB.init();
    await window.DatabaseSeeder.seedIfNeeded();

    await this.initTheme();
    this.loadAllCustomMeaningsIntoOfflineDict();
    this.bindNavigation();
    this.bindSearchEngine();
    this.bindAddCardModal();
    this.bindDeckManagement();
    this.bindCardsTab();
    this.bindImportDeckModal();
    this.bindPWAInstall();
    this.initUmlautBars();

    this.bindSettingsModal();
    this.bindGames();
    this.bindPronunciationCoach();
    if (window.WordGameService) {
      window.WordGameService.initPool();
    }

    window.wmTranslator.init();
    this.bindSmartReader();
    window.wmStudy.init();
    if (window.wmStats) window.wmStats.init();

    await this.refreshHomeDashboard();
    await this.renderDecksTab();
    await this.initRouter();
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

    // Opsiyonel Azure Speech Pronunciation Assessment Ayarı
    const azureKeyInput = document.getElementById('input-azure-speech-key');
    const azureRegionInput = document.getElementById('input-azure-speech-region');
    const azureStatus = document.getElementById('azure-speech-status');
    const azureSaveBtn = document.getElementById('btn-save-azure-key');
    const settingsEngineSelect = document.getElementById('select-settings-phonetic-engine');

    const updateAzureUI = () => {
      const curKey = localStorage.getItem('azure_speech_key') || '';
      const curReg = localStorage.getItem('azure_speech_region') || 'westeurope';
      const curEng = window.wmPronunciation ? window.wmPronunciation.getSelectedEngine() : 'HYBRID_ENSEMBLE';
      if (azureKeyInput) azureKeyInput.value = curKey;
      if (azureRegionInput) azureRegionInput.value = curReg;
      if (settingsEngineSelect) settingsEngineSelect.value = curEng;
      if (azureStatus) {
        const meta = window.wmPronunciation ? window.wmPronunciation.getSelectedEngineMeta() : null;
        azureStatus.textContent = meta ? `${meta.shortLabel} ✓` : 'Aktif ✓';
        azureStatus.style.color = '#10B981';
      }
    };
    updateAzureUI();

    settingsEngineSelect?.addEventListener('change', () => {
      if (window.wmPronunciation) {
        window.wmPronunciation.setSelectedEngine(settingsEngineSelect.value);
        const meta = window.wmPronunciation.getSelectedEngineMeta();
        this.showToast(`Fonetik Motoru: ${meta.shortLabel} seçildi.`);
      }
      updateAzureUI();
      this.syncPronunciationEngineSelectorUI();
    });

    azureSaveBtn?.addEventListener('click', () => {
      const keyVal = (azureKeyInput?.value || '').trim();
      const regVal = (azureRegionInput?.value || 'westeurope').trim() || 'westeurope';
      localStorage.setItem('azure_speech_region', regVal);
      if (keyVal) {
        localStorage.setItem('azure_speech_key', keyVal);
        if (window.wmPronunciation) window.wmPronunciation.setSelectedEngine('AZURE_CLOUD');
        this.showToast('Azure Speech GOP anahtarı kaydedildi ve aktif edildi! ✓');
      } else {
        localStorage.removeItem('azure_speech_key');
        this.showToast('Yerleşik ücretsiz Fonetik Motoru aktif.');
      }
      updateAzureUI();
      this.syncPronunciationEngineSelectorUI();
    });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.update());
        });
      }
      navigator.serviceWorker.register('./sw.js?v=3.0.0').then((reg) => reg.update()).catch(() => {});
    }
  }

  // --- KULLANICI ÖZEL ANLAM DEPOSU (localStorage / IndexedDB customMeanings) ---
  getCustomMeaningsMap() {
    try {
      const raw = localStorage.getItem('customMeanings') || localStorage.getItem('wm_custom_meanings_v1');
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  getCustomMeaningsForWord(word) {
    const key = (word || '').trim().toLowerCase();
    if (!key) return [];
    const map = this.getCustomMeaningsMap();
    return Array.isArray(map[key]) ? map[key] : [];
  }

  async saveCustomMeaningForWord(word, meaning) {
    const key = (word || '').trim().toLowerCase();
    const cleanMeaning = (meaning || '').trim();
    if (!key || !cleanMeaning) return [];

    const map = this.getCustomMeaningsMap();
    const list = Array.isArray(map[key]) ? map[key] : [];
    if (!list.some((m) => m.toLowerCase() === cleanMeaning.toLowerCase())) {
      list.push(cleanMeaning);
    }
    map[key] = list;
    try {
      localStorage.setItem('customMeanings', JSON.stringify(map));
      localStorage.setItem('wm_custom_meanings_v1', JSON.stringify(map));
    } catch (_) {}

    // İlgili kelime IndexedDB'de kart olarak kayıtlıysa customMeanings alanına ekle
    try {
      if (window.wmDB) {
        const existingCard = await window.wmDB.getCardByWord(key);
        if (existingCard) {
          existingCard.customMeanings = list;
          await window.wmDB.updateCard(existingCard);
        }
      }
    } catch (_) {}

    // Yerel sözlük verisine de kalıcı olarak ekle
    this.mergeCustomMeaningsIntoOfflineDictEntry(word, list);
    return list;
  }

  mergeCustomMeaningsIntoOfflineDictEntry(word, customList) {
    if (!window.OFFLINE_DICTIONARY || !Array.isArray(customList) || customList.length === 0) return;
    const raw = (word || '').trim();
    const lower = raw.toLowerCase();
    const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
    const keys = [raw, lower, cap];

    for (const k of keys) {
      const dictEntry = window.OFFLINE_DICTIONARY[k];
      if (dictEntry && typeof dictEntry === 'object') {
        const existingParts = (dictEntry.tr || dictEntry.meaningsTr || '')
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const cm of customList) {
          if (!existingParts.some((p) => p.toLowerCase() === cm.toLowerCase())) {
            existingParts.push(cm);
          }
        }
        const joined = existingParts.join(', ');
        if ('tr' in dictEntry) dictEntry.tr = joined;
        if ('meaningsTr' in dictEntry) dictEntry.meaningsTr = joined;
      }
    }
  }

  loadAllCustomMeaningsIntoOfflineDict() {
    const map = this.getCustomMeaningsMap();
    for (const [wordKey, list] of Object.entries(map)) {
      this.mergeCustomMeaningsIntoOfflineDictEntry(wordKey, list);
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
      metaTheme.setAttribute('content', theme === 'dark' ? '#0B0D12' : '#F5F6F0');
    }

    const iconUse = document.querySelector('#theme-icon-svg use');
    if (iconUse) {
      iconUse.setAttribute('href', theme === 'dark' ? '#icon-sun' : '#icon-moon');
    }
  }

  // --- GERÇEK SAYFA YÖNLENDİRMESİ (HISTORY API / SPA ROUTER) ---
  getTabRouteMap() {
    return {
      'tab-home': '/sozluk',
      'tab-translate': '/ceviri',
      'tab-games': '/oyunlar',
      'tab-decks': '/desteler',
      'tab-cards': '/kelimeler',
      'tab-study': '/tekrar'
    };
  }

  getRouteToTabMap() {
    return {
      '/': 'tab-home',
      '/sozluk': 'tab-home',
      '/ceviri': 'tab-translate',
      '/oyunlar': 'tab-games',
      '/desteler': 'tab-decks',
      '/kelimeler': 'tab-cards',
      '/tekrar': 'tab-study'
    };
  }

  pushRoute(routePath, stateObj = {}, replace = false) {
    if (this.isHandlingRoute) return;
    const normalizedPath = routePath.startsWith('/') ? routePath : `/${routePath}`;
    const targetHash = `#${normalizedPath}`;
    const currentHash = window.location.hash || '#/sozluk';

    if (!replace && currentHash !== targetHash) {
      this.routeHistoryStack.push(currentHash);
    }

    try {
      if (replace) {
        window.history.replaceState({ route: normalizedPath, ...stateObj }, '', targetHash);
      } else if (currentHash !== targetHash) {
        window.history.pushState({ route: normalizedPath, ...stateObj }, '', targetHash);
      }
    } catch (_) {
      window.location.hash = targetHash;
    }
  }

  async closeAllFullScreenPages() {
    if (this.gameTimerInterval) {
      clearInterval(this.gameTimerInterval);
      this.gameTimerInterval = null;
    }
    if (window.wmPronunciation && window.wmPronunciation.isRecording) {
      try {
        await window.wmPronunciation.stopRecording();
      } catch (_) {}
    }
    this.resetPronunciationRecorderUI?.();
    document.getElementById('modal-pronunciation-coach')?.classList.add('hidden');
    document.getElementById('modal-game-deck-select')?.classList.add('hidden');
    document.getElementById('modal-game-quiz')?.classList.add('hidden');
    document.getElementById('modal-cable-game')?.classList.add('hidden');
  }

  navigateBack(fallbackTabId = 'tab-home') {
    if (this.routeHistoryStack.length > 0) {
      this.routeHistoryStack.pop();
      window.history.back();
    } else {
      this.switchTab(fallbackTabId);
    }
  }

  async initRouter() {
    window.addEventListener('popstate', async () => {
      await this.handleCurrentRoute();
    });

    // İlk yüklemede URL'yi kontrol et (F5 yenilemede mevcut ekranı koru)
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      // Pathname üzerinden doğrudan gelindiyse (/sozluk, /oyunlar vb.) onu yakala
      const pathPart = window.location.pathname.replace(/^\/WortCoach/i, '').replace(/\/index\.html$/i, '') || '/sozluk';
      const initialRoute = pathPart === '/' ? '/sozluk' : pathPart;
      this.pushRoute(initialRoute, {}, true);
    }
    await this.handleCurrentRoute();
  }

  async handleCurrentRoute() {
    this.isHandlingRoute = true;
    try {
      const rawHash = (window.location.hash || '#/sozluk').replace(/^#/, '');
      const [pathPart, queryString] = rawHash.split('?');
      const cleanPath = pathPart || '/sozluk';
      const params = new URLSearchParams(queryString || '');

      await this.closeAllFullScreenPages();

      // 1. Alt ekran: /fonetik-koc/:word
      if (cleanPath.startsWith('/fonetik-koc/')) {
        const encodedWord = cleanPath.slice('/fonetik-koc/'.length);
        const decodedWord = decodeURIComponent(encodedWord || '').trim();
        await this.switchTab(this.activeTabId || 'tab-home', { skipRoutePush: true, keepFullScreenPages: true });

        if (decodedWord === 'antrenman') {
          await this.startPronunciationTrainerSession(null, { skipRoutePush: true });
        } else if (decodedWord) {
          let entry = null;
          if (window.wmDB) {
            entry = await window.wmDB.getCardByWord(decodedWord);
          }
          if (!entry && window.DictionaryService) {
            entry = window.DictionaryService.synthesizeInstantEntry(decodedWord);
          }
          if (!entry) {
            entry = { germanWord: decodedWord, partOfSpeech: 'OTHER', meaningsTr: '' };
          }
          const mode = params.get('mode') === 'sentence' ? 'sentence' : 'word';
          this.openPronunciationCoach(entry, mode, { skipRoutePush: true });
        }
        return;
      }

      // 2. Alt ekran: /oyunlar/:gameType
      if (cleanPath.startsWith('/oyunlar/')) {
        const gameSub = decodeURIComponent(cleanPath.slice('/oyunlar/'.length) || '').trim();
        await this.switchTab('tab-games', { skipRoutePush: true, keepFullScreenPages: true });

        if (gameSub.startsWith('secim-')) {
          const gType = gameSub.replace(/^secim-/, '') || 'MIXED';
          await this.openGameDeckSelectionModal(gType, { skipRoutePush: true });
        } else if (gameSub === 'CABLE_MATCH') {
          this.openCableGameModal(this.cableSelectedDeckIds || null, { skipRoutePush: true });
        } else if (gameSub === 'PRONUNCIATION_TRAINER') {
          await this.startPronunciationTrainerSession(null, { skipRoutePush: true });
        } else if (gameSub) {
          if (window.WordGameService && (!window.WordGameService.poolCards || window.WordGameService.poolCards.length === 0)) {
            await window.WordGameService.initPool('all');
          }
          this.openGameQuizModal(gameSub, { skipRoutePush: true });
        }
        return;
      }

      // 3. Ana Sekmeler: /sozluk, /ceviri, /oyunlar, /desteler, /kelimeler, /tekrar
      const routeToTab = this.getRouteToTabMap();
      const targetTab = routeToTab[cleanPath] || 'tab-home';
      await this.switchTab(targetTab, { skipRoutePush: true });

      if (targetTab === 'tab-home') {
        const q = params.get('q');
        const searchInput = document.getElementById('global-search-input');
        if (q && searchInput) {
          if (searchInput.value.trim().toLowerCase() !== q.trim().toLowerCase()) {
            searchInput.value = q;
          }
          this.executeSearch(q, { skipRoutePush: true });
        }
      }
    } finally {
      this.isHandlingRoute = false;
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

  async switchTab(tabId, options = {}) {
    if (!options.keepFullScreenPages) {
      await this.closeAllFullScreenPages();
    }

    this.activeTabId = tabId;
    document.querySelectorAll('.tab-view').forEach((sec) => sec.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-target') === tabId);
    });

    const targetEl = document.getElementById(tabId);
    if (targetEl) targetEl.classList.add('active');

    if (!options.skipRoutePush) {
      const tabRouteMap = this.getTabRouteMap();
      let routePath = tabRouteMap[tabId] || '/sozluk';
      if (tabId === 'tab-home') {
        const curQ = document.getElementById('global-search-input')?.value?.trim();
        if (curQ) {
          routePath = `/sozluk?q=${encodeURIComponent(curQ)}`;
        }
      }
      this.pushRoute(routePath, { tabId });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tabId === 'tab-home') {
      await this.refreshHomeDashboard();
    } else if (tabId === 'tab-study') {
      if (window.wmStudy) {
        await window.wmStudy.loadSession(window.wmStudy.deckSelect ? window.wmStudy.deckSelect.value : 'all', false);
      }
    } else if (tabId === 'tab-games') {
      // Kelime Oyunları sekmesi aktif
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
        this.pushRoute('/sozluk', { tabId: 'tab-home' }, true);
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
      this.pushRoute('/sozluk', { tabId: 'tab-home' }, true);
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

  async executeSearch(query, options = {}) {
    const statusBar = document.getElementById('search-status-bar');
    const resultsContainer = document.getElementById('search-results-container');
    const homeDashboard = document.getElementById('home-dashboard');

    if (!options.skipRoutePush && query && query.trim()) {
      this.pushRoute(`/sozluk?q=${encodeURIComponent(query.trim())}`, { tabId: 'tab-home', q: query.trim() }, true);
    }

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
      // 4 Aşamalı Akıllı Arama Boru Hattı (Exact -> Stem -> Levenshtein -> DeepL Fallback)
      let pipelineResult = null;
      if (typeof window.executeSmartSearchPipeline === 'function') {
        pipelineResult = await window.executeSmartSearchPipeline(query, signal);
      }

      if (signal.aborted) return;

      if (!pipelineResult) {
        // Fallback: Eski doğrudan arama
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
        return;
      }

      statusBar?.classList.add('hidden');

      if (pipelineResult.status === 'exact' || pipelineResult.status === 'stem') {
        const entry = pipelineResult.entry;
        this.currentSearchEntry = entry;
        await this.renderSearchResultCard(entry, query, {
          stem: pipelineResult.stem,
          similarWords: pipelineResult.similarWords || []
        });

        // Arka planda örnek cümleler ve Wiktionary morfolojisi ile zenginleştir
        if (!entry.isSaved && (!entry.examples || entry.examples.length === 0 || !entry.meaningsTr)) {
          window.DictionaryService.enrichWithNetwork(entry, signal).then(async (enriched) => {
            if (!signal.aborted && this.currentSearchEntry === entry) {
              this.currentSearchEntry = enriched;
              await this.renderSearchResultCard(enriched, query, {
                stem: pipelineResult.stem,
                similarWords: pipelineResult.similarWords || []
              });
            }
          }).catch(() => {});
        }
      } else if (pipelineResult.status === 'deepl_fallback') {
        // 4. Aşama: DeepL Fallback Dinamik Kart Arayüzü
        await this.renderDeeplFallbackCard({
          query: pipelineResult.originalQuery || query,
          translation: pipelineResult.translatedText,
          similarWords: pipelineResult.similarWords || []
        });
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

  /**
   * Yerel sözlükte bulunamayıp DeepL ile çevrilen kelimeler için Dinamik Kelime Kartı Arayüzü (UI)
   */
  async renderDeeplFallbackCard({ query, translation, similarWords = [] }) {
    const container = document.getElementById('search-results-container');
    if (!container) return;

    const cleanWord = (query || '').trim();
    const safeWord = cleanWord.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const initialTranslation = (translation || '').trim();

    // 2. Bunu Mu Demek İstediniz? Şeridi (Varsa)
    const didYouMeanHtml = similarWords && similarWords.length > 0
      ? `
        <div class="did-you-mean-bar">
          <span class="dym-label">
            <svg class="svg-icon" style="width:16px; height:16px; color:#FBBF24;"><use href="#icon-bolt"></use></svg>
            <span>🔍 Bunu mu demek istediniz:</span>
          </span>
          <div class="did-you-mean-chips">
            ${similarWords.map((w) => `<button type="button" class="btn-dym-chip" data-word="${w}">${w}</button>`).join('')}
          </div>
        </div>
      `
      : '';

    // Kullanıcının bu kelimeye eklediği özel anlamlar
    const savedCustomMeanings = this.getCustomMeaningsForWord(cleanWord);
    const existingCards = await window.wmDB.getCardsByExactWord(cleanWord);
    const existing = existingCards && existingCards.length > 0 ? existingCards[0] : null;

    // Desteler Listesi
    const decks = await window.wmDB.getAllDecks();
    const currentCardDeckId = existing ? Number(existing.deckId) : null;
    const deckOptionsHtml = decks
      .map((d) => `<option value="${d.id}" ${currentCardDeckId === Number(d.id) ? 'selected' : ''}>${d.name} (${d.cardCount || 0} kart)</option>`)
      .join('') + `<option value="__NEW_DECK__">+ Yeni Deste Oluştur...</option>`;

    // DeepL çevirilerini parçala ve varsayılan olarak seçili yap
    const initialParts = initialTranslation
      ? initialTranslation.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
      : ['Çeviri bulunamadı'];

    const meaningChips = [];
    initialParts.forEach((m, idx) => {
      meaningChips.push({ text: m, selected: true, isCustom: false });
    });
    savedCustomMeanings.forEach((cm) => {
      if (!meaningChips.some((x) => x.text.toLowerCase() === cm.toLowerCase())) {
        meaningChips.push({ text: cm, selected: true, isCustom: true });
      }
    });

    const trChipsHtml = meaningChips.map((m, idx) => `
      <div class="meaning-chip ${m.selected ? 'selected' : ''}" data-idx="${idx}" data-val="${m.text.replace(/"/g, '&quot;')}">
        <span class="meaning-chip-check">${m.selected ? '✓' : ''}</span>
        <span class="meaning-chip-text">${m.text}</span>
      </div>
    `).join('');

    container.innerHTML = `
      ${didYouMeanHtml}
      <article class="word-detail-card">
        <!-- 1. Bilgi ve Durum Rozeti (Header Badge) -->
        <div class="deepl-fallback-banner">
          <span class="dfb-icon">⚡</span>
          <span>No matches found in local dictionary · Translated by DeepL</span>
        </div>

        <!-- 3. Kelime Başlığı + TTS + Fonetik Koç -->
        <div class="wdc-header-row">
          <div class="wdc-title-group">
            <span class="lang-badge lang-badge-de">
              <svg class="flag-svg"><use href="#flag-de"></use></svg>
              <span>DE</span>
            </span>
            <span id="fallback-article-badge"></span>
            <span class="wdc-word" style="color:#F3F4F6;">${safeWord}</span>
          </div>
          <div class="wdc-actions">
            <button class="icon-btn-ghost" id="btn-fallback-tts" title="Dinle (TTS)">
              <svg class="svg-icon" style="color:var(--brand-blue); width:22px; height:22px;"><use href="#icon-volume"></use></svg>
            </button>
            <button class="icon-btn-ghost btn-mic-trigger" id="btn-fallback-pronounce" title="Telaffuzunu Test Et">
              <svg class="svg-icon" style="color:#10B981; width:21px; height:21px;"><use href="#icon-mic"></use></svg>
            </button>
          </div>
        </div>

        <!-- Opsiyonel Artikel & Tür Seçici Satırı -->
        <div class="fallback-classifier-row">
          <div class="classifier-group">
            <span class="classifier-label">Artikel:</span>
            <div class="classifier-btn-group" id="fallback-article-selectors">
              <button type="button" class="btn-classifier-pill" data-art="der">der</button>
              <button type="button" class="btn-classifier-pill" data-art="die">die</button>
              <button type="button" class="btn-classifier-pill" data-art="das">das</button>
              <button type="button" class="btn-classifier-pill active" data-art="">Yok</button>
            </div>
          </div>
          <div class="classifier-group">
            <span class="classifier-label">Tür:</span>
            <div class="classifier-btn-group" id="fallback-pos-selectors">
              <button type="button" class="btn-classifier-pill active" data-pos="OTHER">Genel</button>
              <button type="button" class="btn-classifier-pill" data-pos="NOUN">İsim</button>
              <button type="button" class="btn-classifier-pill" data-pos="VERB">Fiil</button>
              <button type="button" class="btn-classifier-pill" data-pos="ADJECTIVE">Sıfat</button>
              <button type="button" class="btn-classifier-pill" data-pos="PHRASE">Kalıp</button>
            </div>
          </div>
        </div>

        <!-- TÜRKÇE ANLAMLAR ÇİPLERİ + ÖZEL ANLAM EKLEME (+ Anlam Ekle) -->
        <div class="sec-row-header" style="margin-top: 14px;">
          <span>TÜRKÇE ANLAMLAR</span>
          <span style="font-size:0.75rem; color:var(--text-muted);">Çoklu seçim yapabilirsiniz (en az 1)</span>
        </div>
        <div class="meaning-chips-container" id="fallback-tr-chips">
          ${trChipsHtml}
          <button type="button" class="btn-add-custom-meaning" id="btn-fallback-add-custom">+ Anlam Ekle</button>
          <div class="custom-meaning-inline-box hidden" id="fallback-custom-box">
            <input type="text" id="input-fallback-custom" class="custom-meaning-inline-input" placeholder="Özel anlam yazın..." maxlength="60" autocomplete="off" />
            <button type="button" id="btn-fallback-confirm-custom" class="btn-confirm-custom-meaning" title="Ekle">✓</button>
            <button type="button" id="btn-fallback-cancel-custom" class="btn-cancel-custom-meaning" title="İptal">✕</button>
          </div>
        </div>

        <!-- HEDEF DESTE SEÇİMİ -->
        <div class="target-deck-row" style="margin-top: 16px;">
          <label class="target-deck-label" for="fallback-target-deck">HEDEF DESTE</label>
          <div class="target-deck-select-wrap">
            <select class="target-deck-select" id="fallback-target-deck">
              ${deckOptionsHtml}
            </select>
            <svg class="svg-icon deck-select-chevron"><use href="#icon-chevron-down"></use></svg>
          </div>
        </div>

        <!-- 4. Desteye ve Yerel Sözlüğe Kaydetme Butonu -->
        <button type="button" class="btn-save-card-android" id="btn-fallback-save-card" style="margin-top: 14px;">
          <svg class="svg-icon" style="width:18px; height:18px;"><use href="#icon-bookmark"></use></svg>
          <span>Kartı Desteye Kaydet</span>
        </button>
      </article>
    `;

    // Olay Dinleyicileri
    // 1. "Bunu mu demek istediniz?" butonları
    container.querySelectorAll('.btn-dym-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = btn.getAttribute('data-word');
        const input = document.getElementById('global-search-input');
        if (input) {
          input.value = w;
          document.getElementById('btn-clear-search')?.classList.remove('hidden');
        }
        this.executeSearch(w);
      });
    });

    let selectedArticle = '';
    let selectedPos = 'OTHER';

    // 2. Artikel & POS seçicileri
    const artBadge = document.getElementById('fallback-article-badge');
    const updateArticleBadge = (art) => {
      if (!artBadge) return;
      if (!art) {
        artBadge.innerHTML = '';
        return;
      }
      const st = window.getArticleStyle ? window.getArticleStyle(art) : null;
      artBadge.innerHTML = st ? st.badgeHtml : `<span class="badge badge-${art.toLowerCase()}">${art.toUpperCase()}</span>`;
    };

    document.querySelectorAll('#fallback-article-selectors .btn-classifier-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#fallback-article-selectors .btn-classifier-pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedArticle = btn.getAttribute('data-art') || '';
        updateArticleBadge(selectedArticle);
      });
    });

    document.querySelectorAll('#fallback-pos-selectors .btn-classifier-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#fallback-pos-selectors .btn-classifier-pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPos = btn.getAttribute('data-pos') || 'OTHER';
      });
    });

    // 3. TTS & Fonetik Koç
    document.getElementById('btn-fallback-tts')?.addEventListener('click', () => {
      const spk = selectedArticle ? `${selectedArticle} ${cleanWord}` : cleanWord;
      window.wmTTS.speak(spk, 'de-DE');
    });

    document.getElementById('btn-fallback-pronounce')?.addEventListener('click', () => {
      this.openPronunciationCoach(
        {
          germanWord: cleanWord,
          article: selectedArticle || null,
          partOfSpeech: selectedPos || 'OTHER',
          meaningsTr: initialTranslation
        },
        'word'
      );
    });

    // 4. Çoklu Anlam Seçimi (Multi-select Meaning Chips)
    const trChipsContainer = document.getElementById('fallback-tr-chips');
    trChipsContainer?.addEventListener('click', (e) => {
      const chip = e.target.closest('.meaning-chip');
      if (!chip) return;
      const allSelected = trChipsContainer.querySelectorAll('.meaning-chip.selected');
      const isCurrentlySelected = chip.classList.contains('selected');
      if (isCurrentlySelected && allSelected.length <= 1) {
        this.showToast('En az bir anlam seçili kalmalıdır.');
        return;
      }
      chip.classList.toggle('selected');
      const checkSpan = chip.querySelector('.meaning-chip-check');
      if (checkSpan) checkSpan.textContent = chip.classList.contains('selected') ? '✓' : '';
    });

    // 5. Özel Anlam Ekleme (+ Anlam Ekle)
    const customBox = document.getElementById('fallback-custom-box');
    const customInput = document.getElementById('input-fallback-custom');
    const addCustomBtn = document.getElementById('btn-fallback-add-custom');
    const confirmCustomBtn = document.getElementById('btn-fallback-confirm-custom');
    const cancelCustomBtn = document.getElementById('btn-fallback-cancel-custom');

    const commitCustomMeaning = async () => {
      if (!customInput) return;
      const val = customInput.value.trim();
      if (!val) return;
      const chipEl = document.createElement('div');
      chipEl.className = 'meaning-chip selected';
      chipEl.setAttribute('data-val', val);
      chipEl.innerHTML = `<span class="meaning-chip-check">✓</span><span class="meaning-chip-text">${val}</span>`;
      trChipsContainer?.insertBefore(chipEl, addCustomBtn);
      await this.saveCustomMeaningForWord(cleanWord, val);
      customInput.value = '';
      customBox?.classList.add('hidden');
      addCustomBtn?.classList.remove('hidden');
    };

    addCustomBtn?.addEventListener('click', () => {
      addCustomBtn.classList.add('hidden');
      customBox?.classList.remove('hidden');
      customInput?.focus();
    });
    confirmCustomBtn?.addEventListener('click', commitCustomMeaning);
    cancelCustomBtn?.addEventListener('click', () => {
      if (customInput) customInput.value = '';
      customBox?.classList.add('hidden');
      addCustomBtn?.classList.remove('hidden');
    });
    customInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCustomMeaning();
      } else if (e.key === 'Escape') {
        customBox?.classList.add('hidden');
        addCustomBtn?.classList.remove('hidden');
      }
    });

    // 6. Desteye ve Yerel Sözlüğe Kaydetme
    document.getElementById('btn-fallback-save-card')?.addEventListener('click', async () => {
      if (customBox && !customBox.classList.contains('hidden') && customInput?.value.trim()) {
        await commitCustomMeaning();
      }

      const selectedMeanings = Array.from(trChipsContainer.querySelectorAll('.meaning-chip.selected'))
        .map((c) => c.getAttribute('data-val') || c.innerText.replace(/^✓\s*/, '').trim())
        .filter(Boolean);

      if (selectedMeanings.length === 0) {
        this.showToast('Lütfen karta eklenecek en az bir anlam seçin.');
        return;
      }

      const deckSelect = document.getElementById('fallback-target-deck');
      let targetDeckId = deckSelect ? deckSelect.value : null;

      if (targetDeckId === '__NEW_DECK__') {
        const newDeckName = prompt('Yeni deste ismi giriniz:', 'Almanca Kelimeler');
        if (!newDeckName || !newDeckName.trim()) {
          if (decks.length > 0 && deckSelect) deckSelect.value = String(decks[0].id);
          return;
        }
        const createdDeck = await window.wmDB.createDeck(newDeckName.trim(), 'Özel kelime destesi', 'default');
        targetDeckId = Number(createdDeck?.id ?? createdDeck);
      } else {
        targetDeckId = targetDeckId ? Number(targetDeckId) : (decks[0] ? Number(decks[0].id) : 1);
      }

      const finalMeaningsTr = selectedMeanings.join(', ');
      const newCard = {
        deckId: targetDeckId,
        germanWord: cleanWord,
        article: selectedArticle || null,
        pluralForm: null,
        partOfSpeech: selectedPos || 'OTHER',
        meaningsTr: finalMeaningsTr,
        meaningsEn: '',
        exampleSentence: '',
        targetLanguage: 'de',
        isManual: true,
        source: 'deepl_fallback'
      };

      await window.wmDB.createCard(newCard);

      // Ayrıca customUserDictionary içine ekle ki bir sonraki aramada tam eşleşme olsun
      if (typeof window.saveToCustomUserDictionary === 'function') {
        window.saveToCustomUserDictionary({
          germanWord: cleanWord,
          article: selectedArticle || null,
          partOfSpeech: selectedPos || 'OTHER',
          meaningsTr: finalMeaningsTr,
          examples: []
        });
      }

      this.showToast(`"${cleanWord}" desteye ve yerel sözlüğe kaydedildi! ✓`);
      await this.refreshHomeDashboard();
      this.executeSearch(cleanWord);
    });
  }

  /**
   * 5. Akıllı Okuyucu (Smart Reader) & Text to Speech (TTS) Metin Okuma Modülü
   */
  bindSmartReader() {
    const btnQuick = document.getElementById('btn-subview-quick-trans');
    const btnReader = document.getElementById('btn-subview-smart-reader');
    const panelQuick = document.getElementById('panel-quick-translate');
    const panelReader = document.getElementById('panel-smart-reader');

    if (!btnQuick || !btnReader || !panelQuick || !panelReader) return;

    btnQuick.addEventListener('click', () => {
      btnQuick.classList.add('active');
      btnReader.classList.remove('active');
      panelQuick.classList.remove('hidden');
      panelReader.classList.add('hidden');
    });

    btnReader.addEventListener('click', () => {
      btnReader.classList.add('active');
      btnQuick.classList.remove('active');
      panelReader.classList.remove('hidden');
      panelQuick.classList.add('hidden');
    });

    const readerInput = document.getElementById('reader-input-text');
    const readerDisplay = document.getElementById('reader-display-pane');
    const sampleSelect = document.getElementById('reader-sample-select');
    const speedSelect = document.getElementById('reader-speed-select');
    const clearBtn = document.getElementById('btn-reader-clear');
    const parseBtn = document.getElementById('btn-reader-parse');
    const playAllBtn = document.getElementById('btn-reader-play-all');
    const stopBtn = document.getElementById('btn-reader-stop');

    const sampleTexts = {
      sample_a1: `Guten Tag! Mein Name ist Lukas und ich wohne in Berlin. Jeden Tag stehe ich um sieben Uhr auf und trinke einen heißen Kaffee mit Milch. Danach fahre ich mit der U-Bahn zur Arbeit. Ich lerne gern Deutsch und treffe meine Freunde am Abend im Park.`,
      sample_a2: `Letztes Wochenende bin ich nach München gereist. Das Wetter war herrlich und die Sonne schien hell. Zuerst habe ich das Deutsche Museum besucht, weil mich Technik sehr interessiert. Am Nachmittag aßen wir Brezeln und sprachen über unsere Reisepläne für den kommenden Sommer.`,
      sample_b1: `Der Klimawandel stellt unsere Gesellschaft vor enorme Herausforderungen. Immer mehr Wissenschaftler betonen die Notwendigkeit erneuerbarer Energien. Wenn wir rechtzeitig nachhaltige Maßnahmen ergreifen, können wir unsere Umwelt für kommende Generationen schützen.`,
      sample_b2: `Sehr geehrte Damen und Herren, mit großem Interesse bewerbe ich mich um die ausgeschriebene Position als Softwareentwickler. In meiner bisherigen Laufbahn habe ich fundierte Kenntnisse im Bereich agiler Methoden erworben und komplexe Projekte erfolgreich geleitet.`
    };

    const getSelectedSpeed = () => {
      return parseFloat(speedSelect?.value || '0.90');
    };

    const renderParsedTokens = (text) => {
      if (!readerDisplay) return;
      const clean = (text || '').trim();
      if (!clean) {
        readerDisplay.innerHTML = `<span style="color:var(--text-muted); font-size:0.92rem; font-style:italic;">Metin girmediniz. Lütfen bir Almanca metin yazın veya örnek seçin.</span>`;
        return;
      }

      const paragraphs = clean.split(/\n\s*\n/);
      let globalOffset = 0;
      let html = '';

      for (const para of paragraphs) {
        html += '<p style="margin: 0 0 12px 0;">';
        const tokens = para.match(/([a-zA-ZäöüÄÖÜß]+|[^a-zA-ZäöüÄÖÜß\s]+|\s+)/g) || [para];

        for (const token of tokens) {
          if (/^[a-zA-ZäöüÄÖÜß]+$/.test(token)) {
            const wordOffset = clean.indexOf(token, globalOffset);
            const resolvedOffset = wordOffset >= 0 ? wordOffset : globalOffset;
            html += `<span class="reader-token" data-word="${token}" data-offset="${resolvedOffset}">${token}</span>`;
            globalOffset = resolvedOffset + token.length;
          } else if (token.includes('\n')) {
            html += '<br/>';
            globalOffset += token.length;
          } else {
            html += token.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            globalOffset += token.length;
          }
        }
        html += '</p>';
      }

      readerDisplay.innerHTML = html;
      bindReaderTokens();
    };

    // Örnek Metin Seçimi
    sampleSelect?.addEventListener('change', () => {
      const val = sampleSelect.value;
      if (val && sampleTexts[val]) {
        if (readerInput) readerInput.value = sampleTexts[val];
        renderParsedTokens(sampleTexts[val]);
      }
    });

    // Temizle Butonu
    clearBtn?.addEventListener('click', () => {
      window.wmTTS.stop();
      if (readerInput) readerInput.value = '';
      if (sampleSelect) sampleSelect.value = '';
      if (readerDisplay) {
        readerDisplay.innerHTML = `<span style="color:var(--text-muted); font-size:0.92rem; font-style:italic;">Yukarıdaki alana Almanca bir metin yazıp "Metni Ayrıştır ve Oku" butonuna basın veya hazır örnek metinlerden birini seçin.</span>`;
      }
    });

    // Ayrıştır Butonu
    parseBtn?.addEventListener('click', () => {
      renderParsedTokens(readerInput?.value || '');
    });

    // Metni Baştan Oku
    playAllBtn?.addEventListener('click', () => {
      const text = readerInput?.value.trim() || readerDisplay?.innerText.trim();
      if (!text) {
        this.showToast('Okunacak metin bulunamadı.');
        return;
      }
      window.wmTTS.speak(text, 'de-DE', getSelectedSpeed(), () => {
        readerDisplay?.querySelectorAll('.reader-token.speaking').forEach((t) => t.classList.remove('speaking'));
      });
      this.showToast('Metin seslendiriliyor... ▶');
    });

    // Durdur
    stopBtn?.addEventListener('click', () => {
      window.wmTTS.stop();
      readerDisplay?.querySelectorAll('.reader-token.speaking').forEach((t) => t.classList.remove('speaking'));
      this.showToast('Okuma durduruldu. ⏹');
    });

    // Reader Kelime Modalı Elemanları
    const modalReader = document.getElementById('modal-reader-word');
    const modalWordTitle = document.getElementById('reader-modal-word');
    const modalArticleBadge = document.getElementById('reader-modal-article-badge');
    const modalGrammarRow = document.getElementById('reader-modal-grammar-row');
    const modalBannerContainer = document.getElementById('reader-modal-banner-container');
    const modalTrChips = document.getElementById('reader-modal-tr-chips');
    const modalDeckSelect = document.getElementById('reader-target-deck');
    const btnCloseReaderModal = document.getElementById('btn-close-reader-modal');
    const btnReadFromWord = document.getElementById('btn-read-from-selected-word');
    const btnStopReaderWord = document.getElementById('btn-stop-from-selected-word');
    const btnReaderWordTTS = document.getElementById('btn-reader-word-tts');
    const btnReaderWordPronounce = document.getElementById('btn-reader-word-pronounce');
    const btnReaderSaveCard = document.getElementById('btn-reader-save-card');

    let currentSelectedTokenWord = '';
    let currentSelectedTokenOffset = 0;
    let currentSelectedPipelineResult = null;

    btnCloseReaderModal?.addEventListener('click', () => {
      modalReader?.classList.add('hidden');
      readerDisplay?.querySelectorAll('.reader-token.active').forEach((t) => t.classList.remove('active'));
    });

    modalReader?.addEventListener('click', (e) => {
      if (e.target === modalReader) {
        modalReader.classList.add('hidden');
        readerDisplay?.querySelectorAll('.reader-token.active').forEach((t) => t.classList.remove('active'));
      }
    });

    // "Bu Kelimeden İtibaren Oku" Butonu
    btnReadFromWord?.addEventListener('click', () => {
      const fullText = readerInput?.value.trim() || readerDisplay?.innerText.trim();
      if (!fullText) return;
      window.wmTTS.speakFromOffset(fullText, currentSelectedTokenOffset, 'de-DE', getSelectedSpeed(), () => {
        readerDisplay?.querySelectorAll('.reader-token.speaking').forEach((t) => t.classList.remove('speaking'));
      });
      readerDisplay?.querySelectorAll('.reader-token.speaking').forEach((t) => t.classList.remove('speaking'));
      const activeTok = readerDisplay?.querySelector(`.reader-token[data-offset="${currentSelectedTokenOffset}"]`);
      if (activeTok) activeTok.classList.add('speaking');
      this.showToast(`"${currentSelectedTokenWord}" kelimesinden itibaren okunuyor... ▶`);
    });

    // "Durdur" Butonu
    btnStopReaderWord?.addEventListener('click', () => {
      window.wmTTS.stop();
      readerDisplay?.querySelectorAll('.reader-token.speaking').forEach((t) => t.classList.remove('speaking'));
      this.showToast('Okuma durduruldu. ⏹');
    });

    // Yalnızca Bu Kelimeyi Dinle
    btnReaderWordTTS?.addEventListener('click', () => {
      if (currentSelectedTokenWord) {
        window.wmTTS.speak(currentSelectedTokenWord, 'de-DE', getSelectedSpeed());
      }
    });

    // Fonetik Koç Butonu
    btnReaderWordPronounce?.addEventListener('click', () => {
      if (!currentSelectedTokenWord) return;
      modalReader?.classList.add('hidden');
      this.openPronunciationCoach(
        {
          germanWord: currentSelectedTokenWord,
          partOfSpeech: currentSelectedPipelineResult?.entry?.partOfSpeech || 'OTHER',
          article: currentSelectedPipelineResult?.entry?.article || null,
          meaningsTr: currentSelectedPipelineResult?.entry?.meaningsTr || currentSelectedPipelineResult?.translatedText || ''
        },
        'word'
      );
    });

    // Kartı Desteye Kaydet
    btnReaderSaveCard?.addEventListener('click', async () => {
      if (!currentSelectedTokenWord) return;
      const selectedMeanings = Array.from(modalTrChips.querySelectorAll('.meaning-chip.selected'))
        .map((c) => c.getAttribute('data-val') || c.innerText.replace(/^✓\s*/, '').trim())
        .filter(Boolean);

      if (selectedMeanings.length === 0) {
        this.showToast('Lütfen en az bir anlam seçin.');
        return;
      }

      const targetDeckId = Number(modalDeckSelect?.value || 1);
      const article = currentSelectedPipelineResult?.entry?.article || null;
      const pos = currentSelectedPipelineResult?.entry?.partOfSpeech || 'OTHER';
      const finalTr = selectedMeanings.join(', ');

      await window.wmDB.createCard({
        deckId: targetDeckId,
        germanWord: currentSelectedTokenWord,
        article,
        partOfSpeech: pos,
        meaningsTr: finalTr,
        targetLanguage: 'de',
        source: 'smart_reader'
      });

      if (typeof window.saveToCustomUserDictionary === 'function') {
        window.saveToCustomUserDictionary({
          germanWord: currentSelectedTokenWord,
          article,
          partOfSpeech: pos,
          meaningsTr: finalTr
        });
      }

      this.showToast(`"${currentSelectedTokenWord}" desteye ve yerel sözlüğe kaydedildi! ✓`);
      modalReader?.classList.add('hidden');
    });

    const bindReaderTokens = () => {
      readerDisplay?.querySelectorAll('.reader-token').forEach((tokenEl) => {
        tokenEl.addEventListener('click', async () => {
          readerDisplay.querySelectorAll('.reader-token.active').forEach((t) => t.classList.remove('active'));
          tokenEl.classList.add('active');

          const word = tokenEl.getAttribute('data-word');
          const offset = parseInt(tokenEl.getAttribute('data-offset') || '0', 10);
          currentSelectedTokenWord = word;
          currentSelectedTokenOffset = offset;

          if (modalWordTitle) modalWordTitle.textContent = word;
          if (modalArticleBadge) modalArticleBadge.innerHTML = '';
          if (modalGrammarRow) modalGrammarRow.innerHTML = '<span style="font-size:0.78rem; color:var(--text-muted);">Sözlük taranıyor...</span>';
          if (modalBannerContainer) modalBannerContainer.innerHTML = '';
          if (modalTrChips) modalTrChips.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">Anlamlar yükleniyor...</span>';

          const decks = await window.wmDB.getAllDecks();
          if (modalDeckSelect) {
            modalDeckSelect.innerHTML = decks.map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
          }

          modalReader?.classList.remove('hidden');

          try {
            const res = await window.executeSmartSearchPipeline(word);
            currentSelectedPipelineResult = res;

            if (!res) {
              if (modalGrammarRow) modalGrammarRow.innerHTML = '<span style="font-size:0.78rem; color:var(--text-muted);">Genel Kelime</span>';
              if (modalTrChips) modalTrChips.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">Anlam bulunamadı.</span>';
              return;
            }

            if (res.status === 'exact' || res.status === 'stem') {
              const ent = res.entry;
              const art = ent.article || '';
              if (art && modalArticleBadge) {
                const st = window.getArticleStyle ? window.getArticleStyle(art) : null;
                modalArticleBadge.innerHTML = st ? st.badgeHtml : `<span class="badge badge-${art.toLowerCase()}">${art.toUpperCase()}</span>`;
              }

              if (modalGrammarRow) {
                const posStr = ent.partOfSpeech || 'Kelime';
                const stemNote = res.stem ? `<span class="badge" style="background:rgba(59,130,246,0.15); color:#60A5FA;">Kök: ${res.stem}</span>` : '';
                modalGrammarRow.innerHTML = `<span class="badge badge-pos-${ent.partOfSpeech || 'OTHER'}">${posStr}</span> ${stemNote}`;
              }

              const rawTr = ent.meaningsTr || ent.tr || '';
              const trParts = rawTr.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
              if (trParts.length === 0) trParts.push('Genel Karşılık');

              const userCustoms = this.getCustomMeaningsForWord(word);
              for (const uc of userCustoms) {
                if (!trParts.some((p) => p.toLowerCase() === uc.toLowerCase())) {
                  trParts.push(uc);
                }
              }

              if (modalTrChips) {
                modalTrChips.innerHTML = trParts.map((t, idx) => `
                  <div class="meaning-chip ${idx === 0 ? 'selected' : ''}" data-val="${t.replace(/"/g, '&quot;')}">
                    <span class="meaning-chip-check">${idx === 0 ? '✓' : ''}</span>
                    <span class="meaning-chip-text">${t}</span>
                  </div>
                `).join('') + `
                  <button type="button" class="btn-add-custom-meaning" id="btn-reader-add-custom">+ Anlam Ekle</button>
                  <div class="custom-meaning-inline-box hidden" id="reader-custom-box">
                    <input type="text" id="input-reader-custom" class="custom-meaning-inline-input" placeholder="Özel anlam..." maxlength="50" />
                    <button type="button" id="btn-reader-confirm-custom" class="btn-confirm-custom-meaning">✓</button>
                    <button type="button" id="btn-reader-cancel-custom" class="btn-cancel-custom-meaning">✕</button>
                  </div>
                `;

                bindReaderModalMeaningChips(word);
              }
            } else if (res.status === 'deepl_fallback') {
              if (modalBannerContainer) {
                const dymHtml = res.similarWords && res.similarWords.length > 0
                  ? `<div class="did-you-mean-bar" style="margin-bottom:8px;">
                      <span class="dym-label" style="font-size:0.75rem;">💡 Bunu mu demek istediniz:</span>
                      <div class="did-you-mean-chips">
                        ${res.similarWords.map((w) => `<button type="button" class="btn-dym-chip" data-word="${w}">${w}</button>`).join('')}
                      </div>
                     </div>`
                  : '';

                modalBannerContainer.innerHTML = `
                  <div class="deepl-fallback-banner" style="padding:7px 10px; font-size:0.78rem; margin-bottom:8px;">
                    <span class="dfb-icon">⚡</span>
                    <span>Yerel sözlükte bulunamadı · DeepL ile Çevrildi</span>
                  </div>
                  ${dymHtml}
                `;

                modalBannerContainer.querySelectorAll('.btn-dym-chip').forEach((b) => {
                  b.addEventListener('click', () => {
                    const simWord = b.getAttribute('data-word');
                    tokenEl.setAttribute('data-word', simWord);
                    tokenEl.textContent = simWord;
                    tokenEl.click();
                  });
                });
              }

              if (modalGrammarRow) {
                modalGrammarRow.innerHTML = `<span class="badge" style="background:#242B3A; color:#9CA3AF;">Otomatik Çeviri</span>`;
              }

              const transTr = res.translatedText || 'Çeviri bulunamadı';
              const parts = transTr.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
              if (parts.length === 0) parts.push(transTr);

              if (modalTrChips) {
                modalTrChips.innerHTML = parts.map((t, idx) => `
                  <div class="meaning-chip selected" data-val="${t.replace(/"/g, '&quot;')}">
                    <span class="meaning-chip-check">✓</span>
                    <span class="meaning-chip-text">${t}</span>
                  </div>
                `).join('') + `
                  <button type="button" class="btn-add-custom-meaning" id="btn-reader-add-custom">+ Anlam Ekle</button>
                  <div class="custom-meaning-inline-box hidden" id="reader-custom-box">
                    <input type="text" id="input-reader-custom" class="custom-meaning-inline-input" placeholder="Özel anlam..." maxlength="50" />
                    <button type="button" id="btn-reader-confirm-custom" class="btn-confirm-custom-meaning">✓</button>
                    <button type="button" id="btn-reader-cancel-custom" class="btn-cancel-custom-meaning">✕</button>
                  </div>
                `;

                bindReaderModalMeaningChips(word);
              }
            }
          } catch (err) {
            console.error("Reader token resolution failed:", err);
          }
        });
      });
    };

    const bindReaderModalMeaningChips = (word) => {
      modalTrChips?.querySelectorAll('.meaning-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const allSelected = modalTrChips.querySelectorAll('.meaning-chip.selected');
          const isSelected = chip.classList.contains('selected');
          if (isSelected && allSelected.length <= 1) {
            this.showToast('En az bir anlam seçili kalmalıdır.');
            return;
          }
          chip.classList.toggle('selected');
          const chk = chip.querySelector('.meaning-chip-check');
          if (chk) chk.textContent = chip.classList.contains('selected') ? '✓' : '';
        });
      });

      const addBtn = document.getElementById('btn-reader-add-custom');
      const box = document.getElementById('reader-custom-box');
      const inp = document.getElementById('input-reader-custom');
      const conf = document.getElementById('btn-reader-confirm-custom');
      const canc = document.getElementById('btn-reader-cancel-custom');

      const commitCustom = async () => {
        const val = inp?.value.trim();
        if (!val) return;
        const newChip = document.createElement('div');
        newChip.className = 'meaning-chip selected';
        newChip.setAttribute('data-val', val);
        newChip.innerHTML = `<span class="meaning-chip-check">✓</span><span class="meaning-chip-text">${val}</span>`;
        modalTrChips?.insertBefore(newChip, addBtn);
        newChip.addEventListener('click', () => {
          newChip.classList.toggle('selected');
          const chk = newChip.querySelector('.meaning-chip-check');
          if (chk) chk.textContent = newChip.classList.contains('selected') ? '✓' : '';
        });
        await this.saveCustomMeaningForWord(word, val);
        if (inp) inp.value = '';
        box?.classList.add('hidden');
        addBtn?.classList.remove('hidden');
      };

      addBtn?.addEventListener('click', () => {
        addBtn.classList.add('hidden');
        box?.classList.remove('hidden');
        inp?.focus();
      });
      conf?.addEventListener('click', commitCustom);
      canc?.addEventListener('click', () => {
        if (inp) inp.value = '';
        box?.classList.add('hidden');
        addBtn?.classList.remove('hidden');
      });
      inp?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitCustom();
        }
      });
    };
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

  async renderSearchResultCard(entry, searchedTerm, extra = {}) {
    const container = document.getElementById('search-results-container');
    if (!container || !entry) return;

    // "Bunu mu demek istediniz?" ve "Kök kelime" şeritleri
    const didYouMeanHtml = extra && extra.similarWords && extra.similarWords.length > 0
      ? `
        <div class="did-you-mean-bar">
          <span class="dym-label">
            <svg class="svg-icon" style="width:16px; height:16px; color:#FBBF24;"><use href="#icon-bolt"></use></svg>
            <span>💡 Bunu mu demek istediniz:</span>
          </span>
          <div class="did-you-mean-chips">
            ${extra.similarWords.map((w) => `<button type="button" class="btn-dym-chip" data-word="${w}">${w}</button>`).join('')}
          </div>
        </div>
      `
      : '';

    const stemBannerHtml = extra && extra.stem
      ? `<div style="font-size:0.82rem; color:#60A5FA; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); border-radius:10px; padding:8px 12px; margin-bottom:12px;">
           💡 „${searchedTerm}“ çekimli hali için kök kelime bulundu: <strong>${entry.germanWord || searchedTerm}</strong>
         </div>`
      : '';

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

    // Evrensel Artikel Renk Kodlaması (der / die / das)
    const articleStyle = window.getArticleStyle ? window.getArticleStyle(canonicalArticle) : null;
    const articleBadge = articleStyle
      ? articleStyle.badgeHtml
      : (canonicalArticle ? `<span class="badge badge-${canonicalArticle.toLowerCase()}">${canonicalArticle.toUpperCase()}</span>` : '');

    const posBadge = `<span class="badge badge-pos-${pos}">${posLabels[pos] || 'Kelime'}</span>`;

    const pluralVal = entry.pluralForm || (nounInfo ? nounInfo.plural : '');
    const pluralBadge = isNoun && pluralVal
      ? `<span class="badge-regularity" style="font-size:0.78rem;">Çoğul: ${pluralVal}</span>`
      : '';

    // Açık Kaynak Veriden Otomatik Tag / Resmiyet / Nüans Okuma
    const nuanceTags = window.detectGermanTags ? window.detectGermanTags(entry) : [];
    const nuanceTagsHtml = nuanceTags.length > 0
      ? `<div class="wdc-tags-row" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
          ${nuanceTags.map((t) => `<span class="badge-nuance ${t.className}" style="color:${t.color}; background-color:${t.bg}; border:1px solid ${t.border};">${t.label}</span>`).join('')}
         </div>`
      : `<div class="wdc-tags-row" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>`;

    // Fiillerde Stammformen Şeridi (spricht · sprach · hat gesprochen)
    const stammformenRibbon = (pos === 'VERB' && window.getStammformenRibbon)
      ? window.getStammformenRibbon(entry)
      : '';

    // Fiil + Edat + Hal (Rektion) ve Karıştırılan Kelime Çiftleri (False Friends)
    const grammarEnrichment = window.getGrammarEnrichment ? window.getGrammarEnrichment(cleanWord) : null;
    const rektionBadgeHtml = grammarEnrichment
      ? `<div style="margin-top:8px;"><span class="badge-rektion">${grammarEnrichment.badge}</span></div>`
      : '';

    const confusedPair = window.getConfusedWordPair ? window.getConfusedWordPair(cleanWord) : null;
    const confusedBoxHtml = confusedPair
      ? `<div class="false-friend-box"><span class="ff-icon">💡</span><span class="ff-text">${confusedPair.note}</span></div>`
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
    let existingId = existing ? existing.id : (entry.id || null);

    const actionButtons = existingId
      ? `
        <button class="icon-btn-ghost" id="btn-res-priority" title="Önemli">
          <svg class="svg-icon" style="color:${existing?.isPriority ? 'var(--accent-amber)' : 'var(--text-muted)'}"><use href="${existing?.isPriority ? '#icon-star-filled' : '#icon-star'}"></use></svg>
        </button>
        <button class="icon-btn-ghost delete-btn" id="btn-res-delete" title="Kartı Sil">
          <svg class="svg-icon"><use href="#icon-trash"></use></svg>
        </button>
      `
      : '';

    // Anlam Listelerini Ayır ve Kullanıcının Eklediği Özel Anlamları Birleştir
    const trMeanings = (entry.meaningsTr || '')
      .split(/[,;\n]/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0 && !m.toLowerCase().includes('yükleniyor'));
    if (trMeanings.length === 0 && entry.meaningsTr) trMeanings.push(entry.meaningsTr.trim());

    const customUserMeanings = this.getCustomMeaningsForWord(cleanWord);
    for (const cm of customUserMeanings) {
      if (!trMeanings.some((m) => m.toLowerCase() === cm.toLowerCase())) {
        trMeanings.push(cm);
      }
    }

    const enMeanings = (entry.meaningsEn || '')
      .split(/[,;\n]/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    // Türkçe Anlam Çipleri: Varsayılan olarak İLK eleman (idx === 0) ve kullanıcı özel anlamları seçili
    const trChipsHtml = trMeanings
      .map((m, idx) => {
        const isCustom = customUserMeanings.some((cm) => cm.toLowerCase() === m.toLowerCase());
        const isSelected = idx === 0 || isCustom;
        return `<button type="button" class="meaning-chip ${isSelected ? 'selected' : ''}" data-type="tr" data-val="${m.replace(/"/g, '&quot;')}"><span class="chip-check-icon">✓</span><span>${m}</span></button>`;
      })
      .join('');

    // İngilizce Anlam Çipleri: Varsayılan olarak İLK eleman (idx === 0) seçili
    const enChipsHtml = enMeanings
      .map((m, idx) => `<button type="button" class="meaning-chip ${idx === 0 ? 'selected' : ''}" data-type="en" data-val="${m.replace(/"/g, '&quot;')}"><span class="chip-check-icon">✓</span><span>${m}</span></button>`)
      .join('');

    // Örnek Cümleler (Radyo butonu olmadan, tüm kart tıklanabilir multi-select, ilk eleman seçili)
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
          // [1], [1a], [1b] gibi indeksleri temizle
          germanText = germanText.replace(/^\[[0-9a-zA-Z,\s–\/\.\-]+\]\s*/i, '').trim();
          const cleanExFull = turkishText ? `${germanText} (${turkishText})` : germanText;
          return `
            <div class="example-radio-card ${idx === 0 ? 'selected' : ''}" data-idx="${idx}" data-ex="${cleanExFull.replace(/"/g, '&quot;')}">
              <div class="example-card-body" style="flex:1; min-width:0;">
                <div class="example-de-text">${germanText}</div>
                ${turkishText ? `<div class="example-tr-text">${turkishText}</div>` : ''}
              </div>
              <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
                <button type="button" class="icon-btn-ghost btn-play-example" title="Seslendir" data-tts="${germanText.replace(/"/g, '&quot;')}">
                  <svg class="svg-icon" style="color:var(--brand-blue); width:16px; height:16px;"><use href="#icon-volume"></use></svg>
                </button>
                <button type="button" class="icon-btn-ghost btn-pronounce-example" title="Cümle Telaffuzunu Test Et" data-sentence="${germanText.replace(/"/g, '&quot;')}" data-tr="${turkishText.replace(/"/g, '&quot;')}">
                  <svg class="svg-icon" style="color:#10B981; width:16px; height:16px;"><use href="#icon-mic"></use></svg>
                </button>
              </div>
            </div>
          `;
        }).join('')
      : `<div style="font-size:0.82rem; color:var(--text-muted); font-style:italic;">Örnek cümle bulunamadı.</div>`;

    // Desteler Listesi
    const decks = await window.wmDB.getAllDecks();
    const currentCardDeckId = existing ? Number(existing.deckId) : null;
    const deckOptionsHtml = decks
      .map((d) => `<option value="${d.id}" ${currentCardDeckId === Number(d.id) ? 'selected' : ''}>${d.name} (${d.cardCount || 0} kart)</option>`)
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
      ${didYouMeanHtml}
      ${stemBannerHtml}
      <article class="word-detail-card">
        <div class="wdc-header-row">
          <div class="wdc-title-group">
            <span class="lang-badge lang-badge-de">
              <svg class="flag-svg"><use href="#flag-de"></use></svg>
              <span>DE</span>
            </span>
            ${articleBadge}
            <span class="wdc-word">${cleanWord}</span>
          </div>
          <div class="wdc-actions">
            <button class="icon-btn-ghost" id="btn-res-tts" title="Dinle (TTS)">
              <svg class="svg-icon" style="color:var(--brand-blue); width:22px; height:22px;"><use href="#icon-volume"></use></svg>
            </button>
            <button class="icon-btn-ghost btn-mic-trigger" id="btn-res-pronounce" title="Telaffuzunu Test Et">
              <svg class="svg-icon" style="color:#10B981; width:21px; height:21px;"><use href="#icon-mic"></use></svg>
            </button>
            ${actionButtons}
          </div>
        </div>

        ${nuanceTagsHtml}

        <div class="wdc-badges-subrow">
          ${posBadge}
          ${pluralBadge}
          ${reflexivBadge}
        </div>

        ${stammformenRibbon}
        ${rektionBadgeHtml}
        ${confusedBoxHtml}

        ${verbTable}

        <!-- TÜRKÇE ANLAMLAR ÇİPLERİ + ÖZEL ANLAM EKLEME -->
        <div class="sec-row-header" style="margin-top: 14px;">
          <span>TÜRKÇE ANLAMLAR</span>
          <span style="font-size:0.75rem; color:var(--text-muted);">Çoklu seçim yapabilirsiniz (en az 1)</span>
        </div>
        <div class="meaning-chips-container" id="inline-tr-chips">
          ${trChipsHtml}
          <button type="button" class="btn-add-custom-meaning" id="btn-add-custom-tr-meaning">+ Anlam Ekle</button>
          <div class="custom-meaning-inline-box hidden" id="custom-meaning-inline-box">
            <input type="text" id="input-custom-tr-meaning" class="custom-meaning-inline-input" placeholder="Özel anlam yazın..." maxlength="60" autocomplete="off" />
            <button type="button" id="btn-confirm-custom-tr-meaning" class="btn-confirm-custom-meaning" title="Ekle">✓</button>
            <button type="button" id="btn-cancel-custom-tr-meaning" class="btn-cancel-custom-meaning" title="İptal">✕</button>
          </div>
        </div>

        <!-- İNGİLİZCE KARŞILIKLAR ÇİPLERİ -->
        ${enMeanings.length > 0 ? `
          <div class="sec-row-header" style="margin-top: 12px;">
            <span>İNGİLİZCE KARŞILIKLAR</span>
            <span style="font-size:0.75rem; color:var(--text-muted);">Çoklu seçim</span>
          </div>
          <div class="meaning-chips-container" id="inline-en-chips">
            ${enChipsHtml}
          </div>
        ` : ''}

        <!-- EŞ ANLAMLILAR (SYNONYME) & KELİME AİLESİ (OPENTHESAURUS) -->
        <div id="inline-thesaurus-container" class="thesaurus-enrichment-box"></div>

        <!-- ÖRNEK CÜMLELER SEÇİMİ -->
        <div class="sec-row-header" style="margin-top: 14px;">
          <span>ÖRNEK CÜMLELER</span>
          <span style="font-size:0.75rem; color:var(--text-muted);">Karta eklenecek cümle(ler)i seçin</span>
        </div>
        <div class="example-sentences-list" id="inline-examples-list">
          ${examplesHtml}
        </div>

        <!-- HEDEF DESTE SEÇİMİ -->
        <div class="target-deck-row">
          <label class="target-deck-label" for="inline-target-deck">HEDEF DESTE</label>
          <div class="target-deck-select-wrap">
            <select class="target-deck-select" id="inline-target-deck">
              ${deckOptionsHtml}
            </select>
            <svg class="svg-icon deck-select-chevron"><use href="#icon-chevron-down"></use></svg>
          </div>
        </div>

        <!-- DOĞRUDAN INLINE KAYIT BUTONU -->
        ${saveButtonHtml}
      </article>
    `;

    // Olay Dinleyicileri
    container.querySelectorAll('.btn-dym-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = btn.getAttribute('data-word');
        const input = document.getElementById('global-search-input');
        if (input) {
          input.value = w;
          document.getElementById('btn-clear-search')?.classList.remove('hidden');
        }
        this.executeSearch(w);
      });
    });
    document.getElementById('btn-res-tts')?.addEventListener('click', () => {
      const spk = isNoun && canonicalArticle ? `${canonicalArticle} ${cleanWord}` : cleanWord;
      window.wmTTS.speak(spk, 'de-DE');
    });

    document.getElementById('btn-res-pronounce')?.addEventListener('click', () => {
      const firstEx = examples.length > 0 ? examples[0].replace(/\s*\(.*?\)\s*$/, '').trim() : '';
      this.openPronunciationCoach(
        {
          germanWord: cleanWord,
          article: isNoun ? canonicalArticle : '',
          partOfSpeech: pos,
          meaningsTr: trMeanings.join(', '),
          exampleSentence: firstEx
        },
        'word'
      );
    });

    // Cümle Seslendirme Butonları
    container.querySelectorAll('.btn-play-example').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tts = btn.getAttribute('data-tts');
        if (tts) window.wmTTS.speak(tts, 'de-DE');
      });
    });

    // Cümle Telaffuz Testi Butonları
    container.querySelectorAll('.btn-pronounce-example').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sent = btn.getAttribute('data-sentence') || '';
        const tr = btn.getAttribute('data-tr') || trMeanings.join(', ');
        this.openPronunciationCoach(
          {
            germanWord: cleanWord,
            article: isNoun ? canonicalArticle : '',
            partOfSpeech: pos,
            meaningsTr: tr,
            exampleSentence: sent
          },
          'sentence'
        );
      });
    });

    // OpenThesaurus Eş Anlamlılar ve Kelime Ailesi (Asenkron Yükleme & Tıklanabilir Chip)
    if (window.fetchOpenThesaurus) {
      window.fetchOpenThesaurus(cleanWord).then((data) => {
        const thContainer = document.getElementById('inline-thesaurus-container');
        if (!thContainer) return;
        let thHtml = '';
        if (data.synonyms && data.synonyms.length > 0) {
          thHtml += `
            <div class="sec-row-header" style="margin-top:10px;">
              <span>EŞ ANLAMLILAR (SYNONYME)</span>
              <span style="font-size:0.74rem; color:var(--text-muted);">Sözlükte aramak için tıklayın</span>
            </div>
            <div class="synonym-chips-container">
              ${data.synonyms.map((s) => `<button type="button" class="synonym-chip" data-word="${s.replace(/"/g, '&quot;')}"><svg class="svg-icon" style="width:13px;height:13px;color:#818CF8;"><use href="#icon-search"></use></svg><span>${s}</span></button>`).join('')}
            </div>
          `;
        }
        if (data.wordFamily && data.wordFamily.length > 0) {
          thHtml += `
            <div class="sec-row-header" style="margin-top:10px;">
              <span>KELİME AİLESİ (WORTFAMILIE)</span>
            </div>
            <div class="synonym-chips-container">
              ${data.wordFamily.map((w) => `<button type="button" class="synonym-chip wortfamilie-chip" data-word="${w.replace(/"/g, '&quot;')}"><svg class="svg-icon" style="width:13px;height:13px;color:#34D399;"><use href="#icon-link"></use></svg><span>${w}</span></button>`).join('')}
            </div>
          `;
        }
        if (data.levels && data.levels.length > 0) {
          const extraTags = window.detectGermanTags ? window.detectGermanTags({ thesaurusLevels: data.levels }) : [];
          const tagsRow = container.querySelector('.wdc-tags-row');
          if (tagsRow && extraTags.length > 0) {
            extraTags.forEach((et) => {
              if (!tagsRow.innerHTML.includes(et.label)) {
                tagsRow.innerHTML += `<span class="badge-nuance ${et.className}" style="color:${et.color}; background-color:${et.bg}; border:1px solid ${et.border};">${et.label}</span>`;
              }
            });
          }
        }
        thContainer.innerHTML = thHtml;
        thContainer.querySelectorAll('.synonym-chip').forEach((chip) => {
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetWord = chip.getAttribute('data-word');
            if (targetWord) {
              const searchInput = document.getElementById('search-input');
              if (searchInput) searchInput.value = targetWord;
              this.executeSearch(targetWord);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          });
        });
      }).catch(() => {});
    }

    // Anlam Çiplerini Aç / Kapa (Multi-Select Toggle — En az 1 anlam seçili kalmalı)
    container.querySelectorAll('#inline-tr-chips .meaning-chip, #inline-en-chips .meaning-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const parentContainer = chip.parentElement;
        const isSelected = chip.classList.contains('selected');
        const selectedCount = parentContainer ? parentContainer.querySelectorAll('.meaning-chip.selected').length : 0;
        if (isSelected && selectedCount <= 1) {
          this.showToast('En az 1 anlam seçili kalmalıdır.');
          return;
        }
        chip.classList.toggle('selected');
      });
    });

    // Kullanıcının Kendi Anlamını Ekleyebilmesi (+ Anlam Ekle)
    const addCustomBtn = document.getElementById('btn-add-custom-tr-meaning');
    const customBox = document.getElementById('custom-meaning-inline-box');
    const customInput = document.getElementById('input-custom-tr-meaning');
    const confirmCustomBtn = document.getElementById('btn-confirm-custom-tr-meaning');
    const cancelCustomBtn = document.getElementById('btn-cancel-custom-tr-meaning');
    const trChipsContainer = document.getElementById('inline-tr-chips');

    const commitCustomMeaning = () => {
      const val = (customInput?.value || '').trim();
      if (!val) {
        customBox?.classList.add('hidden');
        addCustomBtn?.classList.remove('hidden');
        return;
      }

      // Aynı anlam zaten varsa seçili yap
      const existingChip = Array.from(trChipsContainer?.querySelectorAll('.meaning-chip') || []).find(
        (c) => (c.getAttribute('data-val') || '').toLowerCase() === val.toLowerCase()
      );

      if (existingChip) {
        existingChip.classList.add('selected');
      } else {
        const newChip = document.createElement('button');
        newChip.type = 'button';
        newChip.className = 'meaning-chip selected';
        newChip.setAttribute('data-type', 'tr');
        newChip.setAttribute('data-val', val);
        newChip.innerHTML = `<span class="chip-check-icon">✓</span><span>${val}</span>`;
        newChip.addEventListener('click', () => {
          const isSel = newChip.classList.contains('selected');
          const selCount = trChipsContainer ? trChipsContainer.querySelectorAll('.meaning-chip.selected').length : 0;
          if (isSel && selCount <= 1) {
            this.showToast('En az 1 anlam seçili kalmalıdır.');
            return;
          }
          newChip.classList.toggle('selected');
        });
        trChipsContainer?.insertBefore(newChip, addCustomBtn);
      }

      if (!trMeanings.some((m) => m.toLowerCase() === val.toLowerCase())) {
        trMeanings.push(val);
      }
      this.saveCustomMeaningForWord(cleanWord, val);

      if (customInput) customInput.value = '';
      customBox?.classList.add('hidden');
      addCustomBtn?.classList.remove('hidden');
      this.showToast(`"${val}" anlamı eklendi ve seçildi ✓`);
    };

    addCustomBtn?.addEventListener('click', () => {
      addCustomBtn.classList.add('hidden');
      customBox?.classList.remove('hidden');
      customInput?.focus();
    });

    confirmCustomBtn?.addEventListener('click', () => {
      commitCustomMeaning();
    });

    cancelCustomBtn?.addEventListener('click', () => {
      if (customInput) customInput.value = '';
      customBox?.classList.add('hidden');
      addCustomBtn?.classList.remove('hidden');
    });

    customInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCustomMeaning();
      } else if (e.key === 'Escape') {
        if (customInput) customInput.value = '';
        customBox?.classList.add('hidden');
        addCustomBtn?.classList.remove('hidden');
      }
    });

    // Örnek Cümle Kartı Çoklu Seçimi (Tıklanan kartı seç / kaldır)
    container.querySelectorAll('.example-radio-card').forEach((card) => {
      card.addEventListener('click', () => {
        card.classList.toggle('selected');
      });
    });

    // Hedef Deste Dropdown Değişiminde "+ Yeni Deste Oluştur..." Seçilirse Anında Oluştur
    const deckSelectEl = document.getElementById('inline-target-deck');
    deckSelectEl?.addEventListener('change', async () => {
      if (deckSelectEl.value === '__NEW_DECK__') {
        const newDeckName = prompt('Yeni deste ismi giriniz:', 'Almanca Kelimeler');
        if (!newDeckName || !newDeckName.trim()) {
          deckSelectEl.value = decks.length > 0 ? String(decks[0].id) : '1';
          return;
        }
        const createdDeck = await window.wmDB.createDeck(newDeckName.trim(), 'Özel kelime destesi', 'default');
        const newDeckId = Number(createdDeck?.id ?? createdDeck);
        const newOpt = document.createElement('option');
        newOpt.value = String(newDeckId);
        newOpt.textContent = `${newDeckName.trim()} (0 kart)`;
        const newDeckTriggerOpt = deckSelectEl.querySelector('option[value="__NEW_DECK__"]');
        deckSelectEl.insertBefore(newOpt, newDeckTriggerOpt);
        deckSelectEl.value = String(newDeckId);
        decks.push({ id: newDeckId, name: newDeckName.trim(), cardCount: 0 });
        await this.renderDecksTab();
        this.showToast(`"${newDeckName.trim()}" destesi oluşturuldu ve seçildi ✓`);
      }
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

    // Inline Kaydet Butonu (Yeni Deste + Çoklu Anlam + Özel Anlam Garantili)
    document.getElementById('btn-inline-save')?.addEventListener('click', async () => {
      if (!cleanWord || !cleanWord.trim()) {
        this.showToast('Kaydedilecek geçerli bir kelime bulunamadı.');
        return;
      }

      // Açık kalan özel anlam kutusunda metin varsa önce onu da listeye dahil et
      if (customBox && !customBox.classList.contains('hidden') && customInput?.value.trim()) {
        commitCustomMeaning();
      }

      const deckSelect = document.getElementById('inline-target-deck');
      let targetDeckId = deckSelect ? deckSelect.value : null;

      if (targetDeckId === '__NEW_DECK__') {
        const newDeckName = prompt('Yeni deste ismi giriniz:', 'Almanca Kelimeler');
        if (!newDeckName || !newDeckName.trim()) {
          if (decks.length > 0 && deckSelect) deckSelect.value = String(decks[0].id);
          return;
        }
        const createdDeck = await window.wmDB.createDeck(newDeckName.trim(), 'Özel kelime destesi', 'default');
        const resolvedNewDeckId = Number(createdDeck?.id ?? createdDeck);
        targetDeckId = resolvedNewDeckId;

        if (deckSelect) {
          const newOpt = document.createElement('option');
          newOpt.value = String(resolvedNewDeckId);
          newOpt.textContent = `${newDeckName.trim()} (1 kart)`;
          const newDeckTriggerOpt = deckSelect.querySelector('option[value="__NEW_DECK__"]');
          deckSelect.insertBefore(newOpt, newDeckTriggerOpt);
          deckSelect.value = String(resolvedNewDeckId);
        }
      } else if (targetDeckId) {
        targetDeckId = Number(targetDeckId);
      } else if (decks.length > 0) {
        targetDeckId = Number(decks[0].id);
      } else {
        const fallbackDeck = await window.wmDB.createDeck('Genel Deste', 'Varsayılan deste', 'default');
        targetDeckId = Number(fallbackDeck?.id ?? fallbackDeck) || 1;
      }

      // Seçili Türkçe Anlamlar (Hem sözlük hem kullanıcı özel anlamları)
      const selectedTrNodes = container.querySelectorAll('#inline-tr-chips .meaning-chip.selected');
      let selectedTr = Array.from(selectedTrNodes).map((c) => c.getAttribute('data-val')).filter(Boolean);
      if (selectedTr.length === 0) selectedTr = trMeanings.slice(0, 1);

      // Seçili İngilizce Anlamlar
      const selectedEnNodes = container.querySelectorAll('#inline-en-chips .meaning-chip.selected');
      let selectedEn = Array.from(selectedEnNodes).map((c) => c.getAttribute('data-val')).filter(Boolean);
      if (selectedEn.length === 0 && enMeanings.length > 0) selectedEn = enMeanings.slice(0, 1);

      // Seçili Örnek Cümle(ler)
      const selectedExCards = container.querySelectorAll('#inline-examples-list .example-radio-card.selected');
      let selectedExList = Array.from(selectedExCards)
        .map((c) => (c.getAttribute('data-ex') || '').replace(/^\[[0-9a-zA-Z,\s–\/\.\-]+\]\s*/i, '').trim())
        .filter(Boolean);
      if (selectedExList.length === 0 && examples.length > 0) {
        selectedExList = [examples[0].replace(/^\[[0-9a-zA-Z,\s–\/\.\-]+\]\s*/i, '').trim()];
      }
      const selectedEx = selectedExList.join(' | ');

      // Kart Nesnesi — Otomatik Artikel & Doğrudan deckId Garantisi İle
      const cardPayload = {
        deckId: Number(targetDeckId) || 1,
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
            await window.WordGameService.initPool();
          }
          await this.renderDecksTab();
          await this.renderCardsList();
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
      this.navigateBack('tab-games');
    });

    document.getElementById('btn-game-finish')?.addEventListener('click', () => {
      document.getElementById('modal-game-quiz')?.classList.add('hidden');
      this.refreshHomeDashboard();
      this.navigateBack('tab-games');
    });

    document.getElementById('btn-game-play-again')?.addEventListener('click', () => {
      if (window.WordGameService && window.WordGameService.currentGameType) {
        this.openGameQuizModal(window.WordGameService.currentGameType, { skipRoutePush: true });
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

  // --- OYUN İÇİN DESTE SEÇİM EKRANI ---
  bindGameDeckSelectionModal() {
    document.getElementById('btn-close-game-deck-select')?.addEventListener('click', () => {
      document.getElementById('modal-game-deck-select')?.classList.add('hidden');
      this.navigateBack('tab-games');
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
      } else if (this.pendingGameType === 'PRONUNCIATION_TRAINER') {
        this.startPronunciationTrainerSession(selectedDeckIds);
      } else {
        this.openGameQuizModal(this.pendingGameType || 'MIXED');
      }
    });
  }

  async openGameDeckSelectionModal(gameType, options = {}) {
    this.pendingGameType = gameType;
    const modal = document.getElementById('modal-game-deck-select');
    if (!modal) return;

    if (!options.skipRoutePush) {
      this.pushRoute(`/oyunlar/secim-${encodeURIComponent(gameType)}`, { gameType });
    }

    const titleEl = document.getElementById('gds-title');
    const subEl = document.getElementById('gds-subtitle');
    const listEl = document.getElementById('gds-deck-list');

    if (gameType === 'CABLE_MATCH') {
      if (titleEl) titleEl.textContent = 'Kablo Eşleştirme — Deste Seçimi';
      if (subEl) subEl.textContent = 'Kablolarla bağlayacağınız kelimelerin destelerini seçin';
    } else if (gameType === 'PRONUNCIATION_TRAINER') {
      if (titleEl) titleEl.textContent = 'Telaffuz Koçu — Deste Seçimi';
      if (subEl) subEl.textContent = 'Akustik ve fonetik telaffuz pratiği yapacağınız desteleri seçin';
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
      this.navigateBack('tab-games');
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

  openCableGameModal(selectedDeckIds = null, options = {}) {
    const modal = document.getElementById('modal-cable-game');
    if (!modal) return;
    this.cableSelectedDeckIds = selectedDeckIds;
    if (!options.skipRoutePush) {
      this.pushRoute('/oyunlar/CABLE_MATCH', { gameType: 'CABLE_MATCH' });
    }
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

  openGameQuizModal(gameType, options = {}) {
    if (!window.WordGameService) return;
    const modal = document.getElementById('modal-game-quiz');
    if (!modal) return;

    if (!options.skipRoutePush) {
      this.pushRoute(`/oyunlar/${encodeURIComponent(gameType || 'MIXED')}`, { gameType });
    }

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
    let editingDeckId = null;

    const openCreateModal = () => {
      editingDeckId = null;
      const titleEl = modal.querySelector('.modal-header h3');
      const submitBtn = form.querySelector('button[type="submit"]');
      if (titleEl) titleEl.textContent = 'Yeni Deste Oluştur';
      if (submitBtn) submitBtn.textContent = 'Oluştur';
      form.reset();
      modal.classList.remove('hidden');
      document.getElementById('deck-name-input').focus();
    };

    document.getElementById('btn-fab-new-deck')?.addEventListener('click', openCreateModal);
    document.getElementById('btn-create-deck-top')?.addEventListener('click', openCreateModal);

    document.getElementById('btn-close-deck-modal')?.addEventListener('click', () => {
      modal.classList.add('hidden');
      editingDeckId = null;
    });

    document.getElementById('btn-cancel-deck-modal')?.addEventListener('click', () => {
      modal.classList.add('hidden');
      editingDeckId = null;
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('deck-name-input').value.trim();
      if (!name) return;
      if (editingDeckId) {
        await window.wmDB.updateDeck(editingDeckId, name);
        this.showToast(`Deste adı "${name}" olarak güncellendi.`);
      } else {
        await window.wmDB.createDeck(name);
        this.showToast(`"${name}" destesi oluşturuldu.`);
      }
      modal.classList.add('hidden');
      form.reset();
      editingDeckId = null;
      await this.renderDecksTab();
      await this.refreshHomeDashboard();
    });

    this.openEditDeckModal = (deckId, currentName) => {
      editingDeckId = deckId;
      const titleEl = modal.querySelector('.modal-header h3');
      const submitBtn = form.querySelector('button[type="submit"]');
      if (titleEl) titleEl.textContent = 'Desteyi Düzenle';
      if (submitBtn) submitBtn.textContent = 'Kaydet';
      const input = document.getElementById('deck-name-input');
      if (input) input.value = currentName;
      modal.classList.remove('hidden');
      if (input) input.focus();
    };

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
      await this.renderCardsList();
      await this.refreshHomeDashboard();
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg class="svg-icon" style="width:14px;height:14px;"><use href="#icon-check"></use></svg><span>Tamamlandı</span>`;
      }
    });

    // Dışarı tıklandığında açık deste menülerini kapat
    document.addEventListener('click', () => {
      document.querySelectorAll('#user-decks-list .deck-actions-dropdown').forEach((m) => m.classList.add('hidden'));
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
        await this.renderCardsList();
        await this.refreshHomeDashboard();
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
            <button class="icon-btn-ghost btn-deck-menu" data-deck-id="${d.id}" title="Deste İşlemleri">
              <svg class="svg-icon"><use href="#icon-more-vertical"></use></svg>
            </button>
            <div class="deck-actions-dropdown hidden" id="deck-menu-${d.id}">
              <button type="button" class="deck-dropdown-item btn-action-edit-deck" data-deck-id="${d.id}" data-deck-name="${d.name.replace(/"/g, '&quot;')}">
                <svg class="svg-icon" style="color:var(--brand-blue);"><use href="#icon-edit"></use></svg>
                <span>Düzenle</span>
              </button>
              <button type="button" class="deck-dropdown-item btn-action-share-deck btn-share-deck" data-deck-id="${d.id}">
                <svg class="svg-icon" style="color:var(--brand-blue);"><use href="#icon-share"></use></svg>
                <span>Paylaş</span>
              </button>
              <button type="button" class="deck-dropdown-item item-delete btn-action-delete-deck" data-deck-id="${d.id}" data-deck-name="${d.name.replace(/"/g, '&quot;')}">
                <svg class="svg-icon"><use href="#icon-trash"></use></svg>
                <span>Sil</span>
              </button>
            </div>
          </div>
        </div>
      `
      )
      .join('');

    container.querySelectorAll('.deck-item-card').forEach((cardEl) => {
      cardEl.addEventListener('click', async (e) => {
        if (e.target.closest('.deck-item-actions')) return;
        const dId = cardEl.getAttribute('data-deck-id');
        await this.switchTab('tab-study');
        await window.wmStudy.loadSession(dId, false);
      });
    });

    // 3 Nokta Menü Aç/Kapat
    container.querySelectorAll('.btn-deck-menu').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dId = btn.getAttribute('data-deck-id');
        const menu = document.getElementById(`deck-menu-${dId}`);
        container.querySelectorAll('.deck-actions-dropdown').forEach((m) => {
          if (m !== menu) m.classList.add('hidden');
        });
        if (menu) menu.classList.toggle('hidden');
      });
    });

    // Menü: Düzenle
    container.querySelectorAll('.btn-action-edit-deck').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dId = Number(btn.getAttribute('data-deck-id'));
        const dName = btn.getAttribute('data-deck-name') || '';
        container.querySelectorAll('.deck-actions-dropdown').forEach((m) => m.classList.add('hidden'));
        if (typeof this.openEditDeckModal === 'function') {
          this.openEditDeckModal(dId, dName);
        }
      });
    });

    // Menü: Paylaş
    container.querySelectorAll('.btn-action-share-deck').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dId = Number(btn.getAttribute('data-deck-id'));
        container.querySelectorAll('.deck-actions-dropdown').forEach((m) => m.classList.add('hidden'));
        this.openShareDeckModal(dId);
      });
    });

    // Menü: Sil
    container.querySelectorAll('.btn-action-delete-deck').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dId = Number(btn.getAttribute('data-deck-id'));
        const dName = btn.getAttribute('data-deck-name') || 'Bu deste';
        container.querySelectorAll('.deck-actions-dropdown').forEach((m) => m.classList.add('hidden'));
        if (confirm(`"${dName}" destesini ve içindeki tüm kartları silmek istediğinizden emin misiniz?`)) {
          await window.wmDB.deleteDeck(dId);
          this.showToast('Deste silindi.');
          await this.renderDecksTab();
          await this.renderCardsList();
          await this.refreshHomeDashboard();
        }
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
      if (cards.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:40px 20px; background:rgba(255,255,255,0.03); border-radius:var(--radius-xl); border:1px solid var(--border-subtle); margin-top:10px;">
            <div style="font-size:2.4rem; margin-bottom:10px;">🗂️</div>
            <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-primary); margin:0 0 6px;">Henüz Kelime Kartınız Yok</h3>
            <p style="font-size:0.84rem; color:var(--text-secondary); max-width:320px; margin:0 auto 18px;">Sözlükten kelime arayıp ekleyebilir veya hazır destelerden istediğiniz seviyeyi tek tıkla yükleyebilirsiniz.</p>
            <button type="button" class="btn-primary" id="btn-empty-open-curated" style="margin:0 auto; padding:10px 20px; border-radius:var(--radius-pill); font-weight:800;">
              <svg class="svg-icon" style="width:16px;height:16px;"><use href="#icon-sparkle"></use></svg>
              <span>Hazır Desteleri İncele</span>
            </button>
          </div>
        `;
        document.getElementById('btn-empty-open-curated')?.addEventListener('click', () => {
          document.getElementById('modal-curated-packs')?.classList.remove('hidden');
          this.renderCuratedPacksModal();
        });
      } else {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Eşleşen kart bulunamadı.</div>`;
      }
      return;
    }

    container.innerHTML = filtered
      .map(
        (c) => {
          let trMeaning = (c.meaningsTr && c.meaningsTr !== '-') ? c.meaningsTr : '';
          if (!trMeaning && window.DictionaryService) {
            try {
              const syn = window.DictionaryService.synthesizeInstantEntry(c.germanWord);
              if (syn && syn.meaningsTr) trMeaning = syn.meaningsTr;
            } catch (_) {}
          }
          if (!trMeaning) trMeaning = c.meaningsEn || 'Anlam belirtilmedi';

          const artStyle = window.getArticleStyle ? window.getArticleStyle(c.article) : null;
          const artBadge = artStyle
            ? artStyle.badgeHtml
            : (c.article ? `<span class="badge badge-${c.article}">${c.article}</span>` : '');

          const maturity = window.getCardMaturity ? window.getCardMaturity(c) : null;
          const maturityBadge = maturity ? maturity.badgeHtml : '';

          const enrichment = window.getGrammarEnrichment ? window.getGrammarEnrichment(c.germanWord) : null;
          const rektionBadge = enrichment ? `<span class="badge-rektion" style="font-size:0.7rem; padding:2px 6px;">${enrichment.badge}</span>` : '';

          return `
        <div class="deck-item-card" data-card-id="${c.id}" style="margin-bottom:8px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:10px;" title="Düzenlemek için tıklayın">
          <div style="flex:1; min-width:0; padding-right:4px;">
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
              <span class="lang-badge lang-badge-de">
                <svg class="flag-svg"><use href="#flag-de"></use></svg>
                <span>DE</span>
              </span>
              ${artBadge}
              <strong style="font-size:1.05rem; color:var(--text-primary); word-break:break-word;">${c.germanWord}</strong>
              <span class="badge badge-pos-${c.partOfSpeech}">${c.partOfSpeech}</span>
              ${maturityBadge}
              ${rektionBadge}
              ${c.isReflexive ? `<span class="badge-reflexiv">Reflexiv</span>` : ''}
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px; word-break:break-word;">${trMeaning}</div>
            ${c.pluralForm ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Çoğul: ${c.pluralForm}</div>` : ''}
          </div>
          <div class="deck-item-actions" style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
            <button type="button" class="card-action-icon-btn btn-card-edit" data-id="${c.id}" title="Düzenle" aria-label="Düzenle">
              <svg class="svg-icon"><use href="#icon-edit"></use></svg>
            </button>
            <button type="button" class="card-action-icon-btn btn-card-tts" data-word="${c.germanWord}" title="Dinle" aria-label="Dinle">
              <svg class="svg-icon"><use href="#icon-volume"></use></svg>
            </button>
            <button type="button" class="card-action-icon-btn btn-card-pronounce btn-mic-trigger" data-id="${c.id}" title="Telaffuz (Mikrofon)" aria-label="Telaffuz">
              <svg class="svg-icon"><use href="#icon-mic"></use></svg>
            </button>
            <button type="button" class="card-action-icon-btn delete-btn btn-card-delete" data-id="${c.id}" title="Sil" aria-label="Sil">
              <svg class="svg-icon"><use href="#icon-trash"></use></svg>
            </button>
          </div>
        </div>
      `;
        })
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

    container.querySelectorAll('.btn-card-pronounce').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const cardId = Number(b.getAttribute('data-id'));
        const card = cards.find((c) => c.id === cardId);
        if (card) {
          this.openPronunciationCoach(card, 'word');
        }
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
          await this.renderDecksTab();
          await this.refreshHomeDashboard();
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

      if (!wordRaw) {
        this.showToast('Lütfen geçerli bir Almanca kelime girin.');
        wordInput?.focus();
        return;
      }

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
      await this.renderCardsList();
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
    let decks = await window.wmDB.getAllDecks();
    if (decks.length === 0) {
      await window.wmDB.createDeck('Genel Deste');
      decks = await window.wmDB.getAllDecks();
    }
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

  // --- DESTE PAYLAŞMA & İÇE AKTARMA SİSTEMİ (v2.8.8) ---
  async openShareDeckModal(deckId) {
    const modal = document.getElementById('modal-share-deck');
    if (!modal) return;

    const decks = await window.wmDB.getAllDecks();
    const deck = decks.find((d) => Number(d.id) === Number(deckId));
    if (!deck) {
      this.showToast('Deste bulunamadı.');
      return;
    }

    const allCards = await window.wmDB.getAllCards();
    const deckCards = allCards.filter((c) => Number(c.deckId) === Number(deckId));

    if (deckCards.length === 0) {
      this.showToast('Bu destede henüz paylaşılacak kart yok.');
      return;
    }

    const nameDisplay = document.getElementById('share-deck-name-display');
    const countDisplay = document.getElementById('share-deck-count-display');
    const sampleDisplay = document.getElementById('share-deck-sample-words');

    if (nameDisplay) nameDisplay.textContent = deck.name;
    if (countDisplay) countDisplay.textContent = `${deckCards.length} Kart`;

    const sampleWords = deckCards.slice(0, 5).map((c) => c.germanWord).join(', ');
    if (sampleDisplay) {
      sampleDisplay.textContent = `Örnek Kelimeler: ${sampleWords}${deckCards.length > 5 ? '...' : ''}`;
    }

    // Paylaşım Veri Paketi Oluştur (WortCoach Formatı)
    const exportData = {
      app: 'WortCoach',
      version: '2.8.8',
      exportedAt: new Date().toISOString(),
      deck: {
        name: deck.name,
        description: deck.description || 'WortCoach Paylaşılan Deste',
        color: deck.color || '#3B82F6'
      },
      cards: deckCards.map((c) => ({
        germanWord: c.germanWord,
        article: c.article || '',
        partOfSpeech: c.partOfSpeech || 'OTHER',
        pluralForm: c.pluralForm || '',
        meaningsTr: c.meaningsTr || '',
        meaningsEn: c.meaningsEn || '',
        exampleSentence: c.exampleSentence || '',
        praesens: c.praesens || '',
        praeteritum: c.praeteritum || '',
        partizipZwei: c.partizipZwei || '',
        hilfsverb: c.hilfsverb || 'hat',
        isSeparable: Boolean(c.isSeparable),
        isReflexive: Boolean(c.isReflexive)
      }))
    };

    const jsonStr = JSON.stringify(exportData, null, 2);

    // 1. Sistem Paylaşımı (Web Share API)
    const btnNative = document.getElementById('btn-share-native');
    if (btnNative) {
      btnNative.onclick = async () => {
        if (navigator.share) {
          try {
            await navigator.share({
              title: `WortCoach Deste: ${deck.name}`,
              text: `Almanca "${deck.name}" deste paketi (${deckCards.length} kart):

${jsonStr}`
            });
            this.showToast('Deste başarıyla paylaşıldı.');
          } catch (_) {}
        } else {
          await navigator.clipboard.writeText(jsonStr);
          this.showToast('Paylaşım kodu panoya kopyalandı! Arkadaşınıza gönderebilirsiniz. 📋');
        }
      };
    }

    // 2. Panoya Kopyala
    const btnCopy = document.getElementById('btn-share-copy');
    if (btnCopy) {
      btnCopy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(jsonStr);
          this.showToast('Deste kodu panoya kopyalandı! 📋');
        } catch (_) {
          this.showToast('Kopyalama başarısız oldu.');
        }
      };
    }

    // 3. JSON Dosyası Olarak İndir
    const btnDownload = document.getElementById('btn-share-download');
    if (btnDownload) {
      btnDownload.onclick = () => {
        const cleanName = deck.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${cleanName}_WortCoach.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('Deste JSON dosyası indirildi! 💾');
      };
    }

    const btnClose = document.getElementById('btn-close-share-modal');
    if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');
    const btnDone = document.getElementById('btn-done-share-modal');
    if (btnDone) btnDone.onclick = () => modal.classList.add('hidden');

    modal.classList.remove('hidden');
  }

  bindImportDeckModal() {
    const modal = document.getElementById('modal-import-deck');
    const btnOpen = document.getElementById('btn-import-deck');
    const btnClose = document.getElementById('btn-close-import-modal');
    const fileInput = document.getElementById('import-deck-file-input');
    const dropzone = document.getElementById('import-deck-dropzone');
    const jsonText = document.getElementById('import-deck-json-text');
    const previewBox = document.getElementById('import-deck-preview-box');
    const previewName = document.getElementById('import-preview-name');
    const previewCount = document.getElementById('import-preview-count');
    const previewSample = document.getElementById('import-preview-sample');
    const btnDoImport = document.getElementById('btn-do-import-deck');

    if (!modal) return;

    btnOpen?.addEventListener('click', () => {
      modal.classList.remove('hidden');
      if (jsonText) jsonText.value = '';
      if (previewBox) previewBox.classList.add('hidden');
    });

    btnClose?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    });

    const parseAndPreview = (rawStr) => {
      try {
        const parsed = JSON.parse(rawStr.trim());
        let deckName = 'İçe Aktarılan Deste';
        let cardsList = [];

        if (parsed.deck && parsed.deck.name) {
          deckName = parsed.deck.name;
        } else if (parsed.name) {
          deckName = parsed.name;
        }

        if (Array.isArray(parsed.cards)) {
          cardsList = parsed.cards;
        } else if (Array.isArray(parsed)) {
          cardsList = parsed;
        }

        const validCards = cardsList.filter((c) => c && typeof c.germanWord === 'string' && c.germanWord.trim().length > 0);

        if (validCards.length === 0) {
          if (previewBox) previewBox.classList.add('hidden');
          return null;
        }

        if (previewName) previewName.textContent = deckName;
        if (previewCount) previewCount.textContent = `${validCards.length} Kart`;
        const sampleStr = validCards.slice(0, 4).map((c) => c.germanWord).join(', ');
        if (previewSample) previewSample.textContent = `Örnek Kelimeler: ${sampleStr}${validCards.length > 4 ? '...' : ''}`;
        if (previewBox) previewBox.classList.remove('hidden');

        return { deckName, cards: validCards };
      } catch (_) {
        if (previewBox) previewBox.classList.add('hidden');
        return null;
      }
    };

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        if (jsonText) jsonText.value = content;
        parseAndPreview(content);
      };
      reader.readAsText(file, 'UTF-8');
    });

    jsonText?.addEventListener('input', () => {
      parseAndPreview(jsonText.value);
    });

    btnDoImport?.addEventListener('click', async () => {
      const parsedData = parseAndPreview(jsonText?.value || '');
      if (!parsedData) {
        this.showToast('Lütfen geçerli bir WortCoach JSON deste verisi girin.');
        return;
      }

      btnDoImport.disabled = true;
      btnDoImport.innerHTML = `<span>Yükleniyor...</span>`;

      try {
        // Yeni Deste Oluştur
        const newDeck = await window.wmDB.createDeck(parsedData.deckName);
        let addedCount = 0;

        for (const c of parsedData.cards) {
          const cleanW = (c.germanWord || '').trim();
          if (cleanW) {
            await window.wmDB.addCard({
              ...c,
              germanWord: cleanW,
              deckId: newDeck.id
            });
            addedCount++;
          }
        }

        modal.classList.add('hidden');
        this.showToast(`"${parsedData.deckName}" (${addedCount} kart) başarıyla içe aktarıldı! 🎉`);
        await this.renderDecksTab();
        await this.renderCardsList();
      } catch (err) {
        this.showToast(`İçe aktarma hatası: ${err.message || 'Bilinmeyen hata'}`);
      } finally {
        btnDoImport.disabled = false;
        btnDoImport.innerHTML = `
          <svg class="svg-icon" style="width:16px;height:16px;"><use href="#icon-check"></use></svg>
          <span>Desteyi Veritabanına Yükle</span>
        `;
      }
    });
  }

  // --- DETAYLI TELAFFUZ KOÇU (AUSSPRACHE-TRAINER & ÇOKLU FONETİK MOTORU) ---
  bindPronunciationCoach() {
    this.pronState = {
      entry: null,
      mode: 'word', // 'word' | 'sentence'
      isTrainerSession: false,
      trainerCards: [],
      trainerIndex: 0
    };

    const modal = document.getElementById('modal-pronunciation-coach');
    if (!modal) return;

    document.getElementById('btn-close-pron-modal')?.addEventListener('click', async () => {
      if (window.wmPronunciation && window.wmPronunciation.isRecording) {
        await window.wmPronunciation.stopRecording();
      }
      this.resetPronunciationRecorderUI();
      modal.classList.add('hidden');
      this.navigateBack(this.activeTabId || 'tab-home');
    });

    // Fonetik Motoru Seçici (Hibrit / Wav2Vec2 CTC / MFA Viterbi / Azure)
    const engineSelect = document.getElementById('select-pron-phonetic-engine');
    engineSelect?.addEventListener('change', () => {
      if (window.wmPronunciation) {
        window.wmPronunciation.setSelectedEngine(engineSelect.value);
        const meta = window.wmPronunciation.getSelectedEngineMeta();
        this.showToast(`Fonetik Motoru: ${meta.shortLabel}`);
      }
      const settingsSelect = document.getElementById('select-settings-phonetic-engine');
      if (settingsSelect) settingsSelect.value = engineSelect.value;
      this.syncPronunciationEngineSelectorUI();
    });

    // Wav2Vec2 Neural CTC Modelini Ön Yükle / İndir Butonu
    const preloadBtn = document.getElementById('btn-pron-preload-wav2vec2');
    preloadBtn?.addEventListener('click', async () => {
      if (!window.wmPronunciation) return;
      preloadBtn.disabled = true;
      await window.wmPronunciation.preloadWav2Vec2Model((pct, msg) => {
        const descText = document.getElementById('pron-engine-desc-text');
        if (descText) descText.textContent = msg;
        preloadBtn.textContent = pct >= 100 ? '✓ Wav2Vec2 CTC Hazır' : `⏳ %${pct}`;
      });
      preloadBtn.disabled = false;
      this.syncPronunciationEngineSelectorUI();
    });

    document.getElementById('btn-pron-mode-word')?.addEventListener('click', () => {
      if (!this.pronState.entry) return;
      this.pronState.mode = 'word';
      this.renderPronunciationTarget();
    });

    document.getElementById('btn-pron-mode-sentence')?.addEventListener('click', () => {
      if (!this.pronState.entry) return;
      this.pronState.mode = 'sentence';
      this.renderPronunciationTarget();
    });

    document.getElementById('btn-pron-listen-native')?.addEventListener('click', () => {
      const targetText = this.getCurrentPronunciationTargetText();
      if (targetText && window.wmTTS) {
        window.wmTTS.speak(targetText, 'de-DE');
      }
    });

    document.getElementById('btn-pron-listen-self')?.addEventListener('click', () => {
      if (window.wmPronunciation) {
        window.wmPronunciation.playLastRecording();
      }
    });

    document.getElementById('btn-pron-record-toggle')?.addEventListener('click', () => {
      this.togglePronunciationRecording();
    });

    document.getElementById('btn-pron-prev-word')?.addEventListener('click', async () => {
      if (!this.pronState.isTrainerSession) return;
      if (window.wmPronunciation && window.wmPronunciation.isRecording) {
        await window.wmPronunciation.stopRecording();
      }
      if (this.pronState.trainerIndex > 0) {
        this.pronState.trainerIndex--;
        this.pronState.entry = this.pronState.trainerCards[this.pronState.trainerIndex];
        this.pronState.mode = 'word';
        this.renderPronunciationTarget();
      }
    });

    document.getElementById('btn-pron-next-word')?.addEventListener('click', async () => {
      if (!this.pronState.isTrainerSession) return;
      if (window.wmPronunciation && window.wmPronunciation.isRecording) {
        await window.wmPronunciation.stopRecording();
      }
      if (this.pronState.trainerIndex + 1 < this.pronState.trainerCards.length) {
        this.pronState.trainerIndex++;
        this.pronState.entry = this.pronState.trainerCards[this.pronState.trainerIndex];
        this.pronState.mode = 'word';
        this.renderPronunciationTarget();
      } else {
        this.showToast('Telaffuz antrenmanı tamamlandı! Harika pratik yaptınız. 🎉');
        modal.classList.add('hidden');
        this.navigateBack('tab-games');
      }
    });

    this.syncPronunciationEngineSelectorUI();
  }

  syncPronunciationEngineSelectorUI() {
    if (!window.wmPronunciation) return;
    const selectedId = window.wmPronunciation.getSelectedEngine();
    const meta = window.wmPronunciation.getSelectedEngineMeta();
    const az = window.wmPronunciation.getAzureConfig();

    const engineSelect = document.getElementById('select-pron-phonetic-engine');
    if (engineSelect && engineSelect.value !== selectedId) {
      engineSelect.value = selectedId;
    }

    const engineBadge = document.getElementById('pron-engine-badge');
    if (engineBadge) {
      if (selectedId === 'AZURE_CLOUD') {
        engineBadge.textContent = az.isConfigured
          ? `Azure Cloud GOP (${az.region})`
          : 'Azure Anahtarı Yok • MFA Viterbi Aktif';
      } else {
        engineBadge.textContent = meta.shortLabel || meta.badgeText;
      }
    }

    const descText = document.getElementById('pron-engine-desc-text');
    const preloadBtn = document.getElementById('btn-pron-preload-wav2vec2');

    if (descText) {
      const compactDescMap = {
        HYBRID_ENSEMBLE: 'MFA Viterbi + Wav2Vec2 + Akustik DSP birleşimi',
        WAV2VEC2_CTC: 'Tarayıcı içi Wav2Vec2 Neural CTC fonem analizi',
        MFA_FORCED_ALIGN: 'Montreal Forced Aligner (MFA Viterbi) zaman hizalama',
        AZURE_CLOUD: 'Microsoft Azure Speech GOP bulut değerlendirmesi'
      };
      descText.textContent = compactDescMap[selectedId] || meta.shortLabel || 'Fonetik doğruluk analizi';
    }

    if (preloadBtn) {
      const showNeuralBtn = selectedId === 'WAV2VEC2_CTC' || selectedId === 'HYBRID_ENSEMBLE';
      preloadBtn.classList.toggle('hidden', !showNeuralBtn);
      if (window.wmPronunciation.wav2vec2Status === 'ready') {
        preloadBtn.textContent = '✓ Wav2Vec2 Aktif';
        preloadBtn.classList.add('is-ready');
      } else if (window.wmPronunciation.wav2vec2Status === 'loading') {
        preloadBtn.textContent = `⏳ %${window.wmPronunciation.wav2vec2Progress || 0}`;
        preloadBtn.classList.remove('is-ready');
      } else {
        preloadBtn.textContent = '🧠 Modeli Yükle';
        preloadBtn.classList.remove('is-ready');
      }
    }
  }

  async startPronunciationTrainerSession(selectedDeckIds = null, options = {}) {
    if (!window.WordGameService) return;
    await window.WordGameService.initPool(selectedDeckIds && selectedDeckIds.length > 0 ? selectedDeckIds : 'all');
    const pool = window.WordGameService.poolCards || [];
    const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, 15);

    if (shuffled.length === 0) {
      this.showToast('Pratik yapılacak kelime bulunamadı.');
      return;
    }

    this.pronState.isTrainerSession = true;
    this.pronState.trainerCards = shuffled;
    this.pronState.trainerIndex = 0;
    this.pronState.entry = shuffled[0];
    this.pronState.mode = 'word';

    if (!options.skipRoutePush) {
      this.pushRoute('/fonetik-koc/antrenman', { trainer: true });
    }

    const modal = document.getElementById('modal-pronunciation-coach');
    if (modal) modal.classList.remove('hidden');
    this.renderPronunciationTarget();
  }

  openPronunciationCoach(entry, initialMode = 'word', options = {}) {
    if (!entry) return;
    this.pronState.isTrainerSession = false;
    this.pronState.trainerCards = [];
    this.pronState.trainerIndex = 0;
    this.pronState.entry = entry;
    this.pronState.mode = initialMode === 'sentence' && entry.exampleSentence ? 'sentence' : 'word';

    if (!options.skipRoutePush) {
      const wSlug = encodeURIComponent((entry.germanWord || 'kelime').trim());
      const qMode = this.pronState.mode === 'sentence' ? '?mode=sentence' : '';
      this.pushRoute(`/fonetik-koc/${wSlug}${qMode}`, { word: entry.germanWord, mode: this.pronState.mode });
    }

    const modal = document.getElementById('modal-pronunciation-coach');
    if (modal) modal.classList.remove('hidden');
    this.renderPronunciationTarget();
  }

  getCurrentPronunciationTargetText() {
    const entry = this.pronState?.entry;
    if (!entry) return '';
    if (this.pronState.mode === 'sentence' && entry.exampleSentence) {
      return entry.exampleSentence.replace(/\s*\(.*?\)\s*$/, '').replace(/^\[.*?\]\s*/, '').trim();
    }
    const isNoun = (entry.partOfSpeech || '').toUpperCase() === 'NOUN' || Boolean(entry.article);
    const cleanW = (entry.germanWord || '').replace(/^(der|die|das)\s+/i, '').trim();
    return isNoun && entry.article
      ? `${entry.article} ${cleanW.charAt(0).toUpperCase() + cleanW.slice(1)}`
      : cleanW;
  }

  renderPronunciationTarget() {
    const entry = this.pronState?.entry;
    if (!entry) return;

    this.resetPronunciationRecorderUI();

    // Trainer sayaç ve alt navigasyon görünürlüğü
    const counterEl = document.getElementById('pron-trainer-counter');
    const navEl = document.getElementById('pron-trainer-nav');
    const titleEl = document.getElementById('pron-modal-title');

    if (this.pronState.isTrainerSession) {
      if (titleEl) titleEl.textContent = 'Aussprache-Trainer';
      if (counterEl) {
        counterEl.classList.remove('hidden');
        counterEl.textContent = `${this.pronState.trainerIndex + 1} / ${this.pronState.trainerCards.length}`;
      }
      if (navEl) navEl.classList.remove('hidden');
      const prevBtn = document.getElementById('btn-pron-prev-word');
      if (prevBtn) prevBtn.disabled = this.pronState.trainerIndex === 0;
      const nextBtn = document.getElementById('btn-pron-next-word');
      if (nextBtn) {
        nextBtn.querySelector('span').textContent =
          this.pronState.trainerIndex + 1 >= this.pronState.trainerCards.length ? 'Antrenmanı Bitir ✓' : 'Sonraki Kelime';
      }
    } else {
      if (titleEl) titleEl.textContent = 'Telaffuz Koçu';
      if (counterEl) counterEl.classList.add('hidden');
      if (navEl) navEl.classList.add('hidden');
    }

    // Seçili Fonetik Motoru rozeti ve seçici senkronizasyonu
    this.syncPronunciationEngineSelectorUI();

    // Kelime / Cümle geçiş barı
    const switcher = document.getElementById('pron-mode-switcher');
    const hasSentence = Boolean(entry.exampleSentence && entry.exampleSentence.trim().length > 2);
    if (switcher) {
      switcher.classList.toggle('hidden', !hasSentence);
      document.getElementById('btn-pron-mode-word')?.classList.toggle('active', this.pronState.mode === 'word');
      document.getElementById('btn-pron-mode-sentence')?.classList.toggle('active', this.pronState.mode === 'sentence');
    }

    const targetText = this.getCurrentPronunciationTargetText();
    const targetWordEl = document.getElementById('pron-target-text');
    if (targetWordEl) {
      targetWordEl.textContent = targetText;
      targetWordEl.style.fontSize = this.pronState.mode === 'sentence' ? '1.22rem' : '1.75rem';
    }

    const meaningEl = document.getElementById('pron-target-meaning');
    if (meaningEl) {
      meaningEl.textContent = entry.meaningsTr || entry.meaningsEn || '';
    }

    // Fonetik Analiz (IPA, Türkçe Okunuş, Heceler ve Kritik İpuçları)
    const analysis = window.GermanPhoneticAnalyzer
      ? window.GermanPhoneticAnalyzer.analyzeText(targetText)
      : { ipa: '/-/', trGuide: '-', syllables: [], focusTips: [] };

    const ipaEl = document.getElementById('pron-target-ipa');
    if (ipaEl) ipaEl.textContent = analysis.ipa;

    const trGuideEl = document.getElementById('pron-target-tr-guide');
    if (trGuideEl) trGuideEl.textContent = `Okunuş: ${analysis.trGuide}`;

    // Heceleri nötr (bekleme) durumunda çiz
    const sylContainer = document.getElementById('pron-syllables-container');
    if (sylContainer) {
      sylContainer.innerHTML = analysis.syllables
        .map(
          (syl) => `
          <div class="pron-syl-chip neutral">
            <span class="pron-syl-text">${syl.text}</span>
            <span class="pron-syl-ipa">[${syl.ipa}]</span>
          </div>
        `
        )
        .join('');
    }

    // Kelimeye Özel Fonetik İpuçlarını Çiz
    const tipsBox = document.getElementById('pron-tips-box');
    const tipsList = document.getElementById('pron-tips-list');
    if (tipsBox && tipsList) {
      if (analysis.focusTips && analysis.focusTips.length > 0) {
        tipsBox.classList.remove('hidden');
        tipsList.innerHTML = analysis.focusTips
          .map(
            (t) => `
            <div class="pron-tip-item">
              <strong class="pron-tip-title">${t.title}:</strong>
              <span class="pron-tip-detail">${t.detail}</span>
            </div>
          `
          )
          .join('');
      } else {
        tipsBox.classList.remove('hidden');
        tipsList.innerHTML = `
          <div class="pron-tip-item">
            <strong class="pron-tip-title">Standart Vurgu Kuralı:</strong>
            <span class="pron-tip-detail">İlk heceyi daha baskın okuyun ve ünsüzleri kelime sonunda net çıkarın.</span>
          </div>
        `;
      }
    }

    // Sonuç panelini gizle
    document.getElementById('pron-result-panel')?.classList.add('hidden');
  }

  resetPronunciationRecorderUI() {
    const recBtn = document.getElementById('btn-pron-record-toggle');
    const recBox = document.getElementById('pron-recorder-box');
    const hintEl = document.getElementById('pron-status-hint');
    const bars = document.querySelectorAll('#pron-waveform-bars .wf-bar');

    recBtn?.classList.remove('is-recording');
    recBox?.classList.remove('is-recording');
    if (hintEl) {
      hintEl.textContent = 'Mikrofona dokunun ve Almanca ifadeyi net bir şekilde okuyun';
      hintEl.style.color = 'var(--text-secondary)';
    }
    bars.forEach((b) => {
      b.style.height = '6px';
    });
  }

  async togglePronunciationRecording() {
    if (!window.wmPronunciation) return;
    const recBtn = document.getElementById('btn-pron-record-toggle');
    const recBox = document.getElementById('pron-recorder-box');
    const hintEl = document.getElementById('pron-status-hint');
    const bars = document.querySelectorAll('#pron-waveform-bars .wf-bar');

    if (!window.wmPronunciation.isRecording) {
      // Kaydı Başlat
      try {
        if (navigator.vibrate) navigator.vibrate(15);
        recBtn?.classList.add('is-recording');
        recBox?.classList.add('is-recording');
        if (hintEl) {
          hintEl.textContent = '🔴 Dinleniyor... Okumayı bitirince tekrar dokunun';
          hintEl.style.color = '#FF453A';
        }

        await window.wmPronunciation.startRecording('de-DE', (freqData) => {
          if (!bars || bars.length === 0) return;
          const step = Math.max(1, Math.floor(freqData.length / (bars.length * 2.5)));
          bars.forEach((bar, idx) => {
            const val = freqData[idx * step] || 0;
            const h = Math.max(5, Math.min(38, Math.round((val / 255) * 38)));
            bar.style.height = `${h}px`;
          });
        });

        // Otomatik güvenlik zaman aşımı (8 saniye)
        if (this.pronAutoStopTimer) clearTimeout(this.pronAutoStopTimer);
        this.pronAutoStopTimer = setTimeout(() => {
          if (window.wmPronunciation && window.wmPronunciation.isRecording) {
            this.togglePronunciationRecording();
          }
        }, 8000);
      } catch (err) {
        this.resetPronunciationRecorderUI();
        this.showToast('Mikrofon izni alınamadı. Lütfen tarayıcı ayarlarından mikrofona izin verin.');
      }
    } else {
      // Kaydı Durdur ve Değerlendir
      if (this.pronAutoStopTimer) {
        clearTimeout(this.pronAutoStopTimer);
        this.pronAutoStopTimer = null;
      }
      if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
      recBtn?.classList.remove('is-recording');
      recBox?.classList.remove('is-recording');
      if (hintEl) {
        hintEl.textContent = 'Fonetik motoru ses çerçevelerini hizalıyor...';
        hintEl.style.color = 'var(--brand-blue)';
      }

      const targetText = this.getCurrentPronunciationTargetText();
      const report = await window.wmPronunciation.stopRecordingAndEvaluate(targetText, (statusMsg) => {
        if (hintEl && statusMsg) {
          hintEl.textContent = statusMsg;
          hintEl.style.color = 'var(--brand-blue)';
        }
      });
      this.syncPronunciationEngineSelectorUI();
      this.renderPronunciationEvaluation(report);
    }
  }

  renderPronunciationEvaluation(report) {
    this.resetPronunciationRecorderUI();
    if (!report) return;

    const selfBtn = document.getElementById('btn-pron-listen-self');
    if (selfBtn && report.recordedAudioUrl) {
      selfBtn.disabled = false;
    }

    const hintEl = document.getElementById('pron-status-hint');

    if (!report.hasSpeech) {
      if (hintEl) {
        hintEl.textContent = report.error || 'Net bir konuşma algılanamadı. Tekrar deneyin.';
        hintEl.style.color = '#FF9F0A';
      }
      this.showToast('Ses çok kısık veya kısa algılandı, tekrar deneyin.');
      return;
    }

    if (hintEl) {
      hintEl.textContent = `${report.engineName || 'Fonetik Motoru'} ile analiz tamamlandı!`;
      hintEl.style.color = 'var(--text-secondary)';
    }

    const engineBadge = document.getElementById('pron-engine-badge');
    if (engineBadge && report.engineName) {
      engineBadge.textContent = report.engineName;
    }

    // 1. Hece Kartlarını Renkli Doğruluk Oranlarıyla Güncelle
    const sylContainer = document.getElementById('pron-syllables-container');
    if (sylContainer && Array.isArray(report.syllables)) {
      sylContainer.innerHTML = report.syllables
        .map(
          (syl) => `
          <div class="pron-syl-chip status-${syl.status}">
            <span class="pron-syl-text">${syl.text}</span>
            <span class="pron-syl-ipa">[${syl.ipa}]</span>
            <span class="pron-syl-score">%${syl.score}</span>
          </div>
        `
        )
        .join('');
    }

    // 2. Sonuç Panelini Göster
    const resPanel = document.getElementById('pron-result-panel');
    if (resPanel) resPanel.classList.remove('hidden');

    const scoreCircle = document.getElementById('pron-score-circle');
    const overallVal = document.getElementById('pron-overall-score-val');
    const overall = report.overallScore || 0;

    if (overallVal) overallVal.textContent = `%${overall}`;
    if (scoreCircle) {
      scoreCircle.className = 'pron-score-circle';
      if (overall >= 84) scoreCircle.classList.add('score-good');
      else if (overall >= 64) scoreCircle.classList.add('score-warning');
      else scoreCircle.classList.add('score-bad');
    }

    // 3 Alt Metrik Çubuğu
    const setMetric = (idPrefix, val) => {
      const vEl = document.getElementById(`${idPrefix}-val`);
      const bEl = document.getElementById(`${idPrefix}-bar`);
      const color = val >= 84 ? '#30D158' : val >= 64 ? '#FF9F0A' : '#FF453A';
      if (vEl) {
        vEl.textContent = `%${val}`;
        vEl.style.color = color;
      }
      if (bEl) {
        bEl.style.width = `${val}%`;
        bEl.style.backgroundColor = color;
      }
    };

    setMetric('pron-metric-accuracy', report.accuracyScore || overall);
    setMetric('pron-metric-prosody', report.prosodyScore || overall);
    setMetric('pron-metric-fluency', report.fluencyScore || overall);

    // 4. Fonem Kırılım Çipleri (MFA Viterbi / Wav2Vec2 CTC milisaniye hizalaması ile)
    const phonContainer = document.getElementById('pron-phoneme-breakdown');
    if (phonContainer && Array.isArray(report.syllables)) {
      const allPhonemes = report.syllables.flatMap((s) => s.phonemes || []);
      phonContainer.innerHTML = allPhonemes
        .map((p) => {
          const timeTag =
            p.endMs && p.endMs > p.startMs
              ? `<span class="pp-time-span" title="Zorlamalı Hizalama (Forced Alignment) Aralığı">${p.startMs}–${p.endMs}ms</span>`
              : '';
          return `
          <div class="pron-phoneme-pill status-${p.status || (p.score >= 84 ? 'good' : p.score >= 64 ? 'warning' : 'bad')}">
            <span class="pp-grapheme">${p.grapheme}</span>
            <span class="pp-ipa">/${p.ipa}/</span>
            <strong class="pp-score">%${p.score}</strong>
            ${timeTag}
          </div>
        `;
        })
        .join('');
    }

    // 5. Spesifik Akustik Geri Bildirim Listesi
    const fbList = document.getElementById('pron-feedback-list');
    if (fbList && Array.isArray(report.feedbackTips)) {
      fbList.innerHTML = report.feedbackTips.map((tip) => `<li>${tip}</li>`).join('');
    }
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
