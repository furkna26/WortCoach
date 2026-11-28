/**
 * WortMeisterDB — Native IndexedDB Asenkron DAO Sarmalayıcısı (v2)
 * ObjectStores: cards, decks, studyLogs, settings
 * v2 Optimizasyonları: germanWordLower indeksi, bellek içi okuma önbelleği,
 * tek-transaction addCardsBatch() ve tek-transaction deleteDeck().
 */

class WortMeisterDatabase {
  constructor() {
    this.dbName = 'WortMeisterDB';
    this.dbVersion = 2;
    this.db = null;
    this._cardsCache = null;
    this._cardsByWordMap = null;
    this._decksCache = null;
  }

  _invalidateCache(scope = 'all') {
    if (scope === 'all' || scope === 'cards') {
      this._cardsCache = null;
      this._cardsByWordMap = null;
    }
    if (scope === 'all' || scope === 'decks') {
      this._decksCache = null;
    }
  }

  _upsertCacheCard(card) {
    if (!card || !Array.isArray(this._cardsCache)) return;
    const idx = this._cardsCache.findIndex((c) => Number(c.id) === Number(card.id));
    if (idx !== -1) {
      const prevLower = (this._cardsCache[idx].germanWord || '').trim().toLowerCase();
      const nextLower = (card.germanWord || '').trim().toLowerCase();
      this._cardsCache[idx] = card;
      if (this._cardsByWordMap) {
        if (prevLower && prevLower !== nextLower && this._cardsByWordMap.get(prevLower)?.id === card.id) {
          this._cardsByWordMap.delete(prevLower);
        }
        if (nextLower) this._cardsByWordMap.set(nextLower, card);
      }
    } else {
      this._cardsCache.push(card);
      const nextLower = (card.germanWord || '').trim().toLowerCase();
      if (this._cardsByWordMap && nextLower && !this._cardsByWordMap.has(nextLower)) {
        this._cardsByWordMap.set(nextLower, card);
      }
    }
  }

  _removeCacheCard(cardId) {
    if (!Array.isArray(this._cardsCache)) return;
    const numId = Number(cardId);
    const removed = this._cardsCache.find((c) => Number(c.id) === numId);
    this._cardsCache = this._cardsCache.filter((c) => Number(c.id) !== numId);
    if (removed && this._cardsByWordMap) {
      const lower = (removed.germanWord || '').trim().toLowerCase();
      if (lower && this._cardsByWordMap.get(lower)?.id === removed.id) {
        const replacement = this._cardsCache.find((c) => (c.germanWord || '').trim().toLowerCase() === lower);
        if (replacement) {
          this._cardsByWordMap.set(lower, replacement);
        } else {
          this._cardsByWordMap.delete(lower);
        }
      }
    }
  }

