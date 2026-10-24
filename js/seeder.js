/**
 * WortMeister — İlk Kurulum Veritabanı Tohumlayıcı (Seeder) ve Zengin CEFR Paketleri (v2.3.0)
 */

const CURATED_CEFR_PACKS = [
  {
    code: 'A1',
    name: 'A1: Temel Fiiller & Günlük Kelimeler',
    description: 'Günlük hayatta en sık kullanılan temel fiiller, selamlaşma ve çekirdek isimler.',
    badge: 'A1',
    badgeColor: '#38BDF8',
    words: [
      'gehen', 'kommen', 'sein', 'haben', 'machen', 'arbeiten', 'wohnen', 'essen',
      'trinken', 'schlafen', 'sehen', 'hören', 'sprechen', 'lernen', 'lesen', 'schreiben',
      'kaufen', 'fragen', 'antworten', 'finden', 'suchen', 'wissen', 'fahren',
      'Haus', 'Wohnung', 'Buch', 'Zeit', 'Tag', 'Wasser', 'Brot'
    ]
  },
  {
    code: 'A2',
    name: 'A2: Günlük İletişim & Seyahat',
    description: 'Seyahat, sağlık, alışveriş, temel ayrılabilen eylemler ve iletişim ifadeleri.',
    badge: 'A2',
    badgeColor: '#34D399',
    words: [
      'anrufen', 'ankommen', 'aufstehen', 'mitbringen', 'mitkommen', 'einkaufen', 'fernsehen',
      'abfahren', 'zurückkommen', 'einladen', 'helfen', 'bleiben', 'glauben', 'hoffen',
      'vergessen', 'verlieren', 'bezahlen', 'bestellen', 'erklären', 'reparieren',
      'besuchen', 'verpassen', 'vorbereiten', 'Krankenhaus', 'Bahnhof', 'Flughafen',
      'Arzt', 'Schule', 'Zimmer', 'Straße'
    ]
  },
  {
    code: 'B1',
    name: 'B1: İleri Fiiller & Soyut İsimler',
    description: 'İş, akademi, fikir belirtme ve orta-ileri seviye morfolojik kelimeler.',
    badge: 'B1',
    badgeColor: '#FBBF24',
    words: [
      'entscheiden', 'entwickeln', 'erfahren', 'erhalten', 'erkennen', 'erreichen',
      'erwarten', 'vergleichen', 'verhandeln', 'vermeiden', 'vermuten', 'verschwinden',
      'versprechen', 'vertrauen', 'verwenden', 'überzeugen', 'zustimmen', 'teilnehmen',
      'stattfinden', 'ablehnen', 'annehmen', 'beweisen', 'bewerben', 'entstehen',
      'untergehen', 'Entscheidung', 'Erfahrung', 'Möglichkeit', 'Lösung', 'Problem'
    ]
  },
  {
    code: 'B2',
    name: 'B2: Akademik & Profesyonel İfadeler',
    description: 'Üst düzey tartışma, analiz, yönetim ve sürdürülebilirlik kavramları.',
    badge: 'B2',
    badgeColor: '#A78BFA',
    words: [
      'analysieren', 'beanspruchen', 'begründen', 'berücksichtigen', 'beschleunigen',
      'bewältigen', 'definieren', 'demonstrieren', 'durchführen', 'einleiten',
      'gewährleisten', 'hinterfragen', 'interpretieren', 'koordinieren', 'optimieren',
      'reflektieren', 'regulieren', 'strukturieren', 'veranschaulichen', 'vereinbaren',
      'veröffentlichen', 'voraussetzen', 'nachhaltig', 'Gesellschaft', 'Verantwortung'
    ]
  },
  {
    code: 'TRENNBAR',
    name: 'Ayrılabilen Fiiller (Trennbare Verben)',
    description: 'ab-, an-, auf-, aus-, ein-, mit-, vor-, zu- ön ekleriyle kurulan en önemli fiiller.',
    badge: 'ÖZEL',
    badgeColor: '#FB923C',
    words: [
      'abfahren', 'abholen', 'anfangen', 'ankommen', 'anrufen', 'aufhören', 'aufstehen',
      'aufwachen', 'ausgeben', 'aussehen', 'aussteigen', 'einladen', 'einkaufen',
      'einsteigen', 'fernsehen', 'mitbringen', 'mitkommen', 'mitmachen', 'nachdenken',
      'stattfinden', 'teilnehmen', 'umsteigen', 'umziehen', 'vorbereiten', 'vorstellen'
    ]
  },
  {
    code: 'IRREGULAR',
    name: 'Düzensiz Fiiller (Unregelmäßige Verben)',
    description: 'Kök ünlü değişimi gösteren ve A1-B2 sınavlarında mutlaka sorulan temel düzensiz fiiller.',
    badge: 'ÖZEL',
    badgeColor: '#F43F5E',
    words: [
      'sein', 'haben', 'werden', 'gehen', 'stehen', 'bringen', 'fahren', 'helfen',
      'nehmen', 'sprechen', 'bleiben', 'wissen', 'sehen', 'geben', 'finden',
      'denken', 'schreiben', 'lesen', 'tragen', 'schlafen', 'fallen', 'treffen',
      'trinken', 'singen', 'gewinnen', 'fliegen', 'schwimmen', 'schneiden',
      'schließen', 'verlieren'
    ]
  }
];

