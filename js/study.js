/**
 * WortMeister — SRS Leitner Flashcard Çalışma Yöneticisi (tab-study)
 * Pixel-Perfect Parity with Android APK Screenshots 4 & 5
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
  }

  init() {
    if (!this.cardWrapper) return;

    this.cardWrapper.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      this.toggleFlip();
    });

    this.deckSelect.addEventListener('change', () => {
      this.loadSession(this.deckSelect.value, false);
    });

    document.getElementById('btn-fc-tts').addEventListener('click', (e) => {
      e.stopPropagation();
      this.speakCurrentCard();
    });

    document.getElementById('btn-fc-tts-back')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speakCurrentCard();
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

    // 3 SRS Butonu
    document.querySelectorAll('.btn-srs-android').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rating = btn.getAttribute('data-rating');
        await this.submitRating(rating);
      });
    });

    document.getElementById('btn-study-force-all')?.addEventListener('click', () => {
      this.loadSession(this.deckSelect.value, true);
    });

    document.getElementById('btn-study-add-new')?.addEventListener('click', () => {
      if (window.wmApp) window.wmApp.openAddCardModal();
    });
  }

  async populateDeckSelector(selectedDeckId = 'all') {
    const decks = await window.wmDB.getAllDecks();
    this.deckSelect.innerHTML = `<option value="all">Tüm Kartlar</option>`;
    for (const d of decks) {
      const opt = document.createElement('option');
      opt.value = String(d.id);
      opt.textContent = `${d.name} (${d.cardCount})`;
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
    this.queue = await window.wmDB.getDueCards(deckId, forceAll);
    this.currentIndex = 0;
    this.isFlipped = false;
    if (this.cardInner) this.cardInner.classList.remove('is-flipped');

    this.updateProgress();

    if (this.queue.length === 0) {
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
      countEl.textContent = 'Kart 0 / 0';
      pctEl.textContent = '%0';
      fillEl.style.width = '0%';
      return;
    }

    const pct = Math.round((cur / total) * 100);
    countEl.textContent = `Kart ${cur + 1} / ${total}`;
    pctEl.textContent = `%${pct}`;
    fillEl.style.width = `${pct}%`;

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

    // Anlam veya gramer eksikse anlık çözümle
    if (!card.meaningsTr || card.meaningsTr === '-') {
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

    // POS Rozeti
    const posLabels = { VERB: 'Fiil', NOUN: 'İsim', ADJECTIVE: 'Sıfat', OTHER: 'İfade' };
    const posBadgeEl = document.getElementById('fc-front-pos-badge');
    if (posBadgeEl) {
      posBadgeEl.innerHTML = `<span class="badge badge-pos-${card.partOfSpeech}">${posLabels[card.partOfSpeech] || 'Kelime'}</span>`;
    }

    // Yıldız (Priority)
    const btnPriority = document.getElementById('btn-fc-priority');
    if (btnPriority) {
      btnPriority.innerHTML = `<svg class="svg-icon" style="color:${card.isPriority ? '#FBBF24' : 'var(--text-muted)'}"><use href="${card.isPriority ? '#icon-star-filled' : '#icon-star'}"></use></svg>`;
    }

    // Ön Yüz Kelimesi (Büyük ve Kesin Almanca)
    const isNoun = (card.partOfSpeech || '').toUpperCase() === 'NOUN' || Boolean(card.article);
    const nounArticle = card.article ? card.article.toLowerCase() : '';
    const cleanWord = (card.germanWord || '').replace(/^(der|die|das)\s+/i, '').trim();
    const formattedWord = isNoun && nounArticle
      ? `${nounArticle} ${cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1)}`
      : card.germanWord;

    document.getElementById('fc-front-word').textContent = formattedWord;

    const nounContainer = document.getElementById('fc-front-noun-container');
    const nounArtBadge = document.getElementById('fc-front-noun-article');
    const nounPluralBadge = document.getElementById('fc-front-noun-plural');
    const verbContainer = document.getElementById('fc-front-grammar-container');

    // Gramer Detayları (İsim için [ DIE ] rozeti, Fiil için 4'lü Grid)
    if (isNoun && nounArticle) {
      if (nounContainer) nounContainer.classList.remove('hidden');
      if (verbContainer) verbContainer.classList.add('hidden');

      if (nounArtBadge) {
        nounArtBadge.className = `badge badge-${nounArticle}`;
        nounArtBadge.textContent = nounArticle.toUpperCase();
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
    }

    // KART ARKA YÜZÜ (Screenshot 4 Parity)
    const meaningTrEl = document.getElementById('fc-back-meaning-tr');
    if (meaningTrEl) {
      meaningTrEl.textContent = card.meaningsTr || 'Anlam belirtilmedi';
    }

    const enRow = document.getElementById('fc-back-en-row');
    const meaningEnEl = document.getElementById('fc-back-meaning-en');
    if (card.meaningsEn) {
      enRow.classList.remove('hidden');
      meaningEnEl.textContent = card.meaningsEn;
    } else {
      enRow.classList.add('hidden');
    }

    const subtextEl = document.getElementById('fc-back-subtext');
    if (subtextEl) {
      subtextEl.textContent = `Almanca: ${formattedWord}`;
    }

    // Örnek Cümle Kartı
    const exCard = document.getElementById('fc-back-example-card');
    const exText = document.getElementById('fc-back-example');
    if (card.exampleSentence) {
      exCard.classList.remove('hidden');
      exText.textContent = card.exampleSentence;
    } else {
      exCard.classList.add('hidden');
    }

    // SRS "Öğrendim" aralığı tahmini
    const curInt = Number(card.intervalDays) || 0;
    const nextInt = curInt === 0 ? 1 : Math.min(16, curInt * 2);
    const goodLabel = document.getElementById('srs-good-interval-label');
    if (goodLabel) {
      goodLabel.textContent = `${nextInt} Gün`;
    }
  }

  async submitRating(rating) {
    const card = this.getCurrentCard();
    if (!card) return;

    if (navigator.vibrate) {
      navigator.vibrate(rating === 'good' ? [15, 30, 15] : 20);
    }

    await window.wmDB.applySRSReview(card.id, rating);

    this.currentIndex += 1;
    await this.updateProgress();

    if (this.currentIndex >= this.queue.length) {
      this.arena.classList.add('hidden');
      this.emptyState.classList.remove('hidden');
      if (window.wmApp) window.wmApp.refreshHomeDashboard();
    } else {
      this.renderCurrentCard();
    }
  }
}

window.wmStudy = new WortMeisterStudy();
