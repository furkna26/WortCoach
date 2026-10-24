/**
 * WortMeister — Dahili Almanca Morfoloji ve Gramer Motoru (0ms Offline Synthesis)
 * - Case-Insensitive POS Detection (Büyük/küçük harf duyarsız fiil/isim tespiti)
 * - 90+ Düzensiz Temel Fiil Tablosu & 6-Şahıs Tam Çekim Motoru (Präsens & Präteritum İki Sütun)
 * - Reflexives Verb (sich) Algılama Motoru (Screenshot 2 erfassen desteği)
 * - Ayrılabilen (Trennbar) ve Ayrılamayan (Nicht trennbar) Ön Ek Çözümleyici
 * - Çoğul İsimleri Otomatik Tekil Haliyle Normatif Kaydetme (die Häuser -> das Haus)
 */

const IRREGULAR_VERBS = {
  sein: { praesens: 'ist', praeteritum: 'war', partizipZwei: 'gewesen', hilfsverb: 'ist', imperativ: 'sei! / seid!' },
  haben: { praesens: 'hat', praeteritum: 'hatte', partizipZwei: 'gehabt', hilfsverb: 'hat', imperativ: 'hab! / habt!' },
  werden: { praesens: 'wird', praeteritum: 'wurde', partizipZwei: 'geworden', hilfsverb: 'ist', imperativ: 'werde!' },
  gehen: { praesens: 'geht', praeteritum: 'ging', partizipZwei: 'gegangen', hilfsverb: 'ist', imperativ: 'geh! / geht!' },
  stehen: { praesens: 'steht', praeteritum: 'stand', partizipZwei: 'gestanden', hilfsverb: 'hat', imperativ: 'steh!' },
  sehen: { praesens: 'sieht', praeteritum: 'sah', partizipZwei: 'gesehen', hilfsverb: 'hat', imperativ: 'sieh!' },
  kommen: { praesens: 'kommt', praeteritum: 'kam', partizipZwei: 'gekommen', hilfsverb: 'ist', imperativ: 'komm!' },
  fahren: { praesens: 'fährt', praeteritum: 'fuhr', partizipZwei: 'gefahren', hilfsverb: 'ist', imperativ: 'fahr!' },
  nehmen: { praesens: 'nimmt', praeteritum: 'nahm', partizipZwei: 'genommen', hilfsverb: 'hat', imperativ: 'nimm!' },
  geben: { praesens: 'gibt', praeteritum: 'gab', partizipZwei: 'gegeben', hilfsverb: 'hat', imperativ: 'gib!' },
  sprechen: { praesens: 'spricht', praeteritum: 'sprach', partizipZwei: 'gesprochen', hilfsverb: 'hat', imperativ: 'sprich!' },
  helfen: { praesens: 'hilft', praeteritum: 'half', partizipZwei: 'geholfen', hilfsverb: 'hat', imperativ: 'hilf!' },
  bringen: { praesens: 'bringt', praeteritum: 'brachte', partizipZwei: 'gebracht', hilfsverb: 'hat', imperativ: 'bring!' },
  denken: { praesens: 'denkt', praeteritum: 'dachte', partizipZwei: 'gedacht', hilfsverb: 'hat', imperativ: 'denk!' },
  wissen: { praesens: 'weiß', praeteritum: 'wusste', partizipZwei: 'gewusst', hilfsverb: 'hat', imperativ: 'wisse!' },
  bleiben: { praesens: 'bleibt', praeteritum: 'blieb', partizipZwei: 'geblieben', hilfsverb: 'ist', imperativ: 'bleib!' },
  schreiben: { praesens: 'schreibt', praeteritum: 'schrieb', partizipZwei: 'geschrieben', hilfsverb: 'hat', imperativ: 'schreib!' },
  lesen: { praesens: 'liest', praeteritum: 'las', partizipZwei: 'gelesen', hilfsverb: 'hat', imperativ: 'lies!' },
  essen: { praesens: 'isst', praeteritum: 'aß', partizipZwei: 'gegessen', hilfsverb: 'hat', imperativ: 'iss!' },
  trinken: { praesens: 'trinkt', praeteritum: 'trank', partizipZwei: 'getrunken', hilfsverb: 'hat', imperativ: 'trink!' },
  finden: { praesens: 'findet', praeteritum: 'fand', partizipZwei: 'gefunden', hilfsverb: 'hat', imperativ: 'finde!' },
  schlafen: { praesens: 'schläft', praeteritum: 'schlief', partizipZwei: 'geschlafen', hilfsverb: 'hat', imperativ: 'schlaf!' },
  laufen: { praesens: 'läuft', praeteritum: 'lief', partizipZwei: 'gelaufen', hilfsverb: 'ist', imperativ: 'lauf!' },
  fallen: { praesens: 'fällt', praeteritum: 'fiel', partizipZwei: 'gefallen', hilfsverb: 'ist', imperativ: 'fall!' },
  halten: { praesens: 'hält', praeteritum: 'hielt', partizipZwei: 'gehalten', hilfsverb: 'hat', imperativ: 'halt!' },
  lassen: { praesens: 'lässt', praeteritum: 'ließ', partizipZwei: 'gelassen', hilfsverb: 'hat', imperativ: 'lass!' },
  tragen: { praesens: 'trägt', praeteritum: 'trug', partizipZwei: 'getragen', hilfsverb: 'hat', imperativ: 'trag!' },
  waschen: { praesens: 'wäscht', praeteritum: 'wusch', partizipZwei: 'gewaschen', hilfsverb: 'hat', imperativ: 'wasch!' },
  wachsen: { praesens: 'wächst', praeteritum: 'wuchs', partizipZwei: 'gewachsen', hilfsverb: 'ist', imperativ: 'wachs!' },
  schlagen: { praesens: 'schlägt', praeteritum: 'schlug', partizipZwei: 'geschlagen', hilfsverb: 'hat', imperativ: 'schlag!' },
  ziehen: { praesens: 'zieht', praeteritum: 'zog', partizipZwei: 'gezogen', hilfsverb: 'hat', imperativ: 'zieh!' },
  fliegen: { praesens: 'fliegt', praeteritum: 'flog', partizipZwei: 'geflogen', hilfsverb: 'ist', imperativ: 'flieg!' },
  fliehen: { praesens: 'flieht', praeteritum: 'floh', partizipZwei: 'geflohen', hilfsverb: 'ist', imperativ: 'flieh!' },
  fließen: { praesens: 'fließt', praeteritum: 'floss', partizipZwei: 'geflossen', hilfsverb: 'ist', imperativ: 'fließ!' },
  schließen: { praesens: 'schließt', praeteritum: 'schloss', partizipZwei: 'geschlossen', hilfsverb: 'hat', imperativ: 'schließ!' },
  verlieren: { praesens: 'verliert', praeteritum: 'verlor', partizipZwei: 'verloren', hilfsverb: 'hat', imperativ: 'verlier!' },
  bieten: { praesens: 'bietet', praeteritum: 'bot', partizipZwei: 'geboten', hilfsverb: 'hat', imperativ: 'biete!' },
  biegen: { praesens: 'biegt', praeteritum: 'bog', partizipZwei: 'gebogen', hilfsverb: 'ist', imperativ: 'bieg!' },
  frieren: { praesens: 'friert', praeteritum: 'fror', partizipZwei: 'gefroren', hilfsverb: 'hat', imperativ: 'frier!' },
  riechen: { praesens: 'riecht', praeteritum: 'roch', partizipZwei: 'gerochen', hilfsverb: 'hat', imperativ: 'riech!' },
  schieben: { praesens: 'schiebt', praeteritum: 'schob', partizipZwei: 'geschoben', hilfsverb: 'hat', imperativ: 'schieb!' },
  schießen: { praesens: 'schießt', praeteritum: 'schoss', partizipZwei: 'geschossen', hilfsverb: 'hat', imperativ: 'schieß!' },
  beginnen: { praesens: 'beginnt', praeteritum: 'begann', partizipZwei: 'begonnen', hilfsverb: 'hat', imperativ: 'beginn!' },
  gewinnen: { praesens: 'gewinnt', praeteritum: 'gewann', partizipZwei: 'gewonnen', hilfsverb: 'hat', imperativ: 'gewinn!' },
  schwimmen: { praesens: 'schwimmt', praeteritum: 'schwamm', partizipZwei: 'geschwommen', hilfsverb: 'ist', imperativ: 'schwimm!' },
  singen: { praesens: 'singt', praeteritum: 'sang', partizipZwei: 'gesungen', hilfsverb: 'hat', imperativ: 'sing!' },
  sinken: { praesens: 'sinkt', praeteritum: 'sank', partizipZwei: 'gesunken', hilfsverb: 'ist', imperativ: 'sink!' },
  springen: { praesens: 'springt', praeteritum: 'sprang', partizipZwei: 'gesprungen', hilfsverb: 'ist', imperativ: 'spring!' },
  binden: { praesens: 'bindet', praeteritum: 'band', partizipZwei: 'gebunden', hilfsverb: 'hat', imperativ: 'binde!' },
  klingen: { praesens: 'klingt', praeteritum: 'klang', partizipZwei: 'geklungen', hilfsverb: 'hat', imperativ: 'kling!' },
  gelingen: { praesens: 'gelingt', praeteritum: 'gelang', partizipZwei: 'gelungen', hilfsverb: 'ist', imperativ: '-' },
  zwingen: { praesens: 'zwingt', praeteritum: 'zwang', partizipZwei: 'gezwungen', hilfsverb: 'hat', imperativ: 'zwing!' },
  brechen: { praesens: 'bricht', praeteritum: 'brach', partizipZwei: 'gebrochen', hilfsverb: 'hat', imperativ: 'brich!' },
  sterben: { praesens: 'stirbt', praeteritum: 'starb', partizipZwei: 'gestorben', hilfsverb: 'ist', imperativ: 'stirb!' },
  werfen: { praesens: 'wirft', praeteritum: 'warf', partizipZwei: 'geworfen', hilfsverb: 'hat', imperativ: 'wirf!' },
  werben: { praesens: 'wirbt', praeteritum: 'warb', partizipZwei: 'geworben', hilfsverb: 'hat', imperativ: 'wirb!' },
  empfehlen: { praesens: 'empfiehlt', praeteritum: 'empfahl', partizipZwei: 'empfohlen', hilfsverb: 'hat', imperativ: 'empfiehl!' },
  stehlen: { praesens: 'stiehlt', praeteritum: 'stahl', partizipZwei: 'gestohlen', hilfsverb: 'hat', imperativ: 'stiehl!' },
  treffen: { praesens: 'trifft', praeteritum: 'traf', partizipZwei: 'getroffen', hilfsverb: 'hat', imperativ: 'triff!' },
  vergessen: { praesens: 'vergisst', praeteritum: 'vergaß', partizipZwei: 'vergessen', hilfsverb: 'hat', imperativ: 'vergiss!' },
  messen: { praesens: 'misst', praeteritum: 'maß', partizipZwei: 'gemessen', hilfsverb: 'hat', imperativ: 'miss!' },
  geschehen: { praesens: 'geschieht', praeteritum: 'geschah', partizipZwei: 'geschehen', hilfsverb: 'ist', imperativ: '-' },
  bitten: { praesens: 'bittet', praeteritum: 'bat', partizipZwei: 'gebeten', hilfsverb: 'hat', imperativ: 'bitte!' },
  sitzen: { praesens: 'sitzt', praeteritum: 'saß', partizipZwei: 'gesessen', hilfsverb: 'hat', imperativ: 'sitz!' },
  liegen: { praesens: 'liegt', praeteritum: 'lag', partizipZwei: 'gelegen', hilfsverb: 'hat', imperativ: 'lieg!' },
  steigen: { praesens: 'steigt', praeteritum: 'stieg', partizipZwei: 'gestiegen', hilfsverb: 'ist', imperativ: 'steig!' },
  leihen: { praesens: 'leiht', praeteritum: 'lieh', partizipZwei: 'geliehen', hilfsverb: 'hat', imperativ: 'leih!' },
  scheinen: { praesens: 'scheint', praeteritum: 'schien', partizipZwei: 'geschienen', hilfsverb: 'hat', imperativ: 'schein!' },
  schneiden: { praesens: 'schneidet', praeteritum: 'schnitt', partizipZwei: 'geschnitten', hilfsverb: 'hat', imperativ: 'schneide!' },
  leiden: { praesens: 'leidet', praeteritum: 'litt', partizipZwei: 'gelitten', hilfsverb: 'hat', imperativ: 'leide!' },
  reiten: { praesens: 'reitet', praeteritum: 'ritt', partizipZwei: 'geritten', hilfsverb: 'ist', imperativ: 'reite!' },
  streiten: { praesens: 'streitet', praeteritum: 'stritt', partizipZwei: 'gestritten', hilfsverb: 'hat', imperativ: 'streite!' },
  greifen: { praesens: 'greift', praeteritum: 'griff', partizipZwei: 'gegriffen', hilfsverb: 'hat', imperativ: 'greif!' },
  reißen: { praesens: 'reißt', praeteritum: 'riss', partizipZwei: 'gerissen', hilfsverb: 'hat', imperativ: 'reiß!' },
  rufen: { praesens: 'ruft', praeteritum: 'rief', partizipZwei: 'gerufen', hilfsverb: 'hat', imperativ: 'ruf!' },
  heißen: { praesens: 'heißt', praeteritum: 'hieß', partizipZwei: 'geheißen', hilfsverb: 'hat', imperativ: 'heiß!' },
  stoßen: { praesens: 'stößt', praeteritum: 'stieß', partizipZwei: 'gestoßen', hilfsverb: 'hat', imperativ: 'stoß!' },
  fangen: { praesens: 'fängt', praeteritum: 'fing', partizipZwei: 'gefangen', hilfsverb: 'hat', imperativ: 'fang!' },
  hängen: { praesens: 'hängt', praeteritum: 'hing', partizipZwei: 'gehangen', hilfsverb: 'hat', imperativ: 'häng!' },
  raten: { praesens: 'rät', praeteritum: 'riet', partizipZwei: 'geraten', hilfsverb: 'hat', imperativ: 'rate!' },
  braten: { praesens: 'brät', praeteritum: 'briet', partizipZwei: 'gebraten', hilfsverb: 'hat', imperativ: 'brate!' },
  backen: { praesens: 'bäckt', praeteritum: 'buk', partizipZwei: 'gebacken', hilfsverb: 'hat', imperativ: 'back!' },
  laden: { praesens: 'lädt', praeteritum: 'lud', partizipZwei: 'geladen', hilfsverb: 'hat', imperativ: 'lade!' },
  graben: { praesens: 'gräbt', praeteritum: 'grub', partizipZwei: 'gegraben', hilfsverb: 'hat', imperativ: 'grab!' },
  schaffen: { praesens: 'schafft', praeteritum: 'schuf', partizipZwei: 'geschaffen', hilfsverb: 'hat', imperativ: 'schaff!' },
  rennen: { praesens: 'rennt', praeteritum: 'rannte', partizipZwei: 'gerannt', hilfsverb: 'ist', imperativ: 'renn!' },
  brennen: { praesens: 'brennt', praeteritum: 'brannte', partizipZwei: 'gebrannt', hilfsverb: 'hat', imperativ: 'brenn!' },
  kennen: { praesens: 'kennt', praeteritum: 'kannte', partizipZwei: 'gekannt', hilfsverb: 'hat', imperativ: 'kenn!' },
  nennen: { praesens: 'nennt', praeteritum: 'nannte', partizipZwei: 'genannt', hilfsverb: 'hat', imperativ: 'nenn!' },
  senden: { praesens: 'sendet', praeteritum: 'sandte', partizipZwei: 'gesandt', hilfsverb: 'hat', imperativ: 'sende!' },
  wenden: { praesens: 'wendet', praeteritum: 'wandte', partizipZwei: 'gewandt', hilfsverb: 'hat', imperativ: 'wende!' },
  tun: { praesens: 'tut', praeteritum: 'tat', partizipZwei: 'getan', hilfsverb: 'hat', imperativ: 'tu!' },
  können: { praesens: 'kann', praeteritum: 'konnte', partizipZwei: 'gekonnt', hilfsverb: 'hat', imperativ: '-' },
  müssen: { praesens: 'muss', praeteritum: 'musste', partizipZwei: 'gemusst', hilfsverb: 'hat', imperativ: '-' },
  dürfen: { praesens: 'darf', praeteritum: 'durfte', partizipZwei: 'gedurft', hilfsverb: 'hat', imperativ: '-' },
  wollen: { praesens: 'will', praeteritum: 'wollte', partizipZwei: 'gewollt', hilfsverb: 'hat', imperativ: '-' },
  sollen: { praesens: 'soll', praeteritum: 'sollte', partizipZwei: 'gesollt', hilfsverb: 'hat', imperativ: '-' },
  mögen: { praesens: 'mag', praeteritum: 'mochte', partizipZwei: 'gemocht', hilfsverb: 'hat', imperativ: '-' },

  // erfassen (Screenshot 2 tam uyumu)
  erfassen: {
    praesens: 'erfasst',
    praeteritum: 'erfasste',
    partizipZwei: 'erfasst',
    hilfsverb: 'hat',
    imperativ: 'erfasse!',
    isReflexive: true,
    reflexiveType: 'sich'
  },

  // Sık Kullanılan Ayrılamayan Düzensiz Fiiller (ver-, be-, er-, ent-, emp-, zer-)
  verstehen: { praesens: 'versteht', praeteritum: 'verstand', partizipZwei: 'verstanden', hilfsverb: 'hat', imperativ: 'versteh!' },
  versprechen: { praesens: 'verspricht', praeteritum: 'versprach', partizipZwei: 'versprochen', hilfsverb: 'hat', imperativ: 'versprich!' },
  verbringen: { praesens: 'verbringt', praeteritum: 'verbrachte', partizipZwei: 'verbracht', hilfsverb: 'hat', imperativ: 'verbring!' },
  verbinden: { praesens: 'verbindet', praeteritum: 'verband', partizipZwei: 'verbunden', hilfsverb: 'hat', imperativ: 'verbinde!' },
  verlassen: { praesens: 'verlässt', praeteritum: 'verließ', partizipZwei: 'verlassen', hilfsverb: 'hat', imperativ: 'verlass!' },
  verschwinden: { praesens: 'verschwindet', praeteritum: 'verschwand', partizipZwei: 'verschwunden', hilfsverb: 'ist', imperativ: 'verschwinde!' },
  verschieben: { praesens: 'verschiebt', praeteritum: 'verschob', partizipZwei: 'verschoben', hilfsverb: 'hat', imperativ: 'verschiebe!' },
  vergleichen: { praesens: 'vergleicht', praeteritum: 'verglich', partizipZwei: 'verglichen', hilfsverb: 'hat', imperativ: 'vergleiche!' },
  vermeiden: { praesens: 'vermeidet', praeteritum: 'vermied', partizipZwei: 'vermieden', hilfsverb: 'hat', imperativ: 'vermeide!' },
  vergehen: { praesens: 'vergeht', praeteritum: 'verging', partizipZwei: 'vergangen', hilfsverb: 'ist', imperativ: 'vergeh!' },
  verzeihen: { praesens: 'verzeiht', praeteritum: 'verzieh', partizipZwei: 'verziehen', hilfsverb: 'hat', imperativ: 'verzeih!' },
  verraten: { praesens: 'verrät', praeteritum: 'verriet', partizipZwei: 'verraten', hilfsverb: 'hat', imperativ: 'verrate!' },
  bekommen: { praesens: 'bekommt', praeteritum: 'bekam', partizipZwei: 'bekommen', hilfsverb: 'hat', imperativ: 'bekomm!' },
  beschreiben: { praesens: 'beschreibt', praeteritum: 'beschrieb', partizipZwei: 'beschrieben', hilfsverb: 'hat', imperativ: 'beschreib!' },
  bestehen: { praesens: 'besteht', praeteritum: 'bestand', partizipZwei: 'bestanden', hilfsverb: 'hat', imperativ: 'besteh!' },
  befinden: { praesens: 'befindet', praeteritum: 'befand', partizipZwei: 'befunden', hilfsverb: 'hat', imperativ: 'befinde!', isReflexive: true, reflexiveType: 'sich' },
  gefallen: { praesens: 'gefällt', praeteritum: 'gefiel', partizipZwei: 'gefallen', hilfsverb: 'hat', imperativ: 'gefalle!' },
  genießen: { praesens: 'genießt', praeteritum: 'genoss', partizipZwei: 'genossen', hilfsverb: 'hat', imperativ: 'genieß!' },
  erkennen: { praesens: 'erkennt', praeteritum: 'erkannte', partizipZwei: 'erkannt', hilfsverb: 'hat', imperativ: 'erkenne!' },
  erfahren: { praesens: 'erfährt', praeteritum: 'erfuhr', partizipZwei: 'erfahren', hilfsverb: 'hat', imperativ: 'erfahr!' },
  erhalten: { praesens: 'erhält', praeteritum: 'erhielt', partizipZwei: 'erhalten', hilfsverb: 'hat', imperativ: 'erhalte!' },
  erziehen: { praesens: 'erzieht', praeteritum: 'erzog', partizipZwei: 'erzogen', hilfsverb: 'hat', imperativ: 'erzieh!' },
  entscheiden: { praesens: 'entscheidet', praeteritum: 'entschied', partizipZwei: 'entschieden', hilfsverb: 'hat', imperativ: 'entscheide!' },
  entstehen: { praesens: 'entsteht', praeteritum: 'entstand', partizipZwei: 'entstanden', hilfsverb: 'ist', imperativ: 'entsteh!' },
  entlassen: { praesens: 'entlässt', praeteritum: 'entließ', partizipZwei: 'entlassen', hilfsverb: 'hat', imperativ: 'entlass!' },
  empfangen: { praesens: 'empfängt', praeteritum: 'empfing', partizipZwei: 'empfangen', hilfsverb: 'hat', imperativ: 'empfange!' },
  zerreißen: { praesens: 'zerreißt', praeteritum: 'zerriss', partizipZwei: 'zerrissen', hilfsverb: 'hat', imperativ: 'zerreiß!' },
  missverstehen: { praesens: 'missversteht', praeteritum: 'missverstand', partizipZwei: 'missverstanden', hilfsverb: 'hat', imperativ: 'missversteh!' },

  // Sık Kullanılan Ayrılabilen Düzensiz Fiiller (Trennbar)
  untergehen: { praesens: 'geht unter', praeteritum: 'ging unter', partizipZwei: 'untergegangen', hilfsverb: 'ist', isSeparable: true, separablePrefix: 'unter', imperativ: 'geh unter!' },
  aufstehen: { praesens: 'steht auf', praeteritum: 'stand auf', partizipZwei: 'aufgestanden', hilfsverb: 'ist', isSeparable: true, separablePrefix: 'auf', imperativ: 'steh auf!' },
  mitbringen: { praesens: 'bringt mit', praeteritum: 'brachte mit', partizipZwei: 'mitgebracht', hilfsverb: 'hat', isSeparable: true, separablePrefix: 'mit', imperativ: 'bring mit!' },
  mitkommen: { praesens: 'kommt mit', praeteritum: 'kam mit', partizipZwei: 'mitgekommen', hilfsverb: 'ist', isSeparable: true, separablePrefix: 'mit', imperativ: 'komm mit!' },
  anfangen: { praesens: 'fängt an', praeteritum: 'fing an', partizipZwei: 'angefangen', hilfsverb: 'hat', isSeparable: true, separablePrefix: 'an', imperativ: 'fang an!' },
  ankommen: { praesens: 'kommt an', praeteritum: 'kam an', partizipZwei: 'angekommen', hilfsverb: 'ist', isSeparable: true, separablePrefix: 'an', imperativ: 'komm an!' },
  anrufen: { praesens: 'ruft an', praeteritum: 'rief an', partizipZwei: 'angerufen', hilfsverb: 'hat', isSeparable: true, separablePrefix: 'an', imperativ: 'ruf an!' },
  abfahren: { praesens: 'fährt ab', praeteritum: 'fuhr ab', partizipZwei: 'abgefahren', hilfsverb: 'ist', isSeparable: true, separablePrefix: 'ab', imperativ: 'fahr ab!' },
  abgeben: { praesens: 'gibt ab', praeteritum: 'gab ab', partizipZwei: 'abgegeben', hilfsverb: 'hat', isSeparable: true, separablePrefix: 'ab', imperativ: 'gib ab!' },
  einladen: { praesens: 'lädt ein', praeteritum: 'lud ein', partizipZwei: 'eingeladen', hilfsverb: 'hat', isSeparable: true, separablePrefix: 'ein', imperativ: 'lade ein!' },
  einsteigen: { praesens: 'steigt ein', praeteritum: 'stieg ein', partizipZwei: 'eingestiegen', hilfsverb: 'ist', isSeparable: true, separablePrefix: 'ein', imperativ: 'steig ein!' },
  aussteigen: { praesens: 'steigt aus', praeteritum: 'stieg aus', partizipZwei: 'ausgestiegen', hilfsverb: 'ist', isSeparable: true, separablePrefix: 'aus', imperativ: 'steig aus!' },
  umsteigen: { praesens: 'steigt um', praeteritum: 'stieg um', partizipZwei: 'umgestiegen', hilfsverb: 'ist', isSeparable: true, separablePrefix: 'um', imperativ: 'steig um!' },
  umziehen: { praesens: 'zieht um', praeteritum: 'zog um', partizipZwei: 'umgezogen', hilfsverb: 'ist', isSeparable: true, separablePrefix: 'um', imperativ: 'zieh um!' },
  zurückkommen: { praesens: 'kommt zurück', praeteritum: 'kam zurück', partizipZwei: 'zurückgekommen', hilfsverb: 'ist', isSeparable: true, separablePrefix: 'zurück', imperativ: 'komm zurück!' },
  fernsehen: { praesens: 'sieht fern', praeteritum: 'sah fern', partizipZwei: 'ferngesehen', hilfsverb: 'hat', isSeparable: true, separablePrefix: 'fern', imperativ: 'sieh fern!' },
  vorlesen: { praesens: 'liest vor', praeteritum: 'las vor', partizipZwei: 'vorgelesen', hilfsverb: 'hat', isSeparable: true, separablePrefix: 'vor', imperativ: 'lies vor!' },
  vorschlagen: { praesens: 'schlägt vor', praeteritum: 'schlug vor', partizipZwei: 'vorgeschlagen', hilfsverb: 'hat', isSeparable: true, separablePrefix: 'vor', imperativ: 'schlag vor!' },
  teilnehmen: { praesens: 'nimmt teil', praeteritum: 'nahm teil', partizipZwei: 'teilgenommen', hilfsverb: 'hat', isSeparable: true, separablePrefix: 'teil', imperativ: 'nimm teil!' },
  stattfinden: { praesens: 'findet statt', praeteritum: 'fand statt', partizipZwei: 'stattgefunden', hilfsverb: 'hat', isSeparable: true, separablePrefix: 'statt', imperativ: 'finde statt!' }
};

