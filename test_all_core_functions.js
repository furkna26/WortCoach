const fs = require('fs');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(condition, name, detail = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name} - ${detail}`);
    failed++;
  }
}

async function run() {
  console.log("================================================================================");
  console.log("WORTCOACH ALL CORE FUNCTIONS COMPREHENSIVE TEST");
  console.log("================================================================================");

  // 1. Service Worker & Manifest Configuration
  console.log("\n[TEST 1: Service Worker & App Branding]");
  const swCode = fs.readFileSync('sw.js', 'utf8');
  assert(swCode.includes("wortcoach-v2.9.2"), "Service worker cache is 'wortcoach-v2.9.2'");

  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert(manifest.name.startsWith("WortCoach"), `Manifest name starts with 'WortCoach' (got: ${manifest.name})`);
  assert(manifest.short_name === "WortCoach", `Manifest short_name is 'WortCoach' (got: ${manifest.short_name})`);

  const html = fs.readFileSync('index.html', 'utf8');
  assert(html.includes("<title>WortCoach"), "index.html title starts with WortCoach");
  assert(html.includes('Wort<span style="color:var(--brand-blue)">Coach</span>'), "Header logo displays WortCoach");
  assert(!html.includes("WortMeister</span>"), "No stale WortMeister logo text in header");

  // 2. Audio & TTS German Lock
  console.log("\n[TEST 2: Audio & German TTS Lock]");
  const ttsCode = fs.readFileSync('js/tts.js', 'utf8');
  assert(ttsCode.includes("de-DE") || ttsCode.includes("de_de"), "TTS has de-DE speech synthesis");
  assert(ttsCode.includes("getStrictGermanVoice"), "TTS has getStrictGermanVoice");
  assert(ttsCode.includes("!x.lang.toLowerCase().startsWith('tr')"), "TTS strictly excludes Turkish voices for German speech");

  // 3. Database Functions & Aliases
  console.log("\n[TEST 3: Database Core Functions & Aliases]");
  const dbCode = fs.readFileSync('js/db.js', 'utf8');
  assert(dbCode.includes("async addCard"), "wmDB has addCard");
  assert(dbCode.includes("async updateCard"), "wmDB has updateCard");
  assert(dbCode.includes("async deleteCard"), "wmDB has deleteCard");
  assert(dbCode.includes("async getCardByWord"), "wmDB has getCardByWord");
  assert(dbCode.includes("async findCardByGerman"), "wmDB has findCardByGerman alias");

  // 4. Zero Local Guessing Enforced
  console.log("\n[TEST 4: Zero Local Guessing Verification]");
  const verbCode = fs.readFileSync('js/verbHelper.js', 'utf8');
  assert(!verbCode.includes("article: 'der', plural: `die ${capitalized}e`"), "No fallback guess defaulting nouns to 'der'");
  assert(!verbCode.includes("article: 'der', plural: 'die ' + capitalized + 'e'"), "No string concat fallback guess for nouns");

  // 5. Live Search & Resolution
  console.log("\n[TEST 5: Live Search End-to-End]");
  const dictCode = fs.readFileSync('js/dictionary.js', 'utf8');
  const context = {
    console,
    setTimeout,
    clearTimeout,
    fetch,
    localStorage: { getItem: () => null, setItem: () => {} },
    window: {}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(verbCode, context);
  vm.runInContext(dictCode, context);

  const resHund = await context.DictionaryService.resolveToGermanEntry('Hund');
  assert(resHund && resHund.article === 'der' && resHund.germanWord === 'Hund', "Hund resolves with canonical article 'der'");

  const resBuch = await context.DictionaryService.resolveToGermanEntry('Buch');
  assert(resBuch && resBuch.article === 'das' && resBuch.germanWord === 'Buch', "Buch resolves with canonical article 'das'");

  const resFrau = await context.DictionaryService.resolveToGermanEntry('Frau');
  assert(resFrau && resFrau.article === 'die' && resFrau.germanWord === 'Frau', "Frau resolves with canonical article 'die'");

  console.log("\n================================================================================");
  console.log(`CORE TEST RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

run();
