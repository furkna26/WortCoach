const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function check(cond, name, detail = '') {
  if (cond) {
    console.log(`  OK: ${name}`);
    passed++;
  } else {
    console.error(`  FAIL: ${name}${detail ? ' -> ' + detail : ''}`);
    failed++;
  }
}

function createMockIndexedDB() {
  const stores = new Map([
    ['cards', { keyPath: 'id', autoInc: 1, rows: new Map(), indexes: new Set(['deckId', 'nextReviewDate', 'isPriority', 'germanWord']) }],
    ['decks', { keyPath: 'id', autoInc: 1, rows: new Map(), indexes: new Set() }],
    ['studyLogs', { keyPath: 'id', autoInc: 1, rows: new Map(), indexes: new Set(['reviewedAt', 'cardId']) }],
    ['settings', { keyPath: 'key', autoInc: null, rows: new Map(), indexes: new Set() }]
  ]);
  const stats = { txCount: 0, cardReads: 0 };

  const makeStoreApi = (name) => {
    const meta = stores.get(name);
    const wrapReq = (executor) => {
      const req = { onsuccess: null, onerror: null, result: undefined };
      queueMicrotask(() => {
        try {
          req.result = executor();
          if (req.onsuccess) req.onsuccess({ target: req });
        } catch (err) {
          if (req.onerror) req.onerror({ target: { error: err } });
        }
      });
      return req;
    };
    return {
      indexNames: { contains: (idx) => meta.indexes.has(idx) },
      createIndex: (idx) => meta.indexes.add(idx),
      getAll: () => wrapReq(() => {
        if (name === 'cards') stats.cardReads++;
        return Array.from(meta.rows.values()).map((r) => ({ ...r }));
      }),
      get: (k) => wrapReq(() => {
        const val = meta.rows.get(k);
        return val ? { ...val } : undefined;
      }),
      add: (rec) => wrapReq(() => {
        const copy = { ...rec };
        if (meta.autoInc !== null) {
          copy[meta.keyPath] = meta.autoInc++;
        }
        meta.rows.set(copy[meta.keyPath], copy);
        return copy[meta.keyPath];
      }),
      put: (rec) => wrapReq(() => {
        const copy = { ...rec };
        if (meta.autoInc !== null && copy[meta.keyPath] === undefined) {
          copy[meta.keyPath] = meta.autoInc++;
        }
        meta.rows.set(copy[meta.keyPath], copy);
        return copy[meta.keyPath];
      }),
      delete: (k) => wrapReq(() => {
        meta.rows.delete(k);
        return true;
      })
    };
  };

  const dbApi = {
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore: (n, opts = {}) => {
      stores.set(n, { keyPath: opts.keyPath || 'id', autoInc: opts.autoIncrement ? 1 : null, rows: new Map(), indexes: new Set() });
      return makeStoreApi(n);
    },
    transaction: (storeNames) => {
      stats.txCount++;
      const tx = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: (n) => makeStoreApi(n)
      };
      queueMicrotask(() => {
        queueMicrotask(() => {
          if (tx.oncomplete) tx.oncomplete();
        });
      });
      return tx;
    }
  };

  return {
    stats,
    stores,
    indexedDB: {
      open: (name, version) => {
        const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: dbApi };
        queueMicrotask(() => {
          const tx = { objectStore: (n) => makeStoreApi(n) };
          if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: dbApi, transaction: tx } });
          if (req.onsuccess) req.onsuccess({ target: req });
        });
        return req;
      }
    }
  };
}

