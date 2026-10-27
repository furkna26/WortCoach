/**
 * WortCoach - Sosyal, ELO/Lig, İstatistik, Kulüpler, 1v1 Kapışma, Kahoot ve İşbirlikçi Deste Motoru
 * - Cloudflare Worker Proxy ve Supabase & Worker KV ile tam entegrasyon
 * - Çevrimdışı ve Yerel Dayanıklılık (Offline-First Fallback)
 * - Dinamik ELO & 8 Kademeli Lig Sistemi (Tahta -> Grossmeister)
 * - Zaman Filtreli 4 Bireysel İstatistik (Artikel, Bağlam, Çeviklik, Hafıza)
 * - Arkadaş Ekleme, Arama, Kabul, Liderlik Sıralaması ve Arkadaş Destelerini İçe Aktarma
 * - Herkese Açık Desteler (Topluluk Kütüphanesi: Deste Adı, Yazar, Tarih, Kelime Sayısı)
 * - Kulüpler, Sınıflar & Klanlar (Kulüp Desteleri Havuzu, Ortak Çalışma)
 * - 1v1 Zamana Karşı Deste Kapışması (Host Deste Belirler, Davet Kodu, ELO Ödülü)
 * - Kahoot Tarzı Canlı Grup Oyunu (PIN, Lobi, 4 Renkli Buton, Ara Sıralama, Final Podyumu)
 * - İşbirlikçi Deste Düzenleme (Ortak Çalışma Kodu, Birlikte Kart Ekleme)
 * - Sıfır emoji, kurumsal, analitik ve pedagojik tasarım.
 */

