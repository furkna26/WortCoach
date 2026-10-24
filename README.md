# WortCoach 🇩🇪 — Akıllı Almanca Kelime & Sözlük Koçu

Modern, hızlı, çevrimdışı destekli (PWA) Almanca öğrenme, morfolojik sözlük, çeviri ve Leitner Flashcard uygulaması.

---

## ✨ Özellikler

- 🔍 **Canlı & Morfolojik Sözlük**:
  - Akıllı isim artikel eşleştirme (`der`, `die`, `das`).
  - İsim çoğul halleri (*Pluralformen*).
  - Fiil zaman ve şahıs çekimleri (*Präsens, Präteritum, Perfekt*).
  - Sıfat halleri, zıt anlamlılar ve gerçek örnek cümleler.
  - Canlı internet sözlük taraması ve yazım yanlışı (typo) toleransı.
- 🗣️ **Almanca Kilitli TTS (Text-to-Speech)**:
  - Yüksek kaliteli doğal Almanca telaffuz.
- 🗂️ **Leitner Flashcard & SRS**:
  - Aralıklı tekrar sistemi (Spaced Repetition System).
  - Tek tıkla karta dönüştürme ve kelime düzenleme.
- 🎮 **Eğitici Mini Oyunlar**:
  - 🔌 Neon Kablo ile Anlam Eşleştirme (*Cable Match*)
  - 🔵 Artikel Testi (`der / die / das`)
  - 🟣 Fiil Çekim Quiz
  - 🟢 İsim Çoğul Testi
  - 🟡 Sıfat & Zıt Anlam Testi
  - 🔴 Kalıp & İfade Testi
  - ⚪ Karışık Quiz
- 🌐 **Çeviri**:
  - Almanca ⇄ Türkçe çift yönlü anlık çeviri motoru.
- 📲 **PWA & Offline Desteği**:
  - iOS ve Android ana ekrana eklenebilir, internetsiz çalışır.

---

## 🚀 GitHub Pages Üzerinde Yayınlama

Bu proje %100 istemci taraflı (client-side) statik bir Progressive Web App (PWA) olarak tasarlandığı için GitHub Pages üzerinde doğrudan çalışır:

1. Bu depoyu GitHub'a yükleyin (`git push origin main`).
2. GitHub deponuzda **Settings** > **Pages** menüsüne gidin.
3. **Build and deployment** başlığı altında:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (veya `master`) / `/ (root)` seçin.
4. **Save** butonuna tıklayın. 1-2 dakika içinde `https://<kullanıcı-adınız>.github.io/<repo-adınız>/` adresinde yayına girecektir.

---

## 💻 Yerel Geliştirme (Local Dev)

Bilgisayarınızda veya yerel Wi-Fi ağınızda test etmek için:

```bash
# Python ile yerel sunucuyu başlatın
python server.py
```

Konsolda görünen `http://localhost:8080` veya mobil cihazınız için yerel IP adresini tarayıcınızda açabilirsiniz.
