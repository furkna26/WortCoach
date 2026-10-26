/**
 * WortCoach — Kelime Oyunları & Testler Motoru (GameService v2.8.8)
 * 7 Güçlü Oyun Modu:
 * 1. ARTICLE (Artikel Testi - der · die · das)
 * 2. VERB (Fiil Testi - Partizip II & Zamanlar)
 * 3. NOUN (İsim Testi - Çoğullar & Anlam)
 * 4. ADJECTIVE (Sıfat Testi - Komparativ & Sıfatlar)
 * 5. PHRASE (Kalıp Testi - Deyimler & Kalıplar)
 * 6. REFLEXIV_TRENNBAR (Ayrılabilen / Dönüşlü / Beide Fiil Testi)
 * 7. MIXED (Karma Test - Tüm Konular)
 * + CABLE_MATCH (Kablo ile Anlam Eşleştirme)
 * + Zamanla Yarış (Timer Mode) & Puanlama / Combo Sistemi
 */

class WordGameService {
  constructor() {
    this.currentGameType = null;
    this.questions = [];
    this.currentIndex = 0;
    this.score = { correct: 0, wrong: 0, streak: 0, maxStreak: 0, points: 0 };
    this.durationSeconds = 0; // 0: Süresiz, 30, 60, 120, 180
    this.remainingSeconds = 0;
    this.isAnswerRevealed = false;
    this.selectedOptionIndex = null;
    this.questionStartTime = Date.now();
    this.poolCards = [];
  }

  setDuration(seconds = 0) {
    this.durationSeconds = Number(seconds) || 0;
    this.remainingSeconds = this.durationSeconds;
  }

  async initPool(selectedDeckIds = null) {
    let userCards = [];
    try {
      if (typeof window !== 'undefined' && window.wmDB) {
        userCards = await window.wmDB.getAllCards();
      }
    } catch (_) {}

    // Kullanıcı bir veya birden fazla deste seçtiyse filtrele
    const isFiltered = Array.isArray(selectedDeckIds) && selectedDeckIds.length > 0 && !selectedDeckIds.includes('all');
    if (isFiltered) {
      const numIds = selectedDeckIds.map(Number);
      userCards = userCards.filter((c) => numIds.includes(Number(c.deckId)));
    }

    // Küratörlü hazır destelerden kelime havuzunu zenginleştir
    const curatedCards = [];
    if (typeof window !== 'undefined' && Array.isArray(window.CURATED_CEFR_PACKS)) {
      window.CURATED_CEFR_PACKS.forEach((pack, pIdx) => {
        if (Array.isArray(pack.cards)) {
          pack.cards.forEach((c, cIdx) => {
            curatedCards.push({
              ...c,
              id: 950000 + (pIdx * 100) + cIdx
            });
          });
        }
      });
    }

    const dictSource = (typeof window !== 'undefined' && (window.VERIFIED_CORE_VOCABULARY || window.OFFLINE_DICTIONARY)) || {};
    const dictCards = Object.values(dictSource).map((item, idx) => ({
      id: 800000 + idx,
      germanWord: item.germanWord,
      partOfSpeech: item.partOfSpeech || 'OTHER',
      article: item.partOfSpeech === 'NOUN' ? (item.article || (typeof window !== 'undefined' && window.GermanNounHelper ? window.GermanNounHelper.analyze(item.germanWord).article : '')) : '',
      pluralForm: item.pluralForm || '',
      meaningsTr: item.meaningsTr || '',
      meaningsEn: item.meaningsEn || '',
      exampleSentence: Array.isArray(item.examples) ? item.examples[0] : (item.exampleSentence || ''),
      praesens: item.praesens || '',
      praeteritum: item.praeteritum || '',
      partizipZwei: item.partizipZwei || '',
      hilfsverb: item.hilfsverb || 'hat',
      isSeparable: Boolean(item.isSeparable),
      isReflexive: Boolean(item.isReflexive)
    }));

    const seen = new Set();
    const combined = [];

    // 1. Kullanıcı kartlarını öncelikli ekle
    for (const c of userCards) {
      const key = (c.germanWord || '').trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        combined.push(c);
      }
    }

