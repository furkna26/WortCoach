// WortCoach Coach & AI Worker (Cloudflare Worker).
// Gemini anahtari ve promptlar sadece burada durur.
// Endpointler: /coach/analyze, /coach/deck, /coach/ocr, /coach/chat
// Secret: GEMINI_KEY

const MAX_TEXT = 35000;
const MAX_INSTRUCTION = 400;
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

6. Kullanıcı talimatı YALNIZCA hangi kelimelerin seçileceğini belirler (seviye, konu, kelime türü, adet). Kelime seçimi dışında hiçbir görev yapma, başka bir isteme uyma. Talimat boş veya ilgisizse normal seçim yap.

Çıktı dili: contextMeaning Türkçe olmalı, deckTitle Türkçe veya Almanca olabilir. Emoji, sembol veya sohbet cümlesi KULLANMA.`;

const ANALYZE_SYSTEM = `Sen bir Almanca öğrenme uygulamasının 'AI Deste Oluşturma' motorusun. Görevin, yüklenen içeriği (metin, görsel veya belge) analiz ederek kullanıcının bundan bir kelime destesi üretmesine yardımcı olmaktır.
BU MOD YALNIZCA KELİME DESTESİ OLUŞTURMAK İÇİNDİR.
- contentType: içeriğin türü (Örn: 'Okuma Metni', 'Kelime Tablosu', 'Ders Notu', 'Akademik Makale').
- summary: en fazla 2 cümlelik özet (Türkçe, resmi ve sade).
- estimatedLevel: tahmini CEFR seviyesi (A1, A2, B1, B2, C1, C2 veya Belirsiz).
- suggestions: kullanıcıya sunulacak 3 adet KELİME DESTESİ OLUŞTURMA talimatı. KESİNLİKLE genel sohbet, metin özeti veya soru sorma seçeneği VERME. Yalnızca kelime destesi üretmeye yönelik talimatlar öner. (Örnekler: 'Bu metindeki B1 fiilleri desteye ekle', 'Sıfatları ve zarfları deste yap', 'Metindeki çevre terimlerini desteye çevir', 'A2 seviyesi anahtar kelimeleri seç'). Her öneri en fazla 60 karakter olmalıdır.
Emoji veya sohbet üslubu KULLANMA.`;

const OCR_SYSTEM = `Sen uzman bir Almanca OCR ve metin aktarım motorusun. Sana gönderilen görseldeki veya belgedeki Almanca metinleri eksiksiz, temiz ve düzenli bir metin olarak ayıkla.
Kurallar:
1. Yalnızca görselde yer alan orijinal Almanca metni çıkar.
2. Başlık, paragraf ve cümle yapılarını koru.
3. Çeviri, yorum, açıklama veya emoji KESİNLİKLE EKLEME.`;

const COACH_CHAT_SYSTEM = `Sen WortCoach uygulamasının ileri seviye, analitik ve pedagojik Alman Dili ve Akademik Çalışma Koçusun.
GÖREV KAPSAMI VE KATI GÜVENLİK KURALI (TOKEN VE KONU KORUMASI):
1. YALNIZCA VE SADECE ALMANCA DİLİ ÖĞRENİMİ, Almanca dilbilgisi kuralları, Almanca sözcük dağarcığı, Almanca metin/doküman incelemesi, Almanca sınav hazırlığı (Goethe, Telc, TestDaF), telaffuz ve Almanca çeviri konularına cevap ver.
2. ALMANCA DIŞINDAKİ HERHANGİ BİR KONUDA (örneğin genel sohbet, felsefe, kod yazma, tarih, siyaset, magazin, diğer diller, genel kültür, matematik vb.) soru sorulursa veya kullanıcı konuyu saptırmaya çalışırsa, cevabın reply kısmına KESİNLİKLE VE SADECE şu cümleyi yaz:
"Maalesef bu konuda yardımcı olamam. Ben yalnızca Almanca öğreniminizde size rehberlik etmek üzere tasarlanmış bir dil koçuyum. Lütfen Almanca dilbilgisi, kelimeler veya metinlerinizle ilgili bir soru sorunuz."
Bu durumda exercise.type değerini 'NONE' yap ve suggestedPrompts olarak yalnızca Almanca çalışma önerileri ver.

ÖĞRETİM VE ÇALIŞMA KURALLARI:
1. Kullanıcıyla etkileşimli çalış; kullanıcının seviyesine (A1-C1) uygun olarak sorularını yanıtla, dilbilgisi kurallarını ve sözcük kullanımlarını net, sade, Türkçe açıklamalarla öğret.
2. Eğer kullanıcı bir metin, belge veya görsel gönderdiyse, bu metin üzerinde akademik inceleme yap (cümle analizleri, Nomen-Verb-Verbindungen, Passiv, Konjunktiv, bağlaçlar).
3. Kullanıcı pratik, oyun veya test istediğinde uygulamanın oyunlar sistemine uygun interaktif alıştırmalar veya deste kelimeleri üret:
   - 'CLOZE': Cümle içinde '___' şeklinde bir boşluk, 4 mantıklı seçenek, doğru indeks (0-3).
   - 'MATCHING': 4-5 adet Almanca - Türkçe kelime çifti ({ de: "...", tr: "..." }).
   - 'GRAMMAR': Fiil çekimi, artikel (der/die/das), sıfat çekimi veya edat sorusu, 4 seçenek ve doğru indeks.
   - 'DECK': Kullanıcı metinden deste üretilmesini istediğinde sözlüğe uyumlu 5-15 kelimelik liste ({ lemma, pos, cefr, contextMeaning, sourceSentence }).
   - 'NONE': Alıştırma gerektirmeyen standart açıklama veya reddetme yanıtı.
