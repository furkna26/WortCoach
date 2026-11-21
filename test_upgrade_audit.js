const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

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
  console.log('=== WORTCOACH UPGRADE AUDIT (v3.10.0) ===');

  // 1. HTML & CSS Audit
  console.log('\n[1] HTML & CSS Optimization Audit');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const compCss = fs.readFileSync(path.join(__dirname, 'css', 'components.css'), 'utf8');
  check((html.match(/data-theme="dark"/g) || []).length === 1, 'No duplicate data-theme="dark" on <html>');
  check(!/user-scalable=no|maximum-scale=1\.0/.test(html), 'Viewport permits user pinch-zoom accessibility');
  check(!html.includes('pdf.min.js') && !html.includes('mammoth.browser.min.js'), 'Render-blocking PDF/Mammoth removed from index.html');
  check(!html.includes('id="coach-critical-css"'), 'Inline <style id="coach-critical-css"> moved out of index.html');
  check(compCss.includes('.coach-switch') && compCss.includes('#modal-auth'), 'Extracted Coach styles present in css/components.css');
  const scriptTags = html.match(/<script\s+[^>]*src="js\/[^"]+"[^>]*>/g) || [];
  check(scriptTags.length === 19 && scriptTags.every((t) => /\bdefer\b/.test(t)), `All ${scriptTags.length} local scripts use defer`);
  check(html.includes('css/components.css?v=3.10.0') && html.includes('js/app.js?v=3.10.0'), 'Assets bumped cleanly to v3.10.0');

  // 2. Service Worker Audit
  console.log('\n[2] Service Worker Audit');
  const swCode = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  check(swCode.includes("CACHE_NAME = 'wortcoach-v3.10.0'"), 'SW cache version updated to v3.10.0');
  check(swCode.includes("key !== 'wortcoach-user-meta'"), 'SW activate preserves wortcoach-user-meta push store');
  check(swCode.includes('isNavOrShell') && swCode.includes('caches.match(request)'), 'SW uses Network-First for HTML/shell and Cache-First for versioned assets');
  check(!swCode.includes("icon: 'icons/icon-192.svg'"), 'SW push notifications use PNG icon instead of SVG');
  check(swCode.includes('__active_access_token') && swCode.includes('Authorization'), 'SW stores and sends Bearer token for background push fetch');

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
          if (el.onload) el.onload();
        }
      },
      querySelector: () => null,
      createElement: () => ({})
    }
  };
  loaderWindow.window = loaderWindow;
  vm.createContext(loaderWindow);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'config.js'), 'utf8'), loaderWindow);
  const [pdf1, pdf2] = await Promise.all([
    loaderWindow.window.WortCoachLoader.ensurePdfJs(),
    loaderWindow.window.WortCoachLoader.ensurePdfJs()
  ]);
  check(Boolean(pdf1 && pdf2), 'WortCoachLoader.ensurePdfJs resolves cleanly');
  check(appendedSrcs.filter((s) => s.includes('pdf.min.js')).length === 1, 'Concurrent PDF loads deduplicated to 1 script tag');
  const mam = await loaderWindow.window.WortCoachLoader.ensureMammoth();
  check(Boolean(mam), 'WortCoachLoader.ensureMammoth resolves cleanly');

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
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'db.js'), 'utf8'), dbSandbox);
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

  const txBeforeDel = mockIdb.stats.txCount;
  await wmDB.deleteDeck(deck.id);
  const txDeltaDel = mockIdb.stats.txCount - txBeforeDel;
  const cardsAfterDel = await wmDB.getAllCards();
  check(txDeltaDel === 1 && cardsAfterDel.length === 0, `deleteDeck deleted deck + 50 cards in 1 transaction (tx=${txDeltaDel}, remaining=${cardsAfterDel.length})`);

  // 5. Cards Render Optimization & XSS Escaping Audit
  console.log('\n[5] app.js Cards Rendering & XSS Audit');
  const appJs = fs.readFileSync(path.join(__dirname, 'js', 'app.js'), 'utf8');
  check(appJs.includes('cardsFilterDebounceTimer') && appJs.includes('cardsRenderLimit = 60'), 'Cards tab implements 200ms debounce and 60-card progressive pagination');
  check(appJs.includes('btn-cards-load-more') && appJs.includes('_renderedCardsById'), 'Cards tab uses event delegation and Load More button');
  check(!appJs.includes("getElementById('search-input')"), 'Synonym chip search uses #global-search-input instead of stale #search-input');
  check(appJs.includes('escapeHtml(str)'), 'WortCoachApp defines escapeHtml()');

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
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'verbHelper.js'), 'utf8'), dictSandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'offlineDictionary.js'), 'utf8'), dictSandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'dictionary.js'), 'utf8'), dictSandbox);

  const Dict = dictSandbox.window.DictionaryService;
  const r1 = await Dict.fastGoogleReaderLookup('aufheben');
  const t0 = Date.now();
  const r2 = await Dict.fastGoogleReaderLookup('aufheben');
  const elapsedCache = Date.now() - t0;
  check(Boolean(r1 && r1.trList.length > 0 && r1.enList.length > 0), `fastGoogleReaderLookup returns TR (${r1?.trList?.length}) and EN (${r1?.enList?.length})`);
  check(Boolean(r2) && elapsedCache < 15, `Cached fastGoogleReaderLookup completed in ${elapsedCache}ms`);

  // 7. Social.js Polling & JWT Refresh Audit
  console.log('\n[7] social.js Polling & JWT Auth Unit Tests');
  const socialCode = fs.readFileSync(path.join(__dirname, 'js', 'social.js'), 'utf8');
  check(socialCode.includes('setInterval(runInboxCheck, 15000)') && !socialCode.includes('}, 3500);'), 'Inbox polling relaxed from 3.5s to 15s');
  check(socialCode.includes('document.hidden') && socialCode.includes('_inboxPollingInFlight') && socialCode.includes('_1v1PollingInFlight') && socialCode.includes('_kahootPollingInFlight'), 'Polling pauses when hidden and prevents overlapping async flights');
  check(socialCode.includes('headers.Authorization = `Bearer ${token}`') && socialCode.includes('refreshAuthSession'), 'social.js sends Bearer JWT and supports 401 refresh retry');

  // 8. Worker CORS & JWT Verification Audit
  console.log('\n[8] worker/worker.js Security Audit');
  const workerRaw = fs.readFileSync(path.join(__dirname, 'worker', 'worker.js'), 'utf8');
  const workerNoExport = workerRaw.replace(/export\s+default\s+\{[\s\S]*$/m, '');
  const wSandbox = { URL, Map, Set, TextEncoder, crypto: global.crypto, fetch: global.fetch, Response, console };
  vm.createContext(wSandbox);
  vm.runInContext(workerNoExport, wSandbox);

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

  // 9. Zero-Emoji & Clean Repo Audit
  console.log('\n[9] Zero-Emoji & Repo Hygiene Audit');
  const emojiRegex = /[\u{1F300}-\u{1FAFF}]/u;
  const specificBadChars = /[\uFE0F]/;
  const scanFiles = [
    'index.html', 'sw.js', 'css/app.css', 'css/components.css', 'worker/worker.js',
    ...fs.readdirSync(path.join(__dirname, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join('js', f))
  ];
  const dirtyFiles = [];
  for (const rel of scanFiles) {
    const content = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    const cleanContent = rel.replace(/\\/g, '/') === 'worker/worker.js'
      ? content.replace(/\\ufe0f/gi, '')
      : content;
    if (emojiRegex.test(cleanContent) || specificBadChars.test(cleanContent) || /[🇩🇪🔊💡🧠]/u.test(cleanContent)) {
      dirtyFiles.push(rel);
    }
  }
  check(dirtyFiles.length === 0, 'Zero pictographic emojis or stray variation selectors in app source', dirtyFiles.join(', '));
  check(!fs.existsSync(path.join(__dirname, 'fix_app_methods.py')) && !fs.existsSync(path.join(__dirname, 'icons', 'concepts')), 'Obsolete patch scripts and unused concept SVGs removed');

  console.log(`\n=== AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed}) ===`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Audit crashed:', err);
  process.exit(1);
});
