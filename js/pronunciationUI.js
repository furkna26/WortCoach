/**
 * WortCoach - Telaffuz Koçu UI Modülü (pronunciationUI.js)
 * WortCoachApp.prototype üzerine bağlanır.
 */
window.WortCoachPronunciationUIMixin = {
  // --- DETAYLI TELAFFUZ KOÇU (AUSSPRACHE-TRAINER & ÇOKLU FONETİK MOTORU) ---
  bindPronunciationCoach() {
    this.pronState = {
      entry: null,
      mode: 'word', // 'word' | 'sentence'
      isTrainerSession: false,
      trainerCards: [],
      trainerIndex: 0
    };

    const modal = document.getElementById('modal-pronunciation-coach');
    if (!modal) return;

    document.getElementById('btn-close-pron-modal')?.addEventListener('click', async () => {
      if (window.wmPronunciation && window.wmPronunciation.isRecording) {
        await window.wmPronunciation.stopRecording();
      }
      this.resetPronunciationRecorderUI();
      modal.classList.add('hidden');
      this.navigateBack(this.activeTabId || 'tab-home');
    });

    // Fonetik Motoru Seçici (Hibrit / Wav2Vec2 CTC / MFA Viterbi / Azure)
    const engineSelect = document.getElementById('select-pron-phonetic-engine');
    engineSelect?.addEventListener('change', () => {
      if (window.wmPronunciation) {
        window.wmPronunciation.setSelectedEngine(engineSelect.value);
        const meta = window.wmPronunciation.getSelectedEngineMeta();
        this.showToast(`Fonetik Motoru: ${meta.shortLabel}`);
      }
      const settingsSelect = document.getElementById('select-settings-phonetic-engine');
      if (settingsSelect) settingsSelect.value = engineSelect.value;
      this.syncPronunciationEngineSelectorUI();
    });

    // Wav2Vec2 Neural CTC Modelini Ön Yükle / İndir Butonu
    const preloadBtn = document.getElementById('btn-pron-preload-wav2vec2');
    preloadBtn?.addEventListener('click', async () => {
      if (!window.wmPronunciation) return;
      preloadBtn.disabled = true;
      await window.wmPronunciation.preloadWav2Vec2Model((pct, msg) => {
        const descText = document.getElementById('pron-engine-desc-text');
        if (descText) descText.textContent = msg;
        preloadBtn.textContent = pct >= 100 ? ' Wav2Vec2 CTC Hazır' : `%${pct}`;
      });
      preloadBtn.disabled = false;
      this.syncPronunciationEngineSelectorUI();
    });

    document.getElementById('btn-pron-mode-word')?.addEventListener('click', () => {
      if (!this.pronState.entry) return;
      this.pronState.mode = 'word';
      this.renderPronunciationTarget();
    });

    document.getElementById('btn-pron-mode-sentence')?.addEventListener('click', () => {
      if (!this.pronState.entry) return;
      this.pronState.mode = 'sentence';
      this.renderPronunciationTarget();
    });

    document.getElementById('btn-pron-listen-native')?.addEventListener('click', () => {
      const targetText = this.getCurrentPronunciationTargetText();
      if (targetText && window.wmTTS) {
        window.wmTTS.speak(targetText, 'de-DE');
      }
    });

    document.getElementById('btn-pron-listen-self')?.addEventListener('click', () => {
      if (window.wmPronunciation) {
        window.wmPronunciation.playLastRecording();
      }
    });

    document.getElementById('btn-pron-record-toggle')?.addEventListener('click', () => {
      this.togglePronunciationRecording();
    });

    document.getElementById('btn-pron-prev-word')?.addEventListener('click', async () => {
      if (!this.pronState.isTrainerSession) return;
      if (window.wmPronunciation && window.wmPronunciation.isRecording) {
        await window.wmPronunciation.stopRecording();
      }
      if (this.pronState.trainerIndex > 0) {
        this.pronState.trainerIndex--;
        this.pronState.entry = this.pronState.trainerCards[this.pronState.trainerIndex];
        this.pronState.mode = 'word';
        this.renderPronunciationTarget();
      }
    });

    document.getElementById('btn-pron-next-word')?.addEventListener('click', async () => {
      if (!this.pronState.isTrainerSession) return;
      if (window.wmPronunciation && window.wmPronunciation.isRecording) {
        await window.wmPronunciation.stopRecording();
      }
      if (this.pronState.trainerIndex + 1 < this.pronState.trainerCards.length) {
        this.pronState.trainerIndex++;
        this.pronState.entry = this.pronState.trainerCards[this.pronState.trainerIndex];
        this.pronState.mode = 'word';
        this.renderPronunciationTarget();
      } else {
        this.showToast('Telaffuz antrenmanı tamamlandı! Harika pratik yaptınız. ');
        modal.classList.add('hidden');
        this.navigateBack('tab-games');
      }
    });

    this.syncPronunciationEngineSelectorUI();
  },

  syncPronunciationEngineSelectorUI() {
    if (!window.wmPronunciation) return;
    const selectedId = window.wmPronunciation.getSelectedEngine();
    const meta = window.wmPronunciation.getSelectedEngineMeta();
    const az = window.wmPronunciation.getAzureConfig();

    const engineSelect = document.getElementById('select-pron-phonetic-engine');
    if (engineSelect && engineSelect.value !== selectedId) {
      engineSelect.value = selectedId;
    }

    const engineBadge = document.getElementById('pron-engine-badge');
    if (engineBadge) {
      if (selectedId === 'AZURE_CLOUD') {
        engineBadge.textContent = az.isConfigured
          ? `Azure Cloud GOP (${az.region})`
          : 'Azure Anahtarı Yok • MFA Viterbi Aktif';
      } else {
        engineBadge.textContent = meta.shortLabel || meta.badgeText;
      }
    }

    const descText = document.getElementById('pron-engine-desc-text');
    const preloadBtn = document.getElementById('btn-pron-preload-wav2vec2');

    if (descText) {
      const compactDescMap = {
        HYBRID_ENSEMBLE: 'MFA Viterbi + Wav2Vec2 + Akustik DSP birleşimi',
        WAV2VEC2_CTC: 'Tarayıcı içi Wav2Vec2 Neural CTC fonem analizi',
        MFA_FORCED_ALIGN: 'Montreal Forced Aligner (MFA Viterbi) zaman hizalama',
        AZURE_CLOUD: 'Microsoft Azure Speech GOP bulut değerlendirmesi'
      };
      descText.textContent = compactDescMap[selectedId] || meta.shortLabel || 'Fonetik doğruluk analizi';
    }

    if (preloadBtn) {
      const showNeuralBtn = selectedId === 'WAV2VEC2_CTC' || selectedId === 'HYBRID_ENSEMBLE';
      preloadBtn.classList.toggle('hidden', !showNeuralBtn);
      if (window.wmPronunciation.wav2vec2Status === 'ready') {
        preloadBtn.textContent = ' Wav2Vec2 Aktif';
        preloadBtn.classList.add('is-ready');
      } else if (window.wmPronunciation.wav2vec2Status === 'loading') {
        preloadBtn.textContent = `%${window.wmPronunciation.wav2vec2Progress || 0}`;
        preloadBtn.classList.remove('is-ready');
      } else {
        preloadBtn.textContent = 'Modeli Yükle';
        preloadBtn.classList.remove('is-ready');
      }
    }
  },

  async startPronunciationTrainerSession(selectedDeckIds = null, options = {}) {
    if (!window.WordGameService) return;
    await window.WordGameService.initPool(selectedDeckIds && selectedDeckIds.length > 0 ? selectedDeckIds : 'all');
    const pool = window.WordGameService.poolCards || [];
    const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, 15);

    if (shuffled.length === 0) {
      this.showToast('Pratik yapılacak kelime bulunamadı.');
      return;
    }

    if (!window.wmPronunciation && window.WortCoachLoader && typeof window.WortCoachLoader.ensurePronunciation === 'function') {
      await window.WortCoachLoader.ensurePronunciation().catch(() => {});
      this.syncPronunciationEngineSelectorUI();
    }

    this.pronState.isTrainerSession = true;
    this.pronState.trainerCards = shuffled;
    this.pronState.trainerIndex = 0;
    this.pronState.entry = shuffled[0];
    this.pronState.mode = 'word';

    if (!options.skipRoutePush) {
      this.pushRoute('/fonetik-koc/antrenman', { trainer: true });
    }

    const modal = document.getElementById('modal-pronunciation-coach');
    if (modal) modal.classList.remove('hidden');
    this.renderPronunciationTarget();
  },

  async openPronunciationCoach(entry, initialMode = 'word', options = {}) {
    if (!entry) return;
    if (!window.wmPronunciation && window.WortCoachLoader && typeof window.WortCoachLoader.ensurePronunciation === 'function') {
      await window.WortCoachLoader.ensurePronunciation().catch(() => {});
      this.syncPronunciationEngineSelectorUI();
    }
    this.pronState.isTrainerSession = false;
    this.pronState.trainerCards = [];
    this.pronState.trainerIndex = 0;
    this.pronState.entry = entry;
    this.pronState.mode = initialMode === 'sentence' && entry.exampleSentence ? 'sentence' : 'word';

    if (!options.skipRoutePush) {
      const wSlug = encodeURIComponent((entry.germanWord || 'kelime').trim());
      const qMode = this.pronState.mode === 'sentence' ? '?mode=sentence' : '';
      this.pushRoute(`/fonetik-koc/${wSlug}${qMode}`, { word: entry.germanWord, mode: this.pronState.mode });
    }

    const modal = document.getElementById('modal-pronunciation-coach');
    if (modal) modal.classList.remove('hidden');
    this.renderPronunciationTarget();
  },

  getCurrentPronunciationTargetText() {
    const entry = this.pronState?.entry;
    if (!entry) return '';
    if (this.pronState.mode === 'sentence' && entry.exampleSentence) {
      return entry.exampleSentence.replace(/\s*\(.*?\)\s*$/, '').replace(/^\[.*?\]\s*/, '').trim();
    }
    const isNoun = (entry.partOfSpeech || '').toUpperCase() === 'NOUN' || Boolean(entry.article);
    const cleanW = (entry.germanWord || '').replace(/^(der|die|das)\s+/i, '').trim();
    return isNoun && entry.article
      ? `${entry.article} ${cleanW.charAt(0).toUpperCase() + cleanW.slice(1)}`
      : cleanW;
  },

  renderPronunciationTarget() {
    const entry = this.pronState?.entry;
    if (!entry) return;

    this.resetPronunciationRecorderUI();

    // Trainer sayaç ve alt navigasyon görünürlüğü
    const counterEl = document.getElementById('pron-trainer-counter');
    const navEl = document.getElementById('pron-trainer-nav');
    const titleEl = document.getElementById('pron-modal-title');

    if (this.pronState.isTrainerSession) {
      if (titleEl) titleEl.textContent = 'Aussprache-Trainer';
      if (counterEl) {
        counterEl.classList.remove('hidden');
        counterEl.textContent = `${this.pronState.trainerIndex + 1} / ${this.pronState.trainerCards.length}`;
      }
      if (navEl) navEl.classList.remove('hidden');
      const prevBtn = document.getElementById('btn-pron-prev-word');
      if (prevBtn) prevBtn.disabled = this.pronState.trainerIndex === 0;
      const nextBtn = document.getElementById('btn-pron-next-word');
      if (nextBtn) {
        nextBtn.querySelector('span').textContent =
          this.pronState.trainerIndex + 1 >= this.pronState.trainerCards.length ? 'Antrenmanı Bitir' : 'Sonraki Kelime';
      }
    } else {
      if (titleEl) titleEl.textContent = 'Telaffuz Koçu';
      if (counterEl) counterEl.classList.add('hidden');
      if (navEl) navEl.classList.add('hidden');
    }

    // Seçili Fonetik Motoru rozeti ve seçici senkronizasyonu
    this.syncPronunciationEngineSelectorUI();

    // Kelime / Cümle geçiş barı
    const switcher = document.getElementById('pron-mode-switcher');
    const hasSentence = Boolean(entry.exampleSentence && entry.exampleSentence.trim().length > 2);
    if (switcher) {
      switcher.classList.toggle('hidden', !hasSentence);
      document.getElementById('btn-pron-mode-word')?.classList.toggle('active', this.pronState.mode === 'word');
      document.getElementById('btn-pron-mode-sentence')?.classList.toggle('active', this.pronState.mode === 'sentence');
    }

    const targetText = this.getCurrentPronunciationTargetText();
    const targetWordEl = document.getElementById('pron-target-text');
    if (targetWordEl) {
      targetWordEl.textContent = targetText;
      targetWordEl.style.fontSize = this.pronState.mode === 'sentence' ? '1.22rem' : '1.75rem';
    }

    const meaningEl = document.getElementById('pron-target-meaning');
    if (meaningEl) {
      meaningEl.textContent = entry.meaningsTr || entry.meaningsEn || '';
    }

    // Fonetik Analiz (IPA, Türkçe Okunuş, Heceler ve Kritik İpuçları)
    const analysis = window.GermanPhoneticAnalyzer
      ? window.GermanPhoneticAnalyzer.analyzeText(targetText)
      : { ipa: '/-/', trGuide: '-', syllables: [], focusTips: [] };

    const ipaEl = document.getElementById('pron-target-ipa');
    if (ipaEl) ipaEl.textContent = analysis.ipa;

    const trGuideEl = document.getElementById('pron-target-tr-guide');
    if (trGuideEl) trGuideEl.textContent = `Okunuş: ${analysis.trGuide}`;

    // Heceleri nötr (bekleme) durumunda çiz
    const sylContainer = document.getElementById('pron-syllables-container');
    if (sylContainer) {
      sylContainer.innerHTML = analysis.syllables
        .map(
          (syl) => `
          <div class="pron-syl-chip neutral">
            <span class="pron-syl-text">${this.escapeHtml(syl.text)}</span>
            <span class="pron-syl-ipa">[${this.escapeHtml(syl.ipa)}]</span>
          </div>
        `
        )
        .join('');
    }

    // Kelimeye Özel Fonetik İpuçlarını Çiz
    const tipsBox = document.getElementById('pron-tips-box');
    const tipsList = document.getElementById('pron-tips-list');
    if (tipsBox && tipsList) {
      if (analysis.focusTips && analysis.focusTips.length > 0) {
        tipsBox.classList.remove('hidden');
        tipsList.innerHTML = analysis.focusTips
          .map(
            (t) => `
            <div class="pron-tip-item">
              <strong class="pron-tip-title">${this.escapeHtml(t.title)}:</strong>
              <span class="pron-tip-detail">${this.escapeHtml(t.detail)}</span>
            </div>
          `
          )
          .join('');
      } else {
        tipsBox.classList.remove('hidden');
        tipsList.innerHTML = `
          <div class="pron-tip-item">
            <strong class="pron-tip-title">Standart Vurgu Kuralı:</strong>
            <span class="pron-tip-detail">İlk heceyi daha baskın okuyun ve ünsüzleri kelime sonunda net çıkarın.</span>
          </div>
        `;
      }
    }

    // Sonuç panelini gizle
    document.getElementById('pron-result-panel')?.classList.add('hidden');
  },

  resetPronunciationRecorderUI() {
    const recBtn = document.getElementById('btn-pron-record-toggle');
    const recBox = document.getElementById('pron-recorder-box');
    const hintEl = document.getElementById('pron-status-hint');
    const bars = document.querySelectorAll('#pron-waveform-bars .wf-bar');

    recBtn?.classList.remove('is-recording');
    recBox?.classList.remove('is-recording');
    if (hintEl) {
      hintEl.textContent = 'Mikrofona dokunun ve Almanca ifadeyi net bir şekilde okuyun';
      hintEl.style.color = 'var(--text-secondary)';
    }
    bars.forEach((b) => {
      b.style.height = '6px';
    });
  },

  async togglePronunciationRecording() {
    if (!window.wmPronunciation) return;
    const recBtn = document.getElementById('btn-pron-record-toggle');
    const recBox = document.getElementById('pron-recorder-box');
    const hintEl = document.getElementById('pron-status-hint');
    const bars = document.querySelectorAll('#pron-waveform-bars .wf-bar');

    if (!window.wmPronunciation.isRecording) {
      // Kaydı Başlat
      try {
        if (navigator.vibrate) navigator.vibrate(15);
        recBtn?.classList.add('is-recording');
        recBox?.classList.add('is-recording');
        if (hintEl) {
          hintEl.textContent = ' Dinleniyor... Okumayı bitirince tekrar dokunun';
          hintEl.style.color = '#FF453A';
        }

        await window.wmPronunciation.startRecording('de-DE', (freqData) => {
          if (!bars || bars.length === 0) return;
          const step = Math.max(1, Math.floor(freqData.length / (bars.length * 2.5)));
          bars.forEach((bar, idx) => {
            const val = freqData[idx * step] || 0;
            const h = Math.max(5, Math.min(38, Math.round((val / 255) * 38)));
            bar.style.height = `${h}px`;
          });
        });

        // Otomatik güvenlik zaman aşımı (8 saniye)
        if (this.pronAutoStopTimer) clearTimeout(this.pronAutoStopTimer);
        this.pronAutoStopTimer = setTimeout(() => {
          if (window.wmPronunciation && window.wmPronunciation.isRecording) {
            this.togglePronunciationRecording();
          }
        }, 8000);
      } catch (err) {
        this.resetPronunciationRecorderUI();
        this.showToast('Mikrofon izni alınamadı. Lütfen tarayıcı ayarlarından mikrofona izin verin.');
      }
    } else {
      // Kaydı Durdur ve Değerlendir
      if (this.pronAutoStopTimer) {
        clearTimeout(this.pronAutoStopTimer);
        this.pronAutoStopTimer = null;
      }
      if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
      recBtn?.classList.remove('is-recording');
      recBox?.classList.remove('is-recording');
      if (hintEl) {
        hintEl.textContent = 'Fonetik motoru ses çerçevelerini hizalıyor...';
        hintEl.style.color = 'var(--brand-blue)';
      }

      const targetText = this.getCurrentPronunciationTargetText();
      const report = await window.wmPronunciation.stopRecordingAndEvaluate(targetText, (statusMsg) => {
        if (hintEl && statusMsg) {
          hintEl.textContent = statusMsg;
          hintEl.style.color = 'var(--brand-blue)';
        }
      });
      this.syncPronunciationEngineSelectorUI();
      this.renderPronunciationEvaluation(report);
    }
  },

  renderPronunciationEvaluation(report) {
    this.resetPronunciationRecorderUI();
    if (!report) return;

    const selfBtn = document.getElementById('btn-pron-listen-self');
    if (selfBtn && report.recordedAudioUrl) {
      selfBtn.disabled = false;
    }

    const hintEl = document.getElementById('pron-status-hint');

    if (!report.hasSpeech) {
      if (hintEl) {
        hintEl.textContent = report.error || 'Net bir konuşma algılanamadı. Tekrar deneyin.';
        hintEl.style.color = '#FF9F0A';
      }
      this.showToast('Ses çok kısık veya kısa algılandı, tekrar deneyin.');
      return;
    }

    if (hintEl) {
      hintEl.textContent = `${report.engineName || 'Fonetik Motoru'} ile analiz tamamlandı!`;
      hintEl.style.color = 'var(--text-secondary)';
    }

    const engineBadge = document.getElementById('pron-engine-badge');
    if (engineBadge && report.engineName) {
      engineBadge.textContent = report.engineName;
    }

    // 1. Hece Kartlarını Renkli Doğruluk Oranlarıyla Güncelle
    const sylContainer = document.getElementById('pron-syllables-container');
    if (sylContainer && Array.isArray(report.syllables)) {
      sylContainer.innerHTML = report.syllables
        .map(
          (syl) => `
          <div class="pron-syl-chip status-${this.escapeHtml(syl.status)}">
            <span class="pron-syl-text">${this.escapeHtml(syl.text)}</span>
            <span class="pron-syl-ipa">[${this.escapeHtml(syl.ipa)}]</span>
            <span class="pron-syl-score">%${Number(syl.score) || 0}</span>
          </div>
        `
        )
        .join('');
    }

    // 2. Sonuç Panelini Göster
    const resPanel = document.getElementById('pron-result-panel');
    if (resPanel) resPanel.classList.remove('hidden');

    const scoreCircle = document.getElementById('pron-score-circle');
    const overallVal = document.getElementById('pron-overall-score-val');
    const overall = report.overallScore || 0;

    if (overallVal) overallVal.textContent = `%${overall}`;
    if (scoreCircle) {
      scoreCircle.className = 'pron-score-circle';
      if (overall >= 84) scoreCircle.classList.add('score-good');
      else if (overall >= 64) scoreCircle.classList.add('score-warning');
      else scoreCircle.classList.add('score-bad');
    }

    // 3 Alt Metrik Çubuğu
    const setMetric = (idPrefix, val) => {
      const vEl = document.getElementById(`${idPrefix}-val`);
      const bEl = document.getElementById(`${idPrefix}-bar`);
      const color = val >= 84 ? '#30D158' : val >= 64 ? '#FF9F0A' : '#FF453A';
      if (vEl) {
        vEl.textContent = `%${val}`;
        vEl.style.color = color;
      }
      if (bEl) {
        bEl.style.width = `${val}%`;
        bEl.style.backgroundColor = color;
      }
    };

    setMetric('pron-metric-accuracy', report.accuracyScore || overall);
    setMetric('pron-metric-prosody', report.prosodyScore || overall);
    setMetric('pron-metric-fluency', report.fluencyScore || overall);

    // 4. Fonem Kırılım Çipleri (MFA Viterbi / Wav2Vec2 CTC milisaniye hizalaması ile)
    const phonContainer = document.getElementById('pron-phoneme-breakdown');
    if (phonContainer && Array.isArray(report.syllables)) {
      const allPhonemes = report.syllables.flatMap((s) => s.phonemes || []);
      phonContainer.innerHTML = allPhonemes
        .map((p) => {
          const timeTag =
            p.endMs && p.endMs > p.startMs
              ? `<span class="pp-time-span" title="Zorlamalı Hizalama (Forced Alignment) Aralığı">${p.startMs}–${p.endMs}ms</span>`
              : '';
          return `
          <div class="pron-phoneme-pill status-${this.escapeHtml(p.status || (p.score >= 84 ? 'good' : p.score >= 64 ? 'warning' : 'bad'))}">
            <span class="pp-grapheme">${this.escapeHtml(p.grapheme)}</span>
            <span class="pp-ipa">/${this.escapeHtml(p.ipa)}/</span>
            <strong class="pp-score">%${Number(p.score) || 0}</strong>
            ${timeTag}
          </div>
        `;
        })
        .join('');
    }

    // 5. Spesifik Akustik Geri Bildirim Listesi
    const fbList = document.getElementById('pron-feedback-list');
    if (fbList && Array.isArray(report.feedbackTips)) {
      fbList.innerHTML = report.feedbackTips.map((tip) => `<li>${this.escapeHtml(tip)}</li>`).join('');
    }
  }
};
