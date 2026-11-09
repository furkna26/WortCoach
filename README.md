# WortCoach — Hesaplamalı Almanca Morfolojik Sözlük, Akustik Fonetik Değerlendirme ve Aralıklı Tekrarlama Platformu

WortCoach; Almanca (DE) kelime edinimi, morfolojik ve sentaktik çözümleme, akustik fonetik telaffuz değerlendirmesi, aralıklı tekrarlama (Leitner Spaced Repetition System) ve gerçek zamanlı çok oyunculu öğrenme süreçlerini tek bir çatı altında birleştiren, çevrimdışı öncelikli (Offline-First) bir İlerici Web Uygulamasıdır (Progressive Web Application — PWA).

Sistem; tarayıcı içi ilişkisel indeksleme (IndexedDB), kenar bilişim tabanlı üretken yapay zeka vekil katmanı (Cloudflare Workers + Google Gemini 2.5 Flash), gerçek zamanlı veri eşzamanlama altyapısı (Supabase PostgreSQL & Realtime) ve tarayıcı içi sinyal işleme / derin öğrenme modellerini (Wav2Vec2 Neural CTC, Montreal Forced Aligner Viterbi HMM-GOP) bütünleşik bir mimaride çalıştırır.

---

## İçindekiler

1. [Sistem Mimarisi ve Çalışma Prensipleri](#1-sistem-mimarisi-ve-çalışma-prensipleri)
2. [Temel Modüller ve Algoritmik Bileşenler](#2-temel-modüller-ve-algoritmik-bileşenler)
3. [Veri Katmanı, Güvenlik ve Eşzamanlama Altyapısı](#3-veri-katmanı-güvenlik-ve-eşzamanlama-altyapısı)
4. [Teknoloji Yığını ve Açık Veri Lisansları](#4-teknoloji-yığını-ve-açık-veri-lisansları)
5. [Proje Dizin Yapısı](#5-proje-dizin-yapısı)
6. [Kurulum, Yapılandırma ve Dağıtım](#6-kurulum-yapılandırma-ve-dağıtım)

---

## 1. Sistem Mimarisi ve Çalışma Prensipleri

WortCoach, düşük gecikme süresi ve çevrimdışı erişilebilirlik sağlamak amacıyla üç katmanlı hibrit bir mimari üzerine inşa edilmiştir:

```
+-----------------------------------------------------------------------------------+
|                        İSTEMCİ KATMANI (Tarayıcı / PWA)                           |
|  - IndexedDB (wmDB): Desteler, Kartlar, Leitner Kutu Durumları, Özel Anlamlar     |
|  - Service Worker (sw.js): Network-First & Cache Fallback Önbellekleme            |
|  - Morfoloji Motoru: Offline Sözlük + Wiktionary / OpenThesaurus / Tatoeba API    |
|  - Akustik DSP & ONNX: Wav2Vec2 CTC Posterior + MFA Viterbi Zorlamalı Hizalama    |
+-----------------------------------------+-----------------------------------------+
                                          |
                     +--------------------+--------------------+
                     |                                         |
                     v                                         v
+----------------------------------------+   +--------------------------------------+
|   KENAR VEKİL KATMANI (Edge Worker)    |   |   GERÇEK ZAMANLI VERİ KATMANI        |
|   Cloudflare Workers (worker.js)       |   |   Supabase PostgreSQL & Realtime     |
|  - CORS & Origin Doğrulaması           |   |  - Satır Düzeyinde Güvenlik (RLS)    |
|  - IP Bazlı Kayan Pencere Hız Sınırı   |   |  - ELO Sıralama & Rekabetçi Odalar   |
|  - Gemini 2.5 Flash Yapılandırılmış    |   |  - İşbirlikçi Deste Düzenleme        |
|    JSON Şema Zorlaması (responseSchema)|   |  - Kulüp Ortak Desteleri & Web Push  |
+----------------------------------------+   +--------------------------------------+
```

### 1.1. İstemci Öncelikli Çevrimdışı Çalışma (Offline-First Execution)
Uygulamanın çekirdek sözlük, fiil çekimi, kart yönetimi ve alıştırma modülleri herhangi bir ağ bağlantısına ihtiyaç duymaksızın tarayıcı içinde çalışır:
- **Yerel Veritabanı (`js/db.js`):** Tarayıcı içi `IndexedDB` üzerinde `decks`, `cards`, `study_logs` ve `settings` nesne depolarını yönetir.
- **Gömülü Morfolojik Veri Kümesi (`js/offlineDictionary.js`, `js/curatedPacks.js`):** CEFR A1 seviyesinden C1 seviyesine kadar binlerce Almanca kelimeyi; cinsiyet artikelleri (`der`, `die`, `das`), çoğul ekleri, fiil çekim kökleri ve Türkçe/İngilizce karşılıklarıyla yerel bellekte tutar.
- **Hizmet Çalışanı (`sw.js`):** Statik uygulama kabuğunu (`CORE_ASSETS`) önbelleğe alır; yerel varlıklar için *Network-First with Cache Fallback*, harici dilbilimsel API çağrıları için *Network-Only Pass-through* stratejisi uygular.

### 1.2. Kenar Bilişim ve Yapay Zeka Vekil Sunucusu (`worker/worker.js`)
İstemci tarafında hiçbir API anahtarı barındırılmaz. Tüm büyük dil modeli (LLM) ve çok modlu belge analizi istekleri Cloudflare Workers üzerinde çalışan vekil sunucu üzerinden yürütülür:
- **Şema Zorlamalı Çıktı Denetimi (`responseSchema`):** Google Gemini (`gemini-2.5-flash`) modelinden dönen yanıtlar deterministik JSON şemalarına (`DECK_SCHEMA`, `ANALYZE_SCHEMA`, `COACH_CHAT_SCHEMA`) zorlanır.
- **Çok Modlu Belge İşleme (Multimodal Ingestion):** PDF belgeleri, görseller (JPEG/PNG/WebP), DOCX (`Mammoth.js` ile istemcide ayrıştırılan ham metin) ve düz metin girdileri doğrudan analiz edilerek yapılandırılmış veri kümelerine dönüştürülür.

---

## 2. Temel Modüller ve Algoritmik Bileşenler

### 2.1. Hesaplamalı Morfoloji, Sözlük ve Gramer Zenginleştirme (`js/dictionary.js`, `js/verbHelper.js`, `js/grammarEnrichment.js`)
Kullanıcının aradığı çekimlenmiş veya çoğul bir kelimeyi kanonik sözlük köküne (*Lemma*) indirgeyen çok aşamalı bir çözümleme hattı içerir:
1. **Kanonik Kök Çözümleme (Lemmatization & Stemming):**
   - Çoğul isim aramaları (*Umlaut* değişimleri ve `-e`, `-en`, `-er`, `-nen`, `-s` sonekleri dahil) otomatik olarak tekil (*Singular*) forma ve doğru tanımlık artikeline (`der`, `die`, `das`) eşlenir.
   - Çekimlenmiş fiil formları (*Präsens*, *Präteritum*, *Partizip II*) mastar (*Infinitiv*) köküne bağlanır.
2. **Fiil Morfolojisi (`js/verbHelper.js`):**
   - Fiillerin üç temel zaman kökünü (*Stammformen*: *Präsens 3. tekil şahıs*, *Präteritum*, *Partizip II*), yardımcı fiil seçimini (`haben` / `sein`), ayrılabilir ön ek (*trennbares Präfix*) yapısını ve dönüşlülük (*Reflexivität: sich*) durumunu tablolaştırır.
3. **Gramer Zenginleştirme ve Edat Yönetimi (`js/grammarEnrichment.js`):**
   - Fiil ve sıfatların yönettiği hal ve edat kalıplarını (*Rektion*: örn. *warten auf + Akkusativ*, *sich hüten vor + Dativ*, *wegen + Genitiv*), dil kullanım katmanlarını (*Stilebene*: *gehoben*, *umgangssprachlich*, *bildungssprachlich*) ve sıklıkla karıştırılan kelimeleri (*Verwechslungsgefahr*) tespit eder.
4. **Canlı Açık Veri Federasyonu:**
   - Yerel sözlük sonuçları eşzamanlı olarak **Wiktionary REST/MediaWiki API**, **OpenThesaurus API** (*Synonyme* ve *Wortfamilie* ağacı) ve **Tatoeba Corpus API** (bağlamsal örnek cümleler) ile zenginleştirilir.

### 2.2. Aralıklı Tekrarlama Sistemi — Leitner SRS (`js/study.js`, `js/stats.js`)
Bellek kalıcılığını maksimize etmek için 5 kutulu Leitner algoritması uygulanmıştır:
- **Kutu 1 (Yeni / Zorlanan Kartlar):** Günlük tekrar periyodu (1 gün).
- **Kutu 2:** 2 günlük tekrar aralığı.
- **Kutu 3:** 4 günlük tekrar aralığı.
- **Kutu 4:** 7 günlük tekrar aralığı.
- **Kutu 5 (Uzun Süreli Bellek):** 14 günlük tekrar aralığı.
- Kart bazlı doğruluk oranı, tepki süresi (milisaniye) ve günlük seri (*Streak*) metrikleri yerel ve bulut profilinde izlenir.

### 2.3. Akustik Fonetik ve Telaffuz Değerlendirme Motoru (`js/pronunciation.js`)
Kullanıcının mikrofon aracılığıyla seslendirdiği Almanca kelime ve cümleleri fonem ve hece düzeyinde değerlendiren dört farklı motor seçeneği sunar:
1. **Hibrit Ensemble Motoru (`HYBRID_ENSEMBLE`):** MFA Viterbi hizalaması, Wav2Vec2 CTC olasılık dağılımı ve spektral akustik DSP metriklerini ağırlıklı olarak birleştirir.
2. **Wav2Vec2 Neural CTC Posterior (`WAV2VEC2_CTC`):** Tarayıcı içinde WebAssembly / ONNX Runtime üzerinden çalışan derin öğrenme modeliyle ses çerçevelerinin fonem olasılık dağılımlarını (*Connectionist Temporal Classification*) hesaplar.
3. **Montreal Forced Aligner — MFA Viterbi HMM-GOP (`MFA_FORCED_ALIGN`):** Hedef kelimenin Uluslararası Fonetik Alfabe (IPA) dizilimini akustik çerçevelerle Viterbi dinamik programlama algoritması üzerinden zorlamalı olarak hizalar (*Forced Alignment*); her fonemin başlangıç-bitiş milisaniye aralığını (`startMs`–`endMs`) ve *Goodness of Pronunciation (GOP)* skorunu üretir.
4. **Microsoft Azure Speech GOP (`AZURE_CLOUD`):** İsteğe bağlı olarak kullanıcının kendi Azure Speech API anahtarıyla bulut tabanlı referans telaffuz değerlendirmesi yapar.

Sistem; Almancaya özgü fonetik yapıları (*Ich-Laut* `/ç/`, *Ach-Laut* `/x/`, *Uvular-R* `/ʁ/`, uzun/kısa ünlüler, *Umlaut* yuvarlaklaştırmaları `/yː/`, `/øː/` ve kelime sonu ötümsüzleşmesi *Auslautverhärtung*) analiz ederek Türkçe telaffuz rehberi ve düzeltici geri bildirim üretir.

### 2.4. Koç İle Deste Oluşturma: Kelime Destesi ve Quiz Destesi (`js/deckBuilder.js`)
Yüklenen ders notları, kitap sayfaları (PDF, DOCX, TXT veya fotoğraf/görsel) iki ayrı çalışma modunda işlenir:
1. **Kelime Destesi Modu (`word`):** Metindeki Almanca kelimeleri yalın (*Lemma*) hallerine dönüştürür; artikel, çoğul eki, sözcük türü (`NOUN`, `VERB`, `ADJ`, `ADV`, `PHRASE`), Türkçe karşılık ve belgeden alınan ek ipuçlarıyla birlikte kelime kartlarına çevirir.
2. **Quiz Destesi Modu (`quiz`):** Kelime çevirisi yapmaz; belgedeki olgusal, kavramsal veya tarihsel/coğrafi bilgileri doğrudan **Soru (Ön Yüz)**, **Cevap (Arka Yüz)** ve **Ek Bilgi (İpuçları ve Bağlamsal Detaylar)** formatında bilgi kartlarına dönüştürür. Oluşturulan Quiz desteleri hem kart tekrarında hem de çoktan seçmeli oyunlarda ve AI Dil Koçu sohbetlerinde doğrudan kullanılabilir.

### 2.5. Sätze bilden — Dağınık ve Çekimsiz Kelimelerden Cümle Kurma (`js/satzBuilder.js`)
İleri seviye (B1–C1) Almanca söz dizimi (*Wortstellung*) ve morfolojik çekim pratiği için tasarlanmış yazma tabanlı bir modüldür:
- **Çalışma Prensibi:** Kullanıcıya bir hedef fiil/deyim kalıbı (örn. *jemandem auf die Schulter klopfen*, *sich vor etwas hüten*, *Maßnahmen treffen*) ile birlikte cümleyi oluşturan tüm kelimeler çekimsiz, yalın/mastar (*Nominativ / Infinitiv*) halde ve `/` işaretiyle ayrılmış karışık sırada verilir.
- **Sıkı Kelime Kısıt Denetçisi (`auditWordUsage`):**
  - **Eksik Kelime Denetimi (`missingWords`):** Verilen listedeki her bir öğenin (düzensiz fiil kök değişimleri, ayrılabilen fiil önekleri, `-el/-er` sıfat düşmeleri ve `im/am/beim/zum/zur` edat kaynaşmaları dahil) kurulan cümlede kullanılıp kullanılmadığını deterministik olarak denetler. Verilen kelimelerden herhangi biri kullanılmadığında cümle doğru kabul edilmez.
  - **Olmayan Kelime Yasağı (`extraWords` & `sanitizeAiSuggestedSentence`):** Kullanıcının veya yapay zekanın verilen kelime havuzu dışından cümleye ekstra kelime (listede bulunmayan zarf, bağlaç, sıfat veya fiil) eklemesini engeller.
- **Esnek Söz Dizimi Değerlendirmesi:** Almancada aynı kelime kümesiyle birden fazla geçerli öge dizilimi (*Vorfeld / Mittelfeld* yer değiştirmeleri) ve zaman çekimi mümkün olduğundan, kelime kısıtlarını sağlayan cümleler yapay zeka tarafından gramer, hal (*Nominativ, Akkusativ, Dativ, Genitiv*) ve sıfat çekimi (*Adjektivdeklination*) açısından değerlendirilir.
- **Belgeden / Metinden Cümle Dağıtıcı (`extractScrambledSentencesFromDoc`):** Kullanıcının yüklediği belge veya metindeki cümleleri dışarıdan kelime eklemeden yalın/mastar bileşenlerine ayırıp karıştırarak yeni *Sätze bilden* egzersiz setleri üretir.

### 2.6. İnteraktif Oyunlar ve Alıştırmalar (`js/game.js`)
- **Kablo ile Anlam Eşleştirme (`CABLE_MATCH`):** SVG katmanı üzerinde dinamik kübik Bézier eğrileriyle Almanca kelimeleri Türkçe anlamlarına veya Quiz sorularını cevaplarına bağlayan görsel eşleştirme oyunu.
- **7 Temel Dilbilgisi ve Kelime Testi:** Artikel Testi (`ARTICLE`), Fiil Çekim Quiz (`VERB`), İsim Çoğul Testi (`NOUN`), Kelime Anlam Testi (`MEANING`), Ters Çeviri (`REVERSE`), Boşluk Doldurma (`SENTENCE_CLOZE`) ve Karma Sınav (`MIXED`).

### 2.7. Almanca Dil Koçu (`js/coach.js`) ve Akıllı Okuma (`js/translator.js`)
- **AI Dil Koçu (`#tab-coach`):** Kullanıcının CEFR seviyesine (A1–C1) göre gramer sorularını yanıtlayan, yüklenen belgeleri analiz eden ve sohbet içinde etkileşimli alıştırmalar (*Cloze Test*, *Gramer Analizi*, *Eşleştirme*, *Quiz Soruları*) üreten diyalog modülü.
- **Akıllı Okuma (`#tab-reader`):** PDF, DOCX ve metin dosyalarını satır ve kelime bazında tıklanabilir bir okuma arayüzüne dönüştürür; metin içinde tıklanan herhangi bir kelimenin morfolojik analizini ve bağlamsal çevirisini anında gösterir ve tek tıkla hedef desteye kaydeder.

---

## 3. Veri Katmanı, Güvenlik ve Eşzamanlama Altyapısı

### 3.1. Sosyal Özellikler, Rekabetçi Düello ve ELO Sistemi (`js/social.js`, `supabase/schema.sql`)
Supabase PostgreSQL ve Realtime Broadcast kanalları üzerinden aşağıdaki çok oyunculu işlevler yürütülür:
- **Canlı Rekabetçi Düello ve Kahoot Odaları:** 6 haneli PIN kodu ile oluşturulan eşzamanlı yarışma odaları, anlık skor tablosu ve tepki süresine dayalı puanlama.
- ** İşbirlikçi Ortak Deste Düzenleme (`COL-XXXX`):** Birden fazla kullanıcının aynı anda ortak bir kelime veya quiz destesine kart eklemesi ve kendi yerel kütüphanelerine aktarması.
- **Akademik Çalışma Kulüpleri:** Kulüp içi ortak desteler, üye sıralamaları ve gerçek zamanlı sohbet.
- **ELO Derecelendirme Algoritması:** Soru zorluğu, tepki süresi ve kombo serilerine göre dinamik ELO puanı ve lig terfi sistemi (*Bronz, Gümüş, Altın, Platin, Elmas, Usta*).
- **Web Push Bildirimleri:** Service Worker `push` ve `notificationclick` olayları üzerinden düello davetlerine doğrudan bildirim üzerinden katılma veya reddetme desteği.

### 3.2. Otomatik Veritabanı Sürekliliği (Keep-Alive Pipeline)
Ücretsiz katman bulut veritabanlarının hareketsizlik nedeniyle duraklatılmasını önlemek amacıyla `.github/workflows/supabase-keepalive.yml` altında tanımlı GitHub Actions iş akışı, her 72 saatte bir REST API üzerinden hafif bir sağlık sorgusu (`HEAD / SELECT`) çalıştırarak veritabanını aktif tutar.

---

## 4. Teknoloji Yığını ve Açık Veri Lisansları

| Katman | Teknoloji / Standart | Kullanım Amacı |
| :--- | :--- | :--- |
| **İstemci Çekirdeği** | Vanilla JavaScript (ES2022+), HTML5, CSS3 | Çerçevesiz (Zero-Framework), yüksek performanslı SPA/PWA mimarisi |
| **Yerel Depolama** | IndexedDB (`wmDB`) & Web Storage API | Çevrimdışı kart, deste, Leitner SRS ve kullanıcı ayarları yönetimi |
| **Çevrimdışı Ağ Katmanı** | Service Worker API & Web App Manifest | Çevrimdışı çalışma, varlık önbellekleme ve Web Push bildirimleri |
| **Kenar Bilişim (Edge)** | Cloudflare Workers (`worker/worker.js`) | API anahtarı izolasyonu, CORS koruması, hız sınırlama ve şema doğrulaması |
| **Üretken Yapay Zeka** | Google Gemini API (`gemini-2.5-flash`) | Çok modlu belge/görsel analizi, deste üretimi, gramer ve cümle değerlendirmesi |
| **Bulut Veritabanı** | Supabase (PostgreSQL, Auth, Realtime) | Kullanıcı profilleri, ELO liderlik tablosu, canlı düello ve ortak desteler |
| **Fonetik & Akustik DSP** | Web Audio API, Wav2Vec2 ONNX, MFA Viterbi | Hece/fonem bazlı telaffuz değerlendirmesi ve milisaniye hizalaması |
| **Belge Ayrıştırma** | Mozilla `PDF.js` (v3.11) & `Mammoth.js` (v1.6) | İstemci taraflı PDF ve DOCX metin çıkarımı |
| **Sözlük & Morfoloji** | Wiktionary API (CC BY-SA 4.0) | Kanonik artikel, çoğul eki, IPA ve fiil çekim doğrulaması |
| **Eş Anlamlılar Ağı** | OpenThesaurus API (LGPL) | *Synonyme* (eş anlamlılar) ve *Wortfamilie* (kelime ailesi) verileri |
| **Örnek Cümle Derlemi** | Tatoeba Corpus (CC BY 2.0 FR) | Doğrulanmış Almanca-Türkçe/İngilizce örnek cümle çiftleri |

---

## 5. Proje Dizin Yapısı

```text
WortCoach/
├── index.html                  # Ana uygulama kabuğu, görünümler (Tabs) ve modal şablonları
├── manifest.json               # PWA uygulama bildirimi (Standalone ekran ve ikon tanımları)
├── sw.js                       # Service Worker (Önbellek yönetimi ve Web Push dinleyicileri)
├── server.py                   # Yerel geliştirme için çok iş parçacıklı HTTP sunucusu
├── css/
│   ├── app.css                 # Ana düzen, karanlık/aydınlık tema değişkenleri ve tipografi
│   └── components.css          # Kartlar, modallar, oyun arenası ve bileşen stilleri
├── js/
│   ├── config.js               # Çalışma zamanı yapılandırması ve API uç noktası tanımları
│   ├── db.js                   # IndexedDB (wmDB) veri erişim katmanı
│   ├── offlineDictionary.js    # Çevrimdışı morfolojik Almanca-Türkçe sözlük veritabanı
│   ├── dictionary.js           # Kök çözümleme, canlı Wiktionary/Tatoeba/OpenThesaurus federasyonu
│   ├── verbHelper.js           # Fiil çekim tabloları ve düzensiz fiil kök motoru
│   ├── grammarEnrichment.js    # Rektion (edat/hal), Stilebene ve nüans zenginleştirme modülü
│   ├── curatedPacks.js         # Hazır CEFR (A1-C1) kelime paketleri
│   ├── seeder.js               # İlk kurulum veritabanı tohumlama modülü
│   ├── study.js                # 5 kutulu Leitner aralıklı tekrarlama (SRS) motoru
│   ├── game.js                 # Kablo eşleştirme ve 7 temel gramer/kelime quiz motoru
│   ├── satzBuilder.js          # Sätze bilden cümle kurma oyunu, sıkı kelime denetçisi ve belge dağıtıcı
│   ├── deckBuilder.js          # Yapay zeka destekli Kelime Destesi ve Quiz Destesi üretim modülü
│   ├── coach.js                # Yapay zeka destekli Almanca Dil Koçu sohbet ve alıştırma motoru
│   ├── pronunciation.js        # Wav2Vec2 CTC, MFA Viterbi ve Akustik DSP telaffuz analizörü
│   ├── translator.js           # Nöral çeviri ve Akıllı Okuma (PDF/DOCX/Metin) modülü
│   ├── tts.js                  # Web SpeechSynthesis Almanca seslendirme yöneticisi
│   ├── stats.js                # Öğrenme istatistikleri ve performans analitiği
│   ├── social.js               # Supabase kimlik doğrulama, ELO, canlı düello, kulüp ve ortak deste modülü
│   └── app.js                  # Ana uygulama orkestratörü, yönlendirici (Router) ve UI denetleyicisi
├── worker/
│   ├── worker.js               # Cloudflare Worker Gemini API vekil sunucusu ve JSON şema denetleyicisi
│   ├── wrangler.toml           # Cloudflare Worker dağıtım yapılandırması
│   └── README.md               # Kenar vekil sunucusu teknik dokümantasyonu
├── supabase/
│   └── schema.sql              # PostgreSQL tabloları, RLS güvenlik politikaları ve RPC fonksiyonları
└── .github/
    └── workflows/
        └── supabase-keepalive.yml # Veritabanı sürekliliğini sağlayan zamanlanmış GitHub Actions işi
```

---

## 6. Kurulum, Yapılandırma ve Dağıtım

### 6.1. Yerel Geliştirme Ortamında Çalıştırma
Uygulama herhangi bir derleme (build/bundler) adımına ihtiyaç duymaz. Service Worker ve ES modüllerinin doğru çalışması için yerel bir HTTP sunucusu üzerinden sunulması yeterlidir:

```bash
# Depoyu klonlayın
git clone https://github.com/furkna26/WortCoach.git
cd WortCoach

# Python tabanlı yerel geliştirme sunucusunu başlatın (Varsayılan port: 3000)
python server.py 3000
```

Tarayıcınızdan `http://localhost:3000` adresine giderek uygulamayı çalıştırabilirsiniz.

### 6.2. Cloudflare Worker (Yapay Zeka Vekil Sunucusu) Dağıtımı
Gemini API anahtarı istemci koduna yazılmaz; yalnızca Cloudflare Worker üzerinde şifreli ortam değişkeni (*Secret*) olarak tanımlanır:

```bash
cd worker
npx wrangler login
npx wrangler secret put GEMINI_KEY
npx wrangler deploy
```

`worker/wrangler.toml` dosyasındaki `ALLOWED_ORIGIN` değişkeni, yalnızca yetkili alan adlarından gelen isteklere izin verecek şekilde yapılandırılır.

### 6.3. Supabase Veritabanı Kurulumu
Çok oyunculu düello, kulüp ve ortak deste özelliklerini kendi Supabase projenizde etkinleştirmek için:
1. Supabase SQL Editor üzerinde `supabase/schema.sql` dosyasını çalıştırarak tabloları, indeksleri ve Satır Düzeyinde Güvenlik (RLS) politikalarını oluşturun.
2. `js/social.js` içindeki `SUPABASE_URL` ve `SUPABASE_ANON_KEY` sabitlerini kendi proje bilgilerinizle güncelleyin.

---

## Lisans ve Atıf

- Uygulama kaynak kodu açık kaynaklı eğitim ve araştırma amaçlı geliştirilmiştir.
- Sözlük morfoloji verileri **Wiktionary (Creative Commons Attribution-ShareAlike 4.0 International — CC BY-SA 4.0)**, örnek cümle derlemleri **Tatoeba (CC BY 2.0 FR)** ve eş anlamlı kelime ağları **OpenThesaurus (LGPL)** lisansları kapsamında kullanılmaktadır.
