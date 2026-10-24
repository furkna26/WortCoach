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
        for (const c of raw) {
          if (c && typeof c.germanWord === 'string' && c.germanWord.trim().length > 0) {
            valid.push(c);
          } else if (c && c.id) {
            badIds.push(c.id);
          }
        }
        if (badIds.length > 0) {
          // Arka planda boş ve bozuk kartları temizle (uygulamayı buga sokmasını önler)
          this._tx('cards', 'readwrite').then((rw) => {
            badIds.forEach((id) => rw.delete(id));
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

    // Üst üste binmeyi ve mükerrer kart kaydını engelle
    const existing = await this.getCardByWord(cleanWord);
    if (existing) {
      const merged = { ...existing, ...cardData, germanWord: cleanWord, id: existing.id, updatedAt: Date.now() };
      return this.updateCard(merged);
    }

    const store = await this._tx('cards', 'readwrite');
    const now = Date.now();
    const record = {
      deckId: Number(cardData.deckId) || 1,
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
      srsStage: Number(cardData.srsStage ?? 0),
      nextReviewDate: Number(cardData.nextReviewDate ?? now),
      intervalDays: Number(cardData.intervalDays ?? 0),
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
    card.germanWord = cleanWord;
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

    const due = filteredByDeck.filter((c) => Number(c.nextReviewDate || 0) <= now);

    // Önce öncelikli (yıldızlı) kartlar, ardından en eski tekrar tarihi
    due.sort((a, b) => {
      if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
      return (a.nextReviewDate || 0) - (b.nextReviewDate || 0);
    });

    if (due.length === 0 && includeAllIfEmpty) {
      return filteredByDeck;
    }
    return due;
  }

  /**
   * Leitner SRS Algoritması
   * - again (Tekrar Et): srsStage = 0, intervalDays = 1, nextReviewDate = +1 gün
   * - hard (Önemli): isPriority = true, nextReviewDate = +4 saat
   * - good (Öğrendim): srsStage (max 5), interval 1 -> 2 -> 4 -> 8 -> 16 gün
   */
  async applySRSReview(cardId, rating) {
    const allCards = await this.getAllCards();
    const card = allCards.find((c) => Number(c.id) === Number(cardId));
    if (!card) return null;

    const now = Date.now();
    const ONE_HOUR = 3600 * 1000;
    const ONE_DAY = 24 * ONE_HOUR;

    if (rating === 'again') {
      card.srsStage = 0;
      card.intervalDays = 1;
      card.nextReviewDate = now + ONE_DAY;
    } else if (rating === 'hard') {
      card.isPriority = true;
      card.intervalDays = 1;
      card.nextReviewDate = now + 12 * ONE_HOUR;
    } else if (rating === 'good') {
      const currentStage = Math.max(0, Math.min(5, Number(card.srsStage) || 0));
      const leitnerSchedule = [3, 7, 14, 30, 60];
      const nextDays = leitnerSchedule[Math.min(currentStage, leitnerSchedule.length - 1)];
      card.srsStage = Math.min(5, currentStage + 1);
      card.intervalDays = nextDays;
      card.nextReviewDate = now + nextDays * ONE_DAY;
    }

    await this.updateCard(card);
    await this.addStudyLog(card.id, rating);
    return card;
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
