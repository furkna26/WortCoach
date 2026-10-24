const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
console.log('VERIFY LATEST BUGFIXES SUITE (v2.9.0)');
console.log('='.repeat(80));

// [TEST 1: let existingId in app.js]
console.log('\n[TEST 1: Fix TypeError: Assignment to constant variable.]');
const appJs = fs.readFileSync(path.join(__dirname, 'js', 'app.js'), 'utf-8');
assert(appJs.includes('let existingId = existing ? existing.id : (entry.id || null);'), 'existingId is declared with let');
assert(!appJs.includes('const existingId = existing ? existing.id : (entry.id || null);'), 'No const existingId reassignment bug');

// [TEST 2: Clean [1a], [1b] Wiktionary bracket indices]
console.log('\n[TEST 2: Clean [1a], [1b] Wiktionary bracket indices]');
const dictJs = fs.readFileSync(path.join(__dirname, 'js', 'dictionary.js'), 'utf-8');
assert(dictJs.includes('l = l.replace(/^\\[[0-9a-zA-Z,\\s–\\/\\.\\-]+\\]\\s*/gi, \'\');'), 'Wiktionary parser strips [1a], [1b] sense indices');
assert(appJs.includes('germanText = germanText.replace(/^\\[[0-9a-zA-Z,\\s–\\/\\.\\-]+\\]\\s*/i, \'\').trim();'), 'App UI cleans bracket indices in example card display');
assert(appJs.includes('selectedEx = selectedEx.replace(/^\\[[0-9a-zA-Z,\\s–\\/\\.\\-]+\\]\\s*/i, \'\').trim();'), 'App UI cleans bracket indices before card save');

// Test regex directly on user example
const testSentence1 = '[1a] Er beeilt sich, um den Zug zu erreichen.';
const testSentence2 = '[1b] Beeile dich!';
const clean1 = testSentence1.replace(/^\[[0-9a-zA-Z,\s–\/\.\-]+\]\s*/i, '').trim();
const clean2 = testSentence2.replace(/^\[[0-9a-zA-Z,\s–\/\.\-]+\]\s*/i, '').trim();
assert(clean1 === 'Er beeilt sich, um den Zug zu erreichen.', 'Cleaned [1a] correctly');
assert(clean2 === 'Beeile dich!', 'Cleaned [1b] correctly');

// [TEST 3: Study Tab Markup & SRS Elements in index.html]
console.log('\n[TEST 3: Study Tab Markup & SRS Elements in index.html]');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
assert(indexHtml.includes('id="study-arena"'), 'study-arena exists in index.html');
assert(indexHtml.includes('id="study-empty-state"'), 'study-empty-state exists in index.html');
assert(indexHtml.includes('class="study-card-face study-card-back"'), 'Flashcard back face exists');
assert(indexHtml.includes('id="fc-back-meaning-tr"'), 'fc-back-meaning-tr element exists');
assert(indexHtml.includes('class="btn-srs-android btn-again"'), 'SRS Tekrar Et button exists');
assert(indexHtml.includes('class="btn-srs-android btn-hard"'), 'SRS Önemli button exists');
assert(indexHtml.includes('class="btn-srs-android btn-good"'), 'SRS Öğrendim button exists');
assert(indexHtml.includes('id="srs-good-interval-label"'), 'srs-good-interval-label exists');

// [TEST 4: Dictionary offline resolution for wohnen and hören]
console.log('\n[TEST 4: Dictionary offline resolution for wohnen and hören]');
const sandbox = { window: {}, console: console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'verbHelper.js'), 'utf-8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'offlineDictionary.js'), 'utf-8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'dictionary.js'), 'utf-8'), sandbox);

const synWohnen = sandbox.window.DictionaryService.synthesizeInstantEntry('wohnen');
assert(synWohnen.meaningsTr && synWohnen.meaningsTr !== '', `wohnen has non-empty Turkish meaning: "${synWohnen.meaningsTr}"`);
assert(synWohnen.praesens === 'wohnt', 'wohnen has praesens');
assert(synWohnen.praeteritum === 'wohnte', 'wohnen has praeteritum');
assert(synWohnen.partizipZwei === 'gewohnt', 'wohnen has partizipZwei');

const synHoren = sandbox.window.DictionaryService.synthesizeInstantEntry('hören');
assert(synHoren.meaningsTr && synHoren.meaningsTr !== '', `hören has non-empty Turkish meaning: "${synHoren.meaningsTr}"`);
assert(synHoren.praesens === 'hört', 'hören has praesens');
assert(synHoren.praeteritum === 'hörte', 'hören has praeteritum');
assert(synHoren.partizipZwei === 'gehört', 'hören has partizipZwei');

// [TEST 5: Study.js null-safe guards and dynamic meaning fallback]
console.log('\n[TEST 5: Study.js null-safe guards & dynamic fallback]');
const studyJs = fs.readFileSync(path.join(__dirname, 'js', 'study.js'), 'utf-8');
assert(studyJs.includes('if (!this.emptyState) this.emptyState = document.getElementById(\'study-empty-state\');'), 'study.js re-queries emptyState in loadSession');
assert(studyJs.includes('if (!card.meaningsTr || card.meaningsTr === \'-\')'), 'study.js dynamically resolves missing meanings');

console.log('='.repeat(80));
console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('='.repeat(80));

if (failed > 0) process.exit(1);
