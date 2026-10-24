/**
 * WortMeister — Standalone 100% Offline Sözlük & Morfoloji Motoru (v3.0.0)
 * 
 * Bu kütüphane harici hiçbir API veya internet bağlantısına ihtiyaç duymadan:
 * - 0ms Almanca Kelime / İsim / Fiil / Sıfat arama
 * - Çift Yönlü Çapraz Arama: Türkçe -> Almanca ve İngilizce -> Almanca
 * - Çekimli Fiil Çözümleme (ging -> gehen, geschrieben -> schreiben)
 * - Çoğul İsimleri Kök Haliyle Bulma (Häuser -> Haus, Kinder -> Kind)
 * - Artikel Tespiti (der, die, das) ve CEFR Seviyeleri (A1-C1)
 * - Anlık Otomatik Tamamlama (Autocomplete Suggestions)
 * - 5-10 MB harici JSON veri tabanlarını tek satırda içeri aktarma (import) desteği sunar.
 */

(function (global) {
  'use strict';

  // =========================================================================
  // 1. DÜZENSİZ FİİLLER VE ÇEKİM TABLOSU (Präsens, Präteritum, Partizip II, Hilfsverb)
  // =========================================================================
  const IRREGULAR_VERBS = {
    sein: { praesens: 'ist', praeteritum: 'war', partizipZwei: 'gewesen', hilfsverb: 'ist', imperativ: 'sei!', cefr: 'A1', tr: 'olmak, bulunmak', en: 'to be' },
    haben: { praesens: 'hat', praeteritum: 'hatte', partizipZwei: 'gehabt', hilfsverb: 'hat', imperativ: 'hab!', cefr: 'A1', tr: 'sahip olmak, var olmak', en: 'to have' },
    werden: { praesens: 'wird', praeteritum: 'wurde', partizipZwei: 'geworden', hilfsverb: 'ist', imperativ: 'werde!', cefr: 'A1', tr: 'olmak, gelecekte ... olmak', en: 'to become, will' },
    gehen: { praesens: 'geht', praeteritum: 'ging', partizipZwei: 'gegangen', hilfsverb: 'ist', imperativ: 'geh!', cefr: 'A1', tr: 'gitmek, yürümek', en: 'to go, walk' },
    kommen: { praesens: 'kommt', praeteritum: 'kam', partizipZwei: 'gekommen', hilfsverb: 'ist', imperativ: 'komm!', cefr: 'A1', tr: 'gelmek', en: 'to come' },
    stehen: { praesens: 'steht', praeteritum: 'stand', partizipZwei: 'gestanden', hilfsverb: 'hat', imperativ: 'steh!', cefr: 'A1', tr: 'ayakta durmak', en: 'to stand' },
    sitzen: { praesens: 'sitzt', praeteritum: 'saß', partizipZwei: 'gesessen', hilfsverb: 'hat', imperativ: 'sitz!', cefr: 'A1', tr: 'oturmak', en: 'to sit' },
    liegen: { praesens: 'liegt', praeteritum: 'lag', partizipZwei: 'gelegen', hilfsverb: 'hat', imperativ: 'lieg!', cefr: 'A1', tr: 'yatmak, bulunmak', en: 'to lie, be situated' },
    sehen: { praesens: 'sieht', praeteritum: 'sah', partizipZwei: 'gesehen', hilfsverb: 'hat', imperativ: 'sieh!', cefr: 'A1', tr: 'görmek, bakmak', en: 'to see, look' },
    schauen: { praesens: 'schaut', praeteritum: 'schaute', partizipZwei: 'geschaut', hilfsverb: 'hat', imperativ: 'schau!', cefr: 'A1', tr: 'bakmak, izlemek', en: 'to look, watch' },
    fahren: { praesens: 'fährt', praeteritum: 'fuhr', partizipZwei: 'gefahren', hilfsverb: 'ist', imperativ: 'fahr!', cefr: 'A1', tr: 'araçla gitmek, sürmek', en: 'to drive, travel' },
    fliegen: { praesens: 'fliegt', praeteritum: 'flog', partizipZwei: 'geflogen', hilfsverb: 'ist', imperativ: 'flieg!', cefr: 'A2', tr: 'uçmak', en: 'to fly' },
    nehmen: { praesens: 'nimmt', praeteritum: 'nahm', partizipZwei: 'genommen', hilfsverb: 'hat', imperativ: 'nimm!', cefr: 'A1', tr: 'almak', en: 'to take' },
    geben: { praesens: 'gibt', praeteritum: 'gab', partizipZwei: 'gegeben', hilfsverb: 'hat', imperativ: 'gib!', cefr: 'A1', tr: 'vermek', en: 'to give' },
    bringen: { praesens: 'bringt', praeteritum: 'brachte', partizipZwei: 'gebracht', hilfsverb: 'hat', imperativ: 'bring!', cefr: 'A1', tr: 'getirmek', en: 'to bring' },
    holen: { praesens: 'holt', praeteritum: 'holte', partizipZwei: 'geholt', hilfsverb: 'hat', imperativ: 'hol!', cefr: 'A1', tr: 'gidip getirmek, almak', en: 'to fetch, get' },
    sprechen: { praesens: 'spricht', praeteritum: 'sprach', partizipZwei: 'gesprochen', hilfsverb: 'hat', imperativ: 'sprich!', cefr: 'A1', tr: 'konuşmak', en: 'to speak' },
    sagen: { praesens: 'sagt', praeteritum: 'sagte', partizipZwei: 'gesagt', hilfsverb: 'hat', imperativ: 'sag!', cefr: 'A1', tr: 'söylemek, demek', en: 'to say, tell' },
    helfen: { praesens: 'hilft', praeteritum: 'half', partizipZwei: 'geholfen', hilfsverb: 'hat', imperativ: 'hilf!', cefr: 'A1', tr: 'yardım etmek', en: 'to help' },
    denken: { praesens: 'denkt', praeteritum: 'dachte', partizipZwei: 'gedacht', hilfsverb: 'hat', imperativ: 'denk!', cefr: 'A2', tr: 'düşünmek', en: 'to think' },
    wissen: { praesens: 'weiß', praeteritum: 'wusste', partizipZwei: 'gewusst', hilfsverb: 'hat', imperativ: 'wisse!', cefr: 'A1', tr: 'bilmek', en: 'to know (facts)' },
    kennen: { praesens: 'kennt', praeteritum: 'kannte', partizipZwei: 'gekannt', hilfsverb: 'hat', imperativ: 'kenn!', cefr: 'A1', tr: 'tanımak, bilmek', en: 'to know (people/places)' },
    bleiben: { praesens: 'bleibt', praeteritum: 'blieb', partizipZwei: 'geblieben', hilfsverb: 'ist', imperativ: 'bleib!', cefr: 'A1', tr: 'kalmak, ayrılmamak', en: 'to stay, remain' },
    verlassen: { praesens: 'verlässt', praeteritum: 'verließ', partizipZwei: 'verlassen', hilfsverb: 'hat', imperativ: 'verlass!', cefr: 'B1', tr: 'terk etmek, ayrılmak', en: 'to leave, abandon' },
    schreiben: { praesens: 'schreibt', praeteritum: 'schrieb', partizipZwei: 'geschrieben', hilfsverb: 'hat', imperativ: 'schreib!', cefr: 'A1', tr: 'yazmak', en: 'to write' },
    lesen: { praesens: 'liest', praeteritum: 'las', partizipZwei: 'gelesen', hilfsverb: 'hat', imperativ: 'lies!', cefr: 'A1', tr: 'okumak', en: 'to read' },
    essen: { praesens: 'isst', praeteritum: 'aß', partizipZwei: 'gegessen', hilfsverb: 'hat', imperativ: 'iss!', cefr: 'A1', tr: 'yemek yemek', en: 'to eat' },
    trinken: { praesens: 'trinkt', praeteritum: 'trank', partizipZwei: 'getrunken', hilfsverb: 'hat', imperativ: 'trink!', cefr: 'A1', tr: 'içmek', en: 'to drink' },
    finden: { praesens: 'findet', praeteritum: 'fand', partizipZwei: 'gefunden', hilfsverb: 'hat', imperativ: 'finde!', cefr: 'A1', tr: 'bulmak', en: 'to find' },
    suchen: { praesens: 'sucht', praeteritum: 'suchte', partizipZwei: 'gesucht', hilfsverb: 'hat', imperativ: 'such!', cefr: 'A1', tr: 'aramak', en: 'to search, look for' },
    verlieren: { praesens: 'verliert', praeteritum: 'verlor', partizipZwei: 'verloren', hilfsverb: 'hat', imperativ: 'verlier!', cefr: 'A2', tr: 'kaybetmek', en: 'to lose' },
    gewinnen: { praesens: 'gewinnt', praeteritum: 'gewann', partizipZwei: 'gewonnen', hilfsverb: 'hat', imperativ: 'gewinn!', cefr: 'A2', tr: 'kazanmak', en: 'to win' },
    schlafen: { praesens: 'schläft', praeteritum: 'schlief', partizipZwei: 'geschlafen', hilfsverb: 'hat', imperativ: 'schlaf!', cefr: 'A1', tr: 'uyumak', en: 'to sleep' },
    aufstehen: { praesens: 'steht auf', praeteritum: 'stand auf', partizipZwei: 'aufgestanden', hilfsverb: 'ist', imperativ: 'steh auf!', cefr: 'A1', tr: 'ayağa kalkmak, uyanmak', en: 'to get up, stand up', isSeparable: true, separablePrefix: 'auf' },
    einschlafen: { praesens: 'schläft ein', praeteritum: 'schlief ein', partizipZwei: 'eingeschlafen', hilfsverb: 'ist', imperativ: 'schlaf ein!', cefr: 'A2', tr: 'uyuyakalmak', en: 'to fall asleep', isSeparable: true, separablePrefix: 'ein' },
    anfangen: { praesens: 'fängt an', praeteritum: 'fing an', partizipZwei: 'angefangen', hilfsverb: 'hat', imperativ: 'fang an!', cefr: 'A1', tr: 'başlamak', en: 'to begin, start', isSeparable: true, separablePrefix: 'an' },
    beginnen: { praesens: 'beginnt', praeteritum: 'begann', partizipZwei: 'begonnen', hilfsverb: 'hat', imperativ: 'beginn!', cefr: 'A2', tr: 'başlamak', en: 'to start, begin' },
    aufhören: { praesens: 'hört auf', praeteritum: 'hörte auf', partizipZwei: 'aufgehört', hilfsverb: 'hat', imperativ: 'hör auf!', cefr: 'A2', tr: 'bırakmak, son vermek', en: 'to stop, quit', isSeparable: true, separablePrefix: 'auf' },
    verstehen: { praesens: 'versteht', praeteritum: 'verstand', partizipZwei: 'verstanden', hilfsverb: 'hat', imperativ: 'versteh!', cefr: 'A1', tr: 'anlamak, kavramak', en: 'to understand' },
    erklären: { praesens: 'erklärt', praeteritum: 'erklärte', partizipZwei: 'erklärt', hilfsverb: 'hat', imperativ: 'erklär!', cefr: 'A2', tr: 'açıklamak, izah etmek', en: 'to explain' },
    lernen: { praesens: 'lernt', praeteritum: 'lernte', partizipZwei: 'gelernt', hilfsverb: 'hat', imperativ: 'lern!', cefr: 'A1', tr: 'öğrenmek, ders çalışmak', en: 'to learn, study' },
    lehren: { praesens: 'lehrt', praeteritum: 'lehrte', partizipZwei: 'gelehrt', hilfsverb: 'hat', imperativ: 'lehr!', cefr: 'B1', tr: 'öğretmek', en: 'to teach' },
    arbeiten: { praesens: 'arbeitet', praeteritum: 'arbeitete', partizipZwei: 'gearbeitet', hilfsverb: 'hat', imperativ: 'arbeite!', cefr: 'A1', tr: 'çalışmak', en: 'to work' },
    machen: { praesens: 'macht', praeteritum: 'machte', partizipZwei: 'gemacht', hilfsverb: 'hat', imperativ: 'mach!', cefr: 'A1', tr: 'yapmak, etmek', en: 'to do, make' },
    tun: { praesens: 'tut', praeteritum: 'tat', partizipZwei: 'getan', hilfsverb: 'hat', imperativ: 'tu!', cefr: 'A2', tr: 'yapmak, eylemek', en: 'to do' },
    kaufen: { praesens: 'kauft', praeteritum: 'kaufte', partizipZwei: 'gekauft', hilfsverb: 'hat', imperativ: 'kauf!', cefr: 'A1', tr: 'satın almak', en: 'to buy' },
    verkaufen: { praesens: 'verkauft', praeteritum: 'verkaufte', partizipZwei: 'verkauft', hilfsverb: 'hat', imperativ: 'verkauf!', cefr: 'A2', tr: 'satmak', en: 'to sell' },
    bezahlen: { praesens: 'bezahlt', praeteritum: 'bezahlte', partizipZwei: 'bezahlt', hilfsverb: 'hat', imperativ: 'bezahl!', cefr: 'A1', tr: 'ödemek', en: 'to pay' },
    kosten: { praesens: 'kostet', praeteritum: 'kostete', partizipZwei: 'gekostet', hilfsverb: 'hat', imperativ: 'koste!', cefr: 'A1', tr: 'maliyeti olmak, fiyatında olmak', en: 'to cost' },
    wohnen: { praesens: 'wohnt', praeteritum: 'wohnte', partizipZwei: 'gewohnt', hilfsverb: 'hat', imperativ: 'wohne!', cefr: 'A1', tr: 'ikamet etmek, oturmak', en: 'to live, reside' },
    leben: { praesens: 'lebt', praeteritum: 'lebte', partizipZwei: 'gelebt', hilfsverb: 'hat', imperativ: 'lebe!', cefr: 'A1', tr: 'yaşamak, hayatta olmak', en: 'to live, be alive' },
    sterben: { praesens: 'stirbt', praeteritum: 'starb', partizipZwei: 'gestorben', hilfsverb: 'ist', imperativ: 'stirb!', cefr: 'A2', tr: 'ölmek', en: 'to die' },
    fragen: { praesens: 'fragt', praeteritum: 'fragte', partizipZwei: 'gefragt', hilfsverb: 'hat', imperativ: 'frag!', cefr: 'A1', tr: 'sormak', en: 'to ask' },
    antworten: { praesens: 'antwortet', praeteritum: 'antwortete', partizipZwei: 'geantwortet', hilfsverb: 'hat', imperativ: 'antworte!', cefr: 'A1', tr: 'cevap vermek', en: 'to answer' },
    öffnen: { praesens: 'öffnet', praeteritum: 'öffnete', partizipZwei: 'geöffnet', hilfsverb: 'hat', imperativ: 'öffne!', cefr: 'A1', tr: 'açmak', en: 'to open' },
    schließen: { praesens: 'schließt', praeteritum: 'schloss', partizipZwei: 'geschlossen', hilfsverb: 'hat', imperativ: 'schließ!', cefr: 'A1', tr: 'kapatmak, kilitlemek', en: 'to close, shut' },
    brauchen: { praesens: 'braucht', praeteritum: 'brauchte', partizipZwei: 'gebraucht', hilfsverb: 'hat', imperativ: 'brauch!', cefr: 'A1', tr: 'ihtiyacı olmak, gerekmek', en: 'to need' },
    wollen: { praesens: 'will', praeteritum: 'wollte', partizipZwei: 'gewollt', hilfsverb: 'hat', imperativ: 'wolle!', cefr: 'A1', tr: 'istemek (kesin niyet)', en: 'to want' },
    möchten: { praesens: 'möchte', praeteritum: 'wollte', partizipZwei: 'gemocht', hilfsverb: 'hat', imperativ: 'möchte!', cefr: 'A1', tr: 'istemek, arzu etmek (kibar)', en: 'would like' },
    müssen: { praesens: 'muss', praeteritum: 'musste', partizipZwei: 'gemusst', hilfsverb: 'hat', imperativ: 'müsse!', cefr: 'A1', tr: 'zorunda olmak, mecbur olmak', en: 'must, have to' },
    können: { praesens: 'kann', praeteritum: 'konnte', partizipZwei: 'gekonnt', hilfsverb: 'hat', imperativ: 'könne!', cefr: 'A1', tr: '-ebilmek, yapabilmek', en: 'can, to be able to' },
    dürfen: { praesens: 'darf', praeteritum: 'durfte', partizipZwei: 'gedurft', hilfsverb: 'hat', imperativ: 'dürfe!', cefr: 'A1', tr: 'izinli olmak, yapabilmek', en: 'may, to be allowed to' },
    sollen: { praesens: 'soll', praeteritum: 'sollte', partizipZwei: 'gesollt', hilfsverb: 'hat', imperativ: 'solle!', cefr: 'A1', tr: '-meli/-malı (tavsiye/görev)', en: 'should, ought to' },
    mögen: { praesens: 'mag', praeteritum: 'mochte', partizipZwei: 'gemocht', hilfsverb: 'hat', imperativ: 'mag!', cefr: 'A1', tr: 'hoşlanmak, sevmek', en: 'to like' },
    lieben: { praesens: 'liebt', praeteritum: 'liebte', partizipZwei: 'geliebt', hilfsverb: 'hat', imperativ: 'lieb!', cefr: 'A1', tr: 'sevmek, aşık olmak', en: 'to love' },
    hassen: { praesens: 'hasst', praeteritum: 'hasste', partizipZwei: 'gehasst', hilfsverb: 'hat', imperativ: 'hass!', cefr: 'A2', tr: 'nefret etmek', en: 'to hate' },
    hoffen: { praesens: 'hofft', praeteritum: 'hoffte', partizipZwei: 'gehofft', hilfsverb: 'hat', imperativ: 'hoff!', cefr: 'A2', tr: 'umut etmek', en: 'to hope' },
    glauben: { praesens: 'glaubt', praeteritum: 'glaubte', partizipZwei: 'geglaubt', hilfsverb: 'hat', imperativ: 'glaub!', cefr: 'A1', tr: 'inanmak, sanmak', en: 'to believe, think' },
    erinnern: { praesens: 'erinnert', praeteritum: 'erinnerte', partizipZwei: 'erinnert', hilfsverb: 'hat', imperativ: 'erinnere!', cefr: 'B1', tr: 'hatırlatmak / hatırlamak (sich)', en: 'to remind / remember' },
    vergessen: { praesens: 'vergisst', praeteritum: 'vergaß', partizipZwei: 'vergessen', hilfsverb: 'hat', imperativ: 'vergiss!', cefr: 'A1', tr: 'unutmak', en: 'to forget' },
    treffen: { praesens: 'trifft', praeteritum: 'traf', partizipZwei: 'getroffen', hilfsverb: 'hat', imperativ: 'triff!', cefr: 'A1', tr: 'buluşmak, karşılaşmak', en: 'to meet, hit' },
    warten: { praesens: 'wartet', praeteritum: 'wartete', partizipZwei: 'gewartet', hilfsverb: 'hat', imperativ: 'warte!', cefr: 'A1', tr: 'beklemek', en: 'to wait' },
    hören: { praesens: 'hört', praeteritum: 'hörte', partizipZwei: 'gehört', hilfsverb: 'hat', imperativ: 'hör!', cefr: 'A1', tr: 'duymak, dinlemek, işitmek', en: 'to hear, listen' },
    hoeren: { praesens: 'hört', praeteritum: 'hörte', partizipZwei: 'gehört', hilfsverb: 'hat', imperativ: 'hör!', cefr: 'A1', tr: 'duymak, dinlemek, işitmek', en: 'to hear, listen' },
    fühlen: { praesens: 'fühlt', praeteritum: 'fühlte', partizipZwei: 'gefühlt', hilfsverb: 'hat', imperativ: 'fühle!', cefr: 'A2', tr: 'hissetmek', en: 'to feel' }
  };

  // =========================================================================
  // 2. TEMEL İSİMLER, ARTIKELLER VE ÇOĞUL FORMLAR (A1-C1)
  // =========================================================================
  const CORE_NOUNS = {
    // Ev ve Yaşam
    haus: { de: 'Haus', art: 'das', pl: 'die Häuser', tr: 'ev, konut, bina', en: 'house, home, building', cefr: 'A1', ex: 'Das Haus hat einen schönen Garten.' },
    wohnung: { de: 'Wohnung', art: 'die', pl: 'die Wohnungen', tr: 'daire, ev', en: 'apartment, flat', cefr: 'A1', ex: 'Unsere Wohnung liegt im zweiten Stock.' },
    zimmer: { de: 'Zimmer', art: 'das', pl: 'die Zimmer', tr: 'oda', en: 'room', cefr: 'A1', ex: 'Das Zimmer ist hell und ruhig.' },
    kueche: { de: 'Küche', art: 'die', pl: 'die Küchen', tr: 'mutfak', en: 'kitchen', cefr: 'A1', ex: 'In der Küche kocht meine Mutter.' },
    bad: { de: 'Bad', art: 'das', pl: 'die Bäder', tr: 'banyo', en: 'bathroom, bath', cefr: 'A1', ex: 'Das Bad ist frisch renoviert.' },
    tisch: { de: 'Tisch', art: 'der', pl: 'die Tische', tr: 'masa', en: 'table', cefr: 'A1', ex: 'Das Essen steht schon auf dem Tisch.' },
    stuhl: { de: 'Stuhl', art: 'der', pl: 'die Stühle', tr: 'sandalye', en: 'chair', cefr: 'A1', ex: 'Setzen Sie sich bitte auf diesen Stuhl.' },
    bett: { de: 'Bett', art: 'das', pl: 'die Betten', tr: 'yatak', en: 'bed', cefr: 'A1', ex: 'Das Kind liegt schon im Bett.' },
    fenster: { de: 'Fenster', art: 'das', pl: 'die Fenster', tr: 'pencere', en: 'window', cefr: 'A1', ex: 'Bitte mach das Fenster auf!' },
    tuer: { de: 'Tür', art: 'die', pl: 'die Türen', tr: 'kapı', en: 'door', cefr: 'A1', ex: 'Die Tür ist abgeschlossen.' },
    lampe: { de: 'Lampe', art: 'die', pl: 'die Lampen', tr: 'lamba', en: 'lamp, light', cefr: 'A1', ex: 'Die Lampe spendet warmes Licht.' },
    schrank: { de: 'Schrank', art: 'der', pl: 'die Schränke', tr: 'dolap', en: 'closet, cupboard', cefr: 'A1', ex: 'Die Kleidung hängt im Schrank.' },
    spiegel: { de: 'Spiegel', art: 'der', pl: 'die Spiegel', tr: 'ayna', en: 'mirror', cefr: 'A2', ex: 'Er betrachtet sich im Spiegel.' },
    teppich: { de: 'Teppich', art: 'der', pl: 'die Teppiche', tr: 'halı', en: 'carpet, rug', cefr: 'A2', ex: 'Der Teppich ist handgewebt.' },

    // Şehir, Ulaşım ve Doğa
    stadt: { de: 'Stadt', art: 'die', pl: 'die Städte', tr: 'şehir, kent', en: 'city, town', cefr: 'A1', ex: 'Berlin ist eine aufregende Stadt.' },
    dorf: { de: 'Dorf', art: 'das', pl: 'die Dörfer', tr: 'köy', en: 'village', cefr: 'A2', ex: 'Sie leben in einem ruhigen Dorf.' },
    land: { de: 'Land', art: 'das', pl: 'die Länder', tr: 'ülke, memleket; kırsal', en: 'country, land', cefr: 'A1', ex: 'Deutschland ist ein europäisches Land.' },
    strasse: { de: 'Straße', art: 'die', pl: 'die Straßen', tr: 'sokak, cadde, yol', en: 'street, road', cefr: 'A1', ex: 'Die Straße ist wegen Bauarbeiten gesperrt.' },
    auto: { de: 'Auto', art: 'das', pl: 'die Autos', tr: 'araba, otomobil', en: 'car, automobile', cefr: 'A1', ex: 'Er fährt mit dem Auto zur Arbeit.' },
    zug: { de: 'Zug', art: 'der', pl: 'die Züge', tr: 'tren', en: 'train', cefr: 'A1', ex: 'Der Zug fährt pünktlich um acht Uhr ab.' },
    bus: { de: 'Bus', art: 'der', pl: 'die Busse', tr: 'otobüs', en: 'bus', cefr: 'A1', ex: 'Wir nehmen den nächsten Bus.' },
    fahrrad: { de: 'Fahrrad', art: 'das', pl: 'die Fahrräder', tr: 'bisiklet', en: 'bicycle, bike', cefr: 'A1', ex: 'Im Sommer fahre ich gerne Fahrrad.' },
    flugzeug: { de: 'Flugzeug', art: 'das', pl: 'die Flugzeuge', tr: 'uçak', en: 'airplane, plane', cefr: 'A2', ex: 'Das Flugzeug landet in zwanzig Minuten.' },
    bahnhof: { de: 'Bahnhof', art: 'der', pl: 'die Bahnhöfe', tr: 'tren garı, istasyon', en: 'train station', cefr: 'A1', ex: 'Treffen wir uns am Hauptbahnhof!' },
    flughafen: { de: 'Flughafen', art: 'der', pl: 'die Flughäfen', tr: 'havalimanı', en: 'airport', cefr: 'A2', ex: 'Wir müssen früh am Flughafen sein.' },
    park: { de: 'Park', art: 'der', pl: 'die Parks', tr: 'park', en: 'park', cefr: 'A1', ex: 'Am Sonntag gehen wir im Park spazieren.' },
    wald: { de: 'Wald', art: 'der', pl: 'die Wälder', tr: 'orman', en: 'forest, woods', cefr: 'A2', ex: 'Die Luft im Wald ist frisch.' },
    berg: { de: 'Berg', art: 'der', pl: 'die Berge', tr: 'dağ', en: 'mountain', cefr: 'A2', ex: 'Die Berge sind mit Schnee bedeckt.' },
    meer: { de: 'Meer', art: 'das', pl: 'die Meere', tr: 'deniz', en: 'sea, ocean', cefr: 'A2', ex: 'Im Urlaub fahren wir ans Meer.' },
    see: { de: 'See', art: 'der', pl: 'die Seen', tr: 'göl', en: 'lake', cefr: 'A2', ex: 'Wir schwimmen gerne im See.' },
    fluss: { de: 'Fluss', art: 'der', pl: 'die Flüsse', tr: 'nehir, ırmak', en: 'river', cefr: 'A2', ex: 'Der Rhein ist ein langer Fluss.' },

    // Yiyecek ve İçecek
    wasser: { de: 'Wasser', art: 'das', pl: 'die Wässer', tr: 'su', en: 'water', cefr: 'A1', ex: 'Bitte ein Glas frisches Wasser.' },
    brot: { de: 'Brot', art: 'das', pl: 'die Brote', tr: 'ekmek', en: 'bread', cefr: 'A1', ex: 'Frisches Brot duftet herrlich.' },
    milch: { de: 'Milch', art: 'die', pl: '—', tr: 'süt', en: 'milk', cefr: 'A1', ex: 'Ich trinke Kaffee mit Milch.' },
    kaffee: { de: 'Kaffee', art: 'der', pl: '—', tr: 'kahve', en: 'coffee', cefr: 'A1', ex: 'Morgens brauche ich einen heißen Kaffee.' },
    tee: { de: 'Tee', art: 'der', pl: 'die Tees', tr: 'çay', en: 'tea', cefr: 'A1', ex: 'Möchtest du schwarzen oder grünen Tee?' },
    kaese: { de: 'Käse', art: 'der', pl: '—', tr: 'peynir', en: 'cheese', cefr: 'A1', ex: 'Zum Frühstück esse ich Käse und Brot.' },
    butter: { de: 'Butter', art: 'die', pl: '—', tr: 'tereyağı', en: 'butter', cefr: 'A1', ex: 'Streiche die Butter dünn aufs Brot.' },
    ei: { de: 'Ei', art: 'das', pl: 'die Eier', tr: 'yumurta', en: 'egg', cefr: 'A1', ex: 'Er kocht sich jeden Morgen zwei Eier.' },
    fleisch: { de: 'Fleisch', art: 'das', pl: '—', tr: 'et', en: 'meat', cefr: 'A1', ex: 'Vegetarier essen kein Fleisch.' },
    fisch: { de: 'Fisch', art: 'der', pl: 'die Fische', tr: 'balık', en: 'fish', cefr: 'A1', ex: 'Fisch ist gesund und schmeckt gut.' },
    apfel: { de: 'Apfel', art: 'der', pl: 'die Äpfel', tr: 'elma', en: 'apple', cefr: 'A1', ex: 'Ein Apfel am Tag hält gesund.' },
    gemuese: { de: 'Gemüse', art: 'das', pl: '—', tr: 'sebze', en: 'vegetables', cefr: 'A1', ex: 'Frisches Gemüse ist wichtig für die Gesundheit.' },
    obst: { de: 'Obst', art: 'das', pl: '—', tr: 'meyve', en: 'fruit', cefr: 'A1', ex: 'Auf dem Markt gibt es viel Obst.' },
    zucker: { de: 'Zucker', art: 'der', pl: '—', tr: 'şeker', en: 'sugar', cefr: 'A1', ex: 'Nehmen Sie Zucker in den Tee?' },
    salz: { de: 'Salz', art: 'das', pl: '—', tr: 'tuz', en: 'salt', cefr: 'A1', ex: 'Die Suppe braucht noch etwas Salz.' },

    // İnsanlar ve Aile
    mensch: { de: 'Mensch', art: 'der', pl: 'die Menschen', tr: 'insan, kişi', en: 'human, person', cefr: 'A1', ex: 'Alle Menschen sind frei geboren.' },
    mann: { de: 'Mann', art: 'der', pl: 'die Männer', tr: 'adam, erkek; koca', en: 'man, husband', cefr: 'A1', ex: 'Der Mann liest seine Zeitung.' },
    frau: { de: 'Frau', art: 'die', pl: 'die Frauen', tr: 'kadın, bayan; eş', en: 'woman, wife, Mrs.', cefr: 'A1', ex: 'Die Frau leitet das Unternehmen.' },
    kind: { de: 'Kind', art: 'das', pl: 'die Kinder', tr: 'çocuk', en: 'child', cefr: 'A1', ex: 'Das Kind spielt im Garten.' },
    eltern: { de: 'Eltern', art: 'die', pl: 'die Eltern', tr: 'ebeveyn, anne baba', en: 'parents', cefr: 'A1', ex: 'Meine Eltern wohnen in Hamburg.' },
    vater: { de: 'Vater', art: 'der', pl: 'die Väter', tr: 'baba', en: 'father', cefr: 'A1', ex: 'Mein Vater arbeitet als Ingenieur.' },
    mutter: { de: 'Mutter', art: 'die', pl: 'die Mütter', tr: 'anne', en: 'mother', cefr: 'A1', ex: 'Die Mutter kümmert sich um die Familie.' },
    sohn: { de: 'Sohn', art: 'der', pl: 'die Söhne', tr: 'oğul, erkek evlat', en: 'son', cefr: 'A1', ex: 'Ihr Sohn studiert Informatik.' },
    tochter: { de: 'Tochter', art: 'die', pl: 'die Töchter', tr: 'kız evlat', en: 'daughter', cefr: 'A1', ex: 'Die Tochter lernt Geige.' },
    bruder: { de: 'Bruder', art: 'der', pl: 'die Brüder', tr: 'erkek kardeş', en: 'brother', cefr: 'A1', ex: 'Mein Bruder ist älter als ich.' },
    schwester: { de: 'Schwester', art: 'die', pl: 'die Schwestern', tr: 'kız kardeş', en: 'sister', cefr: 'A1', ex: 'Sie hat zwei Schwestern.' },
    freund: { de: 'Freund', art: 'der', pl: 'die Freunde', tr: 'arkadaş, dost; erkek arkadaş', en: 'friend, boyfriend', cefr: 'A1', ex: 'Ein treuer Freund ist wertvoll.' },
    freundin: { de: 'Freundin', art: 'die', pl: 'die Freundinnen', tr: 'kız arkadaş, dost', en: 'female friend, girlfriend', cefr: 'A1', ex: 'Sie reist mit ihrer Freundin.' },

    // Zaman ve Takvim
    zeit: { de: 'Zeit', art: 'die', pl: 'die Zeiten', tr: 'zaman, vakit', en: 'time', cefr: 'A1', ex: 'Ich habe heute leider keine Zeit.' },
    jahr: { de: 'Jahr', art: 'das', pl: 'die Jahre', tr: 'yıl, sene', en: 'year', cefr: 'A1', ex: 'Ein Jahr hat zwölf Monate.' },
    monat: { de: 'Monat', art: 'der', pl: 'die Monate', tr: 'ay', en: 'month', cefr: 'A1', ex: 'Im nächsten Monat habe ich Urlaub.' },
    woche: { de: 'Woche', art: 'die', pl: 'die Wochen', tr: 'hafta', en: 'week', cefr: 'A1', ex: 'Die Woche vergeht wie im Flug.' },
    tag: { de: 'Tag', art: 'der', pl: 'die Tage', tr: 'gün', en: 'day', cefr: 'A1', ex: 'Heute ist ein herrlicher Tag.' },
    stunde: { de: 'Stunde', art: 'die', pl: 'die Stunden', tr: 'saat (süre/ders)', en: 'hour, lesson', cefr: 'A1', ex: 'Die Besprechung dauert eine Stunde.' },
    minute: { de: 'Minute', art: 'die', pl: 'die Minuten', tr: 'dakika', en: 'minute', cefr: 'A1', ex: 'Warten Sie bitte fünf Minuten.' },
    sekunde: { de: 'Sekunde', art: 'die', pl: 'die Sekunden', tr: 'saniye', en: 'second', cefr: 'A2', ex: 'In wenigen Sekunden ist es soweit.' },
    morgen: { de: 'Morgen', art: 'der', pl: 'die Morgen', tr: 'sabah', en: 'morning', cefr: 'A1', ex: 'Guten Morgen, wie geht es Ihnen?' },
    abend: { de: 'Abend', art: 'der', pl: 'die Abende', tr: 'akşam', en: 'evening', cefr: 'A1', ex: 'Am Abend kochen wir zusammen.' },
    nacht: { de: 'Nacht', art: 'die', pl: 'die Nächte', tr: 'gece', en: 'night', cefr: 'A1', ex: 'In der Nacht ist es kühl.' },

    // Eğitim, İş ve Toplum
    arbeit: { de: 'Arbeit', art: 'die', pl: 'die Arbeiten', tr: 'iş, meslek, çalışma', en: 'work, job', cefr: 'A1', ex: 'Er geht jeden Morgen zur Arbeit.' },
    beruf: { de: 'Beruf', art: 'der', pl: 'die Berufe', tr: 'meslek', en: 'profession, occupation', cefr: 'A1', ex: 'Was sind Sie von Beruf?' },
    schule: { de: 'Schule', art: 'die', pl: 'die Schulen', tr: 'okul', en: 'school', cefr: 'A1', ex: 'Die Schule beginnt um acht Uhr.' },
    universitaet: { de: 'Universität', art: 'die', pl: 'die Universitäten', tr: 'üniversite', en: 'university', cefr: 'A2', ex: 'Sie studiert an der Universität zu Köln.' },
    buch: { de: 'Buch', art: 'das', pl: 'die Bücher', tr: 'kitap', en: 'book', cefr: 'A1', ex: 'Das Buch ist sehr lehrreich.' },
    wort: { de: 'Wort', art: 'das', pl: 'die Wörter', tr: 'kelime, sözcük', en: 'word', cefr: 'A1', ex: 'Schlagen Sie das Wort im Wörterbuch nach!' },
    sprache: { de: 'Sprache', art: 'die', pl: 'die Sprachen', tr: 'dil, lisan', en: 'language, speech', cefr: 'A1', ex: 'Er spricht drei europäische Sprachen.' },
    frage: { de: 'Frage', art: 'die', pl: 'die Fragen', tr: 'soru', en: 'question', cefr: 'A1', ex: 'Darf ich Ihnen eine Frage stellen?' },
    antwort: { de: 'Antwort', art: 'die', pl: 'die Antworten', tr: 'cevap, yanıt', en: 'answer, reply', cefr: 'A1', ex: 'Die Antwort war vollkommen richtig.' },
    problem: { de: 'Problem', art: 'das', pl: 'die Probleme', tr: 'sorun, problem', en: 'problem, issue', cefr: 'A1', ex: 'Kein Problem, das schaffen wir!' },
    loesung: { de: 'Lösung', art: 'die', pl: 'die Lösungen', tr: 'çözüm', en: 'solution', cefr: 'A2', ex: 'Wir haben eine dauerhafte Lösung gefunden.' },
    geld: { de: 'Geld', art: 'das', pl: '—', tr: 'para', en: 'money', cefr: 'A1', ex: 'Zeit ist Geld.' }
  };

  // =========================================================================
  // 3. SIFATLAR VE DERECELENDİRMELERİ (Positiv, Komparativ, Superlativ)
  // =========================================================================
  const CORE_ADJECTIVES = {
    gut: { de: 'gut', komp: 'besser', sup: 'am besten', tr: 'iyi, güzel', en: 'good', cefr: 'A1', ex: 'Das Essen schmeckt wirklich gut.' },
    schlecht: { de: 'schlecht', komp: 'schlechter', sup: 'am schlechtesten', tr: 'kötü', en: 'bad', cefr: 'A1', ex: 'Das Wetter ist heute schlecht.' },
    gross: { de: 'groß', komp: 'größer', sup: 'am größten', tr: 'büyük, iri; boylu', en: 'big, tall, large', cefr: 'A1', ex: 'Berlin ist eine große Stadt.' },
    klein: { de: 'klein', komp: 'kleiner', sup: 'am kleinsten', tr: 'küçük, ufak', en: 'small, little', cefr: 'A1', ex: 'Das Kind hat kleine Hände.' },
    schnell: { de: 'schnell', komp: 'schneller', sup: 'am schnellsten', tr: 'hızlı, çabuk', en: 'fast, quick', cefr: 'A1', ex: 'Der Zug fährt sehr schnell.' },
    langsam: { de: 'langsam', komp: 'langsamer', sup: 'am langsamsten', tr: 'yavaş', en: 'slow', cefr: 'A1', ex: 'Bitte sprechen Sie etwas langsamer!' },
    schoen: { de: 'schön', komp: 'schöner', sup: 'am schönsten', tr: 'güzel, hoş', en: 'beautiful, nice', cefr: 'A1', ex: 'Das ist ein schöner Tag.' },
    haesslich: { de: 'hässlich', komp: 'hässlicher', sup: 'am hässlichsten', tr: 'çirkin', en: 'ugly', cefr: 'A2', ex: 'Das Gebäude wirkt hässlich.' },
    alt: { de: 'alt', komp: 'älter', sup: 'am ältesten', tr: 'eski, yaşlı', en: 'old', cefr: 'A1', ex: 'Die Burg ist sehr alt.' },
    jung: { de: 'jung', komp: 'jünger', sup: 'am jüngsten', tr: 'genç', en: 'young', cefr: 'A1', ex: 'Sie ist eine junge Künstlerin.' },
    neu: { de: 'neu', komp: 'neuer', sup: 'am neuesten', tr: 'yeni', en: 'new', cefr: 'A1', ex: 'Ich habe ein neues Buch gekauft.' },
    warm: { de: 'warm', komp: 'wärmer', sup: 'am wärmsten', tr: 'sıcak, ılık', en: 'warm', cefr: 'A1', ex: 'Heute ist das Wetter angenehm warm.' },
    kalt: { de: 'kalt', komp: 'kälter', sup: 'am kältesten', tr: 'soğuk', en: 'cold', cefr: 'A1', ex: 'Im Winter ist es hier sehr kalt.' },
    heiss: { de: 'heiß', komp: 'heißer', sup: 'am heißesten', tr: 'çok sıcak, kaynar', en: 'hot', cefr: 'A1', ex: 'Vorsicht, der Tee ist heiß!' },
    einfach: { de: 'einfach', komp: 'einfacher', sup: 'am einfachsten', tr: 'kolay, basit', en: 'easy, simple', cefr: 'A1', ex: 'Die Aufgabe ist ziemlich einfach.' },
    schwer: { de: 'schwer', komp: 'schwerer', sup: 'am schwersten', tr: 'zor; ağır', en: 'difficult; heavy', cefr: 'A1', ex: 'Deutsch lernen ist gar nicht so schwer.' },
    leicht: { de: 'leicht', komp: 'leichter', sup: 'am leichtesten', tr: 'kolay; hafif', en: 'easy; light', cefr: 'A1', ex: 'Der Koffer ist erstaunlich leicht.' },
    richtig: { de: 'richtig', komp: 'richtiger', sup: 'am richtigsten', tr: 'doğru, haklı', en: 'correct, right', cefr: 'A1', ex: 'Deine Antwort ist vollkommen richtig.' },
    falsch: { de: 'falsch', komp: 'falscher', sup: 'am falschesten', tr: 'yanlış, hatalı', en: 'wrong, false', cefr: 'A1', ex: 'Das war leider die falsche Nummer.' },
    teuer: { de: 'teuer', komp: 'teurer', sup: 'am teuersten', tr: 'pahalı', en: 'expensive', cefr: 'A1', ex: 'Das Hotel ist viel zu teuer.' },
    billig: { de: 'billig', komp: 'billiger', sup: 'am billigsten', tr: 'ucuz', en: 'cheap', cefr: 'A1', ex: 'Auf dem Markt sind Äpfel billig.' },
    guenstig: { de: 'günstig', komp: 'günstiger', sup: 'am günstigsten', tr: 'uygun fiyatlı, elverişli', en: 'affordable, favorable', cefr: 'A2', ex: 'Wir haben ein günstiges Ticket gefunden.' },
    wichtig: { de: 'wichtig', komp: 'wichtiger', sup: 'am wichtigsten', tr: 'önemli, mühim', en: 'important', cefr: 'A1', ex: 'Gesundheit ist das Wichtigste.' },
    gluecklich: { de: 'glücklich', komp: 'glücklicher', sup: 'am glücklichsten', tr: 'mutlu, mesut', en: 'happy, lucky', cefr: 'A1', ex: 'Wir sind über die Nachricht glücklich.' },
    traurig: { de: 'traurig', komp: 'trauriger', sup: 'am traurigsten', tr: 'üzgün, hüzünlü', en: 'sad', cefr: 'A1', ex: 'Der Film hatte ein trauriges Ende.' },
    muede: { de: 'müde', komp: 'müder', sup: 'am müdesten', tr: 'yorgun, uykulu', en: 'tired', cefr: 'A1', ex: 'Nach der langen Reise bin ich müde.' },
    krank: { de: 'krank', komp: 'kränker', sup: 'am kränksten', tr: 'hasta', en: 'sick, ill', cefr: 'A1', ex: 'Er bleibt heute krank im Bett.' },
    gesund: { de: 'gesund', komp: 'gesünder', sup: 'am gesündesten', tr: 'sağlıklı', en: 'healthy', cefr: 'A1', ex: 'Obst und Sport halten gesund.' }
  };

  // =========================================================================
  // 4. ÇİFT YÖNLÜ TERS EŞLEME TABLOSU (TR -> DE & EN -> DE)
  // =========================================================================
  const REVERSE_MAP = {
    // Türkçe -> Almanca İsimler
    'ev': 'haus', 'konut': 'haus', 'bina': 'haus',
    'daire': 'wohnung',
    'oda': 'zimmer',
    'mutfak': 'kueche',
    'banyo': 'bad',
    'masa': 'tisch',
    'sandalye': 'stuhl',
    'yatak': 'bett',
    'pencere': 'fenster',
    'kapi': 'tuer', 'kapı': 'tuer',
    'lamba': 'lampe',
    'dolap': 'schrank',
    'sehir': 'stadt', 'şehir': 'stadt', 'kent': 'stadt',
    'koy': 'dorf', 'köy': 'dorf',
    'ulke': 'land', 'ülke': 'land', 'memleket': 'land',
    'sokak': 'strasse', 'cadde': 'strasse', 'yol': 'strasse',
    'araba': 'auto', 'otomobil': 'auto',
    'tren': 'zug',
    'otobus': 'bus', 'otobüs': 'bus',
    'bisiklet': 'fahrrad',
    'ucak': 'flugzeug', 'uçak': 'flugzeug',
    'su': 'wasser',
    'ekmek': 'brot',
    'sut': 'milch', 'süt': 'milch',
    'kahve': 'kaffee',
    'cay': 'tee', 'çay': 'tee',
    'peynir': 'kaese',
    'tereyagi': 'butter', 'tereyağı': 'butter',
    'yumurta': 'ei',
    'et': 'fleisch',
    'balik': 'fisch', 'balık': 'fisch',
    'elma': 'apfel',
    'sebze': 'gemuese',
    'meyve': 'obst',
    'seker': 'zucker', 'şeker': 'zucker',
    'tuz': 'salz',
    'insan': 'mensch', 'kisi': 'mensch', 'kişi': 'mensch',
    'adam': 'mann', 'erkek': 'mann',
    'kadin': 'frau', 'kadın': 'frau', 'bayan': 'frau',
    'cocuk': 'kind', 'çocuk': 'kind',
    'anne': 'mutter',
    'baba': 'vater',
    'ogul': 'sohn', 'oğul': 'sohn',
    'kiz': 'tochter', 'kız': 'tochter',
    'kardes': 'bruder', 'kardeş': 'bruder',
    'arkadas': 'freund', 'arkadaş': 'freund', 'dost': 'freund',
    'zaman': 'zeit', 'vakit': 'zeit',
    'yil': 'jahr', 'yıl': 'jahr', 'sene': 'jahr',
    'ay': 'monat',
    'hafta': 'woche',
    'gun': 'tag', 'gün': 'tag',
    'saat': 'stunde',
    'dakika': 'minute',
    'saniye': 'sekunde',
    'sabah': 'morgen',
    'aksam': 'abend', 'akşam': 'abend',
    'gece': 'nacht',
    'is': 'arbeit', 'iş': 'arbeit',
    'okul': 'schule',
    'universite': 'universitaet', 'üniversite': 'universitaet',
    'kitap': 'buch',
    'kelime': 'wort', 'sozcuk': 'wort', 'sözcük': 'wort',
    'dil': 'sprache', 'lisan': 'sprache',
    'soru': 'frage',
    'cevap': 'antwort', 'yanit': 'antwort', 'yanıt': 'antwort',
    'sorun': 'problem', 'problem': 'problem',
    'cozum': 'loesung', 'çözüm': 'loesung',
    'para': 'geld',

    // Türkçe -> Almanca Fiiller
    'olmak': 'sein',
    'sahip olmak': 'haben',
    'gitmek': 'gehen',
    'gelmek': 'kommen',
    'gormek': 'sehen', 'görmek': 'sehen', 'bakmak': 'sehen',
    'surmek': 'fahren', 'sürmek': 'fahren',
    'ucmak': 'fliegen', 'uçmak': 'fliegen',
    'almak': 'nehmen',
    'vermek': 'geben',
    'getirmek': 'bringen',
    'konusmak': 'sprechen', 'konuşmak': 'sprechen',
    'soylemek': 'sagen', 'söylemek': 'sagen', 'demek': 'sagen',
    'yardim etmek': 'helfen', 'yardım etmek': 'helfen',
    'dusunmek': 'denken', 'düşünmek': 'denken',
    'bilmek': 'wissen',
    'tanimak': 'kennen', 'tanımak': 'kennen',
    'kalmak': 'bleiben',
    'yazmak': 'schreiben',
    'okumak': 'lesen',
    'yemek': 'essen',
    'icmek': 'trinken', 'içmek': 'trinken',
    'bulmak': 'finden',
    'aramak': 'suchen',
    'kaybetmek': 'verlieren',
    'kazanmak': 'gewinnen',
    'uyumak': 'schlafen',
    'kalkmak': 'aufstehen', 'uyanmak': 'aufstehen',
    'baslamak': 'anfangen', 'başlamak': 'anfangen',
    'anlamak': 'verstehen',
    'aciklamak': 'erklären', 'açıklamak': 'erklären',
    'ogrenmek': 'lernen', 'öğrenmek': 'lernen',
    'calismak': 'arbeiten', 'çalışmak': 'arbeiten',
    'yapmak': 'machen', 'etmek': 'machen',
    'satinalmak': 'kaufen', 'satın almak': 'kaufen',
    'satmak': 'verkaufen',
    'odemek': 'bezahlen', 'ödemek': 'bezahlen',
    'yasamak': 'wohnen', 'yaşamak': 'wohnen', 'oturmak': 'wohnen',
    'olmek': 'sterben', 'ölmek': 'sterben',
    'sormak': 'fragen',
    'cevap vermek': 'antworten',
    'acmak': 'öffnen', 'açmak': 'öffnen',
    'kapatmak': 'schließen',
    'istemek': 'wollen',
    'sevmek': 'lieben',
    'nefret etmek': 'hassen',
    'unutmak': 'vergessen',
    'hatirlamak': 'erinnern', 'hatırlamak': 'erinnern',
    'beklemek': 'warten',
    'dinlemek': 'hoeren', 'duymak': 'hoeren',

    // Türkçe -> Almanca Sıfatlar
    'iyi': 'gut', 'guzel': 'schoen', 'güzel': 'schoen',
    'kotu': 'schlecht', 'kötü': 'schlecht',
    'buyuk': 'gross', 'büyük': 'gross',
    'kucuk': 'klein', 'küçük': 'klein',
    'hizli': 'schnell', 'hızlı': 'schnell', 'cabuk': 'schnell', 'çabuk': 'schnell',
    'yavas': 'langsam', 'yavaş': 'langsam',
    'eski': 'alt', 'yasli': 'alt', 'yaşlı': 'alt',
    'genc': 'jung', 'genç': 'jung',
    'yeni': 'neu',
    'sicak': 'warm', 'sıcak': 'warm',
    'soguk': 'kalt', 'soğuk': 'kalt',
    'kolay': 'einfach', 'basit': 'einfach',
    'zor': 'schwer', 'agir': 'schwer', 'ağır': 'schwer',
    'hafif': 'leicht',
    'dogru': 'richtig', 'doğru': 'richtig',
    'yanlis': 'falsch', 'yanlış': 'falsch',
    'pahali': 'teuer', 'pahalı': 'teuer',
    'ucuz': 'billig',
    'onemli': 'wichtig', 'önemli': 'wichtig',
    'mutlu': 'gluecklich',
    'uzgun': 'traurig', 'üzgün': 'traurig',
    'yorgun': 'muede',
    'hasta': 'krank',
    'saglikli': 'gesund', 'sağlıklı': 'gesund',

    // English -> German
    'house': 'haus', 'home': 'haus', 'building': 'haus',
    'apartment': 'wohnung', 'flat': 'wohnung',
    'room': 'zimmer',
    'kitchen': 'kueche',
    'bathroom': 'bad',
    'table': 'tisch',
    'chair': 'stuhl',
    'bed': 'bett',
    'window': 'fenster',
    'door': 'tuer',
    'city': 'stadt', 'town': 'stadt',
    'country': 'land',
    'car': 'auto', 'automobile': 'auto',
    'train': 'zug',
    'bus': 'bus',
    'water': 'wasser',
    'bread': 'brot',
    'milk': 'milch',
    'coffee': 'kaffee',
    'tea': 'tee',
    'meat': 'fleisch',
    'fish': 'fisch',
    'apple': 'apfel',
    'man': 'mann',
    'woman': 'frau',
    'child': 'kind',
    'friend': 'freund',
    'time': 'zeit',
    'day': 'tag',
    'year': 'jahr',
    'night': 'nacht',
    'work': 'arbeiten', 'job': 'arbeit',
    'school': 'schule',
    'book': 'buch',
    'word': 'wort',
    'question': 'frage',
    'answer': 'antwort',
    'go': 'gehen',
    'come': 'kommen',
    'see': 'sehen',
    'drive': 'fahren',
    'take': 'nehmen',
    'give': 'geben',
    'speak': 'sprechen',
    'help': 'helfen',
    'think': 'denken',
    'know': 'wissen',
    'stay': 'bleiben',
    'write': 'schreiben',
    'read': 'lesen',
    'eat': 'essen',
    'drink': 'trinken',
    'find': 'finden',
    'sleep': 'schlafen',
    'learn': 'lernen',
    'buy': 'kaufen',
    'sell': 'verkaufen',
    'pay': 'bezahlen',
    'ask': 'fragen',
    'love': 'lieben',
    'good': 'gut',
    'bad': 'schlecht',
    'big': 'gross', 'large': 'gross',
    'small': 'klein', 'little': 'klein',
    'fast': 'schnell', 'quick': 'schnell',
    'slow': 'langsam',
    'old': 'alt',
    'young': 'jung',
    'new': 'neu',
    'easy': 'einfach',
    'difficult': 'schwer', 'hard': 'schwer',
    'happy': 'gluecklich',
    'important': 'wichtig'
  };

  // =========================================================================
  // 5. NORMALİZASYON VE ÇEKİM TERS İNDEKSİ (ging -> gehen, Häuser -> Haus)
  // =========================================================================
  const INFLECTION_INDEX = {};

  // Düzensiz fiil çekimlerini endeksle
  Object.keys(IRREGULAR_VERBS).forEach(verb => {
    const data = IRREGULAR_VERBS[verb];
    if (data.praesens) INFLECTION_INDEX[data.praesens.toLowerCase()] = verb;
    if (data.praeteritum) INFLECTION_INDEX[data.praeteritum.toLowerCase()] = verb;
    if (data.partizipZwei) INFLECTION_INDEX[data.partizipZwei.toLowerCase()] = verb;
  });

  // İsimlerin çoğul formlarını endeksle
  Object.keys(CORE_NOUNS).forEach(key => {
    const data = CORE_NOUNS[key];
    if (data.pl && data.pl !== '—') {
      const cleanPlural = data.pl.replace(/^die\s+/i, '').toLowerCase();
      INFLECTION_INDEX[cleanPlural] = key;
    }
  });

  // Sıfat derecelendirmelerini endeksle
  Object.keys(CORE_ADJECTIVES).forEach(key => {
    const data = CORE_ADJECTIVES[key];
    if (data.komp) INFLECTION_INDEX[data.komp.toLowerCase()] = key;
    if (data.sup) {
      const cleanSup = data.sup.replace(/^am\s+/i, '').toLowerCase();
      INFLECTION_INDEX[cleanSup] = key;
    }
  });

  // =========================================================================
  // 6. MOTOR SINIFI (OfflineDictionaryEngine)
  // =========================================================================
  class OfflineDictionaryEngine {
    constructor() {
      this.customEntries = new Map();
    }

    /**
     * Metni aramaya hazır hale getirir (küçük harf, noktalama ve artikel temizleme)
     */
    static normalize(term) {
      if (!term || typeof term !== 'string') return '';
      return term
        .toLowerCase()
        .replace(/^(der|die|das|the|to|bir)\s+/i, '')
        .replace(/[\.,:;!?"'„“”()]/g, '')
        .trim();
    }

    /**
     * Almanca özel karakterleri dönüştürür (ä->ae, ß->ss)
     */
    static umlautFold(str) {
      return (str || '')
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss');
    }

    /**
     * Tek satırda kelime arar ve WortMeister kart modeline uygun nesne döner.
     * @param {string} query Aranacak kelime (Almanca, Türkçe veya İngilizce)
     * @returns {Object|null} Kart nesnesi veya bulunamazsa null
     */
    search(query) {
      if (!query || typeof query !== 'string') return null;
      const raw = query.trim();
      const norm = OfflineDictionaryEngine.normalize(raw);
      const folded = OfflineDictionaryEngine.umlautFold(norm);
      if (!norm) return null;

      // 1. Kullanıcının harici olarak yüklediği dinamik veritabanında ara
      if (this.customEntries.has(norm)) return this.customEntries.get(norm);
      if (this.customEntries.has(folded)) return this.customEntries.get(folded);

      // 2. Çekimli bir fiil, çoğul bir isim veya komparativ bir sıfat mı? (ging -> gehen, Häuser -> Haus)
      if (INFLECTION_INDEX[norm]) {
        return this.search(INFLECTION_INDEX[norm]);
      }
      if (INFLECTION_INDEX[folded]) {
        return this.search(INFLECTION_INDEX[folded]);
      }

      // 3. Doğrudan Almanca Düzensiz Fiillerde ara
      if (IRREGULAR_VERBS[norm] || IRREGULAR_VERBS[folded]) {
        const vKey = IRREGULAR_VERBS[norm] ? norm : folded;
        const v = IRREGULAR_VERBS[vKey];
        return {
          germanWord: vKey,
          article: null,
          pluralForm: null,
          partOfSpeech: 'VERB',
          praesens: v.praesens || null,
          praeteritum: v.praeteritum || null,
          partizipZwei: v.partizipZwei || null,
          hilfsverb: v.hilfsverb || 'hat',
          imperativ: v.imperativ || null,
          isSeparable: !!v.isSeparable,
          separablePrefix: v.separablePrefix || null,
          meaningsTr: v.tr || '',
          meaningsEn: v.en || '',
          cefr: v.cefr || 'A1',
          examples: [
            `Ich muss heute viel ${vKey}.`,
            `Er hat gestern ${v.partizipZwei || vKey} und war sehr zufrieden.`
          ],
          exampleSentence: `Ich muss heute ${vKey}.`,
          isOffline: true
        };
      }

      // 4. Doğrudan Temel İsimlerde ara
      if (CORE_NOUNS[norm] || CORE_NOUNS[folded]) {
        const nKey = CORE_NOUNS[norm] ? norm : folded;
        const n = CORE_NOUNS[nKey];
        return {
          germanWord: n.de,
          article: n.art,
          pluralForm: n.pl,
          partOfSpeech: 'NOUN',
          praesens: null,
          praeteritum: null,
          partizipZwei: null,
          hilfsverb: null,
          meaningsTr: n.tr,
          meaningsEn: n.en,
          cefr: n.cefr || 'A1',
          examples: n.ex ? [n.ex] : [],
          exampleSentence: n.ex || `Das ist ein ${n.de}.`,
          isOffline: true
        };
      }

      // 5. Doğrudan Sıfatlarda ara
      if (CORE_ADJECTIVES[norm] || CORE_ADJECTIVES[folded]) {
        const aKey = CORE_ADJECTIVES[norm] ? norm : folded;
        const a = CORE_ADJECTIVES[aKey];
        return {
          germanWord: a.de,
          article: null,
          pluralForm: null,
          partOfSpeech: 'ADJECTIVE',
          komparativ: a.komp,
          superlativ: a.sup,
          meaningsTr: a.tr,
          meaningsEn: a.en,
          cefr: a.cefr || 'A1',
          examples: a.ex ? [a.ex] : [],
          exampleSentence: a.ex || `Es ist sehr ${a.de}.`,
          isOffline: true
        };
      }

      // 6. Türkçe veya İngilizce'den Almanca'ya Ters Eşleme
      if (REVERSE_MAP[norm] || REVERSE_MAP[folded]) {
        const targetLemma = REVERSE_MAP[norm] || REVERSE_MAP[folded];
        return this.search(targetLemma);
      }

      return null;
    }

    /**
     * 0ms anlık otomatik tamamlama ve arama önerileri listesi döner
     * @param {string} prefix Kullanıcının girdiği harfler
     * @param {number} limit Maksimum öneri sayısı (varsayılan: 8)
     */
    getSuggestions(prefix, limit = 8) {
      if (!prefix || typeof prefix !== 'string') return [];
      const norm = OfflineDictionaryEngine.normalize(prefix);
      if (norm.length < 1) return [];

      const results = new Set();

      // Almanca isimler
      for (const key of Object.keys(CORE_NOUNS)) {
        const item = CORE_NOUNS[key];
        if (item.de.toLowerCase().startsWith(norm) || key.startsWith(norm)) {
          results.add(`${item.art} ${item.de}`);
          if (results.size >= limit) return Array.from(results);
        }
      }

      // Almanca fiiller
      for (const verb of Object.keys(IRREGULAR_VERBS)) {
        if (verb.startsWith(norm)) {
          results.add(verb);
          if (results.size >= limit) return Array.from(results);
        }
      }

      // Almanca sıfatlar
      for (const adj of Object.keys(CORE_ADJECTIVES)) {
        const item = CORE_ADJECTIVES[adj];
        if (item.de.toLowerCase().startsWith(norm) || adj.startsWith(norm)) {
          results.add(item.de);
          if (results.size >= limit) return Array.from(results);
        }
      }

      // Ters eşleme (Türkçe / İngilizce aramalar için)
      for (const word of Object.keys(REVERSE_MAP)) {
        if (word.startsWith(norm)) {
          results.add(word);
          if (results.size >= limit) return Array.from(results);
        }
      }

      return Array.from(results);
    }

    /**
     * 5-10 MB'lık harici sözlük veritabanını (JSON dizisi veya nesnesi) tek seferde ekler.
     * @param {Array<Object>|Object} data 
     */
    importAdditionalDictionary(data) {
      if (!data) return 0;
      let count = 0;

      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.germanWord) {
            const key = OfflineDictionaryEngine.normalize(item.germanWord);
            this.customEntries.set(key, item);
            count++;
          }
        }
      } else if (typeof data === 'object') {
        for (const [key, val] of Object.entries(data)) {
          this.customEntries.set(OfflineDictionaryEngine.normalize(key), val);
          count++;
        }
      }

      return count;
    }
  }

  // Global Singleton Örnekleme
  const instance = new OfflineDictionaryEngine();

  // Tarayıcı ve PWA Ortamı için window nesnesine ata
  if (typeof window !== 'undefined') {
    window.OfflineDictionary = instance;
    window.OfflineDictionaryEngine = OfflineDictionaryEngine;
  }

  // Node.js veya ES Modül uyumluluğu
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OfflineDictionary: instance, OfflineDictionaryEngine };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
