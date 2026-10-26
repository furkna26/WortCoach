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

      // Kendi desteleri ise direkt ver
      if (targetUserId === currentUserId) {
        const dRes = await sbFetch(`/rest/v1/decks?owner_id=eq.${targetUserId}&select=id,title,words_json,created_at`);
        const decks = await dRes.json().catch(() => []);
        return json({ ok: true, decks: Array.isArray(decks) ? decks : [] }, 200, c.headers);
      }

      // Hedef kullanıcının gizlilik ayarını kontrol et
      const pRes = await sbFetch(`/rest/v1/profiles?id=eq.${targetUserId}&select=deck_privacy`);
      const pList = await pRes.json().catch(() => []);
      const privacy = (Array.isArray(pList) && pList[0]) ? pList[0].deck_privacy : 'friends';

      if (privacy === 'private') {
        return json({ ok: true, decks: [], privacyNotice: 'Kullanıcı destelerini gizli tutuyor.' }, 200, c.headers);
      }

      if (privacy === 'friends') {
        // Arkadaşlık kontrolü
        const fRes = await sbFetch(`/rest/v1/friendships?status=eq.accepted&or=(and(requester_id.eq.${currentUserId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${currentUserId}))&select=id`);
        const fList = await fRes.json().catch(() => []);
        if (!Array.isArray(fList) || fList.length === 0) {
          return json({ ok: true, decks: [], privacyNotice: 'Desteler yalnızca arkadaşlar tarafından görülebilir.' }, 200, c.headers);
        }
      }

      const dRes = await sbFetch(`/rest/v1/decks?owner_id=eq.${targetUserId}&select=id,title,words_json,created_at`);
      const decks = await dRes.json().catch(() => []);
      return json({ ok: true, decks: Array.isArray(decks) ? decks : [] }, 200, c.headers);
    }

    // 14. Deste Kaydet
    if (path === '/api/decks/save') {
      const ownerId = clean(body.ownerId, 40);
      const title = clean(body.title, 80) || 'Yeni Deste';
      const words = Array.isArray(body.words) ? body.words : [];
      if (!ownerId) return json({ error: 'Kullanıcı kimliği eksik.' }, 400, c.headers);

      await sbFetch('/rest/v1/decks', {
        method: 'POST',
        body: JSON.stringify({ owner_id: ownerId, title, words_json: words })
      });
      return json({ ok: true }, 200, c.headers);
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
