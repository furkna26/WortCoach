/**
 * WortMeister — Almanca Dilbilgisi Zenginleştirme, Açık Kaynak Tag & SM-2 Modülü
 * Faz 2: Artikel Renk Kodlaması, OpenThesaurus Eş Anlamlılar & Nüanslar,
 * Rektion (Verben mit Präpositionen), False Friends & Stammformen Şeridi
 */

// 1. Evrensel Artikel Renk Kodlaması (der / die / das)
function getArticleStyle(article) {
  if (!article) return null;
  const art = String(article).toLowerCase().trim().replace(/^(der|die|das)\s+/i, '$1');
  if (art === 'der') {
    return {
      article: 'der',
      gender: 'Maskulin',
      label: 'DER',
      color: '#60A5FA',
      bg: 'rgba(96, 165, 250, 0.12)',
      border: 'rgba(96, 165, 250, 0.3)',
      cssText: 'color: #60A5FA; background-color: rgba(96, 165, 250, 0.12); border: 1px solid rgba(96, 165, 250, 0.3);',
      badgeHtml: '<span class="badge badge-der" style="color:#60A5FA !important; background-color:rgba(96, 165, 250, 0.12) !important; border:1px solid rgba(96, 165, 250, 0.3) !important; font-weight:800;">DER</span>'
    };
  }
  if (art === 'die') {
    return {
      article: 'die',
      gender: 'Feminin',
      label: 'DIE',
      color: '#F87171',
      bg: 'rgba(248, 113, 113, 0.12)',
      border: 'rgba(248, 113, 113, 0.3)',
      cssText: 'color: #F87171; background-color: rgba(248, 113, 113, 0.12); border: 1px solid rgba(248, 113, 113, 0.3);',
      badgeHtml: '<span class="badge badge-die" style="color:#F87171 !important; background-color:rgba(248, 113, 113, 0.12) !important; border:1px solid rgba(248, 113, 113, 0.3) !important; font-weight:800;">DIE</span>'
    };
  }
  if (art === 'das') {
    return {
      article: 'das',
      gender: 'Neutrum',
      label: 'DAS',
      color: '#34D399',
      bg: 'rgba(52, 211, 153, 0.12)',
      border: 'rgba(52, 211, 153, 0.3)',
      cssText: 'color: #34D399; background-color: rgba(52, 211, 153, 0.12); border: 1px solid rgba(52, 211, 153, 0.3);',
      badgeHtml: '<span class="badge badge-das" style="color:#34D399 !important; background-color:rgba(52, 211, 153, 0.12) !important; border:1px solid rgba(52, 211, 153, 0.3) !important; font-weight:800;">DAS</span>'
    };
  }
  return null;
}

// 2. Açık Kaynak Veriden Otomatik Tag / Resmiyet / Nüans Okuma
function detectGermanTags(entry) {
  if (!entry) return [];
  const foundTags = [];
  const tagsPool = [];

  // Çeşitli veri kaynaklarından etiketleri topla
  if (Array.isArray(entry.tags)) tagsPool.push(...entry.tags);
  if (typeof entry.tags === 'string') tagsPool.push(...entry.tags.split(/[,;\s]+/));
  if (Array.isArray(entry.raw_tags)) tagsPool.push(...entry.raw_tags);
  if (typeof entry.raw_tags === 'string') tagsPool.push(...entry.raw_tags.split(/[,;\s]+/));
  if (entry.register) tagsPool.push(entry.register);
  if (Array.isArray(entry.labels)) tagsPool.push(...entry.labels);
  if (typeof entry.labels === 'string') tagsPool.push(...entry.labels.split(/[,;\s]+/));
  if (Array.isArray(entry.thesaurusLevels)) tagsPool.push(...entry.thesaurusLevels);
  if (entry.rawWikitext) tagsPool.push(entry.rawWikitext);

  const rawJoined = tagsPool.join(' ').toLowerCase();

  // Colloquial / Umgangssprachlich (Kehribar #FBBF24)
  if (
    /colloquial|umgangssprachlich|\bugs\b|\bfam\b|familiar|familiär|alltagssprache/.test(rawJoined)
  ) {
    foundTags.push({
      key: 'colloquial',
      label: '🗣️ Günlük Dil (Umgangssprachlich)',
      color: '#FBBF24',
      bg: 'rgba(251, 191, 36, 0.12)',
      border: 'rgba(251, 191, 36, 0.3)',
      className: 'badge-nuance-colloquial'
    });
  }

  // Elevated / Gehoben / Formal (Mor/İndigo #A78BFA)
  if (
    /elevated|gehoben|\bgeh\b|formal|literary|literarisch|akademisch|bildungssprache|dichterisch/.test(rawJoined)
  ) {
    foundTags.push({
      key: 'elevated',
      label: '🎩 Resmi / Akademik (Gehoben)',
      color: '#A78BFA',
      bg: 'rgba(167, 139, 250, 0.12)',
      border: 'rgba(167, 139, 250, 0.3)',
      className: 'badge-nuance-formal'
    });
  }

  // Slang / Jugendsprache / Vulgar (Mercan #F87171)
  if (
    /slang|jugendsprache|vulgar|vulgär|derb|abwertend|schimpfwort/.test(rawJoined)
  ) {
    foundTags.push({
      key: 'slang',
      label: '🔥 Slang / Sokak Dili',
      color: '#F87171',
      bg: 'rgba(248, 113, 113, 0.12)',
      border: 'rgba(248, 113, 113, 0.3)',
      className: 'badge-nuance-slang'
    });
  }

  // Dated / Archaic / Veraltet (Gri #9CA3AF)
  if (
    /dated|archaic|veraltet|veraltend|altmodisch|historisch/.test(rawJoined)
  ) {
    foundTags.push({
      key: 'dated',
      label: '⏳ Eskimiş (Veraltet)',
      color: '#9CA3AF',
      bg: 'rgba(156, 163, 175, 0.12)',
      border: 'rgba(156, 163, 175, 0.3)',
      className: 'badge-nuance-dated'
    });
  }

  return foundTags;
}

// OpenThesaurus API Entegrasyonu & Önbellek
const _thesaurusCache = new Map();

