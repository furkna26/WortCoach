/**
 * WortMeister — 4'lü SM-2 Aralıklı Tekrar & Cloze (Boşluk Doldurma) Çalışma Yöneticisi
 * Faz 2: SM-2 Algoritması (<10dk, 1g, 3g, 8g), Olgunluk Rozetleri (Yeni, Öğreniliyor, Genç, Olgun),
 * Standart Kart & Cloze (Boşluk Doldurma) Modu, Rektion & Nüans Gösterimi
 */

class WortMeisterStudy {
  constructor() {
    this.deckSelect = document.getElementById('study-deck-select');
    this.arena = document.getElementById('study-arena');
    this.emptyState = document.getElementById('study-empty-state');
    this.cardWrapper = document.getElementById('flashcard-3d-wrapper');
    this.cardInner = document.getElementById('flashcard-inner');

    this.queue = [];
    this.currentIndex = 0;
    this.isFlipped = false;
    this.studyMode = 'standard';
    this.filterMode = localStorage.getItem('wortcoach_study_filter') || 'smart';
  }

  init() {
    if (!this.cardWrapper) return;

    // Kart çevirme (Flip) dinleyicisi
    this.cardWrapper.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.scf-actions')) return;
      this.toggleFlip();
    });

    // Deste seçici
    this.deckSelect?.addEventListener('change', () => {
      const deckId = this.deckSelect.value;
      this.loadSession(deckId, deckId !== 'all' || this.filterMode !== 'smart');
    });

    // Çalışma Modu Seçici Butonları: Standart vs Cloze
    

    // TTS Seslendirme Dinleyicileri
    document.getElementById('btn-fc-tts')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speakCurrentCard();
    });

    document.getElementById('btn-fc-pronounce')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = this.getCurrentCard();
      if (card && window.wmApp) {
        window.wmApp.openPronunciationCoach(card, 'word');
      }
    });

    

    document.getElementById('btn-fc-tts-back')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = this.getCurrentCard();
      if (card && card.exampleSentence) {
        const cleanEx = card.exampleSentence.replace(/\s*\(.*?\)\s*$/, '').trim();
        window.wmTTS.speak(cleanEx || card.germanWord, 'de-DE');
      } else {
        this.speakCurrentCard();
      }
    });

    document.getElementById('btn-fc-pronounce-back')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = this.getCurrentCard();
      if (card && window.wmApp) {
        window.wmApp.openPronunciationCoach(card, card.exampleSentence ? 'sentence' : 'word');
      }
    });

    document.getElementById('btn-study-reset-session')?.addEventListener('click', () => {
      this.loadSession(this.deckSelect.value, true);
    });

    document.getElementById('btn-study-stats-shortcut')?.addEventListener('click', () => {
      if (window.wmApp) window.wmApp.switchTab('tab-cards');
    });

    document.getElementById('btn-fc-priority')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = this.getCurrentCard();
      if (!card) return;
      const updated = await window.wmDB.togglePriority(card.id);
      if (updated) {
        this.queue[this.currentIndex] = updated;
        this.renderCurrentCard();
      }
    });

    // 4'lü SM-2 Butonları Dinleyicisi
    document.querySelectorAll('.btn-srs-sm2').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const rating = btn.getAttribute('data-rating');
        await this.submitRating(rating);
      });
    });

    // Geriye dönük uyumluluk için eski buton sınıfı varsa dinle
    document.querySelectorAll('.btn-srs-android').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const rating = btn.getAttribute('data-rating');
        await this.submitRating(rating);
      });
    });

    document.getElementById('btn-study-force-all')?.addEventListener('click', () => {
      if (this.queue.length === 0 && this.filterMode !== 'smart') {
        this.filterMode = 'smart';
        localStorage.setItem('wortcoach_study_filter', 'smart');
        this.updateFilterBarUI();
      }
      this.loadSession(this.deckSelect.value, true);
    });

    document.getElementById('btn-study-add-new')?.addEventListener('click', () => {
      if (window.wmApp) window.wmApp.openAddCardModal();
    });

    document.querySelectorAll('.study-filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const mode = pill.getAttribute('data-study-filter') || 'smart';
        this.setFilterMode(mode);
      });
    });

    document.getElementById('btn-study-open-mastery')?.addEventListener('click', () => {
      window.wmApp?.openMasteryAnalyzerModal(this.deckSelect?.value || 'all');
    });

    this.updateModeToggleUI();
    this.updateFilterBarUI();
    this.bindKeyboardShortcuts();
  }

  bindKeyboardShortcuts() {
    if (this._kbBound) return;
    this._kbBound = true;

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement;
      if (active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable)) return;

      const studyTab = document.getElementById('tab-study');
      if (!studyTab || !studyTab.classList.contains('active')) return;
      if (document.querySelector('.modal-backdrop:not(.hidden), .prof-modal-backdrop:not(.hidden)')) return;
      if (!this.getCurrentCard() || !this.arena || this.arena.classList.contains('hidden')) return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.toggleFlip();
        return;
      }

      if (this.isFlipped && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const ratings = ['again', 'hard', 'good', 'easy'];
        this.submitRating(ratings[Number(e.key) - 1]);
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.speakCurrentCard();
        return;
      }

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        document.getElementById('btn-fc-priority')?.click();
      }
    });
  }

  setStudyMode(mode) {
    this.studyMode = mode;
    localStorage.setItem('wortcoach_study_mode', mode);
    this.updateModeToggleUI();
    this.renderCurrentCard();
  }

  updateModeToggleUI() {
    const btnStandard = document.getElementById('btn-mode-standard');
    const btnCloze = document.getElementById('btn-mode-cloze');
    if (this.studyMode === 'cloze') {
      btnStandard?.classList.remove('active');
      btnCloze?.classList.add('active');
    } else {
      btnCloze?.classList.remove('active');
      btnStandard?.classList.add('active');
    }
  }

  setFilterMode(mode) {
    const allowed = ['smart', 'hide_mastered', 'struggling_only'];
    this.filterMode = allowed.includes(mode) ? mode : 'smart';
    localStorage.setItem('wortcoach_study_filter', this.filterMode);
    this.updateFilterBarUI();
    const deckId = this.deckSelect?.value || 'all';
    const forceAll = this.filterMode !== 'smart' || deckId !== 'all';
    return this.loadSession(deckId, forceAll);
  }

  updateFilterBarUI() {
    document.querySelectorAll('.study-filter-pill').forEach((pill) => {
      const mode = pill.getAttribute('data-study-filter');
      pill.classList.toggle('active', mode === this.filterMode);
    });
  }

  async populateDeckSelector(selectedDeckId = 'all') {
    const decks = await window.wmDB.getAllDecks();
    if (!this.deckSelect) this.deckSelect = document.getElementById('study-deck-select');
    if (!this.deckSelect) return;

    this.deckSelect.innerHTML = `<option value="all">Tüm Kartlar</option>`;
    for (const d of decks) {
      const opt = document.createElement('option');
      opt.value = String(d.id);
      opt.textContent = `${d.name} (${d.cardCount || 0})`;
      if (String(selectedDeckId) === String(d.id)) {
        opt.selected = true;
      }
      this.deckSelect.appendChild(opt);
    }
  }

  async loadSession(deckId = 'all', forceAll = false) {
    if (!this.deckSelect) this.deckSelect = document.getElementById('study-deck-select');
    if (!this.arena) this.arena = document.getElementById('study-arena');
    if (!this.emptyState) this.emptyState = document.getElementById('study-empty-state');
    if (!this.cardInner) this.cardInner = document.getElementById('flashcard-inner');
    if (!this.cardWrapper) this.cardWrapper = document.getElementById('flashcard-3d-wrapper');

    await this.populateDeckSelector(deckId);
    this.updateFilterBarUI();
    this.queue = await window.wmDB.getDueCards(deckId, forceAll, { filterMode: this.filterMode });
    this.currentIndex = 0;
    this.isFlipped = false;
    if (this.cardInner) this.cardInner.classList.remove('is-flipped');

    this.updateProgress();

    if (this.queue.length === 0) {
      const emptyTitle = document.getElementById('study-empty-title');
      const emptyDesc = document.getElementById('study-empty-desc');
      if (this.filterMode === 'struggling_only') {
        if (emptyTitle) emptyTitle.textContent = 'Zorlanan Kart Bulunamadı';
        if (emptyDesc) emptyDesc.textContent = 'Bu destede henüz Zor/Tekrar edilen veya oyunda yanlış yapılan kelime yok.';
      } else if (this.filterMode === 'hide_mastered') {
        if (emptyTitle) emptyTitle.textContent = 'Tüm Kartları Öğrenmişsin';
        if (emptyDesc) emptyDesc.textContent = 'İyi ve Kolay seçilen kelimeler gizlendi. İstersen tüm desteyi tekrar edebilirsin.';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'Bugünlük Harika Gidiyorsun!';
        if (emptyDesc) emptyDesc.textContent = 'Şu an için tekrar etmen gereken vadesi gelmiş kelime kalmadı.';
      }
      if (this.arena) this.arena.classList.add('hidden');
      if (this.emptyState) this.emptyState.classList.remove('hidden');
    } else {
      if (this.emptyState) this.emptyState.classList.add('hidden');
      if (this.arena) this.arena.classList.remove('hidden');
      this.renderCurrentCard();
    }
  }

  async updateProgress() {
    const total = this.queue.length;
    const cur = this.currentIndex;
    const countEl = document.getElementById('study-progress-card-count');
    const pctEl = document.getElementById('study-progress-pct');
    const fillEl = document.getElementById('study-progress-fill-bar');

    if (total === 0) {
      if (countEl) countEl.textContent = 'Kart 0 / 0';
      if (pctEl) pctEl.textContent = '%0';
      if (fillEl) fillEl.style.width = '0%';
      return;
    }

    const pct = Math.round((cur / total) * 100);
    if (countEl) countEl.textContent = `Kart ${cur + 1} / ${total}`;
    if (pctEl) pctEl.textContent = `%${pct}`;
    if (fillEl) fillEl.style.width = `${pct}%`;

    // Günlük seri ve sayaç
    const logs = await window.wmDB.getTodayStudyLogs();
    const streakDays = window.wmStats ? window.wmStats.calculateStreak(logs) : 1;
    const streakLabel = document.getElementById('study-streak-label');
    if (streakLabel) {
      streakLabel.textContent = `${streakDays || 1} Gün Seri • Bugün: ${logs.length} Kart`;
    }
  }

  getCurrentCard() {
    return this.queue[this.currentIndex] || null;
  }

  toggleFlip() {
    this.isFlipped = !this.isFlipped;
    if (this.cardInner) {
      this.cardInner.classList.toggle('is-flipped', this.isFlipped);
    }
    if (navigator.vibrate) navigator.vibrate(10);
  }

  speakCurrentCard() {
    const card = this.getCurrentCard();
    if (!card) return;
    const textToSpeak =
      card.partOfSpeech === 'NOUN' && card.article
        ? `${card.article} ${card.germanWord}`
        : card.germanWord;
    window.wmTTS.speak(textToSpeak, 'de-DE');
  }

  renderCurrentCard() {
    const card = this.getCurrentCard();
    if (!card) return;

    const isQuizCard = (card.partOfSpeech || '').toUpperCase() === 'QUIZ' || Boolean(card.isQuizCard);

    // Anlam eksikse anlık sentezle (Quiz kartlarında sözlük sentezi devre dışıdır)
    if (!isQuizCard && (!card.meaningsTr || card.meaningsTr === '-')) {
      try {
        if (window.DictionaryService) {
          const synth = window.DictionaryService.synthesizeInstantEntry(card.germanWord);
          if (synth && synth.meaningsTr) {
            card.meaningsTr = synth.meaningsTr;
          }
        }
      } catch (_) {}
    }

    this.isFlipped = false;
    if (this.cardInner) this.cardInner.classList.remove('is-flipped');

    // 1. POS Rozeti
    const posLabels = { VERB: 'Fiil', NOUN: 'İsim', ADJECTIVE: 'Sıfat', OTHER: 'İfade', QUIZ: 'Soru - Cevap' };
    const posBadgeEl = document.getElementById('fc-front-pos-badge');
    if (posBadgeEl) {
      const label = isQuizCard ? (card.cefr && card.cefr !== 'QUIZ' ? `Quiz • ${card.cefr}` : 'Soru - Cevap') : (posLabels[card.partOfSpeech] || 'Kelime');
      posBadgeEl.innerHTML = `<span class="badge badge-pos-${card.partOfSpeech}">${label}</span>`;
    }

    // 2. Olgunluk Rozeti (Yeni, Öğreniliyor, Genç, Olgun - Leitner Kutu Metinleri Yerine)
    const maturityBadgeEl = document.getElementById('fc-front-maturity-badge');
    if (maturityBadgeEl && window.getCardMaturity) {
      const maturity = window.getCardMaturity(card);
      maturityBadgeEl.textContent = maturity.label;
      maturityBadgeEl.className = `badge badge-maturity ${maturity.className}`;
      maturityBadgeEl.style.color = maturity.color;
      maturityBadgeEl.style.backgroundColor = maturity.bg;
      maturityBadgeEl.style.border = `1px solid ${maturity.border}`;
    }

    // 3. Öncelik Yıldızı (Priority)
    const btnPriority = document.getElementById('btn-fc-priority');
    if (btnPriority) {
      btnPriority.innerHTML = `<svg class="svg-icon" style="color:${card.isPriority ? '#FBBF24' : 'var(--text-muted)'}"><use href="${card.isPriority ? '#icon-star-filled' : '#icon-star'}"></use></svg>`;
    }

    // 4. İsim / Fiil ve Kelime Formatı
    const isNoun = !isQuizCard && ((card.partOfSpeech || '').toUpperCase() === 'NOUN' || Boolean(card.article));
    const nounArticle = card.article ? card.article.toLowerCase() : '';
    const cleanWord = (card.germanWord || '').replace(/^(der|die|das)\s+/i, '').trim();
    const formattedWord = isNoun && nounArticle
      ? `${nounArticle} ${cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1)}`
      : card.germanWord;

    const wordEl = document.getElementById('fc-front-word');
    if (wordEl) {
      wordEl.textContent = formattedWord;
      const len = (formattedWord || '').length;
      if (isQuizCard || len > 28) {
        wordEl.style.fontSize = len > 65 ? '1.18rem' : '1.38rem';
        wordEl.style.lineHeight = '1.38';
      } else {
        wordEl.style.fontSize = '';
        wordEl.style.lineHeight = '';
      }
    }

    // 5. ÇALIŞMA MODU: CLOZE (BOŞLUK DOLDURMA) VS STANDART
    const standardContainer = document.getElementById('fc-front-standard-container');
    standardContainer?.classList.remove('hidden');

      const nounContainer = document.getElementById('fc-front-noun-container');
      const nounArtBadge = document.getElementById('fc-front-noun-article');
      const nounPluralBadge = document.getElementById('fc-front-noun-plural');
      const verbContainer = document.getElementById('fc-front-grammar-container');
      const stammformenBox = document.getElementById('fc-front-stammformen-box');
      const rektionBox = document.getElementById('fc-front-rektion-box');
      const rektionBadge = document.getElementById('fc-front-rektion-badge');
      const falseFriendBox = document.getElementById('fc-front-false-friend-box');
      const falseFriendText = document.getElementById('fc-front-false-friend-text');

      // Evrensel Artikel Renk Kodlaması (der / die / das)
      if (isNoun && nounArticle) {
        if (nounContainer) nounContainer.classList.remove('hidden');
        if (verbContainer) verbContainer.classList.add('hidden');
        if (stammformenBox) stammformenBox.classList.add('hidden');

        if (nounArtBadge) {
          const artStyle = window.getArticleStyle ? window.getArticleStyle(nounArticle) : null;
          nounArtBadge.textContent = nounArticle.toUpperCase();
          nounArtBadge.className = `badge badge-${nounArticle}`;
          if (artStyle) {
            nounArtBadge.style.color = artStyle.color;
            nounArtBadge.style.backgroundColor = artStyle.bg;
            nounArtBadge.style.border = `1px solid ${artStyle.border}`;
          }
        }
        if (nounPluralBadge) {
          if (card.pluralForm) {
            nounPluralBadge.textContent = card.pluralForm;
            nounPluralBadge.classList.remove('hidden');
          } else {
            nounPluralBadge.classList.add('hidden');
          }
        }
      } else if ((card.partOfSpeech || '').toUpperCase() === 'VERB') {
        if (nounContainer) nounContainer.classList.add('hidden');
        if (verbContainer) verbContainer.classList.remove('hidden');

        if (
          !isQuizCard &&
          card.germanWord &&
          (!card.praesens || !card.praeteritum || !card.partizipZwei || !card.imperativ) &&
          window.GermanVerbHelper &&
          typeof window.GermanVerbHelper.conjugate === 'function'
        ) {
          const conj = window.GermanVerbHelper.conjugate(card.germanWord);
          if (conj) {
            let dirty = false;
            const fill = (k, val) => {
              if (!card[k] && val) {
                card[k] = val;
                dirty = true;
              }
            };
            fill('praesens', conj.praesens);
            fill('praeteritum', conj.praeteritum);
            fill('partizipZwei', conj.partizipZwei);
            fill('hilfsverb', conj.hilfsverb);
            fill('imperativ', conj.imperativ);
            fill('separablePrefix', conj.separablePrefix);
            fill('regularity', conj.regularity);
            fill('reflexiveType', conj.reflexiveType);
            if (!card.isSeparable && conj.isSeparable) { card.isSeparable = true; dirty = true; }
            if (!card.isReflexive && conj.isReflexive) { card.isReflexive = true; dirty = true; }
            if (dirty && card.id && window.wmDB && typeof window.wmDB.updateCard === 'function') {
              window.wmDB.updateCard(card).catch(() => {});
            }
          }
        }

        // Stammformen Şeridi
        if (stammformenBox && window.getStammformenRibbon) {
          const ribbonHtml = window.getStammformenRibbon(card);
          if (ribbonHtml) {
            stammformenBox.innerHTML = ribbonHtml;
            stammformenBox.classList.remove('hidden');
          } else {
            stammformenBox.classList.add('hidden');
          }
        }

        const prsEl = document.getElementById('fc-front-prs');
        const prtEl = document.getElementById('fc-front-prt');
        const p2El = document.getElementById('fc-front-p2');
        const impEl = document.getElementById('fc-front-imp');
        const hilfsverbPill = document.getElementById('fc-front-hilfsverb-pill');
        const hilfsverbText = document.getElementById('fc-front-hilfsverb-text');

        const hilfs = card.hilfsverb || 'hat';
        const cleanP2 = (card.partizipZwei || '-').replace(/^(hat|ist)\s+/i, '');
        if (prsEl) prsEl.textContent = card.praesens || '-';
        if (prtEl) prtEl.textContent = card.praeteritum || '-';
        if (p2El) p2El.textContent = cleanP2;
        if (impEl) impEl.textContent = card.imperativ || `${card.germanWord}!`;
        if (hilfsverbPill) hilfsverbPill.style.display = 'inline-flex';
        if (hilfsverbText) hilfsverbText.textContent = `${hilfs === 'ist' ? 'sein (ist)' : 'haben (hat)'}`;
      } else {
        if (nounContainer) nounContainer.classList.add('hidden');
        if (verbContainer) verbContainer.classList.add('hidden');
        if (stammformenBox) stammformenBox.classList.add('hidden');
      }

      // Rektion (Verben mit Präpositionen) & Karıştırılan Kelime (False Friends)
      const enrichment = (!isQuizCard && window.getGrammarEnrichment) ? window.getGrammarEnrichment(card.germanWord) : null;
      if (enrichment && rektionBox && rektionBadge) {
        rektionBadge.textContent = enrichment.badge;
        rektionBox.classList.remove('hidden');
      } else if (rektionBox) {
        rektionBox.classList.add('hidden');
      }

      const confused = (!isQuizCard && window.getConfusedWordPair) ? window.getConfusedWordPair(card.germanWord) : null;
      if (confused && falseFriendBox && falseFriendText) {
        falseFriendText.textContent = confused.note;
        falseFriendBox.classList.remove('hidden');
      } else if (falseFriendBox) {
        falseFriendBox.classList.add('hidden');
      }

    // 6. KART ARKA YÜZÜ
    const backTopLabel = document.querySelector('#flashcard-inner .scb-top-label');
    if (backTopLabel) {
      backTopLabel.textContent = isQuizCard ? 'CEVAP' : 'TÜRKÇE ANLAMI';
    }
    const meaningTrEl = document.getElementById('fc-back-meaning-tr');
    if (meaningTrEl) {
      meaningTrEl.textContent = card.meaningsTr || card.back || card.meaning || 'Anlam belirtilmedi';
    }

    const enRow = document.getElementById('fc-back-en-row');
    const meaningEnEl = document.getElementById('fc-back-meaning-en');
    if (card.meaningsEn) {
      enRow?.classList.remove('hidden');
      if (meaningEnEl) meaningEnEl.textContent = card.meaningsEn;
    } else {
      enRow?.classList.add('hidden');
    }

    const subtextEl = document.getElementById('fc-back-subtext');
    if (subtextEl) {
      subtextEl.textContent = isQuizCard ? `Soru: ${formattedWord}` : `Almanca: ${formattedWord}`;
    }

    // Örnek Cümle / Ek Bilgi Kartı (Arka Yüz)
    const exCard = document.getElementById('fc-back-example-card');
    const exText = document.getElementById('fc-back-example');
    const exHeaderSpan = document.querySelector('#fc-back-example-card .scb-example-header > span');
    if (exHeaderSpan) {
      exHeaderSpan.textContent = isQuizCard ? 'EK BİLGİ & İPUCU' : 'ÖRNEK CÜMLE';
    }
    if (card.exampleSentence) {
      exCard?.classList.remove('hidden');
      if (exText) exText.textContent = card.exampleSentence;
    } else {
      exCard?.classList.add('hidden');
    }

    // 7. 4'LÜ SM-2 TAHMİNİ SÜRE ETİKETLERİ (<10dk, 1g, 3g, 4g vb.)
    if (window.calculateSM2NextIntervals) {
      const intervals = window.calculateSM2NextIntervals(card);
      const againTime = document.getElementById('srs-again-time');
      const hardTime = document.getElementById('srs-hard-time');
      const goodTime = document.getElementById('srs-good-time');
      const easyTime = document.getElementById('srs-easy-time');

      if (againTime) againTime.textContent = intervals.againTime;
      if (hardTime) hardTime.textContent = intervals.hardTime;
      if (goodTime) goodTime.textContent = intervals.goodTime;
      if (easyTime) easyTime.textContent = intervals.easyTime;
    }
  }

  async submitRating(rating) {
    const card = this.getCurrentCard();
    if (!card) return;

    const ratingMap = { again: 0, hard: 1, good: 2, easy: 3 };
    const rNum = ratingMap[rating] !== undefined ? ratingMap[rating] : Number(rating);

    if (navigator.vibrate) {
      navigator.vibrate(rNum >= 2 ? [15, 30, 15] : 20);
    }

    // 4'lü SM-2 Değerlendirmesini Uygula
    await window.wmDB.applySM2Review(card.id, rating);
    // Supabase ELO & Review Stat Hook
    if (window.wmSocial && window.wmSocial.recordActivity) {
      const isCorrectReview = rNum >= 2;
      window.wmSocial.recordActivity({
        type: 'review',
        isCorrect: isCorrectReview,
        responseTimeMs: 2000,
        comboCount: 0,
        isHardWord: Number(card.srsStage || 0) === 0
      });
    }

    this.currentIndex += 1;
    await this.updateProgress();

    if (this.currentIndex >= this.queue.length) {
      this.arena?.classList.add('hidden');
      this.emptyState?.classList.remove('hidden');
      if (window.wmApp) window.wmApp.refreshHomeDashboard();
    } else {
      this.renderCurrentCard();
    }
  }
}

window.wmStudy = new WortMeisterStudy();