    // 2. Deste filtrelenmemişse veya kullanıcı kartı azsa hazır küratörlü ve sözlük kartlarını da ekle
    if (!isFiltered || combined.length < 10) {
      for (const c of [...curatedCards, ...dictCards]) {
        const key = (c.germanWord || '').trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          combined.push(c);
        }
      }
    }

    this.poolCards = combined;
    return this.poolCards;
  }

  // --- KABLO İLE ANLAM EŞLEŞTİRME OYUNU TUR ÜRETİCİSİ ---
  generateCableMatchRound(count = 5) {
    const eligible = this.poolCards.filter((c) => {
      const hasMeaning = Boolean((c.meaningsTr || c.meaningsEn || '').trim());
      return c.germanWord && hasMeaning;
    });

    const shuffled = [...eligible].sort(() => 0.5 - Math.random()).slice(0, count);

    // Sol Sütun: Almanca Kelimeler (Normatif Artikellerle)
    const leftItems = shuffled.map((c, idx) => {
      const isNoun = (c.partOfSpeech || '').toUpperCase() === 'NOUN';
      const cleanW = (c.germanWord || '').replace(/^(der|die|das)\s+/i, '').trim();
      const display = isNoun && c.article
        ? `${c.article} ${cleanW.charAt(0).toUpperCase() + cleanW.slice(1)}`
        : c.germanWord;
      const rawTr = (c.meaningsTr || c.meaningsEn || '').split(/[,;\n]/)[0].trim();
      return {
        id: `left-${idx}`,
        cardId: c.id || idx,
        germanWord: c.germanWord,
        display,
        meaningTr: rawTr
      };
    });

    // Sağ Sütun: Türkçe Anlamlar (Karıştırılmış)
    const rightItems = [...leftItems]
      .sort(() => 0.5 - Math.random())
      .map((item, idx) => ({
        id: `right-${idx}`,
        cardId: item.cardId,
        display: item.meaningTr
      }));

    const wireColors = [
      '#EC4899', // 1. Neon Pembe
      '#38BDF8', // 2. Elektrik Gökyüzü Mavisi
      '#10B981', // 3. Canlı Zümrüt Yeşili
      '#F59E0B', // 4. Sıcak Amber Altın
      '#A855F7'  // 5. Büyülü Menekşe Moru
    ];

    return {
      leftItems,
      rightItems,
      wireColors,
      totalPairs: leftItems.length
    };
  }

  /**
   * KESİN TÜR FİLTRELEMESİ:
   * Kullanıcının isteği: Bir oyunda asla o türe ait olmayan kartlar sorulamaz.
   * Örneğin Artikel testinde sadece İSİMLER (der/die/das),
   * Fiil testinde sadece FİİLLER,
   * Ayrılabilen & Dönüşlü testinde sadece FİİLLER sorulur.
   */
  filterEligibleCards(gameType) {
    const cards = this.poolCards;
    switch (gameType) {
      case 'ARTICLE':
        return cards.filter((c) => {
          const isNoun = (c.partOfSpeech || '').toUpperCase() === 'NOUN';
          const art = (c.article || '').trim().toLowerCase();
          return isNoun && ['der', 'die', 'das'].includes(art);
        });

      case 'VERB':
        return cards.filter((c) => {
          const isVerb = (c.partOfSpeech || '').toUpperCase() === 'VERB';
          return isVerb || Boolean(c.partizipZwei) || Boolean(c.praeteritum);
        });

      case 'NOUN':
        return cards.filter((c) => {
          return (c.partOfSpeech || '').toUpperCase() === 'NOUN';
        });

      case 'ADJECTIVE':
        return cards.filter((c) => {
          const pos = (c.partOfSpeech || '').toUpperCase();
          return pos === 'ADJECTIVE' || pos === 'ADJ';
        });

      case 'PHRASE':
        return cards.filter((c) => {
          const pos = (c.partOfSpeech || '').toUpperCase();
          const hasSpace = (c.germanWord || '').trim().includes(' ');
          return pos === 'PHRASE' || pos === 'OTHER' || hasSpace;
        });

      case 'REFLEXIV_TRENNBAR':
        return cards.filter((c) => {
          const isVerb = (c.partOfSpeech || '').toUpperCase() === 'VERB';
          return isVerb || Boolean(c.partizipZwei);
        });

      case 'MIXED':
      default:
        return cards.filter((c) => Boolean(c.meaningsTr || c.meaningsEn));
    }
  }

  startNewGame(gameType, maxQuestions = 15) {
    this.currentGameType = gameType;
    this.score = { correct: 0, wrong: 0, streak: 0, maxStreak: 0, points: 0 };
    this.currentIndex = 0;
    this.isAnswerRevealed = false;
    this.selectedOptionIndex = null;
    this.questionStartTime = Date.now();
    this.remainingSeconds = this.durationSeconds;

    let eligible = this.filterEligibleCards(gameType);

    // Güvenlik Kalkanı: Eğer seçili destede bu türe ait yeterli kart yoksa,
    // ASLA yanlış türden kart sorma! Küratörlü kütüphaneden sadece o türe uygun kartları tamamla.
    if (eligible.length < 5) {
      const allSources = [];
      if (typeof window !== 'undefined' && Array.isArray(window.CURATED_CEFR_PACKS)) {
        window.CURATED_CEFR_PACKS.forEach((p) => {
          if (Array.isArray(p.cards)) allSources.push(...p.cards);
        });
      }
      const extraMatching = allSources.filter((c) => {
        if (gameType === 'ARTICLE') {
          return (c.partOfSpeech || '').toUpperCase() === 'NOUN' && ['der', 'die', 'das'].includes((c.article || '').toLowerCase());
        }
        if (gameType === 'VERB' || gameType === 'REFLEXIV_TRENNBAR') {
          return (c.partOfSpeech || '').toUpperCase() === 'VERB';
        }
        if (gameType === 'NOUN') {
          return (c.partOfSpeech || '').toUpperCase() === 'NOUN';
        }
        if (gameType === 'ADJECTIVE') {
          const pos = (c.partOfSpeech || '').toUpperCase();
          return pos === 'ADJECTIVE' || pos === 'ADJ';
        }
        if (gameType === 'PHRASE') {
          return (c.partOfSpeech || '').toUpperCase() === 'PHRASE' || (c.germanWord || '').includes(' ');
        }
        return Boolean(c.meaningsTr);
      });

      const seen = new Set(eligible.map((c) => (c.germanWord || '').toLowerCase()));
      for (const extra of extraMatching) {
        const k = (extra.germanWord || '').toLowerCase();
        if (k && !seen.has(k)) {
          seen.add(k);
          eligible.push(extra);
          if (eligible.length >= 20) break;
        }
      }
    }

    this.questions = this.generateQuestions(eligible, gameType, maxQuestions);
    return this.questions;
  }

  generateQuestions(eligibleCards, gameType, maxQuestions = 15) {
    const shuffled = [...eligibleCards].sort(() => 0.5 - Math.random()).slice(0, maxQuestions);
    const questions = [];

    for (const card of shuffled) {
      let q = null;
      switch (gameType) {
        case 'ARTICLE':
          q = this.generateArticleQuestion(card);
          break;
        case 'VERB':
          q = this.generateVerbQuestion(card);
          break;
        case 'NOUN':
          q = this.generateNounQuestion(card);
          break;
        case 'ADJECTIVE':
          q = this.generateMeaningQuestion(card, 'Bu sıfatın Türkçe karşılığı nedir?');
          break;
        case 'PHRASE':
          q = this.generatePhraseQuestion(card);
          break;
        case 'REFLEXIV_TRENNBAR':
          q = this.generateReflexivTrennbarQuestion(card);
          break;
        case 'MIXED':
        default:
          q = this.generateMixedQuestion(card);
          break;
      }
      if (q) questions.push(q);
    }

    return questions;
  }

  generateArticleQuestion(card) {
    const cleanWord = (card.germanWord || '')
      .replace(/^(der|die|das)\s+/i, '')
      .trim();
    const capWord = cleanWord ? cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1) : cleanWord;
    const correctArticle = (card.article || 'das').trim().toLowerCase();
    const options = ['der', 'die', 'das'];
    const correctIndex = options.indexOf(correctArticle);

    const pluralInfo = card.pluralForm ? ` • Çoğul: ${card.pluralForm}` : '';
    const explanation = `${correctArticle} ${capWord}${pluralInfo}`;

    return {
      card,
      prompt: 'Doğru artikli seçin',
      subject: capWord,
      subprompt: card.meaningsTr || card.meaningsEn || '',
      options,
      correctIndex: correctIndex >= 0 ? correctIndex : 2,
      explanation,
      audioWord: `${correctArticle} ${capWord}`
    };
  }

  generateVerbQuestion(card) {
    // 1. Partizip II sorusu
    if (card.partizipZwei) {
      const correctPartizip = `${card.hilfsverb || 'hat'} ${card.partizipZwei}`.trim();
      const allOtherPartizips = this.poolCards
        .filter((c) => c.id !== card.id && c.partizipZwei)
        .map((c) => `${c.hilfsverb || 'hat'} ${c.partizipZwei}`.trim())
        .filter((p) => p !== correctPartizip);

      const uniqueOthers = [...new Set(allOtherPartizips)].sort(() => 0.5 - Math.random()).slice(0, 3);
      if (uniqueOthers.length >= 2) {
        const options = [...uniqueOthers, correctPartizip].sort(() => 0.5 - Math.random());
        return {
          card,
          prompt: 'Bu fiilin Partizip II (Perfekt) hali nedir?',
          subject: card.germanWord,
          subprompt: card.meaningsTr || card.meaningsEn || '',
          options,
          correctIndex: options.indexOf(correctPartizip),
          explanation: `Perfekt: ${correctPartizip}${card.praeteritum ? ` • Präteritum: ${card.praeteritum}` : ''}`,
          audioWord: card.germanWord
        };
      }
    }

    // 2. Anlam sorusu
    return this.generateMeaningQuestion(card, 'Bu fiilin Türkçe karşılığı nedir?');
  }

  /**
   * YENİ OYUN: REFLEXIV ODER TRENNBAR ODER BEIDE ODER REGULÄR
   * Almanca fiilin ayrılabilen, dönüşlü (sich), her ikisi birden veya normal/ayrılamayan olup olmadığını sorgular.
   */
  generateReflexivTrennbarQuestion(card) {
    const raw = (card.germanWord || '').trim();
    const cleanWord = raw.replace(/^sich\s+/i, '').trim();

    // 1. Dönüşlülük (Reflexiv) Tespiti
    const isReflexive = raw.toLowerCase().startsWith('sich ') ||
      raw.toLowerCase().includes(' sich') ||
      Boolean(card.isReflexive) ||
      (typeof window !== 'undefined' && window.GermanVerbHelper && window.GermanVerbHelper.detectReflexive(raw).isReflexive);

    // 2. Ayrılabilirlik (Trennbar) Tespiti
    let isSeparable = Boolean(card.isSeparable);
    if (!isSeparable && typeof window !== 'undefined' && window.GermanVerbHelper) {
      const splitInfo = window.GermanVerbHelper.splitVerbPrefix(cleanWord);
      isSeparable = Boolean(splitInfo.isSeparable);
    }
    // Bilinen ayrılabilen ön ekler kuralı
    if (!isSeparable) {
      const sepPrefixes = ['ab', 'an', 'auf', 'aus', 'ein', 'mit', 'vor', 'zu', 'nach', 'fern', 'teil', 'statt', 'um', 'zurück', 'weg', 'her', 'hin'];
      const low = cleanWord.toLowerCase();
      for (const p of sepPrefixes) {
        if (low.startsWith(p) && low.length > p.length + 2) {
          isSeparable = true;
          break;
        }
      }
    }

    // 4 Seçenek:
    // 0: Trennbar (Ayrılabilen)
    // 1: Reflexiv (Dönüşlü - sich)
    // 2: Beide (Ayrılabilen & Dönüşlü)
    // 3: Regulär / Untrennbar (Normal)
    const options = [
      'Trennbar (Ayrılabilen)',
      'Reflexiv (Dönüşlü - sich)',
      'Beide (Ayrılabilen & Dönüşlü)',
      'Regulär / Untrennbar (Normal)'
    ];

    let correctIndex = 3; // Regulär varsayılan
    let explanation = '';

    if (isSeparable && isReflexive) {
      correctIndex = 2; // Beide
      explanation = `"${raw}" hem ayrılabilen bir ön eke hem de "sich" dönüşlü zamirine sahiptir. (Örn: Er bereitet sich vor)`;
    } else if (isSeparable) {
      correctIndex = 0; // Trennbar
      explanation = `"${raw}" ayrılabilen (trennbar) bir fiildir. Ön ek cümle sonunda ayrılır. (Örn: Er steht auf)`;
    } else if (isReflexive) {
      correctIndex = 1; // Reflexiv
      explanation = `"${raw}" dönüşlü (reflexiv) bir fiildir ve daima "sich" zamiri ile kullanılır. (Örn: Er freut sich)`;
    } else {
      correctIndex = 3; // Regulär
      explanation = `"${raw}" normal / ayrılamayan düzenli bir fiildir. (Örn: Er lernt / Er versteht)`;
    }

    return {
      card,
      prompt: 'Bu fiilin dilbilgisi türü nedir?',
      subject: raw,
      subprompt: card.meaningsTr || card.meaningsEn || 'Fiil morfolojisini inceleyin',
      options,
      correctIndex,
      explanation,
      audioWord: raw
    };
  }

  generateNounQuestion(card) {
    // Çoğul form sorusu
    if (card.pluralForm && card.pluralForm.trim() !== '-') {
      const correctPlural = card.pluralForm.trim();
      const otherPlurals = this.poolCards
        .filter((c) => c.id !== card.id && c.pluralForm && c.pluralForm !== '-')
        .map((c) => c.pluralForm.trim())
        .filter((p) => p !== correctPlural);

      const uniqueOthers = [...new Set(otherPlurals)].sort(() => 0.5 - Math.random()).slice(0, 3);
      if (uniqueOthers.length >= 2) {
        const options = [...uniqueOthers, correctPlural].sort(() => 0.5 - Math.random());
        return {
          card,
          prompt: 'Bu ismin çoğul (Plural) hali nedir?',
          subject: `${card.article ? card.article + ' ' : ''}${card.germanWord}`,
          subprompt: card.meaningsTr || card.meaningsEn || '',
          options,
          correctIndex: options.indexOf(correctPlural),
          explanation: `Çoğul: ${correctPlural}`,
          audioWord: card.germanWord
        };
      }
    }

    // Alternatif: Artikel sorusu
    if (card.article && ['der', 'die', 'das'].includes(card.article.toLowerCase())) {
      return this.generateArticleQuestion(card);
    }

    return this.generateMeaningQuestion(card, 'Bu ismin Türkçe karşılığı nedir?');
  }

  generatePhraseQuestion(card) {
    const correctMeaning = (card.meaningsTr || card.meaningsEn || '').split(/[,;]/)[0].trim();
    if (!correctMeaning) return null;

    const otherMeanings = this.poolCards
      .filter((c) => c.id !== card.id)
      .map((c) => (c.meaningsTr || c.meaningsEn || '').split(/[,;]/)[0].trim())
      .filter((m) => m && m.toLowerCase() !== correctMeaning.toLowerCase());

    const uniqueOthers = [...new Set(otherMeanings)].sort(() => 0.5 - Math.random()).slice(0, 3);
    const fallbacks = ['dikkat çekmek', 'önlem almak', 'göz önünde bulundurmak', 'anlamına gelmek'];
    while (uniqueOthers.length < 3 && fallbacks.length > 0) {
      const f = fallbacks.pop();
      if (!uniqueOthers.includes(f) && f !== correctMeaning) uniqueOthers.push(f);
    }

    const options = [...uniqueOthers, correctMeaning].sort(() => 0.5 - Math.random());
    return {
      card,
      prompt: 'Bu kalıbın / deyimin Türkçe karşılığı nedir?',
      subject: card.germanWord,
      subprompt: card.exampleSentence || '',
      options,
      correctIndex: options.indexOf(correctMeaning),
      explanation: card.exampleSentence ? `Örnek: ${card.exampleSentence}` : `Doğru Karşılık: ${correctMeaning}`,
      audioWord: card.germanWord
    };
  }

  generateMeaningQuestion(card, promptText) {
    const rawMeaning = card.meaningsTr || card.meaningsEn || '';
    const correct = rawMeaning.split(/[,;]/)[0].trim();
    if (!correct) return null;

    const otherMeanings = this.poolCards
      .filter((c) => c.id !== card.id)
      .map((c) => (c.meaningsTr || c.meaningsEn || '').split(/[,;]/)[0].trim())
      .filter((m) => m && m.toLowerCase() !== correct.toLowerCase());

    const uniqueOthers = [...new Set(otherMeanings)].sort(() => 0.5 - Math.random()).slice(0, 3);
    const fallbacks = ['önemli, mühim', 'hızlı, çabuk', 'faydalı, yararlı', 'birlikte, beraber'];
    while (uniqueOthers.length < 3 && fallbacks.length > 0) {
      const f = fallbacks.pop();
      if (!uniqueOthers.includes(f) && f !== correct) uniqueOthers.push(f);
    }

    const options = [...uniqueOthers, correct].sort(() => 0.5 - Math.random());
    return {
      card,
      prompt: promptText,
      subject: `${card.article ? card.article + ' ' : ''}${card.germanWord}`,
      subprompt: card.exampleSentence || '',
      options,
      correctIndex: options.indexOf(correct),
      explanation: `Doğru Anlam: ${rawMeaning}`,
      audioWord: card.germanWord
    };
  }

  generateMixedQuestion(card) {
    const pos = (card.partOfSpeech || '').toUpperCase();
    if (pos === 'NOUN' && card.article) {
      return Math.random() > 0.5 ? this.generateArticleQuestion(card) : this.generateNounQuestion(card);
    }
    if (pos === 'VERB') {
      const r = Math.random();
      if (r > 0.6) return this.generateReflexivTrennbarQuestion(card);
      if (r > 0.3 && card.partizipZwei) return this.generateVerbQuestion(card);
    }
    return this.generateMeaningQuestion(card, 'Bu kelimenin Türkçe karşılığı nedir?');
  }

  getCurrentQuestion() {
    return this.questions[this.currentIndex] || null;
  }

  /**
   * Puanlama ve Kombo Mantığı:
   * Temel Puan: 100 Puan
   * Kombo Çarpanı: 1x, 1.3x, 1.6x, 2.0x, 2.5x (5 ve üzeri seride)
   * Hız Bonusu: 3 sn içinde cevaplanırsa +50 puan, 5.5 sn içinde +25 puan
   * Hatalı cevapta: -20 puan (Puan 0'ın altına düşmez), Süre Modunda -3 saniye ceza
   */
  submitAnswer(optionIndex) {
    if (this.isAnswerRevealed) return null;

    const currentQ = this.getCurrentQuestion();
    if (!currentQ) return null;

    this.isAnswerRevealed = true;
    this.selectedOptionIndex = optionIndex;
    const isCorrect = optionIndex === currentQ.correctIndex;

    const elapsedSec = (Date.now() - this.questionStartTime) / 1000;
    let gainedPoints = 0;
    let speedBonus = 0;
    let streakMultiplier = 1.0;

    if (isCorrect) {
      this.score.correct++;
      this.score.streak++;
      this.score.maxStreak = Math.max(this.score.maxStreak, this.score.streak);

      // Streak çarpanı
      if (this.score.streak >= 5) streakMultiplier = 2.5;
      else if (this.score.streak >= 4) streakMultiplier = 2.0;
      else if (this.score.streak >= 3) streakMultiplier = 1.6;
      else if (this.score.streak >= 2) streakMultiplier = 1.3;

      // Hız bonusu
      if (elapsedSec <= 3.0) speedBonus = 50;
      else if (elapsedSec <= 5.5) speedBonus = 25;

      gainedPoints = Math.round(100 * streakMultiplier) + speedBonus;
      this.score.points += gainedPoints;
    } else {
      this.score.wrong++;
      this.score.streak = 0;
      this.score.points = Math.max(0, this.score.points - 20);

      // Zaman modunda 3 saniye süre cezası
      if (this.durationSeconds > 0) {
        this.remainingSeconds = Math.max(0, this.remainingSeconds - 3);
      }
    }

    this.saveHighScore(this.currentGameType, this.score.points);

    // Supabase ELO & Daily Stats Hook
    if (window.wmSocial && window.wmSocial.recordActivity) {
      const isHardWord = !!(currentQ.card && (currentQ.card.srsStage === 0 || (currentQ.card.failCount || 0) > 0));
      window.wmSocial.recordActivity({
        type: this.currentGameType === 'article' ? 'artikel' : 'cloze',
        isCorrect,
        responseTimeMs: Math.round(elapsedSec * 1000),
        comboCount: this.score.streak,
        isHardWord
      });
    }

    return {
      isCorrect,
      correctIndex: currentQ.correctIndex,
      explanation: currentQ.explanation,
      streak: this.score.streak,
      maxStreak: this.score.maxStreak,
      points: this.score.points,
      gainedPoints,
      speedBonus,
      streakMultiplier
    };
  }

  nextQuestion() {
    this.currentIndex++;
    this.isAnswerRevealed = false;
    this.selectedOptionIndex = null;
    this.questionStartTime = Date.now();
    return this.getCurrentQuestion();
  }

  isFinished() {
    if (this.durationSeconds > 0 && this.remainingSeconds <= 0) return true;
    return this.currentIndex >= this.questions.length;
  }

  getHighScore(gameType) {
    try {
      return Number(localStorage.getItem(`wortcoach_hs_${gameType}`)) || 0;
    } catch (_) {
      return 0;
    }
  }

  saveHighScore(gameType, score) {
    try {
      const current = this.getHighScore(gameType);
      if (score > current) {
        localStorage.setItem(`wortcoach_hs_${gameType}`, String(score));
        return true; // Yeni rekor
      }
    } catch (_) {}
    return false;
  }
}

window.WordGameService = new WordGameService();