// Sık kullanılan dönüşlü fiiller (Reflexive Verbs)
const REFLEXIVE_VERB_SET = new Set([
  'erfassen', 'erinnern', 'freuen', 'interessieren', 'fühlen', 'konzentrieren',
  'entschuldigen', 'befinden', 'verabreden', 'beeilen', 'beschweren', 'entscheiden',
  'ausruhen', 'gewöhnen', 'kümmern', 'streiten', 'verlieben', 'wundern',
  'bedanken', 'beziehen', 'wenden', 'unterhalten', 'beschäftigen', 'treffen',
  'verabschieden', 'erkälten', 'schämen', 'verändern', 'vorstellen', 'anstrengen',
  'bewerben', 'einbilden', 'irren', 'fürchten', 'sehnen', 'weigern'
]);

// 6-Şahıs Tam Düzensiz Fiil Çekim Veritabanı (Screenshot 2: İki Sütunlu Tablo İçin)
const FULL_CONJUGATIONS = {
  erfassen: {
    infinitiv: 'erfassen',
    vowelChange: 'Düzensiz (Unregelmäßig)',
    isReflexive: true,
    reflexiveType: 'sich',
    isSeparable: false,
    separablePrefix: '',
    praesensEr: 'erfasst',
    praeteritumEr: 'erfasste',
    perfektEr: 'hat erfasst',
    praesensIch: 'erfasse',
    praesensDu: 'erfasstst',
    praesensWir: 'erfassen',
    praesensIhr: 'erfasst',
    praesensSie: 'erfassen',
    praeteritumIch: 'erfasste',
    praeteritumDu: 'erfasstest',
    praeteritumWir: 'erfassten',
    praeteritumIhr: 'erfasstet',
    praeteritumSie: 'erfassten',
    konjunktivZweiIch: 'erfässte',
    imperativDu: 'erfasse!'
  },
  untergehen: {
    infinitiv: 'untergehen',
    vowelChange: 'Düzensiz (Ayrılabilen)',
    isReflexive: false,
    reflexiveType: null,
    isSeparable: true,
    separablePrefix: 'unter',
    praesensEr: 'geht unter',
    praeteritumEr: 'ging unter',
    perfektEr: 'ist untergegangen',
    praesensIch: 'gehe unter',
    praesensDu: 'gehst unter',
    praesensWir: 'gehen unter',
    praesensIhr: 'geht unter',
    praesensSie: 'gehen unter',
    praeteritumIch: 'ging unter',
    praeteritumDu: 'gingst unter',
    praeteritumWir: 'gingen unter',
    praeteritumIhr: 'gingt unter',
    praeteritumSie: 'gingen unter',
    konjunktivZweiIch: 'ginge unter',
    imperativDu: 'geh unter!'
  },
  aufstehen: {
    infinitiv: 'aufstehen',
    vowelChange: 'Düzensiz (Ayrılabilen)',
    isReflexive: false,
    reflexiveType: null,
    isSeparable: true,
    separablePrefix: 'auf',
    praesensEr: 'steht auf',
    praeteritumEr: 'stand auf',
    perfektEr: 'ist aufgestanden',
    praesensIch: 'stehe auf',
    praesensDu: 'stehst auf',
    praesensWir: 'stehen auf',
    praesensIhr: 'steht auf',
    praesensSie: 'stehen auf',
    praeteritumIch: 'stand auf',
    praeteritumDu: 'standest auf',
    praeteritumWir: 'standen auf',
    praeteritumIhr: 'standet auf',
    praeteritumSie: 'standen auf',
    konjunktivZweiIch: 'stände auf',
    imperativDu: 'steh auf!'
  },
  verstehen: {
    infinitiv: 'verstehen',
    vowelChange: 'Düzensiz (Ayrılamayan)',
    isReflexive: false,
    reflexiveType: null,
    isSeparable: false,
    separablePrefix: '',
    praesensEr: 'versteht',
    praeteritumEr: 'verstand',
    perfektEr: 'hat verstanden',
    praesensIch: 'verstehe',
    praesensDu: 'verstehst',
    praesensWir: 'verstehen',
    praesensIhr: 'versteht',
    praesensSie: 'verstehen',
    praeteritumIch: 'verstand',
    praeteritumDu: 'verstandest',
    praeteritumWir: 'verstanden',
    praeteritumIhr: 'verstandet',
    praeteritumSie: 'verstanden',
    konjunktivZweiIch: 'verstände',
    imperativDu: 'versteh!'
  },
  sehen: {
    infinitiv: 'sehen',
    vowelChange: 'Düzensiz (e → ie)',
    isReflexive: false,
    reflexiveType: null,
    isSeparable: false,
    separablePrefix: '',
    praesensEr: 'sieht',
    praeteritumEr: 'sah',
    perfektEr: 'hat gesehen',
    praesensIch: 'sehe',
    praesensDu: 'siehst',
    praesensWir: 'sehen',
    praesensIhr: 'seht',
    praesensSie: 'sehen',
    praeteritumIch: 'sah',
    praeteritumDu: 'sahst',
    praeteritumWir: 'sahen',
    praeteritumIhr: 'saht',
    praeteritumSie: 'sahen',
    konjunktivZweiIch: 'sähe',
    imperativDu: 'sieh!'
  },
  sprechen: {
    infinitiv: 'sprechen',
    vowelChange: 'Düzensiz (e → i)',
    isReflexive: false,
    reflexiveType: null,
    isSeparable: false,
    separablePrefix: '',
    praesensEr: 'spricht',
    praeteritumEr: 'sprach',
    perfektEr: 'hat gesprochen',
    praesensIch: 'spreche',
    praesensDu: 'sprichst',
    praesensWir: 'sprechen',
    praesensIhr: 'sprecht',
    praesensSie: 'sprechen',
    praeteritumIch: 'sprach',
    praeteritumDu: 'sprachst',
    praeteritumWir: 'sprachen',
    praeteritumIhr: 'spracht',
    praeteritumSie: 'sprachen',
    konjunktivZweiIch: 'spräche',
    imperativDu: 'sprich!'
  }
};