async function fetchOpenThesaurus(word, signal) {
  if (!word) return { synonyms: [], wordFamily: [], levels: [] };
  const clean = word.trim().toLowerCase().replace(/^(der|die|das)\s+/i, '');
  if (_thesaurusCache.has(clean)) {
    return _thesaurusCache.get(clean);
  }

  try {
    const url = `https://www.openthesaurus.de/synonyme/search?q=${encodeURIComponent(clean)}&format=application/json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const effectiveSignal = signal || controller.signal;

    const resp = await fetch(url, { signal: effectiveSignal });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const emptyResult = { synonyms: [], wordFamily: [], levels: [] };
      _thesaurusCache.set(clean, emptyResult);
      return emptyResult;
    }

    const data = await resp.json();
    const synonymsSet = new Set();
    const wordFamilySet = new Set();
    const levelsSet = new Set();
    const cleanStem = clean.slice(0, Math.max(3, clean.length - 2));

    if (Array.isArray(data.synsets)) {
      for (const synset of data.synsets) {
        if (Array.isArray(synset.categories)) {
          synset.categories.forEach((c) => levelsSet.add(c));
        }
        if (Array.isArray(synset.terms)) {
          for (const t of synset.terms) {
            const rawTerm = (t.term || '').trim();
            const cleanTerm = rawTerm.replace(/^\(.*?\)\s*/, '').replace(/\s*\(.*?\)$/, '').trim();
            if (t.level) levelsSet.add(t.level);

            if (cleanTerm && cleanTerm.toLowerCase() !== clean) {
              if (cleanStem && cleanTerm.toLowerCase().includes(cleanStem) && cleanTerm.length > clean.length) {
                wordFamilySet.add(cleanTerm);
              } else if (!cleanTerm.includes('(') && cleanTerm.split(' ').length <= 2) {
                synonymsSet.add(cleanTerm);
              }
            }
          }
        }
      }
    }

    const result = {
      synonyms: Array.from(synonymsSet).slice(0, 10),
      wordFamily: Array.from(wordFamilySet).slice(0, 6),
      levels: Array.from(levelsSet)
    };

    _thesaurusCache.set(clean, result);
    return result;
  } catch (_) {
    return { synonyms: [], wordFamily: [], levels: [] };
  }
}

// 3. Fiil + Edat + Hal (Rektion) ve Çekim (Stammformen) Veritabanı (100 B1-C1 Fiil)
const GERMAN_GRAMMAR_ENRICHMENT = {
  'abhängen': { preposition: 'von', case: 'Dativ', badge: '🔗 von + Dativ', note: 'Örn: Alles hängt vom Wetter ab.' },
  'achten': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ', note: 'Örn: Achte auf den Verkehr!' },
  'anfangen': { preposition: 'mit', case: 'Dativ', badge: '🔗 mit + Dativ', note: 'Örn: Wir fangen mit der Übung an.' },
  'ankommen': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ', note: 'Örn: Es kommt auf den Kontext an.' },
  'antworten': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ', note: 'Örn: Antworte bitte auf meine Frage.' },
  'ärgern': { preposition: 'über', case: 'Akkusativ', badge: '🔗 über + Akkusativ (sich)', note: 'Örn: Er ärgert sich über den Fehler.' },
  'aufhören': { preposition: 'mit', case: 'Dativ', badge: '🔗 mit + Dativ', note: 'Örn: Hör mit dem Lärm auf!' },
  'aufpassen': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ', note: 'Örn: Pass gut auf deine Tasche auf!' },
  'aufregen': { preposition: 'über', case: 'Akkusativ', badge: '🔗 über + Akkusativ (sich)', note: 'Örn: Reg dich nicht über Kleinigkeiten auf.' },
  'ausgeben': { preposition: 'für', case: 'Akkusativ', badge: '🔗 für + Akkusativ', note: 'Örn: Er gibt viel Geld für Bücher aus.' },
  'bedanken': { preposition: 'bei / für', case: 'Dativ / Akkusativ', badge: '🔗 bei + Dat / für + Akk', note: 'Örn: Ich bedanke mich bei dir für die Hilfe.' },
  'beginnen': { preposition: 'mit', case: 'Dativ', badge: '🔗 mit + Dativ', note: 'Örn: Wir beginnen mit dem Unterricht.' },
  'bemühen': { preposition: 'um', case: 'Akkusativ', badge: '🔗 um + Akkusativ (sich)', note: 'Örn: Sie bemüht sich um ein Visum.' },
  'berichten': { preposition: 'über / von', case: 'Akkusativ / Dativ', badge: '🔗 über + Akk / von + Dat', note: 'Örn: Er berichtet über das Ereignis.' },
  'beschäftigen': { preposition: 'mit', case: 'Dativ', badge: '🔗 mit + Dativ (sich)', note: 'Örn: Ich beschäftige mich mit deutscher Grammatik.' },
  'beschweren': { preposition: 'bei / über', case: 'Dativ / Akkusativ', badge: '🔗 bei + Dat / über + Akk', note: 'Örn: Sie beschwert sich beim Chef über den Lärm.' },
  'bestehen': { preposition: 'aus / auf / in', case: 'Dativ', badge: '🔗 aus / auf / in + Dativ', note: 'bestehen aus: maddeden oluşmak | auf: ısrar etmek | in: özünde bulunmak' },
  'beteiligen': { preposition: 'an', case: 'Dativ', badge: '🔗 an + Dativ (sich)', note: 'Örn: Wer beteiligt sich an den Kosten?' },
  'bewerben': { preposition: 'um', case: 'Akkusativ', badge: '🔗 um + Akkusativ (sich)', note: 'Örn: Er bewirbt sich um eine neue Stelle.' },
  'beziehen': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ (sich)', note: 'Örn: Meine Frage bezieht sich auf Seite 5.' },
  'bitten': { preposition: 'um', case: 'Akkusativ', badge: '🔗 um + Akkusativ', note: 'Örn: Darf ich dich um einen Gefallen bitten?' },
  'danken': { preposition: 'für', case: 'Akkusativ', badge: '🔗 für + Akkusativ', note: 'Örn: Ich danke dir für die Unterstützung.' },
  'denken': { preposition: 'an', case: 'Akkusativ', badge: '🔗 an + Akkusativ', note: 'Örn: Ich denke oft an dich.' },
  'diskutieren': { preposition: 'über / mit', case: 'Akkusativ / Dativ', badge: '🔗 über + Akk / mit + Dat', note: 'Örn: Wir diskutieren über das Thema mit dem Lehrer.' },
  'einladen': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Ich lade dich zu meiner Party ein.' },
  'entscheiden': { preposition: 'für / gegen', case: 'Akkusativ', badge: '🔗 für / gegen + Akkusativ (sich)', note: 'Örn: Ich habe mich für diese Option entschieden.' },
  'entschuldigen': { preposition: 'bei / für', case: 'Dativ / Akkusativ', badge: '🔗 bei + Dat / für + Akk', note: 'Örn: Er entschuldigt sich bei ihr für die Verspätung.' },
  'erfahren': { preposition: 'von / über', case: 'Dativ / Akkusativ', badge: '🔗 von + Dat / über + Akk', note: 'Örn: Hast du von dem Unfall erfahren?' },
  'erholen': { preposition: 'von', case: 'Dativ', badge: '🔗 von + Dativ (sich)', note: 'Örn: Sie muss sich von der Reise erholen.' },
  'erinnern': { preposition: 'an', case: 'Akkusativ', badge: '🔗 an + Akkusativ (sich)', note: 'Örn: Erinnerst du dich an unseren Urlaub?' },
  'erkennen': { preposition: 'an', case: 'Dativ', badge: '🔗 an + Dativ', note: 'Örn: Man erkennt ihn an seiner tiefen Stimme.' },
  'erkundigen': { preposition: 'bei / nach', case: 'Dativ', badge: '🔗 bei + Dat / nach + Dat (sich)', note: 'Örn: Er erkundigt sich beim Arzt nach dem Befund.' },
  'erschrecken': { preposition: 'über / vor', case: 'Akkusativ / Dativ', badge: '🔗 über + Akk / vor + Dat', note: 'Örn: Sie erschrak vor dem Hund.' },
  'erzählen': { preposition: 'von / über', case: 'Dativ / Akkusativ', badge: '🔗 von + Dat / über + Akk', note: 'Örn: Erzähl mir von deiner Reise!' },
  'fragen': { preposition: 'nach', case: 'Dativ', badge: '🔗 nach + Dativ', note: 'Örn: Der Tourist fragt nach dem Weg.' },
  'freuen': { preposition: 'auf / über', case: 'Akkusativ', badge: '🔗 auf / über + Akkusativ (sich)', note: 'freuen auf: geleceğe sevinmek | freuen über: şu ana/geçmişe sevinmek' },
  'führen': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Diese Entscheidung führt zu Problemen.' },
  'fürchten': { preposition: 'vor', case: 'Dativ', badge: '🔗 vor + Dativ (sich)', note: 'Örn: Viele fürchten sich vor Prüfungen.' },
  'gehören': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Das gehört zu meinen Aufgaben.' },
  'gewöhnen': { preposition: 'an', case: 'Akkusativ', badge: '🔗 an + Akkusativ (sich)', note: 'Örn: Ich habe mich an das deutsche Wetter gewöhnt.' },
  'glauben': { preposition: 'an', case: 'Akkusativ', badge: '🔗 an + Akkusativ', note: 'Örn: Glaubst du an Wunder?' },
  'gratulieren': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Wir gratulieren dir zum Geburtstag!' },
  'halten': { preposition: 'von / für', case: 'Dativ / Akkusativ', badge: '🔗 von + Dat / für + Akk', note: 'Was hältst du davon? / Ich halte ihn für kompetent.' },
  'handeln': { preposition: 'von / um', case: 'Dativ / Akkusativ', badge: '🔗 von + Dat / um + Akk (es handelt)', note: 'handeln von: konusu olmak | es handelt sich um: söz konusu olmak' },
  'helfen': { preposition: 'bei', case: 'Dativ', badge: '🔗 bei + Dativ', note: 'Örn: Kannst du mir beim Umzug helfen?' },
  'hinweisen': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ', note: 'Örn: Das Schild weist auf die Gefahr hin.' },
  'hoffen': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ', note: 'Örn: Wir hoffen auf besseres Wetter.' },
  'hören': { preposition: 'von / auf', case: 'Dativ / Akkusativ', badge: '🔗 von + Dat / auf + Akk', note: 'Ich habe lange nichts von ihm gehört. / Hör auf mich!' },
  'informieren': { preposition: 'über', case: 'Akkusativ', badge: '🔗 über + Akkusativ (sich)', note: 'Örn: Informieren Sie sich über die Bedingungen.' },
  'interessieren': { preposition: 'für', case: 'Akkusativ', badge: '🔗 für + Akkusativ (sich)', note: 'Örn: Interessierst du dich für moderne Kunst?' },
  'kämpfen': { preposition: 'für / gegen / um', case: 'Akkusativ', badge: '🔗 für / gegen / um + Akkusativ', note: 'Örn: Sie kämpfen für Gerechtigkeit.' },
  'klagen': { preposition: 'über', case: 'Akkusativ', badge: '🔗 über + Akkusativ', note: 'Örn: Er klagt über starke Kopfschmerzen.' },
  'konzentrieren': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ (sich)', note: 'Örn: Ich muss mich auf meine Arbeit konzentrieren.' },
  'kümmern': { preposition: 'um', case: 'Akkusativ', badge: '🔗 um + Akkusativ (sich)', note: 'Örn: Wer kümmert sich um die Katze?' },
  'lachen': { preposition: 'über', case: 'Akkusativ', badge: '🔗 über + Akkusativ', note: 'Örn: Alle lachen über den Witz.' },
  'leiden': { preposition: 'an / unter', case: 'Dativ', badge: '🔗 an + Dat / unter + Dat', note: 'leiden an: hastalıktan çekmek | leiden unter: koşullardan çekmek' },
  'nachdenken': { preposition: 'über', case: 'Akkusativ', badge: '🔗 über + Akkusativ', note: 'Örn: Ich denke über dein Angebot nach.' },
  'passen': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Das Hemd passt gut zur Hose.' },
  'protestieren': { preposition: 'gegen', case: 'Akkusativ', badge: '🔗 gegen + Akkusativ', note: 'Örn: Tausende protestieren gegen die Maßnahme.' },
  'rechnen': { preposition: 'mit', case: 'Dativ', badge: '🔗 mit + Dativ', note: 'Örn: Wir müssen mit Verzögerungen rechnen.' },
  'reden': { preposition: 'über / von', case: 'Akkusativ / Dativ', badge: '🔗 über + Akk / von + Dat', note: 'Örn: Worüber redet ihr?' },
  'riechen': { preposition: 'nach', case: 'Dativ', badge: '🔗 nach + Dativ', note: 'Örn: Hier riecht es nach frischem Kaffee.' },
  'schmecken': { preposition: 'nach', case: 'Dativ', badge: '🔗 nach + Dativ', note: 'Örn: Das Wasser schmeckt nach Chlor.' },
  'schreiben': { preposition: 'an / über', case: 'Akkusativ', badge: '🔗 an + Akk / über + Akk', note: 'Örn: Sie schreibt einen Brief an ihren Freund.' },
  'schützen': { preposition: 'vor', case: 'Dativ', badge: '🔗 vor + Dativ (sich)', note: 'Örn: Diese Creme schützt vor Sonnenbrand.' },
  'sehnen': { preposition: 'nach', case: 'Dativ', badge: '🔗 nach + Dativ (sich)', note: 'Örn: Er sehnt sich nach seiner Heimat.' },
  'sorgen': { preposition: 'für / um', case: 'Akkusativ', badge: '🔗 für + Akk / um + Akk (sich)', note: 'sorgen für: sağlamak/bakmak | sich sorgen um: endişelenmek' },
  'sprechen': { preposition: 'mit / über / von', case: 'Dativ / Akkusativ', badge: '🔗 mit + Dat / über + Akk / von + Dat', note: 'Örn: Er spricht mit dem Arzt über die Therapie.' },
  'sterben': { preposition: 'an', case: 'Dativ', badge: '🔗 an + Dativ', note: 'Örn: Er starb an den Folgen eines Unfalls.' },
  'streiten': { preposition: 'mit / über', case: 'Dativ / Akkusativ', badge: '🔗 mit + Dat / über + Akk', note: 'Örn: Sie streiten oft über Geld.' },
  'teilnehmen': { preposition: 'an', case: 'Dativ', badge: '🔗 an + Dativ', note: 'Örn: Nimmst du an der Konferenz teil?' },
  'telefonieren': { preposition: 'mit', case: 'Dativ', badge: '🔗 mit + Dativ', note: 'Örn: Ich telefoniere gerade mit meiner Mutter.' },
  'träumen': { preposition: 'von', case: 'Dativ', badge: '🔗 von + Dativ', note: 'Örn: Sie träumt von einem eigenen Haus.' },
  'überreden': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Er überredete mich zu diesem Ausflug.' },
  'überzeugen': { preposition: 'von', case: 'Dativ', badge: '🔗 von + Dativ', note: 'Örn: Seine Argumente überzeugen mich von der Idee.' },
  'verbinden': { preposition: 'mit', case: 'Dativ', badge: '🔗 mit + Dativ', note: 'Örn: Verbinden Sie mich bitte mit der Buchhaltung.' },
  'vergleichen': { preposition: 'mit', case: 'Dativ', badge: '🔗 mit + Dativ', note: 'Örn: Man kann das nicht mit damals vergleichen.' },
  'verlassen': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ (sich)', note: 'Örn: Du kannst dich voll auf mich verlassen.' },
  'verlieben': { preposition: 'in', case: 'Akkusativ', badge: '🔗 in + Akkusativ (sich)', note: 'Örn: Sie hat sich in ihn verliebt.' },
  'verstehen': { preposition: 'von', case: 'Dativ', badge: '🔗 von + Dativ (etwas)', note: 'Örn: Er versteht viel von Computern.' },
  'vertrauen': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ', note: 'Örn: Vertraue auf deine Fähigkeiten!' },
  'verzichten': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ', note: 'Örn: Ich verzichte auf den Nachtisch.' },
  'vorbereiten': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ (sich)', note: 'Örn: Wir bereiten uns auf die Prüfung vor.' },
  'warnen': { preposition: 'vor', case: 'Dativ', badge: '🔗 vor + Dativ', note: 'Örn: Der Wetterdienst warnt vor Glatteis.' },
  'warten': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ', note: 'Örn: Wir warten auf den Bus.' },
  'wenden': { preposition: 'an', case: 'Akkusativ', badge: '🔗 an + Akkusativ (sich)', note: 'Örn: Bei Fragen wenden Sie sich an die Information.' },
  'wirken': { preposition: 'auf', case: 'Akkusativ', badge: '🔗 auf + Akkusativ', note: 'Örn: Das Medikament wirkt schnell auf das Nervensystem.' },
  'wundern': { preposition: 'über', case: 'Akkusativ', badge: '🔗 über + Akkusativ (sich)', note: 'Örn: Ich wundere mich über seine Reaktion.' },
  'zählen': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Goethe zählt zu den bedeutendsten Dichtern.' },
  'zweifeln': { preposition: 'an', case: 'Dativ', badge: '🔗 an + Dativ', note: 'Örn: Niemand zweifelt an deiner Ehrlichkeit.' },
  'zwingen': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Man kann niemanden zum Glück zwingen.' },
  'beitragen': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Jeder kann zum Erfolg beitragen.' },
  'verfügen': { preposition: 'über', case: 'Akkusativ', badge: '🔗 über + Akkusativ', note: 'Örn: Die Firma verfügt über modernste Technologie.' },
  'klarkommen': { preposition: 'mit', case: 'Dativ', badge: '🔗 mit + Dativ', note: 'Örn: Kommst du mit dem neuen System klar?' },
  'umgehen': { preposition: 'mit', case: 'Dativ', badge: '🔗 mit + Dativ', note: 'Örn: Er kann gut mit Menschen umgehen.' },
  'auffordern': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Sie fordert ihn zur Mithilfe auf.' },
  'aufrufen': { preposition: 'zu', case: 'Dativ', badge: '🔗 zu + Dativ', note: 'Örn: Der Verein ruft zu Spenden auf.' },
  'geraten': { preposition: 'in', case: 'Akkusativ', badge: '🔗 in + Akkusativ', note: 'Örn: Er geriet in große Panik.' }
};

// Sık Karıştırılan Kelime Çiftleri / Nüans & False Friends
const CONFUSED_WORD_PAIRS = {
  'kennen': { pair: 'wissen', note: 'kennen: bir kişiyi, yeri veya nesneyi tanımak (nesne alır) | wissen: bir olguyu/bilgiyi bilmek (genelde dass-cümlesi alır)' },
  'wissen': { pair: 'kennen', note: 'wissen: bir bilgiyi, haberi veya gerçeği bilmek | kennen: bir şahsı veya somut nesneyi şahsen tanımak' },
  'ändern': { pair: 'verändern', note: 'ändern: bir planı, kıyafeti veya tekil durumu değiştirmek | verändern: bir şeyin özünü/yapısını köklü biçimde dönüştürmek' },
  'verändern': { pair: 'ändern', note: 'verändern: köklü ve kalıcı dönüşüm (sich verändern) | ändern: yüzeysel veya anlık değişiklik' },
  'allein': { pair: 'einsam', note: 'allein: fiziksel olarak tek başına (yanında kimse yok) | einsam: psikolojik olarak yalnızlık ve kimsesizlik hissetmek' },
  'einsam': { pair: 'allein', note: 'einsam: ruhen yalnız ve ıssız hissetmek | allein: yanında bir başkası bulunmamak (nötr)' },
  'erfinden': { pair: 'entdecken', note: 'erfinden: daha önce dünyada var olmayan bir şeyi icat etmek | entdecken: zaten var olan gizli bir şeyi keşfetmek' },
  'entdecken': { pair: 'erfinden', note: 'entdecken: var olan kıtayı/gezegeni keşfetmek | erfinden: sıfırdan yeni teknoloji icat etmek' },
  'effektiv': { pair: 'effizient', note: 'effektiv: amaca ulaştıran doğru şeyi yapmak (etkili) | effizient: hedefe en az zaman ve kaynakla ulaşmak (verimli)' },
  'effizient': { pair: 'effektiv', note: 'effizient: yüksek verimlilikle kaynak tasarruflu çalışmak | effektiv: hedeflenen sonuca tam ulaşmak' },
  'bitten': { pair: 'fragen', note: 'bitten (um): bir şey rica etmek / istemek | fragen (nach): soru sormak, bilgi edinmek' },
  'fragen': { pair: 'bitten', note: 'fragen: soru yöneltmek | bitten: rica ve talepte bulunmak' },
  'brauchen': { pair: 'gebrauchen', note: 'brauchen: ihtiyacı olmak (to need) | gebrauchen: kullanmak, işletmek (to use)' },
  'gebrauchen': { pair: 'brauchen', note: 'gebrauchen: aleti/malzemeyi kullanmak | brauchen: ihtiyaç duymak' },
  'bekommen': { pair: 'werden', note: 'bekommen: elde etmek, hediye/mektup almak (to receive) [False friend: İngilizce become değil!] | werden: olmak, dönüşmek (to become)' },
  'werden': { pair: 'bekommen', note: 'werden: olmak, dönüşmek, yaşlanmak | bekommen: almak/edinmek' },
  'liegen': { pair: 'legen', note: 'liegen (+ Dat): yatay konumda bulunmak (durum, düzensiz) | legen (+ Akk): yatay koymak/bırakmak (eylem, düzenli)' },
  'legen': { pair: 'liegen', note: 'legen (+ Akk): yatay yere koymak (eylem) | liegen (+ Dat): yatay yatıyor olmak (durum)' },
  'stehen': { pair: 'stellen', note: 'stehen (+ Dat): dikey durmak (durum, düzensiz) | stellen (+ Akk): dikey dikmek/koymak (eylem, düzenli)' },
  'stellen': { pair: 'stehen', note: 'stellen (+ Akk): dikey vaziyete getirmek | stehen (+ Dat): dikey vaziyette duruyor olmak' },
  'sitzen': { pair: 'setzen', note: 'sitzen (+ Dat): oturuyor vaziyette olmak (durum) | sich setzen (+ Akk): sandalyeye oturmak (eylem)' },
  'setzen': { pair: 'sitzen', note: 'sich setzen (+ Akk): oturma eylemini yapmak | sitzen (+ Dat): oturur durumda bulunmak' },
  'hängen': { pair: 'hängen', note: 'hängen (+ Dat): duvarda asılı durmak (durum, düzensiz: hing, gehangen) | hängen (+ Akk): duvara asmak (eylem, düzenli: hängte, gehängt)' },
  'bestehen': { pair: 'bestehen', note: 'bestehen aus (+ Dat): maddeden oluşmak | bestehen auf (+ Dat): fikirde ısrar etmek | bestehen in (+ Dat): özünde bulunmak' }
};

// Fiil ve kelime için zenginleştirme arama yardımcısı
function getGrammarEnrichment(word) {
  if (!word) return null;
  const clean = word.toLowerCase().trim().replace(/^(sich|etwas|jemand)\s+/i, '').trim();
  if (GERMAN_GRAMMAR_ENRICHMENT[clean]) return GERMAN_GRAMMAR_ENRICHMENT[clean];

  // Ayrılabilen veya önekli fiilleri dene (örn. 'teilnehmen' -> 'nehmen', 'nachdenken' -> 'denken')
  for (const key of Object.keys(GERMAN_GRAMMAR_ENRICHMENT)) {
    if (clean === key || (clean.endsWith(key) && clean.length <= key.length + 5)) {
      return GERMAN_GRAMMAR_ENRICHMENT[key];
    }
  }
  return null;
}

function getConfusedWordPair(word) {
  if (!word) return null;
  const clean = word.toLowerCase().trim().replace(/^(sich|etwas|jemand)\s+/i, '').trim();
  return CONFUSED_WORD_PAIRS[clean] || null;
}

// Fiillerde Stammformen Şeridi (spricht · sprach · hat gesprochen)
function getStammformenRibbon(verbObj) {
  if (!verbObj) return '';
  const praesens = verbObj.praesens || '';
  const praeteritum = verbObj.praeteritum || '';
  const p2 = (verbObj.partizipZwei || '').replace(/^(hat|ist)\s+/i, '').trim();
  const hilfs = verbObj.hilfsverb || 'hat';

  if (!praesens && !praeteritum && !p2) return '';

  const parts = [];
  if (praesens && praesens !== '-') parts.push(`<span>${praesens}</span>`);
  if (praeteritum && praeteritum !== '-') parts.push(`<span>${praeteritum}</span>`);
  if (p2 && p2 !== '-') parts.push(`<span>${hilfs} ${p2}</span>`);

  if (parts.length === 0) return '';
  return `
    <div class="verb-stammformen-ribbon" title="Präsens (3. tekil) · Präteritum · Perfekt">
      ${parts.join(' · ')}
    </div>
  `;
}

// 4. Kart Olgunluk Rozeti (Maturity)
function getCardMaturity(card) {
  const reps = Number(card?.repetitions ?? (card?.srsStage ?? 0));
  const interval = Number(card?.interval ?? (card?.intervalDays ?? 0));

  if (reps === 0) {
    return {
      level: 'new',
      label: 'Yeni',
      color: '#60A5FA',
      bg: 'rgba(96, 165, 250, 0.12)',
      border: 'rgba(96, 165, 250, 0.3)',
      className: 'maturity-new',
      badgeHtml: '<span class="badge badge-maturity maturity-new">Yeni</span>'
    };
  }
  if (interval >= 1 && interval <= 3) {
    return {
      level: 'learning',
      label: 'Öğreniliyor',
      color: '#FBBF24',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.3)',
      className: 'maturity-learning',
      badgeHtml: '<span class="badge badge-maturity maturity-learning">Öğreniliyor</span>'
    };
  }
  if (interval >= 4 && interval <= 20) {
    return {
      level: 'young',
      label: 'Genç',
      color: '#34D399',
      bg: 'rgba(52, 211, 153, 0.12)',
      border: 'rgba(52, 211, 153, 0.3)',
      className: 'maturity-young',
      badgeHtml: '<span class="badge badge-maturity maturity-young">Genç</span>'
    };
  }
  return {
    level: 'mature',
    label: 'Olgun',
    color: '#A78BFA',
    bg: 'rgba(167, 139, 250, 0.12)',
    border: 'rgba(167, 139, 250, 0.3)',
    className: 'maturity-mature',
    badgeHtml: '<span class="badge badge-maturity maturity-mature">Olgun</span>'
  };
}

// 5. SM-2 Sonraki Tekrar Süresi Tahmini (4 Buton Üzeri)
function calculateSM2NextIntervals(card) {
  const repetitions = Number(card?.repetitions ?? (card?.srsStage ?? 0));
  const interval = Number(card?.interval ?? (card?.intervalDays ?? 0));
  const easeFactor = Number(card?.easeFactor ?? 2.5);

  // Tekrar (0)
  const againTime = '<10dk';

  // Zor (1)
  const hardDays = repetitions === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
  const hardTime = `${hardDays}g`;

  // İyi (2)
  const goodDays = repetitions === 0 ? 1 : (repetitions === 1 ? 3 : Math.round(interval * easeFactor));
  const goodTime = `${goodDays}g`;

  // Kolay (3)
  const easyDays = repetitions === 0 ? 4 : Math.round(interval * easeFactor * 1.3);
  const easyTime = `${easyDays}g`;

  return { againTime, hardTime, goodTime, easyTime };
}

// 6. Cloze (Boşluk Doldurma) Cümle Üreteci
function createClozeSentence(exampleSentence, targetWord, verbForms = {}) {
  if (!exampleSentence || !targetWord) {
    return {
      maskedHtml: '[ <span class="fc-cloze-blank">_______</span> ]',
      revealedHtml: `<span class="fc-cloze-revealed-word">${targetWord || ''}</span>`,
      turkishHint: ''
    };
  }

  let germanPart = exampleSentence;
  let turkishHint = '';
  const match = exampleSentence.match(/^(.*?)\((.*?)\)$/);
  if (match) {
    germanPart = match[1].trim();
    turkishHint = match[2].trim();
  }
  // [1], [1a] gibi Wiktionary numaralarını temizle
  germanPart = germanPart.replace(/^\[[0-9a-zA-Z,\s–\/\.\-]+\]\s*/i, '').trim();

  const cleanTarget = targetWord.replace(/^(der|die|das)\s+/i, '').trim();
  const candidates = [cleanTarget];

  if (verbForms.praesens) candidates.push(verbForms.praesens);
  if (verbForms.praeteritum) candidates.push(verbForms.praeteritum);
  if (verbForms.partizipZwei) candidates.push(verbForms.partizipZwei.replace(/^(hat|ist)\s+/i, '').trim());

  // Kök adayı (en az 4 harf)
  if (cleanTarget.length >= 4) {
    candidates.push(cleanTarget.slice(0, cleanTarget.length - 2));
  }

  let maskedGerman = '';
  let revealedGerman = '';
  let replaced = false;

  // Regex ile eşleşen kelimeyi bul
  for (const cand of candidates) {
    if (!cand || cand.length < 3) continue;
    const escaped = cand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`\\b(${escaped}[a-zäöüß]*)\\b`, 'i');

    if (rx.test(germanPart)) {
      maskedGerman = germanPart.replace(rx, '<span class="fc-cloze-blank">[ _______ ]</span>');
      revealedGerman = germanPart.replace(rx, '<span class="fc-cloze-revealed-word">$1</span>');
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    maskedGerman = `${germanPart} <div style="margin-top:8px;">[ <span class="fc-cloze-blank">_______</span> ]</div>`;
    revealedGerman = `${germanPart} <div style="margin-top:8px;"><span class="fc-cloze-revealed-word">${cleanTarget}</span></div>`;
  }

  return {
    maskedHtml: maskedGerman,
    revealedHtml: revealedGerman,
    turkishHint: turkishHint ? `💡 İpucu: ${turkishHint}` : ''
  };
}

// =========================================================================
// 6. 4 AŞAMALI AKILLI ARAMA BORU HATTI (SMART SEARCH PIPELINE)
// =========================================================================

/**
 * Umlaut normalizasyonu (ae->ä, oe->ö, ue->ü, ss->ß) ve temizleme
 */
function normalizeGermanSearch(text) {
  if (!text) return '';
  let str = String(text).trim().toLowerCase();
  // Umlaut katlamalarını tersine çevirerek Almanca standart karakterlere normalize et
  str = str
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü')
    .replace(/ss/g, 'ß');
  return str;
}

/**
 * Almanca çekim eklerini ve Partizip II (ge-) önekini soyarak olası kök/mastar adaylarını üretir
 */
function stemGermanCandidates(word) {
  if (!word) return [];
  const clean = String(word).trim().toLowerCase();
  if (clean.length < 3) return [clean];

  const candidates = new Set();
  candidates.add(clean);

  // 1. Partizip II öneki "ge-" soyma (örn: gesagt -> sagt, gekauft -> kauft, gearbeitet -> arbeitet)
  let strippedPrefix = clean;
  if (clean.startsWith('ge') && clean.length > 4) {
    strippedPrefix = clean.slice(2);
    candidates.add(strippedPrefix);
  }

  // 2. Çekim ekleri listesi (uzundan kısaya doğru)
  const suffixes = [
    'test', 'ten', 'tet', 'est',
    'en', 'st', 'te', 'et', 'er', 'es', 'em', 'el',
    'e', 't', 'n', 's'
  ];

  const testWords = [clean];
  if (strippedPrefix !== clean) testWords.push(strippedPrefix);

  for (const base of testWords) {
    for (const suffix of suffixes) {
      if (base.endsWith(suffix) && base.length - suffix.length >= 2) {
        const root = base.slice(0, base.length - suffix.length);
        candidates.add(root);
        // Fiil mastar hali adayı: root + 'en' ve root + 'n'
        candidates.add(root + 'en');
        candidates.add(root + 'n');
      }
    }
  }

  // 3. Çoğul isimlerde Umlaut çözümü (Häuser -> Haus, Bücher -> Buch, Bäume -> Baum)
  if (clean.includes('ä')) candidates.add(clean.replace(/ä/g, 'a'));
  if (clean.includes('ö')) candidates.add(clean.replace(/ö/g, 'o'));
  if (clean.includes('ü')) candidates.add(clean.replace(/ü/g, 'u'));

  return Array.from(candidates);
}

/**
 * Hızlı Levenshtein Mesafesi (Edit Distance) Hesaplayıcı
 */
function levenshteinDistance(s1, s2) {
  if (s1 === s2) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;
  if (Math.abs(len1 - len2) > 3) return 999;

  let prevRow = new Array(len2 + 1);
  let currRow = new Array(len2 + 1);

  for (let j = 0; j <= len2; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    currRow[0] = i;
    const char1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= len2; j++) {
      const cost = char1 === s2.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,       // silme
        currRow[j - 1] + 1,   // ekleme
        prevRow[j - 1] + cost // değiştirme
      );
    }
    for (let j = 0; j <= len2; j++) {
      prevRow[j] = currRow[j];
    }
  }

  return currRow[len2];
}

/**
 * Yerel sözlük kelimelerini tarayarak Levenshtein mesafesi <= 2 olan benzer kelimeleri bulur
 */
function findSimilarWords(query, maxResults = 5) {
  if (!query || typeof query !== 'string') return [];
  const cleanQ = query.trim().toLowerCase();
  const normQ = normalizeGermanSearch(cleanQ);
  if (normQ.length < 2) return [];

  const wordPool = new Map(); // normalized -> canonical

  // 1. Doğrulanmış Çekirdek Sözlük (VERIFIED_CORE_VOCABULARY)
  if (typeof window !== 'undefined' && window.VERIFIED_CORE_VOCABULARY) {
    for (const key of Object.keys(window.VERIFIED_CORE_VOCABULARY)) {
      const item = window.VERIFIED_CORE_VOCABULARY[key];
      const canon = item.germanWord || key;
      wordPool.set(canon.toLowerCase(), canon);
    }
  }

  // 2. Standalone Çevrimdışı Sözlük Motoru (OfflineDictionary)
  if (typeof window !== 'undefined' && window.OfflineDictionaryEngine) {
    try {
      const nouns = window.CORE_NOUNS || {};
      for (const k of Object.keys(nouns)) {
        const it = nouns[k];
        if (it && it.de) wordPool.set(it.de.toLowerCase(), it.de);
      }
      const verbs = window.IRREGULAR_VERBS || {};
      for (const k of Object.keys(verbs)) {
        wordPool.set(k.toLowerCase(), k);
      }
      const adjs = window.CORE_ADJECTIVES || {};
      for (const k of Object.keys(adjs)) {
        const it = adjs[k];
        if (it && it.de) wordPool.set(it.de.toLowerCase(), it.de);
      }
    } catch (_) {}
  }

  // 3. Dilbilgisi Zenginleştirme Havuzu (Rektion & False Friends)
  for (const k of Object.keys(GERMAN_GRAMMAR_ENRICHMENT)) {
    wordPool.set(k.toLowerCase(), k);
  }

  // 4. Kullanıcının Özel Sözlüğü (customUserDictionary)
  try {
    const customUserDict = JSON.parse(localStorage.getItem('customUserDictionary') || '{}');
    for (const k of Object.keys(customUserDict)) {
      const it = customUserDict[k];
      const canon = it.germanWord || k;
      wordPool.set(canon.toLowerCase(), canon);
    }
  } catch (_) {}

  const matches = [];

  for (const [lowerWord, canonical] of wordPool.entries()) {
    if (lowerWord === cleanQ || lowerWord === normQ) continue; // Tam eşleşmeyi atla

    const normTarget = normalizeGermanSearch(lowerWord);
    const dist = levenshteinDistance(normQ, normTarget);

    // Edit mesafesi en fazla 2 (veya 7+ harfli uzun kelimelerde 3)
    const maxAllowedDist = normQ.length >= 7 ? 3 : 2;

    if (dist <= maxAllowedDist) {
      let score = dist * 10;
      // İlk harf veya ilk 2 harf aynıysa puan bonusu
      if (normTarget[0] === normQ[0]) score -= 3;
      if (normTarget.slice(0, 2) === normQ.slice(0, 2)) score -= 2;
      // Uzunluk farkı
      score += Math.abs(normTarget.length - normQ.length);

      matches.push({
        word: canonical,
        distance: dist,
        score
      });
    }
  }

  matches.sort((a, b) => a.score - b.score);

  const uniqueWords = [];
  const seen = new Set();
  for (const m of matches) {
    const low = m.word.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      uniqueWords.push(m.word);
      if (uniqueWords.length >= maxResults) break;
    }
  }

  return uniqueWords;
}

/**
 * DeepL Fallback Önbelleğini okur
 */
function getDeeplFallbackFromCache(word) {
  try {
    const cache = JSON.parse(localStorage.getItem('deeplFallbackCache') || '{}');
    const key = String(word).trim().toLowerCase();
    return cache[key] || null;
  } catch (_) {
    return null;
  }
}

/**
 * DeepL Fallback Çevirisini önbelleğe kaydeder
 */
function saveDeeplFallbackToCache(word, translation) {
  try {
    const cache = JSON.parse(localStorage.getItem('deeplFallbackCache') || '{}');
    const key = String(word).trim().toLowerCase();
    cache[key] = {
      translation,
      timestamp: Date.now()
    };
    localStorage.setItem('deeplFallbackCache', JSON.stringify(cache));
  } catch (_) {}
}

/**
 * Kullanıcının özel sözlüğüne (customUserDictionary) yeni kelime ekler
 */
function saveToCustomUserDictionary(entry) {
  if (!entry || !entry.germanWord) return;
  try {
    const dict = JSON.parse(localStorage.getItem('customUserDictionary') || '{}');
    const key = entry.germanWord.trim().toLowerCase();
    dict[key] = entry;
    localStorage.setItem('customUserDictionary', JSON.stringify(dict));

    // Standalone Offline Dictionary motoruna da anında kaydet
    if (typeof window !== 'undefined' && window.OfflineDictionary && typeof window.OfflineDictionary.importAdditionalDictionary === 'function') {
      window.OfflineDictionary.importAdditionalDictionary([entry]);
    }
  } catch (_) {}
}

/**
 * Kullanıcı özel sözlüğünde arama yapar
 */
function searchCustomUserDictionary(word) {
  if (!word) return null;
  try {
    const dict = JSON.parse(localStorage.getItem('customUserDictionary') || '{}');
    const key = String(word).trim().toLowerCase();
    if (dict[key]) return dict[key];
    const norm = normalizeGermanSearch(key);
    for (const k of Object.keys(dict)) {
      if (normalizeGermanSearch(k) === norm) {
        return dict[k];
      }
    }
  } catch (_) {}
  return null;
}

/**
 * 4 Aşamalı Akıllı Arama Boru Hattı
 * 1. Tam Eşleşme (Exact Match)
 * 2. Kök Bulma (Lemmatization / Stemming)
 * 3. Yazım Hatası Yakalama ("Bunu mu demek istediniz?")
 * 4. Otomatik DeepL Fallback ("No matches found · Translated by DeepL")
 */
async function executeSmartSearchPipeline(query, signal) {
  const rawQuery = String(query || '').trim();
  if (!rawQuery) return null;

  const lowerQuery = rawQuery.toLowerCase();
  const normQuery = normalizeGermanSearch(lowerQuery);

  // -------------------------------------------------------------
  // ADIM 1: Tam Eşleşme (Exact Match)
  // -------------------------------------------------------------
  // 1.a Özel kullanıcı sözlüğü kontrolü
  const customHit = searchCustomUserDictionary(rawQuery);
  if (customHit) {
    return {
      status: 'exact',
      entry: customHit,
      originalQuery: rawQuery,
      similarWords: []
    };
  }

  // 1.b Yerel Sözlük (VERIFIED_CORE_VOCABULARY)
  if (typeof window !== 'undefined' && window.VERIFIED_CORE_VOCABULARY) {
    if (window.VERIFIED_CORE_VOCABULARY[lowerQuery]) {
      const entry = window.DictionaryService
        ? window.DictionaryService.synthesizeInstantEntry(window.VERIFIED_CORE_VOCABULARY[lowerQuery].germanWord || rawQuery)
        : window.VERIFIED_CORE_VOCABULARY[lowerQuery];
      return { status: 'exact', entry, originalQuery: rawQuery, similarWords: [] };
    }
    // Umlaut normalize haliyle ara
    for (const [k, v] of Object.entries(window.VERIFIED_CORE_VOCABULARY)) {
      if (normalizeGermanSearch(k) === normQuery) {
        const entry = window.DictionaryService
          ? window.DictionaryService.synthesizeInstantEntry(v.germanWord || k)
          : v;
        return { status: 'exact', entry, originalQuery: rawQuery, similarWords: [] };
      }
    }
  }

  // 1.c Standalone OfflineDictionary motoru
  if (typeof window !== 'undefined' && window.OfflineDictionary && typeof window.OfflineDictionary.search === 'function') {
    const offHit = window.OfflineDictionary.search(rawQuery) || window.OfflineDictionary.search(normQuery);
    if (offHit) {
      const entry = window.DictionaryService
        ? window.DictionaryService.synthesizeInstantEntry(offHit.germanWord)
        : offHit;
      return { status: 'exact', entry, originalQuery: rawQuery, similarWords: [] };
    }
  }

  // 1.d Genel DictionaryService çözümlemesi (Wiktionary & Tatoeba desteği ile)
  if (typeof window !== 'undefined' && window.DictionaryService && typeof window.DictionaryService.resolveToGermanEntry === 'function') {
    try {
      const resolved = await window.DictionaryService.resolveToGermanEntry(rawQuery, signal);
      if (resolved && !signal?.aborted) {
        return { status: 'exact', entry: resolved, originalQuery: rawQuery, similarWords: [] };
      }
    } catch (_) {}
  }

  if (signal?.aborted) return null;

  // -------------------------------------------------------------
  // ADIM 2: Kök Bulma (Lemmatization / Stemming)
  // -------------------------------------------------------------
  const stemCandidates = stemGermanCandidates(rawQuery);
  for (const cand of stemCandidates) {
    if (cand === lowerQuery) continue;

    // Özel sözlükte kök ara
    const cHit = searchCustomUserDictionary(cand);
    if (cHit) {
      return { status: 'stem', entry: cHit, stem: cand, originalQuery: rawQuery, similarWords: [] };
    }

    // Yerel sözlükte kök ara
    if (typeof window !== 'undefined' && window.VERIFIED_CORE_VOCABULARY && window.VERIFIED_CORE_VOCABULARY[cand]) {
      const entry = window.DictionaryService
        ? window.DictionaryService.synthesizeInstantEntry(window.VERIFIED_CORE_VOCABULARY[cand].germanWord || cand)
        : window.VERIFIED_CORE_VOCABULARY[cand];
      return { status: 'stem', entry, stem: cand, originalQuery: rawQuery, similarWords: [] };
    }

    // OfflineDictionary'de kök ara
    if (typeof window !== 'undefined' && window.OfflineDictionary && typeof window.OfflineDictionary.search === 'function') {
      const offHit = window.OfflineDictionary.search(cand);
      if (offHit) {
        const entry = window.DictionaryService
          ? window.DictionaryService.synthesizeInstantEntry(offHit.germanWord)
          : offHit;
        return { status: 'stem', entry, stem: cand, originalQuery: rawQuery, similarWords: [] };
      }
    }
  }

  if (signal?.aborted) return null;

  // -------------------------------------------------------------
  // ADIM 3: Yazım Hatası Yakalama ("Bunu mu demek istediniz?" / Levenshtein <= 2)
  // -------------------------------------------------------------
  const similarWords = findSimilarWords(rawQuery, 5);

  // -------------------------------------------------------------
  // ADIM 4: Otomatik DeepL Fallback ("No matches found · Translated by DeepL")
  // -------------------------------------------------------------
  let translatedText = '';
  const cachedFallback = getDeeplFallbackFromCache(rawQuery);

  if (cachedFallback && cachedFallback.translation) {
    translatedText = cachedFallback.translation;
  } else {
    try {
      // Girdi Türkçe mi yoksa Almanca mı tespit et
      const isTurkishInput = /[çğıöşüÇĞİÖŞÜ]/.test(rawQuery) && !/[äöüßÄÖÜ]/.test(rawQuery);
      const srcLang = isTurkishInput ? 'tr' : 'de';
      const tgtLang = isTurkishInput ? 'de' : 'tr';

      if (typeof window !== 'undefined' && window.wmTranslator && typeof window.wmTranslator.translateTextHybrid === 'function') {
        translatedText = await window.wmTranslator.translateTextHybrid(rawQuery, srcLang, tgtLang, signal);
      } else {
        // Doğrudan Google/DeepL HTTP isteği fallback
        const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcLang}&tl=${tgtLang}&dt=t&q=${encodeURIComponent(rawQuery)}`;
        const res = await fetch(gUrl, { signal });
        const data = await res.json();
        if (data && Array.isArray(data[0])) {
          translatedText = data[0].map((item) => item[0]).join('').trim();
        }
      }

      if (translatedText && translatedText !== rawQuery) {
        saveDeeplFallbackToCache(rawQuery, translatedText);
      }
    } catch (err) {
      if (err.name === 'AbortError') return null;
      console.warn("DeepL fallback translation failed:", err);
      translatedText = '';
    }
  }

  return {
    status: 'deepl_fallback',
    originalQuery: rawQuery,
    translatedText: translatedText || 'Çeviri alınamadı',
    similarWords
  };
}

