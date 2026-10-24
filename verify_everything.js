const fs = require('fs');

global.window = global;
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = v; },
  removeItem(k) { delete this.store[k]; }
};

eval(fs.readFileSync('js/verbHelper.js', 'utf8'));
eval(fs.readFileSync('js/dictionary.js', 'utf8'));
eval(fs.readFileSync('js/db.js', 'utf8'));
eval(fs.readFileSync('js/game.js', 'utf8'));

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - ${detail}`);
    failed++;
  }
}

async function runAllSuites() {
  console.log("================================================================================");
  console.log("WORTMEISTER COMPREHENSIVE END-TO-END VERIFICATION SUITE");
  console.log("================================================================================\n");

  // SUITE 1: CANONICAL ARTICLE ENFORCEMENT & INTEGRITY
  console.log("[SUITE 1: Canonical Article Enforcement & POS Integrity]");
  const nounsToTest = [
    { word: 'Haus', expectedArt: 'das', expectedPos: 'NOUN' },
    { word: 'Tisch', expectedArt: 'der', expectedPos: 'NOUN' },
    { word: 'Wohnung', expectedArt: 'die', expectedPos: 'NOUN' },
    { word: 'Buch', expectedArt: 'das', expectedPos: 'NOUN' },
    { word: 'Auto', expectedArt: 'das', expectedPos: 'NOUN' },
    { word: 'Wasser', expectedArt: 'das', expectedPos: 'NOUN' },
    { word: 'Brot', expectedArt: 'das', expectedPos: 'NOUN' },
    { word: 'Stadt', expectedArt: 'die', expectedPos: 'NOUN' },
    { word: 'Sehnsucht', expectedArt: 'die', expectedPos: 'NOUN' },
    { word: 'Kummerspeck', expectedArt: 'der', expectedPos: 'NOUN' }
  ];

  for (const n of nounsToTest) {
    const res = await DictionaryService.resolveToGermanEntry(n.word);
    assert(
      res && res.article === n.expectedArt && res.partOfSpeech === n.expectedPos,
      `Noun "${n.word}" has canonical article "${n.expectedArt}" and POS "${n.expectedPos}"`,
      `Got article="${res?.article}", POS="${res?.partOfSpeech}"`
    );
  }

  const nonNounsToTest = [
    { word: 'gut', expectedPos: 'ADJECTIVE' },
    { word: 'schön', expectedPos: 'ADJECTIVE' },
    { word: 'schnell', expectedPos: 'ADJECTIVE' },
    { word: 'gehen', expectedPos: 'VERB' },
    { word: 'aufstehen', expectedPos: 'VERB' }
  ];

  for (const nn of nonNounsToTest) {
    const res = await DictionaryService.resolveToGermanEntry(nn.word);
    assert(
      res && !res.article && res.partOfSpeech === nn.expectedPos,
      `Non-noun "${nn.word}" has NO article and POS "${nn.expectedPos}"`,
      `Got article="${res?.article}", POS="${res?.partOfSpeech}"`
    );
  }

  // SUITE 2: TRANSLATION ACCURACY & ELIMINATION OF BUGS
  console.log("\n[SUITE 2: Translation Accuracy & Zero Translation Hallucinations]");
  const deToTrTests = [
    { word: 'gut', notContain: 'darm', mustContain: 'iyi' },
    { word: 'schön', notContain: 'darm', mustContain: 'güzel' },
    { word: 'schnell', notContain: 'darm', mustContain: 'hızlı' },
    { word: 'Haus', notContain: 'darm', mustContain: 'ev' }
  ];

  for (const d of deToTrTests) {
    const res = await DictionaryService.resolveToGermanEntry(d.word);
    const tr = (res?.meaningsTr || '').toLowerCase();
    const hasGood = tr.includes(d.mustContain);
    const hasNotBad = !tr.includes(d.notContain);
    assert(
      hasGood && hasNotBad,
      `German "${d.word}" translates accurately without "${d.notContain}" bug`,
      `Got TR="${res?.meaningsTr}"`
    );
  }

  const trToDeTests = [
    { word: 'ev', expectedDe: 'Haus', expectedArt: 'das', expectedPos: 'NOUN' },
    { word: 'araba', expectedDe: 'Auto', expectedArt: 'das', expectedPos: 'NOUN' },
    { word: 'güzel', expectedDe: 'schön', expectedArt: '', expectedPos: 'ADJECTIVE' },
    { word: 'hızlı', expectedDe: 'schnell', expectedArt: '', expectedPos: 'ADJECTIVE' },
    { word: 'çalışmak', expectedDe: 'arbeiten', expectedArt: '', expectedPos: 'VERB' }
  ];

  for (const t of trToDeTests) {
    const res = await DictionaryService.resolveToGermanEntry(t.word);
    const deMatch = res && res.germanWord.toLowerCase() === t.expectedDe.toLowerCase();
    const posMatch = res && res.partOfSpeech === t.expectedPos;
    const artMatch = res && (t.expectedArt ? res.article === t.expectedArt : !res.article);
    assert(
      deMatch && posMatch && artMatch,
      `Turkish "${t.word}" maps to German "${t.expectedDe}" (POS: ${t.expectedPos}, Art: "${t.expectedArt}")`,
      `Got "${res?.article ? res.article + ' ' : ''}${res?.germanWord}" (POS: ${res?.partOfSpeech})`
    );
  }

  const enToDeTests = [
    { word: 'house', expectedDe: 'Haus', expectedArt: 'das', expectedPos: 'NOUN' },
    { word: 'car', expectedDe: 'Auto', expectedArt: 'das', expectedPos: 'NOUN' },
    { word: 'beautiful', expectedDe: 'schön', expectedArt: '', expectedPos: 'ADJECTIVE' },
    { word: 'fast', expectedDe: 'schnell', expectedArt: '', expectedPos: 'ADJECTIVE' }
  ];

  for (const e of enToDeTests) {
    const res = await DictionaryService.resolveToGermanEntry(e.word);
    const deMatch = res && res.germanWord.toLowerCase() === e.expectedDe.toLowerCase();
    const posMatch = res && res.partOfSpeech === e.expectedPos;
    assert(
      deMatch && posMatch,
      `English "${e.word}" maps to German "${e.expectedDe}" (POS: ${e.expectedPos})`,
      `Got "${res?.article ? res.article + ' ' : ''}${res?.germanWord}" (POS: ${res?.partOfSpeech})`
    );
  }

  // SUITE 3: TYPO, MISSING UMLAUT & MISPELLING TOLERANCE
  console.log("\n[SUITE 3: Typo, Missing Umlaut & Misspelling Tolerance]");
  const typoTests = [
    { query: 'kuhlschrank', expectedWord: 'Kühlschrank', expectedArt: 'der' },
    { query: 'uber', expectedWord: 'über' },
    { query: 'schon', expectedWord: 'schön' }
  ];

  for (const ty of typoTests) {
    const res = await DictionaryService.resolveToGermanEntry(ty.query);
    const wMatch = res && res.germanWord.toLowerCase() === ty.expectedWord.toLowerCase();
    const artMatch = ty.expectedArt ? res?.article === ty.expectedArt : true;
    assert(
      wMatch && artMatch,
      `Typo "${ty.query}" correctly resolved to authentic German "${ty.expectedWord}"${ty.expectedArt ? ' with article ' + ty.expectedArt : ''}`,
      `Got "${res?.article ? res.article + ' ' : ''}${res?.germanWord}"`
    );
  }

  // SUITE 4: OBSCURE & COMPLEX GERMAN VOCABULARY
  console.log("\n[SUITE 4: Obscure & Complex German Vocabulary (Real Wiktionary Data)]");
  const obscureTests = [
    { word: 'Sehnsucht', expectedArt: 'die' },
    { word: 'Kummerspeck', expectedArt: 'der' },
    { word: 'Fingerspitzengefühl', expectedArt: 'das' },
    { word: 'Eichhörnchen', expectedArt: 'das' }
  ];

  for (const obs of obscureTests) {
    const res = await DictionaryService.resolveToGermanEntry(obs.word);
    const wMatch = res && res.germanWord.toLowerCase() === obs.word.toLowerCase();
    const artMatch = res && res.article === obs.expectedArt;
    assert(
      wMatch && artMatch,
      `Obscure word "${obs.word}" resolved authentic article "${obs.expectedArt}" from Wiktionary`,
      `Got article="${res?.article}", word="${res?.germanWord}"`
    );
  }

  // SUITE 5: GAME ENGINE ALL 6 MODES
  console.log("\n[SUITE 5: WordGameService Question Generation for all 6 Game Modes]");
  await window.WordGameService.initPool();
  const gameModes = ['ARTICLE', 'VERB', 'NOUN', 'ADJECTIVE', 'PHRASE', 'MIXED'];

  for (const gm of gameModes) {
    const qs = window.WordGameService.startNewGame(gm, 15);
    const hasQuestions = Array.isArray(qs) && qs.length > 0;
    const firstQ = qs[0];
    const hasValidOptions = firstQ && Array.isArray(firstQ.options) && firstQ.options.length >= 2;
    const hasValidAnswer = firstQ && typeof firstQ.correctIndex === 'number' && firstQ.correctIndex >= 0;

    assert(
      hasQuestions && hasValidOptions && hasValidAnswer,
      `Game mode "${gm}" generated ${qs.length} valid questions without NaN or crashes`,
      `Got count=${qs.length}`
    );
  }

  console.log("\n================================================================================");
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAllSuites();
