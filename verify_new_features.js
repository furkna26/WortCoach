/**
 * Test Suite: Android POS Filter Chips, Curated Decks (10 x 60 Cards), Reflexiv/Trennbar Game, Timer & Scoring
 */
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('='.repeat(80));
console.log('WORTCOACH NEW FEATURES VERIFICATION TEST SUITE');
console.log('='.repeat(80));

// [TEST 1: Curated Packs]
console.log('\n[TEST 1: Curated Decks (10 x 60 Cards = 600 Cards)]');
const curatedPath = path.join(__dirname, 'js', 'curatedPacks.js');
assert(fs.existsSync(curatedPath), 'js/curatedPacks.js exists');

const windowMock = {};
global.window = windowMock;
require('./js/curatedPacks.js');

const packs = windowMock.CURATED_CEFR_PACKS;
assert(Array.isArray(packs), 'CURATED_CEFR_PACKS is an array');
assert(packs.length === 10, `Exactly 10 curated decks defined (got: ${packs.length})`);

const expectedCodes = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'PHRASES', 'TRENNBAR', 'REFLEXIV', 'IRREGULAR'];
for (const code of expectedCodes) {
  const p = packs.find((pk) => pk.code === code);
  assert(Boolean(p), `Pack ${code} exists`);
  if (p) {
    assert(p.cards && p.cards.length === 60, `Pack ${code} has exactly 60 cards (got: ${p.cards ? p.cards.length : 0})`);
  }
}

// [TEST 2: Android POS Filter Chips in index.html]
console.log('\n[TEST 2: Android POS Filter Tabs in Kelimeler Section]');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
assert(indexHtml.includes('id="cards-pos-filter-bar"'), 'cards-pos-filter-bar container exists');
assert(indexHtml.includes('data-pos="ALL"'), 'Filter pill ALL exists');
assert(indexHtml.includes('data-pos="NOUN"'), 'Filter pill NOUN (İsimler) exists');
assert(indexHtml.includes('data-pos="VERB"'), 'Filter pill VERB (Fiiller) exists');
assert(indexHtml.includes('data-pos="ADJECTIVE"'), 'Filter pill ADJECTIVE (Sıfatlar) exists');
assert(indexHtml.includes('data-pos="PHRASE"'), 'Filter pill PHRASE (Kalıplar) exists');

// [TEST 3: Trennbar & Reflexiv Game Mode]
console.log('\n[TEST 3: Trennbar & Reflexiv Game Mode & Strict Filtering]');
assert(indexHtml.includes('data-game-type="REFLEXIV_TRENNBAR"'), 'Game card REFLEXIV_TRENNBAR exists in tab-games');

// Load verbHelper and game service
require('./js/verbHelper.js');
require('./js/game.js');
const gameSvc = windowMock.WordGameService;
assert(Boolean(gameSvc), 'WordGameService loaded');

// Test strict filtering: Article test with mixed cards
gameSvc.poolCards = [
  { id: 1, germanWord: 'Haus', partOfSpeech: 'NOUN', article: 'das', meaningsTr: 'ev' },
  { id: 2, germanWord: 'aufstehen', partOfSpeech: 'VERB', meaningsTr: 'kalkmak', isSeparable: true },
  { id: 3, germanWord: 'schön', partOfSpeech: 'ADJECTIVE', meaningsTr: 'güzel' },
  { id: 4, germanWord: 'Buch', partOfSpeech: 'NOUN', article: 'das', meaningsTr: 'kitap' },
  { id: 5, germanWord: 'Frau', partOfSpeech: 'NOUN', article: 'die', meaningsTr: 'kadın' }
];

const articleEligible = gameSvc.filterEligibleCards('ARTICLE');
assert(articleEligible.every(c => c.partOfSpeech === 'NOUN'), 'ARTICLE filter ONLY returns nouns');
assert(articleEligible.every(c => ['der', 'die', 'das'].includes(c.article)), 'ARTICLE filter ONLY returns cards with articles');

const verbEligible = gameSvc.filterEligibleCards('VERB');
assert(verbEligible.every(c => c.partOfSpeech === 'VERB'), 'VERB filter ONLY returns verbs');

// Test Reflexiv / Trennbar Question Generation
const qTrennbar = gameSvc.generateReflexivTrennbarQuestion({ germanWord: 'aufstehen', partOfSpeech: 'VERB', meaningsTr: 'ayağa kalkmak', isSeparable: true });
assert(qTrennbar.correctIndex === 0, 'aufstehen classified as Trennbar (index 0)');

const qReflexiv = gameSvc.generateReflexivTrennbarQuestion({ germanWord: 'sich freuen', partOfSpeech: 'VERB', meaningsTr: 'sevinmek', isReflexive: true });
assert(qReflexiv.correctIndex === 1, 'sich freuen classified as Reflexiv (index 1)');

const qBeide = gameSvc.generateReflexivTrennbarQuestion({ germanWord: 'sich anziehen', partOfSpeech: 'VERB', meaningsTr: 'giyinmek', isSeparable: true, isReflexive: true });
assert(qBeide.correctIndex === 2, 'sich anziehen classified as Beide (index 2)');

const qRegular = gameSvc.generateReflexivTrennbarQuestion({ germanWord: 'lernen', partOfSpeech: 'VERB', meaningsTr: 'öğrenmek' });
assert(qRegular.correctIndex === 3, 'lernen classified as Regulär (index 3)');

// [TEST 4: Timer & Scoring System]
console.log('\n[TEST 4: Timer Mode & Scoring System]');
assert(indexHtml.includes('id="gds-time-pills"'), 'Time attack pills in game deck modal');
assert(indexHtml.includes('id="game-score-badge"'), 'Live score badge in game modal header');
assert(indexHtml.includes('id="game-timer-badge"'), 'Live timer badge in game modal header');

gameSvc.startNewGame('ARTICLE', 5);
gameSvc.setDuration(60);
assert(gameSvc.durationSeconds === 60, 'Duration set to 60s');

const currentQ = gameSvc.getCurrentQuestion();
const correctIdx = currentQ.correctIndex;
const res1 = gameSvc.submitAnswer(correctIdx);
assert(res1.isCorrect === true, 'Answer marked correct');
assert(res1.points >= 100, `Points awarded for correct answer (got: ${res1.points})`);
assert(gameSvc.score.streak === 1, 'Streak incremented to 1');

// Test wrong answer
gameSvc.nextQuestion();
const nextQ = gameSvc.getCurrentQuestion();
const wrongIdx = (nextQ.correctIndex + 1) % nextQ.options.length;
const resWrong = gameSvc.submitAnswer(wrongIdx);
assert(resWrong.isCorrect === false, 'Answer marked wrong');
assert(gameSvc.score.streak === 0, 'Streak reset to 0 on wrong answer');
assert(gameSvc.remainingSeconds < 60, 'Time penalty deducted on wrong answer');

// [TEST 5: Service Worker & Asset Versioning]
console.log('\n[TEST 5: Service Worker & Asset Versioning]');
const swContent = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf-8');
assert(swContent.includes('wortcoach-v'), 'Service Worker cache is wortcoach-v*');
assert(swContent.includes('curatedPacks.js'), 'Service Worker caches curatedPacks.js');
assert(indexHtml.includes('curatedPacks.js'), 'index.html includes curatedPacks.js');

console.log('='.repeat(80));
console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('='.repeat(80));

if (failed > 0) process.exit(1);