// Global Export
window.getArticleStyle = getArticleStyle;
window.detectGermanTags = detectGermanTags;
window.fetchOpenThesaurus = fetchOpenThesaurus;
window.GERMAN_GRAMMAR_ENRICHMENT = GERMAN_GRAMMAR_ENRICHMENT;
window.CONFUSED_WORD_PAIRS = CONFUSED_WORD_PAIRS;
window.getGrammarEnrichment = getGrammarEnrichment;
window.getConfusedWordPair = getConfusedWordPair;
window.getStammformenRibbon = getStammformenRibbon;
window.getCardMaturity = getCardMaturity;
window.calculateSM2NextIntervals = calculateSM2NextIntervals;
window.createClozeSentence = createClozeSentence;
window.normalizeGermanSearch = normalizeGermanSearch;
window.stemGermanCandidates = stemGermanCandidates;
window.levenshteinDistance = levenshteinDistance;
window.findSimilarWords = findSimilarWords;
window.getDeeplFallbackFromCache = getDeeplFallbackFromCache;
window.saveDeeplFallbackToCache = saveDeeplFallbackToCache;
window.saveToCustomUserDictionary = saveToCustomUserDictionary;
window.searchCustomUserDictionary = searchCustomUserDictionary;
window.executeSmartSearchPipeline = executeSmartSearchPipeline;