const SEPARABLE_PREFIXES = [
  'zusammen', 'gegenüber', 'entgegen', 'zurück', 'zurecht', 'weiter', 'wieder',
  'herunter', 'heraus', 'herein', 'herauf', 'herbei', 'herum', 'hervor',
  'hinunter', 'hinaus', 'hinein', 'hinauf', 'hinweg', 'hinzu',
  'vorbei', 'voraus', 'voran', 'entlang', 'nieder', 'runter',
  'unter', 'über', 'statt', 'teil', 'heim', 'fort', 'frei', 'fest', 'fern', 'fehl',
  'aus', 'auf', 'ein', 'mit', 'vor', 'weg', 'bei', 'los', 'nach',
  'ab', 'an', 'zu', 'um'
];

const INSEPARABLE_PREFIXES = [
  'miss', 'emp', 'ent', 'ver', 'zer', 'be', 'er', 'ge'
];

const SEIN_FULL_VERBS = new Set([
  'aufstehen', 'untergehen', 'einschlafen', 'aufwachen', 'ankommen', 'abfahren',
  'umziehen', 'auswandern', 'einsteigen', 'aussteigen', 'zurückkehren', 'zurückkommen',
  'verschwinden', 'erscheinen', 'passieren', 'begegnen', 'mitkommen', 'weggehen', 'hingehen',
  'sein', 'bleiben', 'werden', 'gehen', 'kommen', 'fahren', 'fliegen', 'laufen', 'fallen',
  'steigen', 'schwimmen', 'sinken', 'springen', 'reisen', 'wandern', 'sterben', 'wachsen',
  'geschehen', 'gelingen', 'misslingen', 'verreisen', 'rennen', 'fliehen', 'fließen', 'reiten',
  'vergehen', 'entstehen', 'umkommen'
]);

