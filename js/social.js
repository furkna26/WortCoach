/**
 * WortCoach - Sosyal, ELO/Lig, İstatistik, Arkadaşlık ve Basit Kimlik Motoru
 * - Cloudflare Worker Proxy üzerinden Supabase ile güvenli sunucu tarafı iletişim
 * - Tarayıcıda SIFIR veritabanı anahtarı ve SIFIR doğrudan Supabase bağımlılığı
 * - Dinamik ELO & 8 Kademeli Lig Sistemi (Tahta -> Grossmeister)
 * - Zaman Filtreli 4 Ana İstatistik (Artikel, Bağlam, Çeviklik, Hafıza)
 * - Arkadaş Ekleme, Arama, Kabul ve Liderlik Sıralaması
 * - Deste Gizliliği ve Desteleri İçe Aktarma
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

  // 2. SOSYAL & İSTATİSTİK YÖNETİCİSİ
  class WortCoachSocial {
    constructor() {
      this.user = null;
      this.profile = null;
      this.currentFilterRange = '7d';
      this.viewingFriendProfile = null;
      this.friendFilterRange = '7d';
      this.localProfileKey = 'wortcoach_local_profile';
      this.localStatsKey = 'wortcoach_local_daily_stats';
      this.sessionKey = 'wortcoach_session';
      this.profileKey = 'wortcoach_profile';
    }

    async init() {
      this.initLocalProfileFallback();

      // Yerel oturumu kontrol et
      try {
        const savedSession = JSON.parse(localStorage.getItem(this.sessionKey));
        const savedProfile = JSON.parse(localStorage.getItem(this.profileKey));
        if (savedSession && savedSession.user) {
          this.user = savedSession.user;
          this.profile = savedProfile || null;
          // Arka planda profili yenile
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
      if ($('prof-elo-display')) $('prof-elo-display').textContent = prof.elo;
      if ($('prof-tier-badge')) {
        $('prof-tier-badge').textContent = tier.name;
        $('prof-tier-badge').style.borderColor = tier.color;
        $('prof-tier-badge').style.color = tier.color;
      }
      if ($('prof-streak-count')) $('prof-streak-count').textContent = prof.streak_days || 0;
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
      const privSelect = $('profile-deck-privacy-select') || $('sel-deck-privacy');
      if (privSelect) {
        privSelect.value = prof.deck_privacy || 'friends';
      }

      // Giriş / Çıkış buton durumu (hem btn-profile-auth-trigger hem btn-prof-auth-action desteklenir)
      const authBtns = [$('btn-profile-auth-trigger'), $('btn-prof-auth-action')].filter(Boolean);
      authBtns.forEach(btn => {
        if (this.isCloudConnected()) {
          btn.textContent = 'Çıkış Yap';
          btn.className = 'prof-auth-link-btn prof-auth-danger';
        } else {
          btn.textContent = 'Giriş Yap / Kaydol';
          btn.className = 'prof-auth-link-btn';
        }
      });
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
    async recordActivity({ type, isCorrect, responseTimeMs = 0, comboCount = 0, isHardWord = false }) {
      const eloDelta = this.calculateEloChange({ isCorrect, responseTimeMs, comboCount, isHardWord });

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

      // Streak kontrolü
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
      const modal = $('modal-rank-promo');
      if (!modal) return;
      if ($('promo-tier-name')) $('promo-tier-name').textContent = newTier;
      if ($('promo-tier-msg')) {
        $('promo-tier-msg').textContent = `Tebrikler! Üstün gayretinizle ${oldTier} liginden ${newTier} ligine terfi ettiniz.`;
      }
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
      } else if (range === '1y') {
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
      const agilitySec = sumQ > 0 ? ((sumTime / sumQ) / 1000).toFixed(1) : '0.0';

      return { artikelAcc, clozeAcc, agilitySec, retentionRate, totalQuestions: sumQ };
    }

    async renderStatsCards(userId, range) {
      const stats = await this.getAggregatedStats(userId, range);

      // Artikel Keskinliği (Genus)
      const valArt = $('stat-val-genus') || $('stat-val-artikel');
      if (valArt) valArt.textContent = '%' + stats.artikelAcc;
      if ($('stat-bar-artikel')) $('stat-bar-artikel').style.width = stats.artikelAcc + '%';
      if ($('stat-sub-genus')) $('stat-sub-genus').textContent = (stats.totalQuestions || 0) + ' soru incelendi';

      // Bağlam Ustası (Kontext / Cloze)
      const valCloze = $('stat-val-kontext') || $('stat-val-cloze');
      if (valCloze) valCloze.textContent = '%' + stats.clozeAcc;
      if ($('stat-bar-cloze')) $('stat-bar-cloze').style.width = stats.clozeAcc + '%';
      if ($('stat-sub-kontext')) $('stat-sub-kontext').textContent = (stats.totalQuestions || 0) + ' alıştırma çözüldü';

      // Çeviklik (Tempo)
      const valTempo = $('stat-val-tempo');
      if (valTempo) valTempo.textContent = stats.agilitySec + ' sn';
      const tempoPct = Math.max(10, Math.min(100, Math.round((1 - parseFloat(stats.agilitySec) / 5) * 100)));
      if ($('stat-bar-tempo')) $('stat-bar-tempo').style.width = (stats.totalQuestions > 0 ? tempoPct : 0) + '%';
      if ($('stat-sub-tempo')) $('stat-sub-tempo').textContent = stats.totalQuestions > 0 ? `${stats.totalQuestions} yanıtın ortalaması` : 'Henüz veri yok';

      // Hafıza Direnci (Ausdauer / Retention)
      const valRev = $('stat-val-ausdauer') || $('stat-val-review');
      if (valRev) valRev.textContent = '%' + stats.retentionRate;
      if ($('stat-bar-review')) $('stat-bar-review').style.width = stats.retentionRate + '%';
      if ($('stat-sub-ausdauer')) $('stat-sub-ausdauer').textContent = (stats.totalQuestions || 0) + ' tekrar kartı';
    }

    // Arkadaş Arama
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

    async getUserDecks(ownerId) {
      if (!this.isCloudConnected()) return [];
      try {
        const res = await this.apiCall('decks/get', { targetUserId: ownerId, currentUserId: this.user.id });
        return res.decks || [];
      } catch (e) {
        console.warn('Desteler alınamadı:', e.message);
        return [];
      }
    }

    async importDeckToLocal(cloudDeck) {
      if (!window.wmDB) throw new Error('Yerel veritabanı hazır değil.');
      const title = cloudDeck.title || 'İçe Aktarılan Deste';
      const deckId = 'imported_' + Date.now();
      await window.wmDB.decks.add({
        id: deckId,
        title: title,
        color: '#2563EB',
        icon: 'book',
        createdAt: new Date().toISOString()
      });

      const words = cloudDeck.words_json || [];
      for (const w of words) {
        await window.wmDB.cards.add({
          id: 'card_' + Math.random().toString(36).slice(2, 9),
          deckId: deckId,
          front: w.lemma || w.front || '',
          back: w.contextMeaning || w.back || '',
          pos: w.pos || 'NOUN',
          interval: 1,
          repetition: 0,
          easeFactor: 2.5,
          dueDate: new Date().toISOString()
        });
      }

      if (window.wmApp && window.wmApp.refreshDecksView) {
        await window.wmApp.refreshDecksView();
      }
      return true;
    }

    // UI Render: Liderlik Tablosu
    async renderFriendsLeaderboard() {
      const container = $('friends-leaderboard-list');
      if (!container) return;

      if (!this.isCloudConnected()) {
        container.innerHTML = `<div class="prof-empty-msg">Arkadaşlarınızı ve lig sıralamanızı görmek için oturum açın.</div>`;
        return;
      }

      container.innerHTML = '<div style="text-align:center; padding:12px; font-size:0.85rem; color:var(--text-muted);">Yükleniyor...</div>';
      const board = await this.getFriendsLeaderboard();

      if (board.length === 0) {
        container.innerHTML = `<div class="prof-empty-msg">Henüz arkadaşınız bulunmuyor. Yukarıdan arkadaş kodu veya kullanıcı adı ile arama yapabilirsiniz.</div>`;
        return;
      }

      let html = '';
      board.forEach((friend, idx) => {
        const tier = getTierForElo(friend.elo);
        html += `
          <div class="leaderboard-item" data-friend-id="${friend.id}">
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

      // Arkadaş kartına tıklandığında detay modalı aç
      container.querySelectorAll('.leaderboard-item').forEach(el => {
        el.addEventListener('click', () => {
          const fid = el.getAttribute('data-friend-id');
          const friendObj = board.find(f => f.id === fid);
          if (friendObj) this.openFriendDetailModal(friendObj);
        });
      });
    }

    // UI Render: Bekleyen İstekler
    async renderPendingRequests() {
      const box = $('pending-requests-box');
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
          <div class="pending-req-item" id="req-item-${req.id}">
            <div>
              <div style="font-weight:700; font-size:0.9rem;">${reqUser.username}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${reqUser.friend_code}</div>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn-req-accept" data-req-id="${req.id}">Kabul Et</button>
              <button type="button" class="btn-req-reject" data-req-id="${req.id}">Reddet</button>
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

    // UI: Arkadaş Arama İşlemi
    async handleUserSearch() {
      const input = $('user-search-input') || $('input-search-user');
      const resultsContainer = $('user-search-results');
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
          <div class="search-result-item">
            <div>
              <div style="font-weight:700; font-size:0.9rem;">${u.username} <span style="font-size:0.75rem; color:var(--text-muted);">${u.friend_code}</span></div>
              <div style="font-size:0.75rem; color:${tier.color}; font-weight:700;">${tier.name} · ${u.elo} ELO</div>
            </div>
            <button type="button" class="btn-send-friend-req" data-target-id="${u.id}">Ekle</button>
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

    // UI: Arkadaş Profil Detayı Modalı
    async openFriendDetailModal(friend) {
      this.viewingFriendProfile = friend;
      const modal = $('friend-detail-submodal');
      if (!modal) return;

      const tier = getTierForElo(friend.elo);
      if ($('friend-detail-name')) $('friend-detail-name').textContent = friend.username;
      if ($('friend-detail-code')) $('friend-detail-code').textContent = friend.friend_code;
      if ($('friend-detail-elo')) $('friend-detail-elo').textContent = friend.elo;
      if ($('friend-detail-tier-badge')) {
        $('friend-detail-tier-badge').textContent = tier.name;
        $('friend-detail-tier-badge').style.borderColor = tier.color;
        $('friend-detail-tier-badge').style.color = tier.color;
      }
      if ($('friend-detail-streak')) $('friend-detail-streak').textContent = friend.streak_days || 0;

      // Arkadaşın İstatistiklerini Çiz
      await this.renderFriendStats(friend.id, this.friendFilterRange);

      // Arkadaşın Destelerini Çiz
      await this.renderFriendDecks(friend.id);

      modal.classList.remove('hidden');
    }

    async renderFriendStats(friendId, range) {
      const stats = await this.getAggregatedStats(friendId, range);
      if ($('friend-stat-artikel')) $('friend-stat-artikel').textContent = '%' + stats.artikelAcc;
      if ($('friend-stat-cloze')) $('friend-stat-cloze').textContent = '%' + stats.clozeAcc;
      if ($('friend-stat-tempo')) $('friend-stat-tempo').textContent = stats.agilitySec + 's';
      if ($('friend-stat-review')) $('friend-stat-review').textContent = '%' + stats.retentionRate;
    }

    async renderFriendDecks(friendId) {
      const container = $('friend-decks-container');
      if (!container) return;
      container.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted); padding:10px;">Desteler yükleniyor...</div>';

      const decks = await this.getUserDecks(friendId);
      if (decks.length === 0) {
        container.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted); padding:10px;">Paylaşılan deste bulunmuyor veya gizli.</div>';
        return;
      }

      let html = '';
      decks.forEach(d => {
        const words = d.words_json || [];
        html += `
          <div class="friend-deck-card">
            <div>
              <div style="font-weight:700; font-size:0.92rem; color:var(--text-primary);">${d.title}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${words.length} Kelime</div>
            </div>
            <button type="button" class="btn-import-friend-deck" data-deck-id="${d.id}">İçe Aktar</button>
          </div>
        `;
      });
      container.innerHTML = html;

      container.querySelectorAll('.btn-import-friend-deck').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const did = e.currentTarget.getAttribute('data-deck-id');
          const dObj = decks.find(d => d.id === did);
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
    // BASİT AUTH (SADECE KULLANICI ADI & ŞİFRE - SUNUCU PROXY ÜZERİNDEN)
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
        await this.refreshProfileView();
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
        await this.refreshProfileView();
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
      await this.renderFriendsLeaderboard();
      await this.renderPendingRequests();
    }

    attachEventListeners() {
      // 1. Profil Sekmesi Alt Panelleri ([İstatistiklerim] | [Sosyal & Arkadaşlar])
      document.querySelectorAll('.profile-subtab-btn[data-target-pane]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.profile-subtab-btn[data-target-pane]').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          const targetId = e.currentTarget.getAttribute('data-target-pane');
          
          document.querySelectorAll('#tab-profile .profile-pane').forEach(p => p.classList.add('hidden'));
          const targetEl = $(targetId);
          if (targetEl) targetEl.classList.remove('hidden');

          if (targetId === 'pane-prof-friends') {
            this.renderFriendsLeaderboard();
            this.renderPendingRequests();
          }
        });
      });

      // 2. Zaman Filtresi Butonları (1G | 1H | 1A | 1Y | Tümü)
      document.querySelectorAll('.prof-stat-filter-btn, .time-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.prof-stat-filter-btn, .time-filter-btn').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          const range = e.currentTarget.getAttribute('data-range') || '7d';
          this.currentFilterRange = range;
          const prof = this.getActiveProfile();
          this.renderStatsCards(prof.id, range);
        });
      });

      // 3. Kullanıcı Arama (Hem user-search-input hem input-search-user)
      $('btn-search-user')?.addEventListener('click', () => this.handleUserSearch());
      $('user-search-input')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') this.handleUserSearch();
      });
      $('input-search-user')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') this.handleUserSearch();
      });

      // 4. Deste Gizliliği Seçimi (Hem profile-deck-privacy-select hem sel-deck-privacy)
      const privSelect = $('profile-deck-privacy-select') || $('sel-deck-privacy');
      privSelect?.addEventListener('change', async (e) => {
        await this.updateDeckPrivacy(e.target.value);
        if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Deste gizliliği güncellendi.');
      });

      // 5. Arkadaş Kodu Kopyalama
      $('btn-copy-friend-code')?.addEventListener('click', () => {
        const prof = this.getActiveProfile();
        if (navigator.clipboard && prof.friend_code) {
          navigator.clipboard.writeText(prof.friend_code).then(() => {
            if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Arkadaş kodu panoya kopyalandı.');
          });
        }
      });

      // 6. Giriş Yap / Kaydol / Çıkış Butonu
      const authTriggers = [$('btn-profile-auth-trigger'), $('btn-prof-auth-action')].filter(Boolean);
      authTriggers.forEach(btn => {
        btn.addEventListener('click', () => {
          if (this.user) {
            if (confirm('Oturumu kapatmak istediğinize emin misiniz?')) {
              this.signOut();
            }
          } else {
            const authModal = $('modal-auth') || $('modal-auth-sheet');
            authModal?.classList.remove('hidden');
          }
        });
      });

      $('btn-close-auth-modal')?.addEventListener('click', () => {
        $('modal-auth')?.classList.add('hidden');
        $('modal-auth-sheet')?.classList.add('hidden');
      });

      // 7. Auth Sekme Geçişi ([Giriş Yap] | [Kayıt Ol])
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

      // 8. Giriş Formu Gönderimi
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
          $('modal-auth-sheet')?.classList.add('hidden');
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Başarıyla giriş yapıldı.');
          await this.refreshProfileView();
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

      // 9. Kayıt Formu Gönderimi
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
          $('modal-auth-sheet')?.classList.add('hidden');
          if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast('Hesabınız oluşturuldu ve giriş yapıldı.');
          await this.refreshProfileView();
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

      // 10. Arkadaş Detay Modalı Kapatma
      $('btn-close-friend-detail')?.addEventListener('click', () => {
        $('friend-detail-submodal')?.classList.add('hidden');
      });

      // 11. Arkadaş Detay Zaman Filtresi
      document.querySelectorAll('.friend-time-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.friend-time-filter-btn').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          const range = e.currentTarget.getAttribute('data-range');
          this.friendFilterRange = range;
          if (this.viewingFriendProfile) {
            this.renderFriendStats(this.viewingFriendProfile.id, range);
          }
        });
      });

      // 12. Lig Terfi Modalı Kapatma
      $('btn-close-rank-promo')?.addEventListener('click', () => {
        $('modal-rank-promo')?.classList.add('hidden');
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