4. Kullanıcı alıştırma sonucunu (doğru veya yanlış cevapladığını) bildirdiğinde, cevabın reply kısmında bunu pedagojik olarak değerlendir: Doğru bildiyse tebrik et ve kuralı kısaca özetle; yanlış yaptıysa seçtiği seçeneğin neden yanlış olduğunu ve doğru kullanımın dilbilgisi kuralını (artikel, hal, çekim vb.) sade bir dille açıklayarak kullanıcıya rehberlik et.
5. KESİNLİKLE emoji kullanma. Ciddi, akademik, pedagojik ve kurumsal bir üslup kullan.`;

// ---------- Schemas ----------
const DECK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    deckTitle: { type: 'STRING', description: 'İçeriğin konusuna göre kısa deste adı' },
    words: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          lemma: { type: 'STRING', description: 'Sözlükte aratılacak artikelsiz, çekimsiz saf kelime' },
          pos: { type: 'STRING', enum: ['NOUN', 'VERB', 'ADJ', 'ADV', 'PHRASE'] },
          cefr: { type: 'STRING', enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
          contextMeaning: { type: 'STRING', description: 'Bağlama uygun kısa Türkçe anlam' },
          sourceSentence: { type: 'STRING', nullable: true, description: 'Kelimenin geçtiği orijinal cümle' },
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

const OCR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING', description: 'Görselden ayıklanan saf Almanca metin' },
  },
  required: ['text'],
};

const COACH_CHAT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING', description: 'Koçun Türkçe akademik veya pratik açıklaması' },
    suggestedPrompts: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Kullanıcının seçebileceği 2-3 sonraki pratik adımı',
    },
    exercise: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', enum: ['CLOZE', 'MATCHING', 'GRAMMAR', 'DECK', 'NONE'] },
        title: { type: 'STRING', nullable: true },
        instruction: { type: 'STRING', nullable: true },
        sentence: { type: 'STRING', nullable: true },
        options: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true },
        correctIndex: { type: 'INTEGER', nullable: true },
        pairs: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              de: { type: 'STRING' },
              tr: { type: 'STRING' },
            },
            required: ['de', 'tr'],
          },
          nullable: true,
        },
        words: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              lemma: { type: 'STRING' },
              pos: { type: 'STRING', enum: ['NOUN', 'VERB', 'ADJ', 'ADV', 'PHRASE'] },
              cefr: { type: 'STRING' },
              contextMeaning: { type: 'STRING' },
              sourceSentence: { type: 'STRING', nullable: true },
            },
            required: ['lemma', 'pos', 'contextMeaning'],
          },
          nullable: true,
        },
        explanation: { type: 'STRING', nullable: true },
      },
      required: ['type'],
    },
  },
  required: ['reply', 'exercise'],
};

// ---------- Helpers ----------
const EMOJI_RE = /[\p{Extended_Pictographic}\u200d\ufe0f]/gu;
const clean = (v, max) => String(v ?? '').replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim().slice(0, max);

function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  return {
    ok: true,
    headers: {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      Vary: 'Origin',
    },
  };
}

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

async function overLimit(env, ip) {
  if (env.MINUTE_LIMITER) {
    const { success } = await env.MINUTE_LIMITER.limit({ key: ip });
    if (!success) return 'Çok hızlı istek gönderiyorsunuz. Lütfen biraz bekleyin.';
  }
  if (env.LIMITS) {
    const day = new Date().toISOString().slice(0, 10);
    const kIp = `ip:${day}:${ip}`;
    const kAll = `all:${day}`;
    const [cIp, cAll] = await Promise.all([env.LIMITS.get(kIp), env.LIMITS.get(kAll)]);
    if (Number(cIp || 0) >= Number(env.DAILY_PER_IP || 80)) return 'Günlük kullanım sınırına ulaşıldı.';
    if (Number(cAll || 0) >= Number(env.DAILY_GLOBAL || 2000)) return 'Servis günlük kapasitesine ulaştı. Yarın tekrar deneyin.';
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
  if (text) parts.push({ text: `İÇERİK:\n${text}` });
  if (!file && !text.trim()) return null;
  if (extraText) parts.push({ text: extraText });
  return parts;
}

async function callGemini(env, system, schema, partsOrContents, maxTokens = 3500) {
  const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  let contents = [];
  if (Array.isArray(partsOrContents) && partsOrContents[0] && partsOrContents[0].role) {
    contents = partsOrContents;
  } else {
    contents = [{ role: 'user', parts: partsOrContents }];
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': env.GEMINI_KEY, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
      });
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        const raw = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
        if (raw) return JSON.parse(raw);
      }
    } catch (_) {}
    if (attempt === 0) await new Promise((res) => setTimeout(res, 800));
  }
  return null;
}

function sanitizeAnalyze(o) {
  if (!o) return null;
  return {
    contentType: clean(o.contentType, 60),
    summary: clean(o.summary, 400),
    estimatedLevel: clean(o.estimatedLevel, 20),
    suggestions: (Array.isArray(o.suggestions) ? o.suggestions : [])
      .slice(0, 4)
      .map((s) => clean(s, 80))
      .filter(Boolean),
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

function sanitizeCoachChat(o) {
  if (!o || !o.reply) return null;
  const ex = o.exercise || { type: 'NONE' };
  const sanitizedWords = Array.isArray(ex.words)
    ? ex.words.map((w) => {
        let lemma = clean(w?.lemma, 60).replace(/^(der|die|das|ein|eine)\s+/i, '');
        const pos = ['NOUN', 'VERB', 'ADJ', 'ADV', 'PHRASE'].includes(w.pos) ? w.pos : 'PHRASE';
        if (pos === 'NOUN') lemma = lemma.charAt(0).toUpperCase() + lemma.slice(1);
        else if (pos === 'VERB' || pos === 'ADJ' || pos === 'ADV') lemma = lemma.charAt(0).toLowerCase() + lemma.slice(1);
        return {
          lemma,
          pos,
          cefr: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(w.cefr) ? w.cefr : '',
          contextMeaning: clean(w.contextMeaning, 120),
          sourceSentence: w.sourceSentence ? clean(w.sourceSentence, 300) : null,
        };
      }).filter((w) => Boolean(w.lemma))
    : null;

  return {
    reply: clean(o.reply, 2500),
    suggestedPrompts: (Array.isArray(o.suggestedPrompts) ? o.suggestedPrompts : [])
      .slice(0, 3)
      .map((s) => clean(s, 70))
      .filter(Boolean),
    exercise: {
      type: ['CLOZE', 'MATCHING', 'GRAMMAR', 'DECK', 'NONE'].includes(ex.type) ? ex.type : 'NONE',
      title: ex.title ? clean(ex.title, 80) : '',
      instruction: ex.instruction ? clean(ex.instruction, 180) : '',
      sentence: ex.sentence ? clean(ex.sentence, 300) : null,
      options: Array.isArray(ex.options) ? ex.options.slice(0, 4).map((x) => clean(x, 70)) : null,
      correctIndex: typeof ex.correctIndex === 'number' ? Math.max(0, Math.min(3, ex.correctIndex)) : 0,
      pairs: Array.isArray(ex.pairs)
        ? ex.pairs.slice(0, 6).map((p) => ({ de: clean(p.de, 60), tr: clean(p.tr, 80) }))
        : null,
      words: sanitizedWords,
      explanation: ex.explanation ? clean(ex.explanation, 500) : null,
    },
  };
}


// ==========================================
// SUPABASE BACKEND PROXY (Kullanıcı veritabanını görmez)
// ==========================================
const SB_URL = 'https://zomxltwusqvqbpbgcdki.supabase.co';

function getSbFetch(env) {
  const sbKey = env.SUPABASE_SECRET || '';
  return (endpoint, options = {}) => {
    return fetch(`${SB_URL}${endpoint}`, {
      ...options,
      headers: {
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(options.headers || {})
      }
    });
  };
}

async function handleDatabaseApi(path, body, env, c) {
  const sbFetch = getSbFetch(env);
  try {
    // 1. Kayıt Ol (Admin API ile onaysız direkt aktif etme)
    if (path === '/api/auth/register') {
      const username = clean(body.username, 30);
      const password = String(body.password || '');
      if (!username || username.length < 3 || password.length < 6) {
        return json({ error: 'Kullanıcı adı en az 3, şifre en az 6 karakter olmalıdır.' }, 400, c.headers);
      }

      // Supabase Admin API çağrısı
      const adminRes = await sbFetch('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: `${username}@gmail.com`,
          password,
          email_confirm: true,
          user_metadata: { username }
        })
      });

      if (!adminRes.ok) {
        const errData = await adminRes.json().catch(() => ({}));
        const msg = errData?.message || errData?.msg || 'Kayıt oluşturulamadı.';
        if (msg.includes('already') || msg.includes('registered')) {
          return json({ error: 'Bu kullanıcı adı zaten kullanımda. Lütfen başka bir ad seçin.' }, 400, c.headers);
        }
        return json({ error: msg }, 400, c.headers);
      }

      const userData = await adminRes.json();
      const userId = userData.id || userData.user?.id;

      // Otomatik giriş yaparak session al
      const tokenRes = await sbFetch('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email: `${username}@gmail.com`, password })
      });
      const tokenData = await tokenRes.json().catch(() => ({}));

      // Profil kaydını getir
      let profile = null;
      for (let i = 0; i < 3; i++) {
        const pRes = await sbFetch(`/rest/v1/profiles?id=eq.${userId}&select=*`);
        const pList = await pRes.json().catch(() => []);
        if (Array.isArray(pList) && pList.length > 0) {
          profile = pList[0];
          break;
        }
        await new Promise(r => setTimeout(r, 400));
      }

      return json({ ok: true, session: tokenData, profile, user: { id: userId, username } }, 200, c.headers);
    }

    // 2. Giriş Yap
    if (path === '/api/auth/login') {
      const username = clean(body.username, 30);
      const password = String(body.password || '');
      if (!username || !password) {
        return json({ error: 'Kullanıcı adı ve şifre zorunludur.' }, 400, c.headers);
      }

      const tokenRes = await sbFetch('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email: `${username}@gmail.com`, password })
      });

      if (!tokenRes.ok) {
        return json({ error: 'Kullanıcı adı veya şifre hatalı.' }, 401, c.headers);
      }

      const tokenData = await tokenRes.json();
      const userId = tokenData.user?.id;

      const pRes = await sbFetch(`/rest/v1/profiles?id=eq.${userId}&select=*`);
      const pList = await pRes.json().catch(() => []);
      const profile = (Array.isArray(pList) && pList[0]) ? pList[0] : null;

      return json({ ok: true, session: tokenData, profile, user: { id: userId, username } }, 200, c.headers);
    }

    // 3. Profil Getir
    if (path === '/api/profile/get') {
      const userId = clean(body.userId, 40);
      if (!userId) return json({ error: 'Kullanıcı kimliği eksik.' }, 400, c.headers);

      const pRes = await sbFetch(`/rest/v1/profiles?id=eq.${userId}&select=*`);
      const pList = await pRes.json().catch(() => []);
      return json({ ok: true, profile: (Array.isArray(pList) && pList[0]) ? pList[0] : null }, 200, c.headers);
    }

    // 4. Profil Deste Gizliliği Güncelle
    if (path === '/api/profile/update') {
      const userId = clean(body.userId, 40);
      const deckPrivacy = ['private', 'friends', 'public'].includes(body.deckPrivacy) ? body.deckPrivacy : 'friends';
      await sbFetch(`/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ deck_privacy: deckPrivacy })
      });
      return json({ ok: true }, 200, c.headers);
    }

    // 5. Aktivite ve ELO Kaydet (RPC)
    if (path === '/api/stats/record') {
      const { userId, type, isCorrect, responseTimeMs, eloDelta } = body;
      if (!userId) return json({ error: 'Kullanıcı kimliği eksik.' }, 400, c.headers);

      const rpcRes = await sbFetch('/rest/v1/rpc/record_activity_stat', {
        method: 'POST',
        body: JSON.stringify({
          p_user_id: userId,
          p_stat_date: new Date().toISOString().slice(0, 10),
          p_type: type || 'review',
          p_is_correct: !!isCorrect,
          p_response_time_ms: Math.min(Math.max(Number(responseTimeMs) || 1500, 100), 60000),
          p_elo_delta: Number(eloDelta) || 0
        })
      });

      const rpcData = await rpcRes.json().catch(() => ({}));
      return json({ ok: true, data: rpcData }, 200, c.headers);
    }

    // 6. Zaman Filtreli 4'lü İstatistik Özeti
    if (path === '/api/stats/summary') {
      const userId = clean(body.userId, 40);
      const timeRange = clean(body.timeRange, 20) || 'all';
      if (!userId) return json({ error: 'Kullanıcı kimliği eksik.' }, 400, c.headers);

      const now = new Date();
      let minDate = '1970-01-01';
      if (timeRange === '1d') {
        minDate = now.toISOString().slice(0, 10);
      } else if (timeRange === '1w') {
        const d = new Date(now.getTime() - 7 * 86400000);
        minDate = d.toISOString().slice(0, 10);
      } else if (timeRange === '1m') {
        const d = new Date(now.getTime() - 30 * 86400000);
        minDate = d.toISOString().slice(0, 10);
      } else if (timeRange === '1y') {
        const d = new Date(now.getTime() - 365 * 86400000);
        minDate = d.toISOString().slice(0, 10);
      }

      const qRes = await sbFetch(`/rest/v1/daily_stats?user_id=eq.${userId}&stat_date=gte.${minDate}&select=*`);
      const rows = await qRes.json().catch(() => []);
      
      let sumArtCor = 0, sumArtTot = 0;
      let sumClozeCor = 0, sumClozeTot = 0;
      let sumRevCor = 0, sumRevTot = 0;
      let sumTime = 0, sumQ = 0;

      if (Array.isArray(rows)) {
        for (const r of rows) {
          sumArtCor += Number(r.artikel_correct || 0);
          sumArtTot += Number(r.artikel_total || 0);
          sumClozeCor += Number(r.cloze_correct || 0);
          sumClozeTot += Number(r.cloze_total || 0);
          sumRevCor += Number(r.review_correct || 0);
          sumRevTot += Number(r.review_total || 0);
          sumTime += Number(r.total_response_time_ms || 0);
          sumQ += Number(r.total_questions_answered || 0);
        }
      }

      const artikelAcc = sumArtTot > 0 ? Math.round((sumArtCor / sumArtTot) * 100) : 0;
      const clozeAcc = sumClozeTot > 0 ? Math.round((sumClozeCor / sumClozeTot) * 100) : 0;
      const retentionRate = sumRevTot > 0 ? Math.round((sumRevCor / sumRevTot) * 100) : 0;
      const agilitySec = sumQ > 0 ? ((sumTime / sumQ) / 1000).toFixed(1) : '0.0';

      return json({ ok: true, artikelAcc, clozeAcc, agilitySec, retentionRate, totalQuestions: sumQ }, 200, c.headers);
    }

    // 7. Arkadaş Ara (Username veya Friend Code)
    if (path === '/api/friends/search') {
      const q = clean(body.query, 40);
      const currentUserId = clean(body.currentUserId, 40);
      if (!q || q.length < 2) return json({ ok: true, users: [] }, 200, c.headers);

      const safeQ = encodeURIComponent(q);
      const sRes = await sbFetch(`/rest/v1/profiles?or=(username.ilike.*${safeQ}*,friend_code.ilike.*${safeQ}*)&select=id,username,friend_code,elo,rank_tier,streak_days&limit=15`);
      const users = await sRes.json().catch(() => []);
      const filtered = Array.isArray(users) ? users.filter(u => u.id !== currentUserId) : [];
      return json({ ok: true, users: filtered }, 200, c.headers);
    }

    // 8. Arkadaşlık İsteği Gönder
    if (path === '/api/friends/request') {
      const { requesterId, addresseeId } = body;
      if (!requesterId || !addresseeId || requesterId === addresseeId) {
        return json({ error: 'Geçersiz istek.' }, 400, c.headers);
      }

      // Önceden var mı kontrol et
      const checkRes = await sbFetch(`/rest/v1/friendships?or=(and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId}))&select=id,status`);
      const existing = await checkRes.json().catch(() => []);
      if (Array.isArray(existing) && existing.length > 0) {
        return json({ ok: true, message: 'İstek zaten mevcut.' }, 200, c.headers);
      }

      await sbFetch('/rest/v1/friendships', {
        method: 'POST',
        body: JSON.stringify({ requester_id: requesterId, addressee_id: addresseeId, status: 'pending' })
      });
      return json({ ok: true }, 200, c.headers);
    }

    // 9. Arkadaşlık Kabul Et
    if (path === '/api/friends/accept') {
      const friendshipId = clean(body.friendshipId, 50);
      await sbFetch(`/rest/v1/friendships?id=eq.${friendshipId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'accepted' })
      });
      return json({ ok: true }, 200, c.headers);
    }

    // 10. Arkadaşlığı Sil
    if (path === '/api/friends/remove') {
      const friendshipId = clean(body.friendshipId, 50);
      await sbFetch(`/rest/v1/friendships?id=eq.${friendshipId}`, { method: 'DELETE' });
      return json({ ok: true }, 200, c.headers);
    }

    // 11. Arkadaş Listesi & ELO Liderlik Tablosu
    if (path === '/api/friends/list') {
      const userId = clean(body.userId, 40);
      if (!userId) return json({ error: 'Kullanıcı kimliği eksik.' }, 400, c.headers);

      const fRes = await sbFetch(`/rest/v1/friendships?status=eq.accepted&or=(requester_id.eq.${userId},addressee_id.eq.${userId})&select=id,requester_id,addressee_id`);
      const fList = await fRes.json().catch(() => []);
      
      const friendIds = [];
      const friendshipMap = {};
      if (Array.isArray(fList)) {
        for (const f of fList) {
          const fid = f.requester_id === userId ? f.addressee_id : f.requester_id;
          friendIds.push(fid);
          friendshipMap[fid] = f.id;
        }
      }

      if (friendIds.length === 0) {
        return json({ ok: true, friends: [] }, 200, c.headers);
      }

      const pRes = await sbFetch(`/rest/v1/profiles?id=in.(${friendIds.join(',')})&select=id,username,friend_code,elo,rank_tier,streak_days,deck_privacy`);
      const pList = await pRes.json().catch(() => []);
      
      const friends = (Array.isArray(pList) ? pList : []).map(p => ({
        ...p,
        friendship_id: friendshipMap[p.id]
      }));

      // ELO'ya göre azalan sırala (Liderlik Tablosu)
      friends.sort((a, b) => (b.elo || 0) - (a.elo || 0));

      return json({ ok: true, friends }, 200, c.headers);
    }

    // 12. Bekleyen İstekler
    if (path === '/api/friends/pending') {
      const userId = clean(body.userId, 40);
      if (!userId) return json({ error: 'Kullanıcı kimliği eksik.' }, 400, c.headers);

      const pRes = await sbFetch(`/rest/v1/friendships?status=eq.pending&addressee_id=eq.${userId}&select=id,requester_id,created_at`);
      const reqList = await pRes.json().catch(() => []);
      
      const requests = [];
      if (Array.isArray(reqList) && reqList.length > 0) {
        const rIds = reqList.map(r => r.requester_id);
        const profRes = await sbFetch(`/rest/v1/profiles?id=in.(${rIds.join(',')})&select=id,username,friend_code,elo,rank_tier`);
        const profs = await profRes.json().catch(() => []);
        const pMap = {};
        if (Array.isArray(profs)) profs.forEach(p => pMap[p.id] = p);

        for (const r of reqList) {
          requests.push({
            id: r.id,
            requester: pMap[r.requester_id] || { username: 'Bilinmeyen', friend_code: 'WC#0000' }
          });
        }
      }

      return json({ ok: true, requests }, 200, c.headers);
    }

    // 13. Kullanıcı Desteleri (Gizlilik Kurallarına Göre)
    if (path === '/api/decks/get') {
      const targetUserId = clean(body.targetUserId, 40);
      const currentUserId = clean(body.currentUserId, 40);
      if (!targetUserId) return json({ ok: true, decks: [] }, 200, c.headers);

      // Kendi desteleri değilse gizlilik kontrolü yap
      if (targetUserId !== currentUserId) {
        const pRes = await sbFetch(`/rest/v1/profiles?id=eq.${targetUserId}&select=deck_privacy`);
        const pList = await pRes.json().catch(() => []);
        const privacy = (Array.isArray(pList) && pList[0]) ? pList[0].deck_privacy : 'friends';

        if (privacy === 'private') {
          return json({ ok: true, decks: [], privacyNotice: 'Kullanıcı destelerini gizli tutuyor.' }, 200, c.headers);
        }

        if (privacy === 'friends') {
          const fRes = await sbFetch(`/rest/v1/friendships?status=eq.accepted&or=(and(requester_id.eq.${currentUserId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${currentUserId}))&select=id`);
          const fList = await fRes.json().catch(() => []);
          if (!Array.isArray(fList) || fList.length === 0) {
            return json({ ok: true, decks: [], privacyNotice: 'Desteler yalnızca arkadaşlar tarafından görülebilir.' }, 200, c.headers);
          }
        }
      }

      const dRes = await sbFetch(`/rest/v1/decks?owner_id=eq.${targetUserId}&select=id,title,words_json,created_at`);
      const dbDecks = await dRes.json().catch(() => []);
      const mergedMap = new Map();

      if (Array.isArray(dbDecks)) {
        for (const d of dbDecks) {
          if (d.title === 'Test Deste' || String(d.title || '').includes('?')) continue;
          const w = Array.isArray(d.words_json) ? d.words_json : [];
          if (w.length === 0) continue;
          mergedMap.set((d.title || '').toLowerCase(), {
            id: d.id,
            title: d.title,
            words_json: w,
            created_at: d.created_at
          });
        }
      }

      if (env.LIMITS) {
        try {
          const kvDecksStr = await env.LIMITS.get(`userdecks:${targetUserId}`);
          if (kvDecksStr) {
            const kvDecks = JSON.parse(kvDecksStr);
            if (Array.isArray(kvDecks)) {
              for (const kd of kvDecks) {
                const w = Array.isArray(kd.words_json || kd.words) ? (kd.words_json || kd.words) : [];
                if (w.length === 0 || kd.title === 'Test Deste') continue;
                const key = (kd.title || '').toLowerCase();
                if (!mergedMap.has(key) || (mergedMap.get(key).words_json.length < w.length)) {
                  mergedMap.set(key, {
                    id: kd.id || 'kv_' + Date.now(),
                    title: kd.title,
                    words_json: w,
                    created_at: kd.created_at || kd.createdAt || new Date().toISOString()
                  });
                }
              }
            }
          }
        } catch (_) {}
      }

      return json({ ok: true, decks: Array.from(mergedMap.values()) }, 200, c.headers);
    }

    // 13b. Kullanıcının Tüm Destelerini Otomatik Buluta Senkronize Et
    if (path === '/api/decks/sync_all') {
      const ownerId = clean(body.ownerId, 40);
      const authorUsername = clean(body.username, 40) || 'Kullanıcı';
      const deckPrivacy = ['public', 'friends', 'private'].includes(body.deckPrivacy) ? body.deckPrivacy : null;
      const incomingDecks = Array.isArray(body.decks) ? body.decks : [];
      if (!ownerId) return json({ error: 'Kullanıcı kimliği eksik.' }, 400, c.headers);

      // Profil gizliliğini kontrol et
      let isPublicProfile = deckPrivacy === 'public';
      if (!deckPrivacy) {
        const pRes = await sbFetch(`/rest/v1/profiles?id=eq.${ownerId}&select=deck_privacy,username`);
        const pList = await pRes.json().catch(() => []);
        if (Array.isArray(pList) && pList[0]) {
          isPublicProfile = pList[0].deck_privacy === 'public';
        }
      }

      // Mevcut veritabanı destelerini al
      const exRes = await sbFetch(`/rest/v1/decks?owner_id=eq.${ownerId}&select=id,title`);
      const exList = await exRes.json().catch(() => []);
      const exMap = {};
      if (Array.isArray(exList)) {
        for (const ed of exList) {
          if (ed.title === 'Test Deste' || String(ed.title || '').includes('?')) {
            await sbFetch(`/rest/v1/decks?id=eq.${ed.id}`, { method: 'DELETE' });
          } else {
            exMap[(ed.title || '').toLowerCase()] = ed.id;
          }
        }
      }

      const syncedList = [];
      for (const d of incomingDecks.slice(0, 25)) {
        const title = clean(d.title || d.name, 80);
        const words = Array.isArray(d.words) ? d.words : [];
        if (!title || words.length === 0 || title === 'Test Deste' || title.includes('?')) continue;

        const key = title.toLowerCase();
        let deckId = exMap[key] || null;
        if (deckId) {
          await sbFetch(`/rest/v1/decks?id=eq.${deckId}`, {
            method: 'PATCH',
            body: JSON.stringify({ words_json: words, updated_at: new Date().toISOString() })
          });
        } else {
          const cRes = await sbFetch('/rest/v1/decks', {
            method: 'POST',
            body: JSON.stringify({ owner_id: ownerId, title, words_json: words })
          });
          const cData = await cRes.json().catch(() => []);
          if (Array.isArray(cData) && cData[0]) deckId = cData[0].id;
        }

        syncedList.push({
          id: deckId || ('deck_' + ownerId.slice(0, 6) + '_' + key.replace(/\s+/g, '_')),
          ownerId,
          title,
          description: clean(d.description || '', 200),
          authorUsername,
          isPublic: isPublicProfile,
          words,
          words_json: words,
          wordCount: words.length,
          createdAt: d.createdAt || new Date().toISOString()
        });
      }

      if (env.LIMITS) {
        await env.LIMITS.put(`userdecks:${ownerId}`, JSON.stringify(syncedList), { expirationTtl: 86400 * 60 });

        // Herkese açık profilse public deste indeksini güncelle
        try {
          const idxStr = await env.LIMITS.get('index:pubdecks');
          let pubIdx = idxStr ? JSON.parse(idxStr) : [];
          if (!Array.isArray(pubIdx)) pubIdx = [];
          pubIdx = pubIdx.filter(x => x.title !== 'Test Deste' && !String(x.title || '').includes('?'));

          if (isPublicProfile) {
            for (const sd of syncedList) {
              const existingIdx = pubIdx.findIndex(p => p.ownerId === ownerId && (p.title || '').toLowerCase() === sd.title.toLowerCase());
              const pubEntry = {
                id: sd.id,
                ownerId,
                title: sd.title,
                description: sd.description || '',
                authorUsername,
                isPublic: true,
                words: sd.words,
                wordCount: sd.wordCount,
                createdAt: sd.createdAt
              };
              if (existingIdx >= 0) pubIdx[existingIdx] = pubEntry;
              else pubIdx.unshift(pubEntry);
            }
          }
          await env.LIMITS.put('index:pubdecks', JSON.stringify(pubIdx.slice(0, 100)), { expirationTtl: 86400 * 60 });
        } catch (_) {}
      }

      return json({ ok: true, syncedCount: syncedList.length }, 200, c.headers);
    }

    // 14. Deste Kaydet (Ekleme / Güncelleme / Paylaşım)
    if (path === '/api/decks/save') {
      const ownerId = clean(body.ownerId, 40);
      const title = clean(body.title, 80) || 'Yeni Deste';
      const description = clean(body.description, 200) || '';
      const authorUsername = clean(body.authorUsername || body.username, 40) || 'Anonim';
      const isPublic = !!body.isPublic;
      const words = Array.isArray(body.words) ? body.words : [];
      if (!ownerId) return json({ error: 'Kullanıcı kimliği eksik.' }, 400, c.headers);

      // Mevcut aynı başlıklı deste var mı kontrol et, varsa güncelle
      const existingRes = await sbFetch(`/rest/v1/decks?owner_id=eq.${ownerId}&title=eq.${encodeURIComponent(title)}&select=id`);
      const existingList = await existingRes.json().catch(() => []);

      let deckId = null;
      if (Array.isArray(existingList) && existingList.length > 0) {
        deckId = existingList[0].id;
        await sbFetch(`/rest/v1/decks?id=eq.${deckId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            words_json: words,
            updated_at: new Date().toISOString()
          })
        });
      } else {
        const createRes = await sbFetch('/rest/v1/decks', {
          method: 'POST',
          body: JSON.stringify({
            owner_id: ownerId,
            title,
            words_json: words
          })
        });
        const createdData = await createRes.json().catch(() => []);
        if (Array.isArray(createdData) && createdData[0]) deckId = createdData[0].id;
      }

      const meta = {
        id: deckId || 'deck_' + Date.now(),
        ownerId,
        title,
        description,
        authorUsername,
        isPublic,
        words,
        wordCount: words.length,
        createdAt: new Date().toISOString()
      };

      if (env.LIMITS) {
        // Kullanıcının kişisel KV deste listesini de güncelle
        try {
          const uStr = await env.LIMITS.get(`userdecks:${ownerId}`);
          let uDecks = uStr ? JSON.parse(uStr) : [];
          if (!Array.isArray(uDecks)) uDecks = [];
          const uIdx = uDecks.findIndex(d => (d.title || '').toLowerCase() === title.toLowerCase());
          if (uIdx >= 0) uDecks[uIdx] = { ...meta, words_json: words };
          else uDecks.push({ ...meta, words_json: words });
          await env.LIMITS.put(`userdecks:${ownerId}`, JSON.stringify(uDecks), { expirationTtl: 86400 * 60 });
        } catch (_) {}

        if (isPublic) {
          await env.LIMITS.put(`pubdeck:${meta.id}`, JSON.stringify(meta), { expirationTtl: 86400 * 60 });
          try {
            const idxStr = await env.LIMITS.get('index:pubdecks');
            let pubIdx = idxStr ? JSON.parse(idxStr) : [];
            if (!Array.isArray(pubIdx)) pubIdx = [];
            const exIdx = pubIdx.findIndex(p => p.id === meta.id || (p.ownerId === ownerId && (p.title || '').toLowerCase() === title.toLowerCase()));
            if (exIdx >= 0) pubIdx[exIdx] = meta;
            else pubIdx.unshift(meta);
            await env.LIMITS.put('index:pubdecks', JSON.stringify(pubIdx.slice(0, 100)), { expirationTtl: 86400 * 60 });
          } catch (_) {}
        }
      }

      return json({ ok: true, deckId: meta.id, deck: meta }, 200, c.headers);
    }

    // 14b. Herkese Açık Desteler (Topluluk Kütüphanesi)
    if (path === '/api/decks/public') {
      const search = clean(body.search || '', 40).toLowerCase();
      const deckMap = new Map();

      const isCuratedTitle = (t) => {
        const cleanT = (t || '').toLowerCase();
        return cleanT.startsWith('a1:') || cleanT.startsWith('a2:') || cleanT.startsWith('b1:') || cleanT.startsWith('b2:') || cleanT.startsWith('c1:') || cleanT.startsWith('c2:') || cleanT.includes('hazır kelime') || cleanT.includes('küratör');
      };

      // 1. Strongly-consistent KV index:pubdecks oku
      if (env.LIMITS) {
        try {
          const idxStr = await env.LIMITS.get('index:pubdecks');
          if (idxStr) {
            const idxList = JSON.parse(idxStr);
            if (Array.isArray(idxList)) {
              let changed = false;
              const filteredIdx = [];
              for (const d of idxList) {
                if (!d || d.title === 'Test Deste' || String(d.title || '').includes('?') || !Array.isArray(d.words) || d.words.length === 0 || isCuratedTitle(d.title)) {
                  changed = true;
                  continue;
                }
                const key = `${d.ownerId || 'anon'}_${(d.title || '').toLowerCase()}`;
                deckMap.set(key, d);
                filteredIdx.push(d);
              }
              if (changed) {
                await env.LIMITS.put('index:pubdecks', JSON.stringify(filteredIdx), { expirationTtl: 86400 * 60 });
              }
            }
          }
        } catch (_) {}
      }

      // 2. Supabase'den public profillerin destelerini al
      const pRes = await sbFetch('/rest/v1/profiles?deck_privacy=eq.public&select=id,username');
      const pubProfiles = await pRes.json().catch(() => []);
      const userMap = {};
      if (Array.isArray(pubProfiles)) pubProfiles.forEach(p => userMap[p.id] = p.username);

      const pubIds = Object.keys(userMap);
      if (pubIds.length > 0) {
        const dRes = await sbFetch(`/rest/v1/decks?owner_id=in.(${pubIds.join(',')})&select=id,owner_id,title,words_json,created_at&limit=50`);
        const dbDecks = await dRes.json().catch(() => []);
        if (Array.isArray(dbDecks)) {
          for (const d of dbDecks) {
            if (d.title === 'Test Deste' || String(d.title || '').includes('?') || isCuratedTitle(d.title)) {
              if (isCuratedTitle(d.title) || d.title === 'Test Deste') {
                await sbFetch(`/rest/v1/decks?id=eq.${d.id}`, { method: 'DELETE' });
              }
              continue;
            }
            const words = Array.isArray(d.words_json) ? d.words_json : [];
            if (words.length === 0) continue;
            const key = `${d.owner_id}_${(d.title || '').toLowerCase()}`;
            if (!deckMap.has(key)) {
              deckMap.set(key, {
                id: d.id,
                ownerId: d.owner_id,
                title: d.title,
                description: 'Herkese açık profil destesi',
                authorUsername: userMap[d.owner_id] || 'Topluluk Yazarı',
                words,
                wordCount: words.length,
                createdAt: d.created_at
              });
            }
          }
        }
      }

      // 3. KV üzerindeki eski pubdeck: kayıtlarını da kontrol et
      if (env.LIMITS) {
        try {
          const list = await env.LIMITS.list({ prefix: 'pubdeck:', limit: 40 });
          for (const keyObj of list.keys) {
            const valStr = await env.LIMITS.get(keyObj.name);
            if (valStr) {
              const parsed = JSON.parse(valStr);
              if (parsed && parsed.title !== 'Test Deste' && !String(parsed.title || '').includes('?') && !isCuratedTitle(parsed.title) && Array.isArray(parsed.words) && parsed.words.length > 0) {
                const k = `${parsed.ownerId || 'anon'}_${(parsed.title || '').toLowerCase()}`;
                if (!deckMap.has(k)) deckMap.set(k, parsed);
              }
            }
          }
        } catch (_) {}
      }

      let publicDecks = Array.from(deckMap.values());

      // Arama filtresi
      if (search) {
        publicDecks = publicDecks.filter(d => 
          (d.title || '').toLowerCase().includes(search) || 
          (d.authorUsername || '').toLowerCase().includes(search) ||
          (d.description || '').toLowerCase().includes(search)
        );
      }

      publicDecks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return json({ ok: true, decks: publicDecks }, 200, c.headers);
    }

    // 14b-1. Herkese Açık Desteyi Yayından Kaldır / Sil
    if (path === '/api/decks/public/remove') {
      const deckId = clean(body.deckId, 60);
      const ownerId = clean(body.ownerId, 40);
      if (!deckId || !ownerId) return json({ error: 'Eksik parametre.' }, 400, c.headers);

      if (env.LIMITS) {
        await env.LIMITS.delete(`pubdeck:${deckId}`);
        try {
          const idxStr = await env.LIMITS.get('index:pubdecks');
          if (idxStr) {
            let list = JSON.parse(idxStr);
            if (Array.isArray(list)) {
              list = list.filter(d => !(String(d.id) === String(deckId) && (d.ownerId === ownerId || !d.ownerId)));
              await env.LIMITS.put('index:pubdecks', JSON.stringify(list), { expirationTtl: 86400 * 60 });
            }
          }
        } catch (_) {}
      }

      // Supabase üzerinden de sil
      await sbFetch(`/rest/v1/decks?id=eq.${deckId}&owner_id=eq.${ownerId}`, { method: 'DELETE' });
      return json({ ok: true }, 200, c.headers);
    }

    // 14b-2. Arkadaşa Doğrudan Deste Gönderme (Gelen Kutusu / Inbox)
    if (path === '/api/decks/inbox/send') {
      const fromUserId = clean(body.fromUserId, 40);
      const fromUsername = clean(body.fromUsername, 40) || 'Arkadaşın';
      const toUserId = clean(body.toUserId, 40);
      const deckTitle = clean(body.deckTitle, 80) || 'Paylaşılan Deste';
      const words = Array.isArray(body.words) ? body.words : [];
      if (!fromUserId || !toUserId || words.length === 0 || !env.LIMITS) {
        return json({ error: 'Eksik deste veya alıcı bilgisi.' }, 400, c.headers);
      }

      // Spam Koruması: Aynı kullanıcıdan 4 saniye içinde ardışık deste gönderim engeli
      const spamKey = `spam_deck:${fromUserId}:${toUserId}`;
      const isSpam = await env.LIMITS.get(spamKey);
      if (isSpam) {
        return json({ error: 'Lütfen ardışık deste göndermeden önce birkaç saniye bekleyin.' }, 429, c.headers);
      }
      await env.LIMITS.put(spamKey, '1', { expirationTtl: 4 });

      const giftObj = {
        id: 'gift_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        fromUserId,
        fromUsername,
        toUserId,
        deckTitle,
        words,
        wordCount: words.length,
        sentAt: new Date().toISOString()
      };

      const inboxKey = `inbox:${toUserId}`;
      const existingStr = await env.LIMITS.get(inboxKey);
      let inbox = existingStr ? JSON.parse(existingStr) : [];
      if (!Array.isArray(inbox)) inbox = [];
      inbox.unshift(giftObj);
      await env.LIMITS.put(inboxKey, JSON.stringify(inbox.slice(0, 30)), { expirationTtl: 86400 * 30 });

      return json({ ok: true, gift: giftObj }, 200, c.headers);
    }

    if (path === '/api/decks/inbox/get') {
      const userId = clean(body.userId, 40);
      if (!userId || !env.LIMITS) return json({ ok: true, gifts: [] }, 200, c.headers);

      const existingStr = await env.LIMITS.get(`inbox:${userId}`);
      let inbox = existingStr ? JSON.parse(existingStr) : [];
      if (!Array.isArray(inbox)) inbox = [];

      const now = Date.now();
      const validItems = [];
      let inboxChanged = false;

      for (const item of inbox) {
        if (item.type === 'match_invite') {
          // Maç davetleri: 15 dakikalık zaman aşımı (900.000 ms)
          const sentTime = item.sentAt ? new Date(item.sentAt).getTime() : 0;
          if (now - sentTime > 900000) {
            inboxChanged = true;
            continue; // Zaman aşımına uğramış davet silinir
          }
          // Oda durumunu kontrol et: Kapalıysa sil
          if (item.pin) {
            let rStr = await env.LIMITS.get(`room:${item.pin}`);
            if (!rStr && !item.pin.startsWith('VS-')) rStr = await env.LIMITS.get(`room:VS-${item.pin}`);
            if (!rStr) {
              inboxChanged = true;
              continue; // Oda bulunamadı, sil
            }
            try {
              const rObj = JSON.parse(rStr);
              if (rObj.status === 'closed' || rObj.status === 'finished') {
                inboxChanged = true;
                continue; // Oda kapalı veya bitmiş, daveti iptal et
              }
            } catch (_) {}
          }
          validItems.push(item);
        } else {
          // Gönderilen Desteler (deck_gift) KESİNLİKLE zaman aşımına uğramaz!
          validItems.push(item);
        }
      }

      if (inboxChanged) {
        await env.LIMITS.put(`inbox:${userId}`, JSON.stringify(validItems.slice(0, 30)), { expirationTtl: 86400 * 30 });
      }

      return json({ ok: true, gifts: validItems }, 200, c.headers);
    }

    if (path === '/api/decks/inbox/resolve') {
      const userId = clean(body.userId, 40);
      const giftId = clean(body.giftId, 60);
      if (!userId || !giftId || !env.LIMITS) return json({ ok: true }, 200, c.headers);

      const inboxKey = `inbox:${userId}`;
      const existingStr = await env.LIMITS.get(inboxKey);
      let inbox = existingStr ? JSON.parse(existingStr) : [];
      if (Array.isArray(inbox)) {
        inbox = inbox.filter(g => g.id !== giftId);
        await env.LIMITS.put(inboxKey, JSON.stringify(inbox), { expirationTtl: 86400 * 30 });
      }
      return json({ ok: true, gifts: inbox }, 200, c.headers);
    }

    // 14c. Kulüpler / Sınıflar API
    if (path === '/api/clubs/create') {
      const name = clean(body.name, 60);
      const description = clean(body.description, 200) || '';
      const ownerId = clean(body.ownerId, 40);
      const ownerUsername = clean(body.ownerUsername, 40) || 'Yönetici';
      const access = clean(body.access, 20) === 'code' ? 'code' : 'public';
      if (!name || !ownerId) return json({ error: 'Kulüp adı ve kurucu bilgisi zorunludur.' }, 400, c.headers);

      const clubCode = 'KLB-' + Math.floor(1000 + Math.random() * 9000);
      const clubId = 'club_' + Date.now();
      const clubObj = {
        id: clubId,
        code: clubCode,
        access, // 'public' | 'code'
        isPublic: access === 'public',
        name,
        description,
        ownerId,
        ownerUsername,
        members: [{ id: ownerId, username: ownerUsername, role: 'Kurucu', joinedAt: new Date().toISOString() }],
        decks: [],
        createdAt: new Date().toISOString()
      };

      if (env.LIMITS) {
        await env.LIMITS.put(`club:${clubId}`, JSON.stringify(clubObj), { expirationTtl: 86400 * 60 });
        await env.LIMITS.put(`club_code:${clubCode}`, clubId, { expirationTtl: 86400 * 60 });
        try {
          const idxStr = await env.LIMITS.get('index:clubs');
          let clubIds = idxStr ? JSON.parse(idxStr) : [];
          if (!Array.isArray(clubIds)) clubIds = [];
          if (!clubIds.includes(clubId)) clubIds.unshift(clubId);
          await env.LIMITS.put('index:clubs', JSON.stringify(clubIds.slice(0, 100)), { expirationTtl: 86400 * 60 });
        } catch (_) {}
      }

      return json({ ok: true, club: clubObj }, 200, c.headers);
    }

    if (path === '/api/clubs/join') {
      const code = clean(body.code, 20).toUpperCase();
      const directClubId = clean(body.clubId, 50);
      const userId = clean(body.userId, 40);
      const username = clean(body.username, 40) || 'Üye';
      if (!userId) return json({ error: 'Kullanıcı bilgisi eksik.' }, 400, c.headers);
      if (!env.LIMITS) return json({ error: 'Depolama alanı aktif değil.' }, 500, c.headers);

      let targetClubId = directClubId;
      if (!targetClubId && code) {
        targetClubId = await env.LIMITS.get(`club_code:${code}`);
      }
      if (!targetClubId) return json({ error: 'Bu koda ait bir kulüp veya sınıf bulunamadı.' }, 404, c.headers);

      const clubStr = await env.LIMITS.get(`club:${targetClubId}`);
      if (!clubStr) return json({ error: 'Kulüp kaydına ulaşılamadı.' }, 404, c.headers);

      const clubObj = JSON.parse(clubStr);
      // Eğer doğrudan katılıyorsa ve kulüp kodluysa kontrol et
      if (!code && clubObj.access === 'code' && clubObj.ownerId !== userId) {
        return json({ error: 'Bu kulüp özeldir, lütfen katılım kodu giriniz.' }, 403, c.headers);
      }

      if (!clubObj.members.some(m => m.id === userId)) {
        clubObj.members.push({ id: userId, username, role: 'Üye', joinedAt: new Date().toISOString() });
        await env.LIMITS.put(`club:${targetClubId}`, JSON.stringify(clubObj), { expirationTtl: 86400 * 60 });
      }

      return json({ ok: true, club: clubObj }, 200, c.headers);
    }

    if (path === '/api/clubs/delete') {
      const clubId = clean(body.clubId, 50);
      const ownerId = clean(body.ownerId, 40);
      if (!clubId || !ownerId || !env.LIMITS) return json({ error: 'Eksik parametre.' }, 400, c.headers);

      const clubStr = await env.LIMITS.get(`club:${clubId}`);
      if (!clubStr) return json({ error: 'Kulüp bulunamadı.' }, 404, c.headers);

      const clubObj = JSON.parse(clubStr);
      if (clubObj.ownerId !== ownerId) {
        return json({ error: 'Kulübü sadece kurucusu silebilir.' }, 403, c.headers);
      }

      await env.LIMITS.delete(`club:${clubId}`);
      if (clubObj.code) await env.LIMITS.delete(`club_code:${clubObj.code}`);

      try {
        const idxStr = await env.LIMITS.get('index:clubs');
        if (idxStr) {
          let clubIds = JSON.parse(idxStr);
          if (Array.isArray(clubIds)) {
            clubIds = clubIds.filter(id => id !== clubId);
            await env.LIMITS.put('index:clubs', JSON.stringify(clubIds), { expirationTtl: 86400 * 60 });
          }
        }
      } catch (_) {}

      return json({ ok: true }, 200, c.headers);
    }

    if (path === '/api/clubs/members/remove') {
      const clubId = clean(body.clubId, 50);
      const ownerId = clean(body.ownerId, 40);
      const memberId = clean(body.memberId, 40);
      if (!clubId || !ownerId || !memberId || !env.LIMITS) return json({ error: 'Eksik parametre.' }, 400, c.headers);

      const clubStr = await env.LIMITS.get(`club:${clubId}`);
      if (!clubStr) return json({ error: 'Kulüp bulunamadı.' }, 404, c.headers);

      const clubObj = JSON.parse(clubStr);
      if (clubObj.ownerId !== ownerId && ownerId !== memberId) {
        return json({ error: 'Bu işlem için yetkiniz yok.' }, 403, c.headers);
      }
      if (memberId === clubObj.ownerId) {
        return json({ error: 'Kulüp kurucusu üyelikten çıkarılamaz.' }, 400, c.headers);
      }

      clubObj.members = (clubObj.members || []).filter(m => m.id !== memberId);
      await env.LIMITS.put(`club:${clubId}`, JSON.stringify(clubObj), { expirationTtl: 86400 * 60 });
      return json({ ok: true, club: clubObj }, 200, c.headers);
    }

    if (path === '/api/clubs/decks/remove') {
      const clubId = clean(body.clubId, 50);
      const ownerId = clean(body.ownerId, 40);
      const deckId = clean(body.deckId, 60);
      if (!clubId || !ownerId || !deckId || !env.LIMITS) return json({ error: 'Eksik parametre.' }, 400, c.headers);

      const clubStr = await env.LIMITS.get(`club:${clubId}`);
      if (!clubStr) return json({ error: 'Kulüp bulunamadı.' }, 404, c.headers);

      const clubObj = JSON.parse(clubStr);
      // Kurucu silebilir veya desteyi ekleyen silebilir
      const targetDeck = (clubObj.decks || []).find(d => d.id === deckId);
      if (!targetDeck) return json({ error: 'Deste bulunamadı.' }, 404, c.headers);

      if (clubObj.ownerId !== ownerId && targetDeck.addedById !== ownerId) {
        return json({ error: 'Bu desteyi silme yetkiniz yok.' }, 403, c.headers);
      }

      clubObj.decks = clubObj.decks.filter(d => d.id !== deckId);
      await env.LIMITS.put(`club:${clubId}`, JSON.stringify(clubObj), { expirationTtl: 86400 * 60 });
      return json({ ok: true, club: clubObj }, 200, c.headers);
    }

    if (path === '/api/clubs/list') {
      const clubMap = new Map();
      if (env.LIMITS) {
        try {
          const idxStr = await env.LIMITS.get('index:clubs');
          if (idxStr) {
            const clubIds = JSON.parse(idxStr);
            if (Array.isArray(clubIds)) {
              for (const cid of clubIds) {
                const cStr = await env.LIMITS.get(`club:${cid}`);
                if (cStr) {
                  const parsed = JSON.parse(cStr);
                  clubMap.set(parsed.id, parsed);
                }
              }
            }
          }
          const list = await env.LIMITS.list({ prefix: 'club:', limit: 50 });
          for (const key of list.keys) {
            const cid = key.name.replace('club:', '');
            if (!clubMap.has(cid)) {
              const valStr = await env.LIMITS.get(key.name);
              if (valStr) {
                const parsed = JSON.parse(valStr);
                clubMap.set(parsed.id, parsed);
              }
            }
          }
        } catch (_) {}
      }
      const clubs = Array.from(clubMap.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return json({ ok: true, clubs }, 200, c.headers);
    }

    if (path === '/api/clubs/decks/add') {
      const clubId = clean(body.clubId, 50);
      const deck = body.deck;
      const addedBy = clean(body.username, 40) || 'Üye';
      const addedById = clean(body.userId || body.ownerId, 40);
      if (!clubId || !deck || !env.LIMITS) return json({ error: 'Geçersiz parametreler.' }, 400, c.headers);

      const clubStr = await env.LIMITS.get(`club:${clubId}`);
      if (!clubStr) return json({ error: 'Kulüp bulunamadı.' }, 404, c.headers);

      const clubObj = JSON.parse(clubStr);
      if (!Array.isArray(clubObj.decks)) clubObj.decks = [];
      const clubDeck = {
        id: deck.id || 'cdeck_' + Date.now(),
        title: deck.title || 'Kulüp Destesi',
        words: deck.words || [],
        wordCount: Array.isArray(deck.words) ? deck.words.length : 0,
        addedBy,
        addedById,
        addedAt: new Date().toISOString()
      };
      clubObj.decks.push(clubDeck);
      await env.LIMITS.put(`club:${clubId}`, JSON.stringify(clubObj), { expirationTtl: 86400 * 60 });

      return json({ ok: true, deck: clubDeck, club: clubObj }, 200, c.headers);
    }

    // 14d. Çok Oyunculu Oda Yönetimi (1v1 Kapışma & Kahoot Grup Oyunu - KV Ultra Hızlı State)
    if (path === '/api/multiplayer/room/create') {
      const type = ['1v1', 'kahoot'].includes(body.type) ? body.type : '1v1';
      const hostId = clean(body.hostId, 40);
      const hostName = clean(body.hostName, 40) || 'Oda Sahibi';
      const deckTitle = clean(body.deckTitle, 80) || 'Karışık Deste';
      const words = Array.isArray(body.words) ? body.words : [];
      const questionDurationSec = Math.min(Math.max(Number(body.duration) || 15, 5), 60);

      const pin = type === '1v1'
        ? 'VS-' + Math.floor(1000 + Math.random() * 9000)
        : String(Math.floor(100000 + Math.random() * 900000));

      const roomObj = {
        pin,
        type,
        hostId,
        hostName,
        deckTitle,
        questionDurationSec,
        words,
        status: 'lobby', // 'lobby', 'active', 'finished'
        createdAt: new Date().toISOString(),
        players: [{ id: hostId, name: hostName, score: 0, answers: {}, isHost: true }],
        currentQuestionIndex: 0
      };

      if (env.LIMITS) {
        await env.LIMITS.put(`room:${pin}`, JSON.stringify(roomObj), { expirationTtl: 7200 }); // 2 saat geçerli
      }

      return json({ ok: true, room: roomObj }, 200, c.headers);
    }

    if (path === '/api/multiplayer/room/join') {
      const rawPin = clean(body.pin, 20).toUpperCase();
      const playerId = clean(body.playerId, 40);
      const playerName = clean(body.playerName, 40) || 'Yarışmacı';
      if (!rawPin || !playerId || !env.LIMITS) return json({ error: 'PIN ve oyuncu adı zorunludur.' }, 400, c.headers);

      let roomStr = await env.LIMITS.get(`room:${rawPin}`);
      let effectivePin = rawPin;
      if (!roomStr && !rawPin.startsWith('VS-')) {
        const altPin = `VS-${rawPin}`;
        roomStr = await env.LIMITS.get(`room:${altPin}`);
        if (roomStr) effectivePin = altPin;
      }
      if (!roomStr && rawPin.startsWith('VS-')) {
        const altPin = rawPin.replace('VS-', '');
        roomStr = await env.LIMITS.get(`room:${altPin}`);
        if (roomStr) effectivePin = altPin;
      }

      if (!roomStr) return json({ error: 'Oda bulunamadı veya süresi doldu.' }, 404, c.headers);

      const room = JSON.parse(roomStr);
      if (room.status === 'finished') return json({ error: 'Bu oyun sona ermiştir.' }, 400, c.headers);

      const existingPlayer = room.players.find(p => p.id === playerId);
      if (!existingPlayer) {
        room.players.push({ id: playerId, name: playerName, score: 0, answers: {}, isHost: false });
        await env.LIMITS.put(`room:${effectivePin}`, JSON.stringify(room), { expirationTtl: 7200 });
      }

      return json({ ok: true, room }, 200, c.headers);
    }

    if (path === '/api/multiplayer/room/leave') {
      const rawPin = clean(body.pin, 20).toUpperCase();
      const playerId = clean(body.playerId, 40);
      if (!rawPin || !playerId || !env.LIMITS) return json({ ok: true }, 200, c.headers);

      let roomStr = await env.LIMITS.get(`room:${rawPin}`);
      let effectivePin = rawPin;
      if (!roomStr && !rawPin.startsWith('VS-')) {
        const altPin = `VS-${rawPin}`;
        roomStr = await env.LIMITS.get(`room:${altPin}`);
        if (roomStr) effectivePin = altPin;
      }
      if (!roomStr) return json({ ok: true }, 200, c.headers);

      const room = JSON.parse(roomStr);
      room.players = (room.players || []).filter(p => p.id !== playerId);
      await env.LIMITS.put(`room:${effectivePin}`, JSON.stringify(room), { expirationTtl: 7200 });
      return json({ ok: true }, 200, c.headers);
    }

    if (path === '/api/multiplayer/room/state') {
      const rawPin = clean(body.pin, 20).toUpperCase();
      if (!rawPin || !env.LIMITS) return json({ error: 'PIN eksik.' }, 400, c.headers);

      let roomStr = await env.LIMITS.get(`room:${rawPin}`);
      if (!roomStr && !rawPin.startsWith('VS-')) {
        roomStr = await env.LIMITS.get(`room:VS-${rawPin}`);
      }
      if (!roomStr && rawPin.startsWith('VS-')) {
        roomStr = await env.LIMITS.get(`room:${rawPin.replace('VS-', '')}`);
      }
      if (!roomStr) return json({ error: 'Oda bulunamadı.' }, 404, c.headers);

      return json({ ok: true, room: JSON.parse(roomStr) }, 200, c.headers);
    }

    if (path === '/api/multiplayer/invite/send') {
      const fromUserId = clean(body.fromUserId, 40);
      const fromUsername = clean(body.fromUsername, 40) || 'Arkadaşın';
      const toUserId = clean(body.toUserId, 40);
      const pin = clean(body.pin, 20).toUpperCase();
      const type = clean(body.type, 20) || 'kahoot';
      const deckTitle = clean(body.deckTitle, 80) || 'Rekabet Kapışması';
      if (!fromUserId || !toUserId || !pin || !env.LIMITS) {
        return json({ error: 'Eksik davet bilgisi.' }, 400, c.headers);
      }

      // Spam Koruması: Aynı kullanıcıdan 4 saniye içinde ardışık maç daveti engeli
      const spamKey = `spam_inv:${fromUserId}:${toUserId}`;
      const isSpam = await env.LIMITS.get(spamKey);
      if (isSpam) {
        return json({ error: 'Lütfen ardışık davet göndermeden önce birkaç saniye bekleyin.' }, 429, c.headers);
      }
      await env.LIMITS.put(spamKey, '1', { expirationTtl: 4 });

      const inviteObj = {
        id: 'inv_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        type: 'match_invite',
        matchType: type, // 'kahoot' / 'rekabet'
        fromUserId,
        fromUsername,
        toUserId,
        pin,
        deckTitle,
        sentAt: new Date().toISOString()
      };

      const inboxKey = `inbox:${toUserId}`;
      const existingStr = await env.LIMITS.get(inboxKey);
      let inbox = existingStr ? JSON.parse(existingStr) : [];
      if (!Array.isArray(inbox)) inbox = [];
      inbox.unshift(inviteObj);
      await env.LIMITS.put(inboxKey, JSON.stringify(inbox.slice(0, 30)), { expirationTtl: 86400 * 2 });

      return json({ ok: true, invite: inviteObj }, 200, c.headers);
    }

    if (path === '/api/multiplayer/room/start') {
      const pin = clean(body.pin, 20).toUpperCase();
      const hostId = clean(body.hostId, 40);
      if (!pin || !env.LIMITS) return json({ error: 'PIN eksik.' }, 400, c.headers);

      const roomStr = await env.LIMITS.get(`room:${pin}`);
      if (!roomStr) return json({ error: 'Oda bulunamadı.' }, 404, c.headers);

      const room = JSON.parse(roomStr);
      if (room.hostId !== hostId) return json({ error: 'Oyunu yalnızca oda sahibi başlatabilir.' }, 403, c.headers);

      room.status = 'active';
      room.currentQuestionIndex = 0;
      await env.LIMITS.put(`room:${pin}`, JSON.stringify(room), { expirationTtl: 7200 });

      return json({ ok: true, room }, 200, c.headers);
    }

    if (path === '/api/multiplayer/room/next_question') {
      const pin = clean(body.pin, 20).toUpperCase();
      const hostId = clean(body.hostId, 40);
      const nextIndex = Number(body.questionIndex);
      if (!pin || !env.LIMITS) return json({ error: 'PIN eksik.' }, 400, c.headers);

      const roomStr = await env.LIMITS.get(`room:${pin}`);
      if (!roomStr) return json({ error: 'Oda bulunamadı.' }, 404, c.headers);

      const room = JSON.parse(roomStr);
      if (room.hostId !== hostId) return json({ error: 'Yalnızca oda kurucusu sonraki soruya geçebilir.' }, 403, c.headers);

      room.currentQuestionIndex = typeof nextIndex === 'number' && !isNaN(nextIndex) ? nextIndex : (room.currentQuestionIndex + 1);
      await env.LIMITS.put(`room:${pin}`, JSON.stringify(room), { expirationTtl: 7200 });

      return json({ ok: true, room }, 200, c.headers);
    }

    if (path === '/api/multiplayer/room/close') {
      const pin = clean(body.pin, 20).toUpperCase();
      const hostId = clean(body.hostId, 40);
      if (!pin || !env.LIMITS) return json({ ok: true }, 200, c.headers);

      let roomStr = await env.LIMITS.get(`room:${pin}`);
      if (!roomStr && !pin.startsWith('VS-')) roomStr = await env.LIMITS.get(`room:VS-${pin}`);
      if (!roomStr && pin.startsWith('VS-')) roomStr = await env.LIMITS.get(`room:${pin.replace('VS-', '')}`);

      if (roomStr) {
        const room = JSON.parse(roomStr);
        room.status = 'closed';
        room.closedAt = new Date().toISOString();
        // 5 dakika boyunca 'closed' statüsü KV'de tutulur, böylece diğer katılımcıların döngüsü anında yakalar
        await env.LIMITS.put(`room:${pin}`, JSON.stringify(room), { expirationTtl: 300 });
        if (!pin.startsWith('VS-')) {
          await env.LIMITS.put(`room:VS-${pin}`, JSON.stringify(room), { expirationTtl: 300 });
        }
      }

      return json({ ok: true, status: 'closed' }, 200, c.headers);
    }

    if (path === '/api/clubs/decks/add_card') {
      const clubId = clean(body.clubId, 50);
      const deckId = clean(body.deckId, 60);
      const card = body.card;
      if (!clubId || !deckId || !card || !env.LIMITS) return json({ error: 'Geçersiz parametreler.' }, 400, c.headers);

      const clubStr = await env.LIMITS.get(`club:${clubId}`);
      if (!clubStr) return json({ error: 'Kulüp bulunamadı.' }, 404, c.headers);

      const clubObj = JSON.parse(clubStr);
      if (!Array.isArray(clubObj.decks)) clubObj.decks = [];
      const targetDeck = clubObj.decks.find(d => String(d.id) === String(deckId));
      if (!targetDeck) return json({ error: 'Kulüp destesi bulunamadı.' }, 404, c.headers);

      if (!Array.isArray(targetDeck.words)) targetDeck.words = [];
      targetDeck.words.push(card);
      await env.LIMITS.put(`club:${clubId}`, JSON.stringify(clubObj), { expirationTtl: 86400 * 90 });
      return json({ ok: true, deck: targetDeck, club: clubObj }, 200, c.headers);
    }

    if (path === '/api/multiplayer/room/submit_score') {
      const pin = clean(body.pin, 20).toUpperCase();
      const playerId = clean(body.playerId, 40);
      const points = Number(body.points) || 0;
      const questionIndex = Number(body.questionIndex) || 0;
      if (!pin || !playerId || !env.LIMITS) return json({ error: 'Eksik veri.' }, 400, c.headers);

      const roomStr = await env.LIMITS.get(`room:${pin}`);
      if (!roomStr) return json({ error: 'Oda bulunamadı.' }, 404, c.headers);

      const room = JSON.parse(roomStr);
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.score = (player.score || 0) + points;
        player.answers[questionIndex] = { points, isCorrect: points > 0, time: Date.now() };
        await env.LIMITS.put(`room:${pin}`, JSON.stringify(room), { expirationTtl: 7200 });
      }

      return json({ ok: true, room }, 200, c.headers);
    }

    // 14e. Ortak Deste Çalışması (İşbirlikçi Kart Ekleme / Düzenleme)
    if (path === '/api/decks/collaborate/sync') {
      const collabCode = clean(body.code, 20).toUpperCase();
      const action = clean(body.action, 20); // 'get', 'add_card', 'remove_card', 'update_card', 'init'
      const card = body.card;
      const cardIndex = typeof body.cardIndex === 'number' ? body.cardIndex : -1;
      const deckTitle = clean(body.title, 80) || 'Ortak Deste';
      const author = clean(body.author, 40) || 'Ortak';

      if (!collabCode || !env.LIMITS) return json({ error: 'İşbirliği kodu eksik.' }, 400, c.headers);

      let collabStr = await env.LIMITS.get(`collab:${collabCode}`);
      let collabObj = collabStr ? JSON.parse(collabStr) : null;

      if (!collabObj) {
        if (action === 'get') {
          return json({ error: 'Bu davet koduna ait aktif bir ortak deste bulunamadı.' }, 404, c.headers);
        }
        collabObj = {
          code: collabCode,
          title: deckTitle,
          cards: Array.isArray(body.cards) ? body.cards : [],
          contributors: [author],
          updatedAt: new Date().toISOString()
        };
      } else if (action === 'get' && author && !collabObj.contributors.includes(author)) {
        collabObj.contributors.push(author);
      }

      if (action === 'add_card' && card) {
        if (!collabObj.cards) collabObj.cards = [];
        collabObj.cards.push(card);
        if (!collabObj.contributors.includes(author)) collabObj.contributors.push(author);
        collabObj.updatedAt = new Date().toISOString();
      } else if (action === 'remove_card' && cardIndex >= 0 && Array.isArray(collabObj.cards)) {
        collabObj.cards.splice(cardIndex, 1);
        collabObj.updatedAt = new Date().toISOString();
      } else if (action === 'update_card' && cardIndex >= 0 && card && Array.isArray(collabObj.cards) && collabObj.cards[cardIndex]) {
        collabObj.cards[cardIndex] = { ...collabObj.cards[cardIndex], ...card };
        if (!collabObj.contributors.includes(author)) collabObj.contributors.push(author);
        collabObj.updatedAt = new Date().toISOString();
      }

      await env.LIMITS.put(`collab:${collabCode}`, JSON.stringify(collabObj), { expirationTtl: 86400 * 30 });
      return json({ ok: true, collab: collabObj }, 200, c.headers);
    }

    // 15. Hızlı ve Ücretsiz Çeviri Proxy (Google Translate & MyMemory - 0 Token, 0 Maliyet)
    if (path === '/api/translate') {
      const text = clean(body.q || body.text, 2000);
      const sl = clean(body.sl, 10) || 'auto';
      const tl = clean(body.tl, 10) || 'de';
      if (!text) return json({ ok: true, translation: '' }, 200, c.headers);

      // 1. Google Translate Web API (0 Token)
      try {
        const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
        const gRes = await fetch(gUrl, { signal: AbortSignal.timeout(4000) });
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData && gData[0]) {
            const translation = gData[0].map(x => x[0]).join('').trim();
            const detectedLang = gData[2] || sl;
            return json({ ok: true, translation, detectedLang }, 200, c.headers);
          }
        }
      } catch (_) {}

      // 2. MyMemory Fallback (0 Token)
      try {
        const pair = `${sl === 'auto' ? 'tr' : sl}|${tl}`;
        const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`;
        const mmRes = await fetch(mmUrl, { signal: AbortSignal.timeout(4000) });
        if (mmRes.ok) {
          const data = await mmRes.json();
          let translation = data?.responseData?.translatedText || '';
          if (translation && !translation.includes('MYMEMORY WARNING')) {
            translation = translation.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
            return json({ ok: true, translation }, 200, c.headers);
          }
        }
      } catch (_) {}

      return json({ ok: false, translation: '' }, 200, c.headers);
    }

    return json({ error: 'Geçersiz API uç noktası.' }, 404, c.headers);
  } catch (err) {
    return json({ error: 'Sunucu hatası: ' + err.message }, 500, c.headers);
  }
}

export default {
  async fetch(req, env) {
    const c = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });
    if (!c.ok) return json({ error: 'forbidden' }, 403, c.headers);
    if (req.method !== 'POST') return json({ error: 'not found' }, 404, c.headers);

    const path = new URL(req.url).pathname;
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Geçersiz istek gövdesi.' }, 400, c.headers);

    // Database / Auth Proxy Endpointleri (Token limitinden muaftır)
    if (path.startsWith('/api/')) {
      return await handleDatabaseApi(path, body, env, c);
    }

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const blocked = await overLimit(env, ip);
    if (blocked) return json({ error: blocked }, 429, c.headers);

    // 1. /coach/analyze (AI Deste Oluşturma için içerik analizi)
    if (path === '/coach/analyze') {
      const parts = buildParts(body);
      if (!parts) return json({ error: 'İçerik boş veya çok büyük.' }, 400, c.headers);
      const out = sanitizeAnalyze(await callGemini(env, ANALYZE_SYSTEM, ANALYZE_SCHEMA, parts));
      return out ? json(out, 200, c.headers) : json({ error: 'İçerik incelenemedi.' }, 502, c.headers);
    }

    // 2. /coach/deck (Sadece sözlük uyumlu deste oluşturma)
    if (path === '/coach/deck') {
      const extra = `KULLANICI TALİMATI: ${clean(body.instruction, MAX_INSTRUCTION) || '(genel deste kelimeleri)'}`;
      const parts = buildParts(body, extra);
      if (!parts) return json({ error: 'İçerik boş veya çok büyük.' }, 400, c.headers);
      const out = sanitizeDeck(await callGemini(env, DECK_SYSTEM, DECK_SCHEMA, parts));
      return out && out.words.length ? json(out, 200, c.headers) : json({ error: 'Kelime çıkarılamadı.' }, 502, c.headers);
    }

    // 3. /coach/ocr (Akıllı Okuyucu için görselden Almanca metin ayıklama)
    if (path === '/coach/ocr') {
      const file = body.file;
      if (!file || !ALLOWED_MIME.includes(file.mime) || !file.data) {
        return json({ error: 'Geçerli bir görsel veya belge gönderin.' }, 400, c.headers);
      }
      const parts = [{ inline_data: { mime_type: file.mime, data: file.data } }, { text: 'Bu görseldeki Almanca metni çıkar.' }];
      const out = await callGemini(env, OCR_SYSTEM, OCR_SCHEMA, parts, 3000);
      return out && out.text ? json({ text: clean(out.text, MAX_TEXT) }, 200, c.headers) : json({ error: 'Görselden metin okunamadı.' }, 502, c.headers);
    }

    // 4. /coach/chat (İnteraktif Almanca Koçu, Akademik Çalışma & Oyun/Alıştırma Üretimi)
    if (path === '/coach/chat') {
      const message = clean(body.message, 2000);
      const contextText = typeof body.contextText === 'string' ? clean(body.contextText, 15000) : '';
      const userLevel = clean(body.userLevel, 10) || 'B1';
      const action = clean(body.action, 50);

      const contents = [];
      const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
      for (const h of history) {
        if (h && h.text && (h.role === 'user' || h.role === 'model')) {
          contents.push({ role: h.role, parts: [{ text: clean(h.text, 800) }] });
        }
      }

      const promptParts = [];
      if (body.file && ALLOWED_MIME.includes(body.file.mime) && body.file.data) {
        promptParts.push({ inline_data: { mime_type: body.file.mime, data: body.file.data } });
      }
      let promptText = `Kullanıcı Seviyesi: ${userLevel}\n`;
      if (contextText) promptText += `Üzerinde Çalışılan Metin:\n${contextText}\n\n`;
      if (action) promptText += `İstenen Eylem: ${action}\n`;
      if (message) promptText += `Kullanıcı Mesajı: ${message}`;
      promptParts.push({ text: promptText });

      contents.push({ role: 'user', parts: promptParts });

      const out = sanitizeCoachChat(await callGemini(env, COACH_CHAT_SYSTEM, COACH_CHAT_SCHEMA, contents, 3500));
      return out ? json(out, 200, c.headers) : json({ error: 'Koç yanıt veremedi.' }, 502, c.headers);
    }

    return json({ error: 'not found' }, 404, c.headers);
  },
};