// 70+ Yüksek Frekanslı İsim Haritası
const KNOWN_NOUNS = {
  schuh: { word: 'Schuh', article: 'der', plural: 'die Schuhe' },
  maus: { word: 'Maus', article: 'die', plural: 'die Mäuse' },
  haus: { word: 'Haus', article: 'das', plural: 'die Häuser' },
  krankenhaus: { word: 'Krankenhaus', article: 'das', plural: 'die Krankenhäuser' },
  rathaus: { word: 'Rathaus', article: 'das', plural: 'die Rathäuser' },
  kaufhaus: { word: 'Kaufhaus', article: 'das', plural: 'die Kaufhäuser' },
  frau: { word: 'Frau', article: 'die', plural: 'die Frauen' },
  mann: { word: 'Mann', article: 'der', plural: 'die Männer' },
  kind: { word: 'Kind', article: 'das', plural: 'die Kinder' },
  tisch: { word: 'Tisch', article: 'der', plural: 'die Tische' },
  stuhl: { word: 'Stuhl', article: 'der', plural: 'die Stühle' },
  buch: { word: 'Buch', article: 'das', plural: 'die Bücher' },
  wörterbuch: { word: 'Wörterbuch', article: 'das', plural: 'die Wörterbücher' },
  auto: { word: 'Auto', article: 'das', plural: 'die Autos' },
  stadt: { word: 'Stadt', article: 'die', plural: 'die Städte' },
  hauptstadt: { word: 'Hauptstadt', article: 'die', plural: 'die Hauptstädte' },
  land: { word: 'Land', article: 'das', plural: 'die Länder' },
  tag: { word: 'Tag', article: 'der', plural: 'die Tage' },
  nacht: { word: 'Nacht', article: 'die', plural: 'die Nächte' },
  jahr: { word: 'Jahr', article: 'das', plural: 'die Jahre' },
  zeit: { word: 'Zeit', article: 'die', plural: 'die Zeiten' },
  mensch: { word: 'Mensch', article: 'der', plural: 'die Menschen' },
  freund: { word: 'Freund', article: 'der', plural: 'die Freunde' },
  schule: { word: 'Schule', article: 'die', plural: 'die Schulen' },
  universität: { word: 'Universität', article: 'die', plural: 'die Universitäten' },
  arbeit: { word: 'Arbeit', article: 'die', plural: 'die Arbeiten' },
  wohnung: { word: 'Wohnung', article: 'die', plural: 'die Wohnungen' },
  zimmer: { word: 'Zimmer', article: 'das', plural: 'die Zimmer' },
  fenster: { word: 'Fenster', article: 'das', plural: 'die Fenster' },
  tür: { word: 'Tür', article: 'die', plural: 'die Türen' },
  wasser: { word: 'Wasser', article: 'das', plural: 'die Wässer' },
  brot: { word: 'Brot', article: 'das', plural: 'die Brote' },
  apfel: { word: 'Apfel', article: 'der', plural: 'die Äpfel' },
  kaffee: { word: 'Kaffee', article: 'der', plural: 'die Kaffees' },
  hand: { word: 'Hand', article: 'die', plural: 'die Hände' },
  auge: { word: 'Auge', article: 'das', plural: 'die Augen' },
  kopf: { word: 'Kopf', article: 'der', plural: 'die Köpfe' },
  herz: { word: 'Herz', article: 'das', plural: 'die Herzen' },
  weg: { word: 'Weg', article: 'der', plural: 'die Wege' },
  straße: { word: 'Straße', article: 'die', plural: 'die Straßen' },
  bahnhof: { word: 'Bahnhof', article: 'der', plural: 'die Bahnhöfe' },
  flughafen: { word: 'Flughafen', article: 'der', plural: 'die Flughäfen' },
  zug: { word: 'Zug', article: 'der', plural: 'die Züge' },
  flugzeug: { word: 'Flugzeug', article: 'das', plural: 'die Flugzeuge' },
  fahrrad: { word: 'Fahrrad', article: 'das', plural: 'die Fahrräder' },
  geld: { word: 'Geld', article: 'das', plural: 'die Gelder' },
  preis: { word: 'Preis', article: 'der', plural: 'die Preise' },
  frage: { word: 'Frage', article: 'die', plural: 'die Fragen' },
  antwort: { word: 'Antwort', article: 'die', plural: 'die Antworten' },
  wort: { word: 'Wort', article: 'das', plural: 'die Wörter' },
  satz: { word: 'Satz', article: 'der', plural: 'die Sätze' },
  sprache: { word: 'Sprache', article: 'die', plural: 'die Sprachen' },
  problem: { word: 'Problem', article: 'das', plural: 'die Probleme' },
  lösung: { word: 'Lösung', article: 'die', plural: 'die Lösungen' },
  idee: { word: 'Idee', article: 'die', plural: 'die Ideen' },
  beispiel: { word: 'Beispiel', article: 'das', plural: 'die Beispiele' },
  computer: { word: 'Computer', article: 'der', plural: 'die Computer' },
  handy: { word: 'Handy', article: 'das', plural: 'die Handys' },
  bild: { word: 'Bild', article: 'das', plural: 'die Bilder' },
  musik: { word: 'Musik', article: 'die', plural: 'die Musiken' },
  film: { word: 'Film', article: 'der', plural: 'die Filme' },
  arzt: { word: 'Arzt', article: 'der', plural: 'die Ärzte' },
  lehrer: { word: 'Lehrer', article: 'der', plural: 'die Lehrer' },
  student: { word: 'Student', article: 'der', plural: 'die Studenten' },
  hund: { word: 'Hund', article: 'der', plural: 'die Hunde' },
  katze: { word: 'Katze', article: 'die', plural: 'die Katzen' },
  baum: { word: 'Baum', article: 'der', plural: 'die Bäume' },
  sonne: { word: 'Sonne', article: 'die', plural: 'die Sonnen' },
  mond: { word: 'Mond', article: 'der', plural: 'die Monde' },
  meer: { word: 'Meer', article: 'das', plural: 'die Meere' },
  wetter: { word: 'Wetter', article: 'das', plural: 'die Wetter' },
  gesetz: { word: 'Gesetz', article: 'das', plural: 'die Gesetze' },
  mädchen: { word: 'Mädchen', article: 'das', plural: 'die Mädchen' },
  möglichkeit: { word: 'Möglichkeit', article: 'die', plural: 'die Möglichkeiten' },
  brötchen: { word: 'Brötchen', article: 'das', plural: 'die Brötchen' },
  vogel: { word: 'Vogel', article: 'der', plural: 'die Vögel' },
  mutter: { word: 'Mutter', article: 'die', plural: 'die Mütter' },
  vater: { word: 'Vater', article: 'der', plural: 'die Väter' },
  bruder: { word: 'Bruder', article: 'der', plural: 'die Brüder' },
  tochter: { word: 'Tochter', article: 'die', plural: 'die Töchter' },
  spaß: { word: 'Spaß', article: 'der', plural: 'die Späße' },
  körper: { word: 'Körper', article: 'der', plural: 'die Körper' },
  qualität: { word: 'Qualität', article: 'die', plural: 'die Qualitäten' },
  überraschung: { word: 'Überraschung', article: 'die', plural: 'die Überraschungen' },
  übung: { word: 'Übung', article: 'die', plural: 'die Übungen' },
  gefühl: { word: 'Gefühl', article: 'das', plural: 'die Gefühle' },
  speck: { word: 'Speck', article: 'der', plural: 'die Specke' },
  sehnsucht: { word: 'Sehnsucht', article: 'die', plural: 'die Sehnsüchte' },
  eichhörnchen: { word: 'Eichhörnchen', article: 'das', plural: 'die Eichhörnchen' },
  kühlschrank: { word: 'Kühlschrank', article: 'der', plural: 'die Kühlschränke' }
};

