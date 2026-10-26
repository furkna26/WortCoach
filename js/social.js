/**
/**
 * WortCoach - Supabase Sosyal, ELO/Lig, İstatistik ve Arkadaşlık Motoru
 * - Dinamik ELO & 8 Kademeli Lig Sistemi (Tahta -> Grossmeister)
 * - Zaman Filtreli 4 Ana İstatistik (Artikel, Kontext, Tempo, Ausdauer)
 * - Arkadaş Ekleme, Arama, Kabul ve Liderlik Sıralaması
 * - Deste Gizliliği (private, friends, public) ve Desteleri İçe Aktarma
 * - Sıfır emoji, analitik, pedagojik ve güvenli tasarım.
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

  // 2. SUPABASE BAĞLANTISI
  class WortCoachSocial {
    constructor() {
      this.client = null;
      this.user = null;
      this.profile = null;
      this.currentFilterRange = '7d'; // '1d', '7d', '30d', '365d', 'all'
      this.viewingFriendProfile = null;
      this.friendFilterRange = '7d';
      this.localProfileKey = 'wortcoach_local_profile';
      this.localStatsKey = 'wortcoach_local_daily_stats';
    }

    async init() {
      this.initLocalProfileFallback();

      const config = window.WORTCOACH_CONFIG || {};
      const storedUrl = localStorage.getItem('wortcoach_sb_url') || config.SUPABASE_URL;
      const storedKey = localStorage.getItem('wortcoach_sb_key') || config.SUPABASE_ANON_KEY;

      if (window.supabase && storedUrl && storedKey) {
        try {
          this.client = window.supabase.createClient(storedUrl, storedKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true
            }
          });

          const { data: { session } } = await this.client.auth.getSession();
          if (session && session.user) {
            this.user = session.user;
            await this.loadProfile();
          }

          this.client.auth.onAuthStateChange(async (_event, session) => {
            this.user = session ? session.user : null;
            if (this.user) {
              await this.loadProfile();
            } else {
              this.profile = null;
            }
            this.updateHeaderBadge();
          });
        } catch (e) {
          console.warn('Supabase başlatılamadı, yerel modda devam ediliyor:', e.message);
        }
      }

      this.updateHeaderBadge();
      this.attachEventListeners();
    }

    // Yerel Profil & İstatistik Desteği (Kullanıcı henüz Supabase bağlamadıysa bile tüm hesaplamalar çalışır)
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
      return !!(this.client && this.user && this.profile);
    }

    async loadProfile() {
      if (!this.client || !this.user) return;
      try {
        const { data, error } = await this.client
          .from('profiles')
          .select('*')
          .eq('id', this.user.id)
          .single();

        if (!error && data) {
          this.profile = data;
          this.updateHeaderBadge();
        }
      } catch (e) {
        console.error('Profil yükleme hatası:', e);
      }
    }

    updateHeaderBadge() {
      const btn = $('btn-open-profile');
      if (!btn) return;
      const prof = this.getActiveProfile();
      const tier = getTierForElo(prof.elo);

      btn.innerHTML = `
        <span class="user-tier-dot" style="background:${tier.color}"></span>
        <span class="user-elo-text">${tier.name} · ${prof.elo}</span>
      `;
    }

    // =========================================================================
    // MODÜL 3: DİNAMİK ELO, LİG VE STREAK SİSTEMİ
    // =========================================================================
    /**
     * Dinamik ELO Değişimi Hesaplar
     * @param {Object} params
     * @param {boolean} params.isCorrect - Doğru mu?
     * @param {number} params.responseTimeMs - Yanıt süresi (ms)
     * @param {number} params.comboCount - Ardışık doğru sayısı
     * @param {boolean} [params.isHardWord] - Zorlu kelime mi?
     * @returns {number} ELO Delta (+/-)
     */
    calculateEloChange({ isCorrect, responseTimeMs = 0, comboCount = 0, isHardWord = false }) {
      if (!isCorrect) {
        return -10;
      }

      let gain = 12; // Baz puan

      // Hız Bonusu: 3 saniyenin altında doğru cevap -> +5 ELO
      if (responseTimeMs > 0 && responseTimeMs < 3000) {
        gain += 5;
      }

      // Seri (Combo) Çarpanı: 5 ve üzeri doğru cevapta kazanılan ELO 1.25 ile çarpılır
      if (comboCount >= 5) {
        gain = Math.round(gain * 1.25);
      }

      // Zorlu Kelime Bonusu: Daha önce sık hata yapılan kelime doğru bilinirse -> +8 ELO
      if (isHardWord) {
        gain += 8;
      }

      return gain;
    }

    /**
     * Aktivite İstatistiğini ve ELO'yu Kaydeder
     * @param {'artikel'|'cloze'|'review'} type
     * @param {boolean} isCorrect
     * @param {number} responseTimeMs
     * @param {number} comboCount
     * @param {boolean} isHardWord
     */
    async recordActivity({ type, isCorrect, responseTimeMs = 0, comboCount = 0, isHardWord = false }) {
      const eloDelta = this.calculateEloChange({ isCorrect, responseTimeMs, comboCount, isHardWord });
      const todayStr = new Date().toISOString().split('T')[0];

      if (this.isCloudConnected()) {
        try {
          const { data, error } = await this.client.rpc('record_activity_stat', {
            p_user_id: this.user.id,
            p_stat_date: todayStr,
            p_type: type,
            p_is_correct: isCorrect,
            p_response_time_ms: Math.round(responseTimeMs),
            p_elo_delta: eloDelta
          });

          if (!error && data) {
            const oldTier = data.old_tier;
            const newTier = data.new_tier;
            this.profile.elo = data.new_elo;
            this.profile.rank_tier = newTier;
            this.profile.streak_days = data.streak_days;
            this.profile.last_active_date = todayStr;

            this.updateHeaderBadge();

            if (data.tier_promoted) {
              this.showRankPromotionModal(oldTier, newTier);
            }
            return data;
          }
        } catch (e) {
          console.warn('Cloud istatistik RPC hatası, yerel işleniyor:', e);
        }
      }

      // Yerel Kayıt (Fallback)
      const lp = this.localProfile;
      const oldElo = lp.elo;
      const oldTier = getTierForElo(oldElo).name;

      lp.elo = Math.max(0, lp.elo + eloDelta);
      const newTierObj = getTierForElo(lp.elo);
      lp.rank_tier = newTierObj.name;

      // Streak
      if (!lp.last_active_date) {
        lp.streak_days = 1;
      } else if (lp.last_active_date === todayStr) {
        // Değişmez
      } else {
        const last = new Date(lp.last_active_date);
        const diffDays = Math.round((new Date(todayStr) - last) / (1000 * 3600 * 24));
        if (diffDays === 1) lp.streak_days += 1;
        else lp.streak_days = 1;
      }
      lp.last_active_date = todayStr;
      localStorage.setItem(this.localProfileKey, JSON.stringify(lp));

      // Yerel daily stats
      this.saveLocalDailyStat(todayStr, type, isCorrect, responseTimeMs);

      this.updateHeaderBadge();

      if (lp.elo > oldElo && newTierObj.name !== oldTier) {
        this.showRankPromotionModal(oldTier, newTierObj.name);
      }

      return {
        new_elo: lp.elo,
        elo_delta: eloDelta,
        tier_promoted: newTierObj.name !== oldTier
      };
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

      const row = stats[dateStr];
      if (type === 'artikel') {
        row.artikel_total++;
        if (isCorrect) row.artikel_correct++;
      } else if (type === 'cloze') {
        row.cloze_total++;
        if (isCorrect) row.cloze_correct++;
      } else if (type === 'review') {
        row.review_total++;
        if (isCorrect) row.review_correct++;
      }

      row.total_questions_answered++;
      row.total_response_time_ms += Math.max(0, Math.round(responseTimeMs));
      localStorage.setItem(this.localStatsKey, JSON.stringify(stats));
    }

    showRankPromotionModal(oldTier, newTier) {
      const modal = $('modal-rank-promotion');
      if (!modal) return;
      $('rank-promo-old').textContent = oldTier;
      $('rank-promo-new').textContent = newTier;
      modal.classList.remove('hidden');
    }

    // =========================================================================
    // MODÜL 2: ZAMANA GÖRE FİLTRELENEBİLİR 4 ANA İSTATİSTİK
    // =========================================================================
    /**
     * Belirtilen aralığa göre 4 ana istatistiği hesaplar
     * @param {string} userId - 'local' veya supabase user uuid
     * @param {'1d'|'7d'|'30d'|'365d'|'all'} range
     */
    async getAggregatedStats(userId, range = '7d') {
      let cutoffDate = null;
      const now = new Date();

      if (range === '1d') {
        cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];
      } else if (range === '7d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        cutoffDate = d.toISOString().split('T')[0];
      } else if (range === '30d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        cutoffDate = d.toISOString().split('T')[0];
      } else if (range === '365d') {
        const d = new Date(now);
        d.setDate(d.getDate() - 365);
        cutoffDate = d.toISOString().split('T')[0];
      }

      let rows = [];

      if (this.isCloudConnected() && userId !== 'local_user') {
        try {
          let q = this.client.from('daily_stats').select('*').eq('user_id', userId);
          if (cutoffDate) {
            q = q.gte('stat_date', cutoffDate);
          }
          const { data, error } = await q;
          if (!error && Array.isArray(data)) rows = data;
        } catch (e) {
          console.warn('İstatistik çekilemedi:', e);
        }
      } else {
        // Yerel istatistikleri topla
        try {
          const stats = JSON.parse(localStorage.getItem(this.localStatsKey)) || {};
          for (const [dateStr, row] of Object.entries(stats)) {
            if (!cutoffDate || dateStr >= cutoffDate) {
              rows.push(row);
            }
          }
        } catch (_) {}
      }

      let artikelCorrect = 0, artikelTotal = 0;
      let clozeCorrect = 0, clozeTotal = 0;
      let reviewCorrect = 0, reviewTotal = 0;
      let totalTimeMs = 0, totalAnswers = 0;

      rows.forEach((r) => {
        artikelCorrect += Number(r.artikel_correct) || 0;
        artikelTotal += Number(r.artikel_total) || 0;
        clozeCorrect += Number(r.cloze_correct) || 0;
        clozeTotal += Number(r.cloze_total) || 0;
        reviewCorrect += Number(r.review_correct) || 0;
        reviewTotal += Number(r.review_total) || 0;
        totalTimeMs += Number(r.total_response_time_ms) || 0;
        totalAnswers += Number(r.total_questions_answered) || 0;
      });

      const artikelAccuracy = artikelTotal > 0 ? Math.round((artikelCorrect / artikelTotal) * 100) : 0;
      const clozeAccuracy = clozeTotal > 0 ? Math.round((clozeCorrect / clozeTotal) * 100) : 0;
      const avgTempoSec = totalAnswers > 0 ? ((totalTimeMs / totalAnswers) / 1000).toFixed(2) : '0.00';
      const reviewAccuracy = reviewTotal > 0 ? Math.round((reviewCorrect / reviewTotal) * 100) : 0;

      return {
        artikelAccuracy,
        artikelTotal,
        clozeAccuracy,
        clozeTotal,
        avgTempoSec,
        totalAnswers,
        reviewAccuracy,
        reviewTotal
      };
    }

    // =========================================================================
    // MODÜL 4 & 5: ARKADAŞLAR, LİDERLİK TABLOSU VE PROFİL
    // =========================================================================
    async searchUser(query) {
      if (!this.isCloudConnected()) throw new Error('Arkadaş aramak için lütfen Supabase hesabınıza giriş yapın.');
      const clean = (query || '').trim();
      if (!clean) return [];

      let q = this.client.from('profiles').select('id, username, friend_code, elo, rank_tier, streak_days');
      if (clean.startsWith('WC#')) {
        q = q.eq('friend_code', clean);
      } else {
        q = q.ilike('username', `%${clean}%`);
      }
      const { data, error } = await q.limit(10);
      if (error) throw error;
      return (data || []).filter((u) => u.id !== this.user.id);
    }

    async sendFriendRequest(targetUserId) {
      if (!this.isCloudConnected()) throw new Error('Lütfen önce oturum açın.');
      const { data, error } = await this.client.from('friendships').insert({
        requester_id: this.user.id,
        addressee_id: targetUserId,
        status: 'pending'
      });
      if (error) throw error;
      return data;
    }

    async acceptFriendRequest(friendshipId) {
      if (!this.isCloudConnected()) throw new Error('Lütfen önce oturum açın.');
      const { error } = await this.client
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);
      if (error) throw error;
    }

    async rejectFriendRequest(friendshipId) {
      if (!this.isCloudConnected()) throw new Error('Lütfen önce oturum açın.');
      const { error } = await this.client.from('friendships').delete().eq('id', friendshipId);
      if (error) throw error;
    }

    async getFriendsLeaderboard() {
      if (!this.isCloudConnected()) {
        const p = this.getActiveProfile();
        return [{ ...p, isMe: true, rank: 1 }];
      }

      // Kabul edilmiş arkadaşlıkları çek
      const { data: friendships, error: fErr } = await this.client
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${this.user.id},addressee_id.eq.${this.user.id}`);

      if (fErr) throw fErr;

      const friendIds = new Set([this.user.id]);
      (friendships || []).forEach((f) => {
        friendIds.add(f.requester_id === this.user.id ? f.addressee_id : f.requester_id);
      });

      const { data: profiles, error: pErr } = await this.client
        .from('profiles')
        .select('id, username, friend_code, elo, rank_tier, streak_days')
        .in('id', Array.from(friendIds))
        .order('elo', { ascending: false });

      if (pErr) throw pErr;

      return (profiles || []).map((p, idx) => ({
        ...p,
        rank: idx + 1,
        isMe: p.id === this.user.id
      }));
    }

    async getPendingFriendships() {
      if (!this.isCloudConnected()) return { incoming: [], outgoing: [] };

      const { data, error } = await this.client
        .from('friendships')
        .select('id, requester_id, addressee_id, status, created_at, profiles!requester_id(username, friend_code, elo)')
        .eq('status', 'pending');

      if (error) throw error;

      const incoming = (data || []).filter((f) => f.addressee_id === this.user.id);
      const outgoing = (data || []).filter((f) => f.requester_id === this.user.id);

      return { incoming, outgoing };
    }

    async updateDeckPrivacy(newPrivacy) {
      if (!['private', 'friends', 'public'].includes(newPrivacy)) return;
      if (this.isCloudConnected()) {
        const { error } = await this.client
          .from('profiles')
          .update({ deck_privacy: newPrivacy, updated_at: new Date().toISOString() })
          .eq('id', this.user.id);
        if (error) throw error;
        this.profile.deck_privacy = newPrivacy;
      } else {
        this.localProfile.deck_privacy = newPrivacy;
        localStorage.setItem(this.localProfileKey, JSON.stringify(this.localProfile));
      }
    }

    async getUserDecks(ownerId) {
      if (!this.isCloudConnected()) return [];
      const { data, error } = await this.client
        .from('decks')
        .select('id, title, words_json, created_at')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Deste gizliliği veya erişim kısıtı:', error.message);
        return [];
      }
      return data || [];
    }

    async publishDeckToCloud(deckId) {
      if (!this.isCloudConnected()) throw new Error('Deste paylaşmak için Supabase hesabına giriş yapın.');
      const localDeck = await window.wmDB.getDeckById(deckId);
      if (!localDeck) throw new Error('Yerel deste bulunamadı.');

      const cards = await window.wmDB.getCardsByDeck(deckId);
      const words = cards.map((c) => ({
        word: c.word,
        article: c.article || '',
        meaning: c.meaning,
        partOfSpeech: c.partOfSpeech || 'NOUN',
        exampleSentence: c.exampleSentence || ''
      }));

      const { data, error } = await this.client.from('decks').insert({
        owner_id: this.user.id,
        title: localDeck.name || 'Paylaşılan Deste',
        words_json: words
      }).select().single();

      if (error) throw error;
      return data;
    }

    async importDeckToLocal(cloudDeck) {
      if (!cloudDeck || !cloudDeck.title) throw new Error('Geçersiz deste.');
      const deckId = 'cloud_' + Date.now();
      await window.wmDB.addDeck({
        id: deckId,
        name: cloudDeck.title,
        color: '#2563EB',
        icon: 'book',
        isDefault: false
      });

      const words = Array.isArray(cloudDeck.words_json) ? cloudDeck.words_json : [];
      let importedCount = 0;

      for (const w of words) {
        if (!w.word) continue;
        await window.wmDB.addCard({
          deckId: deckId,
          word: w.word,
          article: w.article || '',
          meaning: w.meaning || '',
          partOfSpeech: w.partOfSpeech || 'NOUN',
          exampleSentence: w.exampleSentence || '',
          srsStage: 0
        });
        importedCount++;
      }

      if (window.wmApp && window.wmApp.refreshDecksView) {
        window.wmApp.refreshDecksView();
      }
      return importedCount;
    }

    // =========================================================================
    // UI RENDER VE OLAY DİNLEYİCİLERİ
    // =========================================================================
    attachEventListeners() {
      // Profil Açma / Kapatma
      $('btn-open-profile')?.addEventListener('click', () => this.openProfileModal());
      $('btn-close-profile-modal')?.addEventListener('click', () => this.closeProfileModal());
      $('btn-close-rank-promo')?.addEventListener('click', () => $('modal-rank-promotion').classList.add('hidden'));

      // Tablar (İstatistik / Liderlik / Ayarlar)
      document.querySelectorAll('.profile-subtab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.profile-subtab-btn').forEach((b) => b.classList.remove('active'));
          document.querySelectorAll('.profile-pane').forEach((p) => p.classList.add('hidden'));
          btn.classList.add('active');
          const targetPane = $(btn.getAttribute('data-target-pane'));
          if (targetPane) targetPane.classList.remove('hidden');
        });
      });

      // Zaman Filtre Butonları (1G, 1H, 1A, 1Y, Tümü)
      document.querySelectorAll('.prof-stat-filter-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          document.querySelectorAll('.prof-stat-filter-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentFilterRange = btn.getAttribute('data-range');
          await this.renderStatsCards(this.getActiveProfile().id, this.currentFilterRange);
        });
      });

      // Arkadaş Arama & İstek Gönderme
      $('btn-search-user')?.addEventListener('click', () => this.handleUserSearch());
      $('user-search-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleUserSearch();
      });

      // Deste Gizliliği Değişimi
      $('profile-deck-privacy-select')?.addEventListener('change', async (e) => {
        const val = e.target.value;
        await this.updateDeckPrivacy(val);
        if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Deste gizliliği güncellendi.');
      });

      // Arkadaş Kodu Kopyalama
      $('btn-copy-friend-code')?.addEventListener('click', () => {
        const code = $('prof-friend-code-display')?.textContent || '';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(code).then(() => {
            if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Arkadaş kodu panoya kopyalandı.');
          });
        }
      });

      // Supabase Bağlantı Butonu
      $('btn-save-sb-keys')?.addEventListener('click', () => this.handleSaveSupabaseKeys());
      $('btn-sb-auth-action')?.addEventListener('click', () => this.handleAuthAction());
    }

    async openProfileModal() {
      const modal = $('modal-profile-sheet');
      if (!modal) return;
      modal.classList.remove('hidden');
      await this.refreshProfileView();
    }

    closeProfileModal() {
      $('modal-profile-sheet')?.classList.add('hidden');
      $('friend-detail-submodal')?.classList.add('hidden');
    }

    async refreshProfileView() {
      const prof = this.getActiveProfile();
      const tier = getTierForElo(prof.elo);

      // Üst Profil Kartı
      $('prof-username-display').textContent = prof.username;
      $('prof-friend-code-display').textContent = prof.friend_code;
      $('prof-elo-display').textContent = prof.elo;
      $('prof-tier-badge').textContent = tier.name;
      $('prof-tier-badge').style.borderColor = tier.color;
      $('prof-tier-badge').style.color = tier.color;
      $('prof-streak-display').textContent = `${prof.streak_days || 0} Gün`;

      // İlerleme Barı
      const nextTier = RANK_TIERS.find((t) => t.min > prof.elo);
      if (nextTier) {
        const span = nextTier.min - tier.min;
        const prog = Math.min(100, Math.max(0, Math.round(((prof.elo - tier.min) / span) * 100)));
        $('prof-tier-progress-fill').style.width = `${prog}%`;
        $('prof-tier-progress-text').textContent = `${nextTier.name} ligine ${nextTier.min - prof.elo} ELO kaldı`;
      } else {
        $('prof-tier-progress-fill').style.width = '100%';
        $('prof-tier-progress-text').textContent = 'En Üst Lig (Grossmeister)';
      }

      // Gizlilik Seçimi
      if ($('profile-deck-privacy-select')) {
        $('profile-deck-privacy-select').value = prof.deck_privacy || 'friends';
      }

      // 4 Ana İstatistik
      await this.renderStatsCards(prof.id, this.currentFilterRange);

      // Liderlik Tablosu & Arkadaşlar
      await this.renderFriendsLeaderboard();
      await this.renderPendingRequests();
    }

    async renderStatsCards(userId, range) {
      const stats = await this.getAggregatedStats(userId, range);

      // 1. Artikel Keskinliği (Genus)
      $('stat-val-genus').textContent = `%${stats.artikelAccuracy}`;
      $('stat-sub-genus').textContent = `${stats.artikelTotal} soru cevaplandı`;

      // 2. Bağlam Ustası (Kontext)
      $('stat-val-kontext').textContent = `%${stats.clozeAccuracy}`;
      $('stat-sub-kontext').textContent = `${stats.clozeTotal} boşluk tamamlandı`;

      // 3. Çeviklik (Tempo)
      $('stat-val-tempo').textContent = `${stats.avgTempoSec} sn`;
      $('stat-sub-tempo').textContent = `${stats.totalAnswers} yanıtın ortalaması`;

      // 4. Hafıza Direnci (Ausdauer)
      $('stat-val-ausdauer').textContent = `%${stats.reviewAccuracy}`;
      $('stat-sub-ausdauer').textContent = `${stats.reviewTotal} tekrar kartı`;
    }

    async renderFriendsLeaderboard() {
      const listEl = $('friends-leaderboard-list');
      if (!listEl) return;
      listEl.innerHTML = '<div class="prof-loading">Sıralama yükleniyor...</div>';

      try {
        const board = await this.getFriendsLeaderboard();
        if (board.length === 0) {
          listEl.innerHTML = '<div class="prof-empty">Henüz ekli arkadaş bulunmuyor.</div>';
          return;
        }

        listEl.innerHTML = board.map((item) => {
          const tier = getTierForElo(item.elo);
          return `
            <div class="leaderboard-item ${item.isMe ? 'is-me' : ''}" data-user-id="${item.id}">
              <div class="lb-rank">#${item.rank}</div>
              <div class="lb-main">
                <div class="lb-username">${item.username} ${item.isMe ? '<span class="lb-you-tag">(Sen)</span>' : ''}</div>
                <div class="lb-sub">
                  <span class="lb-tier-pill" style="border-color:${tier.color}; color:${tier.color};">${tier.name}</span>
                  <span class="lb-streak-pill">${item.streak_days || 0} Gün Seri</span>
                </div>
              </div>
              <div class="lb-elo">${item.elo} <span class="lb-elo-label">ELO</span></div>
            </div>
          `;
        }).join('');

        // Arkadaş profili tıklama
        listEl.querySelectorAll('.leaderboard-item').forEach((row) => {
          row.addEventListener('click', () => {
            const uId = row.getAttribute('data-user-id');
            const target = board.find((b) => b.id === uId);
            if (target) this.openFriendDetailModal(target);
          });
        });
      } catch (e) {
        listEl.innerHTML = `<div class="prof-error">Liderlik listesi alınamadı: ${e.message}</div>`;
      }
    }

    async renderPendingRequests() {
      const incBox = $('pending-requests-box');
      if (!incBox) return;
      if (!this.isCloudConnected()) {
        incBox.classList.add('hidden');
        return;
      }

      try {
        const { incoming } = await this.getPendingFriendships();
        if (incoming.length === 0) {
          incBox.classList.add('hidden');
          return;
        }
        incBox.classList.remove('hidden');
        incBox.innerHTML = `
          <div class="pending-head">Bekleyen Arkadaşlık İstekleri (${incoming.length})</div>
          <div class="pending-list">
            ${incoming.map((f) => `
              <div class="pending-item">
                <div>
                  <strong>${f.profiles?.username || 'Kullanıcı'}</strong>
                  <span style="font-size:0.75rem; color:var(--text-muted);">${f.profiles?.friend_code || ''}</span>
                </div>
                <div class="pending-actions">
                  <button type="button" class="btn-req-accept" data-fid="${f.id}">Kabul Et</button>
                  <button type="button" class="btn-req-reject" data-fid="${f.id}">Reddet</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        incBox.querySelectorAll('.btn-req-accept').forEach((b) => {
          b.addEventListener('click', async () => {
            await this.acceptFriendRequest(b.getAttribute('data-fid'));
            await this.refreshProfileView();
          });
        });
        incBox.querySelectorAll('.btn-req-reject').forEach((b) => {
          b.addEventListener('click', async () => {
            await this.rejectFriendRequest(b.getAttribute('data-fid'));
            await this.refreshProfileView();
          });
        });
      } catch (e) {
        console.warn('Bekleyen istekler hatası:', e);
      }
    }

    async handleUserSearch() {
      const q = $('user-search-input')?.value.trim();
      const resBox = $('user-search-results');
      if (!q || !resBox) return;
      resBox.innerHTML = '<div class="prof-loading">Aranıyor...</div>';

      try {
        const results = await this.searchUser(q);
        if (results.length === 0) {
          resBox.innerHTML = '<div class="prof-empty">Eşleşen kullanıcı bulunamadı.</div>';
          return;
        }

        resBox.innerHTML = results.map((u) => {
          const tier = getTierForElo(u.elo);
          return `
            <div class="search-result-item">
              <div>
                <div style="font-weight:700;">${u.username}</div>
                <div style="font-size:0.76rem; color:var(--text-muted);">${u.friend_code} · ${tier.name} (${u.elo} ELO)</div>
              </div>
              <button type="button" class="btn-send-friend-req" data-target-id="${u.id}">İstek Gönder</button>
            </div>
          `;
        }).join('');

        resBox.querySelectorAll('.btn-send-friend-req').forEach((b) => {
          b.addEventListener('click', async () => {
            b.disabled = true;
            b.textContent = 'Gönderildi';
            try {
              await this.sendFriendRequest(b.getAttribute('data-target-id'));
              if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Arkadaşlık isteği iletildi.');
            } catch (err) {
              b.disabled = false;
              b.textContent = 'Hata';
              alert(err.message || 'İstek gönderilemedi.');
            }
          });
        });
      } catch (e) {
        resBox.innerHTML = `<div class="prof-error">${e.message}</div>`;
      }
    }

    async openFriendDetailModal(friend) {
      const sub = $('friend-detail-submodal');
      if (!sub) return;
      this.viewingFriendProfile = friend;
      sub.classList.remove('hidden');

      const tier = getTierForElo(friend.elo);
      $('friend-detail-name').textContent = friend.username;
      $('friend-detail-code').textContent = friend.friend_code;
      $('friend-detail-tier').textContent = tier.name;
      $('friend-detail-tier').style.borderColor = tier.color;
      $('friend-detail-tier').style.color = tier.color;
      $('friend-detail-elo').textContent = friend.elo;
      $('friend-detail-streak').textContent = `${friend.streak_days || 0} Gün`;

      // Arkadaşın 4'lü İstatistikleri
      await this.renderFriendStats(friend.id, this.friendFilterRange);

      // Arkadaşın Paylaşılan Desteleri
      await this.renderFriendDecks(friend.id);

      // Kapat Butonu
      $('btn-close-friend-detail')?.addEventListener('click', () => {
        sub.classList.add('hidden');
      });

      // Arkadaş İstatistik Filtre Butonları
      document.querySelectorAll('.friend-stat-filter-btn').forEach((btn) => {
        btn.onclick = async () => {
          document.querySelectorAll('.friend-stat-filter-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.friendFilterRange = btn.getAttribute('data-range');
          await this.renderFriendStats(friend.id, this.friendFilterRange);
        };
      });
    }

    async renderFriendStats(friendId, range) {
      const stats = await this.getAggregatedStats(friendId, range);
      $('fstat-genus').textContent = `%${stats.artikelAccuracy}`;
      $('fstat-kontext').textContent = `%${stats.clozeAccuracy}`;
      $('fstat-tempo').textContent = `${stats.avgTempoSec} sn`;
      $('fstat-ausdauer').textContent = `%${stats.reviewAccuracy}`;
    }

    async renderFriendDecks(friendId) {
      const box = $('friend-decks-list');
      if (!box) return;
      box.innerHTML = '<div class="prof-loading">Desteler taranıyor...</div>';

      const decks = await this.getUserDecks(friendId);
      if (decks.length === 0) {
        box.innerHTML = '<div class="prof-empty">Görüntülenebilir açık deste bulunmuyor.</div>';
        return;
      }

      box.innerHTML = decks.map((d) => {
        const count = Array.isArray(d.words_json) ? d.words_json.length : 0;
        return `
          <div class="friend-deck-item">
            <div>
              <div style="font-weight:700;">${d.title}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${count} Kelime</div>
            </div>
            <button type="button" class="btn-import-friend-deck" data-deck-id="${d.id}">İçe Aktar</button>
          </div>
        `;
      }).join('');

      box.querySelectorAll('.btn-import-friend-deck').forEach((b) => {
        b.addEventListener('click', async () => {
          const dId = b.getAttribute('data-deck-id');
          const d = decks.find((x) => x.id === dId);
          if (!d) return;
          b.disabled = true;
          b.textContent = 'Ekleniyor...';
          try {
            const count = await this.importDeckToLocal(d);
            b.textContent = 'Aktarıldı';
            if (window.wmApp && window.wmApp.showToast) {
              window.wmApp.showToast(`"${d.title}" (${count} kelime) kütüphanenize eklendi.`);
            }
          } catch (e) {
            b.disabled = false;
            b.textContent = 'Hata';
            alert('İçe aktarma hatası: ' + e.message);
          }
        });
      });
    }

    async handleSaveSupabaseKeys() {
      const url = $('sb-config-url')?.value.trim();
      const key = $('sb-config-key')?.value.trim();
      if (!url || !key) {
        alert('Lütfen hem Supabase Project URL hem de Anon Key değerini girin.');
        return;
      }
      localStorage.setItem('wortcoach_sb_url', url);
      localStorage.setItem('wortcoach_sb_key', key);
      if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Supabase ayarları kaydedildi. Sayfa yenileniyor...');
      setTimeout(() => window.location.reload(), 800);
    }

    async handleAuthAction() {
      if (!this.client) {
        alert('Lütfen önce Supabase URL ve Anon Key girip kaydedin.');
        return;
      }
      if (this.user) {
        await this.client.auth.signOut();
        window.location.reload();
        return;
      }

      const email = prompt('E-posta adresiniz:');
      if (!email) return;
      const password = prompt('Şifreniz:');
      if (!password) return;

      const isRegister = confirm('Yeni hesap açmak istiyor musunuz? (Tamam: Kaydol, İptal: Giriş Yap)');

      try {
        if (isRegister) {
          const username = prompt('Kullanıcı adınız:', email.split('@')[0]);
          const { error } = await this.client.auth.signUp({
            email,
            password,
            options: { data: { username } }
          });
          if (error) throw error;
          alert('Hesap oluşturuldu! E-posta onayını kontrol edin veya giriş yapın.');
        } else {
          const { error } = await this.client.auth.signInWithPassword({ email, password });
          if (error) throw error;
          window.location.reload();
        }
      } catch (err) {
        alert('Kimlik doğrulama hatası: ' + (err.message || err));
      }
    }
  }

  window.wmSocial = new WortCoachSocial();
  document.addEventListener('DOMContentLoaded', () => {
    window.wmSocial.init();
  });
})();
