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
    this.cardsFilterDebounceTimer = null;
    this.cardsRenderLimit = 60;
    this.deferredInstallPrompt = null;
    this.currentSearchEntry = null;
    this.activeTabId = 'tab-home';
    this.routeHistoryStack = [];
    this.isHandlingRoute = false;
  }

  escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
    this.bindMasteryAnalyzerModal();
    this.bindGames();
    this.bindPronunciationCoach();
    const deferIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));
    deferIdle(() => {
      if (window.WordGameService) {
        window.WordGameService.initPool();
      }
    });

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

    // Fonetik Motor Seçimi Ayarı
    const azureStatus = document.getElementById('azure-speech-status');
    const settingsEngineSelect = document.getElementById('select-settings-phonetic-engine');

    const engineLabelMap = {
      HYBRID_ENSEMBLE: 'Hibrit Ensemble (Önerilen)',
      WAV2VEC2_CTC: 'Wav2Vec2 Neural CTC (Yapay Zeka)',
      MFA_FORCED_ALIGN: 'MFA / Kaldi Zorlamalı Hizalama',
      AZURE_CLOUD: 'Azure Cloud GOP'
    };

    const updatePhoneticStatusUI = () => {
      let curEng = 'HYBRID_ENSEMBLE';
      if (window.wmPronunciation) {
        curEng = window.wmPronunciation.getSelectedEngine();
      } else {
        try {
          const saved = (localStorage.getItem('wortcoach_phonetic_engine') || '').trim();
          if (engineLabelMap[saved]) curEng = saved;
        } catch (_) {}
      }
      if (settingsEngineSelect) settingsEngineSelect.value = curEng;
      if (azureStatus) {
        const meta = window.wmPronunciation ? window.wmPronunciation.getSelectedEngineMeta() : null;
        azureStatus.textContent = meta ? meta.shortLabel : (engineLabelMap[curEng] || 'Aktif');
        azureStatus.style.color = '#10B981';
      }
    };
    updatePhoneticStatusUI();

    settingsEngineSelect?.addEventListener('change', async () => {
      const chosen = settingsEngineSelect.value;
      if (!window.wmPronunciation && window.WortCoachLoader && typeof window.WortCoachLoader.ensurePronunciation === 'function') {
        try {
          localStorage.setItem('wortcoach_phonetic_engine', chosen);
        } catch (_) {}
        await window.WortCoachLoader.ensurePronunciation().catch(() => {});
      }
      if (window.wmPronunciation) {
        window.wmPronunciation.setSelectedEngine(chosen);
        const meta = window.wmPronunciation.getSelectedEngineMeta();
        this.showToast(`Fonetik Motoru: ${meta.shortLabel} seçildi.`);
      } else {
        this.showToast(`Fonetik Motoru: ${engineLabelMap[chosen] || chosen} seçildi.`);
      }
      updatePhoneticStatusUI();
      this.syncPronunciationEngineSelectorUI();
    });
  }

  async refreshDecksView() {
    await this.renderDecksTab();
    await this.refreshHomeDashboard();
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js?v=3.10.2').then((reg) => {
        reg.update();
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }).catch(() => {});
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

  // --- TEMA YÖNETİMİ (Kalıcı ve Saf Karanlık Mod) ---
  async initTheme() {
    this.applyTheme('dark');
  }

  applyTheme(_theme) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('theme-dark');
    localStorage.setItem('wm_theme', 'dark');
    if (window.wmDB) window.wmDB.setSetting('theme', 'dark');

    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) {
      metaTheme.setAttribute('content', '#0B0D12');
    }
  }

  // --- GERÇEK SAYFA YÖNLENDİRMESİ (HISTORY API / SPA ROUTER) ---
  getTabRouteMap() {
    return {
      'tab-home': '/sozluk',
      'tab-translate': '/ceviri',
      'tab-coach': '/coach',
      'tab-reader': '/okuyucu',
      'tab-profile': '/profil',
      'tab-social': '/sosyal',
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
      '/coach': 'tab-coach',
      '/okuyucu': 'tab-reader',
      '/reader': 'tab-reader',
      '/profil': 'tab-profile',
      '/sosyal': 'tab-social',
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
    document.body.classList.remove('reader-active-mode');
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
    document.getElementById('modal-coach-exercise-player')?.classList.add('hidden');
    document.getElementById('modal-deck-builder')?.classList.add('hidden');
  }

  navigateBack(fallbackTabId = 'tab-home') {
    if (this.routeHistoryStack.length > 0) {
      this.routeHistoryStack.pop();
      window.history.back();
    } else {
      this.switchTab(fallbackTabId);
    }
  }

  closeTopmostOpenModal() {
    // Açık tüm modalları DOM sıralamasına göre tespit et
    const openModals = Array.from(document.querySelectorAll('.modal-backdrop:not(.hidden), .prof-modal-backdrop:not(.hidden)'));
    if (openModals.length > 0) {
      // En son açılan / en üstteki modalı kapat
      const topModal = openModals[openModals.length - 1];

      // Rekabet / Kahoot Oyunundayken Yanlışlıkla Geri Tuşuna Basma Koruması
      if (topModal.id === 'modal-arena-kahoot-game') {
        const isGameInProgress = window.wmSocial && window.wmSocial.kahootState && window.wmSocial.kahootCurrentPhase !== 'podium';
        if (isGameInProgress) {
          const leave = confirm('Müsabakadan ayrılmak istediğinize emin misiniz? Devam eden oyun sonlanacaktır.');
          if (!leave) {
            try {
              window.history.pushState({ modalId: 'modal-arena-kahoot-game' }, '', window.location.hash);
            } catch (_) {}
            return true; // Kullanıcı iptal etti, modal açık kalır
          }
          if (window.wmSocial && window.wmSocial.closeKahootRoomCleanly) {
            window.wmSocial.closeKahootRoomCleanly();
          }
          document.body.classList.remove('arena-game-active');
          return true;
        }
      }

      topModal.classList.add('hidden');
      if (topModal.id === 'modal-arena-kahoot-game') {
        document.body.classList.remove('arena-game-active');
      }
      if (topModal.id === 'modal-game-quiz' || topModal.id === 'modal-cable-game') {
        if (this.gameTimerInterval) {
          clearInterval(this.gameTimerInterval);
          this.gameTimerInterval = null;
        }
      }
      return true; // Modal kapatıldı
    }
    return false; // Açık modal yok
  }

  async initRouter() {
    // Rekabet Odasındayken Kazara Sayfa Yenileme / Çıkma Koruması
    window.addEventListener('beforeunload', (e) => {
      if (window.wmSocial && window.wmSocial.kahootState && window.wmSocial.kahootCurrentPhase !== 'podium') {
        e.preventDefault();
        e.returnValue = 'Müsabakadan ayrılmak istediğinize emin misiniz?';
        return e.returnValue;
      }
    });

    window.addEventListener('popstate', async () => {
      // 1. Mobil / Tarayıcı Geri Tuşu: Eğer açık bir modal varsa önce modalı kapat, sekmeyi değiştirme!
      if (this.closeTopmostOpenModal()) {
        return;
      }
      // 2. Açık modal yoksa normal sekme / rota yönlendirmesini çalıştır
      await this.handleCurrentRoute();
    });

    // İlk yüklemede (F5 yenilemede kullanıcının bulunduğu sekmede kalmasını sağla)
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      let savedTab = 'tab-home';
      try {
        savedTab = localStorage.getItem('wm_active_tab') || 'tab-home';
      } catch (_) {}
      const tabToRoute = this.getTabToRouteMap();
      const initialRoute = tabToRoute[savedTab] || '/sozluk';
      this.pushRoute(initialRoute, {}, true);
    }
    // Evrensel Modal Back-Stack Observer: Herhangi bir modal açıldığında history kaydı oluştur
    try {
      const modalObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            const target = m.target;
            if ((target.classList.contains('modal-backdrop') || target.classList.contains('prof-modal-backdrop')) && !target.classList.contains('hidden')) {
              try {
                window.history.pushState({ modalId: target.id }, '', window.location.hash);
              } catch (_) {}
            }
          }
        }
      });

      document.querySelectorAll('.modal-backdrop, .prof-modal-backdrop').forEach((el) => {
        modalObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
      });
    } catch (_) {}

    await this.handleCurrentRoute();

    try {
      const searchParams = new URLSearchParams(window.location.search || '');
      const sharedText = (searchParams.get('shared_text') || searchParams.get('text') || searchParams.get('shared_url') || '').trim();
      if (sharedText) {
        try {
          window.history.replaceState({}, '', `${window.location.pathname}#/okuyucu`);
        } catch (_) {}
        await this.switchTab('tab-reader', { skipRoutePush: true });
        const readerInput = document.getElementById('reader-input-text');
        if (readerInput) {
          readerInput.value = sharedText;
          document.getElementById('btn-reader-parse')?.click();
        }
      }
    } catch (_) {}
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
    try {
      localStorage.setItem('wm_active_tab', tabId);
    } catch (_) {}
    document.querySelectorAll('.tab-view').forEach((sec) => sec.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-target') === tabId);
    });

    const targetEl = document.getElementById(tabId);
    if (targetEl) targetEl.classList.add('active');

    // Özel Tam Ekran Sekmeler için Body Sınıfları
    document.body.classList.toggle('tab-coach-active', tabId === 'tab-coach');
    document.body.classList.toggle('reader-active-mode', tabId === 'tab-reader');

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

    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const headerEl = document.querySelector('.app-header');
    if (headerEl) headerEl.classList.remove('header-hidden');

    if (tabId === 'tab-home') {
      await this.refreshHomeDashboard();
      if (window.wmSocial) window.wmSocial.updateUI();
    } else if (tabId === 'tab-study') {
      if (window.wmStudy && !options.skipStudyLoad) {
        const curDeckId = window.wmStudy.deckSelect ? window.wmStudy.deckSelect.value : 'all';
        const forceAll = curDeckId !== 'all' || window.wmStudy.filterMode !== 'smart';
        await window.wmStudy.loadSession(curDeckId, forceAll);
      }
    } else if (tabId === 'tab-games') {
      // Kelime Oyunları sekmesi aktif
    } else if (tabId === 'tab-decks') {
      await this.renderDecksTab();
    } else if (tabId === 'tab-cards') {
      await this.renderCardsList();
    } else if (tabId === 'tab-profile') {
      if (window.wmSocial) {
        if (!window.wmSocial.isCloudConnected()) {
          window.wmSocial.openAuthModal('register');
        }
        await window.wmSocial.refreshProfileView();
      }
    } else if (tabId === 'tab-social') {
      if (window.wmSocial) await window.wmSocial.refreshSocialView();
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

  // --- AYARLAR MODALI (Tam Yedekleme, Fonetik Motor & Örnek Veri Sıfırlama) ---
  bindSettingsModal() {
    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      document.getElementById('modal-settings')?.classList.remove('hidden');
    });

    document.getElementById('btn-close-settings-modal')?.addEventListener('click', () => {
      document.getElementById('modal-settings')?.classList.add('hidden');
    });

    document.getElementById('btn-export-full-backup')?.addEventListener('click', async () => {
      try {
        if (!window.wmDB || typeof window.wmDB.exportFullBackup !== 'function') return;
        const data = await window.wmDB.exportFullBackup();
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wortcoach-yedek-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.showToast(`${data.decks.length} deste ve ${data.cards.length} kart yedeklendi.`);
      } catch (e) {
        this.showToast('Yedekleme oluşturulamadı: ' + (e.message || 'Hata'));
      }
    });

    const importFileInput = document.getElementById('input-import-full-backup');
    document.getElementById('btn-import-full-backup')?.addEventListener('click', () => {
      importFileInput?.click();
    });

    importFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const res = await window.wmDB.importFullBackup(parsed, { mode: 'merge' });
        await this.refreshHomeDashboard();
        await this.renderDecksTab();
        await this.renderCardsList();
        if (window.wmStudy && typeof window.wmStudy.populateDeckSelector === 'function') {
          await window.wmStudy.populateDeckSelector();
        }
        this.showToast(`Geri yüklendi: ${res.decksAdded} yeni deste, ${res.cardsAdded} yeni kart (${res.cardsSkipped} mevcut kart korundu).`);
      } catch (err) {
        this.showToast('Yedek geri yüklenemedi: ' + (err.message || 'Geçersiz JSON dosyası'));
      } finally {
        e.target.value = '';
      }
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
            <span> Bunu mu demek istediniz:</span>
          </span>
          <div class="did-you-mean-chips">
            ${similarWords.map((w) => `<button type="button" class="btn-dym-chip" data-word="${w}">${w}</button>`).join('')}
          </div>
        </div>
      `
      : '';

    // Kullanıcının bu kelimeye eklediği özel anlamlar
    const savedCustomMeanings = this.getCustomMeaningsForWord(cleanWord);
    const existingCards = (window.wmDB && typeof window.wmDB.getCardsByExactWord === 'function')
      ? await window.wmDB.getCardsByExactWord(cleanWord)
      : (window.wmDB && typeof window.wmDB.getCardByWord === 'function')
        ? [await window.wmDB.getCardByWord(cleanWord)].filter(Boolean)
        : [];
    const existing = existingCards && existingCards.length > 0 ? existingCards[0] : null;

    // Desteler Listesi
    const decks = await window.wmDB.getAllDecks();
    const currentCardDeckId = existing ? Number(existing.deckId) : null;
    let collabOptHtml = '';
    if (window.wmSocial && window.wmSocial.activeCollabSession) {
      collabOptHtml = `<option value="collab:active" selected>[Ortak Deste] ${this.escapeHtml(window.wmSocial.activeCollabSession.title)}</option>`;
    }
    const deckOptionsHtml = collabOptHtml + decks
      .map((d) => `<option value="${this.escapeHtml(d.id)}" ${(!collabOptHtml && currentCardDeckId === Number(d.id)) ? 'selected' : ''}>${this.escapeHtml(d.name)} (${d.cardCount || 0} kart)</option>`)
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
          <span class="dfb-icon"></span>
          <span>No matches found in local dictionary · Translated by Google</span>
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
            <button type="button" id="btn-fallback-confirm-custom" class="btn-confirm-custom-meaning" title="Ekle"></button>
            <button type="button" id="btn-fallback-cancel-custom" class="btn-cancel-custom-meaning" title="İptal"></button>
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
      const safeArt = this.escapeHtml(art);
      const st = window.getArticleStyle ? window.getArticleStyle(art) : null;
      artBadge.innerHTML = st ? st.badgeHtml : `<span class="badge badge-${safeArt.toLowerCase()}">${safeArt.toUpperCase()}</span>`;
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
      const checkSpan = document.createElement('span');
      checkSpan.className = 'meaning-chip-check';
      const textSpan = document.createElement('span');
      textSpan.className = 'meaning-chip-text';
      textSpan.textContent = val;
      chipEl.appendChild(checkSpan);
      chipEl.appendChild(textSpan);
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
        .map((c) => c.getAttribute('data-val') || c.innerText.replace(/^\s*/, '').trim())
        .filter(Boolean);

      if (selectedMeanings.length === 0) {
        this.showToast('Lütfen karta eklenecek en az bir anlam seçin.');
        return;
      }

      const deckSelect = document.getElementById('fallback-target-deck');
      let targetDeckId = deckSelect ? deckSelect.value : null;

      if (targetDeckId === 'collab:active' && window.wmSocial && window.wmSocial.activeCollabSession) {
        const fullWord = selectedArticle ? `${selectedArticle} ${cleanWord}` : cleanWord;
        await window.wmSocial.addCardToActiveCollab(fullWord, selectedMeanings.join(', '), selectedPos || 'NOUN', '');
        this.showToast(`"${fullWord}" doğrudan ortak desteye eklendi.`);
        return;
      }

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
        pluralForm: this.currentSearchEntry?.germanWord?.toLowerCase() === cleanWord.toLowerCase() ? (this.currentSearchEntry.pluralForm || '') : '',
        partOfSpeech: selectedPos || 'OTHER',
        meaningsTr: finalMeaningsTr,
        meaningsEn: this.currentSearchEntry?.germanWord?.toLowerCase() === cleanWord.toLowerCase() ? (this.currentSearchEntry.meaningsEn || '') : '',
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

      this.showToast(`"${cleanWord}" desteye ve yerel sözlüğe kaydedildi.`);
      await this.refreshHomeDashboard();
      await this.renderDecksTab?.();
      this.executeSearch(cleanWord);
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

  async renderSearchResultCard(entry, searchedTerm, extra = {}) {
    const container = document.getElementById('search-results-container');
    if (!container || !entry) return;

    // "Bunu mu demek istediniz?" ve "Kök kelime" şeritleri
    const didYouMeanHtml = extra && extra.similarWords && extra.similarWords.length > 0
      ? `
        <div class="did-you-mean-bar">
          <span class="dym-label">
            <svg class="svg-icon" style="width:16px; height:16px; color:#FBBF24;"><use href="#icon-bolt"></use></svg>
            <span>Bunu mu demek istediniz:</span>
          </span>
          <div class="did-you-mean-chips">
            ${extra.similarWords.map((w) => `<button type="button" class="btn-dym-chip" data-word="${w}">${w}</button>`).join('')}
          </div>
        </div>
      `
      : '';

    const stemBannerHtml = extra && extra.stem
      ? `<div style="font-size:0.82rem; color:#60A5FA; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); border-radius:10px; padding:8px 12px; margin-bottom:12px;">
           „${searchedTerm}“ çekimli hali için kök kelime bulundu: <strong>${entry.germanWord || searchedTerm}</strong>
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

    const cefrVal = entry.cefr ? String(entry.cefr).toUpperCase().trim() : '';
    const cefrBadge = cefrVal
      ? `<span class="badge badge-cefr" style="background:rgba(99, 102, 241, 0.14); color:#A5B4FC; border:1px solid rgba(99, 102, 241, 0.3); font-weight:700;">${cefrVal}</span>`
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
      ? `<div class="false-friend-box"><span class="ff-icon"></span><span class="ff-text">${confusedPair.note}</span></div>`
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
        return `<button type="button" class="meaning-chip ${isSelected ? 'selected' : ''}" data-type="tr" data-val="${m.replace(/"/g, '&quot;')}"><span class="chip-check-icon"></span><span>${m}</span></button>`;
      })
      .join('');

    // İngilizce Anlam Çipleri: Varsayılan olarak İLK eleman (idx === 0) seçili
    const enChipsHtml = enMeanings
      .map((m, idx) => `<button type="button" class="meaning-chip ${idx === 0 ? 'selected' : ''}" data-type="en" data-val="${m.replace(/"/g, '&quot;')}"><span class="chip-check-icon"></span><span>${m}</span></button>`)
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
    let collabOptHtml = '';
    if (window.wmSocial && window.wmSocial.activeCollabSession) {
      collabOptHtml = `<option value="collab:active" selected>[Ortak Deste] ${this.escapeHtml(window.wmSocial.activeCollabSession.title)}</option>`;
    }
    const deckOptionsHtml = collabOptHtml + decks
      .map((d) => `<option value="${this.escapeHtml(d.id)}" ${(!collabOptHtml && currentCardDeckId === Number(d.id)) ? 'selected' : ''}>${this.escapeHtml(d.name)} (${d.cardCount || 0} kart)</option>`)
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
          ${cefrBadge}
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
            <button type="button" id="btn-confirm-custom-tr-meaning" class="btn-confirm-custom-meaning" title="Ekle"></button>
            <button type="button" id="btn-cancel-custom-tr-meaning" class="btn-cancel-custom-meaning" title="İptal"></button>
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
              ${data.synonyms.map((s) => `<button type="button" class="synonym-chip" data-word="${this.escapeHtml(s)}"><svg class="svg-icon" style="width:13px;height:13px;color:#818CF8;"><use href="#icon-search"></use></svg><span>${this.escapeHtml(s)}</span></button>`).join('')}
            </div>
          `;
        }
        if (data.wordFamily && data.wordFamily.length > 0) {
          thHtml += `
            <div class="sec-row-header" style="margin-top:10px;">
              <span>KELİME AİLESİ (WORTFAMILIE)</span>
            </div>
            <div class="synonym-chips-container">
              ${data.wordFamily.map((w) => `<button type="button" class="synonym-chip wortfamilie-chip" data-word="${this.escapeHtml(w)}"><svg class="svg-icon" style="width:13px;height:13px;color:#34D399;"><use href="#icon-link"></use></svg><span>${this.escapeHtml(w)}</span></button>`).join('')}
            </div>
          `;
        }
        if (data.levels && data.levels.length > 0) {
          const extraTags = window.detectGermanTags ? window.detectGermanTags({ thesaurusLevels: data.levels }) : [];
          const tagsRow = container.querySelector('.wdc-tags-row');
          if (tagsRow && extraTags.length > 0) {
            extraTags.forEach((et) => {
              if (!tagsRow.innerHTML.includes(et.label)) {
                tagsRow.innerHTML += `<span class="badge-nuance ${this.escapeHtml(et.className)}" style="color:${et.color}; background-color:${et.bg}; border:1px solid ${et.border};">${this.escapeHtml(et.label)}</span>`;
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
              const searchInput = document.getElementById('global-search-input');
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
        const iconSpan = document.createElement('span');
        iconSpan.className = 'chip-check-icon';
        const valSpan = document.createElement('span');
        valSpan.textContent = val;
        newChip.appendChild(iconSpan);
        newChip.appendChild(valSpan);
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
      this.showToast(`"${val}" anlamı eklendi ve seçildi.`);
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
        this.showToast(`"${newDeckName.trim()}" destesi oluşturuldu ve seçildi.`);
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

      if (targetDeckId === 'collab:active' && window.wmSocial && window.wmSocial.activeCollabSession) {
        const fullWord = isNoun && canonicalArticle ? `${canonicalArticle} ${cleanWord}` : cleanWord;
        const selectedTrNodes = container.querySelectorAll('#inline-tr-chips .meaning-chip.selected');
        let selectedTr = Array.from(selectedTrNodes).map((c) => c.getAttribute('data-val')).filter(Boolean);
        if (selectedTr.length === 0) selectedTr = trMeanings.slice(0, 1);
        const selectedExCards = container.querySelectorAll('#inline-examples-list .example-radio-card.selected');
        let selectedExList = Array.from(selectedExCards)
          .map((c) => (c.getAttribute('data-ex') || '').replace(/^\[[0-9a-zA-Z,\s–\/\.\-]+\]\s*/i, '').trim())
          .filter(Boolean);
        const finalEx = selectedExList.join(' | ') || (examples[0] ? examples[0].replace(/^\[[0-9a-zA-Z,\s–\/\.\-]+\]\s*/i, '').trim() : '');
        await window.wmSocial.addCardToActiveCollab(fullWord, selectedTr.join(', '), pos, finalEx);
        this.showToast(`"${fullWord}" doğrudan ortak desteye eklendi.`);
        return;
      }

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
          this.showToast(`"${canonicalArticle ? canonicalArticle + ' ' : ''}${cleanWord}" güncellendi.`);
        } else {
          const added = await window.wmDB.addCard(cardPayload);
          existingId = added ? added.id : existingId;
          this.showToast(`"${canonicalArticle ? canonicalArticle + ' ' : ''}${cleanWord}" desteye eklendi! `);
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
              <div class="deck-info-title">${this.escapeHtml(d.name)}</div>
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
        await this.switchTab('tab-study', { skipStudyLoad: true });
        await window.wmStudy.loadSession(dId, true);
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
    document.getElementById('btn-open-struggling-analyzer')?.addEventListener('click', () => {
      this.openMasteryAnalyzerModal('all');
    });

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
      const hasRichCurated = Array.isArray(window.CURATED_CEFR_PACKS) && window.CURATED_CEFR_PACKS[0] && Array.isArray(window.CURATED_CEFR_PACKS[0].cards);
      if (!hasRichCurated && window.WortCoachLoader && typeof window.WortCoachLoader.ensureCuratedPacks === 'function') {
        await window.WortCoachLoader.ensureCuratedPacks().catch(() => {});
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

  // --- KULLANICI ÖLÇÜMÜ & ZORLANANLAR DESTESİ MODALI ---
  bindMasteryAnalyzerModal() {
    const modal = document.getElementById('modal-mastery-analyzer');
    if (!modal || this._masteryModalBound) return;
    this._masteryModalBound = true;

    const closeModal = () => modal.classList.add('hidden');
    document.getElementById('btn-close-mastery-modal')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.getElementById('mastery-deck-filter')?.addEventListener('change', async (e) => {
      const val = e.target.value || 'all';
      const nameInput = document.getElementById('input-struggling-deck-name');
      if (nameInput) {
        if (val === 'all') {
          nameInput.value = 'Zorlanan Kelimeler';
        } else {
          const selText = e.target.options[e.target.selectedIndex]?.textContent?.trim() || 'Deste';
          nameInput.value = `${selText} - Zorlananlar`.slice(0, 60);
        }
      }
      await this.renderMasteryAnalyzer(val);
    });

    document.getElementById('btn-create-struggling-deck')?.addEventListener('click', async () => {
      const selectedIds = Array.from(document.querySelectorAll('#mastery-struggling-list .mastery-word-cb:checked'))
        .map((cb) => Number(cb.value))
        .filter((id) => Number.isFinite(id) && id > 0);

      if (selectedIds.length === 0) {
        this.showToast('Lütfen yeni desteye eklenecek en az bir zorlanan kelime seçin.');
        return;
      }

      const nameInput = document.getElementById('input-struggling-deck-name');
      const deckName = nameInput?.value?.trim() || 'Zorlanan Kelimeler';
      const btn = document.getElementById('btn-create-struggling-deck');
      if (btn) btn.disabled = true;

      try {
        const { deck, addedCount } = await window.wmDB.createStrugglingDeck(deckName, selectedIds);
        if (!addedCount) {
          this.showToast('Seçilen kelimeler zaten öğrenilmiş (İyi/Kolay) veya eklenemedi.');
          return;
        }
        closeModal();
        this.showToast(`"${deck.name}" destesi (${addedCount} zorlanan kelime) oluşturuldu.`);
        await this.renderDecksTab();
        await this.refreshHomeDashboard();
        await this.renderCardsList();
        await this.switchTab('tab-study', { skipStudyLoad: true });
        if (window.wmStudy) {
          window.wmStudy.filterMode = 'smart';
          localStorage.setItem('wortcoach_study_filter', 'smart');
          window.wmStudy.updateFilterBarUI();
          await window.wmStudy.loadSession(deck.id, true);
        }
      } catch (err) {
        this.showToast(`Deste oluşturulamadı: ${err.message || 'Hata'}`);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    document.getElementById('btn-study-struggling-now')?.addEventListener('click', async () => {
      const deckId = document.getElementById('mastery-deck-filter')?.value || 'all';
      closeModal();
      if (window.wmStudy) {
        window.wmStudy.filterMode = 'struggling_only';
        localStorage.setItem('wortcoach_study_filter', 'struggling_only');
        window.wmStudy.updateFilterBarUI();
      }
      await this.switchTab('tab-study', { skipStudyLoad: true });
      if (window.wmStudy) {
        await window.wmStudy.loadSession(deckId, true);
      }
    });
  }

  async openMasteryAnalyzerModal(initialDeckId = 'all') {
    const modal = document.getElementById('modal-mastery-analyzer');
    if (!modal) return;
    this.bindMasteryAnalyzerModal();

    const filterSelect = document.getElementById('mastery-deck-filter');
    const decks = await window.wmDB.getAllDecks();
    if (filterSelect) {
      filterSelect.innerHTML = `<option value="all">Tüm Desteler</option>` +
        decks.map((d) => `<option value="${this.escapeHtml(d.id)}">${this.escapeHtml(d.name)}</option>`).join('');
      const hasDeck = decks.some((d) => String(d.id) === String(initialDeckId));
      filterSelect.value = hasDeck ? String(initialDeckId) : 'all';

      const nameInput = document.getElementById('input-struggling-deck-name');
      if (nameInput) {
        if (filterSelect.value === 'all') {
          nameInput.value = 'Zorlanan Kelimeler';
        } else {
          const activeDeck = decks.find((d) => String(d.id) === filterSelect.value);
          nameInput.value = activeDeck ? `${activeDeck.name} - Zorlananlar`.slice(0, 60) : 'Zorlanan Kelimeler';
        }
      }
    }

    modal.classList.remove('hidden');
    await this.renderMasteryAnalyzer(filterSelect?.value || 'all');
  }

  async renderMasteryAnalyzer(deckId = 'all') {
    const summary = await window.wmDB.getMasterySummary(deckId);
    const elStruggling = document.getElementById('mastery-stat-struggling');
    const elLearning = document.getElementById('mastery-stat-learning');
    const elMastered = document.getElementById('mastery-stat-mastered');
    const elPct = document.getElementById('mastery-pct-label');
    const elFill = document.getElementById('mastery-progress-fill');
    const elList = document.getElementById('mastery-struggling-list');

    if (elStruggling) elStruggling.textContent = String(summary.strugglingCount);
    if (elLearning) elLearning.textContent = String(summary.learningCount);
    if (elMastered) elMastered.textContent = String(summary.masteredCount);
    if (elPct) elPct.textContent = `%${summary.masteryPct}`;
    if (elFill) elFill.style.width = `${summary.masteryPct}%`;

    if (!elList) return;
    if (!summary.strugglingCards || summary.strugglingCards.length === 0) {
      elList.innerHTML = `<div style="padding:14px; text-align:center; color:var(--text-muted); font-size:0.84rem;">Bu kapsamda zorlanan kelime bulunamadı. Tekrar veya oyunlarda hata yapılan kelimeler burada listelenir.</div>`;
      return;
    }

    elList.innerHTML = summary.strugglingCards.map((card) => {
      const m = card._mastery || {};
      const artPrefix = card.article ? `${this.escapeHtml(card.article)} ` : '';
      const wordText = this.escapeHtml(card.germanWord || '');
      const meaningText = this.escapeHtml(card.turkishMeaning || '');
      const reasons = [];
      if (m.lapses > 0) reasons.push(`${m.lapses} tekrar`);
      if (m.hardCount > 0) reasons.push(`${m.hardCount} zor`);
      if (m.gameWrong > 0) reasons.push(`${m.gameWrong} oyun hata`);
      if (reasons.length === 0) reasons.push('Tekrar gerekli');

      return `
        <label class="mastery-word-row">
          <input type="checkbox" class="mastery-word-cb" value="${Number(card.id)}" checked />
          <div style="flex:1; min-width:0;">
            <div style="font-size:0.88rem; font-weight:800; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${artPrefix}${wordText}</div>
            <div style="font-size:0.76rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${meaningText} &middot; ${this.escapeHtml(reasons.join(', '))}</div>
          </div>
          <span class="mastery-score-badge">Zorluk ${Number(m.difficultyScore || 0)}</span>
        </label>
      `;
    }).join('');
  }

  async renderCuratedPacksModal() {
    const container = document.getElementById('curated-packs-container');
    if (!container) return;

    const hasRichCurated = Array.isArray(window.CURATED_CEFR_PACKS) && window.CURATED_CEFR_PACKS[0] && Array.isArray(window.CURATED_CEFR_PACKS[0].cards);
    if (!hasRichCurated && window.WortCoachLoader && typeof window.WortCoachLoader.ensureCuratedPacks === 'function') {
      container.innerHTML = '<div style="text-align:center; padding:18px; color:var(--text-muted); font-size:0.85rem;">Hazır paketler yükleniyor...</div>';
      await window.WortCoachLoader.ensureCuratedPacks().catch(() => {});
    }

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
              <div class="deck-info-title">${this.escapeHtml(d.name)}</div>
              <div class="deck-info-count">${d.cardCount} kart</div>
            </div>
          </div>
          <div class="deck-item-actions">
            <button class="icon-btn-ghost btn-deck-menu" data-deck-id="${this.escapeHtml(d.id)}" title="Deste İşlemleri">
              <svg class="svg-icon"><use href="#icon-more-vertical"></use></svg>
            </button>
            <div class="deck-actions-dropdown hidden" id="deck-menu-${this.escapeHtml(d.id)}">
              <button type="button" class="deck-dropdown-item btn-action-edit-deck" data-deck-id="${this.escapeHtml(d.id)}" data-deck-name="${this.escapeHtml(d.name)}">
                <svg class="svg-icon" style="color:var(--brand-blue);"><use href="#icon-edit"></use></svg>
                <span>Düzenle</span>
              </button>
              <button type="button" class="deck-dropdown-item btn-action-social-publish" data-deck-id="${d.id}">
                <svg class="svg-icon" style="color:#10B981;"><use href="#nav-icon-social"></use></svg>
                <span>Sosyalde Paylaş</span>
              </button>
              <button type="button" class="deck-dropdown-item btn-action-1v1-deck" data-deck-id="${d.id}">
                <svg class="svg-icon" style="color:#EF4444;"><use href="#icon-cable"></use></svg>
                <span>1v1 Kapışma Başlat</span>
              </button>
              <button type="button" class="deck-dropdown-item btn-action-kahoot-deck" data-deck-id="${d.id}">
                <svg class="svg-icon" style="color:#8B5CF6;"><use href="#nav-icon-games"></use></svg>
                <span>Kahoot Canlı Oyun</span>
              </button>
              <button type="button" class="deck-dropdown-item btn-action-collab-deck" data-deck-id="${d.id}">
                <svg class="svg-icon" style="color:var(--brand-blue-hover);"><use href="#icon-sparkle"></use></svg>
                <span>Ortak Çalışmaya Aç</span>
              </button>
              <button type="button" class="deck-dropdown-item btn-action-share-deck btn-share-deck" data-deck-id="${d.id}">
                <svg class="svg-icon" style="color:var(--brand-blue);"><use href="#icon-share"></use></svg>
                <span>Dosya Olarak Dışa Aktar</span>
              </button>
              <button type="button" class="deck-dropdown-item item-delete btn-action-delete-deck" data-deck-id="${this.escapeHtml(d.id)}" data-deck-name="${this.escapeHtml(d.name)}">
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
        await this.switchTab('tab-study', { skipStudyLoad: true });
        await window.wmStudy.loadSession(dId, true);
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

    // Menü: Sosyalde Paylaş
    container.querySelectorAll('.btn-action-social-publish').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dId = Number(btn.getAttribute('data-deck-id'));
        container.querySelectorAll('.deck-actions-dropdown').forEach((m) => m.classList.add('hidden'));
        if (window.wmSocial) {
          await window.wmSocial.openPublishDeckModal();
          const sel = document.getElementById('select-publish-target-deck');
          if (sel) sel.value = String(dId);
        }
      });
    });

    // Menü: 1v1 Kapışma Başlat
    container.querySelectorAll('.btn-action-1v1-deck').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dId = Number(btn.getAttribute('data-deck-id'));
        container.querySelectorAll('.deck-actions-dropdown').forEach((m) => m.classList.add('hidden'));
        if (window.wmSocial) {
          try {
            await window.wmSocial.start1v1MatchAsHost(dId);
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });

    // Menü: Kahoot Grup Oyunu Başlat
    container.querySelectorAll('.btn-action-kahoot-deck').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dId = Number(btn.getAttribute('data-deck-id'));
        container.querySelectorAll('.deck-actions-dropdown').forEach((m) => m.classList.add('hidden'));
        if (window.wmSocial) {
          try {
            await window.wmSocial.createKahootRoom(dId);
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });

    // Menü: Ortak Çalışmaya Aç
    container.querySelectorAll('.btn-action-collab-deck').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dId = Number(btn.getAttribute('data-deck-id'));
        container.querySelectorAll('.deck-actions-dropdown').forEach((m) => m.classList.add('hidden'));
        if (window.wmSocial) {
          try {
            await this.switchTab('tab-social');
            document.querySelector('.social-subtab-btn[data-target-pane="pane-social-collab"]')?.click();
            await window.wmSocial.initCollabSession(dId);
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });

    // Menü: Paylaş (Dosya Olarak)
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
      if (this.cardsFilterDebounceTimer) clearTimeout(this.cardsFilterDebounceTimer);
      this.cardsFilterDebounceTimer = setTimeout(() => {
        this.renderCardsList(filterInput.value.trim(), true);
      }, 200);
    });

    // Kategori filtre pilleri bir kez bağlanır
    document.querySelectorAll('#cards-pos-filter-bar .pos-filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#cards-pos-filter-bar .pos-filter-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeCardsPosFilter = pill.getAttribute('data-pos') || 'ALL';
        const currentQuery = document.getElementById('cards-filter-input')?.value || '';
        this.renderCardsList(currentQuery, true);
      });
    });

    // Tek olay delegasyonu (yüzlerce kartta sıfır listener kopyalaması)
    const listContainer = document.getElementById('all-cards-list');
    listContainer?.addEventListener('click', async (e) => {
      const target = e.target;
      if (!target) return;

      const loadMoreBtn = target.closest('#btn-cards-load-more');
      if (loadMoreBtn) {
        this.cardsRenderLimit = (this.cardsRenderLimit || 60) + 60;
        const currentQuery = document.getElementById('cards-filter-input')?.value?.trim() || '';
        await this.renderCardsList(currentQuery, false);
        return;
      }

      const emptyCuratedBtn = target.closest('#btn-empty-open-curated');
      if (emptyCuratedBtn) {
        document.getElementById('modal-curated-packs')?.classList.remove('hidden');
        this.renderCuratedPacksModal();
        return;
      }

      const editBtn = target.closest('.btn-card-edit');
      if (editBtn) {
        e.stopPropagation();
        const cardId = Number(editBtn.getAttribute('data-id'));
        const card = this._renderedCardsById?.get(cardId);
        if (card) this.openEditCardModal(card);
        return;
      }

      const ttsBtn = target.closest('.btn-card-tts');
      if (ttsBtn) {
        e.stopPropagation();
        window.wmTTS.speak(ttsBtn.getAttribute('data-word'), 'de-DE');
        return;
      }

      const pronBtn = target.closest('.btn-card-pronounce');
      if (pronBtn) {
        e.stopPropagation();
        const cardId = Number(pronBtn.getAttribute('data-id'));
        const card = this._renderedCardsById?.get(cardId);
        if (card) this.openPronunciationCoach(card, 'word');
        return;
      }

      const delBtn = target.closest('.btn-card-delete');
      if (delBtn) {
        e.stopPropagation();
        const id = Number(delBtn.getAttribute('data-id'));
        if (confirm('Kartı silmek istiyor musunuz?')) {
          await window.wmDB.deleteCard(id);
          this.showToast('Kart silindi.');
          const currentQuery = document.getElementById('cards-filter-input')?.value?.trim() || '';
          await this.renderCardsList(currentQuery, false);
          await this.renderDecksTab();
          await this.refreshHomeDashboard();
        }
        return;
      }

      const cardEl = target.closest('.deck-item-card');
      if (cardEl && !target.closest('.deck-item-actions')) {
        const cardId = Number(cardEl.getAttribute('data-card-id'));
        const card = this._renderedCardsById?.get(cardId);
        if (card) this.openEditCardModal(card);
      }
    });
  }

  async renderCardsList(filterQuery = '', resetLimit = true) {
    const cards = await window.wmDB.getAllCards();
    const container = document.getElementById('all-cards-list');
    const subtitle = document.getElementById('cards-total-subtitle');
    if (!container) return;

    if (!this.activeCardsPosFilter) this.activeCardsPosFilter = 'ALL';
    if (resetLimit || !this.cardsRenderLimit) this.cardsRenderLimit = 60;

    // 1 & 3. Tek geçişte kategori sayaçları + filtreleme
    let nounCount = 0;
    let verbCount = 0;
    let adjCount = 0;
    let phraseCount = 0;
    const filtered = [];
    const activePos = this.activeCardsPosFilter;
    const q = filterQuery ? filterQuery.toLowerCase().trim() : '';

    this._renderedCardsById = new Map();
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      this._renderedCardsById.set(Number(c.id), c);

      const pos = (c.partOfSpeech || '').toUpperCase();
      const isNoun = pos === 'NOUN';
      const isVerb = pos === 'VERB';
      const isAdj = pos === 'ADJECTIVE' || pos === 'ADJ';
      const isPhrase = pos === 'PHRASE' || (c.germanWord || '').includes(' ');

      if (isNoun) nounCount++;
      if (isVerb) verbCount++;
      if (isAdj) adjCount++;
      if (isPhrase) phraseCount++;

      if (activePos !== 'ALL') {
        if (activePos === 'NOUN' && !isNoun) continue;
        if (activePos === 'VERB' && !isVerb) continue;
        if (activePos === 'ADJECTIVE' && !isAdj) continue;
        if (activePos === 'PHRASE' && !isPhrase) continue;
      }

      if (q) {
        const gw = (c.germanWord || '').toLowerCase();
        const tr = (c.meaningsTr || '').toLowerCase();
        if (!gw.includes(q) && !tr.includes(q)) continue;
      }

      filtered.push(c);
    }

    const countAllEl = document.getElementById('count-pos-all');
    if (countAllEl) countAllEl.textContent = cards.length;
    const countNounEl = document.getElementById('count-pos-noun');
    if (countNounEl) countNounEl.textContent = nounCount;
    const countVerbEl = document.getElementById('count-pos-verb');
    if (countVerbEl) countVerbEl.textContent = verbCount;
    const countAdjEl = document.getElementById('count-pos-adjective');
    if (countAdjEl) countAdjEl.textContent = adjCount;
    const countPhraseEl = document.getElementById('count-pos-phrase');
    if (countPhraseEl) countPhraseEl.textContent = phraseCount;

    if (subtitle) {
      subtitle.textContent = `${filtered.length} / ${cards.length} Kelime Kartı Listeleniyor`;
    }

    if (filtered.length === 0) {
      if (cards.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:40px 20px; background:rgba(255,255,255,0.03); border-radius:var(--radius-xl); border:1px solid var(--border-subtle); margin-top:10px;">
            <div style="margin-bottom:12px;">
              <svg class="svg-icon" style="width:42px; height:42px; color:var(--text-muted);"><use href="#icon-cards"></use></svg>
            </div>
            <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-primary); margin:0 0 6px;">Henüz Kelime Kartınız Yok</h3>
            <p style="font-size:0.84rem; color:var(--text-secondary); max-width:320px; margin:0 auto 18px;">Sözlükten kelime arayıp ekleyebilir veya hazır destelerden istediğiniz seviyeyi tek tıkla yükleyebilirsiniz.</p>
            <button type="button" class="btn-primary" id="btn-empty-open-curated" style="margin:0 auto; padding:10px 20px; border-radius:var(--radius-pill); font-weight:800;">
              <svg class="svg-icon" style="width:16px;height:16px;"><use href="#icon-sparkle"></use></svg>
              <span>Hazır Desteleri İncele</span>
            </button>
          </div>
        `;
      } else {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Eşleşen kart bulunamadı.</div>`;
      }
      return;
    }

    const visibleSlice = filtered.slice(0, this.cardsRenderLimit);
    const hasMore = filtered.length > visibleSlice.length;

    const cardsHtml = visibleSlice
      .map((c) => {
        let trMeaning = (c.meaningsTr && c.meaningsTr !== '-') ? c.meaningsTr : '';
        if (!trMeaning && window.DictionaryService) {
          try {
            const syn = window.DictionaryService.synthesizeInstantEntry(c.germanWord);
            if (syn && syn.meaningsTr) trMeaning = syn.meaningsTr;
          } catch (_) {}
        }
        if (!trMeaning) trMeaning = c.meaningsEn || 'Anlam belirtilmedi';

        const artStyle = window.getArticleStyle ? window.getArticleStyle(c.article) : null;
        const safeArt = this.escapeHtml(c.article);
        const artBadge = artStyle
          ? artStyle.badgeHtml
          : (safeArt ? `<span class="badge badge-${safeArt}">${safeArt}</span>` : '');

        const maturity = window.getCardMaturity ? window.getCardMaturity(c) : null;
        const maturityBadge = maturity ? maturity.badgeHtml : '';

        const enrichment = window.getGrammarEnrichment ? window.getGrammarEnrichment(c.germanWord) : null;
        const rektionBadge = enrichment ? `<span class="badge-rektion" style="font-size:0.7rem; padding:2px 6px;">${this.escapeHtml(enrichment.badge)}</span>` : '';

        const safeWord = this.escapeHtml(c.germanWord);
        const safePos = this.escapeHtml(c.partOfSpeech);
        const safeTr = this.escapeHtml(trMeaning);
        const safePlural = c.pluralForm ? this.escapeHtml(c.pluralForm) : '';

        return `
        <div class="deck-item-card" data-card-id="${c.id}" style="margin-bottom:8px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:10px;" title="Düzenlemek için tıklayın">
          <div style="flex:1; min-width:0; padding-right:4px;">
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
              <span class="lang-badge lang-badge-de">
                <svg class="flag-svg"><use href="#flag-de"></use></svg>
                <span>DE</span>
              </span>
              ${artBadge}
              <strong style="font-size:1.05rem; color:var(--text-primary); word-break:break-word;">${safeWord}</strong>
              <span class="badge badge-pos-${safePos}">${safePos}</span>
              ${maturityBadge}
              ${rektionBadge}
              ${c.isReflexive ? `<span class="badge-reflexiv">Reflexiv</span>` : ''}
            </div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px; word-break:break-word;">${safeTr}</div>
            ${safePlural ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Çoğul: ${safePlural}</div>` : ''}
          </div>
          <div class="deck-item-actions" style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
            <button type="button" class="card-action-icon-btn btn-card-edit" data-id="${c.id}" title="Düzenle" aria-label="Düzenle">
              <svg class="svg-icon"><use href="#icon-edit"></use></svg>
            </button>
            <button type="button" class="card-action-icon-btn btn-card-tts" data-word="${safeWord}" title="Dinle" aria-label="Dinle">
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

    const loadMoreHtml = hasMore
      ? `<button type="button" id="btn-cards-load-more" class="btn-secondary" style="width:100%; margin:12px 0 4px; padding:12px; border-radius:var(--radius-lg); font-weight:800;">Daha Fazla Göster (${visibleSlice.length} / ${filtered.length})</button>`
      : '';

    container.innerHTML = cardsHtml + loadMoreHtml;
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
        this.showToast(`"${updatedCard.germanWord}" güncellendi.`);
        this.editingCardId = null;
        await this.renderCardsList();
        await this.refreshHomeDashboard();
        await this.renderDecksTab();
        return;
      }

      const selectedDeckVal = document.getElementById('card-deck-select')?.value;
      if (selectedDeckVal && selectedDeckVal.startsWith('club_deck:')) {
        const parts = selectedDeckVal.split(':');
        const clubId = parts[1];
        const deckId = parts[2];
        const fullWord = finalArticle ? `${finalArticle} ${finalWord}` : finalWord;
        const mean = document.getElementById('card-meaning-tr')?.value || document.getElementById('card-meaning-en')?.value || '';
        const ex = document.getElementById('card-example-input')?.value || '';

        if (window.wmSocial && window.wmSocial.addCardToClubDeck) {
          await window.wmSocial.addCardToClubDeck(clubId, deckId, {
            lemma: fullWord,
            contextMeaning: mean,
            pos,
            sourceSentence: ex
          });
        }
        modal.classList.add('hidden');
        this.showToast(`"${fullWord}" kulüp ortak destesine eklendi.`);
        return;
      }

      if (selectedDeckVal === 'collab:active' && window.wmSocial && window.wmSocial.activeCollabSession) {
        const fullWord = finalArticle ? `${finalArticle} ${finalWord}` : finalWord;
        const mean = document.getElementById('card-meaning-tr')?.value || document.getElementById('card-meaning-en')?.value || '';
        const ex = document.getElementById('card-example-input')?.value || '';
        await window.wmSocial.addCardToActiveCollab(fullWord, mean, pos, ex);
        modal.classList.add('hidden');
        this.showToast(`"${fullWord}" doğrudan ortak desteye eklendi.`);
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

    let collabOptHtml = '';
    if (window.wmSocial && window.wmSocial.activeCollabSession) {
      collabOptHtml = `<option value="collab:active" selected>[Ortak Deste] ${window.wmSocial.activeCollabSession.title} (${window.wmSocial.activeCollabSession.code})</option>`;
    }

    // Kulüp Ortak Desteleri: Kullanıcının üye olduğu kulüplerin desteleri
    let clubDecksOptHtml = '';
    if (window.wmSocial && typeof window.wmSocial.getMyClubDecksForSelect === 'function') {
      try {
        const clubDecks = await window.wmSocial.getMyClubDecksForSelect();
        if (clubDecks.length > 0) {
          clubDecksOptHtml += '<optgroup label="Kulüp Ortak Desteleri">';
          for (const cd of clubDecks) {
            clubDecksOptHtml += `<option value="club_deck:${this.escapeHtml(cd.clubId)}:${this.escapeHtml(cd.deckId)}">${this.escapeHtml(cd.deckTitle)} (${this.escapeHtml(cd.clubName.toUpperCase())} ORTAK DESTESİ)</option>`;
          }
          clubDecksOptHtml += '</optgroup>';
        }
      } catch (_) {}
    }

    let localDecksHtml = '<optgroup label="Kişisel Destelerim">';
    localDecksHtml += decks.map((d) => `<option value="${this.escapeHtml(d.id)}">${this.escapeHtml(d.name)}</option>`).join('');
    localDecksHtml += '</optgroup>';

    select.innerHTML = collabOptHtml + clubDecksOptHtml + localDecksHtml;
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
    const headerBtn = document.getElementById('btn-install-pwa');
    const homeBanner = document.getElementById('pwa-install-top-banner');
    const homeBtn = document.getElementById('btn-home-install-pwa');
    const dismissBtn = document.getElementById('btn-dismiss-pwa-banner');

    const isStandalone = () => Boolean(
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
      window.navigator.standalone === true
    );

    const updateInstallButtons = () => {
      if (isStandalone()) {
        if (headerBtn) headerBtn.style.display = 'none';
        if (homeBanner) homeBanner.style.display = 'none';
        return;
      }

      const dismissed = sessionStorage.getItem('wm_pwa_banner_dismissed') === '1';
      if (headerBtn) {
        headerBtn.classList.remove('hidden');
        headerBtn.style.display = 'inline-flex';
      }
      if (homeBanner) {
        if (dismissed) {
          homeBanner.style.display = 'none';
        } else {
          homeBanner.classList.remove('hidden');
          homeBanner.style.display = 'flex';
        }
      }
    };

    const runDirectInstall = async () => {
      const promptEvent = window.__deferredPwaPrompt || this.deferredInstallPrompt;
      if (promptEvent) {
        try {
          await promptEvent.prompt();
          const choice = await promptEvent.userChoice;
          if (choice && choice.outcome === 'accepted') {
            window.__deferredPwaPrompt = null;
            this.deferredInstallPrompt = null;
            sessionStorage.setItem('wm_pwa_banner_dismissed', '1');
            updateInstallButtons();
            this.showToast('WortCoach uygulaması kuruluyor...');
          }
          return;
        } catch (_) {}
      }

      // beforeinstallprompt hazır değilse (örneğin uygulama zaten kurulu veya tarayıcı izin vermiyor)
      const isAlreadyInstalled = Boolean(
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true
      );
      if (isAlreadyInstalled) {
        this.showToast('WortCoach zaten cihazınızda uygulama olarak kurulu.');
      } else {
        this.showToast('Tarayıcınız doğrudan kurulum desteği sunmuyor veya uygulama zaten yüklü.');
      }
    };

    if (window.__deferredPwaPrompt) {
      this.deferredInstallPrompt = window.__deferredPwaPrompt;
    }
    updateInstallButtons();

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      window.__deferredPwaPrompt = e;
      this.deferredInstallPrompt = e;
      updateInstallButtons();
    });

    document.addEventListener('pwa-install-available', () => {
      this.deferredInstallPrompt = window.__deferredPwaPrompt;
      updateInstallButtons();
    });

    headerBtn?.addEventListener('click', runDirectInstall);
    homeBtn?.addEventListener('click', runDirectInstall);

    dismissBtn?.addEventListener('click', () => {
      sessionStorage.setItem('wm_pwa_banner_dismissed', '1');
      if (homeBanner) {
        homeBanner.style.display = 'none';
      }
    });

    window.addEventListener('appinstalled', () => {
      window.__deferredPwaPrompt = null;
      this.deferredInstallPrompt = null;
      sessionStorage.setItem('wm_pwa_banner_dismissed', '1');
      updateInstallButtons();
      this.showToast('WortCoach başarıyla cihazınıza kuruldu.');
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
          this.showToast('Paylaşım kodu panoya kopyalandı! Arkadaşınıza gönderebilirsiniz. ');
        }
      };
    }

    // 2. Panoya Kopyala
    const btnCopy = document.getElementById('btn-share-copy');
    if (btnCopy) {
      btnCopy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(jsonStr);
          this.showToast('Deste kodu panoya kopyalandı! ');
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
        this.showToast('Deste JSON dosyası indirildi! ');
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
        const batchPayloads = [];
        for (const c of parsedData.cards) {
          const cleanW = (c.germanWord || '').trim();
          if (cleanW) {
            batchPayloads.push({
              ...c,
              germanWord: cleanW,
              deckId: newDeck.id
            });
          }
        }

        let addedCount = 0;
        if (typeof window.wmDB.addCardsBatch === 'function') {
          const savedList = await window.wmDB.addCardsBatch(batchPayloads);
          addedCount = savedList.length;
        } else {
          for (const payload of batchPayloads) {
            await window.wmDB.addCard(payload);
            addedCount++;
          }
        }

        modal.classList.add('hidden');
        this.showToast(`"${parsedData.deckName}" (${addedCount} kart) başarıyla içe aktarıldı.`);
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

Object.assign(
  WortCoachApp.prototype,
  window.WortCoachReaderUIMixin || {},
  window.WortCoachGamesUIMixin || {},
  window.WortCoachPronunciationUIMixin || {}
);

window.WortCoachApp = WortCoachApp;

window.addEventListener('DOMContentLoaded', () => {
  window.wmApp = new WortCoachApp();
  window.wmApp.init();
});


// Akıllı Scroll Dinleyicisi: Doğal mobil scroll akışı ile WortCoach üst barını gizle/göster
(function initHeaderScrollHide() {
  let lastScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  let ticking = false;

  const getHeader = () => document.querySelector('.app-header');

  const isGameOrModalActive = () => {
    return document.body.classList.contains('arena-game-active') ||
           document.body.classList.contains('has-active-game') ||
           document.body.classList.contains('tab-coach-active') ||
           document.body.classList.contains('reader-active-mode') ||
           document.querySelector('.modal-backdrop:not(.hidden)');
  };

  const hideHeader = () => {
    if (isGameOrModalActive()) return;
    const h = getHeader();
    if (h && !h.classList.contains('header-hidden')) {
      h.classList.add('header-hidden');
    }
  };

  const showHeader = () => {
    const h = getHeader();
    if (h && h.classList.contains('header-hidden')) {
      h.classList.remove('header-hidden');
    }
  };

  // 1. Wheel (Fare Tekerleği) Dinleyicisi
  window.addEventListener('wheel', (e) => {
    if (isGameOrModalActive()) return;
    if (e.deltaY > 6) {
      hideHeader();
    } else if (e.deltaY < -6) {
      showHeader();
    }
  }, { passive: true });

  // 2. Doğal Tarayıcı Scroll Dinleyicisi (Dokunmatik jest zincirini ASLA engellemez)
  const onScrollEvent = () => {
    if (isGameOrModalActive()) return;

    const currentY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

    // Sayfa tepesindeyken header her zaman açık tutulur
    if (currentY <= 20) {
      showHeader();
    } else if (currentY > 60) {
      const delta = currentY - lastScrollY;
      // Aşağı kaydırırken gizle
      if (delta > 8) {
        hideHeader();
      }
      // Yukarı kaydırırken göster
      else if (delta < -8) {
        showHeader();
      }
    }

    lastScrollY = Math.max(0, currentY);
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(onScrollEvent);
      ticking = true;
    }
  }, { passive: true });

  // 3. Mobil Klavye Visual Viewport Tespiti
  if (window.visualViewport) {
    const initialH = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', () => {
      const isKeyboard = window.visualViewport.height < initialH - 120;
      document.body.classList.toggle('keyboard-open', isKeyboard);
    });
  }
})();
