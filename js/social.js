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
      this.viewingPreviewDeck = null;
      this.viewingClub = null;
      this.activeCollabSession = null;

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
          this.loadProfile().catch(() => {});
        }
      } catch (e) {
        console.warn('Oturum okunamadı:', e.message);
      }

      this.updateUI();
      this.attachEventListeners();
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
    // DESTE SENKRONİZASYONU & PAYLAŞIMI ("PAYLAŞILAN DESTELERİ GÖREMİYORUM" ÇÖZÜMÜ)
    // =========================================================================
    async syncLocalDeckToCloud(deckId, isPublic = false, description = '') {
      const decks = await this.getLocalDecksSafe();
      const deck = decks.find(d => Number(d.id) === Number(deckId) || String(d.id) === String(deckId));
      if (!deck) throw new Error('Deste bulunamadı.');

      const cards = await this.getLocalCardsSafe(deck.id);
      const words = cards.map(c => ({
        lemma: c.germanWord || c.front || '',
        contextMeaning: c.meaningsTr || c.back || '',
        pos: c.partOfSpeech || c.pos || 'NOUN',
        sourceSentence: c.example || c.contextSentence || ''
      }));

      const prof = this.getActiveProfile();
      const ownerId = this.isCloudConnected() ? this.user.id : (prof.id || 'local_user');
      const authorUsername = prof.username || 'Kullanıcı';

      const payload = {
        ownerId,
        authorUsername,
        title: deck.name || deck.title || 'Deste',
        description,
        isPublic: !!isPublic,
        words
      };

      try {
        const res = await this.apiCall('decks/save', payload);
        return res;
      } catch (e) {
        // Çevrimdışı / Local Fallback Depolama
        let pubList = [];
        try {
          pubList = JSON.parse(localStorage.getItem(this.localPublicDecksKey)) || [];
        } catch (_) {}
        const localPubDeck = {
          id: 'pub_' + Date.now(),
          ownerId,
          title: deck.name || deck.title || 'Deste',
          authorUsername,
          description,
          isPublic: !!isPublic,
          words,
          wordCount: words.length,
          createdAt: new Date().toISOString()
        };
        pubList.unshift(localPubDeck);
        localStorage.setItem(this.localPublicDecksKey, JSON.stringify(pubList));
        return { ok: true, deckId: localPubDeck.id, offline: true };
      }
    }

    async syncAllDecksToCloud() {
      const decks = await this.getLocalDecksSafe();
      let count = 0;
      for (const d of decks) {
        try {
          await this.syncLocalDeckToCloud(d.id, false);
          count++;
        } catch (_) {}
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

      const words = cloudDeck.words_json || cloudDeck.words || [];
      for (const w of words) {
        await this.addLocalCardSafe({
          deckId: newDeckId,
          lemma: w.lemma || w.front || w.germanWord || '',
          contextMeaning: w.contextMeaning || w.back || w.meaningsTr || '',
          pos: w.pos || w.partOfSpeech || 'NOUN',
          sourceSentence: w.sourceSentence || w.example || ''
        });
      }

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
      decks.forEach(d => {
        const wCount = d.wordCount || (d.words && d.words.length) || (d.words_json && d.words_json.length) || 0;
        const author = d.authorUsername || d.username || 'Topluluk Yazarı';
        const dateStr = formatDisplayDate(d.createdAt || d.created_at);

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
              <div class="public-deck-actions">
                <button type="button" class="btn-preview-pub-deck" data-pub-id="${d.id}">İncele</button>
                <button type="button" class="btn-import-pub-deck" data-pub-id="${d.id}">Kütüphaneme Ekle</button>
              </div>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;

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
      const select = $('select-publish-target-deck');
      if (select) {
        const decks = await this.getLocalDecksSafe();
        select.innerHTML = decks.map(d => `<option value="${d.id}">${d.name || d.title}</option>`).join('');
      }
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
      clubs.forEach(c => {
        const memberCount = (c.members && c.members.length) || 1;
        const deckCount = (c.decks && c.decks.length) || 0;
        html += `
          <div class="club-card" data-club-id="${c.id}">
            <div>
              <div class="club-info-title">${c.name}</div>
              <div class="club-info-sub">${c.category || 'Genel'} · Kod: <strong style="color:var(--brand-blue-hover);">${c.code}</strong></div>
              <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">${memberCount} Üye · ${deckCount} Kulüp Destesi</div>
            </div>
            <button type="button" class="btn-primary-compact btn-open-club-view" data-club-id="${c.id}" style="padding:6px 12px; font-size:0.78rem;">İncele</button>
          </div>
        `;
      });
      container.innerHTML = html;

      container.querySelectorAll('.btn-open-club-view, .club-card').forEach(el => {
        el.addEventListener('click', (e) => {
          const cid = el.getAttribute('data-club-id');
          const cObj = clubs.find(x => String(x.id) === String(cid));
          if (cObj) this.openClubDetailModal(cObj);
        });
      });
    }

    async createClub(name, category, description) {
      const prof = this.getActiveProfile();
      const ownerId = this.isCloudConnected() ? this.user.id : (prof.id || 'local_user');
      const ownerUsername = prof.username || 'Kurucu';

      try {
        const res = await this.apiCall('clubs/create', { name, category, description, ownerId, ownerUsername });
        return res.club;
      } catch (e) {
        // Yerel fallback
        let list = [];
        try { list = JSON.parse(localStorage.getItem(this.localClubsKey)) || []; } catch (_) {}
        const code = 'KLB-' + Math.floor(1000 + Math.random() * 9000);
        const newClub = {
          id: 'club_' + Date.now(),
          code,
          name,
          category,
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

    openClubDetailModal(clubObj) {
      this.viewingClub = clubObj;
      const modal = $('modal-club-detail');
      if (!modal) return;

      if ($('club-detail-name')) $('club-detail-name').textContent = clubObj.name;
      if ($('club-detail-code-badge')) $('club-detail-code-badge').textContent = clubObj.code;
      const members = clubObj.members || [];
      if ($('club-detail-meta')) $('club-detail-meta').textContent = `${members.length} Üye · ${clubObj.category || 'Genel'}`;

      // Kulüp Desteleri
      const decksBox = $('club-decks-container');
      if (decksBox) {
        const decks = clubObj.decks || [];
        if (decks.length === 0) {
          decksBox.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding:8px 0;">Bu kulübe ait henüz deste paylaşılmamış.</div>';
        } else {
          let html = '';
          decks.forEach(d => {
            const wList = d.words || [];
            html += `
              <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:10px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="font-weight:800; font-size:0.9rem; color:var(--text-primary);">${d.title}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted);">${wList.length} Kelime · Ekleyen: ${d.addedBy || 'Üye'}</div>
                </div>
                <button type="button" class="btn-primary-compact btn-import-club-deck" data-deck-id="${d.id}" style="padding:6px 10px; font-size:0.78rem;">Destelerime Ekle</button>
              </div>
            `;
          });
          decksBox.innerHTML = html;

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
        }
      }

      // Kulüp Üyeleri
      const membersBox = $('club-members-container');
      if (membersBox) {
        let mHtml = '';
        members.forEach(m => {
          mHtml += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border-bottom:1px solid var(--border-subtle);">
              <span style="font-weight:700; font-size:0.85rem; color:var(--text-primary);">${m.username}</span>
              <span class="badge" style="font-size:0.72rem; padding:2px 8px; background:var(--accent-primary-soft); color:var(--brand-blue-hover);">${m.role || 'Üye'}</span>
            </div>
          `;
        });
        membersBox.innerHTML = mHtml;
      }

      modal.classList.remove('hidden');
    }

    // =========================================================================
    // 1v1 ZAMANA KARŞI DÜELLO MOTORU
    // =========================================================================
    async start1v1MatchAsHost(deckId) {
      const decks = await this.getLocalDecksSafe();
      const deck = decks.find(d => Number(d.id) === Number(deckId) || String(d.id) === String(deckId));
      if (!deck) throw new Error('Seçilen deste bulunamadı.');

      const cards = await this.getLocalCardsSafe(deck.id);
      if (cards.length < 4) throw new Error('1v1 kapışma için destede en az 4 kelime olmalıdır.');

      const words = cards.map(c => ({
        lemma: c.germanWord || c.front || '',
        contextMeaning: c.meaningsTr || c.back || '',
        pos: c.partOfSpeech || c.pos || 'NOUN',
        sourceSentence: c.example || ''
      }));

      const prof = this.getActiveProfile();
      let pin = 'VS-' + Math.floor(1000 + Math.random() * 9000);
      const deckTitle = deck.name || deck.title || 'Deste';

      try {
        const res = await this.apiCall('multiplayer/room/create', {
          type: '1v1',
          hostId: prof.id || 'host',
          hostName: prof.username || 'Host',
          deckTitle: deckTitle,
          words,
          duration: 60
        });
        if (res.ok && res.room) pin = res.room.pin;
      } catch (_) {}

      // Yerel maçı başlat
      this.init1v1GameView(pin, deckTitle, words);
    }

    async join1v1Match(pin) {
      const cleanPin = (pin || '').trim().toUpperCase();
      if (!cleanPin) throw new Error('Lütfen geçerli bir davet kodu girin.');

      let words = [];
      let deckTitle = 'Zamana Karşı Deste';

      try {
        const res = await this.apiCall('multiplayer/room/join', {
          pin: cleanPin,
          playerId: this.getActiveProfile().id,
          playerName: this.getActiveProfile().username
        });
        if (res.ok && res.room) {
          words = res.room.words || [];
          deckTitle = res.room.deckTitle || deckTitle;
        }
      } catch (_) {
        // Fallback kelimeler
        const allCards = await this.getLocalCardsSafe();
        words = allCards.slice(0, 15).map(c => ({
          lemma: c.germanWord || c.front || '',
          contextMeaning: c.meaningsTr || c.back || '',
          pos: c.partOfSpeech || c.pos || 'NOUN',
          sourceSentence: c.example || ''
        }));
      }

      if (words.length < 4) throw new Error('Maç verisine ulaşılamadı.');
      this.init1v1GameView(cleanPin, deckTitle, words);
    }

    init1v1GameView(pin, title, words) {
      this.match1v1State = {
        timerId: null,
        remainingSec: 60,
        words: [...words].sort(() => Math.random() - 0.5).slice(0, 10),
        currentIndex: 0,
        correctCount: 0,
        wrongCount: 0,
        myScore: 0,
        roomPin: pin
      };

      const modal = $('modal-arena-1v1-game');
      if (!modal) return;

      if ($('arena-1v1-match-title')) $('arena-1v1-match-title').textContent = `${title} (Kod: ${pin})`;
      if ($('arena-1v1-results-box')) $('arena-1v1-results-box').classList.add('hidden');
      if ($('arena-1v1-question-box')) $('arena-1v1-question-box').classList.remove('hidden');
      if ($('arena-1v1-options-grid')) $('arena-1v1-options-grid').classList.remove('hidden');

      modal.classList.remove('hidden');
      this.render1v1Question();
      this.start1v1Timer();
    }

    start1v1Timer() {
      if (this.match1v1State.timerId) clearInterval(this.match1v1State.timerId);
      const timerEl = $('arena-1v1-timer');

      this.match1v1State.timerId = setInterval(() => {
        this.match1v1State.remainingSec -= 1;
        if (timerEl) timerEl.textContent = this.match1v1State.remainingSec + 's';

        if (this.match1v1State.remainingSec <= 0) {
          clearInterval(this.match1v1State.timerId);
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

      // 4 Seçenek Üret
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
        btn.addEventListener('click', (e) => {
          const selected = decodeURIComponent(e.currentTarget.getAttribute('data-opt'));
          const isCorrect = selected === correctMeaning;

          grid.querySelectorAll('.btn-arena-option').forEach(b => b.disabled = true);
          if (isCorrect) {
            e.currentTarget.style.background = '#10B981';
            e.currentTarget.style.color = '#fff';
            st.correctCount += 1;
            const speedBonus = Math.max(10, Math.round(st.remainingSec * 2));
            st.myScore += (100 + speedBonus);
          } else {
            e.currentTarget.style.background = '#EF4444';
            e.currentTarget.style.color = '#fff';
            st.wrongCount += 1;
          }

          setTimeout(() => {
            st.currentIndex += 1;
            this.render1v1Question();
          }, 600);
        });
      });
    }

    async finish1v1Match() {
      if (this.match1v1State.timerId) clearInterval(this.match1v1State.timerId);
      const st = this.match1v1State;

      if ($('arena-1v1-question-box')) $('arena-1v1-question-box').classList.add('hidden');
      if ($('arena-1v1-options-grid')) $('arena-1v1-options-grid').classList.add('hidden');
      if ($('arena-1v1-results-box')) $('arena-1v1-results-box').classList.remove('hidden');

      if ($('arena-1v1-final-correct')) $('arena-1v1-final-correct').textContent = st.correctCount;
      if ($('arena-1v1-final-wrong')) $('arena-1v1-final-wrong').textContent = st.wrongCount;
      if ($('arena-1v1-final-pts')) $('arena-1v1-final-pts').textContent = st.myScore;

      // ELO Ödülü: Doğru sayısı çoğunluktaysa +25 ELO
      const isWinner = st.correctCount >= 6;
      const eloDelta = isWinner ? 25 : -10;
      if ($('arena-1v1-winner-text')) $('arena-1v1-winner-text').textContent = isWinner ? 'Tebrikler! Maçı Kazandınız' : 'İyi Mücadele!';
      if ($('arena-1v1-elo-result')) $('arena-1v1-elo-result').textContent = isWinner ? `+${eloDelta} ELO Kazandınız!` : `${eloDelta} ELO`;

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
    async createKahootRoom(deckId, duration = 15, count = 10) {
      const decks = await this.getLocalDecksSafe();
      const deck = decks.find(d => Number(d.id) === Number(deckId) || String(d.id) === String(deckId));
      if (!deck) throw new Error('Deste bulunamadı.');

      const cards = await this.getLocalCardsSafe(deck.id);
      if (cards.length < 4) throw new Error('Kahoot için destede en az 4 kelime olmalıdır.');

      const words = cards.map(c => ({
        lemma: c.germanWord || c.front || '',
        contextMeaning: c.meaningsTr || c.back || '',
        pos: c.partOfSpeech || c.pos || 'NOUN',
        sourceSentence: c.example || ''
      }));

      const prof = this.getActiveProfile();
      let pin = String(Math.floor(100000 + Math.random() * 900000));
      const deckTitle = deck.name || deck.title || 'Deste';

      try {
        const res = await this.apiCall('multiplayer/room/create', {
          type: 'kahoot',
          hostId: prof.id || 'host',
          hostName: prof.username || 'Host',
          deckTitle: deckTitle,
          words: words.slice(0, count),
          duration
        });
        if (res.ok && res.room) pin = res.room.pin;
      } catch (_) {}

      this.initKahootView(pin, deckTitle, words.slice(0, count), duration, true);
    }

    async joinKahootRoom(pin) {
      const cleanPin = (pin || '').trim();
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
      } catch (_) {
        const allCards = await this.getLocalCardsSafe();
        words = allCards.slice(0, 10).map(c => ({
          lemma: c.germanWord || c.front || '',
          contextMeaning: c.meaningsTr || c.back || '',
          pos: c.partOfSpeech || c.pos || 'NOUN'
        }));
      }

      if (words.length < 4) throw new Error('Oda bulunamadı veya kelime verisi eksik.');
      this.initKahootView(cleanPin, deckTitle, words, duration, false);
    }

    initKahootView(pin, deckTitle, words, duration, isHost) {
      const prof = this.getActiveProfile();
      this.kahootState = {
        pin,
        isHost,
        players: [{ id: prof.id, name: prof.username, score: 0 }],
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

      this.showKahootPhase('lobby');
      this.renderKahootLobbyPlayers();
      modal.classList.remove('hidden');
    }

    showKahootPhase(phaseName) {
      // 'lobby', 'question', 'intermediate', 'podium'
      ['lobby', 'question', 'intermediate', 'podium'].forEach(p => {
        const el = $(`kahoot-phase-${p}`);
        if (el) el.classList.toggle('hidden', p !== phaseName);
      });
    }

    renderKahootLobbyPlayers() {
      const chipList = $('kahoot-players-chip-list');
      if (!chipList) return;
      const prof = this.getActiveProfile();
      let html = `
        <span class="badge" style="background:var(--brand-blue); color:#fff; font-size:0.85rem; padding:6px 14px; border-radius:20px; font-weight:800;">
          ${prof.username} (Siz)
        </span>
      `;
      // Simülasyon oyuncular (grup hissi için)
      if (this.kahootState.players.length === 1) {
        ['AlmancaAvcisi', 'Lukas_Berlin'].forEach(bot => {
          this.kahootState.players.push({ id: bot, name: bot, score: 0 });
          this.kahootState.scores[bot] = 0;
          html += `
            <span class="badge" style="background:var(--bg-surface); border:1px solid var(--border-subtle); color:var(--text-primary); font-size:0.85rem; padding:6px 14px; border-radius:20px; font-weight:700;">
              ${bot}
            </span>
          `;
        });
      }
      chipList.innerHTML = html;
      if ($('kahoot-player-count')) $('kahoot-player-count').textContent = this.kahootState.players.length;
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
      if (isCorrect) {
        const points = Math.round(1000 * (st.remainingSec / st.duration));
        st.scores[prof.username] = (st.scores[prof.username] || 0) + Math.max(200, points);
      }

      // Diğer simüle oyunculara rastgele puan ekle
      st.players.forEach(p => {
        if (p.name !== prof.username) {
          if (Math.random() > 0.35) {
            const botPts = Math.floor(400 + Math.random() * 500);
            st.scores[p.name] = (st.scores[p.name] || 0) + botPts;
          }
        }
      });

      this.endKahootQuestion(isCorrect);
    }

    endKahootQuestion(isCorrect) {
      this.showKahootPhase('intermediate');
      const feedback = $('kahoot-answer-feedback');
      if (feedback) {
        feedback.textContent = isCorrect ? 'Harika! Doğru Cevap' : 'Yanlış Seçenek!';
        feedback.style.color = isCorrect ? '#10B981' : '#EF4444';
      }

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

    finishKahootGame() {
      if (this.kahootState.timerId) clearInterval(this.kahootState.timerId);
      this.showKahootPhase('podium');

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
    // ORTAK DESTE DÜZENLEME (İŞBİRLİKÇİ ÇALIŞMA)
    // =========================================================================
    async initCollabSession(deckId) {
      const decks = await this.getLocalDecksSafe();
      const deck = decks.find(d => Number(d.id) === Number(deckId) || String(d.id) === String(deckId));
      if (!deck) throw new Error('Deste bulunamadı.');

      const cards = await this.getLocalCardsSafe(deck.id);
      const code = 'COL-' + Math.floor(1000 + Math.random() * 9000);
      const prof = this.getActiveProfile();
      const deckTitle = deck.name || deck.title || 'Ortak Deste';

      const collabData = {
        code,
        title: deckTitle,
        cards: cards.map(c => ({
          front: c.germanWord || c.front || '',
          back: c.meaningsTr || c.back || '',
          pos: c.partOfSpeech || c.pos || 'NOUN',
          example: c.example || ''
        })),
        contributors: [prof.username]
      };

      try {
        await this.apiCall('decks/collaborate/sync', { code, action: 'init', title: deckTitle, cards: collabData.cards, author: prof.username });
      } catch (_) {}

      this.openCollabWorkspace(collabData);
    }

    async joinCollabSession(code) {
      const cleanCode = (code || '').trim().toUpperCase();
      if (!cleanCode) throw new Error('Lütfen işbirliği kodunu girin.');

      const prof = this.getActiveProfile();
      let collabData = null;

      try {
        const res = await this.apiCall('decks/collaborate/sync', { code: cleanCode, action: 'get', author: prof.username });
        if (res.ok && res.collab) collabData = res.collab;
      } catch (_) {}

      if (!collabData) {
        collabData = {
          code: cleanCode,
          title: 'Ortak Deste',
          cards: [],
          contributors: [prof.username]
        };
      }

      this.openCollabWorkspace(collabData);
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
    }

    renderCollabCardsList() {
      const list = $('collab-cards-list');
      if (!list || !this.activeCollabSession) return;

      const cards = this.activeCollabSession.cards || [];
      if (cards.length === 0) {
        list.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); padding:8px; text-align:center;">Henüz kart eklenmemiş. Yukarıdaki butondan ekleyin.</div>';
        return;
      }

      let html = '';
      cards.forEach((c, idx) => {
        html += `
          <div style="background:var(--bg-card); padding:8px 12px; border-radius:8px; border:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-weight:800; font-size:0.88rem; color:var(--text-primary);">${c.front}</span>
              <span style="font-size:0.75rem; color:var(--text-muted); margin-left:4px;">(${c.pos || 'Nomen'})</span>
            </div>
            <div style="font-size:0.84rem; color:var(--text-secondary);">${c.back}</div>
          </div>
        `;
      });
      list.innerHTML = html;
    }

    async addCardToActiveCollab(front, back, pos, example) {
      if (!this.activeCollabSession) return;
      const card = { front, back, pos, example };
      this.activeCollabSession.cards.push(card);

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
    // ARKADAŞLIK & LİDERLİK TABLOSU
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
      if (!this.isCloudConnected()) return;
      await this.apiCall('profile/update', { userId: this.user.id, deckPrivacy: newPrivacy });
      this.profile.deck_privacy = newPrivacy;
      localStorage.setItem(this.profileKey, JSON.stringify(this.profile));
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
              <div class="lb-meta-row">
                <span class="lb-streak">${friend.streak_days || 0} Gün Seri</span>
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
      await this.renderFriendsLeaderboard();
      await this.renderPendingRequests();
      await this.renderPublicDecks();
      await this.renderClubs();
      await this.populateDeckSelects();
    }

    async populateDeckSelects() {
      const decks = await this.getLocalDecksSafe();
      const opts = decks.map(d => `<option value="${d.id}">${d.name || d.title || 'Deste'}</option>`).join('');

      ['arena-1v1-deck-select', 'arena-kahoot-deck-select', 'select-collab-deck', 'select-publish-target-deck'].forEach(id => {
        const el = $(id);
        if (el) el.innerHTML = opts;
      });
    }

    // =========================================================================
    // OLAY YAKALAYICILARI (EVENT LISTENERS)
    // =========================================================================
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
            this.renderFriendsLeaderboard();
            this.renderPendingRequests();
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
        if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Deste gizliliği güncellendi.');
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
        await this.refreshSocialView();
      });

      // 9. Herkese Açık Deste Paylaşım Modalı
      $('btn-publish-my-deck-modal')?.addEventListener('click', () => this.openPublishDeckModal());
      $('btn-close-publish-deck')?.addEventListener('click', () => $('modal-publish-deck')?.classList.add('hidden'));

      $('btn-submit-publish-deck')?.addEventListener('click', async () => {
        const select = $('select-publish-target-deck');
        const vis = $('select-publish-visibility')?.value;
        const desc = $('input-publish-desc')?.value;
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
        const cat = $('select-club-category')?.value;
        const desc = $('input-club-desc')?.value.trim();
        if (!name) {
          alert('Lütfen bir kulüp adı girin.');
          return;
        }
        try {
          const club = await this.createClub(name, cat, desc);
          $('modal-create-club')?.classList.add('hidden');
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(`Kulüp kuruldu! Kod: ${club.code}`);
          await this.renderClubs();
        } catch (err) {
          alert(err.message);
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
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(`"${club.name}" kulübüne katıldınız!`);
          await this.renderClubs();
        } catch (err) {
          alert(err.message);
        }
      });

      $('btn-close-club-detail')?.addEventListener('click', () => $('modal-club-detail')?.classList.add('hidden'));

      // Kulübe Kendi Desteni Ekleme
      $('btn-add-deck-to-club')?.addEventListener('click', async () => {
        if (!this.viewingClub) return;
        const decks = await this.getLocalDecksSafe();
        if (decks.length === 0) {
          alert('Henüz desteniz yok.');
          return;
        }
        const title = prompt('Kulübe eklenecek destenin adı:\n' + decks.map(d => d.name || d.title).join('\n'));
        if (!title) return;
        const selected = decks.find(d => (d.name || d.title).toLowerCase() === title.trim().toLowerCase());
        if (!selected) {
          alert('Deste bulunamadı.');
          return;
        }
        const cards = await this.getLocalCardsSafe(selected.id);
        const words = cards.map(c => ({
          lemma: c.germanWord || c.front || '',
          contextMeaning: c.meaningsTr || c.back || '',
          pos: c.partOfSpeech || c.pos || 'NOUN'
        }));
        try {
          const deckTitle = selected.name || selected.title;
          await this.apiCall('clubs/decks/add', {
            clubId: this.viewingClub.id,
            deck: { id: selected.id, title: deckTitle, words },
            username: this.getActiveProfile().username
          });
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(`"${deckTitle}" kulüp havuzuna eklendi.`);
          await this.renderClubs();
          $('modal-club-detail')?.classList.add('hidden');
        } catch (err) {
          alert(err.message);
        }
      });

      // Kulüp Deste Kahoot Başlat
      $('btn-start-club-match')?.addEventListener('click', () => {
        if (!this.viewingClub) return;
        $('modal-club-detail')?.classList.add('hidden');
        $('arena-card-kahoot')?.click();
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

      // 1v1 Maç Eylemleri
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

      $('btn-close-1v1-game')?.addEventListener('click', () => {
        if (confirm('Maçtan ayrılmak istediğinize emin misiniz?')) {
          if (this.match1v1State.timerId) clearInterval(this.match1v1State.timerId);
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
        this.startKahootQuestion();
      });

      $('btn-close-kahoot-game')?.addEventListener('click', () => {
        if (confirm('Kahoot oyunundan ayrılmak istediğinize emin misiniz?')) {
          if (this.kahootState.timerId) clearInterval(this.kahootState.timerId);
          $('modal-arena-kahoot-game')?.classList.add('hidden');
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

      $('btn-kahoot-next-question')?.addEventListener('click', () => {
        this.kahootState.currentIndex += 1;
        this.startKahootQuestion();
      });

      $('btn-finish-kahoot-game')?.addEventListener('click', () => {
        $('modal-arena-kahoot-game')?.classList.add('hidden');
        this.refreshProfileView();
      });

      // 13. Ortak Deste Çalışması Eylemleri
      $('btn-init-collab-session')?.addEventListener('click', async () => {
        const deckId = $('select-collab-deck')?.value;
        if (!deckId) return;
        try {
          await this.initCollabSession(deckId);
        } catch (err) {
          alert(err.message);
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
      $('btn-profile-auth-trigger')?.addEventListener('click', () => {
        if (this.user) {
          if (confirm('Oturumu kapatmak istediğinize emin misiniz?')) {
            this.signOut();
          }
        } else {
          $('modal-auth')?.classList.remove('hidden');
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
