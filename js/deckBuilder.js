/**
 * WortCoach - Koç ile Deste Oluşturma (AI Deste Motoru)
 * İki Bağımsız Mod:
 *   1. Kelime Destesi (word): Metin, Görsel (OCR), PDF, DOCX -> Sözlük Zenginleştirmeli Almanca-Türkçe Kelime Destesi
 *   2. Quiz Destesi (quiz): Belge, Tablo, Notlar -> Soru-Cevap / Ön Yüz - Arka Yüz Bilgi Kartları (Sözlükten bağımsız)
 * Sıfır emoji, kurumsal, pedagojik ve yüksek performanslı mimari.
 */

(function () {
  const $ = (id) => document.getElementById(id);
  const EMOJI_RE = /[\p{Extended_Pictographic}\u200d\ufe0f]/gu;
  const cleanStr = (s) => String(s || '').replace(EMOJI_RE, '').trim();

  const MAX_PDF_BYTES = 4.5 * 1024 * 1024;
  const MAX_IMG_SIDE = 1600;

  const POS_LABEL = {
    NOUN: 'İsim (Nomen)',
    VERB: 'Fiil (Verb)',
    ADJ: 'Sıfat (Adjektiv)',
    ADV: 'Zarf (Adverb)',
    PHRASE: 'Kalıp (Wendung)',
    QUIZ: 'Soru - Cevap'
  };
  const POS_CARD = {
    NOUN: 'NOUN',
    VERB: 'VERB',
    ADJ: 'ADJECTIVE',
    ADV: 'ADVERB',
    PHRASE: 'OTHER',
    QUIZ: 'QUIZ'
  };

  const DEFAULT_SUGGESTIONS = {
    word: [
      'Metindeki önemli isim ve fiilleri çıkar',
      'B1-B2 seviyesi akademik kelimeleri seç',
      'Sıfatları ve kalıp ifadeleri desteye ekle'
    ],
    quiz: [
      'Belgedeki bilgileri soru, cevap ve ek bilgi kartına çevir',
      'Önemli kişi, olay ve tarihleri soru-cevap yap',
      'Temel bilgileri ve ekstra ipuçlarını quiz yap'
    ]
  };

  const state = {
    mode: 'word', // 'word' | 'quiz'
    file: null,
    fileName: '',
    busy: false,
    byMode: {
      word: {
        words: [],
        deckTitle: '',
        analysis: null,
        instruction: ''
      },
      quiz: {
        words: [],
        deckTitle: '',
        analysis: null,
        instruction: ''
      }
    }
  };

  function currentModeState() {
    return state.byMode[state.mode];
  }

  function toast(msg) {
    if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(msg);
  }

  function setStatus(msg, isError = false) {
    const el = $('deck-builder-status');
    if (!el) return;
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.color = isError ? 'var(--palette-red)' : 'var(--brand-blue-hover)';
  }

  function getBuildBtnLabel() {
    return state.mode === 'quiz' ? 'Quiz Destesi Oluştur' : 'Kelime Destesi Oluştur';
  }

  function setBusy(busy, btnText = null) {
    state.busy = busy;
    const btnPick = $('btn-deck-builder-pick');
    const btnAnalyze = $('btn-deck-builder-analyze');
    const btnBuild = $('btn-deck-builder-build');
    const btnSave = $('btn-deck-builder-save');
    const tabWord = $('tab-btn-deck-mode-word');
    const tabQuiz = $('tab-btn-deck-mode-quiz');

    if (btnPick) btnPick.disabled = busy;
    if (btnAnalyze) btnAnalyze.disabled = busy;
    if (tabWord) tabWord.disabled = busy;
    if (tabQuiz) tabQuiz.disabled = busy;
    if (btnBuild) {
      btnBuild.disabled = busy;
      if (btnText && busy) {
        btnBuild.innerHTML = `<span class="spinner-border spinner-border-sm" style="display:inline-block; width:14px; height:14px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 0.6s linear infinite; margin-right:8px;"></span><span>${btnText}</span>`;
      } else {
        btnBuild.innerHTML = `<span id="btn-deck-builder-build-text">${getBuildBtnLabel()}</span>`;
      }
    }
    if (btnSave) btnSave.disabled = busy;
  }

  // Mod Değiştirme (Kelime Destesi <-> Quiz Destesi)
  function switchDeckMode(newMode) {
    if (state.busy) return;
    if (newMode !== 'word' && newMode !== 'quiz') return;

    // Mevcut modun girdi durumunu kaydet
    const prev = currentModeState();
    const instEl = $('deck-builder-instruction');
    const nameEl = $('deck-builder-deck-name');
    if (instEl) prev.instruction = instEl.value;
    if (nameEl && prev.words.length > 0) prev.deckTitle = nameEl.value;

    state.mode = newMode;
    const cur = currentModeState();
    const isQuiz = newMode === 'quiz';

    // Sekme butonlarını güncelle
    const btnWord = $('tab-btn-deck-mode-word');
    const btnQuiz = $('tab-btn-deck-mode-quiz');
    if (btnWord && btnQuiz) {
      if (!isQuiz) {
        btnWord.style.border = '1px solid var(--brand-blue)';
        btnWord.style.background = 'var(--accent-primary-soft)';
        btnWord.style.color = 'var(--text-primary)';
        btnWord.querySelector('span:first-child').style.color = 'var(--brand-blue-hover)';

        btnQuiz.style.border = '1px solid transparent';
        btnQuiz.style.background = 'transparent';
        btnQuiz.style.color = 'var(--text-secondary)';
        btnQuiz.querySelector('span:first-child').style.color = 'var(--text-secondary)';
      } else {
        btnQuiz.style.border = '1px solid #F59E0B';
        btnQuiz.style.background = 'rgba(245, 158, 11, 0.14)';
        btnQuiz.style.color = 'var(--text-primary)';
        btnQuiz.querySelector('span:first-child').style.color = '#FBBF24';

        btnWord.style.border = '1px solid transparent';
        btnWord.style.background = 'transparent';
        btnWord.style.color = 'var(--text-secondary)';
        btnWord.querySelector('span:first-child').style.color = 'var(--text-secondary)';
      }
    }

    // Başlık & Bilgi Şeridini Güncelle
    const subtitleEl = $('deck-builder-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = isQuiz
        ? 'Belge, görsel veya metinden Soru - Cevap - Ek Bilgi kartları üretin'
        : 'Yapay zeka ile belge, görsel veya metinden sözlük uyumlu kelime destesi üretin';
    }

    const bannerEl = $('deck-builder-mode-banner');
    if (bannerEl) {
      if (isQuiz) {
        bannerEl.style.background = 'rgba(245, 158, 11, 0.09)';
        bannerEl.style.borderColor = 'rgba(245, 158, 11, 0.28)';
        bannerEl.innerHTML = '<strong style="color:#FBBF24;">Quiz Destesi Modu:</strong> Kelime çevirisi yapmaz; doğrudan <strong>Soru, Cevap ve Ek Bilgi</strong> şeklinde kartlara dönüştürür.';
      } else {
        bannerEl.style.background = 'rgba(59, 130, 246, 0.08)';
        bannerEl.style.borderColor = 'rgba(59, 130, 246, 0.22)';
        bannerEl.innerHTML = '<strong style="color:var(--brand-blue-hover);">Kelime Destesi Modu:</strong> Yüklediğiniz metin veya belgedeki Almanca kelimeleri yalın halleriyle (artikel, çekim ve Türkçe anlamlarıyla) sözlük uyumlu kelime kartlarına dönüştürür.';
      }
    }

    const textInput = $('deck-builder-text-input');
    if (textInput) {
      textInput.placeholder = 'Metni buraya yapıştırın veya bir görsel, PDF, DOCX ya da TXT dosyası yükleyin...';
    }

    const sugLabel = $('deck-builder-suggestions-label');
    if (sugLabel) {
      sugLabel.textContent = isQuiz ? 'Önerilen Quiz Talimatları:' : 'Önerilen Kelime Destesi Talimatları:';
    }

    const instLabel = $('deck-builder-instruction-label');
    if (instLabel) {
      instLabel.textContent = 'ÖZEL TALİMAT (İSTEĞE BAĞLI)';
    }

    if (instEl) {
      instEl.value = cur.instruction || '';
      instEl.placeholder = isQuiz
        ? 'Örn: Belgedeki önemli bilgileri soru, cevap ve ek bilgi kartlarına dönüştür...'
        : 'Örn: Bu metindeki A2-B1 seviyesi fiil ve isimleri desteye çevir...';
    }

    const buildBtnText = $('btn-deck-builder-build-text');
    if (buildBtnText) {
      buildBtnText.textContent = getBuildBtnLabel();
    }

    setStatus('');

    // Analiz kartını bu modun verisiyle güncelle
    renderAnalysisPanel();

    // Sonuç kartını bu modun verisiyle güncelle
    if (cur.words && cur.words.length > 0) {
      if (nameEl) nameEl.value = cur.deckTitle || (isQuiz ? 'Quiz Destesi' : 'Koç Destesi');
      renderWords();
      $('deck-builder-result')?.classList.remove('hidden');
    } else {
      $('deck-builder-result')?.classList.add('hidden');
    }
  }

  function renderAnalysisPanel() {
    const cur = currentModeState();
    const isQuiz = state.mode === 'quiz';
    const hasInput = Boolean(($('deck-builder-text-input')?.value || '').trim() || state.file);
    const analysisCard = $('deck-builder-analysis');
    if (!analysisCard) return;

    if (!cur.analysis && !hasInput) {
      analysisCard.classList.add('hidden');
      return;
    }

    analysisCard.classList.remove('hidden');
    const typeEl = $('deck-builder-type');
    const levelEl = $('deck-builder-level');
    const sumEl = $('deck-builder-summary');

    if (cur.analysis) {
      if (typeEl) typeEl.textContent = cur.analysis.contentType || (isQuiz ? 'Bilgi Belgesi' : 'Belge');
      if (levelEl) levelEl.textContent = cur.analysis.estimatedLevel || (isQuiz ? 'Quiz' : 'B1');
      if (sumEl) {
        sumEl.textContent = cur.analysis.summary || '';
        sumEl.classList.remove('hidden');
      }
    } else {
      if (typeEl) typeEl.textContent = isQuiz ? 'Soru - Cevap Modu' : 'Kelime Modu';
      if (levelEl) levelEl.textContent = isQuiz ? 'Ön / Arka Yüz' : 'A1 - C1';
      if (sumEl) {
        sumEl.textContent = isQuiz
          ? 'İçeriği inceletebilir veya doğrudan aşağıdan ön yüz / arka yüz kurgusunu seçerek Quiz Destesi oluşturabilirsiniz.'
          : 'İçeriği inceletebilir veya doğrudan aşağıdan talimat seçerek Kelime Destesi oluşturabilirsiniz.';
        sumEl.classList.remove('hidden');
      }
    }

    const sugWrap = $('deck-builder-suggestions');
    if (sugWrap) {
      sugWrap.innerHTML = '';
      const list = (cur.analysis && Array.isArray(cur.analysis.suggestions) && cur.analysis.suggestions.length > 0)
        ? cur.analysis.suggestions
        : DEFAULT_SUGGESTIONS[state.mode];

      list.forEach((sugText) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'coach-quick-btn';
        btn.textContent = sugText;
        btn.addEventListener('click', () => {
          const instEl = $('deck-builder-instruction');
          if (instEl) instEl.value = sugText;
          cur.instruction = sugText;
          buildDeck(sugText);
        });
        sugWrap.appendChild(btn);
      });
    }
  }

  // Dosya İşleme (Görsel küçültme, PDF, DOCX, TXT)
  function downscaleImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, MAX_IMG_SIDE / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Görsel okunamadı.'));
      };
      img.src = url;
    });
  }

  function readAsBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(new Error('Dosya okunamadı.'));
      fr.readAsDataURL(blob);
    });
  }

  async function handleFile(file) {
    if (!file) return;
    const name = file.name || 'dosya';
    const lower = name.toLowerCase();
    setStatus('Dosya yükleniyor ve inceleniyor...');

    try {
      if (file.type.startsWith('image/')) {
        state.file = { mime: 'image/jpeg', data: await downscaleImage(file) };
      } else if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        if (file.size > MAX_PDF_BYTES) throw new Error('PDF en fazla 4.5 MB olabilir.');
        state.file = { mime: 'application/pdf', data: await readAsBase64(file) };
      } else if (lower.endsWith('.docx')) {
        if (!window.mammoth) throw new Error('DOCX ayrıştırıcı hazır değil.');
        const res = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        $('deck-builder-text-input').value = (res.value || '').slice(0, 30000);
        state.file = null;
      } else if (lower.endsWith('.txt')) {
        $('deck-builder-text-input').value = (await file.text()).slice(0, 30000);
        state.file = null;
      } else {
        throw new Error('Desteklenen dosya türleri: Görsel (PNG/JPG), PDF, DOCX veya TXT.');
      }

      state.fileName = name;
      if (state.file) {
        $('deck-builder-file-name').textContent = name;
        $('deck-builder-file-chip').classList.remove('hidden');
      } else {
        $('deck-builder-file-chip').classList.add('hidden');
      }
      setStatus('');
      renderAnalysisPanel();
    } catch (e) {
      state.file = null;
      $('deck-builder-file-chip').classList.add('hidden');
      setStatus(e.message || 'Dosya işlenemedi.', true);
    }
  }

  function currentPayload() {
    const text = ($('deck-builder-text-input')?.value || '').trim();
    const payload = {
      deckMode: state.mode
    };
    if (text) payload.text = text;
    if (state.file) payload.file = state.file;
    return payload;
  }

  // Adım 1: İçerik Seviye ve Konu Analizi
  async function analyze() {
    const payload = currentPayload();
    if (!payload.text && !payload.file) {
      setStatus('Lütfen metin girin veya bir dosya yükleyin.', true);
      return;
    }

    const activeMode = state.mode;
    setBusy(true);
    setStatus(activeMode === 'quiz' ? 'İçerik soru-cevap ve bilgi kartları için analiz ediliyor...' : 'İçerik analiz ediliyor...');

    try {
      if (activeMode === 'quiz') {
        const quizHeader = '[MOD: QUİZ / SORU-CEVAP VE ÖN-ARKA YÜZ BİLGİ KARTI ANALİZİ - suggestions alanına kelime çevirisi değil, soru-cevap ve ön-arka yüz eşleştirme talimatları yaz]\n';
        payload.text = payload.text ? (quizHeader + payload.text) : quizHeader;
      }
      const out = await window.coachRequest('analyze', payload);
      const rawSugs = Array.isArray(out.suggestions) ? out.suggestions : [];
      const cleanSugs = activeMode === 'quiz'
        ? rawSugs.filter((s) => !/\b(fiil|sıfat|zarf|kelime|sözlük)\b/i.test(s))
        : rawSugs;

      state.byMode[activeMode].analysis = {
        contentType: out.contentType || (activeMode === 'quiz' ? 'Bilgi Belgesi' : 'Belge'),
        estimatedLevel: out.estimatedLevel || (activeMode === 'quiz' ? 'Quiz' : 'B1'),
        summary: out.summary || 'İçerik incelendi.',
        suggestions: cleanSugs.length >= 2 ? cleanSugs : DEFAULT_SUGGESTIONS[activeMode]
      };

      renderAnalysisPanel();
      setStatus('');
      $('deck-builder-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      setStatus(e.message || 'Analiz yapılamadı.', true);
    } finally {
      setBusy(false);
    }
  }

  // Adım 2: Kelime veya Quiz Kartı Listesi Çıkarma (Deste Oluşturma)
  async function buildDeck(forceInstruction = null) {
    const payload = currentPayload();
    if (!payload.text && !payload.file) {
      setStatus('Lütfen önce metin yapıştırın veya dosya yükleyin.', true);
      return;
    }

    const activeMode = state.mode;
    const isQuiz = activeMode === 'quiz';
    const instruction = (forceInstruction !== null && typeof forceInstruction === 'string')
      ? forceInstruction
      : ($('deck-builder-instruction')?.value || '').trim();

    state.byMode[activeMode].instruction = instruction;
    payload.deckMode = activeMode;
    if (isQuiz) {
      const quizCoreDirective = 'BU BİR QUİZ (SORU - CEVAP - EK BİLGİ) DESTESİDİR. Kelime çevirisi yapma! lemma alanına Soruyu (belge Türkçe ise Türkçe, Almanca ise Almanca), contextMeaning alanına Doğru Cevabı, sourceSentence alanına ise belgeden bulduğun ekstra bilgileri veya konuya dair ek bilgileri / ipuçlarını (Tips & Tricks: örn. Bayern başkenti München, nüfusu yaklaşık 1.5 milyon vb.) Türkçe olarak MUTLAKA yaz.';
      payload.instruction = instruction ? `${quizCoreDirective} Kullanıcı Kurgusu: ${instruction}` : quizCoreDirective;
    } else {
      const wordTipDirective = 'sourceSentence alanına kelimenin belgedeki cümlesini ve varsa belgeden/kullanımdan kısa bir ek bilgi (ipucu) yaz.';
      payload.instruction = instruction ? `${instruction}. (${wordTipDirective})` : wordTipDirective;
    }

    setBusy(true, 'Koç düşünüyor...');
    setStatus(
      isQuiz
        ? 'Koç belgedeki bilgileri Soru, Cevap ve Ek Bilgi kartlarına dönüştürüyor...'
        : 'Koç içeriği inceliyor ve kelimeleri ayıklıyor...'
    );

    try {
      const out = await window.coachRequest('deck', payload);
      const rawList = (out && Array.isArray(out.words) && out.words.length)
        ? out.words
        : (out && Array.isArray(out.cards) ? out.cards : []);

      if (!rawList.length) {
        throw new Error(
          isQuiz
            ? 'İçerikten soru-cevap kartı çıkarılamadı. Lütfen talimatı değiştirerek tekrar deneyin.'
            : 'İçerikten uygun kelime çıkarılamadı. Lütfen talimatı değiştirerek tekrar deneyin.'
        );
      }

      const modeStore = state.byMode[activeMode];
      modeStore.deckTitle = out.deckTitle || (isQuiz ? 'Quiz Destesi' : 'Koç Destesi');

      if (isQuiz) {
        modeStore.words = rawList.map((w) => {
          const front = cleanStr(w.front || w.lemma || w.question);
          const back = cleanStr(w.back || w.contextMeaning || w.answer);
          const category = cleanStr(w.category || w.cefr || 'Soru - Cevap');
          const hint = cleanStr(w.hint || w.sourceSentence || '');
          return {
            front,
            back,
            category,
            hint,
            lemma: front,
            pos: 'QUIZ',
            cefr: category,
            contextMeaning: back,
            sourceSentence: hint,
            selected: true
          };
        }).filter((w) => w.front && w.back);
      } else {
        modeStore.words = rawList.map((w) => ({
          lemma: cleanStr(w.lemma),
          pos: w.pos || 'PHRASE',
          cefr: w.cefr || '',
          contextMeaning: cleanStr(w.contextMeaning),
          sourceSentence: cleanStr(w.sourceSentence),
          selected: true
        })).filter((w) => w.lemma);
      }

      $('deck-builder-deck-name').value = modeStore.deckTitle;
      renderWords();
      $('deck-builder-result').classList.remove('hidden');
      setStatus('');
      $('deck-builder-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      setStatus(e.message || 'Deste oluşturulamadı.', true);
    } finally {
      setBusy(false);
    }
  }

  function renderWords() {
    const container = $('deck-builder-word-list');
    if (!container) return;
    container.innerHTML = '';

    const isQuiz = state.mode === 'quiz';
    const words = currentModeState().words;

    words.forEach((w) => {
      const item = document.createElement('div');
      item.className = 'coach-word-item';
      item.style.display = 'flex';
      item.style.alignItems = 'flex-start';
      item.style.justifyContent = 'space-between';
      item.style.padding = '11px 13px';
      item.style.background = 'var(--bg-elevated)';
      item.style.border = '1px solid var(--border-subtle)';
      item.style.borderRadius = '10px';
      item.style.marginBottom = '7px';
      item.style.gap = '10px';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'flex-start';
      left.style.gap = '10px';
      left.style.flex = '1';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = w.selected;
      chk.style.cursor = 'pointer';
      chk.style.width = '17px';
      chk.style.height = '17px';
      chk.style.marginTop = '3px';
      chk.addEventListener('change', () => {
        w.selected = chk.checked;
        updateCount();
      });

      const info = document.createElement('div');
      info.style.flex = '1';

      if (isQuiz) {
        const frontText = w.front || w.lemma;
        const backText = w.back || w.contextMeaning;
        const hintText = w.hint || w.sourceSentence || '';

        info.innerHTML = `
          <div style="display:flex; align-items:baseline; gap:6px; margin-bottom:5px;">
            <span class="badge" style="background:rgba(245,158,11,0.16); color:#FBBF24; font-size:0.65rem; font-weight:800; padding:2px 6px; border-radius:5px; flex-shrink:0;">SORU</span>
            <span style="font-weight:800; font-size:0.93rem; color:var(--text-primary); line-height:1.4;">${frontText}</span>
          </div>
          <div style="display:flex; align-items:baseline; gap:6px; padding-top:5px; border-top:1px dashed var(--border-subtle);">
            <span class="badge" style="background:rgba(16,185,129,0.16); color:#34D399; font-size:0.65rem; font-weight:800; padding:2px 6px; border-radius:5px; flex-shrink:0;">CEVAP</span>
            <span style="font-weight:700; font-size:0.88rem; color:#34D399; line-height:1.35;">${backText}</span>
          </div>
          ${hintText ? `
          <div style="display:flex; align-items:baseline; gap:6px; margin-top:5px; padding-top:5px; border-top:1px dashed var(--border-subtle);">
            <span class="badge" style="background:var(--accent-primary-soft); color:var(--brand-blue-hover); font-size:0.64rem; font-weight:800; padding:2px 6px; border-radius:5px; flex-shrink:0;">EK BİLGİ</span>
            <span style="font-size:0.8rem; color:var(--text-secondary); line-height:1.35;">${hintText}</span>
          </div>` : ''}
        `;
      } else {
        info.innerHTML = `
          <div style="font-weight:800; font-size:0.94rem; color:var(--text-primary); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span>${w.lemma}</span>
            <span class="badge" style="background:var(--accent-primary-soft); color:var(--brand-blue-hover); font-size:0.68rem; padding:2px 6px; border-radius:6px;">${POS_LABEL[w.pos] || w.pos}</span>
            ${w.cefr ? `<span class="badge" style="background:rgba(16,185,129,0.15); color:#34D399; font-size:0.68rem; padding:2px 6px; border-radius:6px;">${w.cefr}</span>` : ''}
          </div>
          <div style="font-size:0.82rem; color:var(--text-secondary); margin-top:2px;">${w.contextMeaning}</div>
          ${w.sourceSentence ? `<div style="font-size:0.76rem; color:var(--text-muted); margin-top:3px; font-style:italic;">${w.sourceSentence}</div>` : ''}
        `;
      }

      left.appendChild(chk);
      left.appendChild(info);
      item.appendChild(left);
      container.appendChild(item);
    });

    updateCount();
  }

  function updateCount() {
    const words = currentModeState().words;
    const selCount = words.filter((w) => w.selected).length;
    const countEl = $('deck-builder-count');
    if (countEl) {
      const unit = state.mode === 'quiz' ? 'soru-cevap kartı' : 'kelime';
      countEl.textContent = `${selCount} / ${words.length} ${unit} seçildi`;
    }
  }

  // Adım 3: Sözlük Zenginleştirmesi (Sadece Kelime Modu İçin) & Desteyi Kaydetme
  async function lookupEntry(lemma) {
    if (!lemma) return null;
    try {
      if (window.DictionaryService) {
        if (typeof window.DictionaryService.searchExact === 'function') {
          const match = window.DictionaryService.searchExact(lemma);
          if (match) return match;
        }
        if (typeof window.DictionaryService.synthesizeInstantEntry === 'function') {
          return window.DictionaryService.synthesizeInstantEntry(lemma);
        }
      }
    } catch (_) {}
    return null;
  }

  async function saveDeck() {
    const isQuiz = state.mode === 'quiz';
    const modeStore = currentModeState();
    const selected = modeStore.words.filter((w) => w.selected);
    if (!selected.length) {
      toast(isQuiz ? 'Lütfen en az bir soru-cevap kartı seçin.' : 'Lütfen en az bir kelime seçin.');
      return;
    }

    const deckName = ($('deck-builder-deck-name')?.value || '').trim() || modeStore.deckTitle || (isQuiz ? 'Quiz Destesi' : 'Koç Destesi');
    const saveBtn = $('btn-deck-builder-save');
    setBusy(true);

    try {
      const desc = isQuiz ? 'Koç tarafından üretildi (Quiz / Soru-Cevap Destesi)' : 'Koç tarafından üretildi (Kelime Destesi)';
      const createdDeck = await window.wmDB.createDeck(deckName, desc, 'default');
      const targetDeckId = createdDeck && createdDeck.id ? createdDeck.id : Date.now();

      let added = 0;
      for (let i = 0; i < selected.length; i++) {
        const w = selected[i];

        if (isQuiz) {
          if (saveBtn) saveBtn.textContent = `Quiz Kartları Kaydediliyor: ${i + 1} / ${selected.length}`;
          await window.wmDB.addCard({
            deckId: targetDeckId,
            germanWord: w.front || w.lemma,
            meaningsTr: w.back || w.contextMeaning,
            partOfSpeech: 'QUIZ',
            article: '',
            pluralForm: '',
            exampleSentence: w.hint || w.sourceSentence || '',
            praesens: '',
            praeteritum: '',
            partizipZwei: '',
            hilfsverb: '',
            cefr: w.category || w.cefr || 'QUIZ',
            isQuizCard: true
          });
        } else {
          if (saveBtn) saveBtn.textContent = `Sözlükten Zenginleştiriliyor: ${i + 1} / ${selected.length}`;
          const entry = await lookupEntry(w.lemma);
          const isNoun = w.pos === 'NOUN' || (entry && entry.partOfSpeech === 'NOUN');

          await window.wmDB.addCard({
            deckId: targetDeckId,
            germanWord: w.lemma,
            meaningsTr: w.contextMeaning || (entry ? entry.meaningsTr : ''),
            partOfSpeech: (entry && entry.partOfSpeech) || POS_CARD[w.pos] || 'OTHER',
            article: isNoun && entry ? entry.article || '' : '',
            pluralForm: isNoun && entry ? entry.pluralForm || '' : '',
            exampleSentence: w.sourceSentence || (entry && entry.exampleSentence) || '',
            praesens: entry ? entry.praesens || '' : '',
            praeteritum: entry ? entry.praeteritum || '' : '',
            partizipZwei: entry ? entry.partizipZwei || '' : '',
            hilfsverb: entry ? entry.hilfsverb || 'hat' : 'hat',
            cefr: w.cefr || (entry && entry.cefr) || 'A1'
          });
        }
        added++;
      }

      toast(`"${deckName}" destesi oluşturuldu (${added} kart eklendi).`);

      // Buluta da yedekle (eğer oturum açıksa)
      if (window.wmSocial && window.wmSocial.isCloudConnected()) {
        try {
          await window.wmSocial.apiCall('decks/save', {
            ownerId: window.wmSocial.user.id,
            title: deckName,
            words: selected.map((w) => ({
              lemma: isQuiz ? (w.front || w.lemma) : w.lemma,
              pos: isQuiz ? 'QUIZ' : w.pos,
              cefr: isQuiz ? (w.category || 'QUIZ') : w.cefr,
              contextMeaning: isQuiz ? (w.back || w.contextMeaning) : w.contextMeaning
            }))
          });
        } catch (_) {}
      }

      // Kapat ve Desteler sekmesini yenile
      $('modal-deck-builder')?.classList.add('hidden');
      if (window.wmApp && window.wmApp.renderDecksTab) {
        await window.wmApp.renderDecksTab();
      }
      if (window.wmApp && window.wmApp.switchTab) {
        window.wmApp.switchTab('tab-decks');
      }
    } catch (e) {
      setStatus('Deste kaydedilirken hata oluştu: ' + e.message, true);
    } finally {
      if (saveBtn) saveBtn.textContent = 'Desteyi Kütüphaneme Kaydet';
      setBusy(false);
    }
  }

  function openDeckBuilderModal(initialMode = null) {
    const modal = $('modal-deck-builder');
    if (!modal) return;
    if (initialMode === 'word' || initialMode === 'quiz') {
      switchDeckMode(initialMode);
    } else {
      switchDeckMode(state.mode || 'word');
    }
    modal.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function closeDeckBuilderModal() {
    $('modal-deck-builder')?.classList.add('hidden');
  }

  function init() {
    // 1. Çalış sekmesindeki kart tıklandığında aç
    $('btn-open-deck-builder-card')?.addEventListener('click', () => openDeckBuilderModal());
    $('btn-close-deck-builder')?.addEventListener('click', closeDeckBuilderModal);

    // 1.1 Mod Sekmeleri (Kelime Destesi vs Quiz Destesi)
    $('tab-btn-deck-mode-word')?.addEventListener('click', () => switchDeckMode('word'));
    $('tab-btn-deck-mode-quiz')?.addEventListener('click', () => switchDeckMode('quiz'));

    // 2. Dosya seçme, kaldırma ve metin girişi
    $('btn-deck-builder-pick')?.addEventListener('click', () => $('deck-builder-file-input')?.click());
    $('deck-builder-file-input')?.addEventListener('change', (e) => {
      handleFile(e.target.files[0]);
      e.target.value = '';
    });
    $('btn-deck-builder-file-remove')?.addEventListener('click', () => {
      state.file = null;
      $('deck-builder-file-chip')?.classList.add('hidden');
      renderAnalysisPanel();
    });
    $('deck-builder-text-input')?.addEventListener('input', () => {
      renderAnalysisPanel();
    });

    // 3. İncele & Deste Oluştur & Kaydet Butonları
    $('btn-deck-builder-analyze')?.addEventListener('click', analyze);
    $('btn-deck-builder-build')?.addEventListener('click', () => buildDeck());
    $('btn-deck-builder-save')?.addEventListener('click', saveDeck);

    // 4. Tümünü Seç / Kaldır
    $('btn-deck-builder-toggle-all')?.addEventListener('click', () => {
      const words = currentModeState().words;
      const allSelected = words.every((w) => w.selected);
      words.forEach((w) => { w.selected = !allSelected; });
      renderWords();
    });

    // 5. Enter tuşuyla deste oluşturma
    $('deck-builder-instruction')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        buildDeck();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.openDeckBuilder = openDeckBuilderModal;
})();
