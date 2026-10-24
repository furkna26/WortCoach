const fs = require('fs');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(condition, message, detail = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message} ${detail ? '- ' + detail : ''}`);
    failed++;
  }
}

async function run() {
  console.log("================================================================================");
  console.log("WORTCOACH LIVE INTERNET SCAN & DISPLAY VERIFICATION SUITE");
  console.log("================================================================================");

  // Group 1: HTML Tab Separation & 5-Item Bottom Navigation
  console.log("\n[TEST GROUP 1: Tab Separation & 5-Item Bottom Navigation]");
  const html = fs.readFileSync('index.html', 'utf8');

  assert(html.includes('id="tab-home"'), "Section tab-home (Sözlük) exists");
  assert(html.includes('id="tab-study"'), "Section tab-study (Kartlar/Flashcard) exists as dedicated section");
  assert(html.includes('id="tab-games"'), "Section tab-games (Oyunlar) exists as dedicated section");
  assert(html.includes('id="tab-decks"'), "Section tab-decks (Desteler) exists");
  assert(html.includes('id="tab-cards"'), "Section tab-cards (Kelimeler) exists");
  assert(html.includes('id="tab-translate"'), "Section tab-translate (Çeviri) exists");

  assert(html.includes('data-target="tab-home"'), "Bottom nav has button for tab-home (Sözlük)");
  assert(html.includes('data-target="tab-translate"'), "Bottom nav has button for tab-translate (Çeviri)");
  assert(html.includes('data-target="tab-games"'), "Bottom nav has button for tab-games (Oyunlar)");
  assert(html.includes('data-target="tab-decks"'), "Bottom nav has button for tab-decks (Desteler)");
  assert(html.includes('data-target="tab-cards"'), "Bottom nav has button for tab-cards (Kelimeler)");

  const css = fs.readFileSync('css/app.css', 'utf8');
  assert(css.includes('grid-template-columns: repeat(5, 1fr);'), "Bottom nav configured with 5 columns");

  // Check all 6 games + cable game exist in tab-games
  assert(html.includes('data-game-type="CABLE_MATCH"'), "Cable Match exists in tab-games");
  assert(html.includes('data-game-type="ARTICLE"'), "Artikel Testi exists in tab-games");
  assert(html.includes('data-game-type="VERB"'), "Fiil Testi exists in tab-games");
  assert(html.includes('data-game-type="NOUN"'), "İsim Testi exists in tab-games");
  assert(html.includes('data-game-type="ADJECTIVE"'), "Sıfat Testi exists in tab-games");
  assert(html.includes('data-game-type="PHRASE"'), "Kalıp Testi exists in tab-games");
  assert(html.includes('data-game-type="MIXED"'), "Karışık Test exists in tab-games");

  // Group 2: Database Aliases & Safety
  console.log("\n[TEST GROUP 2: Database Method Safety, getTodayStudyLogs & Duplicate Prevention]");
  const dbCode = fs.readFileSync('js/db.js', 'utf8');
  assert(dbCode.includes('findCardByGerman'), "js/db.js has findCardByGerman alias method");
  assert(dbCode.includes('getCardByWord'), "js/db.js has getCardByWord method");
  assert(dbCode.includes('getTodayStudyLogs'), "js/db.js has getTodayStudyLogs method");

  // Group 3: Live Internet Search & Morphological Synthesis
  console.log("\n[TEST GROUP 3: Live Internet Search & Exact User Queries]");
  const vCode = fs.readFileSync('js/verbHelper.js', 'utf8');
  const dictCode = fs.readFileSync('js/dictionary.js', 'utf8');

  const context = {
    console,
    setTimeout,
    clearTimeout,
    fetch,
    localStorage: { getItem: () => null, setItem: () => {} },
    window: { addEventListener: () => {} }
  };
  context.window = context;

  vm.createContext(context);
  vm.runInContext(vCode, context);
  vm.runInContext(dictCode, context);

  // Test: fare (User screenshot 1)
  const fareRes = await context.DictionaryService.resolveToGermanEntry('fare');
  assert(fareRes !== null, "Turkish 'fare' resolved");
  assert(fareRes?.germanWord === 'Maus', `Word is 'Maus' (got: ${fareRes?.germanWord})`);
  assert(fareRes?.article === 'die', `Article is 'die' (got: ${fareRes?.article})`);
  assert(fareRes?.pluralForm === 'die Mäuse', `Plural is 'die Mäuse' (got: ${fareRes?.pluralForm})`);

  // Test: großartig (User screenshot 2)
  const grosRes = await context.DictionaryService.resolveToGermanEntry('großartig');
  assert(grosRes !== null, "German 'großartig' resolved");
  assert(grosRes?.germanWord.toLowerCase() === 'großartig', `Word is 'großartig' (got: ${grosRes?.germanWord})`);
  assert(grosRes?.partOfSpeech === 'ADJECTIVE', `POS is 'ADJECTIVE' (got: ${grosRes?.partOfSpeech})`);

  // Test: der Schlafen (User screenshot 3)
  const schlafRes = await context.DictionaryService.resolveToGermanEntry('der Schlafen');
  assert(schlafRes !== null, "'der Schlafen' resolved to verb schlafen");
  assert(schlafRes?.germanWord === 'schlafen', `Word is 'schlafen' (got: ${schlafRes?.germanWord})`);
  assert(schlafRes?.partOfSpeech === 'VERB', `POS is 'VERB' (got: ${schlafRes?.partOfSpeech})`);

  // Test: ayakkabi
  const ayakkabiRes = await context.DictionaryService.resolveToGermanEntry('ayakkabi');
  assert(ayakkabiRes !== null, "Turkish 'ayakkabi' resolved");
  assert(ayakkabiRes?.germanWord === 'Schuh', `Word is 'Schuh' (got: ${ayakkabiRes?.germanWord})`);
  assert(ayakkabiRes?.article === 'der', `Article is 'der' (got: ${ayakkabiRes?.article})`);
  assert(ayakkabiRes?.pluralForm === 'die Schuhe', `Plural is 'die Schuhe' (got: ${ayakkabiRes?.pluralForm})`);

  // Test: köpek
  const kopekRes = await context.DictionaryService.resolveToGermanEntry('köpek');
  assert(kopekRes !== null, "Turkish 'köpek' resolved");
  assert(kopekRes?.germanWord === 'Hund', `Word is 'Hund' (got: ${kopekRes?.germanWord})`);
  assert(kopekRes?.article === 'der', `Article is 'der' (got: ${kopekRes?.article})`);
  assert(kopekRes?.pluralForm === 'die Hunde', `Plural is 'die Hunde' (got: ${kopekRes?.pluralForm})`);

  // Test: babyt (Typo search - User Screenshot 1)
  let babytRes = await context.DictionaryService.resolveToGermanEntry('babyt');
  babytRes = await context.DictionaryService.enrichWithNetwork(babytRes);
  assert(babytRes !== null, "Typo 'babyt' resolved to authentic German Baby");
  assert(babytRes?.germanWord === 'Baby', `Word is 'Baby' (got: ${babytRes?.germanWord})`);
  assert(babytRes?.article === 'das', `Article is 'das' (got: ${babytRes?.article})`);
  assert(/bebek/i.test(babytRes?.meaningsTr || ''), `TR meaning contains 'bebek' (got: ${babytRes?.meaningsTr})`);
  assert(!/babyt/i.test(babytRes?.meaningsTr || ''), `TR meaning does NOT contain typo 'babyt' (got: ${babytRes?.meaningsTr})`);
  assert(/baby/i.test(babytRes?.meaningsEn || '') && !/babyt/i.test(babytRes?.meaningsEn || ''), `EN meaning is 'baby' without typo (got: ${babytRes?.meaningsEn})`);
  assert(Array.isArray(babytRes?.examples) && babytRes.examples.length > 0, `Examples found for 'Baby' (count: ${babytRes?.examples?.length})`);

  // Test: cami (Turkish to German & English - User Screenshot 2)
  let camiRes = await context.DictionaryService.resolveToGermanEntry('cami');
  camiRes = await context.DictionaryService.enrichWithNetwork(camiRes);
  assert(camiRes !== null, "Turkish 'cami' resolved to Moschee");
  assert(camiRes?.germanWord === 'Moschee', `Word is 'Moschee' (got: ${camiRes?.germanWord})`);
  assert(camiRes?.article === 'die', `Article is 'die' (got: ${camiRes?.article})`);
  assert(/cami/i.test(camiRes?.meaningsTr || ''), `TR meaning is 'cami' (got: ${camiRes?.meaningsTr})`);
  assert(/mosque/i.test(camiRes?.meaningsEn || ''), `EN meaning is 'mosque' NOT 'cami' (got: ${camiRes?.meaningsEn})`);
  assert(Array.isArray(camiRes?.examples) && camiRes.examples.length > 0, `Examples found for 'Moschee' (count: ${camiRes?.examples?.length})`);

  // Test: einverstanden (Adjective/Participle - User Screenshot 3)
  let einvRes = await context.DictionaryService.resolveToGermanEntry('einverstanden');
  einvRes = await context.DictionaryService.enrichWithNetwork(einvRes);
  assert(einvRes !== null, "German 'einverstanden' resolved");
  assert(einvRes?.germanWord === 'einverstanden', `Word is lowercase 'einverstanden' (got: ${einvRes?.germanWord})`);
  assert(einvRes?.partOfSpeech === 'ADJECTIVE', `POS is 'ADJECTIVE' (got: ${einvRes?.partOfSpeech})`);
  assert(!einvRes?.article, `Article is strictly empty for adjective (got: '${einvRes?.article}')`);
  assert(Boolean(einvRes?.meaningsTr), `TR meaning exists for 'einverstanden' (got: ${einvRes?.meaningsTr})`);
  assert(/agree/i.test(einvRes?.meaningsEn || ''), `EN meaning contains 'agree' (got: ${einvRes?.meaningsEn})`);
  assert(Array.isArray(einvRes?.examples) && einvRes.examples.length > 0, `Examples found for 'einverstanden' (count: ${einvRes?.examples?.length})`);

  // Group 4: Display & Card Rendering Stability
  console.log("\n[TEST GROUP 4: Display & Card Rendering Stability]");
  const appCode = fs.readFileSync('js/app.js', 'utf8');

  class MockElement {
    constructor(id = '') {
      this.id = id;
      this.innerHTML = '';
      this.classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false };
      this.attributes = {};
    }
    getAttribute(name) { return this.attributes[name] || null; }
    setAttribute(name, val) { this.attributes[name] = val; }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    addEventListener() {}
  }

  const mockDoc = {
    getElementById: (id) => new MockElement(id),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {}
  };

  context.document = mockDoc;
  context.addEventListener = () => {};
  context.window.addEventListener = () => {};
  context.window.document = mockDoc;
  context.window.wmDB = {
    getCardByWord: async () => null,
    findCardByGerman: async () => null,
    getAllDecks: async () => [{ id: 1, name: 'Genel', cardCount: 10 }]
  };

  vm.runInContext(appCode, context);
  const appInstance = new context.window.WortCoachApp();

  // Test rendering card for fare
  let fareRenderOk = false;
  try {
    await appInstance.renderSearchResultCard(fareRes, 'fare');
    fareRenderOk = true;
  } catch (e) {
    console.error("renderSearchResultCard for fare threw:", e);
  }
  assert(fareRenderOk, "renderSearchResultCard succeeded for 'fare' without falling into empty-state error");

  // Test rendering card for großartig
  let grosRenderOk = false;
  try {
    await appInstance.renderSearchResultCard(grosRes, 'großartig');
    grosRenderOk = true;
  } catch (e) {
    console.error("renderSearchResultCard for großartig threw:", e);
  }
  assert(grosRenderOk, "renderSearchResultCard succeeded for 'großartig' without falling into empty-state error");

  // Test rendering card for der Schlafen
  let schlafRenderOk = false;
  try {
    await appInstance.renderSearchResultCard(schlafRes, 'der Schlafen');
    schlafRenderOk = true;
  } catch (e) {
    console.error("renderSearchResultCard for der Schlafen threw:", e);
  }
  assert(schlafRenderOk, "renderSearchResultCard succeeded for 'der Schlafen' without falling into empty-state error");

  console.log("================================================================================");
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

run();