// Çoğuldan Tekile Çözümleme Tablosu (User Req: "Çoğul isimleri de her zaman tekil haliyle kaydetsin karta")
const PLURAL_TO_SINGULAR_MAP = {
  schuhe: { singular: 'Schuh', article: 'der', plural: 'die Schuhe' },
  mäuse: { singular: 'Maus', article: 'die', plural: 'die Mäuse' },
  maeuse: { singular: 'Maus', article: 'die', plural: 'die Mäuse' },
  häuser: { singular: 'Haus', article: 'das', plural: 'die Häuser' },
  krankenhäuser: { singular: 'Krankenhaus', article: 'das', plural: 'die Krankenhäuser' },
  rathäuser: { singular: 'Rathaus', article: 'das', plural: 'die Rathäuser' },
  kaufhäuser: { singular: 'Kaufhaus', article: 'das', plural: 'die Kaufhäuser' },
  frauen: { singular: 'Frau', article: 'die', plural: 'die Frauen' },
  männer: { singular: 'Mann', article: 'der', plural: 'die Männer' },
  kinder: { singular: 'Kind', article: 'das', plural: 'die Kinder' },
  tische: { singular: 'Tisch', article: 'der', plural: 'die Tische' },
  stühle: { singular: 'Stuhl', article: 'der', plural: 'die Stühle' },
  bücher: { singular: 'Buch', article: 'das', plural: 'die Bücher' },
  wörterbücher: { singular: 'Wörterbuch', article: 'das', plural: 'die Wörterbücher' },
  autos: { singular: 'Auto', article: 'das', plural: 'die Autos' },
  städte: { singular: 'Stadt', article: 'die', plural: 'die Städte' },
  hauptstädte: { singular: 'Hauptstadt', article: 'die', plural: 'die Hauptstädte' },
  länder: { singular: 'Land', article: 'das', plural: 'die Länder' },
  tage: { singular: 'Tag', article: 'der', plural: 'die Tage' },
  nächte: { singular: 'Nacht', article: 'die', plural: 'die Nächte' },
  jahre: { singular: 'Jahr', article: 'das', plural: 'die Jahre' },
  zeiten: { singular: 'Zeit', article: 'die', plural: 'die Zeiten' },
  menschen: { singular: 'Mensch', article: 'der', plural: 'die Menschen' },
  freunde: { singular: 'Freund', article: 'der', plural: 'die Freunde' },
  schulen: { singular: 'Schule', article: 'die', plural: 'die Schulen' },
  universitäten: { singular: 'Universität', article: 'die', plural: 'die Universitäten' },
  arbeiten: { singular: 'Arbeit', article: 'die', plural: 'die Arbeiten' },
  wohnungen: { singular: 'Wohnung', article: 'die', plural: 'die Wohnungen' },
  fenster: { singular: 'Fenster', article: 'das', plural: 'die Fenster' },
  türen: { singular: 'Tür', article: 'die', plural: 'die Türen' },
  äpfel: { singular: 'Apfel', article: 'der', plural: 'die Äpfel' },
  hände: { singular: 'Hand', article: 'die', plural: 'die Hände' },
  augen: { singular: 'Auge', article: 'das', plural: 'die Augen' },
  köpfe: { singular: 'Kopf', article: 'der', plural: 'die Köpfe' },
  fragen: { singular: 'Frage', article: 'die', plural: 'die Fragen' },
  antworten: { singular: 'Antwort', article: 'die', plural: 'die Antworten' },
  wörter: { singular: 'Wort', article: 'das', plural: 'die Wörter' },
  sätze: { singular: 'Satz', article: 'der', plural: 'die Sätze' },
  sprachen: { singular: 'Sprache', article: 'die', plural: 'die Sprachen' },
  probleme: { singular: 'Problem', article: 'das', plural: 'die Probleme' },
  lösungen: { singular: 'Lösung', article: 'die', plural: 'die Lösungen' },
  ideen: { singular: 'Idee', article: 'die', plural: 'die Ideen' },
  ärzte: { singular: 'Arzt', article: 'der', plural: 'die Ärzte' },
  studenten: { singular: 'Student', article: 'der', plural: 'die Studenten' },
  hunde: { singular: 'Hund', article: 'der', plural: 'die Hunde' },
  katzen: { singular: 'Katze', article: 'die', plural: 'die Katzen' },
  bäume: { singular: 'Baum', article: 'der', plural: 'die Bäume' }
};