class DatabaseSeeder {
  static getAllPacks() {
    return (typeof window !== 'undefined' && window.CURATED_CEFR_PACKS) ? window.CURATED_CEFR_PACKS : CURATED_CEFR_PACKS;
  }

  static async seedIfNeeded() {
    const isSeeded = await window.wmDB.getSetting('initialSeedCompleted', false);
    if (isSeeded) return;

    // Kullanıcının açık isteği: İlk açılışta otomatik kart yüklenmez (0 kart).
    // Kullanıcı dilerse "Hazır Desteler" butonundan istediği seviyeyi seçerek ekler.
    const existingDecks = await window.wmDB.getAllDecks();
    if (existingDecks.length === 0) {
      await window.wmDB.createDeck('Genel Deste');
    }

    await window.wmDB.setSetting('initialSeedCompleted', true);
    await window.wmDB.setSetting('dailyGoal', 20);
  }

  static async importCuratedPack(packCode) {
    const packs = this.getAllPacks();
    const pack = packs.find((p) => p.code === packCode);
    if (!pack) return null;

    // Aynı isimde deste var mı kontrol et, yoksa oluştur
    const existingDecks = await window.wmDB.getAllDecks();
    let targetDeck = existingDecks.find((d) => d.name === pack.name);
    if (!targetDeck) {
      targetDeck = await window.wmDB.createDeck(pack.name);
    }

    if (Array.isArray(pack.cards) && pack.cards.length > 0) {
      for (const cardData of pack.cards) {
        await window.wmDB.addCard({
          ...cardData,
          deckId: targetDeck.id
        });
      }
    } else if (Array.isArray(pack.words)) {
      for (const w of pack.words) {
        const synth = window.DictionaryService.synthesizeInstantEntry(w);
        synth.cefr = pack.badge;
        await window.wmDB.addCard({
          ...synth,
          deckId: targetDeck.id
        });
      }
    }
    return targetDeck;
  }

  static async importAllPacks() {
    const results = [];
    const packs = this.getAllPacks();
    for (const pack of packs) {
      const res = await this.importCuratedPack(pack.code);
      results.push(res);
    }
    return results;
  }
}

if (typeof window !== 'undefined' && !window.CURATED_CEFR_PACKS) {
  window.CURATED_CEFR_PACKS = CURATED_CEFR_PACKS;
}
window.DatabaseSeeder = DatabaseSeeder;
