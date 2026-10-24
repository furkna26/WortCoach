/**
 * Test Suite: Zero Starter Cards, No Empty Cards, Deck Sharing & Import
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
console.log('VERIFY ZERO SEED, NO EMPTY CARDS & DECK SHARING SUITE');
console.log('='.repeat(80));

// [TEST 1: Zero Starter Cards in seedIfNeeded]
console.log('\n[TEST 1: Zero Starter Cards Added on First Launch]');
const seederCode = fs.readFileSync(path.join(__dirname, 'js', 'seeder.js'), 'utf-8');
const seedFn = seederCode.substring(seederCode.indexOf('seedIfNeeded'), seederCode.indexOf('importCuratedPack'));
assert(!seedFn.includes("addCard"), 'seedIfNeeded does not call addCard (0 cards on initial launch)');
assert(!seedFn.includes("starterWords"), 'No starter words in seedIfNeeded');
assert(seederCode.includes("initialSeedCompleted"), 'initialSeedCompleted flag properly handled');

// [TEST 2: Empty Card Prevention in Database]
console.log('\n[TEST 2: Strict Prevention of Empty Cards in Database]');
const dbCode = fs.readFileSync(path.join(__dirname, 'js', 'db.js'), 'utf-8');
assert(dbCode.includes("cleanWord"), 'addCard extracts cleanWord');
assert(dbCode.includes("Boş kelime kartı eklenemez!"), 'addCard warns and rejects empty cardData.germanWord');
assert(dbCode.includes("Boş kelime ile kart güncellenemez!"), 'updateCard rejects empty germanWord');
assert(dbCode.includes("typeof c.germanWord === 'string' && c.germanWord.trim().length > 0"), 'getAllCards filters out corrupt/empty cards');

// [TEST 3: Form and Search Validation Against Empty Cards]
console.log('\n[TEST 3: Form & Search UI Validation Against Empty Cards]');
const appCode = fs.readFileSync(path.join(__dirname, 'js', 'app.js'), 'utf-8');
assert(appCode.includes("if (!wordRaw) {"), 'form-add-card validates wordRaw before submitting');
assert(appCode.includes("if (!cleanWord || !cleanWord.trim()) {"), 'btn-inline-save validates cleanWord before saving');

// [TEST 4: Deck Sharing & Import Modals & Methods]
console.log('\n[TEST 4: Deck Sharing & Import Modals and Methods]');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
assert(indexHtml.includes('id="modal-share-deck"'), 'modal-share-deck exists in index.html');
assert(indexHtml.includes('id="btn-share-native"'), 'btn-share-native button exists');
assert(indexHtml.includes('id="btn-share-copy"'), 'btn-share-copy button exists');
assert(indexHtml.includes('id="btn-share-download"'), 'btn-share-download button exists');
assert(indexHtml.includes('id="modal-import-deck"'), 'modal-import-deck exists in index.html');
assert(indexHtml.includes('id="import-deck-dropzone"'), 'import-deck-dropzone exists');
assert(indexHtml.includes('id="import-deck-file-input"'), 'import-deck-file-input exists');
assert(indexHtml.includes('id="import-deck-json-text"'), 'import-deck-json-text exists');
assert(indexHtml.includes('id="btn-do-import-deck"'), 'btn-do-import-deck button exists');

assert(appCode.includes('openShareDeckModal(deckId)'), 'openShareDeckModal method exists in app.js');
assert(appCode.includes('bindImportDeckModal()'), 'bindImportDeckModal method exists in app.js');
assert(appCode.includes('btn-share-deck'), 'btn-share-deck rendered for decks in app.js');
assert(appCode.includes('this.openShareDeckModal(dId)'), 'btn-share-deck triggers openShareDeckModal');

console.log('='.repeat(80));
console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('='.repeat(80));

if (failed > 0) process.exit(1);