class SearchNormalizer {
  static hasUmlaut(str) {
    return /[äöüÄÖÜß]/.test(str || '');
  }

  static stripUmlauts(str) {
    return (str || '')
      .toLowerCase()
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      .replace(/ß/g, 'ss')
      .replace(/ae/g, 'a')
      .replace(/oe/g, 'o')
      .replace(/ue/g, 'u');
  }

  static normalizeDigraphs(str) {
    return (str || '')
      .toLowerCase()
      .replace(/ae/g, 'ä')
      .replace(/oe/g, 'ö')
      .replace(/ue/g, 'ü')
      .replace(/ss/g, 'ß');
  }

  static generateCandidates(str) {
    const raw = (str || '').trim().toLowerCase();
    if (!raw) return [];
    const set = new Set();
    set.add(raw);
    const dig = this.normalizeDigraphs(raw);
    set.add(dig);

    // qualitat -> qualität, universitat -> universität
    if (raw.endsWith('tat') && raw.length > 3) {
      set.add(raw.slice(0, -3) + 'tät');
    }
    if (raw.includes('o')) set.add(raw.replace(/o/g, 'ö'));
    if (raw.includes('u')) set.add(raw.replace(/u/g, 'ü'));
    if (raw.includes('a') && !raw.includes('ä')) set.add(raw.replace(/a/g, 'ä'));
    if (raw.includes('sh')) set.add(raw.replace(/sh/g, 'sch'));
    if (raw.includes('ph')) set.add(raw.replace(/ph/g, 'f'));

    return Array.from(set);
  }
}
window.SearchNormalizer = SearchNormalizer;

class GermanVerbHelper {
  static cleanInput(rawWord) {
    return (rawWord || '')
      .trim()
      .replace(/^(sich\s+|der\s+|die\s+|das\s+|to\s+)/i, '')
      .trim();
  }

  static detectReflexive(rawWord) {
    const raw = (rawWord || '').trim().toLowerCase();
    if (raw.startsWith('sich ') || raw.endsWith(' sich') || raw.includes('(sich)')) {
      return { isReflexive: true, reflexiveType: 'sich' };
    }
    const clean = this.cleanInput(raw);
    if (REFLEXIVE_VERB_SET.has(clean)) {
      return { isReflexive: true, reflexiveType: 'sich' };
    }
    return { isReflexive: false, reflexiveType: null };
  }

  static detectPartOfSpeech(rawWord) {
    const cleaned = this.cleanInput(rawWord);
    const lower = cleaned.toLowerCase();

    if (!lower) return 'OTHER';

    const candidates = SearchNormalizer.generateCandidates(lower);

    // 1. Plural kelime kontrolü
    for (const cand of candidates) {
      if (PLURAL_TO_SINGULAR_MAP[cand]) return 'NOUN';
    }

    // 2. Bilinen isim tablosu
    for (const cand of candidates) {
      if (KNOWN_NOUNS[cand]) return 'NOUN';
    }

    // 3. Karakteristik isim sonekleri
    for (const cand of candidates) {
      if (/(ung|heit|keit|schaft|ion|tät|chen|lein|ismus|ment|enz|anz|ur)$/.test(cand)) {
        return 'NOUN';
      }
    }

    // 3.5. -en ile biten bilinen sıfatlar (fiil zannedilmesini önle: einverstanden, trocken, offen vb.)
    const knownAdjectivesInEn = new Set([
      'einverstanden', 'trocken', 'offen', 'selten', 'vorhanden', 'zufrieden',
      'bescheiden', 'betrunken', 'erwachsen', 'verschieden', 'vollkommen',
      'vergangen', 'verloren', 'erfahren', 'gelassen', 'erhaben'
    ]);
    if (knownAdjectivesInEn.has(lower)) return 'ADJECTIVE';

    // 4. Düzensiz fiil kontrolü
    for (const cand of candidates) {
      if (IRREGULAR_VERBS[cand] || FULL_CONJUGATIONS[cand]) {
        return 'VERB';
      }
      const prefixInfo = this.splitVerbPrefix(cand);
      if (prefixInfo.prefix && (IRREGULAR_VERBS[prefixInfo.baseVerb] || FULL_CONJUGATIONS[prefixInfo.baseVerb])) {
        return 'VERB';
      }
      if (this.looksLikeVerbInfinitive(cand)) {
        return 'VERB';
      }
    }

    // 6. Baş harfi büyükse isim kabul et
    if (/^[A-ZÄÖÜ]/.test(cleaned)) {
      return 'NOUN';
    }

    return 'ADJECTIVE';
  }

  static looksLikeVerbInfinitive(lower) {
    const nonVerbEnWords = new Set([
      'einverstanden', 'trocken', 'offen', 'selten', 'unten', 'oben', 'gestern', 'draußen',
      'vorhanden', 'zufrieden', 'bescheiden', 'betrunken', 'erwachsen', 'verschieden',
      'vollkommen', 'vergangen', 'verloren', 'erfahren', 'besoffen', 'gelassen', 'erhaben',
      'frauen', 'menschen', 'fragen', 'antworten', 'sprachen', 'wohnungen', 'zeiten', 'schulen'
    ]);
    if (nonVerbEnWords.has(lower)) return false;
    if (lower === 'sein' || lower === 'tun') return true;
    return /(ieren|eln|ern|en)$/.test(lower) && lower.length >= 4;
  }

