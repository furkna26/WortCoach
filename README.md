# WortCoach — Morfolojik Almanca Sözlük, Akustik Fonetik Analiz ve İnteraktif Dil Edinimi Platformu

WortCoach; Almanca (DE) kelime edinimi, morfolojik ve sentaktik çözümleme, akustik fonetik telaffuz değerlendirmesi, aralıklı tekrarlama (Leitner Spaced Repetition System) ve eşzamanlı çok oyunculu öğrenme süreçlerini bütünleşik bir yapıda sunan kapsamlı bir dil edinimi platformudur.

Bu doküman, uygulama içerisinde yer alan modüllerin dilbilimsel, pedagojik ve algoritmik çalışma prensiplerini detaylı olarak açıklamaktadır.

---

## İçindekiler

1. [Morfolojik Sözlük, Kök Çözümleme ve Gramer Zenginleştirme Modülü](#1-morfolojik-sözlük-kök-çözümleme-ve-gramer-zenginleştirme-modülü)
2. [Akustik Fonetik ve Telaffuz Değerlendirme Modülü (Telaffuz Koçu)](#2-akustik-fonetik-ve-telaffuz-değerlendirme-modülü-telaffuz-koçu)
3. [Leitner Aralıklı Tekrarlama Sistemi (Spaced Repetition System — SRS)](#3-leitner-aralıklı-tekrarlama-sistemi-spaced-repetition-system--srs)
4. [Koç ile Deste Oluşturma Modülü (Kelime Destesi ve Quiz Destesi)](#4-koç-ile-deste-oluşturma-modülü-kelime-destesi-ve-quiz-destesi)
5. [Sätze bilden — Sentaktik Cümle Kurma ve Kelime Kısıt Denetimi Modülü](#5-sätze-bilden--sentaktik-cümle-kurma-ve-kelime-kısıt-denetimi-modülü)
6. [İnteraktif Alıştırma ve Oyun Modülleri](#6-interaktif-alıştırma-ve-oyun-modülleri)
7. [Almanca Dil Koçu (Diyalog ve Dinamik Alıştırma Modülü)](#7-almanca-dil-koçu-diyalog-ve-dinamik-alıştırma-modülü)
8. [Nöral Çeviri ve Akıllı Okuma Modülü](#8-nöral-çeviri-ve-akıllı-okuma-modülü)
9. [Sosyal Öğrenme, Rekabetçi Düello, Ortak Deste ve ELO Derecelendirme Modülü](#9-sosyal-öğrenme-rekabetçi-düello-ortak-deste-ve-elo-derecelendirme-modülü)

---

## 1. Morfolojik Sözlük, Kök Çözümleme ve Gramer Zenginleştirme Modülü

Ana sayfa üzerinde yer alan arama ve sözlük motoru, girilen bir kelimeyi yalnızca yüzeysel çevirisiyle değil, tam morfolojik ve sentaktik envanteriyle çözümler.

### 1.1. Kanonik Kök Çözümleme (Lemmatization ve Stemming)
- **Çoğuldan Tekile İndirgeme:** Kullanıcı bir ismin çoğul halini (örneğin *Häuser*, *Bücher*, *Lehrerinnen*) arattığında sistem; *Umlaut* ses değişimlerini (`ä -> a`, `ö -> o`, `ü -> u`) ve çoğul soneklerini (`-e`, `-en`, `-er`, `-nen`, `-s`) analiz ederek kelimeyi kanonik tekil köküne (*Haus*, *Buch*, *Lehrerin*) ve doğru tanımlık artikeline (`der`, `die`, `das`) yönlendirir.
- **Çekimli Fiilden Mastara İndirgeme:** Şimdiki zaman (*Präsens*), geçmiş zaman (*Präteritum*) veya ortaç (*Partizip II*) halinde aratılan fiiller (örneğin *erfasste*, *gegangen*, *nimmt*) otomatik olarak mastar (*Infinitiv*) köküne (*erfassen*, *gehen*, *nehmen*) bağlanır.

### 1.2. İsim ve Fiil Morfolojisi Tabloları
- **İsim Envanteri (*Nomen*):** Her isim için cinsiyet artikeli (`der` Maskulin, `die` Feminin, `das` Neutrum), çoğul eki (*Pluralform*) ve CEFR seviye sınıflandırması (A1–C1) sunulur.
- **Fiil Çekim Matrisi (*Stammformen*):** Fiiller için üç temel zaman kökü (*Präsens 3. tekil şahıs*, *Präteritum*, *Partizip II*), Perfekt yapısında kullanılan yardımcı fiil (`haben` veya `sein`), ayrılabilir ön ek (*trennbares Präfix*) durumu ve dönüşlülük (*Reflexivität: sich*) bilgisi iki sütunlu çekim tablosunda gösterilir.

### 1.3. Edat-Hal Yönetimi (*Rektion*), Nüans ve Kelime Ailesi Analizi
- **Rektion (Fiil ve Sıfatların Yönettiği Edat ve Haller):** Fiilin veya sıfatın hangi edat ve hangi ismin haliyle (*Akkusativ, Dativ, Genitiv*) kullanıldığını (örneğin *sich hüten vor + Dativ*, *warten auf + Akkusativ*) yapılandırılmış rozetlerle belirtir.
- **Kullanım Düzeyi (*Stilebene*) ve Karıştırılan Kelimeler (*Verwechslungsgefahr*):** Kelimenin akademik (*bildungssprachlich*), resmi (*gehoben*) veya günlük konuşma diline (*umgangssprachlich*) ait olduğunu işaretler; yazılışı veya anlamı birbirine yakın kelimeler arasındaki farkları açıklar.
- **Eş Anlamlılar (*Synonyme*) ve Kelime Ailesi (*Wortfamilie*):** OpenThesaurus entegrasyonu ile kelimenin eş anlamlılarını ve aynı kökten türeyen kelimeleri tıklanabilir çipler halinde listeler.
- **Çoklu Anlam Seçimi ve Özel Anlam Ekleme:** Kullanıcı, sözlükte listelenen Türkçe ve İngilizce anlamlardan dilediklerini seçerek veya kendi özel anlam notunu (`+ Anlam Ekle`) girerek kelimeyi bağlamsal örnek cümleleriyle birlikte doğrudan hedef destesine kaydedebilir.

---

## 2. Akustik Fonetik ve Telaffuz Değerlendirme Modülü (Telaffuz Koçu)

Telaffuz Koçu, kullanıcının mikrofon aracılığıyla seslendirdiği Almanca kelimeleri veya tam örnek cümleleri akustik sinyal işleme ve derin öğrenme modelleriyle hece ve fonem (sesbirim) düzeyinde değerlendirir.

### 2.1. Fonetik Haritalama ve Türkçe Okunuş Rehberi
- Hedef kelime veya cümle önce hecelerine ayrılır ve her hecenin Uluslararası Fonetik Alfabe (IPA) karşılığı çıkarılır.
- Almancaya özgü ses dizilimleri (*ch*, *sch*, *sp*, *st*, *eu/äu*, *ei*, *ie*, uzun ünlüler ve *Umlaut* sesleri) analiz edilerek Türkçedeki en yakın ses değerleriyle adım adım okunuş rehberi ve artikülasyon ipuçları oluşturulur.

### 2.2. Dört Katmanlı Akustik Değerlendirme Motoru
Kullanıcı, telaffuz analizinde aşağıdaki dört farklı motordan birini seçebilir:
1. **Hibrit Ensemble Motoru (MFA Viterbi + Wav2Vec2 CTC + Akustik DSP):** Zorlamalı hizalama, nöral akustik olasılık dağılımı ve spektral enerji analizini birleştirerek en dengeli puanlamayı üretir.
2. **Wav2Vec2 Neural CTC Posterior Motoru:** Tarayıcı içinde çalışan derin öğrenme modeli aracılığıyla ses çerçevelerinin fonem olasılık dağılımlarını (*Connectionist Temporal Classification*) hesaplar.
3. **Montreal Forced Aligner (MFA Viterbi HMM-GOP) Motoru:** Hedef kelimenin IPA fonem dizilimini kullanıcının ses kaydıyla Viterbi dinamik programlama algoritması üzerinden zorlamalı olarak hizalar (*Forced Alignment*). Her bir fonemin ses kaydı içinde hangi milisaniye aralığında (`startMs–endMs`) söylendiğini ve *Goodness of Pronunciation (GOP)* doğruluk oranını tespit eder.
4. **Microsoft Azure Speech GOP Motoru:** Bulut tabanlı referans akustik model üzerinden telaffuz değerlendirmesi gerçekleştirir.

### 2.3. Çok Boyutlu Skorlama ve Akustik Geri Bildirim
Her ses kaydı sonunda üç temel metrik hesaplanır:
- **Fonem Doğruluğu (*Accuracy*):** Harf ve sesbirimlerin hedef IPA fonemleriyle akustik örtüşme yüzdesi.
- **Prozodi ve Vurgu (*Prosody*):** Kelime içi birincil hece vurgusunun (*Wortakzent*) ve perde (*Pitch*) konturunun doğruluğu.
- **Akıcılık (*Fluency*):** Konuşma hızı, heceler arası süreklilik ve duraksama oranı.

Hatalı veya düşük puanlı fonemler renk kodlarıyla (yeşil, sarı, kırmızı) işaretlenir ve hangi sesin nasıl düzeltilmesi gerektiğine dair spesifik artikülasyon geri bildirimi sunulur.

---

## 3. Leitner Aralıklı Tekrarlama Sistemi (Spaced Repetition System — SRS)

Öğrenilen kelimelerin ve bilgi kartlarının kısa süreli bellekten uzun süreli belleğe aktarılması için 5 aşamalı Leitner aralıklı tekrarlama algoritması kullanılır.

### 3.1. Dinamik Kutu ve Tekrar Periyotları
Her kart, kullanıcının hatırlama başarısına göre 1 ile 5 arasındaki kutular arasında hareket eder:
- **Kutu 1:** Yeni eklenen veya yanlış yanıtlanan kartlar (Tekrar aralığı: **1 gün**).
- **Kutu 2:** İlk tekrarı başarılı olan kartlar (Tekrar aralığı: **2 gün**).
- **Kutu 3:** Orta düzeyde pekişmiş kartlar (Tekrar aralığı: **4 gün**).
- **Kutu 4:** Güçlü bellek izine sahip kartlar (Tekrar aralığı: **7 gün**).
- **Kutu 5:** Uzun süreli belleğe yerleşmiş kartlar (Tekrar aralığı: **14 gün**).

### 3.2. Çalışma Akışı ve Bilişsel Takip
- Kullanıcı bir kartı doğru hatırladığında kart bir üst kutuya terfi eder ve bir sonraki tekrar tarihi ilgili kutunun gün aralığına göre ileri taşınır.
- Yanlış yanıtlanan kartlar anında **Kutu 1** düzeyine geri döner ve ertesi gün tekrar çalışma kuyruğuna dahil edilir.
- Ana sayfa üzerindeki gösterge paneli; o gün tekrar zamanı gelmiş (*Due*) kart sayısını, günlük hedef ilerlemesini ve kesintisiz çalışma serisini (*Streak*) gerçek zamanlı olarak takip eder.

---

## 4. Koç ile Deste Oluşturma Modülü (Kelime Destesi ve Quiz Destesi)

Bu modül, kullanıcının yüklediği ders materyallerini (PDF belgeleri, Word `.docx` dosyaları, `.txt` metinleri, kitap/defter fotoğrafları veya doğrudan yapıştırılan metinler) analiz ederek iki farklı yapıda çalışma destesine dönüştürür:

### 4.1. Kelime Destesi Modu
- Yüklenen belgedeki Almanca kelimeleri tespit eder ve her birini çekimsiz sözlük köküne (*Lemma*) dönüştürür.
- İsimler için doğru artikeli ve çoğul ekini, fiiller için mastar halini ve sözcük türünü (`NOUN`, `VERB`, `ADJ`, `ADV`, `PHRASE`) belirler.
- Kartın ön yüzüne Almanca kelimeyi, arka yüzüne Türkçe anlamını ve alt bilgi alanına belgeden çıkarılan bağlamsal ipuçlarını veya örnek cümleyi yerleştirir.

### 4.2. Quiz Destesi Modu (Soru - Cevap - Ek Bilgi)
- Kelime çevirisi yapmaz; yüklenen belgedeki olgusal, kavramsal, tarihsel veya coğrafi bilgileri doğrudan soru-cevap kartlarına dönüştürür.
- **Ön Yüz (Soru):** Belgedeki bilgiyi ölçen net soru veya kavram (örneğin bir eyalet adı, tarihsel bir olay veya felsefi bir soru).
- **Arka Yüz (Cevap):** Sorunun belgedeki doğrudan ve net cevabı (örneğin eyaletin başkenti veya ilgili filozofun adı).
- **Ek Bilgi (İpuçları ve Bağlamsal Detaylar):** Belgede ilgili kavramla bağlantılı geçen ek istatistikler, tarihler veya tamamlayıcı bilgiler (örneğin nüfus bilgisi, dönem özellikleri veya eser adları) kartın ipucu alanına otomatik olarak eklenir.

---

## 5. Sätze bilden — Sentaktik Cümle Kurma ve Kelime Kısıt Denetimi Modülü

*Sätze bilden* modülü, dağınık ve çekimsiz olarak verilen kelimelerden kurallı, çekimlenmiş Almanca cümleler inşa etme becerisini geliştirmek üzere tasarlanmış yazma tabanlı bir çalışma sistemidir.

### 5.1. Çalışma Yapısı ve 27 Yerleşik Egzersiz
- Kullanıcıya bir hedef fiil veya deyim kalıbı (örneğin *jemandem auf die Schulter klopfen*, *einbiegen in etwas*, *Maßnahmen treffen*, *sich vor etwas hüten*, *sich tief über etwas beugen*) ve `/` işaretiyle ayrılmış dağınık, çekimsiz kelimeler verilir:
  - İsimler yalın (*Nominativ*) halde,
  - Fiiller mastar (*Infinitiv*) halde,
  - Sıfatlar eksiz yalın halde,
  - Edatlar çekimsiz halde sunulur.
- Kullanıcı, tıklanabilir kelime çiplerinden yararlanarak veya doğrudan yazarak kelimeleri uygun sıraya dizer; fiil çekimlerini (*Konjugation*), ismin hallerini (*Nominativ, Akkusativ, Dativ, Genitiv*) ve sıfat tamlaması eklerini (*Adjektivdeklination*) uygulayarak tam cümleyi yazar.
- Sistem içerisinde B1–C1 seviyesinde 27 adet kapsamlı hazır egzersiz yer alır.

### 5.2. Sıkı Kelime Kısıt Denetçisi
Kurulan cümlenin değerlendirilmesinde iki temel kısıt deterministik olarak denetlenir:
1. **Tüm Verilen Kelimeleri Kullanma Zorunluluğu:** Verilen `/` ayrılmış listedeki her bir kelimenin (düzensiz fiil kök değişimleri, ayrılabilen fiil önekleri, `-el/-er` sıfat düşmeleri ve `im`, `am`, `beim`, `zum`, `zur` gibi edat-artikel kaynaşmaları dahil) cümlede kullanılıp kullanılmadığı kontrol edilir. Verilen kelimelerden herhangi biri kullanılmamışsa sistem eksik kelimeleri listeler ve cümleyi doğru kabul etmez.
2. **Listede Olmayan Kelime Ekleme Yasağı:** Kullanıcının veya değerlendirme motorunun verilen kelime listesi dışından cümleye ekstra kelime (listede bulunmayan zarf, sıfat, bağlaç veya fiil) eklemesi engellenir.

### 5.3. Çoklu Doğru Cevap ve Söz Dizimi (*Wortstellung*) Değerlendirmesi
Almancada aynı kelime kümesiyle birden fazla geçerli söz dizimi (*Vorfeld / Mittelfeld* yer değiştirmeleri), zaman çekimi (*Präsens, Präteritum, Perfekt*) ve sıfat-isim eşleştirmesi kurulabilir. Değerlendirme motoru, kelime kısıtlarını eksiksiz sağlayan tüm gramerce doğru alternatif dizilimleri doğru kabul eder; `0–100` arası puan, cümlenin kusursuz hali, alternatif bir doğru dizilim ve detaylı Türkçe gramer analizi sunar.

### 5.4. Belgeden / Metinden Cümle Dağıtıcı
Kullanıcı kendi ders notunu, PDF/DOCX belgesini veya metnini yüklediğinde sistem metindeki Almanca cümleleri seçer; dışarıdan hiçbir kelime eklemeden cümlenin kendi kelimelerini yalın/mastar (*Nominativ / Infinitiv*) hallerine indirger ve `/` ile ayırıp rastgele karıştırarak doğrudan oynanabilir yeni bir *Sätze bilden* egzersiz setine dönüştürür.

---

## 6. İnteraktif Alıştırma ve Oyun Modülleri

Çalış sekmesi altında, kullanıcının seçtiği bir veya birden fazla destedeki kartları dinamik soru havuzuna dönüştüren sekiz farklı interaktif oyun yer alır:

1. **Kablo ile Anlam Eşleştirme:** Sol sütundaki Almanca kelimeleri (veya Quiz sorularını) sağ sütundaki Türkçe anlamlarına (veya cevaplarına) renkli kübik Bézier kablolarıyla bağlama üzerine kurulu görsel eşleştirme oyunu.
2. **Artikel Testi:** İsimlerin doğru tanımlık artikelini (`der`, `die`, `das`) bulmaya yönelik hızlı refleks testi.
3. **Fiil Çekim Quiz:** Fiillerin *Präsens*, *Präteritum*, *Partizip II* ve yardımcı fiil (`hat` / `ist`) çekimlerini ölçen morfoloji testi.
4. **İsim Çoğul Testi:** Tekil verilen isimlerin doğru çoğul (*Plural*) formunu seçmeye dayalı alıştırma.
5. **Kelime Anlam Testi:** Almanca kelimenin Türkçe karşılığını veya Quiz sorusunun doğru cevabını çoktan seçmeli şıklar arasından bulma testi.
6. **Ters Çeviri:** Türkçe anlamı verilen kavramın doğru Almanca karşılığını bulma testi.
7. **Cümle Boşluk Doldurma (*Cloze Test*):** Örnek cümle içerisinden çıkarılan hedef kelimeyi bağlama göre doğru tamamlama alıştırması.
8. **Karma Sınav:** Tüm soru tiplerini tek bir oturumda harmanlayan kapsamlı değerlendirme modu.

Tüm oyunlar **Süresiz** modda veya **Zamanla Yarış** (30 saniye, 1 dakika, 2 dakika, 3 dakika) modunda oynanabilir; ardışık doğru yanıtlar seri kombo çarpanı (x2.5 kata kadar) kazandırır.

---

## 7. Almanca Dil Koçu (Diyalog ve Dinamik Alıştırma Modülü)

Almanca Dil Koçu, kullanıcının seçtiği CEFR seviyesine (A1–C1) göre çalışan etkileşimli bir dilbilgisi ve çalışma asistanıdır:
- **Gramer ve Belge İnceleme:** Kullanıcının sorduğu gramer kurallarını, cümle yapılarını veya sohbet ekranına yüklediği PDF, DOCX ve görsel belgeleri analiz ederek Türkçe açıklamalarla yanıtlar.
- **Sohbet İçi Dinamik Alıştırma Üretimi:** Konuşulan konu veya yüklenen belge üzerinden anında tam ekran oynanabilen **Boşluk Doldurma (*Cloze*)**, **Gramer Analizi**, **Kelime Eşleştirme** ve **Çoktan Seçmeli Quiz** alıştırmaları üretir.

---

## 8. Nöral Çeviri ve Akıllı Okuma Modülü

### 8.1. Çok Dilli Bağlamsal Çeviri
- Almanca (`DE`), Türkçe (`TR`) ve İngilizce (`EN`) dilleri arasında çift yönlü çeviri sağlar.
- Çevrilen ifadeyi sesli telaffuz (TTS) ile dinleme ve tek tıkla yeni bir kelime kartı olarak desteye ekleme imkanı sunar.

### 8.2. Akıllı Okuma ve Belge İnceleme
- Kullanıcının yüklediği PDF, DOCX veya metin belgelerini etkileşimli bir okuma ekranına dönüştürür.
- Metin içerisindeki her bir kelime tıklanabilir yapıdadır: Kullanıcı okuma yaparken bilmediği bir kelimeye tıkladığında alt panelde kelimenin kanonik kökü, artikeli, Türkçe anlamı ve tüm cümlenin çevirisi anında açılır; kullanıcı okumayı bölmeden kelimeyi seçtiği desteye kaydedebilir.

---

## 9. Sosyal Öğrenme, Rekabetçi Düello, Ortak Deste ve ELO Derecelendirme Modülü

Bireysel çalışmaları topluluk etkileşimiyle destekleyen çok oyunculu modüller şunlardır:

- **Canlı Çok Oyunculu Bilgi Yarışması (PIN Kodlu Odalar):** Bir kullanıcının kendi destesinden veya genel havuzdan oluşturduğu 6 haneli oda PIN kodu ile birden fazla katılımcının aynı anda zamana karşı yarıştığı canlı sınav odaları.
- **Birebir Rekabetçi Düello:** Arkadaş listesindeki kullanıcılarla gerçek zamanlı kelime ve bilgi düelloları.
- **İşbirlikçi Ortak Deste Çalışması (`COL-XXXX`):** Oluşturulan işbirliği kodu üzerinden birden fazla kullanıcının aynı anda ortak bir desteye kelime veya soru kartı eklemesi ve tamamlanan desteyi kendi kütüphanelerine kaydetmesi.
- **Çalışma Kulüpleri ve Topluluk Kütüphanesi:** Kulüp üyelerinin ortak desteler oluşturabildiği, kendi aralarında sohbet edebildiği ve topluluk tarafından paylaşılan açık desteleri kendi cihazlarına indirebildiği paylaşım ağı.
- **Dinamik ELO ve Lig Sistemi:** Alıştırmalar, oyunlar ve canlı düellolardaki doğruluk oranı, yanıt süresi ve kelime zorluğuna göre hesaplanan ELO puanı ile *Bronz, Gümüş, Altın, Platin, Elmas* ve *Usta* liglerinde kademe ilerlemesi.