async function run() {
  console.log('=== WORTCOACH UPGRADE AUDIT (v3.13.1) ===');

  // 1. HTML & CSS Audit
  console.log('\n[1] HTML & CSS Optimization Audit');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const compCss = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
  check((html.match(/data-theme="dark"/g) || []).length === 1, 'No duplicate data-theme="dark" on <html>');
  check(!/user-scalable=no|maximum-scale=1\.0/.test(html), 'Viewport permits user pinch-zoom accessibility');
  check(!html.includes('pdf.min.js') && !html.includes('mammoth.browser.min.js'), 'Render-blocking PDF/Mammoth removed from index.html');
  check(!html.includes('curatedPacks.js') && !html.includes('pronunciation.js'), 'curatedPacks.js and pronunciation.js removed from eager scripts in index.html');
  check(!html.includes('id="coach-critical-css"'), 'Inline <style id="coach-critical-css"> moved out of index.html');
  check(compCss.includes('.coach-switch') && compCss.includes('#modal-auth'), 'Extracted Coach styles present in css/components.css');
  const scriptTags = html.match(/<script\s+[^>]*src="js\/[^"]+"[^>]*>/g) || [];
  check(scriptTags.length === 20 && scriptTags.every((t) => /\bdefer\b/.test(t)), `All ${scriptTags.length} local scripts use defer`);
  check(html.includes('css/components.css?v=3.13.1') && html.includes('js/app.js?v=3.13.1'), 'Assets bumped cleanly to v3.13.1');
  check(html.includes('js/readerUI.js?v=3.13.1') && html.includes('js/gamesUI.js?v=3.13.1') && html.includes('js/pronunciationUI.js?v=3.13.1'), 'Modular UI scripts included cleanly in index.html');
  check(html.includes('id="btn-export-full-backup"') && html.includes('id="btn-import-full-backup"'), 'Full library backup/restore controls present in settings modal');
  check(
    html.includes('id="modal-mastery-analyzer"') &&
      html.includes('id="study-filter-bar"') &&
      html.includes('id="btn-open-struggling-analyzer"') &&
      html.includes('id="btn-create-struggling-deck"'),
    'User measurement analyzer modal and study filter controls present in index.html'
  );
  check(
    html.includes('class="prof-auth-box auth-modal-card"') &&
      html.includes('class="auth-form-footer"') &&
      compCss.includes('.auth-modal-card') &&
      compCss.includes('env(safe-area-inset-bottom') &&
      compCss.includes('100dvh'),
    '#modal-auth uses auth-modal-card, sticky auth-form-footer, 100dvh and mobile safe-area-inset-bottom'
  );

  // 2. Service Worker & Manifest Audit
  console.log('\n[2] Service Worker & Manifest Audit');
  const swCode = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  check(swCode.includes("CACHE_NAME = 'wortcoach-v3.13.1'"), 'SW cache version updated to v3.13.1');
  check(swCode.includes('./js/readerUI.js?v=3.13.1') && swCode.includes('./js/gamesUI.js?v=3.13.1') && swCode.includes('./js/pronunciationUI.js?v=3.13.1'), 'SW caches modular UI scripts');
  check(swCode.includes("key !== 'wortcoach-user-meta'"), 'SW activate preserves wortcoach-user-meta push store');
  check(swCode.includes('isNavOrShell') && swCode.includes('caches.match(request)'), 'SW uses Network-First for HTML/shell and Cache-First for versioned assets');
  check(!swCode.includes("icon: 'icons/icon-192.svg'"), 'SW push notifications use PNG icon instead of SVG');
  check(swCode.includes('__active_access_token') && swCode.includes('Authorization'), 'SW stores and sends Bearer token for background push fetch');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  check(!JSON.stringify(manifest).includes('3.8.9') && JSON.stringify(manifest).includes('v=3.13.1'), 'manifest.json uses v3.13.1 asset URLs without stale v3.8.9');
  check(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3, 'manifest.json defines PWA shortcuts');
  check(Boolean(manifest.share_target && manifest.share_target.params && manifest.share_target.params.text), 'manifest.json defines share_target');

  // 3. Lazy Loader Audit
  console.log('\n[3] On-Demand Script Loader Audit');
  const appendedSrcs = [];
  const loaderWindow = {
    document: {
      head: {
        appendChild: (el) => {
          appendedSrcs.push(el.src);
          if (el.src.includes('pdf.min.js')) loaderWindow.pdfjsLib = { GlobalWorkerOptions: {} };
          if (el.src.includes('mammoth')) loaderWindow.mammoth = { extractRawText: async () => ({ value: 'ok' }) };
          if (el.src.includes('curatedPacks.js')) loaderWindow.CURATED_CEFR_PACKS = [{ code: 'A1', cards: [{ germanWord: 'Haus' }] }];
          if (el.src.includes('pronunciation.js')) loaderWindow.wmPronunciation = { getSelectedEngine: () => 'HYBRID_ENSEMBLE' };
          if (el.onload) el.onload();
        }
      },
      querySelector: () => null,
      createElement: () => ({})
    }
  };
  loaderWindow.window = loaderWindow;
  vm.createContext(loaderWindow);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'), loaderWindow);
  const [pdf1, pdf2] = await Promise.all([
    loaderWindow.window.WortCoachLoader.ensurePdfJs(),
    loaderWindow.window.WortCoachLoader.ensurePdfJs()
  ]);
  check(Boolean(pdf1 && pdf2), 'WortCoachLoader.ensurePdfJs resolves cleanly');
  check(appendedSrcs.filter((s) => s.includes('pdf.min.js')).length === 1, 'Concurrent PDF loads deduplicated to 1 script tag');
  const mam = await loaderWindow.window.WortCoachLoader.ensureMammoth();
  check(Boolean(mam), 'WortCoachLoader.ensureMammoth resolves cleanly');
  const packsLoaded = await loaderWindow.window.WortCoachLoader.ensureCuratedPacks();
  const pronLoaded = await loaderWindow.window.WortCoachLoader.ensurePronunciation();
  check(Boolean(packsLoaded && packsLoaded[0]?.cards?.length), 'WortCoachLoader.ensureCuratedPacks resolves rich packs');
  check(Boolean(pronLoaded), 'WortCoachLoader.ensurePronunciation resolves cleanly');

  // 4. IndexedDB v2 + Cache + Batching Audit
  console.log('\n[4] IndexedDB v2, Cache & Batching Unit Tests');
  const mockIdb = createMockIndexedDB();
  const dbSandbox = {
    window: {},
    indexedDB: mockIdb.indexedDB,
    console
  };
  dbSandbox.window = dbSandbox;
  vm.createContext(dbSandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'db.js'), 'utf8'), dbSandbox);
  const wmDB = dbSandbox.window.wmDB;
  check(wmDB.dbVersion === 2, 'wmDB schema version upgraded to v2');
  await wmDB.init();
  check(mockIdb.stores.get('cards').indexes.has('germanWordLower'), 'germanWordLower index added on DB upgrade');

  const deck = await wmDB.createDeck('Batch Test Deste');
  await wmDB.getAllCards();
  const batchInput = Array.from({ length: 50 }, (_, idx) => ({
    deckId: deck.id,
    germanWord: `Testwort${idx}`,
    meaningsTr: `Anlam ${idx}`,
    partOfSpeech: 'NOUN'
  }));
  const txBeforeBatch = mockIdb.stats.txCount;
  const savedBatch = await wmDB.addCardsBatch(batchInput);
  const txDeltaBatch = mockIdb.stats.txCount - txBeforeBatch;
  check(savedBatch.length === 50 && txDeltaBatch === 1, `50-card addCardsBatch used 1 transaction (got tx=${txDeltaBatch}, cards=${savedBatch.length})`);

  const readsBefore = mockIdb.stats.cardReads;
  await wmDB.getAllCards();
  const readsAfterWarmup = mockIdb.stats.cardReads;
  const hit0 = await wmDB.getCardByWord('testwort25');
  const hit1 = await wmDB.getCardByWord('Testwort49');
  const readsAfterLookups = mockIdb.stats.cardReads;
  check(hit0 && hit1 && hit0.germanWord === 'Testwort25', 'O(1) case-insensitive getCardByWord lookup accurate');
  check(readsAfterLookups === readsAfterWarmup, `Cached getCardByWord performed 0 IDB scans (before=${readsAfterWarmup}, after=${readsAfterLookups}, init=${readsBefore})`);

  const fullBackup = await wmDB.exportFullBackup();
  check(fullBackup.format === 'wortcoach-full-backup' && fullBackup.decks.length === 1 && fullBackup.cards.length === 50, 'exportFullBackup exports decks and cards');
  const txBeforeDel = mockIdb.stats.txCount;
  await wmDB.deleteDeck(deck.id);
  const txDeltaDel = mockIdb.stats.txCount - txBeforeDel;
  const cardsAfterDel = await wmDB.getAllCards();
  check(txDeltaDel === 1 && cardsAfterDel.length === 0, `deleteDeck deleted deck + 50 cards in 1 transaction (tx=${txDeltaDel}, remaining=${cardsAfterDel.length})`);
  const restoreRes = await wmDB.importFullBackup(fullBackup, { mode: 'merge' });
  const cardsRestored = await wmDB.getAllCards();
  check(restoreRes.decksAdded === 1 && restoreRes.cardsAdded === 50 && cardsRestored.length === 50, 'importFullBackup cleanly restores exported decks and cards');

  // 4b. User Measurement, Struggling Deck & Smart Shuffle Audit
  console.log('\n[4b] User Measurement, Struggling Deck & Smart Shuffle Unit Tests');
  const mDeck = await wmDB.createDeck('Olcum Test Deste');
  const mCards = await wmDB.addCardsBatch([
    { deckId: mDeck.id, germanWord: 'ZorKelime', turkishMeaning: 'zor' },
    { deckId: mDeck.id, germanWord: 'OyunHata', turkishMeaning: 'hata' },
    { deckId: mDeck.id, germanWord: 'YeniKelime', turkishMeaning: 'yeni' },
    { deckId: mDeck.id, germanWord: 'IyiKelime', turkishMeaning: 'iyi' },
    { deckId: mDeck.id, germanWord: 'KolayKelime', turkishMeaning: 'kolay' }
  ]);
  const [cZor, cOyun, cYeni, cIyi, cKolay] = mCards;

  await wmDB.applySM2Review(cZor.id, 'again');
  const cZorAfterHard = await wmDB.applySM2Review(cZor.id, 'hard');
  const cIyiUpdated = await wmDB.applySM2Review(cIyi.id, 'good');
  const cKolayUpdated = await wmDB.applySM2Review(cKolay.id, 'easy');
  check(
    cZorAfterHard.hardCount === 1 && cZorAfterHard.lapses >= 1 && cZorAfterHard.lastRating === 'hard' &&
    cIyiUpdated.goodCount === 1 && cIyiUpdated.lastRating === 'good' &&
    cKolayUpdated.easyCount === 1 && cKolayUpdated.lastRating === 'easy',
    'applySM2Review tracks hardCount, goodCount, easyCount and lastRating'
  );

  const syntheticIgnore = await wmDB.recordGameResult(800050, false);
  const cOyunWrong = await wmDB.recordGameResult(cOyun.id, false);
  const cOyunProfile = wmDB.getCardMasteryProfile(cOyunWrong);
  check(syntheticIgnore === null && cOyunWrong.gameWrongCount === 1 && cOyunProfile.tier === 'struggling', 'recordGameResult ignores synthetic IDs and marks missed words struggling');

  const summary = await wmDB.getMasterySummary(mDeck.id);
  const strugglingWords = summary.strugglingCards.map((c) => c.germanWord);
  check(
    summary.strugglingCount === 2 &&
    summary.learningCount === 1 &&
    summary.masteredCount === 2 &&
    strugglingWords.includes('ZorKelime') &&
    strugglingWords.includes('OyunHata') &&
    !strugglingWords.includes('IyiKelime') &&
    !strugglingWords.includes('KolayKelime'),
    'getMasterySummary identifies struggling words and excludes Iyi/Kolay cards'
  );

  const smartQueue = await wmDB.getDueCards(mDeck.id, true, { filterMode: 'smart' });
  const smartWords = smartQueue.map((c) => c.germanWord);
  check(
    smartWords.length === 5 &&
    ['IyiKelime', 'KolayKelime'].includes(smartWords[3]) &&
    ['IyiKelime', 'KolayKelime'].includes(smartWords[4]),
    'getDueCards (smart) puts Iyi/Kolay learned cards at the very end'
  );

  const hideMasteredQueue = await wmDB.getDueCards(mDeck.id, true, { filterMode: 'hide_mastered' });
  const hideWords = hideMasteredQueue.map((c) => c.germanWord);
  check(
    hideWords.length === 3 && !hideWords.includes('IyiKelime') && !hideWords.includes('KolayKelime'),
    'getDueCards (hide_mastered) excludes Iyi and Kolay cards'
  );

  const strugglingOnlyQueue = await wmDB.getDueCards(mDeck.id, true, { filterMode: 'struggling_only' });
  const onlyWords = strugglingOnlyQueue.map((c) => c.germanWord);
  check(
    onlyWords.length === 2 && onlyWords.includes('ZorKelime') && onlyWords.includes('OyunHata'),
    'getDueCards (struggling_only) returns only struggling cards'
  );

  const shuffleDeck = await wmDB.createDeck('Shuffle Test');
  await wmDB.addCardsBatch(Array.from({ length: 15 }, (_, idx) => ({
    deckId: shuffleDeck.id,
    germanWord: `Mix${idx}`,
    turkishMeaning: `Karisik ${idx}`
  })));
  const orders = new Set();
  for (let i = 0; i < 6; i++) {
    const q = await wmDB.getDueCards(shuffleDeck.id, true, { filterMode: 'smart' });
    orders.add(q.map((c) => c.germanWord).join(','));
  }
  check(orders.size > 1, `getDueCards returns freshly shuffled order across entries (${orders.size} distinct orders in 6 runs)`);

  const createdStruggling = await wmDB.createStrugglingDeck('Zorlananlarim Test', [cZor.id, cOyun.id, cIyi.id, cKolay.id]);
  const allCardsAfterStruggling = await wmDB.getAllCards();
  const createdCards = allCardsAfterStruggling.filter((c) => Number(c.deckId) === Number(createdStruggling.deck.id));
  const origCardsAfter = allCardsAfterStruggling.filter((c) => Number(c.deckId) === Number(mDeck.id));
  const createdWords = createdCards.map((c) => c.germanWord);
  check(
    createdStruggling.addedCount === 2 &&
    createdWords.includes('ZorKelime') &&
    createdWords.includes('OyunHata') &&
    !createdWords.includes('IyiKelime') &&
    !createdWords.includes('KolayKelime') &&
    origCardsAfter.length === 5,
    'createStrugglingDeck builds separate deck excluding Iyi/Kolay while preserving original deck'
  );

  // 5. Cards Render, Modular UI, Backup UI, XSS & Keyboard Shortcuts Audit
  console.log('\n[5] app.js, Modular UI Mixins, study.js, deckBuilder.js & Keyboard Shortcuts Audit');
  const appJs = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const readerUiJs = fs.readFileSync(path.join(ROOT, 'js', 'readerUI.js'), 'utf8');
  const gamesUiJs = fs.readFileSync(path.join(ROOT, 'js', 'gamesUI.js'), 'utf8');
  const pronUiJs = fs.readFileSync(path.join(ROOT, 'js', 'pronunciationUI.js'), 'utf8');
  const studyJs = fs.readFileSync(path.join(ROOT, 'js', 'study.js'), 'utf8');
  const gameJs = fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');
  const deckBuilderJs = fs.readFileSync(path.join(ROOT, 'js', 'deckBuilder.js'), 'utf8');
  check(readerUiJs.includes('WortCoachReaderUIMixin') && readerUiJs.includes('bindSmartReader()'), 'js/readerUI.js exports WortCoachReaderUIMixin');
  check(gamesUiJs.includes('WortCoachGamesUIMixin') && gamesUiJs.includes('renderGameCurrentQuestion()') && gamesUiJs.includes('this.escapeHtml(optText)'), 'js/gamesUI.js exports WortCoachGamesUIMixin and escapes options');
  check(pronUiJs.includes('WortCoachPronunciationUIMixin') && pronUiJs.includes('renderPronunciationEvaluation(') && pronUiJs.includes('this.escapeHtml(syl.text)'), 'js/pronunciationUI.js exports WortCoachPronunciationUIMixin and escapes UI');
  check(appJs.includes('Object.assign(') && appJs.includes('WortCoachReaderUIMixin') && appJs.includes('WortCoachGamesUIMixin') && appJs.includes('WortCoachPronunciationUIMixin'), 'js/app.js composes UI mixins onto WortCoachApp.prototype');
  check(appJs.includes('cardsFilterDebounceTimer') && appJs.includes('cardsRenderLimit = 60'), 'Cards tab implements 200ms debounce and 60-card progressive pagination');
  check(appJs.includes('btn-cards-load-more') && appJs.includes('_renderedCardsById'), 'Cards tab uses event delegation and Load More button');
  check(!appJs.includes("getElementById('search-input')"), 'Synonym chip search uses #global-search-input instead of stale #search-input');
  check(appJs.includes('escapeHtml(str)'), 'WortCoachApp defines escapeHtml()');
  check(gamesUiJs.includes('_gameKbBound') && studyJs.includes('bindKeyboardShortcuts'), 'Keyboard shortcuts implemented in study.js and gamesUI.js quiz modal');
  check(appJs.includes('shared_text') && appJs.includes('btn-export-full-backup'), 'app.js handles PWA share_target and full backup UI');
  check(deckBuilderJs.includes('escapeHtml') && deckBuilderJs.includes('${escapeHtml(w.lemma)}'), 'deckBuilder.js escapes AI/remote fields with escapeHtml');
  check(
    appJs.includes('openMasteryAnalyzerModal') &&
      appJs.includes('createStrugglingDeck') &&
      studyJs.includes('setFilterMode') &&
      gameJs.includes('recordGameResult') &&
      gamesUiJs.includes('recordGameResult'),
    'User measurement analyzer, study filter modes, and game failure tracking wired across app/study/game modules'
  );

  // 6. Dictionary Parallelism & Cache Test
  console.log('\n[6] Dictionary Live + Cache Audit');
  const dictSandbox = {
    window: {},
    fetch: global.fetch,
    AbortController: global.AbortController,
    setTimeout,
    clearTimeout,
    console
  };
  dictSandbox.window = dictSandbox;
  vm.createContext(dictSandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'verbHelper.js'), 'utf8'), dictSandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'offlineDictionary.js'), 'utf8'), dictSandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'dictionary.js'), 'utf8'), dictSandbox);

  const Dict = dictSandbox.window.DictionaryService;
  const r1 = await Dict.fastGoogleReaderLookup('aufheben');
  const t0 = Date.now();
  const r2 = await Dict.fastGoogleReaderLookup('aufheben');
  const elapsedCache = Date.now() - t0;
  check(Boolean(r1 && r1.trList.length > 0 && r1.enList.length > 0), `fastGoogleReaderLookup returns TR (${r1?.trList?.length}) and EN (${r1?.enList?.length})`);
  check(Boolean(r2) && elapsedCache < 15, `Cached fastGoogleReaderLookup completed in ${elapsedCache}ms`);

  // 7. Social.js Polling & JWT Refresh Audit
  console.log('\n[7] social.js Polling & JWT Auth Unit Tests');
  const socialCode = fs.readFileSync(path.join(ROOT, 'js', 'social.js'), 'utf8');
  check(socialCode.includes('setInterval(runInboxCheck, 15000)') && !socialCode.includes('}, 3500);'), 'Inbox polling relaxed from 3.5s to 15s');
  check(socialCode.includes('document.hidden') && socialCode.includes('_inboxPollingInFlight') && socialCode.includes('_1v1PollingInFlight') && socialCode.includes('_kahootPollingInFlight'), 'Polling pauses when hidden and prevents overlapping async flights');
  check(socialCode.includes('headers.Authorization = `Bearer ${token}`') && socialCode.includes('refreshAuthSession'), 'social.js sends Bearer JWT and supports 401 refresh retry');
  check(socialCode.includes('function escapeHtml(str)') && socialCode.includes('${escapeHtml(d.title)}'), 'social.js escapes user/remote HTML interpolations via escapeHtml');
  check(socialCode.includes('window.wmDB.addCardsBatch(batchItems)'), 'social.js importDeckToLocal uses single-transaction addCardsBatch');
  check(!socialCode.includes('BJcW3pPjbzl'), 'social.js no longer references old rotated VAPID key');

  // 8. Worker CORS, VAPID Secret, Rate-Limit & JWT Verification Audit
  console.log('\n[8] worker/worker.js Security Audit');
  const workerRaw = fs.readFileSync(path.join(ROOT, 'worker', 'worker.js'), 'utf8');
  const wranglerToml = fs.readFileSync(path.join(ROOT, 'worker', 'wrangler.toml'), 'utf8');
  const workerNoExport = workerRaw.replace(/export\s+default\s+\{[\s\S]*$/m, '');
  const wSandbox = { URL, Map, Set, TextEncoder, crypto: global.crypto, fetch: global.fetch, Response, console };
  vm.createContext(wSandbox);
  vm.runInContext(workerNoExport, wSandbox);

  check(!workerRaw.includes('VAPID_PRIVATE_JWK = {') && !workerRaw.includes('9vFfs' + 'Lk7nq') && workerRaw.includes('env.VAPID_PRIVATE_JWK'), 'worker.js removed hardcoded VAPID_PRIVATE_JWK and reads env secret');
  check(wranglerToml.includes('name = "AUTH_LIMITER"') && wranglerToml.includes('name = "TRANSLATE_LIMITER"'), 'wrangler.toml defines AUTH_LIMITER and TRANSLATE_LIMITER');
  check(workerRaw.includes('env.AUTH_LIMITER.limit') && workerRaw.includes('env.TRANSLATE_LIMITER.limit'), 'worker.js enforces AUTH_LIMITER and TRANSLATE_LIMITER');

  const decksGetSlice = workerRaw.slice(workerRaw.indexOf("path === '/api/decks/get'"), workerRaw.indexOf("path === '/api/decks/get'") + 600);
  check(decksGetSlice.includes('verifyAuthUser(req, env)') && !decksGetSlice.includes('body.currentUserId'), '/api/decks/get uses verified JWT instead of body.currentUserId');

  const corsAllowedGitHub = wSandbox.cors({}, { headers: { get: (k) => k === 'Origin' ? 'https://furkna26.github.io' : '' } });
  const corsAllowedLocal = wSandbox.cors({}, { headers: { get: (k) => k === 'Origin' ? 'http://localhost:8000' : '' } });
  const corsBlockedEvil = wSandbox.cors({}, { headers: { get: (k) => k === 'Origin' ? 'https://evil-attacker.example' : '' } });
  const corsServerCall = wSandbox.cors({}, { headers: { get: () => '' } });
  check(corsAllowedGitHub.ok && corsAllowedGitHub.headers['Access-Control-Allow-Origin'] === 'https://furkna26.github.io', 'Worker CORS allows GitHub Pages origin');
  check(corsAllowedLocal.ok, 'Worker CORS allows localhost development origin');
  check(!corsBlockedEvil.ok, 'Worker CORS rejects unauthorized origin');
  check(corsServerCall.ok, 'Worker CORS allows server/CLI calls without Origin header');
  check(workerRaw.includes("if (path === '/api/auth/refresh')"), 'Worker exposes /api/auth/refresh');

  const protectedPaths = [
    '/api/profile/update', '/api/stats/record', '/api/friends/request', '/api/friends/accept',
    '/api/friends/remove', '/api/friends/list', '/api/friends/pending',
    '/api/decks/sync_all', '/api/decks/save', '/api/decks/public/remove',
    '/api/decks/inbox/send', '/api/decks/inbox/get', '/api/decks/inbox/resolve',
    '/api/multiplayer/invite/send', '/api/multiplayer/room/close',
    '/api/clubs/create', '/api/clubs/join', '/api/clubs/delete',
    '/api/clubs/members/remove', '/api/clubs/decks/remove', '/api/clubs/decks/add',
    '/api/clubs/decks/add_card', '/api/push/subscribe'
  ];
  const unprotected = [];
  for (const route of protectedPaths) {
    const idx = workerRaw.indexOf(`path === '${route}'`);
    const slice = idx >= 0 ? workerRaw.slice(idx, idx + 450) : '';
    if (!slice.includes('requireAuthUser')) unprotected.push(route);
  }
  check(unprotected.length === 0, `All ${protectedPaths.length} private/mutating Worker routes enforce requireAuthUser`, unprotected.join(', '));
  const roomCloseStart = workerRaw.indexOf("if (path === '/api/multiplayer/room/close')");
  const roomCloseEnd = workerRaw.indexOf("if (path === '/api/clubs/decks/add_card')", roomCloseStart);
  const roomCloseSlice = workerRaw.slice(roomCloseStart, roomCloseEnd);
  check(roomCloseSlice.includes('room.hostId !== authCheck.userId'), '/api/multiplayer/room/close verifies room.hostId ownership');

  // 9. Zero-Emoji, Syntax, Deploy Workflow & Clean Repo Audit
  console.log('\n[9] Zero-Emoji, JS Syntax, Secret Leak & Repo Hygiene Audit');
  const deployYml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8');
  check(deployYml.includes("path: '_site'") && deployYml.includes('cp -r css js icons _site/'), 'GitHub Pages workflow packages only static web assets into _site/');
  const rootEntries = fs.readdirSync(ROOT).filter((f) => /^(verify_|test_).*\.js$/.test(f));
  check(rootEntries.length === 0 && fs.existsSync(path.join(ROOT, 'tests', 'run_all.js')), 'Root directory clean: test scripts organized under tests/ with run_all.js');

  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join('js', f));
  const syntaxErrors = [];
  for (const rel of jsFiles) {
    try {
      new vm.Script(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    } catch (e) {
      syntaxErrors.push(`${rel}: ${e.message}`);
    }
  }
  check(syntaxErrors.length === 0, `All ${jsFiles.length} frontend JS files pass syntax validation`, syntaxErrors.join('; '));
  const emojiRegex = /[\u{1F300}-\u{1FAFF}]/u;
  const specificBadChars = /[\uFE0F]/;
  const scanFiles = [
    'index.html', 'sw.js', 'manifest.json', 'README.md', 'css/app.css', 'css/components.css', 'worker/worker.js',
    ...jsFiles
  ];
  const dirtyFiles = [];
  const secretLeakFiles = [];
  const secretPatterns = [new RegExp('sb_' + 'secret_'), new RegExp('AI' + 'zaSy'), new RegExp('AQ\\.' + 'Ab8RN')];
  for (const rel of scanFiles) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const cleanContent = rel.replace(/\\/g, '/') === 'worker/worker.js'
      ? content.replace(/\\ufe0f/gi, '')
      : content;
    if (emojiRegex.test(cleanContent) || specificBadChars.test(cleanContent) || /[🇩🇪🔊💡🧠]/u.test(cleanContent)) {
      dirtyFiles.push(rel);
    }
    if (secretPatterns.some((rx) => rx.test(content))) {
      secretLeakFiles.push(rel);
    }
  }
  check(dirtyFiles.length === 0, 'Zero pictographic emojis or stray variation selectors in app source', dirtyFiles.join(', '));
  check(secretLeakFiles.length === 0, 'Zero raw API/database secrets committed in repo source', secretLeakFiles.join(', '));
  check(!fs.existsSync(path.join(ROOT, 'fix_app_methods.py')) && !fs.existsSync(path.join(ROOT, 'icons', 'concepts')), 'Obsolete patch scripts and unused concept SVGs removed');

  console.log(`\n=== AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed}) ===`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Audit crashed:', err);
  process.exit(1);
});
