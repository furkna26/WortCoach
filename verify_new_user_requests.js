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
eval(fs.readFileSync('js/game.js', 'utf8'));

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

async function runTests() {
  console.log("================================================================================");
  console.log("NEW USER REQUESTS VERIFICATION TEST SUITE");
  console.log("================================================================================");

  // Test 1: HTML structure and symbols
  const html = fs.readFileSync('index.html', 'utf8');
  assert(html.includes('id="nav-icon-home"'), "Symbol #nav-icon-home exists");
  assert(html.includes('id="nav-icon-translate"'), "Symbol #nav-icon-translate exists");
  assert(html.includes('id="nav-icon-games"'), "Symbol #nav-icon-games exists");
  assert(html.includes('id="icon-edit"'), "Symbol #icon-edit exists");

  // Verify old book icon restored for nav-icon-home
  assert(html.includes('d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"'), "Restored classic Book icon for Home/Sözlük");

  // Verify old globe icon restored for nav-icon-translate
  assert(html.includes('<circle cx="12" cy="12" r="10"></circle>'), "Restored classic Globe icon for Çeviri");

  // Verify bottom nav labels
  assert(html.includes('<span class="nav-label">Sözlük</span>'), "Bottom nav tab 1 labeled 'Sözlük'");
  assert(html.includes('<span class="nav-label">Çeviri</span>'), "Bottom nav tab 2 labeled 'Çeviri'");
  assert(html.includes('<span class="nav-label">Oyunlar</span>'), "Bottom nav tab 3 labeled 'Oyunlar'");
  assert(html.includes('<span class="nav-label">Desteler</span>'), "Bottom nav tab 4 labeled 'Desteler'");
  assert(html.includes('<span class="nav-label">Kelimeler</span>'), "Bottom nav tab 5 labeled 'Kelimeler'");

  // Verify games section moved out of tab-home into dedicated tab-games
  assert(html.includes('id="tab-games"'), "Dedicated tab-games section exists");
  assert(html.includes('id="subview-games-content"'), "Kelime Oyunları subview exists");
  assert(html.includes('id="subview-study-content"'), "Kart Alıştırması (SRS) subview exists");

  // Verify Cable Game in tab-games
  assert(html.includes('data-game-type="CABLE_MATCH"'), "Cable Match game card in tab-games");
  assert(html.includes('id="modal-cable-game"'), "modal-cable-game exists");
  assert(html.includes('id="cable-svg-layer"'), "cable-svg-layer exists");
  assert(html.includes('id="modal-game-deck-select"'), "modal-game-deck-select exists");

  // Test 2: WordGameService Cable Round Generation
  await window.WordGameService.initPool();
  const round = window.WordGameService.generateCableMatchRound(5);
  assert(round.leftItems.length === 5, "Cable round has 5 left items (German)");
  assert(round.rightItems.length === 5, "Cable round has 5 right items (Turkish meanings)");
  assert(round.wireColors.length === 5, "Cable round has 5 distinct neon wire colors");
  assert(round.totalPairs === 5, "Cable round has totalPairs = 5");

  // Test 3: Suggestion generator in app.js
  const appJs = fs.readFileSync('js/app.js', 'utf8');
  assert(appJs.includes('openEditCardModal(card)'), "openEditCardModal method exists in app.js");
  assert(appJs.includes('this.editingCardId'), "editingCardId state handled for card updates");
  assert(appJs.includes('window.wmDB.updateCard(updatedCard)'), "wmDB.updateCard called on edit submit");
  assert(appJs.includes('activateGamesSubview'), "activateGamesSubview handles games/study toggle");
  assert(appJs.includes('btn-card-edit'), "btn-card-edit rendered in cards list");
  assert(appJs.includes('data-card-id'), "Cards have data-card-id attribute for click-to-edit");

  console.log("================================================================================");
  console.log(`RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runTests();