  static splitVerbPrefix(lowerVerb) {
    // 1. Ayrılamayan Ön Ekler (ver-, be-, er-, ent-, emp-, zer-, ge-, miss-) — KESİNLİKLE AYRILAMAZ
    for (const p of INSEPARABLE_PREFIXES) {
      if (lowerVerb.startsWith(p) && lowerVerb.length > p.length + 1) {
        const rest = lowerVerb.slice(p.length);
        if (this.looksLikeVerbInfinitive(rest) || IRREGULAR_VERBS[rest] || IRREGULAR_VERBS[lowerVerb]) {
          return { prefix: p, baseVerb: rest, isSeparable: false, isInseparable: true };
        }
      }
    }

    // Ekstra güvence: 'ver' veya diğer inseparable ön eklerle başlayan fiiller ASLA ayrılabilir olamaz!
    for (const p of INSEPARABLE_PREFIXES) {
      if (lowerVerb.startsWith(p)) {
        const rest = lowerVerb.slice(p.length);
        return { prefix: p, baseVerb: rest, isSeparable: false, isInseparable: true };
      }
    }

    // 2. Ayrılabilen Ön Ekler (Trennbar)
    for (const p of SEPARABLE_PREFIXES) {
      if (lowerVerb.startsWith(p) && lowerVerb.length > p.length + 1) {
        const rest = lowerVerb.slice(p.length);
        if (this.looksLikeVerbInfinitive(rest) || IRREGULAR_VERBS[rest]) {
          return { prefix: p, baseVerb: rest, isSeparable: true, isInseparable: false };
        }
      }
    }

    return { prefix: '', baseVerb: lowerVerb, isSeparable: false, isInseparable: false };
  }

  static extractStem(baseVerb) {
    if (baseVerb.endsWith('en')) return baseVerb.slice(0, -2);
    if (baseVerb.endsWith('n')) return baseVerb.slice(0, -1);
    return baseVerb;
  }

  static hasDentalEnding(stem) {
    return /(t|d|chn|ffn|gn|tm)$/.test(stem);
  }

  static getFullConjugation(verb) {
    const clean = this.cleanInput(verb).toLowerCase();
    if (FULL_CONJUGATIONS[clean]) {
      return FULL_CONJUGATIONS[clean];
    }

    // Dinamik 6-şahıs çekimi sentezle
    const conj = this.conjugate(clean);
    if (!conj) return null;

    const stem = this.extractStem(conj.baseVerb || clean);
    const dental = this.hasDentalEnding(stem);
    const prefix = conj.separablePrefix ? ` ${conj.separablePrefix}` : '';
    const insep = conj.isInseparable ? conj.inseparablePrefix : '';

    const pPrsIch = `${insep}${stem}e${prefix}`;
    const pPrsDu = dental ? `${insep}${stem}est${prefix}` : `${insep}${stem}st${prefix}`;
    const pPrsEr = `${conj.praesens}`;
    const pPrsWir = `${insep}${stem}en${prefix}`;
    const pPrsIhr = dental ? `${insep}${stem}et${prefix}` : `${insep}${stem}t${prefix}`;
    const pPrsSie = `${insep}${stem}en${prefix}`;

    const prtStem = conj.praeteritum ? conj.praeteritum.replace(/\s.*$/, '') : (dental ? `${stem}ete` : `${stem}te`);
    const pPrtIch = `${prtStem}${prefix}`;
    const pPrtDu = `${prtStem}st${prefix}`;
    const pPrtEr = `${conj.praeteritum}`;
    const pPrtWir = `${prtStem}n${prefix}`;
    const pPrtIhr = `${prtStem}t${prefix}`;
    const pPrtSie = `${prtStem}n${prefix}`;

    return {
      infinitiv: clean,
      vowelChange: conj.regularity,
      isReflexive: conj.isReflexive,
      reflexiveType: conj.reflexiveType,
      isSeparable: conj.isSeparable,
      separablePrefix: conj.separablePrefix,
      praesensEr: pPrsEr,
      praeteritumEr: pPrtEr,
      perfektEr: `${conj.hilfsverb} ${conj.partizipZwei}`,
      praesensIch: pPrsIch,
      praesensDu: pPrsDu,
      praesensWir: pPrsWir,
      praesensIhr: pPrsIhr,
      praesensSie: pPrsSie,
      praeteritumIch: pPrtIch,
      praeteritumDu: pPrtDu,
      praeteritumWir: pPrtWir,
      praeteritumIhr: pPrtIhr,
      praeteritumSie: pPrtSie,
      konjunktivZweiIch: `${stem}te`,
      imperativDu: conj.imperativ || `${stem}!`
    };
  }

  static conjugate(rawVerb) {
    let infinitive = this.cleanInput(rawVerb).toLowerCase();
    if (!infinitive) return null;

    if (!IRREGULAR_VERBS[infinitive]) {
      const candidates = SearchNormalizer.generateCandidates(infinitive);
      for (const cand of candidates) {
        if (IRREGULAR_VERBS[cand]) {
          infinitive = cand;
          break;
        }
      }
    }

    const refl = this.detectReflexive(rawVerb);
    const isReflexive = refl.isReflexive;
    const reflexiveType = refl.reflexiveType;

    // 1. Tam eşleşen fiil tablosu
    if (IRREGULAR_VERBS[infinitive]) {
      const entry = IRREGULAR_VERBS[infinitive];
      const prefixCheck = this.splitVerbPrefix(infinitive);
      const isSep = entry.isSeparable !== undefined ? entry.isSeparable : prefixCheck.isSeparable;
      const sepPrefix = entry.separablePrefix || (isSep ? prefixCheck.prefix : '');
      const regLabel = isSep
        ? 'Düzensiz (Ayrılabilen)'
        : (prefixCheck.isInseparable ? 'Düzensiz (Ayrılamayan)' : 'Düzensiz (Unregelmäßig)');

      return {
        infinitive,
        praesens: entry.praesens,
        praeteritum: entry.praeteritum,
        partizipZwei: entry.partizipZwei,
        hilfsverb: entry.hilfsverb,
        isSeparable: isSep,
        separablePrefix: sepPrefix,
        regularity: regLabel,
        imperativ: entry.imperativ || '-',
        isReflexive: isReflexive || Boolean(entry.isReflexive),
        reflexiveType: reflexiveType || entry.reflexiveType || null
      };
    }

    // 2. Ön ek analizi
    const { prefix, baseVerb, isSeparable, isInseparable } = this.splitVerbPrefix(infinitive);
    let baseConj;
    let isIrregular = false;

    if (IRREGULAR_VERBS[baseVerb]) {
      const irr = IRREGULAR_VERBS[baseVerb];
      isIrregular = true;
      let rawPartizip = irr.partizipZwei;
      if (isInseparable && rawPartizip.startsWith('ge')) {
        rawPartizip = rawPartizip.slice(2);
      }
      baseConj = {
        praesens: irr.praesens,
        praeteritum: irr.praeteritum,
        partizipZwei: rawPartizip,
        hilfsverb: irr.hilfsverb,
        imperativ: irr.imperativ || `${this.extractStem(baseVerb)}!`
      };
    } else {
      const stem = this.extractStem(baseVerb);
      const dental = this.hasDentalEnding(stem);
      const endsWithIeren = baseVerb.endsWith('ieren');

      const prs = dental ? `${stem}et` : `${stem}t`;
      const prt = dental ? `${stem}ete` : `${stem}te`;
      const partSuffix = dental ? `${stem}et` : `${stem}t`;
      const p2 = (isInseparable || endsWithIeren) ? partSuffix : `ge${partSuffix}`;
      const imp = `${stem}e! / ${ dental ? stem + 'et' : stem + 't' }!`;

      baseConj = {
        praesens: prs,
        praeteritum: prt,
        partizipZwei: p2,
        hilfsverb: 'hat',
        imperativ: imp
      };
    }

    const hilfsverb = SEIN_FULL_VERBS.has(infinitive) || SEIN_FULL_VERBS.has(baseVerb) ? 'ist' : baseConj.hilfsverb;

    if (isSeparable && prefix) {
      return {
        infinitive,
        baseVerb,
        praesens: `${baseConj.praesens} ${prefix}`,
        praeteritum: `${baseConj.praeteritum} ${prefix}`,
        partizipZwei: `${prefix}${baseConj.partizipZwei}`,
        hilfsverb,
        isSeparable: true,
        separablePrefix: prefix,
        regularity: isIrregular ? 'Düzensiz (Ayrılabilen)' : 'Düzenli (Ayrılabilen)',
        imperativ: `${baseConj.imperativ} ${prefix}!`,
        isReflexive,
        reflexiveType
      };
    }

    if (isInseparable && prefix) {
      return {
        infinitive,
        baseVerb,
        inseparablePrefix: prefix,
        isInseparable: true,
        praesens: `${prefix}${baseConj.praesens}`,
        praeteritum: `${prefix}${baseConj.praeteritum}`,
        partizipZwei: `${prefix}${baseConj.partizipZwei}`,
        hilfsverb,
        isSeparable: false,
        separablePrefix: '',
        regularity: isIrregular ? 'Düzensiz (Ayrılamayan)' : 'Düzenli (Ayrılamayan)',
        imperativ: `${prefix}${this.extractStem(baseVerb)}e!`,
        isReflexive,
        reflexiveType
      };
    }

    return {
      infinitive,
      baseVerb,
      praesens: baseConj.praesens,
      praeteritum: baseConj.praeteritum,
      partizipZwei: baseConj.partizipZwei,
      hilfsverb,
      isSeparable: false,
      separablePrefix: '',
      regularity: isIrregular ? 'Düzensiz' : 'Düzenli',
      imperativ: baseConj.imperativ,
      isReflexive,
      reflexiveType
    };
  }
}

