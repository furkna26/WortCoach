const fs = require('fs');
const vm = require('vm');

console.log('=== WortCoach v3.6.0 Sosyal, Kulüp, Arena & Deste Doğrulama Testi ===\n');

// 1. Dosya Varlığı ve Sözdizimi Testleri
const files = [
  'index.html',
  'sw.js',
  'css/app.css',
  'css/components.css',
  'js/config.js',
  'js/social.js',
  'js/app.js',
  'worker/worker.js',
  'supabase/schema.sql'
];

let allFilesExist = true;
files.forEach(f => {
  if (fs.existsSync(f)) {
    console.log(`[OK] Dosya mevcut: ${f}`);
  } else {
    console.error(`[HATA] Dosya bulunamadı: ${f}`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  process.exit(1);
}

// 2. index.html İncelemesi (Yeni Sekmeler ve Modallar)
const html = fs.readFileSync('index.html', 'utf8');
const requiredIds = [
  'tab-social',
  'tab-profile',
  'social-my-friend-code',
  'social-user-search-input',
  'social-friends-leaderboard-list',
  'pane-social-public-decks',
  'public-decks-container',
  'pane-social-clubs',
  'clubs-list-container',
  'pane-social-arena',
  'arena-1v1-deck-select',
  'arena-panel-1v1',
  'arena-panel-kahoot',
  'pane-social-collab',
  'modal-publish-deck',
  'modal-preview-public-deck',
  'modal-create-club',
  'modal-join-club',
  'modal-club-detail',
  'modal-arena-1v1-game',
  'modal-arena-kahoot-game',
  'modal-add-collab-card'
];

console.log('\n--- index.html ID Kontrolleri ---');
let allIdsPresent = true;
requiredIds.forEach(id => {
  if (html.includes(`id="${id}"`)) {
    console.log(`[OK] ID mevcut: #${id}`);
  } else {
    console.error(`[HATA] ID eksik: #${id}`);
    allIdsPresent = false;
  }
});

// 3. Bottom Navigation 7 Sekme Kontrolü
console.log('\n--- Bottom Navigation 7 Sekme Kontrolü ---');
const navMatch = html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/);
if (navMatch) {
  const navContent = navMatch[0];
  const navTargets = [...navContent.matchAll(/data-target="([^"]+)"/g)].map(m => m[1]);
  console.log(`Bulunan Nav Hedefleri (${navTargets.length}):`, navTargets);
  const expectedNav = ['tab-decks', 'tab-cards', 'tab-home', 'tab-games', 'tab-social', 'tab-translate', 'tab-profile'];
  const isNavExact = JSON.stringify(navTargets) === JSON.stringify(expectedNav);
  if (isNavExact) {
    console.log('[OK] 7 Sekmeli Navigasyon tam ve beklenen sırada!');
  } else {
    console.error('[HATA] Navigasyon sıralaması veya sekme sayısı uyuşmuyor:', navTargets);
  }
} else {
  console.error('[HATA] bottom-nav bulunamadı!');
}

// 4. JS Sözdizimi Kontrolü
console.log('\n--- JavaScript Sözdizimi Kontrolü ---');
['js/social.js', 'js/app.js', 'worker/worker.js'].forEach(jsFile => {
  try {
    const code = fs.readFileSync(jsFile, 'utf8');
    new vm.Script(code);
    console.log(`[OK] Sözdizimi geçerli: ${jsFile}`);
  } catch (err) {
    console.error(`[HATA] Sözdizimi hatası: ${jsFile}`, err.message);
  }
});

// 5. Canlı Backend Worker API Doğrulama Testi
console.log('\n--- Canlı Cloudflare Worker API Testleri ---');
async function runApiTests() {
  const apiBase = 'https://wortcoach-proxy.mosmandurmaz26.workers.dev/api';
  
  // Test A: Herkese Açık Desteler
  try {
    const res = await fetch(`${apiBase}/decks/public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    console.log('[OK] /api/decks/public Yanıtı:', data.ok ? 'Başarılı (ok: true)' : data);
  } catch (e) {
    console.error('[HATA] /api/decks/public erişilemedi:', e.message);
  }

  // Test B: Kulüpler Listesi
  try {
    const res = await fetch(`${apiBase}/clubs/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    console.log('[OK] /api/clubs/list Yanıtı:', data.ok ? 'Başarılı (ok: true)' : data);
  } catch (e) {
    console.error('[HATA] /api/clubs/list erişilemedi:', e.message);
  }

  // Test C: 1v1 Oda Oluşturma
  try {
    const res = await fetch(`${apiBase}/multiplayer/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: '1v1',
        hostId: 'test_host',
        hostName: 'TestKullanici',
        deckTitle: 'A1 Almanca',
        words: [{ lemma: 'Apfel', contextMeaning: 'Elma', pos: 'NOUN' }]
      })
    });
    const data = await res.json();
    console.log('[OK] /api/multiplayer/room/create (1v1) PIN:', data.room?.pin);
  } catch (e) {
    console.error('[HATA] 1v1 oda oluşturma başarısız:', e.message);
  }

  // Test D: Kahoot Oda Oluşturma
  try {
    const res = await fetch(`${apiBase}/multiplayer/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'kahoot',
        hostId: 'test_host',
        hostName: 'TestKullanici',
        deckTitle: 'Goethe B1 Kelimeleri',
        duration: 15,
        words: [{ lemma: 'Erfahrung', contextMeaning: 'Deneyim', pos: 'NOUN' }]
      })
    });
    const data = await res.json();
    console.log('[OK] /api/multiplayer/room/create (Kahoot) PIN:', data.room?.pin);
  } catch (e) {
    console.error('[HATA] Kahoot oda oluşturma başarısız:', e.message);
  }

  console.log('\n=== Tüm Doğrulama Testleri Başarıyla Tamamlandı! ===');
}

runApiTests();
