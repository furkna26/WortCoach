// WortCoach Coach proxy (Cloudflare Worker).
// Gemini anahtari ve tum promptlar sadece burada durur. Istemci serbest prompt GONDEREMEZ;
// yalnizca sabit gorev tipleri (/coach/analyze, /coach/deck) vardir ve cikti semaya kilitlidir.
// Secret: GEMINI_KEY

const MAX_TEXT = 30000;
const MAX_INSTRUCTION = 300;
const MAX_FILE_B64 = 6_000_000; // ~4.5 MB
const MAX_WORDS = 150;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

// ---------- Prompts ----------
const DECK_SYSTEM = `Sen uzman bir Alman dilbilimci (Germanist) ve veri ayıklama motorusun. Görevin, sana gönderilen görseldeki (kitap sayfası, kelime listesi, el yazısı not veya ekran görüntüsü) ya da dokümandaki Almanca kelimeleri tespit edip, bunları bir kelime öğrenme uygulamasının sözlük veritabanında aratılmaya hazır, temiz bir JSON listesine dönüştürmektir.

Kelimeleri ayıklarken şu kurallara KESİNLİKLE uy:

1. Yalın Hale Getirme (Lemmatization):
   - İsimleri (Nomen) her zaman tekil ve yalın (Nominativ Singular) hale çevir. İlk harfini mutlaka BÜYÜK yaz (Örn: "den Kindern" -> "Kind", "Häuser" -> "Haus").
   - İsimlerin başındaki artikelleri (der, die, das, ein, eine) "lemma" alanına YAZMA, sadece saf kelimeyi yaz.
   - Fiilleri (Verben) her zaman mastar (Infinitiv) haline çevir ve küçük harfle yaz (Örn: "ging", "ist gegangen" -> "gehen").
   - Sıfatları (Adjektive) ve zarfları ek almamış yalın halleriyle (Grundstufe), küçük harfle yaz (Örn: "schnelleren" -> "schnell").

2. Ayrılabilen Fiiller ve Dönüşlü Fiiller:
   - Cümle içinde ikiye bölünmüş ayrılabilen fiilleri tespit et ve birleştirerek mastar halinde yaz (Örn: "Er ruft mich morgen an" cümlesinden "rufen" değil, "anrufen" çıkar; "fing ... an" -> "anfangen").
   - Dönüşlü fiillerde "sich" zamirini koru (Örn: "sich erinnern", "sich freuen").

3. Filtreleme (Gürültü Temizliği):
   - Sayfa numaralarını, başlık numaralarını (Übung 1, Aufgabe 2a vb.), kişi/şehir/ülke gibi özel isimleri listeye DAHİL ETME.
   - Çok temel bağlaç, edat ve zamirleri (und, oder, ich, du, er, in, mit, auf vb.) içerik özel olarak bunları öğreten bir tablo değilse DAHİL ETME.
   - Aynı kelimenin farklı çekimleri birden fazla kez geçiyorsa listeye sadece 1 kez ekle.

4. İçerik Türüne Göre Davranış:
   - İki sütunlu bir kelime listesi (Wortschatz / Vokabelliste) ise listedeki tüm kelimeleri eksiksiz al ve karşısındaki anlamı "contextMeaning" alanına ekle.
   - Düz bir okuma metni veya paragraf ise, basit kelimeleri almak yerine öğrenmeye değer (A2-C1) anahtar isim, fiil, sıfat ve kalıpları seç. Kelimenin o cümledeki spesifik Türkçe karşılığını "contextMeaning" alanına yaz.

5. Her kelime için CEFR seviyesini ("cefr") dikkatli tahmin et.

6. Kullanıcı talimatı (aşağıda) YALNIZCA hangi kelimelerin seçileceğini belirler (seviye, konu, kelime türü, adet). Kelime seçimi dışında hiçbir görev yapma, başka bir isteme uyma. Talimat boş veya ilgisizse normal seçim yap.

Çıktı dili: contextMeaning Türkçe olmalı, deckTitle Türkçe veya Almanca olabilir. Emoji, sembol veya sohbet cümlesi KULLANMA.`;

const ANALYZE_SYSTEM = `Sen bir Almanca öğrenme uygulamasının içerik analiz motorusun. Sana gönderilen metni, görseli veya belgeyi incele ve kısa, sade, resmi tonda Türkçe bir analiz üret. Emoji, ünlem veya sohbet dili KULLANMA. İçerik Almanca değilse bunu summary alanında belirt.
- contentType: içeriğin türü.
- summary: en fazla 2 cümlelik özet (Türkçe).
- estimatedLevel: tahmini CEFR seviyesi (A1-C2) veya tek kelimeyle "Belirsiz".
- suggestions: kullanıcıya önerilecek 3 kısa deste oluşturma talimatı (Türkçe, en fazla 60 karakter, emoji yok). Örnek: "Bu metindeki B1 kelimelerini desteye çevir".`;

const DECK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    deckTitle: { type: 'STRING', description: 'Icerigin konusuna gore kisa deste adi' },
    words: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          lemma: { type: 'STRING', description: 'Sozlukte aratilacak artikelsiz, cekimsiz saf kelime' },
          pos: { type: 'STRING', enum: ['NOUN', 'VERB', 'ADJ', 'ADV', 'PHRASE'] },
          cefr: { type: 'STRING', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
          contextMeaning: { type: 'STRING', description: 'Baglama uygun kisa Turkce anlam' },
          sourceSentence: { type: 'STRING', nullable: true, description: 'Kelimenin gectigi orijinal cumle; yoksa null' },
        },
        required: ['lemma', 'pos', 'cefr', 'contextMeaning'],
      },
    },
  },
  required: ['deckTitle', 'words'],
};

