# WortCoach Edge Proxy — Cloudflare Worker Yapay Zeka Vekil Katmanı

Bu dizin, WortCoach İlerici Web Uygulamasının (PWA) büyük dil modeli (Google Gemini 2.5 Flash) ve çok modlu belge analizi isteklerini güvenli, durumsuz (*stateless*) ve şema doğrulamalı olarak yöneten Cloudflare Worker kenar vekil sunucusunu (`worker.js`) içerir.

---

## 1. Mimari Görevler ve Güvenlik Modeli

1. **API Anahtarı İzolasyonu:** `GEMINI_KEY` kimlik bilgisi istemci kodunda veya genel Git deposunda yer almaz; yalnızca Cloudflare Worker çalışma zamanında şifreli ortam değişkeni (*Secret*) olarak tutulur.
2. **Köken Doğrulaması (CORS & Origin Enforcement):** `wrangler.toml` içinde tanımlanan `ALLOWED_ORIGIN` kuralı uyarınca yalnızca yetkili istemci alan adlarından ve yerel geliştirme ortamlarından (`localhost` / `127.0.0.1`) gelen HTTP `POST` ve `OPTIONS` istekleri kabul edilir.
3. **Kayan Pencere Hız Sınırlandırması (Sliding-Window Rate Limiting):** İstemci IP adresi (`CF-Connecting-IP`) başına dakikada en fazla 20 istek sınırı uygulanarak servis kötüye kullanımı ve kota aşımı engellenir.
4. **Girdi Temizleme ve Boyut Denetimi (Payload Sanitization):** Metin girdileri karakter sınırlarına göre kırpılır; çok modlu dosya eklerinde yalnızca izin verilen MIME türleri (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`) ve maksimum boyut sınırı (6 MB Base64) kabul edilir.
5. **Deterministik JSON Şema Zorlaması (`responseSchema`):** Gemini API çağrılarında `responseMimeType: "application/json"` ve katı `responseSchema` tanımları kullanılarak model çıktılarının her zaman istemcinin beklediği veri yapısında olması garanti altına alınır.

---

## 2. API Uç Noktaları (Endpoints)

### 2.1. `POST /coach/deck` — Belgeden / Metinden Deste ve Egzersiz Üretimi
Yüklenen PDF, görsel veya metin girdisini analiz ederek iki farklı modda yapılandırılmış kart kümesi (`DECK_SCHEMA`) döndürür:
- **`deckMode: "word"` (Kelime Destesi):** Metindeki Almanca kelimeleri kanonik sözlük köklerine (*Lemma*), artikellerine (`der`, `die`, `das`), çoğul eklerine, sözcük türlerine (`NOUN`, `VERB`, `ADJ`, `ADV`, `PHRASE`), Türkçe karşılıklarına ve bağlamsal ipuçlarına dönüştürür.
- **`deckMode: "quiz"` (Quiz Destesi / Sätze bilden):** Kelime çevirisi yapmaksızın belgedeki bilgileri doğrudan **Soru (`lemma`)**, **Cevap (`contextMeaning`)** ve **Ek Bilgi (`sourceSentence`)** formatında bilgi kartlarına veya sentaktik cümle kurma egzersizlerine dönüştürür.

### 2.2. `POST /coach/analyze` — Morfolojik ve Sentaktik Metin Analizi
Verilen Almanca cümle veya paragrafı CEFR seviyesine, cümle bazlı Türkçe çevirilerine, gramer kurallarına (zaman, hal, edat, yan cümle yapıları) ve önemli kelimelerin kök/çekim tablolarına (`ANALYZE_SCHEMA`) ayrıştırır.

### 2.3. `POST /coach/chat` — Etkileşimli Almanca Dil Koçu ve Cümle Değerlendirme
Kullanıcının CEFR seviyesine ve geçmiş sohbet bağlamına göre pedagojik yanıt (`reply`) ve etkileşimli alıştırma nesnesi (`exercise`: `CLOZE`, `MATCHING`, `GRAMMAR`, `DECK`, `NONE`) döndürür. Ayrıca *Sätze bilden* modülündeki kullanıcı cümlelerinin gramer ve çekim kontrolünü yürütür.

---

## 3. Kurulum ve Dağıtım Komutları

```bash
cd worker

# Cloudflare hesabınızla kimlik doğrulaması yapın
npx wrangler login

# Google Gemini API anahtarını güvenli Secret olarak kaydedin
npx wrangler secret put GEMINI_KEY

# Worker'ı Cloudflare küresel kenar ağına dağıtın
npx wrangler deploy
```
