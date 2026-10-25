/**
 * WortMeisterDB — Native IndexedDB Asenkron DAO Sarmalayıcısı (v1)
 * ObjectStores: cards, decks, studyLogs, settings
 */

class WortMeisterDatabase {
  constructor() {
    this.dbName = 'WortMeisterDB';
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. cards ObjectStore
        if (!db.objectStoreNames.contains('cards')) {
          const cardStore = db.createObjectStore('cards', {
            keyPath: 'id',
            autoIncrement: true
          });
          cardStore.createIndex('deckId', 'deckId', { unique: false });
          cardStore.createIndex('nextReviewDate', 'nextReviewDate', { unique: false });
          cardStore.createIndex('isPriority', 'isPriority', { unique: false });
          cardStore.createIndex('germanWord', 'germanWord', { unique: false });
        }

        // 2. decks ObjectStore
        if (!db.objectStoreNames.contains('decks')) {
          db.createObjectStore('decks', {
            keyPath: 'id',
            autoIncrement: true
          });
        }

        // 3. studyLogs ObjectStore
        if (!db.objectStoreNames.contains('studyLogs')) {
          const logStore = db.createObjectStore('studyLogs', {
            keyPath: 'id',
            autoIncrement: true
          });
          logStore.createIndex('reviewedAt', 'reviewedAt', { unique: false });
          logStore.createIndex('cardId', 'cardId', { unique: false });
        }

        // 4. settings ObjectStore
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async _tx(storeName, mode = 'readonly') {
    await this.init();
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  // --- SETTINGS ---
  async getSetting(key, defaultValue = null) {
    const store = await this._tx('settings', 'readonly');
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
      req.onerror = () => resolve(defaultValue);
    });
  }

  async setSetting(key, value) {
    const store = await this._tx('settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // --- DECKS ---
  async getAllDecks() {
    const store = await this._tx('decks', 'readonly');
    const decks = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });

    const cards = await this.getAllCards();
    const countMap = new Map();
    for (const c of cards) {
      countMap.set(Number(c.deckId), (countMap.get(Number(c.deckId)) || 0) + 1);
    }

    return decks.map((d) => ({
      ...d,
      cardCount: countMap.get(Number(d.id)) || 0
    }));
  }