  _buildCardRecord(cardData, resolvedDeckId, now) {
    const cleanWord = (cardData.germanWord || '').trim();
    const easeFactor = Number(cardData.easeFactor ?? 2.5);
    const interval = Number(cardData.interval ?? (cardData.intervalDays ?? 0));
    const repetitions = Number(cardData.repetitions ?? (cardData.srsStage ?? 0));
    const lapses = Number(cardData.lapses ?? 0);
    const dueDate = Number(cardData.dueDate ?? (cardData.nextReviewDate ?? now));

    const record = {
      deckId: resolvedDeckId,
      germanWord: cleanWord,
      germanWordLower: cleanWord.toLowerCase(),
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
      // Kullanıcı ölçüm & zorluk metrikleri
      hardCount: Number(cardData.hardCount ?? 0),
      goodCount: Number(cardData.goodCount ?? 0),
      easyCount: Number(cardData.easyCount ?? 0),
      gameWrongCount: Number(cardData.gameWrongCount ?? 0),
      gameCorrectCount: Number(cardData.gameCorrectCount ?? 0),
      lastRating: cardData.lastRating || null,
      lastReviewedAt: Number(cardData.lastReviewedAt ?? 0),
      isPriority: Boolean(cardData.isPriority),
      isQuizCard: Boolean(cardData.isQuizCard),
      createdAt: now
    };
    if (Array.isArray(cardData.customMeanings)) {
      record.customMeanings = cardData.customMeanings;
    }
    return record;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const tx = event.target.transaction;

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
          cardStore.createIndex('germanWordLower', 'germanWordLower', { unique: false });
        } else if (tx && typeof tx.objectStore === 'function') {
          const cardStore = tx.objectStore('cards');
          if (cardStore && cardStore.indexNames && !cardStore.indexNames.contains('germanWordLower')) {
            cardStore.createIndex('germanWordLower', 'germanWordLower', { unique: false });
          }
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
    if (!this._decksCache) {
      const store = await this._tx('decks', 'readonly');
      this._decksCache = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e.target.error);
      });
    }

    const cards = await this.getAllCards();
    const countMap = new Map();
    for (const c of cards) {
      const did = Number(c.deckId);
      countMap.set(did, (countMap.get(did) || 0) + 1);
    }

    return this._decksCache.map((d) => ({
      ...d,
      cardCount: countMap.get(Number(d.id)) || 0
    }));
  }

  async createDeck(name) {
    const store = await this._tx('decks', 'readwrite');
    const deck = {
      name: (name || '').trim() || 'Yeni Deste',
      createdAt: Date.now(),
      cardCount: 0
    };
    return new Promise((resolve, reject) => {
      const req = store.add(deck);
      req.onsuccess = () => {
        const created = { ...deck, id: req.result };
        if (Array.isArray(this._decksCache)) {
          this._decksCache.push(created);
        }
        resolve(created);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteDeck(deckId) {
    const numericId = Number(deckId);
    const allCards = await this.getAllCards();
    const targetCardIds = [];
    for (const c of allCards) {
      if (Number(c.deckId) === numericId && c.id !== undefined) {
        targetCardIds.push(c.id);
      }
    }

    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['cards', 'decks'], 'readwrite');
      const cardsStore = tx.objectStore('cards');
      const decksStore = tx.objectStore('decks');

      for (const cid of targetCardIds) {
        cardsStore.delete(cid);
      }
      decksStore.delete(numericId);

      tx.oncomplete = () => {
        this._invalidateCache('all');
        resolve(true);
      };
      tx.onerror = (e) => reject(e.target.error);
      tx.onabort = (e) => reject(e.target.error || new Error('Transaction aborted'));
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
        putReq.onsuccess = () => {
          this._invalidateCache('decks');
          resolve(deck);
        };
        putReq.onerror = (e) => reject(e.target.error);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  }

  // --- CARDS ---
  async getAllCards() {
    if (Array.isArray(this._cardsCache)) {
      return this._cardsCache.slice();
    }

    const store = await this._tx('cards', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const raw = req.result || [];
        const valid = [];
        const badIds = [];
        const toMigrate = [];
        const wordMap = new Map();
        const now = Date.now();

        for (const c of raw) {
          if (c && typeof c.germanWord === 'string' && c.germanWord.trim().length > 0) {
            const lower = c.germanWord.trim().toLowerCase();
            let needsSave = false;
            // SM-2 Geriye Dönük Otomatik Migrasyon
            if (c.easeFactor === undefined || c.interval === undefined || c.repetitions === undefined || c.dueDate === undefined) {
              c.easeFactor = Number(c.easeFactor ?? 2.5);
              c.interval = Number(c.interval ?? (c.intervalDays ?? 0));
              c.repetitions = Number(c.repetitions ?? (c.srsStage ?? 0));
              c.lapses = Number(c.lapses ?? 0);
              c.dueDate = Number(c.dueDate ?? (c.nextReviewDate ?? now));
              needsSave = true;
            }
            if (c.germanWordLower !== lower) {
              c.germanWordLower = lower;
              needsSave = true;
            }
            if (needsSave) {
              toMigrate.push(c);
            }
            valid.push(c);
            if (!wordMap.has(lower)) {
              wordMap.set(lower, c);
            }
          } else if (c && c.id) {
            badIds.push(c.id);
          }
        }

        this._cardsCache = valid;
        this._cardsByWordMap = wordMap;

        // Arka planda migrasyon ve temizlik
        if (badIds.length > 0 || toMigrate.length > 0) {
          this._tx('cards', 'readwrite').then((rw) => {
            badIds.forEach((id) => rw.delete(id));
            toMigrate.forEach((card) => rw.put(card));
          }).catch(() => {});
        }

        resolve(valid.slice());
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getCardByWord(word) {
    const normalized = (word || '').trim().toLowerCase();
    if (!normalized) return null;
    if (!this._cardsByWordMap) {
      await this.getAllCards();
    }
    return (this._cardsByWordMap && this._cardsByWordMap.get(normalized)) || null;
  }

  async findCardByGerman(word) {
    return this.getCardByWord(word);
  }

  _enrichVerbCardFields(cardData) {
    if (!cardData || cardData.isQuizCard) return cardData;
    const pos = String(cardData.partOfSpeech || '').toUpperCase();
    const cleanWord = (cardData.germanWord || '').trim();
    if (
      pos === 'VERB' &&
      cleanWord &&
      (!cardData.praesens || !cardData.praeteritum || !cardData.partizipZwei || !cardData.imperativ) &&
      typeof window !== 'undefined' &&
      window.GermanVerbHelper &&
      typeof window.GermanVerbHelper.conjugate === 'function'
    ) {
      const conj = window.GermanVerbHelper.conjugate(cleanWord);
      if (conj) {
        return {
          ...cardData,
          praesens: cardData.praesens || conj.praesens || '',
          praeteritum: cardData.praeteritum || conj.praeteritum || '',
          partizipZwei: cardData.partizipZwei || conj.partizipZwei || '',
          hilfsverb: cardData.hilfsverb || conj.hilfsverb || '',
          imperativ: cardData.imperativ || conj.imperativ || '',
          isSeparable: Boolean(cardData.isSeparable || conj.isSeparable),
          separablePrefix: cardData.separablePrefix || conj.separablePrefix || '',
          regularity: cardData.regularity || conj.regularity || '',
          isReflexive: Boolean(cardData.isReflexive || conj.isReflexive),
          reflexiveType: cardData.reflexiveType || conj.reflexiveType || null
        };
      }
    }
    return cardData;
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

    const preparedData = this._enrichVerbCardFields(cardData);
    const rawDeckId = preparedData.deckId && typeof preparedData.deckId === 'object' ? preparedData.deckId.id : preparedData.deckId;
    const resolvedDeckId = Number(rawDeckId) || 1;

    // Üst üste binmeyi ve mükerrer kart kaydını O(1) önbellek üzerinden engelle
    const existing = await this.getCardByWord(cleanWord);
    if (existing) {
      const merged = { ...existing, ...preparedData };
      for (const k of ['article', 'pluralForm', 'exampleSentence', 'meaningsEn', 'praesens', 'praeteritum', 'partizipZwei', 'hilfsverb', 'imperativ', 'separablePrefix', 'regularity', 'reflexiveType']) {
        if (!merged[k] && existing[k]) merged[k] = existing[k];
      }
      merged.deckId = resolvedDeckId;
      merged.germanWord = cleanWord;
      merged.germanWordLower = cleanWord.toLowerCase();
      merged.id = existing.id;
      merged.updatedAt = Date.now();
      return this.updateCard(merged);
    }

    const store = await this._tx('cards', 'readwrite');
    const now = Date.now();
    const record = this._buildCardRecord(preparedData, resolvedDeckId, now);

    return new Promise((resolve, reject) => {
      const req = store.add(record);
      req.onsuccess = () => {
        const saved = { ...record, id: req.result };
        this._upsertCacheCard(saved);
        resolve(saved);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async createCard(cardData) {
    return this.addCard(cardData);
  }

  async addCardsBatch(cardsArray) {
    if (!Array.isArray(cardsArray) || cardsArray.length === 0) return [];
    if (!this._cardsByWordMap) {
      await this.getAllCards();
    }

    await this.init();
    const now = Date.now();
    const wordMap = this._cardsByWordMap || new Map();
    const pendingOps = [];
    const seenInBatch = new Map();

    for (let i = 0; i < cardsArray.length; i++) {
      const item = cardsArray[i];
      if (!item || typeof item !== 'object') continue;
      const cleanWord = (item.germanWord || '').trim();
      if (!cleanWord) continue;

      const lower = cleanWord.toLowerCase();
      const rawDeckId = item.deckId && typeof item.deckId === 'object' ? item.deckId.id : item.deckId;
      const resolvedDeckId = Number(rawDeckId) || 1;

      const existing = wordMap.get(lower);
      if (existing) {
        const merged = {
          ...existing,
          ...item,
          deckId: resolvedDeckId,
          germanWord: cleanWord,
          germanWordLower: lower,
          id: existing.id,
          updatedAt: now
        };
        pendingOps.push({ type: 'put', record: merged });
      } else if (seenInBatch.has(lower)) {
        const prev = seenInBatch.get(lower);
        Object.assign(prev.record, this._buildCardRecord(item, resolvedDeckId, now));
      } else {
        const record = this._buildCardRecord(item, resolvedDeckId, now + i);
        const op = { type: 'add', record };
        seenInBatch.set(lower, op);
        pendingOps.push(op);
      }
    }

    if (pendingOps.length === 0) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('cards', 'readwrite');
      const store = tx.objectStore('cards');
      const results = [];

      for (const op of pendingOps) {
        if (op.type === 'put') {
          const req = store.put(op.record);
          req.onsuccess = () => results.push(op.record);
        } else {
          const req = store.add(op.record);
          req.onsuccess = () => results.push({ ...op.record, id: req.result });
        }
      }

      tx.oncomplete = () => {
        this._invalidateCache('cards');
        resolve(results);
      };
      tx.onerror = (e) => reject(e.target.error);
      tx.onabort = (e) => reject(e.target.error || new Error('Batch transaction aborted'));
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
    card.germanWordLower = cleanWord.toLowerCase();

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
      req.onsuccess = () => {
        this._upsertCacheCard(card);
        resolve(card);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteCard(cardId) {
    const store = await this._tx('cards', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(Number(cardId));
      req.onsuccess = () => {
        this._removeCacheCard(cardId);
        resolve(true);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async togglePriority(cardId) {
    const cards = await this.getAllCards();
    const target = cards.find((c) => Number(c.id) === Number(cardId));
    if (!target) return null;
    const updated = { ...target, isPriority: !target.isPriority };
    await this.updateCard(updated);
    return updated;
  }

  _shuffle(arr) {
    const out = Array.isArray(arr) ? arr.slice() : [];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  getCardMasteryProfile(card) {
    const c = card || {};
    const lapses = Number(c.lapses ?? 0);
    const hardCount = Number(c.hardCount ?? 0);
    const goodCount = Number(c.goodCount ?? 0);
    const easyCount = Number(c.easyCount ?? 0);
    const gameWrong = Number(c.gameWrongCount ?? 0);
    const gameCorrect = Number(c.gameCorrectCount ?? 0);
    const ef = Number(c.easeFactor ?? 2.5);
    const reps = Number(c.repetitions ?? (c.srsStage ?? 0));
    const interval = Number(c.interval ?? (c.intervalDays ?? 0));
    const lastRating = c.lastRating || null;

    const isMastered =
      lastRating === 'easy' ||
      (lastRating === 'good' && reps >= 1) ||
      (!lastRating && reps >= 2 && interval >= 3 && lapses === 0);

    const isStruggling =
      !isMastered &&
      (lastRating === 'again' ||
        lastRating === 'hard' ||
        lapses >= 1 ||
        hardCount >= 1 ||
        gameWrong >= 1 ||
        ef < 2.3);

    const tier = isMastered ? 'mastered' : (isStruggling ? 'struggling' : 'learning');
    const difficultyScore = isMastered
      ? 0
      : Math.min(
          100,
          lapses * 30 +
            hardCount * 16 +
            gameWrong * 18 +
            Math.max(0, Math.round((2.5 - ef) * 40)) +
            (lastRating === 'again' ? 20 : lastRating === 'hard' ? 10 : 0)
        );

    return {
      tier,
      difficultyScore,
      lapses,
      hardCount,
      goodCount,
      easyCount,
      gameWrong,
      gameCorrect,
      lastRating
    };
  }

  async getDueCards(deckId = 'all', includeAllIfEmpty = false, options = {}) {
    const now = Date.now();
    const allCards = await this.getAllCards();
    const filteredByDeck =
      deckId === 'all'
        ? allCards
        : allCards.filter((c) => Number(c.deckId) === Number(deckId));

    const filterMode = (options && options.filterMode) || 'smart';
    let candidates = [];

    if (filterMode === 'struggling_only') {
      candidates = filteredByDeck.filter((c) => this.getCardMasteryProfile(c).tier === 'struggling');
    } else if (filterMode === 'hide_mastered') {
      const nonMastered = filteredByDeck.filter((c) => this.getCardMasteryProfile(c).tier !== 'mastered');
      if (includeAllIfEmpty) {
        candidates = nonMastered;
      } else {
        candidates = nonMastered.filter((c) => Number(c.dueDate ?? (c.nextReviewDate ?? 0)) <= now);
      }
    } else {
      if (includeAllIfEmpty) {
        candidates = filteredByDeck;
      } else {
        candidates = filteredByDeck.filter((c) => {
          const dueTime = Number(c.dueDate ?? (c.nextReviewDate ?? 0));
          return dueTime <= now;
        });
      }
    }

    // Zorlanan/yıldızlı kartlar başta (karışık), yeni/öğreniliyor ortada (karışık), İyi/Kolay en sonda (karışık)
    const tier1 = [];
    const tier2 = [];
    const tier3 = [];

    for (const c of candidates) {
      const prof = this.getCardMasteryProfile(c);
      if (prof.tier === 'mastered' && !c.isPriority) {
        tier3.push(c);
      } else if (prof.tier === 'struggling' || c.isPriority) {
        tier1.push(c);
      } else {
        tier2.push(c);
      }
    }

    return [...this._shuffle(tier1), ...this._shuffle(tier2), ...this._shuffle(tier3)];
  }

  async recordGameResult(cardId, isCorrect) {
    if (!cardId || Number(cardId) >= 800000) return null;
    const allCards = await this.getAllCards();
    const found = allCards.find((c) => Number(c.id) === Number(cardId));
    if (!found) return null;

    const card = { ...found };
    const now = Date.now();
    if (isCorrect) {
      card.gameCorrectCount = Number(card.gameCorrectCount ?? 0) + 1;
    } else {
      card.gameWrongCount = Number(card.gameWrongCount ?? 0) + 1;
      card.easeFactor = Math.max(1.3, Math.round((Number(card.easeFactor ?? 2.5) - 0.1) * 100) / 100);
      const pulledDue = Math.min(Number(card.dueDate ?? now), now);
      card.dueDate = pulledDue;
      card.nextReviewDate = pulledDue;
      if (card.lastRating === 'easy' || card.lastRating === 'good') {
        card.lastRating = 'hard';
      }
    }
    card.lastReviewedAt = now;
    return this.updateCard(card);
  }

  async getMasterySummary(deckId = 'all') {
    const allCards = await this.getAllCards();
    const scoped =
      deckId === 'all'
        ? allCards
        : allCards.filter((c) => Number(c.deckId) === Number(deckId));

    let strugglingCount = 0;
    let learningCount = 0;
    let masteredCount = 0;
    const bestByWord = new Map();

    for (const c of scoped) {
      const prof = this.getCardMasteryProfile(c);
      if (prof.tier === 'mastered') {
        masteredCount++;
      } else if (prof.tier === 'struggling') {
        strugglingCount++;
        const wordKey = (c.germanWordLower || (c.germanWord || '').trim().toLowerCase());
        if (wordKey) {
          const enriched = { ...c, _mastery: prof };
          const prev = bestByWord.get(wordKey);
          if (!prev || enriched._mastery.difficultyScore > prev._mastery.difficultyScore) {
            bestByWord.set(wordKey, enriched);
          }
        }
      } else {
        learningCount++;
      }
    }

    const strugglingCards = Array.from(bestByWord.values()).sort(
      (a, b) => b._mastery.difficultyScore - a._mastery.difficultyScore
    );
    const total = scoped.length;
    const masteryPct = total > 0 ? Math.round((masteredCount / total) * 100) : 0;

    return {
      total,
      strugglingCount,
      learningCount,
      masteredCount,
      masteryPct,
      strugglingCards
    };
  }

  async createStrugglingDeck(deckName = 'Zorlanan Kelimeler', cardIds = null) {
    const allCards = await this.getAllCards();
    let selectedCards = [];

    if (Array.isArray(cardIds) && cardIds.length > 0) {
      const idSet = new Set(cardIds.map((id) => Number(id)));
      selectedCards = allCards.filter(
        (c) => idSet.has(Number(c.id)) && this.getCardMasteryProfile(c).tier !== 'mastered'
      );
    } else {
      const summary = await this.getMasterySummary('all');
      selectedCards = summary.strugglingCards;
    }

    if (!selectedCards || selectedCards.length === 0) {
      throw new Error('Zorlanan kelime bulunamadı.');
    }

    const cleanName = (deckName || '').trim() || 'Zorlanan Kelimeler';
    const newDeck = await this.createDeck(cleanName);
    const now = Date.now();

    await this.init();
    const addedCount = await new Promise((resolve, reject) => {
      const tx = this.db.transaction('cards', 'readwrite');
      const store = tx.objectStore('cards');
      const seenWords = new Set();
      let inserted = 0;

      for (let i = 0; i < selectedCards.length; i++) {
        const orig = selectedCards[i];
        const wordKey = (orig.germanWord || '').trim().toLowerCase();
        if (!wordKey || seenWords.has(wordKey)) continue;
        seenWords.add(wordKey);

        const clone = { ...orig };
        delete clone.id;
        delete clone._mastery;
        clone.deckId = Number(newDeck.id);
        clone.sourceCardId = Number(orig.id) || null;
        clone.dueDate = now;
        clone.nextReviewDate = now;
        clone.createdAt = now + i;
        clone.germanWordLower = wordKey;
        store.add(clone);
        inserted++;
      }

      tx.oncomplete = () => {
        this._invalidateCache('cards');
        resolve(inserted);
      };
      tx.onerror = (e) => reject(e.target.error);
      tx.onabort = (e) => reject(e.target.error || new Error('Struggling deck transaction aborted'));
    });

    return { deck: newDeck, addedCount };
  }

  /**
   * 4'lü SM-2 Aralıklı Tekrar Algoritması (Geriye Dönük Uyumlu)
   */
  async applySM2Review(cardId, rating) {
    const allCards = await this.getAllCards();
    const found = allCards.find((c) => Number(c.id) === Number(cardId));
    if (!found) return null;
    const card = { ...found };

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
    let hardCount = Number(card.hardCount ?? 0);
    let goodCount = Number(card.goodCount ?? 0);
    let easyCount = Number(card.easyCount ?? 0);

    const now = Date.now();
    const TEN_MINUTES = 10 * 60 * 1000;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    let dueDate = now;

    if (r === 0) {
      repetitions = 0;
      lapses += 1;
      interval = 0;
      easeFactor = Math.max(1.3, easeFactor - 0.20);
      dueDate = now + TEN_MINUTES;
    } else if (r === 1) {
      hardCount += 1;
      interval = repetitions === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
      easeFactor = Math.max(1.3, easeFactor - 0.15);
      repetitions += 1;
      dueDate = now + interval * ONE_DAY;
    } else if (r === 2) {
      goodCount += 1;
      const hardDays = repetitions === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
      interval = repetitions === 0 ? 3 : Math.max(hardDays + 1, Math.round(interval * easeFactor));
      repetitions += 1;
      dueDate = now + interval * ONE_DAY;
    } else if (r === 3) {
      easyCount += 1;
      const goodDays = repetitions === 0 ? 3 : Math.round(interval * easeFactor);
      interval = repetitions === 0 ? 8 : Math.max(goodDays + 2, Math.round(interval * easeFactor * 1.35));
      easeFactor += 0.15;
      repetitions += 1;
      dueDate = now + interval * ONE_DAY;
    }

    easeFactor = Math.round(easeFactor * 100) / 100;

    card.easeFactor = easeFactor;
    card.interval = interval;
    card.repetitions = repetitions;
    card.lapses = lapses;
    card.hardCount = hardCount;
    card.goodCount = goodCount;
    card.easyCount = easyCount;
    card.lastRating = ['again', 'hard', 'good', 'easy'][r] || 'good';
    card.lastReviewedAt = now;
    card.dueDate = dueDate;

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

  async exportFullBackup() {
    const [decks, cards, studyLogs] = await Promise.all([
      this.getAllDecks(),
      this.getAllCards(),
      this.getAllStudyLogs()
    ]);
    return {
      format: 'wortcoach-full-backup',
      version: '3.11.0',
      exportedAt: new Date().toISOString(),
      decks,
      cards,
      studyLogs
    };
  }

  async importFullBackup(backupData, { mode = 'merge' } = {}) {
    if (!backupData || backupData.format !== 'wortcoach-full-backup' || !Array.isArray(backupData.decks) || !Array.isArray(backupData.cards)) {
      throw new Error('Geçersiz WortCoach yedek dosyası.');
    }

    const existingDecks = await this.getAllDecks();
    const deckNameToId = new Map();
    for (const d of existingDecks) {
      const key = (d.name || d.title || '').trim().toLowerCase();
      if (key && !deckNameToId.has(key)) deckNameToId.set(key, Number(d.id));
    }

    const deckIdMap = new Map();
    let decksAdded = 0;
    for (const d of backupData.decks) {
      if (!d || typeof d !== 'object') continue;
      const dName = (d.name || d.title || 'Yedek Deste').trim() || 'Yedek Deste';
      const key = dName.toLowerCase();
      let mappedId = deckNameToId.get(key);
      if (!mappedId) {
        const created = await this.createDeck(dName);
        mappedId = Number(created.id);
        deckNameToId.set(key, mappedId);
        decksAdded++;
      }
      if (d.id !== undefined) deckIdMap.set(Number(d.id), mappedId);
    }

    const fallbackDeckId = existingDecks[0] ? Number(existingDecks[0].id) : (deckNameToId.values().next().value || 1);
    const existingCards = await this.getAllCards();
    const seenCardKeys = new Set();
    for (const c of existingCards) {
      const wKey = `${Number(c.deckId) || 1}::${(c.germanWord || '').trim().toLowerCase()}`;
      seenCardKeys.add(wKey);
    }

    const toInsert = [];
    let cardsSkipped = 0;
    for (const c of backupData.cards) {
      if (!c || typeof c !== 'object') continue;
      const cleanWord = (c.germanWord || '').trim();
      if (!cleanWord) continue;
      const mappedDeckId = deckIdMap.get(Number(c.deckId)) || fallbackDeckId;
      const wKey = `${mappedDeckId}::${cleanWord.toLowerCase()}`;
      if (mode === 'merge' && seenCardKeys.has(wKey)) {
        cardsSkipped++;
        continue;
      }
      seenCardKeys.add(wKey);
      const clone = { ...c, deckId: mappedDeckId };
      delete clone.id;
      toInsert.push(clone);
    }

    if (toInsert.length > 0) {
      await this.addCardsBatch(toInsert);
    }

    let logsAdded = 0;
    if (Array.isArray(backupData.studyLogs) && backupData.studyLogs.length > 0) {
      const existingLogs = await this.getAllStudyLogs();
      const existingLogKeys = new Set(existingLogs.map((l) => `${l.reviewedAt || 0}::${l.rating || ''}`));
      const logsToAdd = [];
      for (const l of backupData.studyLogs.slice(0, 5000)) {
        if (!l || typeof l !== 'object') continue;
        const revAt = Number(l.reviewedAt) || 0;
        const rat = String(l.rating || '');
        const lk = `${revAt}::${rat}`;
        if (!existingLogKeys.has(lk)) {
          existingLogKeys.add(lk);
          logsToAdd.push({
            cardId: Number(l.cardId) || 0,
            rating: rat,
            reviewedAt: revAt || Date.now()
          });
        }
      }
      if (logsToAdd.length > 0) {
        await this.init();
        await new Promise((resolve, reject) => {
          const tx = this.db.transaction('studyLogs', 'readwrite');
          const store = tx.objectStore('studyLogs');
          for (const rec of logsToAdd) {
            store.add(rec);
          }
          tx.oncomplete = () => {
            logsAdded = logsToAdd.length;
            resolve();
          };
          tx.onerror = (e) => reject(e.target.error);
          tx.onabort = (e) => reject(e.target.error || new Error('StudyLogs transaction aborted'));
        });
      }
    }

    return { decksAdded, cardsAdded: toInsert.length, cardsSkipped, logsAdded };
  }
}

window.wmDB = new WortMeisterDatabase();

// getAllDecks çıktısında hem name hem title alanını garanti et ve değişikliklerde otomatik bulut senkronizasyonunu tetikle
const _origGetAllDecks = window.wmDB.getAllDecks.bind(window.wmDB);
window.wmDB.getAllDecks = async () => {
  const list = await _origGetAllDecks();
  return list.map((d) => {
    const label = d.name || d.title || 'Genel Deste';
    return { ...d, name: label, title: label };
  });
};

['createDeck', 'deleteDeck', 'updateDeck', 'addCard', 'addCardsBatch', 'updateCard', 'deleteCard'].forEach((fn) => {
  if (typeof window.wmDB[fn] === 'function') {
    const orig = window.wmDB[fn].bind(window.wmDB);
    window.wmDB[fn] = async (...args) => {
      const res = await orig(...args);
      if (window.wmSocial && typeof window.wmSocial.scheduleAutoSync === 'function') {
        window.wmSocial.scheduleAutoSync();
      }
      return res;
    };
  }
});

// Geriye dönük uyumluluk ve harici/sosyal modül DAO adaptörleri (decks & cards)
window.wmDB.decks = {
  getAll: async () => window.wmDB.getAllDecks(),
  get: async (id) => {
    const all = await window.wmDB.getAllDecks();
    return all.find((d) => Number(d.id) === Number(id)) || null;
  },
  add: async (d) => window.wmDB.createDeck(d.name || d.title || 'Yeni Deste')
};

window.wmDB.cards = {
  getAll: async () => window.wmDB.getAllCards(),
  getByDeck: async (deckId) => {
    const all = await window.wmDB.getAllCards();
    return all.filter((c) => Number(c.deckId) === Number(deckId));
  },
  add: async (c) => {
    return window.wmDB.addCard({
      deckId: c.deckId,
      germanWord: c.lemma || c.front || c.germanWord || '',
      meaningsTr: c.contextMeaning || c.back || c.meaningsTr || '',
      partOfSpeech: c.pos || c.partOfSpeech || 'OTHER',
      exampleSentence: c.sourceSentence || c.example || c.exampleSentence || ''
    });
  }
};