(function () {
  const $ = (id) => document.getElementById(id);

  // 1. LİG TANIMLARI
  const RANK_TIERS = [
    { name: 'Tahta', min: 0, max: 799, color: '#A0826C' },
    { name: 'Demir', min: 800, max: 999, color: '#9CA3AF' },
    { name: 'Bronz', min: 1000, max: 1199, color: '#CD7F32' },
    { name: 'Gümüş', min: 1200, max: 1499, color: '#D1D5DB' },
    { name: 'Altın', min: 1500, max: 1799, color: '#F59E0B' },
    { name: 'Platin', min: 1800, max: 2099, color: '#06B6D4' },
    { name: 'Elmas', min: 2100, max: 2399, color: '#8B5CF6' },
    { name: 'Grossmeister', min: 2400, max: 99999, color: '#EF4444' }
  ];

  function getTierForElo(elo) {
    const val = Math.max(0, Number(elo) || 0);
    for (const t of RANK_TIERS) {
      if (val >= t.min && val <= t.max) return t;
    }
    return RANK_TIERS[RANK_TIERS.length - 1];
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return 'Bugün';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (_) {
      return String(dateStr).slice(0, 10);
    }
  }

  class WortCoachSocial {
    constructor() {
      this.user = null;
      this.profile = null;
      this.currentFilterRange = '7d';
      this.friendFilterRange = '7d';
      this.viewingFriendProfile = null;
      this.sendingDeckTargetFriend = null;
      this.viewingPreviewDeck = null;
      this.viewingClub = null;
      this.activeCollabSession = null;
      this.autoSyncTimer = null;

      // 1v1 Maç Durumu
      this.match1v1State = {
        timerId: null,
        remainingSec: 60,
        words: [],
        currentIndex: 0,
        correctCount: 0,
        wrongCount: 0,
        myScore: 0,
        roomPin: null
      };

      // Kahoot Oyun Durumu
      this.kahootState = {
        pin: null,
        isHost: false,
        players: [],
        words: [],
        duration: 15,
        currentIndex: 0,
        timerId: null,
        remainingSec: 15,
        scores: {},
        currentAnswerCorrect: false
      };

      this.localProfileKey = 'wortcoach_local_profile';
      this.localStatsKey = 'wortcoach_local_daily_stats';
      this.localPublicDecksKey = 'wortcoach_local_public_decks';
      this.localClubsKey = 'wortcoach_local_clubs';
      this.sessionKey = 'wortcoach_session';
      this.profileKey = 'wortcoach_profile';
    }

    async init() {
      this.initLocalProfileFallback();

      try {
        const savedSession = JSON.parse(localStorage.getItem(this.sessionKey));
        const savedProfile = JSON.parse(localStorage.getItem(this.profileKey));
        if (savedSession && savedSession.user) {
          this.user = savedSession.user;
          this.profile = savedProfile || null;
          this.loadProfile().then(() => {
            this.autoSyncDecksToCloud().catch(() => {});
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('Oturum okunamadı:', e.message);
      }

      this.updateUI();
      this.attachEventListeners();
      this.initNotificationSystem();
      setTimeout(() => {
        this.populateDeckSelects().catch(() => {});
        if (this.isCloudConnected()) {
          this.autoSyncDecksToCloud().catch(() => {});
        }
      }, 1200);
    }

    // Backend Proxy Çağrısı (Tarayıcıda anahtar bulundurmaz)
    async apiCall(endpoint, payload = {}) {
      const apiBase = (window.WORTCOACH_CONFIG && window.WORTCOACH_CONFIG.COACH_API) || 'https://wortcoach-proxy.mosmandurmaz26.workers.dev';
      const res = await fetch(`${apiBase}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'İşlem gerçekleştirilemedi.');
      }
      return data;
    }

    initLocalProfileFallback() {
      let lp = null;
      try {
        lp = JSON.parse(localStorage.getItem(this.localProfileKey));
      } catch (_) {}

      if (!lp) {
        const rnd = Math.floor(1000 + Math.random() * 9000);
        lp = {
          id: 'local_user',
          username: 'Misafir_' + rnd,
          friend_code: 'WC#' + rnd,
          elo: 1000,
          rank_tier: 'Bronz',
          streak_days: 0,
          last_active_date: null,
          deck_privacy: 'friends'
        };
        localStorage.setItem(this.localProfileKey, JSON.stringify(lp));
      }
      this.localProfile = lp;
    }

    getActiveProfile() {
      return this.profile || this.localProfile;
    }

    isCloudConnected() {
      return !!(this.user && this.profile);
    }

    async loadProfile() {
      if (!this.user || !this.user.id) return;
      try {
        const data = await this.apiCall('profile/get', { userId: this.user.id });
        if (data.ok && data.profile) {
          this.profile = data.profile;
          localStorage.setItem(this.profileKey, JSON.stringify(data.profile));
          this.updateUI();
        }
      } catch (e) {
        console.warn('Profil yenilenemedi:', e.message);
      }
    }

    updateUI() {
      const prof = this.getActiveProfile();
      const tier = getTierForElo(prof.elo);

      // Profil sekmesi alanları
      if ($('prof-username-display')) $('prof-username-display').textContent = prof.username;
      if ($('prof-friend-code-display')) $('prof-friend-code-display').textContent = prof.friend_code || 'WC#0000';
      if ($('social-my-friend-code')) $('social-my-friend-code').textContent = prof.friend_code || 'WC#0000';
      if ($('prof-elo-display')) $('prof-elo-display').textContent = prof.elo;
      if ($('prof-tier-badge')) {
        $('prof-tier-badge').textContent = tier.name;
        $('prof-tier-badge').style.borderColor = tier.color;
        $('prof-tier-badge').style.color = tier.color;
      }
      if ($('prof-streak-display')) $('prof-streak-display').textContent = (prof.streak_days || 0) + ' Gün Seri';

      // Sonraki lig ilerlemesi
      const nextTierIndex = RANK_TIERS.findIndex(t => t.name === tier.name) + 1;
      if (nextTierIndex < RANK_TIERS.length) {
        const nextTier = RANK_TIERS[nextTierIndex];
        const diff = nextTier.min - prof.elo;
        if ($('prof-tier-progress-text')) {
          $('prof-tier-progress-text').textContent = `${nextTier.name} ligine ${Math.max(0, diff)} ELO kaldı`;
        }
        if ($('prof-tier-progress-fill')) {
          const currentTier = tier;
          const range = nextTier.min - currentTier.min;
          const prog = prof.elo - currentTier.min;
          const pct = Math.max(5, Math.min(100, Math.round((prog / (range || 1)) * 100)));
          $('prof-tier-progress-fill').style.width = pct + '%';
        }
      } else {
        if ($('prof-tier-progress-text')) $('prof-tier-progress-text').textContent = 'En üst ligdesiniz (Grossmeister)';
        if ($('prof-tier-progress-fill')) $('prof-tier-progress-fill').style.width = '100%';
      }

      // Deste gizliliği seçimi
      const privSelect = $('profile-deck-privacy-select');
      if (privSelect) {
        privSelect.value = prof.deck_privacy || 'friends';
      }

      // Giriş / Çıkış buton durumu
      const authBtn = $('btn-profile-auth-trigger');
      if (authBtn) {
        if (this.isCloudConnected()) {
          authBtn.textContent = 'Çıkış Yap';
          authBtn.className = 'prof-auth-link-btn prof-auth-danger';
        } else {
          authBtn.textContent = 'Giriş Yap / Kaydol';
          authBtn.className = 'prof-auth-link-btn';
        }
      }

      // Hesapsız kullanıcı Hoş Geldiniz Bannerı görünürlüğü
      const welcomeCard = $('welcome-guest-card');
      if (welcomeCard) {
        if (this.isCloudConnected()) {
          welcomeCard.classList.add('hidden');
        } else {
          welcomeCard.classList.remove('hidden');
        }
      }
    }

    openAuthModal(mode = 'register') {
      const modal = $('modal-auth');
      if (!modal) return;
      modal.classList.remove('hidden');
      if (mode === 'login') {
        $('tab-btn-auth-login')?.click();
      } else {
        $('tab-btn-auth-register')?.click();
      }
    }

    // Dinamik ELO Hesaplama
    calculateEloChange({ isCorrect, responseTimeMs = 0, comboCount = 0, isHardWord = false }) {
      if (!isCorrect) return -10;
      let change = 12;
      if (responseTimeMs > 0 && responseTimeMs < 3000) change += 5;
      if (comboCount >= 5) change = Math.round(change * 1.25);
      if (isHardWord) change += 8;
      return change;
    }

    // Aktivite & İstatistik Kaydetme
    async recordActivity({ type, isCorrect, responseTimeMs = 0, comboCount = 0, isHardWord = false, customEloDelta = null }) {
      const eloDelta = customEloDelta !== null ? customEloDelta : this.calculateEloChange({ isCorrect, responseTimeMs, comboCount, isHardWord });

      if (this.isCloudConnected()) {
        try {
          const res = await this.apiCall('stats/record', {
            userId: this.user.id,
            type: type || 'review',
            isCorrect: !!isCorrect,
            responseTimeMs: responseTimeMs || 1500,
            eloDelta
          });
          const data = res.data;
          if (data) {
            const oldTier = this.profile.rank_tier;
            this.profile.elo = data.new_elo;
            this.profile.rank_tier = data.new_tier;
            this.profile.streak_days = data.streak_days;
            localStorage.setItem(this.profileKey, JSON.stringify(this.profile));
            this.updateUI();

            if (data.tier_promoted) {
              this.showRankPromotionModal(oldTier, data.new_tier);
            }
          }
          return;
        } catch (err) {
          console.warn('Buluta stat kaydı başarısız, yerel kaydediliyor:', err.message);
        }
      }

      // Çevrimdışı / Misafir Fallback
      const lp = this.localProfile;
      const oldElo = lp.elo;
      const oldTier = lp.rank_tier;
      lp.elo = Math.max(0, lp.elo + eloDelta);
      const newTierObj = getTierForElo(lp.elo);
      lp.rank_tier = newTierObj.name;

      const today = new Date().toISOString().slice(0, 10);
      if (!lp.last_active_date) {
        lp.streak_days = 1;
        lp.last_active_date = today;
      } else if (lp.last_active_date !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (lp.last_active_date === yesterday) {
          lp.streak_days = (lp.streak_days || 0) + 1;
        } else {
          lp.streak_days = 1;
        }
        lp.last_active_date = today;
      }
      localStorage.setItem(this.localProfileKey, JSON.stringify(lp));
      this.saveLocalDailyStat(today, type, isCorrect, responseTimeMs);
      this.updateUI();

      if (lp.elo > oldElo && newTierObj.name !== oldTier) {
        this.showRankPromotionModal(oldTier, newTierObj.name);
      }
    }

    saveLocalDailyStat(dateStr, type, isCorrect, responseTimeMs) {
      let stats = {};
      try {
        stats = JSON.parse(localStorage.getItem(this.localStatsKey)) || {};
      } catch (_) {}

      if (!stats[dateStr]) {
        stats[dateStr] = {
          artikel_correct: 0,
          artikel_total: 0,
          cloze_correct: 0,
          cloze_total: 0,
          review_correct: 0,
          review_total: 0,
          total_response_time_ms: 0,
          total_questions_answered: 0
        };
      }
      const st = stats[dateStr];
      if (type === 'artikel') {
        st.artikel_total += 1;
        if (isCorrect) st.artikel_correct += 1;
      } else if (type === 'cloze') {
        st.cloze_total += 1;
        if (isCorrect) st.cloze_correct += 1;
      } else {
        st.review_total += 1;
        if (isCorrect) st.review_correct += 1;
      }
      st.total_questions_answered += 1;
      st.total_response_time_ms += (responseTimeMs || 1500);
      localStorage.setItem(this.localStatsKey, JSON.stringify(stats));
    }

    showRankPromotionModal(oldTier, newTier) {
      const modal = $('modal-rank-promotion');
      if (!modal) return;
      if ($('rank-promo-old')) $('rank-promo-old').textContent = oldTier;
      if ($('rank-promo-new')) $('rank-promo-new').textContent = newTier;
      modal.classList.remove('hidden');
    }

    // 4 Ana İstatistiği Getir
    async getAggregatedStats(userId, range = '7d') {
      if (this.isCloudConnected() && userId !== 'local_user') {
        try {
          const res = await this.apiCall('stats/summary', { userId, timeRange: range });
          if (res.ok) {
            return {
              artikelAcc: res.artikelAcc,
              clozeAcc: res.clozeAcc,
              agilitySec: res.agilitySec,
              retentionRate: res.retentionRate,
              totalQuestions: res.totalQuestions
            };
          }
        } catch (e) {
          console.warn('İstatistik özeti sunucudan alınamadı:', e.message);
        }
      }

      // Yerel İstatistik Toplama
      let stats = {};
      try {
        stats = JSON.parse(localStorage.getItem(this.localStatsKey)) || {};
      } catch (_) {}

      const now = new Date();
      let minDate = '1970-01-01';
      if (range === '1d') {
        minDate = now.toISOString().slice(0, 10);
      } else if (range === '7d' || range === '1w') {
        minDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      } else if (range === '30d' || range === '1m') {
        minDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      } else if (range === '365d' || range === '1y') {
        minDate = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
      }

      let sumArtCor = 0, sumArtTot = 0;
      let sumClozeCor = 0, sumClozeTot = 0;
      let sumRevCor = 0, sumRevTot = 0;
      let sumTime = 0, sumQ = 0;

      for (const [dateStr, row] of Object.entries(stats)) {
        if (dateStr >= minDate) {
          sumArtCor += row.artikel_correct || 0;
          sumArtTot += row.artikel_total || 0;
          sumClozeCor += row.cloze_correct || 0;
          sumClozeTot += row.cloze_total || 0;
          sumRevCor += row.review_correct || 0;
          sumRevTot += row.review_total || 0;
          sumTime += row.total_response_time_ms || 0;
          sumQ += row.total_questions_answered || 0;
        }
      }

      const artikelAcc = sumArtTot > 0 ? Math.round((sumArtCor / sumArtTot) * 100) : 0;
      const clozeAcc = sumClozeTot > 0 ? Math.round((sumClozeCor / sumClozeTot) * 100) : 0;
      const retentionRate = sumRevTot > 0 ? Math.round((sumRevCor / sumRevTot) * 100) : 0;
      const agilitySec = sumQ > 0 ? ((sumTime / sumQ) / 1000).toFixed(2) : '0.00';

      return { artikelAcc, clozeAcc, agilitySec, retentionRate, totalQuestions: sumQ };
    }

    async renderStatsCards(userId, range) {
      const stats = await this.getAggregatedStats(userId, range);
      if ($('stat-val-genus')) $('stat-val-genus').textContent = '%' + stats.artikelAcc;
      if ($('stat-sub-genus')) $('stat-sub-genus').textContent = `${stats.totalQuestions} soru cevaplandı`;

      if ($('stat-val-kontext')) $('stat-val-kontext').textContent = '%' + stats.clozeAcc;
      if ($('stat-sub-kontext')) $('stat-sub-kontext').textContent = `${stats.totalQuestions} boşluk tamamlandı`;

      if ($('stat-val-tempo')) $('stat-val-tempo').textContent = stats.agilitySec + ' sn';
      if ($('stat-sub-tempo')) $('stat-sub-tempo').textContent = `${stats.totalQuestions} yanıtın ortalaması`;

      if ($('stat-val-ausdauer')) $('stat-val-ausdauer').textContent = '%' + stats.retentionRate;
      if ($('stat-sub-ausdauer')) $('stat-sub-ausdauer').textContent = `${stats.totalQuestions} tekrar kartı`;
    }

    // =========================================================================
    // YEREL VERİTABANI GÜVENLİ ERİŞİM KÖPRÜSÜ (SAFE DAO ADAPTERS)
    // =========================================================================
    async getLocalDecksSafe() {
      if (!window.wmDB) return [];
      try {
        if (typeof window.wmDB.getAllDecks === 'function') {
          return await window.wmDB.getAllDecks();
        }
        if (window.wmDB.decks && typeof window.wmDB.decks.getAll === 'function') {
          return await window.wmDB.decks.getAll();
        }
      } catch (e) {
        console.warn('Yerel desteler okunamadı:', e.message);
      }
      return [];
    }

    async getLocalCardsSafe(deckId = null) {
      if (!window.wmDB) return [];
      let all = [];
      try {
        if (typeof window.wmDB.getAllCards === 'function') {
          all = await window.wmDB.getAllCards();
        } else if (window.wmDB.cards && typeof window.wmDB.cards.getAll === 'function') {
          all = await window.wmDB.cards.getAll();
        }
      } catch (e) {
        console.warn('Yerel kartlar okunamadı:', e.message);
      }
      if (deckId !== null && deckId !== undefined) {
        return all.filter(c => Number(c.deckId) === Number(deckId));
      }
      return all;
    }

    async addLocalDeckSafe(title) {
      if (!window.wmDB) return null;
      try {
        if (typeof window.wmDB.createDeck === 'function') {
          return await window.wmDB.createDeck(title);
        }
        if (window.wmDB.decks && typeof window.wmDB.decks.add === 'function') {
          return await window.wmDB.decks.add({ title, name: title });
        }
      } catch (e) {
        console.warn('Yerel deste oluşturulamadı:', e.message);
      }
      return null;
    }

    async addLocalCardSafe(card) {
      if (!window.wmDB) return null;
      try {
        if (typeof window.wmDB.addCard === 'function') {
          return await window.wmDB.addCard({
            deckId: Number(card.deckId) || 1,
            germanWord: card.lemma || card.front || '',
            meaningsTr: card.contextMeaning || card.back || '',
            partOfSpeech: card.pos || 'OTHER',
            example: card.sourceSentence || card.example || ''
          });
        }
        if (window.wmDB.cards && typeof window.wmDB.cards.add === 'function') {
          return await window.wmDB.cards.add(card);
        }
      } catch (e) {
        console.warn('Yerel kart eklenemedi:', e.message);
      }
      return null;
    }

    // =========================================================================
    // DESTE SEÇİM ÇÖZÜMLEYİCİSİ (YEREL DESTELER + HAZIR KÜRATÖRLÜ PAKETLER)
    // =========================================================================
    async getDeckWithCardsBySelection(selectionVal) {
      const val = String(selectionVal || '').trim();
      if (val.startsWith('pack:')) {
        const packCode = val.slice(5);
        const packs = Array.isArray(window.CURATED_CEFR_PACKS) ? window.CURATED_CEFR_PACKS : [];
        const pack = packs.find(p => p.code === packCode) || packs[0];
        if (!pack) throw new Error('Hazır deste paketi bulunamadı.');
        const words = (pack.cards || []).map(c => ({
          lemma: (c.article ? `${c.article} ${c.germanWord}` : c.germanWord) || '',
          contextMeaning: c.meaningsTr || '',
          pos: c.partOfSpeech || 'NOUN',
          sourceSentence: c.exampleSentence || ''
        }));
        return {
          id: val,
          title: pack.name,
          name: pack.name,
          description: pack.description || '',
          words,
          cards: words
        };
      }

      const decks = await this.getLocalDecksSafe();
      const deck = decks.find(d => String(d.id) === val || Number(d.id) === Number(val));
      if (!deck) {
        // Fallback: Hazır paket varsa ilk hazır paketi dön
        const packs = Array.isArray(window.CURATED_CEFR_PACKS) ? window.CURATED_CEFR_PACKS : [];
        if (packs.length > 0) {
          return this.getDeckWithCardsBySelection('pack:' + packs[0].code);
        }
        throw new Error('Seçilen deste bulunamadı.');
      }

      let rawCards = await this.getLocalCardsSafe(deck.id);
      const words = rawCards.map(c => ({
        lemma: (c.article && !String(c.germanWord || '').toLowerCase().startsWith(c.article.toLowerCase() + ' '))
          ? `${c.article} ${c.germanWord}`
          : (c.germanWord || c.front || c.lemma || ''),
        contextMeaning: c.meaningsTr || c.back || c.contextMeaning || '',
        pos: c.partOfSpeech || c.pos || 'NOUN',
        sourceSentence: c.exampleSentence || c.example || c.sourceSentence || ''
      }));

      return {
        id: deck.id,
        title: deck.name || deck.title || 'Genel Deste',
        name: deck.name || deck.title || 'Genel Deste',
        description: deck.description || '',
        words,
        cards: words
      };
    }

    // =========================================================================
    // DESTE SENKRONİZASYONU & OTOMATİK BULUT SENKRONİZASYONU
    // =========================================================================
    scheduleAutoSync() {
      if (this.autoSyncTimer) clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = setTimeout(() => {
        this.populateDeckSelects().catch(() => {});
        if (this.isCloudConnected()) {
          this.autoSyncDecksToCloud().catch(() => {});
        }
      }, 1500);
    }

    async autoSyncDecksToCloud() {
      if (!this.isCloudConnected()) return 0;
      const localDecks = await this.getLocalDecksSafe();
      const prof = this.getActiveProfile();
      const payloadDecks = [];

      // Sadece kullanıcının kendi yerel desteleri ve kartları senkronize edilir.
      // Küratörlü hazır paketler (A1, A2, vb.) asla bulut destelerine gönderilmez.
      for (const d of localDecks) {
        const cards = await this.getLocalCardsSafe(d.id);
        if (!cards || cards.length === 0) continue;
        const words = cards.map(c => ({
          lemma: (c.article && !String(c.germanWord || '').toLowerCase().startsWith(c.article.toLowerCase() + ' '))
            ? `${c.article} ${c.germanWord}`
            : (c.germanWord || c.front || ''),
          contextMeaning: c.meaningsTr || c.back || '',
          pos: c.partOfSpeech || c.pos || 'NOUN',
          sourceSentence: c.exampleSentence || c.example || ''
        }));
        payloadDecks.push({
          id: d.id,
          title: d.name || d.title || 'Deste',
          description: d.description || '',
          words
        });
      }

      if (payloadDecks.length === 0) {
        return 0;
      }

      try {
        const res = await this.apiCall('decks/sync_all', {
          ownerId: this.user.id,
          username: prof.username || 'Kullanıcı',
          deckPrivacy: prof.deck_privacy || 'friends',
          decks: payloadDecks
        });
        return res.syncedCount || payloadDecks.length;
      } catch (e) {
        console.warn('Otomatik senkronizasyon hatası:', e.message);
        return 0;
      }
    }

    async syncLocalDeckToCloud(deckSelection, isPublic = false, description = '') {
      const resolved = await this.getDeckWithCardsBySelection(deckSelection);
      if (!resolved.words || resolved.words.length === 0) {
        throw new Error('Seçilen destede henüz kelime bulunmuyor. Lütfen içinde kelime olan bir deste seçin.');
      }

      const prof = this.getActiveProfile();
      const ownerId = this.isCloudConnected() ? this.user.id : (prof.id || 'local_user');
      const authorUsername = prof.username || 'Kullanıcı';

      const payload = {
        ownerId,
        authorUsername,
        title: resolved.title,
        description: description || resolved.description || '',
        isPublic: !!isPublic,
        words: resolved.words
      };

      // Yerel yedek listesini de her zaman güncelle
      let pubList = [];
      try {
        pubList = JSON.parse(localStorage.getItem(this.localPublicDecksKey)) || [];
      } catch (_) {}
      const localPubDeck = {
        id: 'pub_' + Date.now(),
        ownerId,
        title: resolved.title,
        authorUsername,
        description: payload.description,
        isPublic: !!isPublic,
        words: resolved.words,
        wordCount: resolved.words.length,
        createdAt: new Date().toISOString()
      };
      if (isPublic) {
        pubList = pubList.filter(x => !(x.ownerId === ownerId && (x.title || '').toLowerCase() === resolved.title.toLowerCase()));
        pubList.unshift(localPubDeck);
        localStorage.setItem(this.localPublicDecksKey, JSON.stringify(pubList.slice(0, 50)));
      }

      try {
        const res = await this.apiCall('decks/save', payload);
        return res;
      } catch (e) {
        return { ok: true, deckId: localPubDeck.id, offline: true };
      }
    }

    async syncAllDecksToCloud() {
      if (this.isCloudConnected()) {
        const synced = await this.autoSyncDecksToCloud();
        if (synced > 0) return synced;
      }
      const decks = await this.getLocalDecksSafe();
      let count = 0;
      for (const d of decks) {
        const cards = await this.getLocalCardsSafe(d.id);
        if (cards.length > 0) {
          try {
            await this.syncLocalDeckToCloud(d.id, (this.getActiveProfile().deck_privacy === 'public'));
            count++;
          } catch (_) {}
        }
      }
      return count;
    }

    async getUserDecks(ownerId) {
      if (!ownerId) return [];
      try {
        const curId = this.isCloudConnected() ? this.user.id : 'guest';
        const res = await this.apiCall('decks/get', { targetUserId: ownerId, currentUserId: curId });
        return res.decks || [];
      } catch (e) {
        console.warn('Desteler alınamadı:', e.message);
        return [];
      }
    }

    async importDeckToLocal(cloudDeck) {
      const title = cloudDeck.title || cloudDeck.name || 'İçe Aktarılan Deste';
      const createdDeck = await this.addLocalDeckSafe(title);
      const newDeckId = (createdDeck && createdDeck.id) ? createdDeck.id : 1;

      const words = cloudDeck.words_json || cloudDeck.words || cloudDeck.cards || [];
      for (const w of words) {
        await this.addLocalCardSafe({
          deckId: newDeckId,
          lemma: w.lemma || w.front || w.germanWord || '',
          contextMeaning: w.contextMeaning || w.back || w.meaningsTr || '',
          pos: w.pos || w.partOfSpeech || 'NOUN',
          sourceSentence: w.sourceSentence || w.example || w.exampleSentence || ''
        });
      }

      await this.populateDeckSelects();
      if (window.wmApp && window.wmApp.refreshDecksView) {
        await window.wmApp.refreshDecksView();
      }
      return true;
    }

    // =========================================================================
    // HERKESE AÇIK DESTELER (TOPLULUK KÜTÜPHANESİ)
    // =========================================================================
    async getPublicDecks(search = '') {
      try {
        const res = await this.apiCall('decks/public', { search });
        if (res.ok && Array.isArray(res.decks)) return res.decks;
      } catch (e) {
        console.warn('Buluttan açık desteler alınamadı, yerel kontrol ediliyor:', e.message);
      }

      // Yerel fallback
      try {
        const local = JSON.parse(localStorage.getItem(this.localPublicDecksKey)) || [];
        if (search) {
          return local.filter(d => (d.title || '').toLowerCase().includes(search.toLowerCase()) || (d.authorUsername || '').toLowerCase().includes(search.toLowerCase()));
        }
        return local;
      } catch (_) {
        return [];
      }
    }

    async renderPublicDecks() {
      const container = $('public-decks-container');
      if (!container) return;

      const searchInput = $('input-search-public-decks');
      const q = searchInput ? searchInput.value.trim() : '';

      container.innerHTML = '<div style="text-align:center; padding:16px; font-size:0.85rem; color:var(--text-muted);">Herkese açık desteler yükleniyor...</div>';
      const decks = await this.getPublicDecks(q);

      if (decks.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:24px; background:var(--bg-surface); border:1px dashed var(--border-subtle); border-radius:14px;">
            <div style="font-weight:700; font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Henüz Herkese Açık Deste Yok</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">İlk desteyi siz paylaşarak topluluk kütüphanesini başlatabilirsiniz!</div>
            <button type="button" class="btn-primary-compact btn-trigger-pub-deck">İlk Desteni Paylaş</button>
          </div>
        `;
        container.querySelector('.btn-trigger-pub-deck')?.addEventListener('click', () => {
          this.openPublishDeckModal();
        });
        return;
      }

      let html = '';
      const myId = this.isCloudConnected() ? this.user?.id : this.getActiveProfile().id;
      decks.forEach(d => {
        const wCount = d.wordCount || (d.words && d.words.length) || (d.words_json && d.words_json.length) || 0;
        const author = d.authorUsername || d.username || 'Topluluk Yazarı';
        const dateStr = formatDisplayDate(d.createdAt || d.created_at);
        const isOwner = d.ownerId && (d.ownerId === myId || (this.user && d.ownerId === this.user.id));

        html += `
          <div class="public-deck-card" data-pub-id="${d.id}">
            <div class="public-deck-header">
              <div>
                <div class="public-deck-title">${d.title}</div>
                <div class="public-deck-author">Üreten: ${author}</div>
              </div>
              <div class="public-deck-date">${dateStr}</div>
            </div>
            ${d.description ? `<div style="font-size:0.78rem; color:var(--text-secondary); line-height:1.4;">${d.description}</div>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="badge" style="background:var(--accent-primary-soft); color:var(--brand-blue-hover); font-weight:800; font-size:0.75rem; padding:3px 8px; border-radius:6px;">${wCount} Kelime</span>
              <div class="public-deck-actions" style="display:flex; gap:6px;">
                ${isOwner ? `<button type="button" class="btn-remove-pub-deck" data-pub-id="${d.id}" style="padding:4px 8px; font-size:0.75rem; background:#EF4444; border:1px solid #EF4444; color:#fff; border-radius:6px; font-weight:700;">Yayından Kaldır</button>` : ''}
                <button type="button" class="btn-preview-pub-deck" data-pub-id="${d.id}">İncele</button>
                <button type="button" class="btn-import-pub-deck" data-pub-id="${d.id}">Kütüphaneme Ekle</button>
              </div>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;

      // Yayından Kaldırma Butonu
      container.querySelectorAll('.btn-remove-pub-deck').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const did = btn.getAttribute('data-pub-id');
          if (!confirm('Bu desteyi herkese açık kütüphaneden kaldırmak istediğinize emin misiniz?')) return;
          btn.disabled = true;
          btn.textContent = 'Kaldırılıyor...';
          try {
            await this.apiCall('decks/public/remove', { deckId: did, ownerId: myId });
            if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Deste yayından kaldırıldı.');
            await this.renderPublicDecks();
          } catch (err) {
            alert('Hata: ' + err.message);
            btn.disabled = false;
            btn.textContent = 'Yayından Kaldır';
          }
        });
      });

      // Buton olayları
      container.querySelectorAll('.btn-preview-pub-deck').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-pub-id');
          const dObj = decks.find(x => String(x.id) === String(id));
          if (dObj) this.openPreviewDeckModal(dObj);
        });
      });

      container.querySelectorAll('.btn-import-pub-deck').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-pub-id');
          const dObj = decks.find(x => String(x.id) === String(id));
          if (!dObj) return;

          e.currentTarget.disabled = true;
          e.currentTarget.textContent = 'Ekleniyor...';
          try {
            await this.importDeckToLocal(dObj);
            e.currentTarget.textContent = 'Eklendi';
            if (window.wmApp && window.wmApp.showToast) {
              window.wmApp.showToast(`"${dObj.title}" destesi kütüphanenize eklendi.`);
            }
          } catch (err) {
            alert('Hata: ' + err.message);
            e.currentTarget.disabled = false;
            e.currentTarget.textContent = 'Kütüphaneme Ekle';
          }
        });
      });
    }

    openPreviewDeckModal(deckObj) {
      this.viewingPreviewDeck = deckObj;
      const modal = $('modal-preview-public-deck');
      if (!modal) return;

      if ($('preview-deck-title')) $('preview-deck-title').textContent = deckObj.title;
      const wList = deckObj.words || deckObj.words_json || [];
      const author = deckObj.authorUsername || deckObj.username || 'Topluluk';
      if ($('preview-deck-meta')) $('preview-deck-meta').textContent = `Üreten: ${author} · ${wList.length} Kelime`;

      const listContainer = $('preview-deck-words-container');
      if (listContainer) {
        if (wList.length === 0) {
          listContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; text-align:center;">Bu destede kelime bulunmuyor.</div>';
        } else {
          let html = '';
          wList.forEach((w, idx) => {
            html += `
              <div style="background:var(--bg-surface); padding:8px 12px; border-radius:8px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <span style="font-weight:800; font-size:0.9rem; color:var(--text-primary);">${w.lemma || w.front}</span>
                  <span style="font-size:0.75rem; color:var(--text-muted); margin-left:6px;">(${w.pos || 'Kelime'})</span>
                </div>
                <div style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">${w.contextMeaning || w.back}</div>
              </div>
            `;
          });
          listContainer.innerHTML = html;
        }
      }

      modal.classList.remove('hidden');
    }

    async openPublishDeckModal() {
      const modal = $('modal-publish-deck');
      if (!modal) return;
      await this.populateDeckSelects();
      modal.classList.remove('hidden');
    }

    // =========================================================================
    // KULÜPLER / SINIFLAR / KLANLAR MOTORU
    // =========================================================================
    async getClubsList() {
      try {
        const res = await this.apiCall('clubs/list', { userId: this.user ? this.user.id : 'guest' });
        if (res.ok && Array.isArray(res.clubs)) return res.clubs;
      } catch (e) {
        console.warn('Kulüp listesi alınamadı, yerel kullanılıyor:', e.message);
      }

      try {
        return JSON.parse(localStorage.getItem(this.localClubsKey)) || [];
      } catch (_) {
        return [];
      }
    }

    async renderClubs() {
      const container = $('clubs-list-container');
      if (!container) return;

      container.innerHTML = '<div style="text-align:center; padding:16px; font-size:0.85rem; color:var(--text-muted);">Kulüpler yükleniyor...</div>';
      const clubs = await this.getClubsList();

      if (clubs.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:24px; background:var(--bg-surface); border:1px dashed var(--border-subtle); border-radius:14px;">
            <div style="font-weight:700; font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Kayıtlı Kulüp Bulunmuyor</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">Sınıf arkadaşlarınız veya çalışma grubunuz için yeni bir kulüp kurabilirsiniz.</div>
            <button type="button" class="btn-primary-compact btn-trigger-create-club">+ Yeni Kulüp Kur</button>
          </div>
        `;
        container.querySelector('.btn-trigger-create-club')?.addEventListener('click', () => {
          $('modal-create-club')?.classList.remove('hidden');
        });
        return;
      }

      let html = '';
      const myId = this.isCloudConnected() ? this.user?.id : this.getActiveProfile().id;

      clubs.forEach(c => {
        const memberCount = (c.members && c.members.length) || 1;
        const deckCount = (c.decks && c.decks.length) || 0;
        const isMember = (c.members || []).some(m => m.id === myId || (this.user && m.id === this.user.id));
        const isPublic = c.isPublic !== false && c.access !== 'code';

        let actionBtnHtml = '';
        if (isMember) {
          actionBtnHtml = `<button type="button" class="btn-primary-compact btn-open-club-view" data-club-id="${c.id}" style="padding:6px 12px; font-size:0.78rem;">İncele</button>`;
        } else if (isPublic) {
          actionBtnHtml = `<button type="button" class="btn-primary-compact btn-direct-join-club" data-club-id="${c.id}" style="padding:6px 12px; font-size:0.78rem; background:#10B981; border-color:#10B981;">Tıkla Katıl</button>`;
        } else {
          actionBtnHtml = `<button type="button" class="btn-primary-compact btn-trigger-code-join" data-club-code="${c.code || ''}" style="padding:6px 12px; font-size:0.78rem; background:var(--brand-blue);">Kodla Katıl</button>`;
        }

        const subText = isPublic
          ? `<span class="badge" style="background:rgba(16,185,129,0.15); color:#10B981; font-size:0.72rem; padding:2px 6px; border-radius:4px; font-weight:700;">Herkese Açık</span>${c.description ? ' · ' + c.description : ''}`
          : `<span class="badge" style="background:rgba(239,68,68,0.15); color:#EF4444; font-size:0.72rem; padding:2px 6px; border-radius:4px; font-weight:700;">Özel Kulüp</span>${isMember ? ` · Kod: <strong>${c.code}</strong>` : ''}${c.description ? ' · ' + c.description : ''}`;

        html += `
          <div class="club-card" data-club-id="${c.id}">
            <div style="flex:1;">
              <div class="club-info-title">${c.name}</div>
              <div class="club-info-sub" style="margin-top:2px;">${subText}</div>
              <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">${memberCount} Üye · ${deckCount} Kulüp Destesi</div>
            </div>
            <div style="margin-left:8px;">
              ${actionBtnHtml}
            </div>
          </div>
        `;
      });
      container.innerHTML = html;

      // İncele ve Kart Tıklaması
      container.querySelectorAll('.btn-open-club-view, .club-card').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.btn-direct-join-club') || e.target.closest('.btn-trigger-code-join')) return;
          e.stopPropagation();
          const cid = el.getAttribute('data-club-id');
          const cObj = clubs.find(x => String(x.id) === String(cid));
          if (cObj) this.openClubDetailModal(cObj);
        });
      });

      // Herkese Açık Doğrudan Katıl
      container.querySelectorAll('.btn-direct-join-club').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const cid = btn.getAttribute('data-club-id');
          btn.disabled = true;
          btn.textContent = 'Katılınıyor...';
          try {
            const updated = await this.joinClubDirect(cid);
            if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(`"${updated.name}" kulübüne katıldınız.`);
            await this.renderClubs();
            this.openClubDetailModal(updated);
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
            btn.textContent = 'Tıkla Katıl';
          }
        });
      });

      // Kod ile Katıl Butonu
      container.querySelectorAll('.btn-trigger-code-join').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = btn.getAttribute('data-club-code');
          const input = $('input-join-club-code');
          if (input && code) input.value = code;
          $('modal-join-club')?.classList.remove('hidden');
        });
      });
    }

    async createClub(name, description, access = 'public') {
      const prof = this.getActiveProfile();
      const ownerId = this.isCloudConnected() ? this.user.id : (prof.id || 'local_user');
      const ownerUsername = prof.username || 'Kurucu';

      try {
        const res = await this.apiCall('clubs/create', { name, description, ownerId, ownerUsername, access });
        return res.club;
      } catch (e) {
        // Yerel fallback
        let list = [];
        try { list = JSON.parse(localStorage.getItem(this.localClubsKey)) || []; } catch (_) {}
        const code = 'KLB-' + Math.floor(1000 + Math.random() * 9000);
        const newClub = {
          id: 'club_' + Date.now(),
          code,
          access,
          isPublic: access === 'public',
          name,
          description,
          ownerId,
          ownerUsername,
          members: [{ id: ownerId, username: ownerUsername, role: 'Kurucu', joinedAt: new Date().toISOString() }],
          decks: [],
          createdAt: new Date().toISOString()
        };
        list.unshift(newClub);
        localStorage.setItem(this.localClubsKey, JSON.stringify(list));
        return newClub;
      }
    }

    async joinClubDirect(clubId) {
      const prof = this.getActiveProfile();
      const userId = this.isCloudConnected() ? this.user.id : (prof.id || 'local_user');
      const username = prof.username || 'Üye';

      const res = await this.apiCall('clubs/join', { clubId, userId, username });
      if (!res.ok) throw new Error(res.error || 'Kulübe katılım başarısız oldu.');
      return res.club;
    }

    async joinClubByCode(code) {
      const prof = this.getActiveProfile();
      const userId = this.isCloudConnected() ? this.user.id : (prof.id || 'local_user');
      const username = prof.username || 'Üye';

      try {
        const res = await this.apiCall('clubs/join', { code, userId, username });
        return res.club;
      } catch (e) {
        // Yerel kontrol
        let list = [];
        try { list = JSON.parse(localStorage.getItem(this.localClubsKey)) || []; } catch (_) {}
        const cl = list.find(x => (x.code || '').toUpperCase() === (code || '').toUpperCase());
        if (!cl) throw new Error('Bu koda ait bir kulüp bulunamadı.');
        if (!cl.members.some(m => m.id === userId)) {
          cl.members.push({ id: userId, username, role: 'Üye', joinedAt: new Date().toISOString() });
          localStorage.setItem(this.localClubsKey, JSON.stringify(list));
        }
        return cl;
      }
    }

    async getMyClubDecksForSelect() {
      const result = [];
      try {
        const clubs = await this.getClubsList();
        const myId = this.isCloudConnected() ? this.user?.id : this.getActiveProfile().id;
        for (const c of clubs) {
          const isMember = c.ownerId === myId || (Array.isArray(c.members) && c.members.some(m => m.id === myId));
          if (isMember && Array.isArray(c.decks) && c.decks.length > 0) {
            for (const d of c.decks) {
              result.push({
                clubId: c.id,
                clubName: c.name || 'Kulüp',
                deckId: d.id,
                deckTitle: d.title || 'Deste'
              });
            }
          }
        }
      } catch (_) {}
      return result;
    }

    async addCardToClubDeck(clubId, deckId, cardData) {
      const prof = this.getActiveProfile();
      return await this.apiCall('clubs/decks/add_card', {
        clubId,
        deckId,
        card: cardData,
        username: prof.username,
        userId: prof.id || this.user?.id
      });
    }

    openClubDetailModal(clubObj) {
      this.viewingClub = clubObj;
      const modal = $('modal-club-detail');
      if (!modal) return;

      const myId = this.isCloudConnected() ? this.user?.id : this.getActiveProfile().id;
      const isOwner = clubObj.ownerId === myId || (this.user && clubObj.ownerId === this.user.id);

      if ($('club-detail-name')) $('club-detail-name').textContent = clubObj.name;
      if ($('club-detail-code-badge')) {
        // Herkese açık ise kod yerine "Herkese Açık" rozeti
        if (clubObj.access === 'code' || isOwner) {
          $('club-detail-code-badge').textContent = clubObj.code;
          $('club-detail-code-badge').classList.remove('hidden');
        } else {
          $('club-detail-code-badge').textContent = 'Herkese Açık';
        }
      }
      const members = clubObj.members || [];
      if ($('club-detail-meta')) $('club-detail-meta').textContent = `${members.length} Üye`;

      // Kurucu Silme Butonu Görünürlüğü
      const dangerZone = $('club-owner-danger-zone');
      if (dangerZone) dangerZone.classList.toggle('hidden', !isOwner);

      // Kulüp Desteleri
      const decksBox = $('club-decks-container');
      if (decksBox) {
        const decks = clubObj.decks || [];
        if (decks.length === 0) {
          decksBox.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding:8px 0;">Bu kulübe ait henüz deste paylaşılmamış. Yukarıdaki "+ Kulüp Destesi Ekle" butonuyla deste ekleyebilirsiniz.</div>';
        } else {
          let html = '';
          decks.forEach(d => {
            const wList = d.words || [];
            const canRemoveDeck = isOwner || d.addedById === myId;
            html += `
              <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:10px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-weight:800; font-size:0.9rem; color:var(--text-primary);">${d.title}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted);">${wList.length} Kelime · Ekleyen: ${d.addedBy || 'Üye'}</div>
                </div>
                <div style="display:flex; gap:6px;">
                  <button type="button" class="btn-primary-compact btn-import-club-deck" data-deck-id="${d.id}" style="padding:6px 10px; font-size:0.78rem;">Destelerime Ekle</button>
                  ${canRemoveDeck ? `<button type="button" class="btn-primary-compact btn-remove-club-deck" data-deck-id="${d.id}" style="padding:6px 8px; font-size:0.75rem; background:#EF4444; border-color:#EF4444; color:#fff;">Sil</button>` : ''}
                </div>
              </div>
            `;
          });
          decksBox.innerHTML = html;

          // Desteleri Kütüphaneye Ekle
          decksBox.querySelectorAll('.btn-import-club-deck').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const did = e.currentTarget.getAttribute('data-deck-id');
              const dObj = decks.find(x => String(x.id) === String(did));
              if (!dObj) return;

              e.currentTarget.disabled = true;
              e.currentTarget.textContent = 'Ekleniyor...';
              try {
                await this.importDeckToLocal(dObj);
                e.currentTarget.textContent = 'Eklendi';
                if (window.wmApp && window.wmApp.showToast) {
                  window.wmApp.showToast(`"${dObj.title}" destesi kütüphanenize eklendi.`);
                }
              } catch (err) {
                alert(err.message);
                e.currentTarget.disabled = false;
                e.currentTarget.textContent = 'Destelerime Ekle';
              }
            });
          });

          // Kulüp Destesini Kaldır
          decksBox.querySelectorAll('.btn-remove-club-deck').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const did = e.currentTarget.getAttribute('data-deck-id');
              if (!confirm('Bu desteyi kulüp havuzundan silmek istediğinize emin misiniz?')) return;
              btn.disabled = true;
              try {
                const res = await this.apiCall('clubs/decks/remove', { clubId: clubObj.id, ownerId: myId, deckId: did });
                if (res.ok && res.club) {
                  this.viewingClub = res.club;
                  this.openClubDetailModal(res.club);
                }
              } catch (err) {
                alert('Hata: ' + err.message);
                btn.disabled = false;
              }
            });
          });
        }
      }

      // Kulüp Üyeleri
      const membersBox = $('club-members-container');
      if (membersBox) {
        let mHtml = '';
        members.forEach(m => {
          const isThisMemberOwner = m.id === clubObj.ownerId;
          const canKick = isOwner && !isThisMemberOwner;
          mHtml += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border-bottom:1px solid var(--border-subtle);">
              <span style="font-weight:700; font-size:0.85rem; color:var(--text-primary);">${m.username}</span>
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="badge" style="font-size:0.72rem; padding:2px 8px; background:var(--accent-primary-soft); color:var(--brand-blue-hover);">${m.role || (isThisMemberOwner ? 'Kurucu' : 'Üye')}</span>
                ${canKick ? `<button type="button" class="btn-primary-compact btn-kick-club-member" data-member-id="${m.id}" style="padding:3px 6px; font-size:0.7rem; background:#EF4444; border-color:#EF4444; color:#fff;">Çıkar</button>` : ''}
              </div>
            </div>
          `;
        });
        membersBox.innerHTML = mHtml;

        // Üyeyi Çıkar
        membersBox.querySelectorAll('.btn-kick-club-member').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const mid = e.currentTarget.getAttribute('data-member-id');
            if (!confirm('Bu üyeyi kulüpten çıkarmak istediğinize emin misiniz?')) return;
            btn.disabled = true;
            try {
              const res = await this.apiCall('clubs/members/remove', { clubId: clubObj.id, ownerId: myId, memberId: mid });
              if (res.ok && res.club) {
                this.viewingClub = res.club;
                this.openClubDetailModal(res.club);
              }
            } catch (err) {
              alert('Hata: ' + err.message);
              btn.disabled = false;
            }
          });
        });
      }

      modal.classList.remove('hidden');
    }

    // =========================================================================
    // ZAMANA KARŞI DÜELLO & ÇOK OYUNCULU KAPIŞMA (SIFIR BOT - GERÇEK LOBİ)
    // =========================================================================
    async start1v1MatchAsHost(deckSelection) {
      const resolved = await this.getDeckWithCardsBySelection(deckSelection);
      if (!resolved.words || resolved.words.length < 4) {
        throw new Error('Kapışma için seçilen destede en az 4 kelime olmalıdır.');
      }

      const words = resolved.words;
      const prof = this.getActiveProfile();
      let pin = 'VS-' + Math.floor(1000 + Math.random() * 9000);
      const deckTitle = resolved.title || 'Deste';

      let roomObj = {
        pin,
        type: '1v1',
        hostId: prof.id || 'host',
        hostName: prof.username || 'Host',
        deckTitle,
        words,
        status: 'lobby',
        players: [{ id: prof.id || 'host', name: prof.username || 'Host', score: 0, isHost: true }]
      };

      try {
        const res = await this.apiCall('multiplayer/room/create', {
          type: '1v1',
          hostId: prof.id || 'host',
          hostName: prof.username || 'Host',
          deckTitle,
          words,
          duration: 60
        });
        if (res.ok && res.room) roomObj = res.room;
      } catch (_) {}

      this.init1v1Lobby(roomObj, true);
    }

    async join1v1Match(pin) {
      const cleanPin = (pin || '').trim().toUpperCase();
      if (!cleanPin) throw new Error('Lütfen geçerli bir katılım PIN kodu girin (Örn: VS-1234).');

      const prof = this.getActiveProfile();
      let roomObj = null;

      try {
        const res = await this.apiCall('multiplayer/room/join', {
          pin: cleanPin,
          playerId: prof.id || 'player_' + Date.now(),
          playerName: prof.username || 'Yarışmacı'
        });
        if (res.ok && res.room) {
          roomObj = res.room;
        }
      } catch (e) {
        throw new Error(e.message || 'Oda bulunamadı veya süresi doldu.');
      }

      if (!roomObj || !Array.isArray(roomObj.words) || roomObj.words.length < 4) {
        throw new Error('Oda verisine veya kelimelere ulaşılamadı.');
      }

      this.init1v1Lobby(roomObj, false);
    }

    init1v1Lobby(room, isHost) {
      if (this.match1v1PollTimer) clearInterval(this.match1v1PollTimer);
      if (this.match1v1Timer) clearInterval(this.match1v1Timer);

      const prof = this.getActiveProfile();
      this.match1v1State = {
        roomPin: room.pin,
        deckTitle: room.deckTitle || 'Deste',
        words: room.words || [],
        isHost,
        players: room.players || [{ id: prof.id, name: prof.username, score: 0, isHost }],
        currentIndex: 0,
        correctCount: 0,
        wrongCount: 0,
        myScore: 0,
        remainingSec: 60,
        status: 'lobby'
      };

      const modal = $('modal-arena-1v1-game');
      if (!modal) return;

      // Faz geçişi: Lobi göster, oyun ve sonuç gizli
      $('arena-1v1-phase-lobby')?.classList.remove('hidden');
      $('arena-1v1-phase-game')?.classList.add('hidden');
      $('arena-1v1-results-box')?.classList.add('hidden');

      if ($('arena-1v1-match-title')) $('arena-1v1-match-title').textContent = this.match1v1State.deckTitle;
      if ($('arena-1v1-pin-display')) $('arena-1v1-pin-display').textContent = room.pin;

      // Host vs Misafir Buton Durumu
      const startBtn = $('btn-start-1v1-lobby-match');
      const waitingMsg = $('arena-1v1-guest-waiting-msg');
      if (startBtn) startBtn.classList.toggle('hidden', !isHost);
      if (waitingMsg) waitingMsg.classList.toggle('hidden', !!isHost);

      this.render1v1LobbyPlayers();
      modal.classList.remove('hidden');

      // 2 Saniyelik Canlı Lobi Polling Döngüsü (Sunucu KV ile senkronizasyon)
      this.match1v1PollTimer = setInterval(async () => {
        try {
          const res = await this.apiCall('multiplayer/room/state', { pin: room.pin });
          if (res.ok && res.room) {
            const updatedRoom = res.room;
            const prevCount = this.match1v1State.players.length;
            this.match1v1State.players = updatedRoom.players || [];

            // Yeni oyuncu katıldı mı bildirimi
            if (this.match1v1State.players.length > prevCount) {
              const lastPlayer = this.match1v1State.players[this.match1v1State.players.length - 1];
              if (lastPlayer && lastPlayer.id !== prof.id && window.wmApp && window.wmApp.showToast) {
                window.wmApp.showToast(`${lastPlayer.name} odaya katıldı.`);
              }
            }

            this.render1v1LobbyPlayers();

            // Host oyunu başlattıysa misafirleri de otomatik soru ekranına al
            if (!this.match1v1State.isHost && updatedRoom.status === 'active') {
              clearInterval(this.match1v1PollTimer);
              this.match1v1PollTimer = null;
              this.start1v1ActualGame(updatedRoom.words || this.match1v1State.words);
            }
          }
        } catch (_) {}
      }, 2000);
    }

    render1v1LobbyPlayers() {
      const chipList = $('arena-1v1-players-chip-list');
      const countEl = $('arena-1v1-player-count');
      if (!chipList) return;

      const prof = this.getActiveProfile();
      let html = '';
      const players = this.match1v1State.players || [];
      if (countEl) countEl.textContent = players.length;

      players.forEach(p => {
        const isMe = p.id === prof.id || p.name === prof.username;
        const hostBadge = p.isHost ? ' (Host)' : '';
        html += `
          <span class="badge" style="background:${isMe ? 'var(--brand-blue)' : 'var(--bg-surface)'}; border:1px solid ${isMe ? 'transparent' : 'var(--border-medium)'}; color:${isMe ? '#fff' : 'var(--text-primary)'}; font-size:0.85rem; padding:6px 14px; border-radius:20px; font-weight:700;">
            ${p.name}${hostBadge}${isMe ? ' (Siz)' : ''}
          </span>
        `;
      });
      chipList.innerHTML = html;
    }

    async launch1v1GameByHost() {
      if (!this.match1v1State.isHost) return;
      if (this.match1v1PollTimer) clearInterval(this.match1v1PollTimer);
      this.match1v1PollTimer = null;

      try {
        await this.apiCall('multiplayer/room/start', {
          pin: this.match1v1State.roomPin,
          hostId: this.getActiveProfile().id
        });
      } catch (_) {}

      this.start1v1ActualGame(this.match1v1State.words);
    }

    start1v1ActualGame(words) {
      if (this.match1v1PollTimer) clearInterval(this.match1v1PollTimer);
      this.match1v1PollTimer = null;

      $('arena-1v1-phase-lobby')?.classList.add('hidden');
      $('arena-1v1-phase-game')?.classList.remove('hidden');
      $('arena-1v1-results-box')?.classList.add('hidden');

      this.match1v1State.words = [...words].sort(() => Math.random() - 0.5).slice(0, 10);
      this.match1v1State.currentIndex = 0;
      this.match1v1State.correctCount = 0;
      this.match1v1State.wrongCount = 0;
      this.match1v1State.myScore = 0;
      this.match1v1State.remainingSec = 60;
      this.match1v1State.status = 'active';

      this.render1v1Question();
      this.start1v1Timer();
    }

    start1v1Timer() {
      if (this.match1v1Timer) clearInterval(this.match1v1Timer);
      const timerEl = $('arena-1v1-timer');

      this.match1v1Timer = setInterval(() => {
        this.match1v1State.remainingSec -= 1;
        if (timerEl) timerEl.textContent = this.match1v1State.remainingSec + 's';

        if (this.match1v1State.remainingSec <= 0) {
          clearInterval(this.match1v1Timer);
          this.finish1v1Match();
        }
      }, 1000);
    }

    render1v1Question() {
      const st = this.match1v1State;
      if (st.currentIndex >= st.words.length) {
        this.finish1v1Match();
        return;
      }

      const q = st.words[st.currentIndex];
      if ($('arena-1v1-q-counter')) $('arena-1v1-q-counter').textContent = `${st.currentIndex + 1} / ${st.words.length}`;
      if ($('arena-1v1-my-score')) $('arena-1v1-my-score').textContent = st.myScore;
      if ($('arena-1v1-word-pos')) $('arena-1v1-word-pos').textContent = q.pos || 'Almanca';
      if ($('arena-1v1-word-lemma')) $('arena-1v1-word-lemma').textContent = q.lemma;
      if ($('arena-1v1-word-sentence')) $('arena-1v1-word-sentence').textContent = q.sourceSentence || '';

      const correctMeaning = q.contextMeaning;
      const otherWords = st.words.filter(w => w.contextMeaning !== correctMeaning);
      const wrongOptions = otherWords.sort(() => Math.random() - 0.5).slice(0, 3).map(w => w.contextMeaning);
      while (wrongOptions.length < 3) {
        wrongOptions.push('Alternatif Anlam ' + (wrongOptions.length + 1));
      }
      const allOptions = [correctMeaning, ...wrongOptions].sort(() => Math.random() - 0.5);

      const grid = $('arena-1v1-options-grid');
      if (!grid) return;
      let html = '';
      allOptions.forEach((opt, idx) => {
        html += `
          <button type="button" class="btn-arena-option" data-opt="${encodeURIComponent(opt)}" style="background:var(--bg-surface); border:1px solid var(--border-medium); border-radius:12px; padding:14px; text-align:left; font-size:0.95rem; font-weight:700; color:var(--text-primary); cursor:pointer; transition:all 0.15s ease;">
            <span style="color:var(--text-muted); font-size:0.8rem; margin-right:8px;">${idx + 1}.</span> ${opt}
          </button>
        `;
      });
      grid.innerHTML = html;

      grid.querySelectorAll('.btn-arena-option').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const selected = decodeURIComponent(e.currentTarget.getAttribute('data-opt'));
          const isCorrect = selected === correctMeaning;

          grid.querySelectorAll('.btn-arena-option').forEach(b => b.disabled = true);
          let earnedPoints = 0;
          if (isCorrect) {
            e.currentTarget.style.background = '#10B981';
            e.currentTarget.style.color = '#fff';
            st.correctCount += 1;
            const speedBonus = Math.max(10, Math.round(st.remainingSec * 2));
            earnedPoints = 100 + speedBonus;
            st.myScore += earnedPoints;
          } else {
            e.currentTarget.style.background = '#EF4444';
            e.currentTarget.style.color = '#fff';
            st.wrongCount += 1;
          }

          try {
            this.apiCall('multiplayer/room/submit_score', {
              pin: st.roomPin,
              playerId: this.getActiveProfile().id,
              points: earnedPoints,
              questionIndex: st.currentIndex
            }).catch(() => {});
          } catch (_) {}

          setTimeout(() => {
            st.currentIndex += 1;
            this.render1v1Question();
          }, 600);
        });
      });
    }

    async finish1v1Match() {
      if (this.match1v1Timer) clearInterval(this.match1v1Timer);
      const st = this.match1v1State;

      $('arena-1v1-phase-game')?.classList.add('hidden');
      $('arena-1v1-results-box')?.classList.remove('hidden');

      if ($('arena-1v1-final-correct')) $('arena-1v1-final-correct').textContent = st.correctCount;
      if ($('arena-1v1-final-wrong')) $('arena-1v1-final-wrong').textContent = st.wrongCount;
      if ($('arena-1v1-final-pts')) $('arena-1v1-final-pts').textContent = st.myScore;

      const isWinner = st.correctCount >= 6;
      const eloDelta = isWinner ? 25 : -10;
      if ($('arena-1v1-winner-text')) $('arena-1v1-winner-text').textContent = isWinner ? 'Tebrikler! Maçı Kazandınız' : 'İyi Mücadele!';
      if ($('arena-1v1-elo-result')) $('arena-1v1-elo-result').textContent = isWinner ? `+${eloDelta} Puan Kazandınız!` : `${eloDelta} Puan`;

      await this.recordActivity({
        type: 'review',
        isCorrect: isWinner,
        responseTimeMs: 2000,
        customEloDelta: eloDelta
      });
    }

    // =========================================================================
    // KAHOOT CANLI GRUP OYUNU MOTORU
    // =========================================================================
    async createKahootRoom(deckSelection, duration = 15, count = 10) {
      const resolved = await this.getDeckWithCardsBySelection(deckSelection);
      if (!resolved.words || resolved.words.length < 4) {
        throw new Error('Kahoot için seçilen destede en az 4 kelime olmalıdır.');
      }

      const words = resolved.words;
      const prof = this.getActiveProfile();
      let pin = String(Math.floor(100000 + Math.random() * 900000));
      const deckTitle = resolved.title || 'Deste';

      try {
        const res = await this.apiCall('multiplayer/room/create', {
          type: 'kahoot',
          hostId: prof.id || 'host',
          hostName: prof.username || 'Host',
          deckTitle: deckTitle,
          words: words.slice(0, Number(count) || 10),
          duration: Number(duration) || 15
        });
        if (res.ok && res.room) pin = res.room.pin;
      } catch (_) {}

      this.initKahootView(pin, deckTitle, words.slice(0, Number(count) || 10), duration, true);
    }

    async joinKahootRoom(pin) {
      const cleanPin = (pin || '').trim().toUpperCase();
      if (!cleanPin) throw new Error('Lütfen 6 haneli oda PIN kodunu girin.');

      let words = [];
      let deckTitle = 'Kahoot Canlı Quiz';
      let duration = 15;

      try {
        const res = await this.apiCall('multiplayer/room/join', {
          pin: cleanPin,
          playerId: this.getActiveProfile().id,
          playerName: this.getActiveProfile().username
        });
        if (res.ok && res.room) {
          words = res.room.words || [];
          deckTitle = res.room.deckTitle || deckTitle;
          duration = res.room.questionDurationSec || 15;
        }
      } catch (e) {
        throw new Error(e.message || 'Oda bulunamadı veya süresi doldu.');
      }

      if (words.length < 4) throw new Error('Oda bulunamadı veya kelime verisi eksik.');
      this.initKahootView(cleanPin, deckTitle, words, duration, false);
    }

    initKahootView(pin, deckTitle, words, duration, isHost) {
      if (this.kahootPollTimer) clearInterval(this.kahootPollTimer);
      const prof = this.getActiveProfile();

      this.kahootState = {
        pin,
        deckTitle,
        isHost,
        players: [{ id: prof.id, name: prof.username, score: 0, isHost }],
        words: [...words],
        duration: Number(duration) || 15,
        currentIndex: 0,
        timerId: null,
        remainingSec: duration,
        scores: { [prof.username]: 0 }
      };

      const modal = $('modal-arena-kahoot-game');
      if (!modal) return;

      if ($('kahoot-room-pin-display')) $('kahoot-room-pin-display').textContent = `PIN: ${pin}`;
      if ($('kahoot-lobby-deck-title')) $('kahoot-lobby-deck-title').textContent = deckTitle;

      const startBtn = $('btn-start-kahoot-match');
      const waitMsg = $('kahoot-guest-waiting-msg');
      if (startBtn) startBtn.classList.toggle('hidden', !isHost);
      if (waitMsg) waitMsg.classList.toggle('hidden', !!isHost);

      this.kahootCurrentPhase = 'lobby';
      this.showKahootPhase('lobby');
      this.renderKahootLobbyPlayers();
      modal.classList.remove('hidden');

      // 1.8 Saniyelik Canlı Senkronizasyon & Polling Döngüsü
      this.kahootPollTimer = setInterval(async () => {
        try {
          const res = await this.apiCall('multiplayer/room/state', { pin });
          if (res.ok && res.room) {
            const updated = res.room;

            if (updated.status === 'closed') {
              this.closeKahootRoomCleanly('Müsabaka odası kurucu tarafından kapatıldı.');
              return;
            }

            if (this.kahootCurrentPhase === 'lobby') {
              const prevCount = this.kahootState.players.length;
              this.kahootState.players = updated.players || [];

              if (this.kahootState.players.length > prevCount) {
                const lastPlayer = this.kahootState.players[this.kahootState.players.length - 1];
                if (lastPlayer && lastPlayer.id !== prof.id && window.wmApp && window.wmApp.showToast) {
                  window.wmApp.showToast(`${lastPlayer.name} odaya katıldı.`);
                }
              }

              this.renderKahootLobbyPlayers();

              if (!this.kahootState.isHost && updated.status === 'active') {
                this.startKahootQuestion();
              }
            } else {
              // Oyun ve ara sıralama senkronizasyonu
              if (Array.isArray(updated.players)) {
                updated.players.forEach(p => {
                  this.kahootState.scores[p.name] = p.score || 0;
                });
              }

              // Misafir oyuncu için soru senkronizasyonu
              if (!this.kahootState.isHost && typeof updated.currentQuestionIndex === 'number') {
                if (updated.currentQuestionIndex > this.kahootState.currentIndex) {
                  this.kahootState.currentIndex = updated.currentQuestionIndex;
                  this.startKahootQuestion();
                } else if (updated.status === 'finished' || updated.currentQuestionIndex >= this.kahootState.words.length) {
                  this.finishKahootGame();
                }
              }
            }
          }
        } catch (_) {}
      }, 1800);
    }

    showKahootPhase(phaseName) {
      // 'lobby', 'question', 'intermediate', 'podium'
      this.kahootCurrentPhase = phaseName;
      ['lobby', 'question', 'intermediate', 'podium'].forEach(p => {
        const el = $(`kahoot-phase-${p}`);
        if (el) el.classList.toggle('hidden', p !== phaseName);
      });

      if (phaseName === 'intermediate') {
        const nextBtn = $('btn-kahoot-next-question');
        if (nextBtn) {
          if (!this.kahootState?.isHost) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.6';
            nextBtn.style.cursor = 'not-allowed';
            nextBtn.textContent = 'Host Sonraki Soruya Geçiyor...';
          } else {
            nextBtn.disabled = false;
            nextBtn.style.opacity = '1';
            nextBtn.style.cursor = 'pointer';
            nextBtn.textContent = 'Sonraki Soru';
          }
        }
      }
    }

    renderKahootLobbyPlayers() {
      const chipList = $('kahoot-players-chip-list');
      if (!chipList) return;
      const prof = this.getActiveProfile();
      let html = '';

      // Kesinlikle Sıfır Bot: Sadece odaya gerçekten katılan kullanıcılar listelenir
      this.kahootState.players.forEach(p => {
        const isMe = p.id === prof.id || p.name === prof.username;
        const hostBadge = p.isHost ? ' (Host)' : '';
        html += `
          <span class="badge" style="background:${isMe ? 'var(--brand-blue)' : 'var(--bg-surface)'}; border:1px solid ${isMe ? 'transparent' : 'var(--border-subtle)'}; color:${isMe ? '#fff' : 'var(--text-primary)'}; font-size:0.85rem; padding:6px 14px; border-radius:20px; font-weight:700;">
            ${p.name}${hostBadge}${isMe ? ' (Siz)' : ''}
          </span>
        `;
      });
      chipList.innerHTML = html;
      const count = this.kahootState.players.length;
      if ($('kahoot-player-count')) $('kahoot-player-count').textContent = count;

      // Host İçin Katılımcı Bekleme Koruması
      const startBtn = $('btn-start-kahoot-match');
      if (startBtn && this.kahootState.isHost) {
        if (count < 2) {
          startBtn.disabled = true;
          startBtn.style.opacity = '0.55';
          startBtn.style.cursor = 'not-allowed';
          startBtn.textContent = 'En Az 1 Katılımcı Bekleniyor...';
        } else {
          startBtn.disabled = false;
          startBtn.style.opacity = '1';
          startBtn.style.cursor = 'pointer';
          startBtn.textContent = `Müsabakayı Başlat (${count} Oyuncu Hazır)`;
        }
      }
    }

    async launchKahootGameByHost() {
      if (!this.kahootState.isHost) return;

      try {
        await this.apiCall('multiplayer/room/start', {
          pin: this.kahootState.pin,
          hostId: this.getActiveProfile().id
        });
      } catch (_) {}

      this.startKahootQuestion();
    }

    startKahootQuestion() {
      const st = this.kahootState;
      if (st.currentIndex >= st.words.length) {
        this.finishKahootGame();
        return;
      }

      this.showKahootPhase('question');
      st.remainingSec = st.duration;

      const q = st.words[st.currentIndex];
      if ($('kahoot-q-index')) $('kahoot-q-index').textContent = `Soru ${st.currentIndex + 1} / ${st.words.length}`;
      if ($('kahoot-countdown-badge')) $('kahoot-countdown-badge').textContent = st.remainingSec + 's';
      if ($('kahoot-q-lemma')) $('kahoot-q-lemma').textContent = q.lemma;
      if ($('kahoot-q-sentence')) $('kahoot-q-sentence').textContent = q.sourceSentence || '';

      // 4 Şık Hazırla
      const correctMeaning = q.contextMeaning;
      const otherWords = st.words.filter(w => w.contextMeaning !== correctMeaning);
      const wrong = otherWords.sort(() => Math.random() - 0.5).slice(0, 3).map(w => w.contextMeaning);
      while (wrong.length < 3) wrong.push('Alternatif ' + (wrong.length + 1));
      const options = [correctMeaning, ...wrong].sort(() => Math.random() - 0.5);

      const btnColors = ['red', 'blue', 'yellow', 'green'];
      btnColors.forEach((color, idx) => {
        const btn = document.querySelector(`.btn-kahoot-${color}`);
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = '1';
          const span = btn.querySelector('.kahoot-opt-text');
          if (span) span.textContent = options[idx] || '';
          btn.setAttribute('data-meaning', encodeURIComponent(options[idx] || ''));
        }
      });

      // Zaman Sayacı
      if (st.timerId) clearInterval(st.timerId);
      st.timerId = setInterval(() => {
        st.remainingSec -= 1;
        if ($('kahoot-countdown-badge')) $('kahoot-countdown-badge').textContent = st.remainingSec + 's';

        if (st.remainingSec <= 0) {
          clearInterval(st.timerId);
          this.endKahootQuestion(false);
        }
      }, 1000);
    }

    handleKahootAnswer(selectedMeaning) {
      const st = this.kahootState;
      if (st.timerId) clearInterval(st.timerId);

      const q = st.words[st.currentIndex];
      const isCorrect = selectedMeaning === q.contextMeaning;
      st.currentAnswerCorrect = isCorrect;

      const prof = this.getActiveProfile();
      let earnedPoints = 0;
      if (isCorrect) {
        const timeFactor = st.remainingSec / st.duration;
        earnedPoints = Math.round(500 + 500 * timeFactor);
        st.scores[prof.username] = (st.scores[prof.username] || 0) + Math.max(200, earnedPoints);
      }

      // KV Sunucusuna puanı ilet
      try {
        this.apiCall('multiplayer/room/submit_score', {
          pin: st.pin,
          playerId: prof.id,
          points: earnedPoints,
          questionIndex: st.currentIndex
        }).catch(() => {});
      } catch (_) {}

      this.endKahootQuestion(isCorrect);
    }

    async endKahootQuestion(isCorrect) {
      this.showKahootPhase('intermediate');
      const feedback = $('kahoot-answer-feedback');
      if (feedback) {
        feedback.textContent = isCorrect ? 'Harika! Doğru Cevap' : 'Yanlış Seçenek!';
        feedback.style.color = isCorrect ? '#10B981' : '#EF4444';
      }

      // Sunucudan güncel puan tablosunu çek
      try {
        const res = await this.apiCall('multiplayer/room/state', { pin: this.kahootState.pin });
        if (res.ok && res.room && Array.isArray(res.room.players)) {
          res.room.players.forEach(p => {
            this.kahootState.scores[p.name] = p.score || 0;
          });
        }
      } catch (_) {}

      const boardEl = $('kahoot-intermediate-leaderboard');
      if (boardEl) {
        const sorted = Object.entries(this.kahootState.scores).sort((a, b) => b[1] - a[1]);
        let html = '';
        sorted.forEach(([name, score], idx) => {
          html += `
            <div style="background:var(--bg-surface); padding:10px 14px; border-radius:10px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:800; font-size:0.9rem;">#${idx + 1} ${name}</span>
              <span style="font-weight:900; color:var(--brand-blue-hover); font-size:1rem;">${score} Puan</span>
            </div>
          `;
        });
        boardEl.innerHTML = html;
      }
    }

    closeKahootRoomCleanly(noticeMsg = null) {
      if (this.kahootPollTimer) clearInterval(this.kahootPollTimer);
      if (this.kahootState?.timerId) clearInterval(this.kahootState.timerId);
      this.kahootPollTimer = null;
      $('modal-arena-kahoot-game')?.classList.add('hidden');
      if (noticeMsg && window.wmApp && window.wmApp.showToast) {
        window.wmApp.showToast(noticeMsg);
      }
    }

    async finishKahootGame() {
      if (this.kahootState.timerId) clearInterval(this.kahootState.timerId);
      this.showKahootPhase('podium');

      try {
        const res = await this.apiCall('multiplayer/room/state', { pin: this.kahootState.pin });
        if (res.ok && res.room && Array.isArray(res.room.players)) {
          res.room.players.forEach(p => {
            this.kahootState.scores[p.name] = p.score || 0;
          });
        }
      } catch (_) {}

      const sorted = Object.entries(this.kahootState.scores).sort((a, b) => b[1] - a[1]);
      if ($('podium-1st-name')) $('podium-1st-name').textContent = sorted[0] ? sorted[0][0] : '-';
      if ($('podium-1st-score')) $('podium-1st-score').textContent = sorted[0] ? `${sorted[0][1]} P` : '0 P';

      if ($('podium-2nd-name')) $('podium-2nd-name').textContent = sorted[1] ? sorted[1][0] : '-';
      if ($('podium-2nd-score')) $('podium-2nd-score').textContent = sorted[1] ? `${sorted[1][1]} P` : '0 P';

      if ($('podium-3rd-name')) $('podium-3rd-name').textContent = sorted[2] ? sorted[2][0] : '-';
      if ($('podium-3rd-score')) $('podium-3rd-score').textContent = sorted[2] ? `${sorted[2][1]} P` : '0 P';

      this.recordActivity({
        type: 'review',
        isCorrect: true,
        responseTimeMs: 2500,
        customEloDelta: 30
      });
    }

    // =========================================================================
    // MAÇA ARKADAŞ DAVET ETME SİSTEMİ
    // =========================================================================
    async openInviteFriendMatchModal(roomPin, matchType = '1v1', deckTitle = 'Deste') {
      const modal = $('modal-invite-friend-match');
      if (!modal) return;

      if ($('invite-match-pin-target')) $('invite-match-pin-target').textContent = roomPin;
      const listContainer = $('invite-friends-list-container');
      if (!listContainer) return;

      listContainer.innerHTML = '<div style="text-align:center; padding:12px; font-size:0.82rem; color:var(--text-muted);">Arkadaşlar yükleniyor...</div>';
      modal.classList.remove('hidden');

      const friends = await this.getFriendsLeaderboard();
      if (!Array.isArray(friends) || friends.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; padding:16px; font-size:0.85rem; color:var(--text-muted);">Henüz arkadaşınız bulunmuyor. Sosyal sekmesinden arkadaş ekleyebilirsiniz.</div>';
        return;
      }

      const prof = this.getActiveProfile();
      let html = '';
      friends.forEach(f => {
        html += `
          <div style="background:var(--bg-surface); padding:8px 12px; border-radius:10px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; font-size:0.88rem; color:var(--text-primary);">${f.username}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${f.friend_code || ''}</div>
            </div>
            <button type="button" class="btn-primary-compact btn-send-match-inv" data-user-id="${f.id}" data-username="${f.username}" style="padding:5px 12px; font-size:0.75rem; background:#10B981; border-color:#10B981;">Davet Et</button>
          </div>
        `;
      });
      listContainer.innerHTML = html;

      listContainer.querySelectorAll('.btn-send-match-inv').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const targetId = e.currentTarget.getAttribute('data-user-id');
          const targetName = e.currentTarget.getAttribute('data-username');
          const btn = e.currentTarget;
          if (btn.dataset.locked === '1') return;
          btn.dataset.locked = '1';
          btn.disabled = true;
          btn.textContent = 'Gönderiliyor...';

          try {
            await this.apiCall('multiplayer/invite/send', {
              fromUserId: prof.id || this.user?.id,
              fromUsername: prof.username || 'Arkadaşın',
              toUserId: targetId,
              pin: roomPin,
              type: matchType,
              deckTitle
            });
            btn.textContent = 'Gönderildi';
            if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(`${targetName} kullanıcısına maç daveti gönderildi.`);
          } catch (err) {
            alert('Davet gönderilemedi: ' + err.message);
          } finally {
            setTimeout(() => {
              if (btn) {
                btn.dataset.locked = '0';
                btn.disabled = false;
                btn.textContent = 'Davet Et';
              }
            }, 4000);
          }
        });
      });
    }

    // =========================================================================
    // ORTAK DESTE DÜZENLEME (İŞBİRLİKÇİ ÇALIŞMA)
    // =========================================================================
    async initCollabSession(deckSelection) {
      const resolved = await this.getDeckWithCardsBySelection(deckSelection);
      const code = 'COL-' + Math.floor(1000 + Math.random() * 9000);
      const prof = this.getActiveProfile();
      const deckTitle = resolved.title || 'Ortak Deste';

      const collabData = {
        code,
        title: deckTitle,
        cards: (resolved.words || []).map(c => ({
          front: c.lemma || c.front || '',
          back: c.contextMeaning || c.back || '',
          pos: c.pos || 'NOUN',
          example: c.sourceSentence || c.example || ''
        })),
        contributors: [prof.username || 'Kurucu']
      };

      try {
        await this.apiCall('decks/collaborate/sync', { code, action: 'init', title: deckTitle, cards: collabData.cards, author: prof.username || 'Kurucu' });
      } catch (_) {}

      this.openCollabWorkspace(collabData);
      if (window.wmApp && window.wmApp.showToast) {
        window.wmApp.showToast(`İşbirliği oturumu başlatıldı! Kod: ${code}`);
      }
    }

    async joinCollabSession(code) {
      const cleanCode = (code || '').trim().toUpperCase();
      if (!cleanCode) throw new Error('Lütfen işbirliği kodunu girin (Örn: COL-1234).');

      const prof = this.getActiveProfile();
      let collabData = null;

      try {
        const res = await this.apiCall('decks/collaborate/sync', { code: cleanCode, action: 'get', author: prof.username });
        if (res.ok && res.collab) collabData = res.collab;
      } catch (e) {
        throw new Error(e.message || 'Bu koda ait ortak deste bulunamadı.');
      }

      if (!collabData) {
        throw new Error('Bu koda ait aktif ortak deste bulunamadı.');
      }

      this.openCollabWorkspace(collabData);
      if (window.wmApp && window.wmApp.showToast) {
        window.wmApp.showToast(`"${collabData.title}" ortak destesine bağlandınız.`);
      }
    }

    openCollabWorkspace(collabObj) {
      this.activeCollabSession = collabObj;
      const box = $('collab-active-workspace');
      if (!box) return;

      if ($('collab-active-title')) $('collab-active-title').textContent = collabObj.title;
      if ($('collab-active-code-badge')) $('collab-active-code-badge').textContent = collabObj.code;
      if ($('collab-contributors-row')) $('collab-contributors-row').textContent = `Katkıda Bulunanlar: ${(collabObj.contributors || []).join(', ')}`;

      this.renderCollabCardsList();
      box.classList.remove('hidden');
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    renderCollabCardsList() {
      const list = $('collab-cards-list');
      if (!list || !this.activeCollabSession) return;

      const cards = this.activeCollabSession.cards || [];
      if (cards.length === 0) {
        list.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding:8px; text-align:center;">Henüz kart eklenmemiş. "+ Birlikte Kart Ekle" butonuyla kart ekleyebilirsiniz.</div>';
        return;
      }

      let html = '';
      cards.forEach((c, idx) => {
        html += `
          <div style="background:var(--bg-card); padding:8px 12px; border-radius:8px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="flex:1;">
              <span style="font-weight:800; font-size:0.88rem; color:var(--text-primary);">${c.front || c.lemma || ''}</span>
              <span style="font-size:0.75rem; color:var(--text-muted); margin-left:4px;">(${c.pos || 'Nomen'})</span>
              <div style="font-size:0.82rem; color:var(--text-secondary);">${c.back || c.contextMeaning || ''}</div>
            </div>
            <button type="button" class="prof-mini-btn btn-remove-collab-card" data-card-idx="${idx}" style="color:#EF4444; border-color:rgba(239,68,68,0.3);">Sil</button>
          </div>
        `;
      });
      list.innerHTML = html;

      list.querySelectorAll('.btn-remove-collab-card').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const idx = Number(e.currentTarget.getAttribute('data-card-idx'));
          await this.removeCardFromActiveCollab(idx);
        });
      });
    }

    async removeCardFromActiveCollab(cardIndex) {
      if (!this.activeCollabSession || !Array.isArray(this.activeCollabSession.cards)) return;
      this.activeCollabSession.cards.splice(cardIndex, 1);
      try {
        await this.apiCall('decks/collaborate/sync', {
          code: this.activeCollabSession.code,
          action: 'remove_card',
          cardIndex,
          author: this.getActiveProfile().username
        });
      } catch (_) {}
      this.renderCollabCardsList();
    }

    async addCardToActiveCollab(front, back, pos, example) {
      if (!this.activeCollabSession) return;
      const card = { front, back, pos, example };
      if (!Array.isArray(this.activeCollabSession.cards)) this.activeCollabSession.cards = [];
      this.activeCollabSession.cards.unshift(card);

      const prof = this.getActiveProfile();
      try {
        await this.apiCall('decks/collaborate/sync', {
          code: this.activeCollabSession.code,
          action: 'add_card',
          card,
          author: prof.username
        });
      } catch (_) {}

      this.renderCollabCardsList();
    }

    // =========================================================================
    // ARKADAŞLIK, DESTE GÖNDERME & LİDERLİK TABLOSU
    // =========================================================================
    async searchUser(query) {
      if (!this.isCloudConnected()) return [];
      try {
        const res = await this.apiCall('friends/search', { query, currentUserId: this.user.id });
        return res.users || [];
      } catch (e) {
        console.warn('Arama hatası:', e.message);
        return [];
      }
    }

    async sendFriendRequest(targetUserId) {
      if (!this.isCloudConnected()) throw new Error('Arkadaş eklemek için lütfen giriş yapın.');
      return await this.apiCall('friends/request', { requesterId: this.user.id, addresseeId: targetUserId });
    }

    async acceptFriendRequest(friendshipId) {
      if (!this.isCloudConnected()) return;
      return await this.apiCall('friends/accept', { friendshipId });
    }

    async rejectFriendRequest(friendshipId) {
      if (!this.isCloudConnected()) return;
      return await this.apiCall('friends/remove', { friendshipId });
    }

    async getFriendsLeaderboard() {
      if (!this.isCloudConnected()) return [];
      try {
        const res = await this.apiCall('friends/list', { userId: this.user.id });
        return res.friends || [];
      } catch (e) {
        console.warn('Arkadaş listesi alınamadı:', e.message);
        return [];
      }
    }

    async getPendingFriendships() {
      if (!this.isCloudConnected()) return [];
      try {
        const res = await this.apiCall('friends/pending', { userId: this.user.id });
        return res.requests || [];
      } catch (e) {
        console.warn('Bekleyen istekler alınamadı:', e.message);
        return [];
      }
    }

    async updateDeckPrivacy(newPrivacy) {
      const prof = this.getActiveProfile();
      prof.deck_privacy = newPrivacy;
      if (!this.isCloudConnected()) {
        localStorage.setItem(this.localProfileKey, JSON.stringify(prof));
        return;
      }
      await this.apiCall('profile/update', { userId: this.user.id, deckPrivacy: newPrivacy });
      this.profile.deck_privacy = newPrivacy;
      localStorage.setItem(this.profileKey, JSON.stringify(this.profile));
      await this.autoSyncDecksToCloud();
    }

    async openSendDeckToFriendModal(friendObj) {
      if (!friendObj) return;
      this.sendingDeckTargetFriend = friendObj;
      await this.populateDeckSelects();
      if ($('send-deck-friend-target-name')) {
        $('send-deck-friend-target-name').textContent = `Alıcı: ${friendObj.username} (${friendObj.friend_code || ''})`;
      }
      $('modal-send-deck-friend')?.classList.remove('hidden');
    }

    async sendDeckToFriend(friendObj, deckSelection) {
      if (!this.isCloudConnected()) throw new Error('Arkadaşınıza deste göndermek için lütfen giriş yapın.');
      if (String(deckSelection).startsWith('pack:')) {
        throw new Error('Hazır küratörlü desteler gönderilemez. Yalnızca kendi destelerinizi gönderebilirsiniz.');
      }
      const resolved = await this.getDeckWithCardsBySelection(deckSelection);
      if (!resolved.words || resolved.words.length === 0) {
        throw new Error('Seçilen destede kelime bulunmuyor.');
      }

      const prof = this.getActiveProfile();
      await this.apiCall('decks/inbox/send', {
        fromUserId: this.user.id,
        fromUsername: prof.username || 'Arkadaşın',
        toUserId: friendObj.id,
        deckTitle: resolved.title,
        words: resolved.words
      });
      return resolved.title;
    }

    async renderIncomingDeckGifts() {
      const box = $('social-incoming-decks-box');
      if (!box) return;

      if (!this.isCloudConnected()) {
        box.classList.add('hidden');
        return;
      }

      let gifts = [];
      try {
        const res = await this.apiCall('decks/inbox/get', { userId: this.user.id });
        gifts = Array.isArray(res.gifts) ? res.gifts : [];
      } catch (_) {}

      if (gifts.length === 0) {
        box.classList.add('hidden');
        return;
      }

      box.classList.remove('hidden');
      let html = `<div class="section-subheading" style="margin-bottom:8px; color:var(--brand-blue-hover);">Gelen Bildirimler &amp; Davetler (${gifts.length})</div>`;
      gifts.forEach(g => {
        if (g.type === 'match_invite') {
          html += `
            <div class="pending-req-item" style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--border-subtle); flex-wrap:wrap; background:rgba(239,68,68,0.06); border-radius:8px; margin-bottom:6px; padding:8px;">
              <div style="flex:1; min-width:180px;">
                <div style="font-weight:800; font-size:0.88rem; color:var(--text-primary);">
                  <span style="color:#EF4444; font-weight:900;">${g.fromUsername}</span> seni ${g.matchType === 'kahoot' ? 'Kahoot Grubuna' : 'Zamana Karşı Düelloya'} davet etti!
                </div>
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">
                  Oda PIN: <strong>${g.pin}</strong> · ${g.deckTitle}
                </div>
              </div>
              <div style="display:flex; gap:6px;">
                <button type="button" class="btn-primary-compact btn-join-match-invite" data-gift-id="${g.id}" data-pin="${g.pin}" data-type="${g.matchType || '1v1'}" style="padding:5px 12px; font-size:0.76rem; background:#EF4444; border-color:#EF4444; color:#fff;">Odaya Katıl</button>
                <button type="button" class="btn-primary-compact btn-ignore-deck-gift" data-gift-id="${g.id}" style="padding:5px 10px; font-size:0.76rem; background:transparent; color:var(--text-muted); border:1px solid var(--border-subtle);">Reddet</button>
              </div>
            </div>
          `;
          return;
        }

        const count = g.wordCount || (Array.isArray(g.words) ? g.words.length : 0);
        html += `
          <div class="pending-req-item" style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--border-subtle); flex-wrap:wrap;">
            <div style="flex:1; min-width:180px;">
              <div style="font-weight:800; font-size:0.88rem; color:var(--text-primary);">
                <span style="color:var(--brand-blue-hover);">${g.fromUsername}</span> sana bir deste gönderdi
              </div>
              <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">
                <strong>${g.deckTitle}</strong> · ${count} Kelime
              </div>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn-primary-compact btn-accept-deck-gift" data-gift-id="${g.id}" style="padding:5px 10px; font-size:0.76rem; background:#10B981; border-color:#10B981;">Desteyi Ekle</button>
              <button type="button" class="btn-primary-compact btn-ignore-deck-gift" data-gift-id="${g.id}" style="padding:5px 10px; font-size:0.76rem; background:transparent; color:var(--text-muted); border:1px solid var(--border-subtle);">Görmezden Gel</button>
            </div>
          </div>
        `;
      });
      box.innerHTML = html;

      box.querySelectorAll('.btn-join-match-invite').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const gid = e.currentTarget.getAttribute('data-gift-id');
          const pin = e.currentTarget.getAttribute('data-pin');
          const mType = e.currentTarget.getAttribute('data-type');
          try {
            await this.apiCall('decks/inbox/resolve', { userId: this.user.id, giftId: gid });
            this.renderIncomingDeckGifts();
            if (mType === 'kahoot') {
              await this.joinKahootRoom(pin);
            } else {
              await this.join1v1Match(pin);
            }
          } catch (err) {
            alert(err.message);
          }
        });
      });

      box.querySelectorAll('.btn-accept-deck-gift').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const gid = e.currentTarget.getAttribute('data-gift-id');
          const giftObj = gifts.find(x => x.id === gid);
          if (!giftObj) return;

          e.currentTarget.disabled = true;
          e.currentTarget.textContent = 'Ekleniyor...';
          try {
            await this.importDeckToLocal({ title: giftObj.deckTitle, words: giftObj.words });
            await this.apiCall('decks/inbox/resolve', { userId: this.user.id, giftId: gid });
            if (window.wmApp && window.wmApp.showToast) {
              window.wmApp.showToast(`"${giftObj.deckTitle}" destesi kütüphanenize eklendi.`);
            }
            await this.renderIncomingDeckGifts();
          } catch (err) {
            alert('Hata: ' + err.message);
            e.currentTarget.disabled = false;
            e.currentTarget.textContent = 'Desteyi Ekle';
          }
        });
      });

      box.querySelectorAll('.btn-ignore-deck-gift').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const gid = e.currentTarget.getAttribute('data-gift-id');
          e.currentTarget.disabled = true;
          try {
            await this.apiCall('decks/inbox/resolve', { userId: this.user.id, giftId: gid });
            await this.renderIncomingDeckGifts();
          } catch (_) {}
        });
      });
    }

    async renderFriendsLeaderboard() {
      const container = $('social-friends-leaderboard-list');
      if (!container) return;

      if (!this.isCloudConnected()) {
        container.innerHTML = `<div class="prof-empty-msg" style="padding:16px; text-align:center; color:var(--text-muted); font-size:0.85rem;">Arkadaşlarınızı ve lig sıralamanızı görmek için oturum açın.</div>`;
        return;
      }

      container.innerHTML = '<div style="text-align:center; padding:12px; font-size:0.85rem; color:var(--text-muted);">Yükleniyor...</div>';
      const board = await this.getFriendsLeaderboard();

      if (board.length === 0) {
        container.innerHTML = `<div class="prof-empty-msg" style="padding:16px; text-align:center; color:var(--text-muted); font-size:0.85rem;">Henüz arkadaşınız bulunmuyor. Yukarıdan kullanıcı adı veya kod ile ekleyebilirsiniz.</div>`;
        return;
      }

      let html = '';
      board.forEach((friend, idx) => {
        const tier = getTierForElo(friend.elo);
        html += `
          <div class="leaderboard-item" data-friend-id="${friend.id}" style="cursor:pointer;">
            <div class="lb-rank-col">#${idx + 1}</div>
            <div class="lb-info-col">
              <div class="lb-name-row">
                <span class="lb-username">${friend.username}</span>
                <span class="lb-code">${friend.friend_code}</span>
              </div>
              <div class="lb-meta-row" style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <span class="lb-streak">${friend.streak_days || 0} Gün Seri</span>
                <button type="button" class="prof-mini-btn btn-send-deck-friend-row" data-friend-id="${friend.id}" style="padding:2px 8px; font-size:0.72rem; color:#10B981; border-color:rgba(16,185,129,0.4);">Deste Gönder</button>
              </div>
            </div>
            <div class="lb-tier-col">
              <span class="lb-tier-badge" style="border-color:${tier.color}; color:${tier.color}">${tier.name}</span>
              <span class="lb-elo-num">${friend.elo} ELO</span>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;

      container.querySelectorAll('.btn-send-deck-friend-row').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fid = btn.getAttribute('data-friend-id');
          const friendObj = board.find(f => f.id === fid);
          if (friendObj) this.openSendDeckToFriendModal(friendObj);
        });
      });

      container.querySelectorAll('.leaderboard-item').forEach(el => {
        el.addEventListener('click', () => {
          const fid = el.getAttribute('data-friend-id');
          const friendObj = board.find(f => f.id === fid);
          if (friendObj) this.openFriendDetailModal(friendObj);
        });
      });
    }

    async renderPendingRequests() {
      const box = $('social-pending-requests-box');
      if (!box) return;

      if (!this.isCloudConnected()) {
        box.classList.add('hidden');
        return;
      }

      const incoming = await this.getPendingFriendships();
      if (incoming.length === 0) {
        box.classList.add('hidden');
        return;
      }

      box.classList.remove('hidden');
      let html = `<div class="section-subheading" style="margin-bottom:8px;">Gelen Arkadaşlık İstekleri (${incoming.length})</div>`;
      incoming.forEach(req => {
        const reqUser = req.requester || { username: 'Bilinmeyen', friend_code: 'WC#0000' };
        html += `
          <div class="pending-req-item" id="req-item-${req.id}" style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-subtle);">
            <div>
              <div style="font-weight:700; font-size:0.9rem;">${reqUser.username}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${reqUser.friend_code}</div>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn-primary-compact btn-req-accept" data-req-id="${req.id}" style="padding:4px 10px; font-size:0.75rem;">Kabul Et</button>
              <button type="button" class="btn-primary-compact btn-req-reject" data-req-id="${req.id}" style="padding:4px 10px; font-size:0.75rem; background:transparent; color:#EF4444; border:1px solid #EF4444;">Reddet</button>
            </div>
          </div>
        `;
      });
      box.innerHTML = html;

      box.querySelectorAll('.btn-req-accept').forEach(b => {
        b.addEventListener('click', async (e) => {
          const reqId = e.currentTarget.getAttribute('data-req-id');
          await this.acceptFriendRequest(reqId);
          await this.renderPendingRequests();
          await this.renderFriendsLeaderboard();
        });
      });

      box.querySelectorAll('.btn-req-reject').forEach(b => {
        b.addEventListener('click', async (e) => {
          const reqId = e.currentTarget.getAttribute('data-req-id');
          await this.rejectFriendRequest(reqId);
          await this.renderPendingRequests();
        });
      });
    }

    async handleUserSearch() {
      const input = $('social-user-search-input');
      const resultsContainer = $('social-user-search-results');
      if (!input || !resultsContainer) return;

      const q = input.value.trim();
      if (!q) {
        resultsContainer.innerHTML = '';
        return;
      }

      resultsContainer.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted); padding:6px;">Aranıyor...</div>';
      const results = await this.searchUser(q);

      if (results.length === 0) {
        resultsContainer.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted); padding:6px;">Kullanıcı bulunamadı.</div>';
        return;
      }

      let html = '';
      results.forEach(u => {
        const tier = getTierForElo(u.elo);
        html += `
          <div class="search-result-item" style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-subtle);">
            <div>
              <div style="font-weight:700; font-size:0.9rem;">${u.username} <span style="font-size:0.75rem; color:var(--text-muted);">${u.friend_code}</span></div>
              <div style="font-size:0.75rem; color:${tier.color}; font-weight:700;">${tier.name} · ${u.elo} ELO</div>
            </div>
            <button type="button" class="btn-primary-compact btn-send-friend-req" data-target-id="${u.id}" style="padding:4px 10px; font-size:0.75rem;">Ekle</button>
          </div>
        `;
      });
      resultsContainer.innerHTML = html;

      resultsContainer.querySelectorAll('.btn-send-friend-req').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const targetId = e.currentTarget.getAttribute('data-target-id');
          e.currentTarget.disabled = true;
          e.currentTarget.textContent = 'Gönderildi';
          try {
            await this.sendFriendRequest(targetId);
            if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Arkadaşlık isteği gönderildi.');
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }

    async openFriendDetailModal(friend) {
      this.viewingFriendProfile = friend;
      const modal = $('friend-detail-submodal');
      if (!modal) return;

      const tier = getTierForElo(friend.elo);
      if ($('friend-detail-name')) $('friend-detail-name').textContent = friend.username;
      if ($('friend-detail-code')) $('friend-detail-code').textContent = friend.friend_code;
      if ($('friend-detail-elo')) $('friend-detail-elo').textContent = friend.elo;
      if ($('friend-detail-tier')) {
        $('friend-detail-tier').textContent = tier.name;
        $('friend-detail-tier').style.borderColor = tier.color;
        $('friend-detail-tier').style.color = tier.color;
      }
      if ($('friend-detail-streak')) $('friend-detail-streak').textContent = (friend.streak_days || 0) + ' Gün Seri';

      await this.renderFriendStats(friend.id, this.friendFilterRange);
      await this.renderFriendDecks(friend.id);

      modal.classList.remove('hidden');
    }

    async renderFriendStats(friendId, range) {
      const stats = await this.getAggregatedStats(friendId, range);
      if ($('fstat-genus')) $('fstat-genus').textContent = '%' + stats.artikelAcc;
      if ($('fstat-kontext')) $('fstat-kontext').textContent = '%' + stats.clozeAcc;
      if ($('fstat-tempo')) $('fstat-tempo').textContent = stats.agilitySec + 's';
      if ($('fstat-ausdauer')) $('fstat-ausdauer').textContent = '%' + stats.retentionRate;
    }

    async renderFriendDecks(friendId) {
      const container = $('friend-decks-list');
      if (!container) return;
      container.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted); padding:10px;">Paylaşılan desteler yükleniyor...</div>';

      const decks = await this.getUserDecks(friendId);
      if (decks.length === 0) {
        container.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted); padding:10px;">Arkadaşınız henüz deste paylaşmamış veya desteleri gizli.</div>';
        return;
      }

      let html = '';
      decks.forEach(d => {
        const words = d.words_json || d.words || [];
        html += `
          <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:10px; padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; font-size:0.92rem; color:var(--text-primary);">${d.title}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${words.length} Kelime</div>
            </div>
            <button type="button" class="btn-primary-compact btn-import-f-deck" data-deck-id="${d.id}" style="padding:6px 10px; font-size:0.78rem;">İçe Aktar</button>
          </div>
        `;
      });
      container.innerHTML = html;

      container.querySelectorAll('.btn-import-f-deck').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const did = e.currentTarget.getAttribute('data-deck-id');
          const dObj = decks.find(d => String(d.id) === String(did));
          if (!dObj) return;

          e.currentTarget.disabled = true;
          e.currentTarget.textContent = 'Aktarılıyor...';
          try {
            await this.importDeckToLocal(dObj);
            e.currentTarget.textContent = 'Eklendi';
            if (window.wmApp && window.wmApp.showToast) {
              window.wmApp.showToast(`"${dObj.title}" destesi kütüphanenize eklendi.`);
            }
          } catch (err) {
            alert('İçe aktarma hatası: ' + err.message);
            e.currentTarget.disabled = false;
            e.currentTarget.textContent = 'İçe Aktar';
          }
        });
      });
    }

    // =========================================================================
    // BASİT AUTH & OTURUM
    // =========================================================================
    async signUpWithUsername(username, password, passwordConfirm) {
      const cleanUser = (username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (cleanUser.length < 3) throw new Error('Kullanıcı adı en az 3 karakter olmalı (harf, rakam, alt çizgi).');
      if (!password || password.length < 6) throw new Error('Şifre en az 6 karakter olmalıdır.');
      if (password !== passwordConfirm) throw new Error('Şifreler birbiriyle eşleşmiyor.');

      const data = await this.apiCall('auth/register', { username: cleanUser, password });
      if (data.ok && data.session) {
        localStorage.setItem(this.sessionKey, JSON.stringify(data.session));
        localStorage.setItem(this.profileKey, JSON.stringify(data.profile));
        this.user = data.session.user;
        this.profile = data.profile;
        this.updateUI();
        this.autoSyncDecksToCloud().catch(() => {});
        try { await this.refreshProfileView(); } catch (_) {}
        try { await this.refreshSocialView(); } catch (_) {}
        return true;
      }
      throw new Error(data.error || 'Kayıt işlemi başarısız.');
    }

    async signInWithUsername(username, password) {
      const cleanUser = (username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (!cleanUser || !password) throw new Error('Lütfen kullanıcı adı ve şifrenizi girin.');

      const data = await this.apiCall('auth/login', { username: cleanUser, password });
      if (data.ok && data.session) {
        localStorage.setItem(this.sessionKey, JSON.stringify(data.session));
        localStorage.setItem(this.profileKey, JSON.stringify(data.profile));
        this.user = data.session.user;
        this.profile = data.profile;
        this.updateUI();
        this.autoSyncDecksToCloud().catch(() => {});
        try { await this.refreshProfileView(); } catch (_) {}
        try { await this.refreshSocialView(); } catch (_) {}
        return data;
      }
      throw new Error(data.error || 'Giriş yapılamadı.');
    }

    async signOut() {
      localStorage.removeItem(this.sessionKey);
      localStorage.removeItem(this.profileKey);
      this.user = null;
      this.profile = null;
      window.location.reload();
    }

    async refreshProfileView() {
      this.updateUI();
      const prof = this.getActiveProfile();
      await this.renderStatsCards(prof.id, this.currentFilterRange);
    }

    async refreshSocialView() {
      this.updateUI();
      await this.populateDeckSelects();
      await this.renderPendingRequests();
      await this.renderIncomingDeckGifts();
      await this.renderFriendsLeaderboard();
      await this.renderPublicDecks();
      await this.renderClubs();
    }

    async populateDeckSelects() {
      const decks = await this.getLocalDecksSafe();
      const packs = Array.isArray(window.CURATED_CEFR_PACKS) ? window.CURATED_CEFR_PACKS : [];

      let defaultVal = null;
      const nonEmptyLocal = decks.find(d => (d.cardCount || 0) > 0);
      if (nonEmptyLocal) {
        defaultVal = String(nonEmptyLocal.id);
      } else if (decks.length > 0) {
        defaultVal = String(decks[0].id);
      }

      // 1. Sadece Kullanıcının Kendi Desteleri (Paylaşım, Kulüp ve Arkadaş Gönderimleri için)
      let userOnlyHtml = '';
      if (decks.length > 0) {
        userOnlyHtml += `<optgroup label="Benim Destelerim">`;
        for (const d of decks) {
          const count = d.cardCount || 0;
          const label = d.name || d.title || 'Genel Deste';
          const sel = String(d.id) === defaultVal ? ' selected' : '';
          userOnlyHtml += `<option value="${d.id}"${sel}>${label} (${count} kelime)</option>`;
        }
        userOnlyHtml += `</optgroup>`;
      } else {
        userOnlyHtml = `<option value="">Henüz yerel desteniz yok</option>`;
      }

      // 2. Oyunlar için Genişletilmiş Liste (Yerel Desteler + Hazır Seviye Paketleri)
      let gameHtml = userOnlyHtml;
      if (packs.length > 0) {
        gameHtml += `<optgroup label="Hazır Seviye Desteleri (Küratörlü)">`;
        for (const p of packs) {
          const val = 'pack:' + p.code;
          const count = Array.isArray(p.cards) ? p.cards.length : 0;
          const sel = val === defaultVal ? ' selected' : '';
          gameHtml += `<option value="${val}"${sel}>${p.name} (${count} kelime)</option>`;
        }
        gameHtml += `</optgroup>`;
      }

      // Oyun seçicilerine hem yerel hem hazır paketler
      ['arena-1v1-deck-select', 'arena-kahoot-deck-select'].forEach(id => {
        const el = $(id);
        if (el) {
          const prevVal = el.value;
          el.innerHTML = gameHtml;
          if (prevVal && Array.from(el.options).some(o => o.value === prevVal)) {
            el.value = prevVal;
          } else if (defaultVal) {
            el.value = defaultVal;
          }
        }
      });

      // Paylaşım, Kulüp ve Arkadaş Gönderimlerine KESİNLİKLE sadece kullanıcının kendi desteleri
      [
        'select-collab-deck',
        'select-publish-target-deck',
        'select-club-target-deck',
        'select-send-friend-deck'
      ].forEach(id => {
        const el = $(id);
        if (el) {
          const prevVal = el.value;
          el.innerHTML = userOnlyHtml;
          if (prevVal && Array.from(el.options).some(o => o.value === prevVal)) {
            el.value = prevVal;
          } else if (defaultVal) {
            el.value = defaultVal;
          }
        }
      });
    }

    // =========================================================================
    // OLAY YAKALAYICILARI (EVENT LISTENERS)
    // =========================================================================
    // =========================================================================
    // BİLDİRİM SİSTEMİ (WEB NOTIFICATION & CANLI INBOX POLLING)
    // =========================================================================
    initNotificationSystem() {
      // Tarayıcı Bildirim İzni İsteme (Kullanıcı etkileşiminde)
      if ('Notification' in window && Notification.permission === 'default') {
        const askPerm = () => {
          Notification.requestPermission().catch(() => {});
          document.removeEventListener('click', askPerm);
        };
        document.addEventListener('click', askPerm, { once: true });
      }

      // Tekrar Kartları Hatırlatıcısı (Günde 1 kez veya açılışta due kart kontrolü)
      setTimeout(() => {
        this.checkDueCardsReminder().catch(() => {});
      }, 3000);

      // Canlı Gelen Kutusu & Davet Polling'i (3.5 Saniyede bir anlık kontrol)
      this.startLiveInboxPolling();
    }

    sendPushNotification(title, body) {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, {
            body,
            icon: 'icons/icon-192.svg',
            badge: 'icons/icon-192.svg'
          });
        }
      } catch (_) {}
    }

    async checkDueCardsReminder() {
      if (!window.wmDB || typeof window.wmDB.getDueCards !== 'function') return;
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const lastRemindDate = localStorage.getItem('wm_last_due_reminder_date');
        if (lastRemindDate === todayStr) return; // Bugün zaten hatırlatıldı

        const dueCards = await window.wmDB.getDueCards('all');
        const count = Array.isArray(dueCards) ? dueCards.length : 0;
        if (count >= 3) {
          localStorage.setItem('wm_last_due_reminder_date', todayStr);
          this.sendPushNotification(
            'WortCoach — Günün Kelime Tekrarı',
            `Bugün tekrar bekleyen ${count} kelime kartınız var! Serinizi korumak için pratik yapın.`
          );
          if (window.wmApp && window.wmApp.showToast) {
            window.wmApp.showToast(`Günün tekrarı: ${count} kart tekrar edilmeye hazır.`);
          }
        }
      } catch (_) {}
    }

    startLiveInboxPolling() {
      if (this.inboxPollTimer) clearInterval(this.inboxPollTimer);
      this.knownInboxItemIds = new Set();
      this.isFirstInboxCheck = true;

      this.inboxPollTimer = setInterval(async () => {
        if (!this.isCloudConnected()) return;
        try {
          const res = await this.apiCall('decks/inbox/get', { userId: this.user.id });
          const items = Array.isArray(res.gifts) ? res.gifts : [];

          // İlk kontrolde mevcutları bilinen olarak işaretle
          if (this.isFirstInboxCheck) {
            items.forEach(item => this.knownInboxItemIds.add(item.id));
            this.isFirstInboxCheck = false;
            return;
          }

          // Yeni gelen öğeleri tespit et
          let hasNew = false;
          for (const item of items) {
            if (!this.knownInboxItemIds.has(item.id)) {
              this.knownInboxItemIds.add(item.id);
              hasNew = true;

              if (item.type === 'match_invite') {
                const matchName = item.matchType === 'kahoot' ? 'Rekabet Müsabakasına' : 'Düelloya';
                const msg = `${item.fromUsername} seni ${matchName} davet etti! (PIN: ${item.pin})`;
                this.sendPushNotification('WortCoach — Rekabet Daveti', msg);
                if (window.wmApp && window.wmApp.showToast) {
                  window.wmApp.showToast(msg);
                }
              } else {
                const msg = `${item.fromUsername} sana "${item.deckTitle}" kelime destesini gönderdi.`;
                this.sendPushNotification('WortCoach — Yeni Deste Hediyesi', msg);
                if (window.wmApp && window.wmApp.showToast) {
                  window.wmApp.showToast(msg);
                }
              }
            }
          }

          if (hasNew) {
            await this.renderIncomingDeckGifts();
          }
        } catch (_) {}
      }, 3500);
    }

    attachEventListeners() {
      // 1. Sosyal Alt Sekme Geçişleri (Pills: Arkadaşlar, Açık Desteler, Kulüpler, Arena, Ortak Çalışma)
      document.querySelectorAll('.social-subtab-btn[data-target-pane]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.social-subtab-btn').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          const targetId = e.currentTarget.getAttribute('data-target-pane');

          document.querySelectorAll('#tab-social .social-pane').forEach(p => p.classList.add('hidden'));
          const targetEl = $(targetId);
          if (targetEl) targetEl.classList.remove('hidden');

          if (targetId === 'pane-social-friends') {
            this.renderPendingRequests();
            this.renderIncomingDeckGifts();
            this.renderFriendsLeaderboard();
          } else if (targetId === 'pane-social-public-decks') {
            this.renderPublicDecks();
          } else if (targetId === 'pane-social-clubs') {
            this.renderClubs();
          } else if (targetId === 'pane-social-arena' || targetId === 'pane-social-collab') {
            this.populateDeckSelects();
          }
        });
      });

      // 2. Profil İstatistik Zaman Filtresi Butonları (1G, 1H, 1A, 1Y, Tümü)
      document.querySelectorAll('.prof-stat-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.prof-stat-filter-btn').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          const range = e.currentTarget.getAttribute('data-range') || '7d';
          this.currentFilterRange = range;
          const prof = this.getActiveProfile();
          this.renderStatsCards(prof.id, range);
        });
      });

      // 3. Arkadaş İstatistik Zaman Filtresi
      document.querySelectorAll('.friend-stat-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.friend-stat-filter-btn').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          const range = e.currentTarget.getAttribute('data-range') || '7d';
          this.friendFilterRange = range;
          if (this.viewingFriendProfile) {
            this.renderFriendStats(this.viewingFriendProfile.id, range);
          }
        });
      });

      // 4. Arkadaş Arama
      $('btn-social-search-user')?.addEventListener('click', () => this.handleUserSearch());
      $('social-user-search-input')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') this.handleUserSearch();
      });

      // 5. Arkadaş Kodu Kopyalama
      const copyFriendCode = () => {
        const prof = this.getActiveProfile();
        if (navigator.clipboard && prof.friend_code) {
          navigator.clipboard.writeText(prof.friend_code).then(() => {
            if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Arkadaş kodu panoya kopyalandı.');
          });
        }
      };
      $('btn-copy-friend-code')?.addEventListener('click', copyFriendCode);
      $('btn-social-copy-code')?.addEventListener('click', copyFriendCode);

      // 6. Deste Gizliliği
      $('profile-deck-privacy-select')?.addEventListener('change', async (e) => {
        await this.updateDeckPrivacy(e.target.value);
        if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Deste gizliliği güncellendi ve bulutla eşitlendi.');
      });

      // 7. Tüm Desteleri Buluta Senkronize Et Butonu
      $('btn-sync-all-decks-cloud')?.addEventListener('click', async () => {
        const btn = $('btn-sync-all-decks-cloud');
        btn.disabled = true;
        btn.textContent = 'Senkronize Ediliyor...';
        try {
          const count = await this.syncAllDecksToCloud();
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(`${count} deste bulutla senkronize edildi.`);
        } catch (err) {
          alert('Hata: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Destelerimi Buluta Senkronize Et';
        }
      });

      // 8. Sosyal Sekme Senkronizasyon Tetikleyicisi
      $('btn-social-sync-trigger')?.addEventListener('click', async () => {
        if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Sosyal veriler güncelleniyor...');
        await this.autoSyncDecksToCloud();
        await this.refreshSocialView();
      });

      // 9. Herkese Açık Deste Paylaşım Modalı
      $('btn-publish-my-deck-modal')?.addEventListener('click', () => this.openPublishDeckModal());
      $('btn-close-publish-deck')?.addEventListener('click', () => $('modal-publish-deck')?.classList.add('hidden'));

      $('btn-submit-publish-deck')?.addEventListener('click', async () => {
        const select = $('select-publish-target-deck');
        const vis = $('select-publish-visibility')?.value || 'public';
        const desc = $('input-publish-desc')?.value?.trim() || '';
        const deckId = select ? select.value : null;

        if (!deckId) {
          alert('Lütfen paylaşılacak bir deste seçin.');
          return;
        }

        const btn = $('btn-submit-publish-deck');
        btn.disabled = true;
        btn.textContent = 'Paylaşılıyor...';

        try {
          await this.syncLocalDeckToCloud(deckId, vis === 'public', desc);
          $('modal-publish-deck')?.classList.add('hidden');
          if ($('input-publish-desc')) $('input-publish-desc').value = '';
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Deste başarıyla paylaşıldı!');
          await this.renderPublicDecks();
        } catch (err) {
          alert('Paylaşım hatası: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Buluta Yükle & Paylaş';
        }
      });

      // 10. Açık Deste Arama & Önizleme
      $('btn-refresh-public-decks')?.addEventListener('click', () => this.renderPublicDecks());
      $('input-search-public-decks')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') this.renderPublicDecks();
      });

      $('btn-close-preview-deck')?.addEventListener('click', () => $('modal-preview-public-deck')?.classList.add('hidden'));
      $('btn-import-previewed-deck')?.addEventListener('click', async () => {
        if (!this.viewingPreviewDeck) return;
        try {
          await this.importDeckToLocal(this.viewingPreviewDeck);
          $('modal-preview-public-deck')?.classList.add('hidden');
          if (window.wmApp && window.wmApp.showToast) {
            window.wmApp.showToast(`"${this.viewingPreviewDeck.title}" kütüphanenize eklendi.`);
          }
        } catch (err) {
          alert(err.message);
        }
      });

      // 11. Kulüpler / Sınıflar Eylemleri
      $('btn-open-create-club')?.addEventListener('click', () => $('modal-create-club')?.classList.remove('hidden'));
      $('btn-close-create-club')?.addEventListener('click', () => $('modal-create-club')?.classList.add('hidden'));

      $('btn-submit-create-club')?.addEventListener('click', async () => {
        const name = $('input-club-name')?.value.trim();
        const desc = $('input-club-desc')?.value.trim();
        const access = $('select-club-access')?.value || 'public';
        if (!name) {
          alert('Lütfen bir kulüp adı girin.');
          return;
        }
        const btn = $('btn-submit-create-club');
        if (btn) btn.disabled = true;
        try {
          const club = await this.createClub(name, desc, access);
          $('modal-create-club')?.classList.add('hidden');
          if ($('input-club-name')) $('input-club-name').value = '';
          if ($('input-club-desc')) $('input-club-desc').value = '';
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(`Kulüp başarıyla kuruldu!`);
          await this.renderClubs();
          this.openClubDetailModal(club);
        } catch (err) {
          alert(err.message);
        } finally {
          if (btn) btn.disabled = false;
        }
      });

      // Kulüp Kapat / Sil (Yalnızca Kurucu)
      $('btn-delete-club')?.addEventListener('click', async () => {
        if (!this.viewingClub) return;
        if (!confirm(`"${this.viewingClub.name}" kulübünü ve tüm kulüp havuzunu kapatıp silmek istediğinize emin misiniz?`)) return;

        const myId = this.isCloudConnected() ? this.user?.id : this.getActiveProfile().id;
        try {
          await this.apiCall('clubs/delete', { clubId: this.viewingClub.id, ownerId: myId });
          $('modal-club-detail')?.classList.add('hidden');
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Kulüp başarıyla kapatıldı.');
          await this.renderClubs();
        } catch (err) {
          alert('Hata: ' + err.message);
        }
      });

      $('btn-open-join-club')?.addEventListener('click', () => $('modal-join-club')?.classList.remove('hidden'));
      $('btn-close-join-club')?.addEventListener('click', () => $('modal-join-club')?.classList.add('hidden'));

      $('btn-submit-join-club')?.addEventListener('click', async () => {
        const code = $('input-join-club-code')?.value.trim();
        if (!code) return;
        try {
          const club = await this.joinClubByCode(code);
          $('modal-join-club')?.classList.add('hidden');
          if ($('input-join-club-code')) $('input-join-club-code').value = '';
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(`"${club.name}" kulübüne katıldınız!`);
          await this.renderClubs();
          this.openClubDetailModal(club);
        } catch (err) {
          alert(err.message);
        }
      });

      $('btn-close-club-detail')?.addEventListener('click', () => $('modal-club-detail')?.classList.add('hidden'));

      // Kulübe Deste Ekleme Modalı Aç / Kapat & Onayla
      $('btn-add-deck-to-club')?.addEventListener('click', async () => {
        if (!this.viewingClub) return;
        await this.populateDeckSelects();
        $('modal-add-club-deck')?.classList.remove('hidden');
      });

      $('btn-close-add-club-deck')?.addEventListener('click', () => {
        $('modal-add-club-deck')?.classList.add('hidden');
      });

      $('btn-confirm-add-club-deck')?.addEventListener('click', async () => {
        if (!this.viewingClub) return;
        const deckVal = $('select-club-target-deck')?.value;
        if (!deckVal) {
          alert('Lütfen bir deste seçin.');
          return;
        }
        if (String(deckVal).startsWith('pack:')) {
          alert('Hazır küratörlü paketler kulüp havuzuna eklenemez.');
          return;
        }
        const btn = $('btn-confirm-add-club-deck');
        btn.disabled = true;
        btn.textContent = 'Ekleniyor...';
        try {
          const resolved = await this.getDeckWithCardsBySelection(deckVal);
          if (!resolved.words || resolved.words.length === 0) {
            throw new Error('Seçilen destede henüz kelime bulunmuyor.');
          }
          const prof = this.getActiveProfile();
          const res = await this.apiCall('clubs/decks/add', {
            clubId: this.viewingClub.id,
            deck: { id: 'cdeck_' + Date.now(), title: resolved.title, words: resolved.words },
            username: prof.username,
            userId: prof.id || this.user?.id
          });
          if (res.club) {
            this.viewingClub = res.club;
          } else if (res.deck) {
            if (!Array.isArray(this.viewingClub.decks)) this.viewingClub.decks = [];
            this.viewingClub.decks.push(res.deck);
          }
          $('modal-add-club-deck')?.classList.add('hidden');
          if (window.wmApp && window.wmApp.showToast) {
            window.wmApp.showToast(`"${resolved.title}" kulüp havuzuna eklendi.`);
          }
          this.openClubDetailModal(this.viewingClub);
          await this.renderClubs();
        } catch (err) {
          alert('Hata: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Kulüp Havuzuna Ekle';
        }
      });

      // Kulüp Deste Kahoot Başlat
      $('btn-start-club-match')?.addEventListener('click', async () => {
        if (!this.viewingClub) return;
        $('modal-club-detail')?.classList.add('hidden');
        const clubDecks = this.viewingClub.decks || [];
        if (clubDecks.length > 0 && Array.isArray(clubDecks[0].words) && clubDecks[0].words.length >= 4) {
          const cd = clubDecks[0];
          const prof = this.getActiveProfile();
          let pin = String(Math.floor(100000 + Math.random() * 900000));
          try {
            const res = await this.apiCall('multiplayer/room/create', {
              type: 'kahoot',
              hostId: prof.id || 'host',
              hostName: prof.username || 'Host',
              deckTitle: cd.title,
              words: cd.words.slice(0, 10),
              duration: 15
            });
            if (res.ok && res.room) pin = res.room.pin;
          } catch (_) {}
          this.initKahootView(pin, cd.title, cd.words.slice(0, 10), 15, true);
        } else {
          const arenaTabBtn = document.querySelector('.social-subtab-btn[data-target-pane="pane-social-arena"]');
          arenaTabBtn?.click();
          $('arena-card-kahoot')?.click();
        }
      });

      // Arkadaşa Doğrudan Deste Gönderme Modalı Olayları
      $('btn-send-deck-from-detail')?.addEventListener('click', () => {
        if (!this.viewingFriendProfile) return;
        this.openSendDeckToFriendModal(this.viewingFriendProfile);
      });

      $('btn-close-send-deck-friend')?.addEventListener('click', () => {
        $('modal-send-deck-friend')?.classList.add('hidden');
      });

      $('btn-confirm-send-friend-deck')?.addEventListener('click', async () => {
        if (!this.sendingDeckTargetFriend) return;
        const deckVal = $('select-send-friend-deck')?.value;
        if (!deckVal) return;

        const btn = $('btn-confirm-send-friend-deck');
        btn.disabled = true;
        btn.textContent = 'Gönderiliyor...';
        try {
          const title = await this.sendDeckToFriend(this.sendingDeckTargetFriend, deckVal);
          $('modal-send-deck-friend')?.classList.add('hidden');
          if (window.wmApp && window.wmApp.showToast) {
            window.wmApp.showToast(`"${title}" destesi ${this.sendingDeckTargetFriend.username} kullanıcısına gönderildi!`);
          }
        } catch (err) {
          alert('Gönderim hatası: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Desteyi Gönder';
        }
      });

      // 12. Arena Mod Geçişi (1v1 vs Kahoot)
      $('arena-card-1v1')?.addEventListener('click', () => {
        $('arena-card-1v1').style.borderColor = 'var(--brand-blue)';
        $('arena-card-kahoot').style.borderColor = 'var(--border-subtle)';
        $('arena-panel-1v1').classList.remove('hidden');
        $('arena-panel-kahoot').classList.add('hidden');
      });

      $('arena-card-kahoot')?.addEventListener('click', () => {
        $('arena-card-kahoot').style.borderColor = '#8B5CF6';
        $('arena-card-1v1').style.borderColor = 'var(--border-subtle)';
        $('arena-panel-kahoot').classList.remove('hidden');
        $('arena-panel-1v1').classList.add('hidden');
      });

      // 1v1 Maç Eylemleri & Lobi
      $('btn-create-1v1-room')?.addEventListener('click', async () => {
        const deckId = $('arena-1v1-deck-select')?.value;
        if (!deckId) return;
        try {
          await this.start1v1MatchAsHost(deckId);
        } catch (err) {
          alert(err.message);
        }
      });

      $('btn-join-1v1-room')?.addEventListener('click', async () => {
        const pin = $('input-arena-1v1-pin')?.value;
        try {
          await this.join1v1Match(pin);
        } catch (err) {
          alert(err.message);
        }
      });

      $('btn-copy-1v1-pin')?.addEventListener('click', () => {
        const pin = $('arena-1v1-pin-display')?.textContent || this.match1v1State?.roomPin;
        if (pin && navigator.clipboard) {
          navigator.clipboard.writeText(pin).then(() => {
            if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('PIN kodu kopyalandı.');
          });
        }
      });

      $('btn-open-invite-friend-1v1')?.addEventListener('click', () => {
        const pin = this.match1v1State?.roomPin || $('arena-1v1-pin-display')?.textContent;
        if (pin) this.openInviteFriendMatchModal(pin, '1v1', this.match1v1State?.deckTitle || 'Deste');
      });

      $('btn-open-invite-friend-kahoot')?.addEventListener('click', () => {
        const pin = this.kahootState?.pin;
        if (pin) this.openInviteFriendMatchModal(pin, 'kahoot', this.kahootState?.deckTitle || 'Deste');
      });

      $('btn-close-invite-friend-match')?.addEventListener('click', () => {
        $('modal-invite-friend-match')?.classList.add('hidden');
      });

      $('btn-start-1v1-lobby-match')?.addEventListener('click', () => {
        this.launch1v1GameByHost();
      });

      $('btn-close-1v1-game')?.addEventListener('click', () => {
        if (confirm('Maçtan ayrılmak istediğinize emin misiniz?')) {
          if (this.match1v1PollTimer) clearInterval(this.match1v1PollTimer);
          if (this.match1v1Timer) clearInterval(this.match1v1Timer);
          this.match1v1PollTimer = null;
          this.match1v1Timer = null;
          $('modal-arena-1v1-game')?.classList.add('hidden');
        }
      });

      $('btn-finish-1v1-game')?.addEventListener('click', () => {
        $('modal-arena-1v1-game')?.classList.add('hidden');
        this.refreshProfileView();
      });

      // Kahoot Grup Oyunu Eylemleri
      $('btn-create-kahoot-room')?.addEventListener('click', async () => {
        const deckId = $('arena-kahoot-deck-select')?.value;
        const duration = $('arena-kahoot-duration-select')?.value;
        const count = $('arena-kahoot-count-select')?.value;
        if (!deckId) return;
        try {
          await this.createKahootRoom(deckId, duration, count);
        } catch (err) {
          alert(err.message);
        }
      });

      $('btn-join-kahoot-room')?.addEventListener('click', async () => {
        const pin = $('input-arena-kahoot-pin')?.value;
        try {
          await this.joinKahootRoom(pin);
        } catch (err) {
          alert(err.message);
        }
      });

      $('btn-start-kahoot-match')?.addEventListener('click', () => {
        this.launchKahootGameByHost();
      });

      $('btn-close-kahoot-game')?.addEventListener('click', async () => {
        if (confirm('Müsabakadan ayrılmak istediğinize emin misiniz?')) {
          const pin = this.kahootState?.pin;
          const isHost = this.kahootState?.isHost;
          const myId = this.getActiveProfile().id;

          if (this.kahootPollTimer) clearInterval(this.kahootPollTimer);
          if (this.kahootState?.timerId) clearInterval(this.kahootState.timerId);
          this.kahootPollTimer = null;
          $('modal-arena-kahoot-game')?.classList.add('hidden');

          if (pin) {
            try {
              if (isHost) {
                await this.apiCall('multiplayer/room/close', { pin, hostId: myId });
              } else {
                await this.apiCall('multiplayer/room/leave', { pin, playerId: myId });
              }
            } catch (_) {}
          }
        }
      });

      // 4 Renkli Kahoot Butonları
      ['red', 'blue', 'yellow', 'green'].forEach(color => {
        const btn = document.querySelector(`.btn-kahoot-${color}`);
        btn?.addEventListener('click', (e) => {
          const selected = decodeURIComponent(e.currentTarget.getAttribute('data-meaning') || '');
          this.handleKahootAnswer(selected);
        });
      });

      $('btn-kahoot-next-question')?.addEventListener('click', async () => {
        if (!this.kahootState?.isHost) return;
        this.kahootState.currentIndex += 1;
        try {
          await this.apiCall('multiplayer/room/next_question', {
            pin: this.kahootState.pin,
            hostId: this.getActiveProfile().id,
            questionIndex: this.kahootState.currentIndex
          });
        } catch (_) {}
        this.startKahootQuestion();
      });

      $('btn-finish-kahoot-game')?.addEventListener('click', () => {
        $('modal-arena-kahoot-game')?.classList.add('hidden');
        this.refreshProfileView();
      });

      // 13. Ortak Deste Çalışması Eylemleri
      $('btn-init-collab-session')?.addEventListener('click', async () => {
        const deckId = $('select-collab-deck')?.value;
        if (!deckId) {
          alert('Lütfen bir deste seçin.');
          return;
        }
        try {
          await this.initCollabSession(deckId);
        } catch (err) {
          alert(err.message);
        }
      });

      $('btn-copy-collab-code')?.addEventListener('click', () => {
        const code = this.activeCollabSession?.code || $('collab-active-code-badge')?.textContent;
        if (code && navigator.clipboard) {
          navigator.clipboard.writeText(code).then(() => {
            if (window.wmApp && window.wmApp.showToast) {
              window.wmApp.showToast(`İşbirliği kodu (${code}) panoya kopyalandı.`);
            }
          });
        }
      });

      $('btn-join-collab-session')?.addEventListener('click', async () => {
        const code = $('input-join-collab-code')?.value;
        try {
          await this.joinCollabSession(code);
        } catch (err) {
          alert(err.message);
        }
      });

      $('btn-add-card-to-collab')?.addEventListener('click', () => {
        $('modal-add-collab-card')?.classList.remove('hidden');
      });

      $('btn-close-collab-card')?.addEventListener('click', () => {
        $('modal-add-collab-card')?.classList.add('hidden');
      });

      $('btn-submit-collab-card')?.addEventListener('click', async () => {
        const front = $('input-collab-front')?.value.trim();
        const back = $('input-collab-back')?.value.trim();
        const pos = $('select-collab-pos')?.value || 'NOUN';
        const ex = $('input-collab-example')?.value.trim() || '';

        if (!front || !back) {
          alert('Lütfen kelime ve anlamını girin.');
          return;
        }

        await this.addCardToActiveCollab(front, back, pos, ex);
        $('modal-add-collab-card')?.classList.add('hidden');
        $('input-collab-front').value = '';
        $('input-collab-back').value = '';
        $('input-collab-example').value = '';
        if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Ortak desteye kelime eklendi.');
      });

      $('btn-save-collab-to-local')?.addEventListener('click', async () => {
        if (!this.activeCollabSession) return;
        try {
          await this.importDeckToLocal(this.activeCollabSession);
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Ortak deste kütüphanenize kaydedildi.');
        } catch (err) {
          alert(err.message);
        }
      });

      // 14. Arkadaş Detay Modalı Kapatma
      $('btn-close-friend-detail')?.addEventListener('click', () => {
        $('friend-detail-submodal')?.classList.add('hidden');
      });

      // 15. Lig Atlama Modalı Kapatma
      $('btn-close-rank-promo')?.addEventListener('click', () => {
        $('modal-rank-promotion')?.classList.add('hidden');
      });

      // 16. Auth Modal Aç / Kapat & Formlar
      $('btn-welcome-register')?.addEventListener('click', () => {
        this.openAuthModal('register');
      });

      $('btn-welcome-login')?.addEventListener('click', () => {
        this.openAuthModal('login');
      });

      $('btn-profile-auth-trigger')?.addEventListener('click', () => {
        if (this.user) {
          if (confirm('Oturumu kapatmak istediğinize emin misiniz?')) {
            this.signOut();
          }
        } else {
          this.openAuthModal('register');
        }
      });

      $('btn-close-auth-modal')?.addEventListener('click', () => {
        $('modal-auth')?.classList.add('hidden');
      });

      $('tab-btn-auth-login')?.addEventListener('click', () => {
        $('tab-btn-auth-login').classList.add('active');
        $('tab-btn-auth-register').classList.remove('active');
        $('form-auth-login').classList.remove('hidden');
        $('form-auth-register').classList.add('hidden');
      });

      $('tab-btn-auth-register')?.addEventListener('click', () => {
        $('tab-btn-auth-register').classList.add('active');
        $('tab-btn-auth-login').classList.remove('active');
        $('form-auth-register').classList.remove('hidden');
        $('form-auth-login').classList.add('hidden');
      });

      $('btn-submit-login')?.addEventListener('click', async () => {
        const u = $('auth-login-username')?.value;
        const p = $('auth-login-password')?.value;
        const errEl = $('auth-login-error');
        if (errEl) errEl.classList.add('hidden');

        try {
          $('btn-submit-login').disabled = true;
          $('btn-submit-login').textContent = 'Giriş Yapılıyor...';
          await this.signInWithUsername(u, p);
          $('modal-auth')?.classList.add('hidden');
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Başarıyla giriş yapıldı.');
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        } finally {
          $('btn-submit-login').disabled = false;
          $('btn-submit-login').textContent = 'Giriş Yap';
        }
      });

      $('btn-submit-register')?.addEventListener('click', async () => {
        const u = $('auth-reg-username')?.value;
        const p = $('auth-reg-password')?.value;
        const pc = $('auth-reg-password-confirm')?.value;
        const errEl = $('auth-reg-error');
        if (errEl) errEl.classList.add('hidden');

        try {
          $('btn-submit-register').disabled = true;
          $('btn-submit-register').textContent = 'Kayıt Yapılıyor...';
          await this.signUpWithUsername(u, p, pc);
          $('modal-auth')?.classList.add('hidden');
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Hesabınız oluşturuldu ve giriş yapıldı.');
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        } finally {
          $('btn-submit-register').disabled = false;
          $('btn-submit-register').textContent = 'Kayıt Ol';
        }
      });
    }
  }

  // Global Singleton
  window.WortCoachSocial = WortCoachSocial;
  window.wmSocial = new WortCoachSocial();
  document.addEventListener('DOMContentLoaded', () => {
    window.wmSocial.init();
  });
})();
