/**
 * WortCoach - Akıllı Okuma UI Modülü (readerUI.js)
 * WortCoachApp.prototype üzerine bağlanır.
 */
window.WortCoachReaderUIMixin = {
  /**
   * 5. Akıllı Okuyucu (Smart Reader) & Text to Speech (TTS) Metin Okuma Modülü
   */
  bindSmartReader() {
    const readerInput = document.getElementById('reader-input-text');
    const readerDisplay = document.getElementById('reader-display-pane');
    const readerSetupPane = document.getElementById('reader-setup-pane');
    const readerFsView = document.getElementById('reader-fullscreen-view');
    const sampleSelect = document.getElementById('reader-sample-select');
    const clearBtn = document.getElementById('btn-reader-clear');
    const parseBtn = document.getElementById('btn-reader-parse');

    // Dosya İçe Aktarım Elemanları
    const fileInput = document.getElementById('reader-file-input');
    const dropZone = document.getElementById('reader-drop-zone');
    const btnTriggerFileInput = document.getElementById('btn-trigger-file-input');
    const uploadStatus = document.getElementById('reader-upload-status');

    // Tam Ekran Üst Bar & Yüzen Dock Elemanları
    const btnBackSetup = document.getElementById('btn-reader-back-setup');
    const btnFontDec = document.getElementById('btn-reader-font-dec');
    const btnFontInc = document.getElementById('btn-reader-font-inc');
    const fsSpeedSelect = document.getElementById('reader-fs-speed-select');
    const btnFsPlay = document.getElementById('btn-reader-play-all') || document.getElementById('btn-reader-fs-play');
    const btnFsStop = document.getElementById('btn-reader-stop') || document.getElementById('btn-reader-fs-stop');
    const btnToggleDock = document.getElementById('btn-toggle-reader-dock');
    const floatingDock = document.getElementById('reader-floating-dock');
    const wordCountBadge = document.getElementById('reader-word-count-badge');

    // Reader Kelime Modalı Elemanları
    const modalReader = document.getElementById('modal-reader-word');
    const modalWordTitle = document.getElementById('reader-modal-word');
    const modalArticleBadge = document.getElementById('reader-modal-article-badge');
    const modalGrammarRow = document.getElementById('reader-modal-grammar-row');
    const modalBannerContainer = document.getElementById('reader-modal-banner-container');
    const modalTrChips = document.getElementById('reader-modal-tr-chips');
    const modalEnChips = document.getElementById('reader-modal-en-chips');
    const modalDeckSelect = document.getElementById('reader-target-deck');
    const btnCloseReaderModal = document.getElementById('btn-close-reader-modal');
    const btnReadFromWord = document.getElementById('btn-read-from-selected-word');
    const btnStopReaderWord = document.getElementById('btn-stop-from-selected-word');
    const btnReaderWordTTS = document.getElementById('btn-reader-word-tts');
    const btnReaderWordPronounce = document.getElementById('btn-reader-word-pronounce');
    const btnReaderSaveCard = document.getElementById('btn-reader-save-card');
    const btnCombinePair = document.getElementById('btn-reader-combine-pair');
    const combineBanner = document.getElementById('reader-combine-banner');
    const combineTextEl = document.getElementById('reader-combine-text');
    const btnCancelCombine = document.getElementById('btn-reader-cancel-combine');

    let currentSelectedTokenWord = '';
    let currentSelectedRawWord = '';
    let currentSelectedTokenIndex = -1;
    let currentSelectedTokenOffset = 0;
    let currentSelectedPipelineResult = null;
    let pendingCombineAnchor = null;
    let isPipelinePending = false;
    let activePipelinePromise = null;
    let readerLookupAbortCtrl = null;
    let readerLookupSeq = 0;

    const clearCombineMode = () => {
      pendingCombineAnchor = null;
      readerDisplay?.querySelectorAll('.reader-token.combine-anchor').forEach((t) => t.classList.remove('combine-anchor'));
      if (combineBanner) combineBanner.classList.add('hidden');
      if (combineTextEl) combineTextEl.textContent = '';
    };

    const sampleTexts = {
      sample_a1: `Guten Tag! Mein Name ist Lukas und ich wohne in Berlin. Jeden Tag stehe ich um sieben Uhr auf und trinke einen heißen Kaffee mit Milch. Danach fahre ich mit der U-Bahn zur Arbeit. Ich lerne gern Deutsch und treffe meine Freunde am Abend im Park.`,
      sample_a2: `Letztes Wochenende bin ich nach München gereist. Das Wetter war herrlich und die Sonne schien hell. Zuerst habe ich das Deutsche Museum besucht, weil mich Technik sehr interessiert. Am Nachmittag aßen wir Brezeln und sprachen über unsere Reisepläne für den kommenden Sommer.`,
      sample_b1: `Der Klimawandel stellt unsere Gesellschaft vor enorme Herausforderungen. Immer mehr Wissenschaftler betonen die Notwendigkeit erneuerbarer Energien. Wenn wir rechtzeitig nachhaltige Maßnahmen ergreifen, können wir unsere Umwelt für kommende Generationen schützen.`,
      sample_b2: `Sehr geehrte Damen und Herren, mit großem Interesse bewerbe ich mich um die ausgeschriebene Position als Softwareentwickler. In meiner bisherigen Laufbahn habe ich fundierte Kenntnisse im Bereich agiler Methoden erworben und komplexe Projekte erfolgreich geleitet.`
    };

    const getSelectedSpeed = () => {
      return parseFloat(fsSpeedSelect?.value || '0.90');
    };

    // --- 1. BELGE İÇE AKTARIMI (PDF, DOCX, TXT) ---
    const handleDocumentFile = async (file) => {
      if (!file) return;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (uploadStatus) {
        uploadStatus.textContent = `Belge ayrıştırılıyor: ${file.name}...`;
        uploadStatus.classList.remove('hidden');
      }

      try {
        let extractedText = '';

        if (ext === 'pdf') {
          if (typeof window.pdfjsLib === 'undefined' && window.WortCoachLoader) {
            if (uploadStatus) uploadStatus.textContent = 'PDF okuyucu yükleniyor...';
            await window.WortCoachLoader.ensurePdfJs();
          }
          if (typeof window.pdfjsLib !== 'undefined') {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
            const pdfDoc = await loadingTask.promise;
            const textPages = [];
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
              const page = await pdfDoc.getPage(pageNum);
              const content = await page.getTextContent();
              const pageStr = content.items.map((item) => item.str).join(' ');
              textPages.push(pageStr);
            }
            extractedText = textPages.join('\n\n');
          } else {
            throw new Error('PDF ayrıştırıcı kütüphane henüz yüklenemedi.');
          }
        } else if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
          if (uploadStatus) uploadStatus.textContent = 'Görseldeki Almanca metin okunuyor...';
          const b64 = await (window.coachHelper ? window.coachHelper.downscaleImage(file) : new Promise((res, rej) => {
            const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file);
          }));
          const ocr = await window.coachRequest('ocr', { file: { mime: 'image/jpeg', data: b64 } });
          extractedText = ocr?.text || '';
        } else if (ext === 'docx') {
          if (typeof window.mammoth === 'undefined' && window.WortCoachLoader) {
            if (uploadStatus) uploadStatus.textContent = 'DOCX okuyucu yükleniyor...';
            await window.WortCoachLoader.ensureMammoth();
          }
          if (typeof window.mammoth !== 'undefined') {
            const arrayBuffer = await file.arrayBuffer();
            const res = await window.mammoth.extractRawText({ arrayBuffer });
            extractedText = res.value || '';
          } else {
            throw new Error('Word (DOCX) ayrıştırıcı kütüphane henüz yüklenemedi.');
          }
        } else {
          // Plain Text (.txt vb.)
          extractedText = await file.text();
        }

        if (extractedText && extractedText.trim()) {
          if (readerInput) readerInput.value = extractedText.trim();
          if (uploadStatus) uploadStatus.classList.add('hidden');
          this.showToast(`"${file.name}" başarıyla ayrıştırıldı.`);
          parseAndEnterFullScreen(extractedText.trim());
        } else {
          if (uploadStatus) uploadStatus.textContent = 'Belgeden metin okunamadı veya dosya boş.';
        }
      } catch (err) {
        console.error('File parsing error:', err);
        if (uploadStatus) uploadStatus.textContent = `Dosya okunamadı: ${err.message || 'Hata'}`;
        this.showToast('Belge ayrıştırılırken hata oluştu.');
      }
    };

    btnTriggerFileInput?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });

    dropZone?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleDocumentFile(file);
    });

    // Sürükle Bırak (Drag & Drop)
    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files?.[0];
      if (file) handleDocumentFile(file);
    });

    // --- 2. TAM EKRAN VE YAZI BOYUTU KONTROLLERİ ---
    let currentFontSizeRem = 1.15;

    btnFontDec?.addEventListener('click', () => {
      currentFontSizeRem = Math.max(0.85, currentFontSizeRem - 0.1);
      if (readerDisplay) readerDisplay.style.fontSize = `${currentFontSizeRem}rem`;
    });

    btnFontInc?.addEventListener('click', () => {
      currentFontSizeRem = Math.min(1.85, currentFontSizeRem + 0.1);
      if (readerDisplay) readerDisplay.style.fontSize = `${currentFontSizeRem}rem`;
    });

    btnBackSetup?.addEventListener('click', () => {
      window.wmTTS.stop();
      clearCombineMode();
      document.body.classList.remove('reader-active-mode');
      readerDisplay?.querySelectorAll('.reader-token.active-inspect').forEach((t) => t.classList.remove('active-inspect'));
      readerFsView?.classList.add('hidden');
      readerSetupPane?.classList.remove('hidden');
    });

    btnToggleDock?.addEventListener('click', () => {
      floatingDock?.classList.toggle('dock-hidden');
    });

    const parseAndEnterFullScreen = (text) => {
      const clean = (text || '').trim();
      if (!clean) {
        this.showToast('Lütfen önce bir metin girin veya belge yükleyin.');
        return;
      }
      clearCombineMode();
      document.body.classList.add('reader-active-mode');
      readerSetupPane?.classList.add('hidden');
      readerFsView?.classList.remove('hidden');

      const wordMatches = clean.match(/[a-zA-ZäöüÄÖÜß]+/g) || [];
      if (wordCountBadge) {
        wordCountBadge.textContent = `${wordMatches.length} Kelime`;
      }
      renderParsedTokens(clean);
    };

    const escapeHtmlToken = (str) => String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const renderParsedTokens = (text) => {
      if (!readerDisplay) return;
      clearCombineMode();
      readerDisplay.querySelectorAll('.reader-token.active-inspect').forEach((t) => t.classList.remove('active-inspect'));
      const clean = (text || '').trim();
      if (!clean) {
        readerDisplay.innerHTML = `<span style="color:var(--text-muted); font-size:0.92rem; font-style:italic;">Metin bulunamadı.</span>`;
        return;
      }

      const verbHelper = window.GermanVerbHelper;
      const isKnownVerbFn = window.DictionaryService?.findOfflineEntry
        ? (cand) => {
            const hit = window.DictionaryService.findOfflineEntry(cand);
            if (!hit) return false;
            const pos = (hit.pos || '').trim().toUpperCase();
            return !pos || pos.startsWith('V') || pos.includes('VERB');
          }
        : null;

      const applySeparablePairDetection = (clauseItems) => {
        if (!verbHelper?.detectSeparablePairInClause || !clauseItems || clauseItems.length < 2) return;
        const coordRegex = /^(und|oder|aber|denn|sondern)$/;
        const subClauses = [];
        let bucket = [];
        for (const item of clauseItems) {
          if (coordRegex.test(item.word)) {
            if (bucket.length >= 2) subClauses.push(bucket);
            bucket = [];
          } else {
            bucket.push(item);
          }
        }
        if (bucket.length >= 2) subClauses.push(bucket);

        let anyMatched = false;
        for (const sub of subClauses) {
          const match = verbHelper.detectSeparablePairInClause(sub, isKnownVerbFn);
          if (match) {
            const vItem = sub[match.verbIndex];
            const pItem = sub[match.prefixIndex];
            if (vItem && pItem) {
              vItem.pairInfinitive = match.infinitive;
              vItem.pairPartnerIndex = pItem.index;
              pItem.pairInfinitive = match.infinitive;
              pItem.pairPartnerIndex = vItem.index;
              anyMatched = true;
            }
          }
        }

        // Bağlaç nesneleri bağlıyorsa (ör. "Er kauft Brot und Käse ein.") tüm tümceyi dene
        if (!anyMatched && subClauses.length > 1) {
          const fullMatch = verbHelper.detectSeparablePairInClause(clauseItems, isKnownVerbFn);
          if (fullMatch) {
            const vItem = clauseItems[fullMatch.verbIndex];
            const pItem = clauseItems[fullMatch.prefixIndex];
            if (vItem && pItem) {
              vItem.pairInfinitive = fullMatch.infinitive;
              vItem.pairPartnerIndex = pItem.index;
              pItem.pairInfinitive = fullMatch.infinitive;
              pItem.pairPartnerIndex = vItem.index;
            }
          }
        }
      };

      const paragraphs = clean.split(/\n\s*\n/);
      let globalOffset = 0;
      let tokenIndexCounter = 0;
      const renderedParagraphs = [];

      for (const para of paragraphs) {
        const tokens = para.match(/([a-zA-ZäöüÄÖÜß]+|[^a-zA-ZäöüÄÖÜß\s]+|\s+)/g) || [para];
        const parsedItems = [];
        let activeClause = [];

        for (const token of tokens) {
          if (/^[a-zA-ZäöüÄÖÜß]+$/.test(token)) {
            const wordOffset = clean.indexOf(token, globalOffset);
            const resolvedOffset = wordOffset >= 0 ? wordOffset : globalOffset;
            const item = {
              type: 'word',
              word: token,
              offset: resolvedOffset,
              index: tokenIndexCounter++,
              pairInfinitive: null,
              pairPartnerIndex: -1
            };
            parsedItems.push(item);
            activeClause.push(item);
            globalOffset = resolvedOffset + token.length;
          } else if (token.includes('\n')) {
            applySeparablePairDetection(activeClause);
            activeClause = [];
            parsedItems.push({ type: 'br' });
            globalOffset += token.length;
          } else {
            if (/[.!?,;:\u2014\u2013]/.test(token)) {
              applySeparablePairDetection(activeClause);
              activeClause = [];
            }
            parsedItems.push({ type: 'raw', text: token });
            globalOffset += token.length;
          }
        }
        applySeparablePairDetection(activeClause);
        renderedParagraphs.push(parsedItems);
      }

      let html = '';
      for (const items of renderedParagraphs) {
        html += '<p style="margin: 0 0 16px 0;">';
        for (const item of items) {
          if (item.type === 'word') {
            const pairAttrs = item.pairInfinitive
              ? ` data-pair-infinitive="${escapeHtmlToken(item.pairInfinitive)}" data-pair-partner-index="${item.pairPartnerIndex}"`
              : '';
            const pairCls = item.pairInfinitive ? ' separable-pair-member' : '';
            html += `<span class="reader-token${pairCls}" data-word="${escapeHtmlToken(item.word)}" data-offset="${item.offset}" data-index="${item.index}"${pairAttrs}>${escapeHtmlToken(item.word)}</span>`;
          } else if (item.type === 'br') {
            html += '<br/>';
          } else {
            html += item.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
          }
        }
        html += '</p>';
      }

      readerDisplay.innerHTML = html;
      bindReaderTokens();
    };

    // Örnek Metin Seçimi
    sampleSelect?.addEventListener('change', () => {
      const val = sampleSelect.value;
      if (val && sampleTexts[val]) {
        if (readerInput) readerInput.value = sampleTexts[val];
      }
    });

    // Temizle Butonu
    clearBtn?.addEventListener('click', () => {
      window.wmTTS.stop();
      clearCombineMode();
      if (readerInput) readerInput.value = '';
      if (sampleSelect) sampleSelect.value = '';
      readerDisplay?.querySelectorAll('.reader-token.active-inspect').forEach((t) => t.classList.remove('active-inspect'));
    });

    // Ayrıştır ve Oku Butonu
    parseBtn?.addEventListener('click', () => {
      parseAndEnterFullScreen(readerInput?.value || '');
    });

    // Metni Baştan Oku
    const startSpeakAll = () => {
      const text = readerInput?.value.trim() || readerDisplay?.innerText.trim();
      if (!text) {
        this.showToast('Okunacak metin bulunamadı.');
        return;
      }
      window.wmTTS.speak(text, 'de-DE', getSelectedSpeed(), () => {
        readerDisplay?.querySelectorAll('.reader-token.speaking').forEach((t) => t.classList.remove('speaking'));
      });
      this.showToast('Metin seslendiriliyor...');
    };

    const stopSpeakAll = () => {
      window.wmTTS.stop();
      readerDisplay?.querySelectorAll('.reader-token.speaking').forEach((t) => t.classList.remove('speaking'));
      this.showToast('Okuma durduruldu.');
    };

    btnFsPlay?.addEventListener('click', startSpeakAll);
    btnFsStop?.addEventListener('click', stopSpeakAll);

    // --- 4. KELİME MODALI & ETKİLEŞİM ---
    const closeReaderModal = () => {
      readerLookupSeq += 1;
      if (readerLookupAbortCtrl) {
        readerLookupAbortCtrl.abort();
        readerLookupAbortCtrl = null;
      }
      modalReader?.classList.add('hidden');
      readerDisplay?.querySelectorAll('.reader-token.active-inspect').forEach((t) => t.classList.remove('active-inspect'));
    };

    btnCloseReaderModal?.addEventListener('click', closeReaderModal);

    btnCombinePair?.addEventListener('click', () => {
      const anchorWord = (currentSelectedRawWord || currentSelectedTokenWord || '').trim();
      if (!anchorWord) return;
      const savedAnchor = {
        rawWord: anchorWord,
        offset: currentSelectedTokenOffset,
        index: currentSelectedTokenIndex
      };
      clearCombineMode();
      pendingCombineAnchor = savedAnchor;
      closeReaderModal();
      if (savedAnchor.index >= 0) {
        const anchorEl = readerDisplay?.querySelector(`.reader-token[data-index="${savedAnchor.index}"]`);
        anchorEl?.classList.add('combine-anchor');
      }
      if (combineTextEl) {
        combineTextEl.textContent = `"${anchorWord}" seçili — birleştirmek istediğiniz ikinci parçaya dokunun`;
      }
      combineBanner?.classList.remove('hidden');
    });

    btnCancelCombine?.addEventListener('click', () => {
      clearCombineMode();
    });

    modalReader?.addEventListener('click', (e) => {
      if (e.target === modalReader) {
        closeReaderModal();
      }
    });

    // "Bu Kelimeden İtibaren Oku" Butonu
    btnReadFromWord?.addEventListener('click', () => {
      const fullText = readerInput?.value.trim() || readerDisplay?.innerText.trim();
      if (!fullText) return;
      window.wmTTS.speakFromOffset(fullText, currentSelectedTokenOffset, 'de-DE', getSelectedSpeed(), () => {
        readerDisplay?.querySelectorAll('.reader-token.speaking').forEach((t) => t.classList.remove('speaking'));
      });
      readerDisplay?.querySelectorAll('.reader-token.speaking').forEach((t) => t.classList.remove('speaking'));
      const activeTok = readerDisplay?.querySelector(`.reader-token[data-offset="${currentSelectedTokenOffset}"]`);
      if (activeTok) activeTok.classList.add('speaking');
      this.showToast(`"${currentSelectedTokenWord}" kelimesinden itibaren okunuyor...`);
    });

    // "Durdur" Butonu
    btnStopReaderWord?.addEventListener('click', () => {
      window.wmTTS.stop();
      readerDisplay?.querySelectorAll('.reader-token.speaking').forEach((t) => t.classList.remove('speaking'));
      this.showToast('Okuma durduruldu.');
    });

    // Yalnızca Bu Kelimeyi Dinle
    btnReaderWordTTS?.addEventListener('click', () => {
      if (currentSelectedTokenWord) {
        window.wmTTS.speak(currentSelectedTokenWord, 'de-DE', getSelectedSpeed());
      }
    });

    // Fonetik Koç Butonu
    btnReaderWordPronounce?.addEventListener('click', () => {
      if (!currentSelectedTokenWord) return;
      modalReader?.classList.add('hidden');
      this.openPronunciationCoach(
        {
          germanWord: currentSelectedTokenWord,
          partOfSpeech: currentSelectedPipelineResult?.entry?.partOfSpeech || (currentSelectedTokenWord.includes(' ') ? 'PHRASE' : 'OTHER'),
          article: currentSelectedPipelineResult?.entry?.article || null,
          meaningsTr: currentSelectedPipelineResult?.entry?.meaningsTr || currentSelectedPipelineResult?.translatedText || ''
        },
        currentSelectedTokenWord.includes(' ') ? 'sentence' : 'word'
      );
    });

    const escapeHtmlAttr = (s) => String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const renderReaderEnChips = (enList = []) => {
      if (!modalEnChips) return;
      const items = (Array.isArray(enList) ? enList : []).map((s) => String(s || '').trim()).filter(Boolean);
      if (items.length === 0) {
        modalEnChips.innerHTML = '<span style="font-size:0.78rem; color:var(--text-muted);">İngilizce karşılık bulunamadı.</span>';
        return;
      }
      modalEnChips.innerHTML = items.map((t, idx) => `
        <div class="meaning-chip ${idx < 2 ? 'selected' : ''}" data-val="${escapeHtmlAttr(t)}">
          <span class="meaning-chip-check">${idx < 2 ? '✓' : ''}</span>
          <span class="meaning-chip-text">${escapeHtmlAttr(t)}</span>
        </div>
      `).join('');

      modalEnChips.querySelectorAll('.meaning-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          chip.classList.toggle('selected');
          const chk = chip.querySelector('.meaning-chip-check');
          if (chk) chk.textContent = chip.classList.contains('selected') ? '✓' : '';
        });
      });
    };

    const extractReaderContextSentence = (text, offset = 0) => {
      const clean = String(text || '').trim();
      if (!clean) return '';
      const idx = Math.max(0, Math.min(Number(offset) || 0, clean.length - 1));
      let start = idx;
      while (start > 0 && !/[.!?\n\r]/.test(clean[start - 1])) start--;
      let end = idx;
      while (end < clean.length && !/[.!?\n\r]/.test(clean[end])) end++;
      if (end < clean.length && /[.!?]/.test(clean[end])) end++;
      const sentence = clean.slice(start, end).replace(/\s+/g, ' ').trim();
      return sentence.length > 260 ? sentence.slice(0, 257).trim() + '...' : sentence;
    };

    // --- 5. KART EKLEME (TARAMA BİTMEDEN EKLENİRSE ARKA PLANDA ÇÖZÜMLEME DESTEĞİ) ---
    btnReaderSaveCard?.addEventListener('click', async () => {
      if (!currentSelectedTokenWord) return;
      const targetDeckId = Number(modalDeckSelect?.value || 1);
      const wordOrPhrase = currentSelectedTokenWord;
      const savedOffset = currentSelectedTokenOffset;
      const contextSentence = extractReaderContextSentence(readerInput?.value || readerDisplay?.innerText || '', savedOffset);

      // Kullanıcı tarama devam ederken ekle butonuna bastıysa:
      if (isPipelinePending && activePipelinePromise) {
        modalReader?.classList.add('hidden');
        readerDisplay?.querySelectorAll('.reader-token.active-inspect').forEach((t) => t.classList.remove('active-inspect'));
        this.showToast(`"${wordOrPhrase}" çevriliyor, tamamlandığında desteye eklenecek...`);

        activePipelinePromise.then(async (res) => {
          let finalTr = '';
          let finalEn = '';
          let article = null;
          let pos = wordOrPhrase.includes(' ') ? 'PHRASE' : 'OTHER';

          if (res) {
            finalTr = res.entry?.meaningsTr || res.translatedText || '';
            finalEn = res.entry?.meaningsEn || res.translatedEnText || '';
            article = res.entry?.article || null;
            pos = res.entry?.partOfSpeech || pos;
          }

          if (!finalTr || finalTr === 'Çeviri bulunamadı') {
            try {
              finalTr = await window.DictionaryService.translateGermanToTr(wordOrPhrase);
            } catch (_) {
              finalTr = 'Özel Anlam';
            }
          }

          await window.wmDB.createCard({
            deckId: targetDeckId,
            germanWord: wordOrPhrase,
            article,
            partOfSpeech: pos,
            meaningsTr: finalTr || wordOrPhrase,
            meaningsEn: finalEn || '',
            exampleSentence: contextSentence,
            targetLanguage: 'de',
            source: 'smart_reader'
          });

          if (typeof window.saveToCustomUserDictionary === 'function') {
            window.saveToCustomUserDictionary({
              germanWord: wordOrPhrase,
              article,
              partOfSpeech: pos,
              meaningsTr: finalTr,
              meaningsEn: finalEn
            });
          }

          this.showToast(`"${wordOrPhrase}" desteye kaydedildi.`);
          await this.renderDecksTab?.();
          await this.renderCardsList?.('', true);
          await this.refreshHomeDashboard?.();
        }).catch((err) => {
          console.error('Background card save error:', err);
          this.showToast(`"${wordOrPhrase}" kaydedilirken bir hata oluştu.`);
        });
        return;
      }

      // Normal Akış: Anlamlar yüklenmiş ve seçilmiş
      const selectedMeanings = Array.from(modalTrChips?.querySelectorAll('.meaning-chip.selected') || [])
        .map((c) => c.getAttribute('data-val') || c.innerText.replace(/^\s*/, '').trim())
        .filter(Boolean);

      if (selectedMeanings.length === 0) {
        this.showToast('Lütfen en az bir Türkçe anlam seçin.');
        return;
      }

      const selectedEnMeanings = Array.from(modalEnChips?.querySelectorAll('.meaning-chip.selected') || [])
        .map((c) => c.getAttribute('data-val') || c.innerText.replace(/^\s*/, '').trim())
        .filter(Boolean);

      const ent = currentSelectedPipelineResult?.entry;
      const article = ent?.article || null;
      const pos = ent?.partOfSpeech || (wordOrPhrase.includes(' ') ? 'PHRASE' : 'OTHER');
      const finalTr = selectedMeanings.join(', ');
      const finalEn = selectedEnMeanings.join(', ');

      await window.wmDB.createCard({
        deckId: targetDeckId,
        germanWord: wordOrPhrase,
        article,
        pluralForm: ent?.pluralForm || '',
        partOfSpeech: pos,
        meaningsTr: finalTr,
        meaningsEn: finalEn,
        exampleSentence: contextSentence,
        praesens: ent?.praesens || '',
        praeteritum: ent?.praeteritum || '',
        partizipZwei: ent?.partizipZwei || '',
        hilfsverb: ent?.hilfsverb || '',
        imperativ: ent?.imperativ || '',
        targetLanguage: 'de',
        source: 'smart_reader'
      });

      if (typeof window.saveToCustomUserDictionary === 'function') {
        window.saveToCustomUserDictionary({
          germanWord: wordOrPhrase,
          article,
          partOfSpeech: pos,
          meaningsTr: finalTr,
          meaningsEn: finalEn
        });
      }

      this.showToast(`"${wordOrPhrase}" desteye ve yerel sözlüğe kaydedildi.`);
      closeReaderModal();
      await this.renderDecksTab?.();
      await this.renderCardsList?.('', true);
      await this.refreshHomeDashboard?.();
    });

    const renderReaderGrammarRow = (ent, cleanTarget, stemNoteText = '') => {
      if (!modalGrammarRow) return;
      const posStr = this.escapeHtml(ent?.partOfSpeech || (cleanTarget.includes(' ') ? 'Kalıp' : 'Kelime'));
      const stemNote = stemNoteText ? `<span class="badge" style="background:rgba(59,130,246,0.15); color:#60A5FA;">Kök: ${escapeHtmlAttr(stemNoteText)}</span>` : '';
      const rNuance = ent && window.detectGermanTags ? window.detectGermanTags(ent) : [];
      const rNuanceHtml = rNuance.map((t) => `<span class="badge-nuance ${escapeHtmlAttr(t.className)}" style="color:${t.color}; background-color:${t.bg}; border:1px solid ${t.border}; font-size:0.75rem; padding:2px 6px;">${escapeHtmlAttr(t.label)}</span>`).join(' ');
      const rCefrBadge = ent?.cefr ? `<span class="badge badge-cefr" style="background:rgba(99,102,241,0.15); color:#A5B4FC; border:1px solid rgba(99,102,241,0.3); font-size:0.75rem; font-weight:700; padding:2px 6px;">${escapeHtmlAttr(String(ent.cefr).toUpperCase())}</span>` : '';
      modalGrammarRow.innerHTML = `<span class="badge badge-pos-${escapeHtmlAttr(ent?.partOfSpeech || 'OTHER')}">${posStr}</span> ${rCefrBadge} ${stemNote} ${rNuanceHtml}`;
    };

    const renderReaderTrChips = (trList = [], cleanTarget = '') => {
      if (!modalTrChips) return;
      const userCustoms = this.getCustomMeaningsForWord(cleanTarget);
      const merged = [...(Array.isArray(trList) ? trList : [])];
      for (const uc of userCustoms) {
        if (uc && !merged.some((p) => p.toLowerCase() === uc.toLowerCase())) {
          merged.push(uc);
        }
      }

      if (merged.length === 0) {
        modalTrChips.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted);">Çeviri alınamadı.</span>
          <button type="button" class="btn-add-custom-meaning" id="btn-reader-add-custom">+ Anlam Ekle</button>
          <div class="custom-meaning-inline-box hidden" id="reader-custom-box">
            <input type="text" id="input-reader-custom" class="custom-meaning-inline-input" placeholder="Özel anlam..." maxlength="50" />
            <button type="button" id="btn-reader-confirm-custom" class="btn-confirm-custom-meaning" title="Ekle">✓</button>
            <button type="button" id="btn-reader-cancel-custom" class="btn-cancel-custom-meaning" title="İptal">✕</button>
          </div>`;
        bindReaderModalMeaningChips(cleanTarget);
        return;
      }

      modalTrChips.innerHTML = merged.map((t, idx) => `
        <div class="meaning-chip ${idx === 0 ? 'selected' : ''}" data-val="${escapeHtmlAttr(t)}">
          <span class="meaning-chip-check">${idx === 0 ? '✓' : ''}</span>
          <span class="meaning-chip-text">${escapeHtmlAttr(t)}</span>
        </div>
      `).join('') + `
        <button type="button" class="btn-add-custom-meaning" id="btn-reader-add-custom">+ Anlam Ekle</button>
        <div class="custom-meaning-inline-box hidden" id="reader-custom-box">
          <input type="text" id="input-reader-custom" class="custom-meaning-inline-input" placeholder="Özel anlam..." maxlength="50" />
          <button type="button" id="btn-reader-confirm-custom" class="btn-confirm-custom-meaning" title="Ekle">✓</button>
          <button type="button" id="btn-reader-cancel-custom" class="btn-cancel-custom-meaning" title="İptal">✕</button>
        </div>
      `;

      bindReaderModalMeaningChips(cleanTarget);
    };

    // --- 6. HEDEF KELİME VEYA KALIP İÇİN ANLIK GOOGLE TRANSLATE + EN MODAL AÇICI ---
    const openReaderModalForTarget = async (wordOrPhrase, offset = 0, meta = {}) => {
      const cleanTarget = (wordOrPhrase || '').trim();
      if (!cleanTarget) return;

      if (readerLookupAbortCtrl) {
        readerLookupAbortCtrl.abort();
      }
      readerLookupAbortCtrl = new AbortController();
      const mySeq = ++readerLookupSeq;
      const mySignal = readerLookupAbortCtrl.signal;

      const activePairInfo = meta?.pairInfo || null;
      currentSelectedTokenWord = cleanTarget;
      currentSelectedRawWord = (meta?.rawWord || cleanTarget).trim();
      currentSelectedTokenIndex = Number.isFinite(meta?.tokenIndex) ? meta.tokenIndex : -1;
      currentSelectedTokenOffset = offset;
      currentSelectedPipelineResult = null;
      isPipelinePending = true;

      const renderModalBannerArea = (sourceText) => {
        if (!modalBannerContainer) return;
        let bannerHtml = `<div class="reader-source-badge">${escapeHtmlAttr(sourceText || 'Google Translate (Canlı Çeviri)')}</div>`;
        if (activePairInfo && activePairInfo.rawWord && activePairInfo.rawWord.toLowerCase() !== cleanTarget.toLowerCase()) {
          const titleTag = activePairInfo.sourceType === 'manual' ? 'Manuel Birleştirildi' : 'Ayrılabilir Fiil Eşleşti';
          const detailText = activePairInfo.label
            ? `${titleTag}: ${activePairInfo.label} -> ${cleanTarget}`
            : `${titleTag}: ${cleanTarget}`;
          bannerHtml += `
            <div class="reader-pair-banner">
              <span>${escapeHtmlAttr(detailText)}</span>
              <button type="button" class="reader-pair-switch-btn" id="btn-reader-lookup-single">
                Sadece "${escapeHtmlAttr(activePairInfo.rawWord)}" kelimesine bak
              </button>
            </div>
          `;
        }
        modalBannerContainer.innerHTML = bannerHtml;
        if (activePairInfo) {
          const singleBtn = document.getElementById('btn-reader-lookup-single');
          singleBtn?.addEventListener('click', () => {
            readerDisplay?.querySelectorAll('.reader-token.active-inspect').forEach((t) => t.classList.remove('active-inspect'));
            if (activePairInfo.tokenIndex >= 0) {
              readerDisplay?.querySelector(`.reader-token[data-index="${activePairInfo.tokenIndex}"]`)?.classList.add('active-inspect');
            }
            openReaderModalForTarget(activePairInfo.rawWord, activePairInfo.offset ?? offset, {
              rawWord: activePairInfo.rawWord,
              tokenIndex: activePairInfo.tokenIndex
            });
          });
        }
      };

      if (modalWordTitle) modalWordTitle.textContent = cleanTarget;
      if (modalArticleBadge) modalArticleBadge.innerHTML = '';
      renderModalBannerArea('Google Translate (Canlı Çeviri)');

      // 0ms Senkron ön izleme (varsa yerel artikel + anlamları beklemeden göster)
      const instantEntry = window.DictionaryService?.synthesizeInstantEntry
        ? window.DictionaryService.synthesizeInstantEntry(cleanTarget)
        : null;
      if (instantEntry?.article && modalArticleBadge) {
        const safeInstantArt = this.escapeHtml(instantEntry.article);
        const st = window.getArticleStyle ? window.getArticleStyle(instantEntry.article) : null;
        modalArticleBadge.innerHTML = st ? st.badgeHtml : `<span class="badge badge-${safeInstantArt.toLowerCase()}">${safeInstantArt.toUpperCase()}</span>`;
      }
      renderReaderGrammarRow(instantEntry, cleanTarget);

      const instantTr = (instantEntry?.meaningsTr || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      const instantEn = (instantEntry?.meaningsEn || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      if (instantTr.length > 0) {
        renderReaderTrChips(instantTr, cleanTarget);
      } else if (modalTrChips) {
        modalTrChips.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">Google Çeviri yükleniyor...</span>';
      }
      if (instantEn.length > 0) {
        renderReaderEnChips(instantEn);
      } else if (modalEnChips) {
        modalEnChips.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">İngilizce karşılıklar alınıyor...</span>';
      }

      modalReader?.classList.remove('hidden');

      window.wmDB.getAllDecks().then((decks) => {
        if (mySeq !== readerLookupSeq || !modalDeckSelect) return;
        modalDeckSelect.innerHTML = (decks || []).map((d) => `<option value="${d.id}">${escapeHtmlAttr(d.name)}</option>`).join('');
      }).catch(() => {});

      const fastPromise = (window.DictionaryService && typeof window.DictionaryService.fastGoogleReaderLookup === 'function')
        ? window.DictionaryService.fastGoogleReaderLookup(cleanTarget, mySignal)
        : window.executeSmartSearchPipeline?.(cleanTarget, mySignal);
      activePipelinePromise = fastPromise;

      try {
        const res = await fastPromise;
        if (mySeq !== readerLookupSeq || mySignal.aborted) return;

        isPipelinePending = false;
        currentSelectedPipelineResult = res;

        if (!res) {
          if (modalTrChips) modalTrChips.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">Çeviri alınamadı.</span>';
          if (modalEnChips) modalEnChips.innerHTML = '<span style="font-size:0.78rem; color:var(--text-muted);">İngilizce karşılık bulunamadı.</span>';
          return;
        }

        const ent = res.entry || instantEntry;
        const art = ent?.article || '';
        if (art && modalArticleBadge) {
          const safeArt = this.escapeHtml(art);
          const st = window.getArticleStyle ? window.getArticleStyle(art) : null;
          modalArticleBadge.innerHTML = st ? st.badgeHtml : `<span class="badge badge-${safeArt.toLowerCase()}">${safeArt.toUpperCase()}</span>`;
        }

        renderModalBannerArea(res.sourceLabel || 'Google Translate (Canlı Çeviri)');

        renderReaderGrammarRow(ent, cleanTarget, res.stem || '');

        const trList = Array.isArray(res.trList) && res.trList.length > 0
          ? res.trList
          : (ent?.meaningsTr || res.translatedText || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
        renderReaderTrChips(trList, cleanTarget);

        const enList = Array.isArray(res.enList) && res.enList.length > 0
          ? res.enList
          : (ent?.meaningsEn || res.translatedEnText || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
        renderReaderEnChips(enList);
      } catch (err) {
        if (err?.name === 'AbortError' || mySeq !== readerLookupSeq) return;
        isPipelinePending = false;
        console.error('Reader Google lookup failed:', err);
      }
    };

    // --- 7. TEK TIKLAMAYLA ANLAM GÖRÜNTÜLEME (OLAY DELEGASYONU İLE 0ms RENDER) ---
    let isReaderDelegationBound = false;
    const bindReaderTokens = () => {
      if (!readerDisplay || isReaderDelegationBound) return;
      isReaderDelegationBound = true;

      readerDisplay.addEventListener('contextmenu', (e) => {
        const tokenEl = e.target?.closest?.('.reader-token');
        if (tokenEl && readerDisplay.contains(tokenEl)) {
          e.preventDefault();
        }
      });

      readerDisplay.addEventListener('click', (e) => {
        const tokenEl = e.target?.closest?.('.reader-token');
        if (!tokenEl || !readerDisplay.contains(tokenEl)) return;
        e.preventDefault();
        e.stopPropagation();

        const word = tokenEl.getAttribute('data-word');
        const offset = parseInt(tokenEl.getAttribute('data-offset') || '0', 10);
        const tokenIndex = parseInt(tokenEl.getAttribute('data-index') || '-1', 10);
        if (!word) return;

        if (pendingCombineAnchor) {
          const firstAnchor = pendingCombineAnchor;
          clearCombineMode();

          readerDisplay.querySelectorAll('.reader-token.active-inspect').forEach((t) => t.classList.remove('active-inspect'));

          if (tokenIndex === firstAnchor.index) {
            tokenEl.classList.add('active-inspect');
            openReaderModalForTarget(word, offset, { rawWord: word, tokenIndex });
            return;
          }

          const combined = window.GermanVerbHelper?.combinePairWords
            ? window.GermanVerbHelper.combinePairWords(firstAnchor.rawWord, word)
            : `${firstAnchor.rawWord} ${word}`.trim();

          if (firstAnchor.index >= 0) {
            readerDisplay.querySelector(`.reader-token[data-index="${firstAnchor.index}"]`)?.classList.add('active-inspect');
          }
          tokenEl.classList.add('active-inspect');

          const orderedLabel = firstAnchor.index >= 0 && tokenIndex >= 0 && tokenIndex < firstAnchor.index
            ? `${word} + ${firstAnchor.rawWord}`
            : `${firstAnchor.rawWord} + ${word}`;

          openReaderModalForTarget(combined, firstAnchor.offset ?? offset, {
            rawWord: word,
            tokenIndex,
            pairInfo: {
              infinitive: combined,
              rawWord: word,
              tokenIndex,
              offset,
              sourceType: 'manual',
              label: orderedLabel
            }
          });
          return;
        }

        readerDisplay.querySelectorAll('.reader-token.active-inspect').forEach((t) => t.classList.remove('active-inspect'));
        tokenEl.classList.add('active-inspect');

        const autoPairInf = tokenEl.getAttribute('data-pair-infinitive');
        if (autoPairInf) {
          const partnerIdx = parseInt(tokenEl.getAttribute('data-pair-partner-index') || '-1', 10);
          const partnerEl = partnerIdx >= 0
            ? readerDisplay.querySelector(`.reader-token[data-index="${partnerIdx}"]`)
            : null;
          partnerEl?.classList.add('active-inspect');
          const partnerWord = partnerEl?.getAttribute('data-word') || '';
          const orderedLabel = partnerWord
            ? (partnerIdx >= 0 && tokenIndex > partnerIdx ? `${partnerWord} ... ${word}` : `${word} ... ${partnerWord}`)
            : autoPairInf;

          openReaderModalForTarget(autoPairInf, offset, {
            rawWord: word,
            tokenIndex,
            pairInfo: {
              infinitive: autoPairInf,
              rawWord: word,
              tokenIndex,
              offset,
              sourceType: 'auto',
              label: orderedLabel
            }
          });
          return;
        }

        openReaderModalForTarget(word, offset, { rawWord: word, tokenIndex });
      });
    };

    const bindReaderModalMeaningChips = (word) => {
      modalTrChips?.querySelectorAll('.meaning-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const allSelected = modalTrChips.querySelectorAll('.meaning-chip.selected');
          const isSelected = chip.classList.contains('selected');
          if (isSelected && allSelected.length <= 1) {
            this.showToast('En az bir anlam seçili kalmalıdır.');
            return;
          }
          chip.classList.toggle('selected');
          const chk = chip.querySelector('.meaning-chip-check');
          if (chk) chk.textContent = chip.classList.contains('selected') ? '✓' : '';
        });
      });

      const addBtn = document.getElementById('btn-reader-add-custom');
      const box = document.getElementById('reader-custom-box');
      const inp = document.getElementById('input-reader-custom');
      const conf = document.getElementById('btn-reader-confirm-custom');
      const canc = document.getElementById('btn-reader-cancel-custom');

      const commitCustom = async () => {
        const val = inp?.value.trim();
        if (!val) return;
        const newChip = document.createElement('div');
        newChip.className = 'meaning-chip selected';
        newChip.setAttribute('data-val', val);
        const chkSpan = document.createElement('span');
        chkSpan.className = 'meaning-chip-check';
        chkSpan.textContent = '✓';
        const txtSpan = document.createElement('span');
        txtSpan.className = 'meaning-chip-text';
        txtSpan.textContent = val;
        newChip.appendChild(chkSpan);
        newChip.appendChild(txtSpan);
        modalTrChips?.insertBefore(newChip, addBtn);
        newChip.addEventListener('click', () => {
          newChip.classList.toggle('selected');
          const chk = newChip.querySelector('.meaning-chip-check');
          if (chk) chk.textContent = newChip.classList.contains('selected') ? '✓' : '';
        });
        await this.saveCustomMeaningForWord(word, val);
        if (inp) inp.value = '';
        box?.classList.add('hidden');
        addBtn?.classList.remove('hidden');
      };

      addBtn?.addEventListener('click', () => {
        addBtn.classList.add('hidden');
        box?.classList.remove('hidden');
        inp?.focus();
      });
      conf?.addEventListener('click', commitCustom);
      canc?.addEventListener('click', () => {
        if (inp) inp.value = '';
        box?.classList.add('hidden');
        addBtn?.classList.remove('hidden');
      });
      inp?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitCustom();
        }
      });
    };
  }
};