  async createDeck(name) {
    const store = await this._tx('decks', 'readwrite');
    const deck = {
      name: name.trim(),
      createdAt: Date.now(),
      cardCount: 0
    };
    return new Promise((resolve, reject) => {
      const req = store.add(deck);
      req.onsuccess = () => resolve({ ...deck, id: req.result });
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteDeck(deckId) {
    const numericId = Number(deckId);
    const allCards = await this.getAllCards();
    const deckCards = allCards.filter((c) => Number(c.deckId) === numericId);

    for (const card of deckCards) {
      await this.deleteCard(card.id);
    }

    const store = await this._tx('decks', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(numericId);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async updateDeck(deckId, newName) {
    const numericId = Number(deckId);
    const store = await this._tx('decks', 'readwrite');
    return new Promise((resolve, reject) => {
      const getReq = store.get(numericId);
      getReq.onsuccess = () => {
        const deck = getReq.result;
        if (!deck) return resolve(null);
        deck.name = (newName || '').trim() || deck.name;
        deck.updatedAt = Date.now();
        const putReq = store.put(deck);
        putReq.onsuccess = () => resolve(deck);
        putReq.onerror = (e) => reject(e.target.error);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  }

  // --- CARDS ---
  async getAllCards() {
    const store = await this._tx('cards', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const raw = req.result || [];
        const valid = [];
        const badIds = [];
        const toMigrate = [];
        const now = Date.now();

        for (const c of raw) {
          if (c && typeof c.germanWord === 'string' && c.germanWord.trim().length > 0) {
            // SM-2 Geriye Dönük Otomatik Migrasyon
            if (c.easeFactor === undefined || c.interval === undefined || c.repetitions === undefined || c.dueDate === undefined) {
              c.easeFactor = Number(c.easeFactor ?? 2.5);
              c.interval = Number(c.interval ?? (c.intervalDays ?? 0));
              c.repetitions = Number(c.repetitions ?? (c.srsStage ?? 0));
              c.lapses = Number(c.lapses ?? 0);
              c.dueDate = Number(c.dueDate ?? (c.nextReviewDate ?? now));
              toMigrate.push(c);
            }
            valid.push(c);
          } else if (c && c.id) {
            badIds.push(c.id);
          }
        }

        // Arka planda migrasyon ve temizlik
        if (badIds.length > 0 || toMigrate.length > 0) {
          this._tx('cards', 'readwrite').then((rw) => {
            badIds.forEach((id) => rw.delete(id));
            toMigrate.forEach((card) => rw.put(card));
          }).catch(() => {});
        }

        resolve(valid);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getCardByWord(word) {
    const normalized = (word || '').trim().toLowerCase();
    const all = await this.getAllCards();
    return all.find((c) => (c.germanWord || '').toLowerCase() === normalized) || null;
  }

  async findCardByGerman(word) {
    return this.getCardByWord(word);
  }

  async addCard(cardData) {
    if (!cardData || typeof cardData !== 'object') {
      return null;
    }
    const cleanWord = (cardData.germanWord || '').trim();
    if (!cleanWord) {
      console.warn('[wmDB] Boş kelime kartı eklenemez!');
      return null;
    }

    const rawDeckId = cardData.deckId && typeof cardData.deckId === 'object' ? cardData.deckId.id : cardData.deckId;
    const resolvedDeckId = Number(rawDeckId) || 1;

    // Üst üste binmeyi ve mükerrer kart kaydını engelle
    const existing = await this.getCardByWord(cleanWord);
    if (existing) {
      const merged = {
        ...existing,
        ...cardData,
        deckId: resolvedDeckId,
        germanWord: cleanWord,
        id: existing.id,
        updatedAt: Date.now()
      };
      return this.updateCard(merged);
    }

    const store = await this._tx('cards', 'readwrite');
    const now = Date.now();
    const easeFactor = Number(cardData.easeFactor ?? 2.5);
    const interval = Number(cardData.interval ?? (cardData.intervalDays ?? 0));
    const repetitions = Number(cardData.repetitions ?? (cardData.srsStage ?? 0));
    const lapses = Number(cardData.lapses ?? 0);
    const dueDate = Number(cardData.dueDate ?? (cardData.nextReviewDate ?? now));

    const record = {
      deckId: resolvedDeckId,
      germanWord: cleanWord,
      targetLanguage: cardData.targetLanguage || 'de',
      partOfSpeech: cardData.partOfSpeech || 'OTHER',
      article: cardData.article || '',
      pluralForm: cardData.pluralForm || '',
      meaningsTr: (cardData.meaningsTr || '').trim(),
      meaningsEn: (cardData.meaningsEn || '').trim(),
      exampleSentence: (cardData.exampleSentence || '').trim(),
      praesens: cardData.praesens || '',
      praeteritum: cardData.praeteritum || '',
      partizipZwei: cardData.partizipZwei || '',
      hilfsverb: cardData.hilfsverb || '',
      isSeparable: Boolean(cardData.isSeparable),
      separablePrefix: cardData.separablePrefix || '',
      regularity: cardData.regularity || '',
      imperativ: cardData.imperativ || '',
      cefr: cardData.cefr || 'A1',
      // 4'lü SM-2 Veri Yapısı
      easeFactor,
      interval,
      repetitions,
      lapses,
      dueDate,
      // Geriye dönük uyumluluk
      srsStage: repetitions,
      nextReviewDate: dueDate,
      intervalDays: interval,
      isPriority: Boolean(cardData.isPriority),
      createdAt: now
    };

    return new Promise((resolve, reject) => {
      const req = store.add(record);
      req.onsuccess = () => resolve({ ...record, id: req.result });
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async updateCard(card) {
    if (!card || !card.id) return null;
    const cleanWord = (card.germanWord || '').trim();
    if (!cleanWord) {
      console.warn('[wmDB] Boş kelime ile kart güncellenemez!');
      return null;
    }
    const rawDeckId = card.deckId && typeof card.deckId === 'object' ? card.deckId.id : card.deckId;
    card.deckId = Number(rawDeckId) || 1;
    card.germanWord = cleanWord;

    // SM-2 ve Leitner alanlarını senkronize tut
    if (card.easeFactor === undefined) card.easeFactor = 2.5;
    if (card.interval === undefined) card.interval = Number(card.intervalDays ?? 0);
    if (card.repetitions === undefined) card.repetitions = Number(card.srsStage ?? 0);
    if (card.lapses === undefined) card.lapses = 0;
    if (card.dueDate === undefined) card.dueDate = Number(card.nextReviewDate ?? Date.now());

    card.srsStage = card.repetitions;
    card.intervalDays = card.interval;
    card.nextReviewDate = card.dueDate;

    const store = await this._tx('cards', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(card);
      req.onsuccess = () => resolve(card);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteCard(cardId) {
    const store = await this._tx('cards', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(Number(cardId));
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async togglePriority(cardId) {
    const cards = await this.getAllCards();
    const target = cards.find((c) => Number(c.id) === Number(cardId));
    if (!target) return null;
    target.isPriority = !target.isPriority;
    await this.updateCard(target);
    return target;
  }

  async getDueCards(deckId = 'all', includeAllIfEmpty = false) {
    const now = Date.now();
    const allCards = await this.getAllCards();
    const filteredByDeck =
      deckId === 'all'
        ? allCards
        : allCards.filter((c) => Number(c.deckId) === Number(deckId));

    const due = filteredByDeck.filter((c) => {
      const dueTime = Number(c.dueDate ?? (c.nextReviewDate ?? 0));
      return dueTime <= now;
    });

    // Önce öncelikli (yıldızlı) kartlar, ardından en eski tekrar tarihi
    due.sort((a, b) => {
      if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
      const timeA = Number(a.dueDate ?? (a.nextReviewDate ?? 0));
      const timeB = Number(b.dueDate ?? (b.nextReviewDate ?? 0));
      return timeA - timeB;
    });

    if (due.length === 0 && includeAllIfEmpty) {
      return filteredByDeck;
    }
    return due;
  }

  /**
   * 4'lü SM-2 Aralıklı Tekrar Algoritması (Geriye Dönük Uyumlu)
   * - Tekrar (0 / again): repetitions = 0, lapses += 1, interval = 0, easeFactor = Math.max(1.3, easeFactor - 0.20)
   * - Zor (1 / hard):     interval = repetitions === 0 ? 1 : Math.max(1, Math.round(interval * 1.2)), easeFactor = Math.max(1.3, easeFactor - 0.15), repetitions += 1
   * - İyi (2 / good):     interval = repetitions === 0 ? 1 : (repetitions === 1 ? 3 : Math.round(interval * easeFactor)), repetitions += 1
   * - Kolay (3 / easy):   interval = repetitions === 0 ? 4 : Math.round(interval * easeFactor * 1.3), easeFactor += 0.15, repetitions += 1
   */
  async applySM2Review(cardId, rating) {
    const allCards = await this.getAllCards();
    const card = allCards.find((c) => Number(c.id) === Number(cardId));
    if (!card) return null;

    let r = rating;
    if (r === 'again') r = 0;
    else if (r === 'hard') r = 1;
    else if (r === 'good') r = 2;
    else if (r === 'easy') r = 3;
    r = Number(r);
    if (isNaN(r) || r < 0 || r > 3) r = 2;

    let easeFactor = Number(card.easeFactor ?? 2.5);
    let interval = Number(card.interval ?? (card.intervalDays ?? 0));
    let repetitions = Number(card.repetitions ?? (card.srsStage ?? 0));
    let lapses = Number(card.lapses ?? 0);

    const now = Date.now();
    const TEN_MINUTES = 10 * 60 * 1000;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    let dueDate = now;

    if (r === 0) {
      // Tekrar (0)
      repetitions = 0;
      lapses += 1;
      interval = 0; // 10 dakika sonra / aynı gün tekrar sor
      easeFactor = Math.max(1.3, easeFactor - 0.20);
      dueDate = now + TEN_MINUTES;
    } else if (r === 1) {
      // Zor (1)
      interval = repetitions === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
      easeFactor = Math.max(1.3, easeFactor - 0.15);
      repetitions += 1;
      dueDate = now + interval * ONE_DAY;
    } else if (r === 2) {
      // İyi (2) -> Yeni kartta 3 gün, öğrenilmiş kartta hard'dan fazla
      const hardDays = repetitions === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
      interval = repetitions === 0 ? 3 : Math.max(hardDays + 1, Math.round(interval * easeFactor));
      repetitions += 1;
      dueDate = now + interval * ONE_DAY;
    } else if (r === 3) {
      // Kolay (3) -> Yeni kartta 8 gün, öğrenilmiş kartta good'dan fazla
      const goodDays = repetitions === 0 ? 3 : Math.round(interval * easeFactor);
      interval = repetitions === 0 ? 8 : Math.max(goodDays + 2, Math.round(interval * easeFactor * 1.35));
      easeFactor += 0.15;
      repetitions += 1;
      dueDate = now + interval * ONE_DAY;
    }

    // 2 ondalık basamağa yuvarla
    easeFactor = Math.round(easeFactor * 100) / 100;

    card.easeFactor = easeFactor;
    card.interval = interval;
    card.repetitions = repetitions;
    card.lapses = lapses;
    card.dueDate = dueDate;

    // Geriye dönük uyumluluk
    card.intervalDays = interval;
    card.srsStage = repetitions;
    card.nextReviewDate = dueDate;

    await this.updateCard(card);
    const ratingLabels = ['again', 'hard', 'good', 'easy'];
    await this.addStudyLog(card.id, ratingLabels[r] || 'good');
    return card;
  }

  async applySRSReview(cardId, rating) {
    return this.applySM2Review(cardId, rating);
  }

  // --- STUDY LOGS ---
  async addStudyLog(cardId, rating) {
    const store = await this._tx('studyLogs', 'readwrite');
    const log = {
      cardId: Number(cardId),
      rating,
      reviewedAt: Date.now()
    };
    return new Promise((resolve, reject) => {
      const req = store.add(log);
      req.onsuccess = () => resolve({ ...log, id: req.result });
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllStudyLogs() {
    const store = await this._tx('studyLogs', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getTodayStudyLogs() {
    const all = await this.getAllStudyLogs();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startMs = startOfDay.getTime();
    return all.filter((l) => (l.reviewedAt || 0) >= startMs);
  }
}

window.wmDB = new WortMeisterDatabase();