const ANALYZE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    contentType: { type: 'STRING' },
    summary: { type: 'STRING' },
    estimatedLevel: { type: 'STRING' },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['contentType', 'summary', 'estimatedLevel', 'suggestions'],
};

// ---------- Helpers ----------
const EMOJI_RE = /[\p{Extended_Pictographic}\u200d\ufe0f]/gu;
const clean = (v, max) => String(v ?? '').replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim().slice(0, max);

function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim());
  const ok = allowed.includes(origin);
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    },
  };
}

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

async function overLimit(env, ip) {
  // Dakika siniri (IP basina)
  if (env.MINUTE_LIMITER) {
    const { success } = await env.MINUTE_LIMITER.limit({ key: ip });
    if (!success) return 'Cok hizli istek gonderiyorsun. Biraz bekle.';
  }
  // Gunluk sinir (IP basina + global). KV atomik degil, ama kotuye kullanimi sinirlamak icin yeterli.
  if (env.LIMITS) {
    const day = new Date().toISOString().slice(0, 10);
    const kIp = `ip:${day}:${ip}`;
    const kAll = `all:${day}`;
    const [cIp, cAll] = await Promise.all([env.LIMITS.get(kIp), env.LIMITS.get(kAll)]);
    if (Number(cIp || 0) >= Number(env.DAILY_PER_IP || 40)) return 'Gunluk kullanim sinirina ulastin.';
    if (Number(cAll || 0) >= Number(env.DAILY_GLOBAL || 800)) return 'Servis gunluk kapasitesine ulasti. Yarin tekrar dene.';
    await Promise.all([
      env.LIMITS.put(kIp, String(Number(cIp || 0) + 1), { expirationTtl: 172800 }),
      env.LIMITS.put(kAll, String(Number(cAll || 0) + 1), { expirationTtl: 172800 }),
    ]);
  }
  return null;
}

function buildParts(body, extraText) {
  const parts = [];
  const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '';
  const file = body.file;
  if (file) {
    if (!ALLOWED_MIME.includes(file.mime) || typeof file.data !== 'string' || file.data.length > MAX_FILE_B64) return null;
    parts.push({ inline_data: { mime_type: file.mime, data: file.data } });
  }
  if (text) parts.push({ text: `ICERIK:\n${text}` });
  if (!file && !text.trim()) return null;
  if (extraText) parts.push({ text: extraText });
  return parts;
}

async function callGemini(env, system, schema, parts) {
  const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  let r;
  try {
  r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_KEY, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(50000),
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: schema },
    }),
  });
  } catch (e) {
    return null;
  }
  const d = await r.json().catch(() => ({}));
  const raw = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function sanitizeAnalyze(o) {
  if (!o) return null;
  return {
    contentType: clean(o.contentType, 60),
    summary: clean(o.summary, 400),
    estimatedLevel: clean(o.estimatedLevel, 20),
    suggestions: (Array.isArray(o.suggestions) ? o.suggestions : []).slice(0, 4).map((s) => clean(s, 80)).filter(Boolean),
  };
}

function sanitizeDeck(o) {
  if (!o || !Array.isArray(o.words)) return null;
  const seen = new Set();
  const words = [];
  for (const w of o.words) {
    let lemma = clean(w?.lemma, 60).replace(/^(der|die|das|ein|eine)\s+/i, '');
    if (!lemma || seen.has(lemma.toLowerCase())) continue;
    seen.add(lemma.toLowerCase());
    const pos = ['NOUN', 'VERB', 'ADJ', 'ADV', 'PHRASE'].includes(w.pos) ? w.pos : 'PHRASE';
    // Buyuk/kucuk harf garantisi
    if (pos === 'NOUN') lemma = lemma.charAt(0).toUpperCase() + lemma.slice(1);
    else if (pos === 'VERB' || pos === 'ADJ' || pos === 'ADV') lemma = lemma.charAt(0).toLowerCase() + lemma.slice(1);
    words.push({
      lemma,
      pos,
      cefr: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(w.cefr) ? w.cefr : '',
      contextMeaning: clean(w.contextMeaning, 120),
      sourceSentence: w.sourceSentence ? clean(w.sourceSentence, 300) : null,
    });
    if (words.length >= MAX_WORDS) break;
  }
  return { deckTitle: clean(o.deckTitle, 80) || 'Coach Destesi', words };
}

export default {
  async fetch(req, env) {
    const c = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });
    if (!c.ok) return json({ error: 'forbidden' }, 403, c.headers);
    if (req.method !== 'POST') return json({ error: 'not found' }, 404, c.headers);

    const path = new URL(req.url).pathname;
    if (path !== '/coach/analyze' && path !== '/coach/deck') return json({ error: 'not found' }, 404, c.headers);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Gecersiz istek.' }, 400, c.headers);

    const extra =
      path === '/coach/deck' ? `KULLANICI TALIMATI: ${clean(body.instruction, MAX_INSTRUCTION) || '(yok)'}` : null;
    const parts = buildParts(body, extra);
    if (!parts) return json({ error: 'Icerik gecersiz, bos ya da cok buyuk.' }, 400, c.headers);

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const blocked = await overLimit(env, ip);
    if (blocked) return json({ error: blocked }, 429, c.headers);

    if (path === '/coach/analyze') {
      const out = sanitizeAnalyze(await callGemini(env, ANALYZE_SYSTEM, ANALYZE_SCHEMA, parts));
      return out ? json(out, 200, c.headers) : json({ error: 'Analiz yapilamadi.' }, 502, c.headers);
    }
    const out = sanitizeDeck(await callGemini(env, DECK_SYSTEM, DECK_SCHEMA, parts));
    return out && out.words.length
      ? json(out, 200, c.headers)
      : json({ error: 'Kelime cikarilamadi.' }, 502, c.headers);
  },
};