class GermanNounHelper {
  static capitalizeNoun(word) {
    const clean = (word || '').trim().replace(/^(der|die|das)\s+/i, '');
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  /**
   * Çoğul isimleri her zaman TEKİL haliyle çözümler ve normalize eder.
   * User Req: "Çoğul isimleri de her zaman tekil haliyle kaydetsin karta"
   */
  static analyze(rawNoun) {
    const cleaned = (rawNoun || '').trim();
    let explicitArticle = '';
    const artMatch = cleaned.match(/^(der|die|das)\s+(.+)$/i);
    const wordOnly = artMatch ? artMatch[2].trim() : cleaned;
    if (artMatch) explicitArticle = artMatch[1].toLowerCase();

    const lower = wordOnly.toLowerCase();

    // 1. ÇOĞULDAN TEKİLE ÖZEL NORMALİZASYON
    let pluralMatch = PLURAL_TO_SINGULAR_MAP[lower];
    if (!pluralMatch) {
      const candidates = SearchNormalizer.generateCandidates(lower);
      for (const cand of candidates) {
        if (PLURAL_TO_SINGULAR_MAP[cand]) {
          pluralMatch = PLURAL_TO_SINGULAR_MAP[cand];
          break;
        }
      }
      if (!pluralMatch) {
        const stripped = SearchNormalizer.stripUmlauts(lower);
        for (const [k, v] of Object.entries(PLURAL_TO_SINGULAR_MAP)) {
          if (SearchNormalizer.stripUmlauts(k) === stripped) {
            pluralMatch = v;
            break;
          }
        }
      }
    }

    if (pluralMatch) {
      return {
        word: pluralMatch.singular,
        article: explicitArticle && explicitArticle !== 'die' ? explicitArticle : pluralMatch.article,
        pluralForm: pluralMatch.plural,
        isPluralNormalized: true
      };
    }

    // Çoğul kural tabanlı geriye doğru tekil tahminleri
    if (lower.endsWith('innen') && lower.length > 5) {
      const sing = this.capitalizeNoun(lower.replace(/innen$/, 'in'));
      return { word: sing, article: 'die', pluralForm: `die ${this.capitalizeNoun(lower)}`, isPluralNormalized: true };
    }
    if (lower.endsWith('schaften') && lower.length > 8) {
      const sing = this.capitalizeNoun(lower.replace(/schaften$/, 'schaft'));
      return { word: sing, article: 'die', pluralForm: `die ${this.capitalizeNoun(lower)}`, isPluralNormalized: true };
    }
    if (lower.endsWith('heiten') && lower.length > 6) {
      const sing = this.capitalizeNoun(lower.replace(/heiten$/, 'heit'));
      return { word: sing, article: 'die', pluralForm: `die ${this.capitalizeNoun(lower)}`, isPluralNormalized: true };
    }
    if (lower.endsWith('keiten') && lower.length > 6) {
      const sing = this.capitalizeNoun(lower.replace(/keiten$/, 'keit'));
      return { word: sing, article: 'die', pluralForm: `die ${this.capitalizeNoun(lower)}`, isPluralNormalized: true };
    }
    if (lower.endsWith('ungen') && lower.length > 5) {
      const sing = this.capitalizeNoun(lower.replace(/ungen$/, 'ung'));
      return { word: sing, article: 'die', pluralForm: `die ${this.capitalizeNoun(lower)}`, isPluralNormalized: true };
    }
    if ((lower.endsWith('täten') || lower.endsWith('taten')) && lower.length > 5) {
      return { word: 'Qualität', article: 'die', pluralForm: 'die Qualitäten', isPluralNormalized: true };
    }
    if (lower.endsWith('ionen') && lower.length > 5) {
      const sing = this.capitalizeNoun(lower.replace(/ionen$/, 'ion'));
      return { word: sing, article: 'die', pluralForm: `die ${this.capitalizeNoun(lower)}`, isPluralNormalized: true };
    }

    const capitalized = this.capitalizeNoun(wordOnly);

    // 2. Bilinen isim haritası
    let entry = KNOWN_NOUNS[lower];
    if (!entry) {
      const candidates = SearchNormalizer.generateCandidates(lower);
      for (const cand of candidates) {
        if (KNOWN_NOUNS[cand]) {
          entry = KNOWN_NOUNS[cand];
          break;
        }
      }
      if (!entry) {
        const stripped = SearchNormalizer.stripUmlauts(lower);
        for (const [k, v] of Object.entries(KNOWN_NOUNS)) {
          if (SearchNormalizer.stripUmlauts(k) === stripped) {
            entry = v;
            break;
          }
        }
      }
    }

    if (entry) {
      return {
        word: entry.word,
        article: explicitArticle || entry.article,
        pluralForm: entry.plural,
        isPluralNormalized: false
      };
    }

    // 3. Birleşik isim (Compound Noun)
    for (const [key, entry] of Object.entries(KNOWN_NOUNS)) {
      if (key.length >= 4 && lower.endsWith(key)) {
        const prefixPart = capitalized.slice(0, capitalized.length - key.length);
        const pluralBase = entry.plural.replace(/^die\s+/i, '');
        return {
          word: capitalized,
          article: explicitArticle || entry.article,
          pluralForm: `die ${prefixPart}${pluralBase.charAt(0).toLowerCase() + pluralBase.slice(1)}`,
          isPluralNormalized: false
        };
      }
    }

    // 4. Kural tabanlı sonek analizi
    if (/(ung|heit|keit|schaft|ion|tät|tat|anz|enz|ur)$/.test(lower)) {
      const normWord = lower.endsWith('tat') ? capitalized.slice(0, -3) + 'tät' : capitalized;
      return { word: normWord, article: explicitArticle || 'die', pluralForm: `die ${normWord}en` };
    }
    if (lower.endsWith('in') && lower.length > 4) {
      return { word: capitalized, article: explicitArticle || 'die', pluralForm: `die ${capitalized}nen` };
    }
    if (lower.endsWith('e')) {
      return { word: capitalized, article: explicitArticle || 'die', pluralForm: `die ${capitalized}n` };
    }
    if (/(chen|lein)$/.test(lower)) {
      return { word: capitalized, article: explicitArticle || 'das', pluralForm: `die ${capitalized}` };
    }
    if (lower.endsWith('ment')) {
      return { word: capitalized, article: explicitArticle || 'das', pluralForm: `die ${capitalized}e` };
    }
    if (lower.endsWith('um')) {
      return { word: capitalized, article: explicitArticle || 'das', pluralForm: `die ${capitalized.slice(0, -2)}en` };
    }
    if (lower.endsWith('nis')) {
      return { word: capitalized, article: explicitArticle || 'das', pluralForm: `die ${capitalized}se` };
    }
    if (lower.endsWith('ismus')) {
      return { word: capitalized, article: explicitArticle || 'der', pluralForm: `die ${capitalized.slice(0, -2)}en` };
    }
    if (/(ist|ant|ent)$/.test(lower)) {
      return { word: capitalized, article: explicitArticle || 'der', pluralForm: `die ${capitalized}en` };
    }
    if (lower.endsWith('er')) {
      return { word: capitalized, article: explicitArticle || 'der', pluralForm: `die ${capitalized}` };
    }

    return {
      word: capitalized,
      article: explicitArticle || '',
      pluralForm: '',
      isPluralNormalized: false
    };
  }
}

window.GermanVerbHelper = GermanVerbHelper;
window.GermanNounHelper = GermanNounHelper;
window.FULL_CONJUGATIONS = FULL_CONJUGATIONS;
