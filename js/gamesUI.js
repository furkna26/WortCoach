/**
 * WortCoach - Kelime Oyunları & Kablo Eşleştirme UI Modülü (gamesUI.js)
 * WortCoachApp.prototype üzerine bağlanır.
 */
window.WortCoachGamesUIMixin = {
  // --- KELİME OYUNLARI, DESTE SEÇİMİ & KABLO EŞLEŞTİRME (v2.6.0) ---
  bindGames() {
    // Hem genel oyun kartları hem de öne çıkan Kablo Oyunu kartı deste seçimini tetikler
    const cards = document.querySelectorAll('.game-card, .featured-game-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        if (card.id === 'btn-open-coach-card') {
          this.switchTab('tab-coach');
          return;
        }
        if (card.id === 'btn-open-smart-reader-card') {
          this.switchTab('tab-reader');
          return;
        }
        if (card.id === 'btn-open-deck-builder-card' || card.id === 'btn-open-satz-builder-card') {
          return;
        }
        const gameType = card.getAttribute('data-game-type') || 'MIXED';
        this.openGameDeckSelectionModal(gameType);
      });
    });

    document.getElementById('btn-coach-back-to-games')?.addEventListener('click', () => {
      this.switchTab('tab-games');
    });

    document.getElementById('btn-reader-back-to-games')?.addEventListener('click', () => {
      this.switchTab('tab-games');
    });

    document.getElementById('btn-close-game-quiz')?.addEventListener('click', () => {
      if (this.gameTimerInterval) {
        clearInterval(this.gameTimerInterval);
        this.gameTimerInterval = null;
      }
      document.getElementById('modal-game-quiz')?.classList.add('hidden');
      this.navigateBack('tab-games');
    });

    document.getElementById('btn-game-finish')?.addEventListener('click', () => {
      document.getElementById('modal-game-quiz')?.classList.add('hidden');
      this.refreshHomeDashboard();
      this.navigateBack('tab-games');
    });

    document.getElementById('btn-game-play-again')?.addEventListener('click', () => {
      if (window.WordGameService && window.WordGameService.currentGameType) {
        this.openGameQuizModal(window.WordGameService.currentGameType, { skipRoutePush: true });
      }
    });

    document.getElementById('btn-game-next')?.addEventListener('click', () => {
      if (window.WordGameService) {
        window.WordGameService.nextQuestion();
        this.renderGameCurrentQuestion();
      }
    });

    // Oyunlar & Kart Alıştırması Alt Sekme Değiştirici
    document.getElementById('btn-subview-games')?.addEventListener('click', () => {
      this.activateGamesSubview('games');
    });
    document.getElementById('btn-subview-study')?.addEventListener('click', () => {
      this.activateGamesSubview('study');
    });

    this.bindGameDeckSelectionModal();
    this.bindCableGameModal();

    if (!this._gameKbBound) {
      this._gameKbBound = true;
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const active = document.activeElement;
        if (active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable)) return;

        const quizModal = document.getElementById('modal-game-quiz');
        if (!quizModal || quizModal.classList.contains('hidden')) return;

        const keyLower = (e.key || '').toLowerCase();
        const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
        if (Object.prototype.hasOwnProperty.call(keyMap, keyLower)) {
          const btns = quizModal.querySelectorAll('#game-options-container .game-option-btn');
          const targetBtn = btns[keyMap[keyLower]];
          if (targetBtn && !targetBtn.disabled) {
            e.preventDefault();
            targetBtn.click();
          }
          return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
          const nextBtn = document.getElementById('btn-game-next');
          if (nextBtn && !nextBtn.classList.contains('hidden') && !nextBtn.disabled) {
            e.preventDefault();
            nextBtn.click();
          }
        }
      });
    }
  },

  // --- OYUN İÇİN DESTE SEÇİM EKRANI ---
  bindGameDeckSelectionModal() {
    document.getElementById('btn-close-game-deck-select')?.addEventListener('click', () => {
      document.getElementById('modal-game-deck-select')?.classList.add('hidden');
      this.navigateBack('tab-games');
    });

    document.getElementById('btn-gds-toggle-all')?.addEventListener('click', () => {
      const cbs = document.querySelectorAll('.gds-deck-checkbox');
      const anyUnchecked = Array.from(cbs).some((cb) => !cb.checked);
      cbs.forEach((cb) => {
        cb.checked = anyUnchecked;
        const row = cb.closest('.deck-select-row-card');
        if (row) row.classList.toggle('selected', anyUnchecked);
      });
    });

    // Süre Modu (Zamanla Yarış) Butonları
    document.querySelectorAll('#gds-time-pills .time-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#gds-time-pills .time-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        this.selectedGameDuration = Number(pill.getAttribute('data-time')) || 0;
        const lbl = document.getElementById('gds-time-label');
        if (lbl) {
          lbl.textContent = this.selectedGameDuration === 0 ? 'Süresiz' : `${this.selectedGameDuration} saniye`;
        }
      });
    });

    document.getElementById('btn-gds-start-game')?.addEventListener('click', async () => {
      const cbs = document.querySelectorAll('.gds-deck-checkbox:checked');
      const selectedDeckIds = Array.from(cbs).map((cb) => cb.value);

      document.getElementById('modal-game-deck-select')?.classList.add('hidden');

      if (window.WordGameService) {
        window.WordGameService.setDuration(this.selectedGameDuration || 0);
        await window.WordGameService.initPool(selectedDeckIds.length > 0 ? selectedDeckIds : 'all');
      }

      if (this.pendingGameType === 'CABLE_MATCH') {
        this.openCableGameModal(selectedDeckIds);
      } else if (this.pendingGameType === 'PRONUNCIATION_TRAINER') {
        this.startPronunciationTrainerSession(selectedDeckIds);
      } else {
        this.openGameQuizModal(this.pendingGameType || 'MIXED');
      }
    });
  },

  async openGameDeckSelectionModal(gameType, options = {}) {
    this.pendingGameType = gameType;
    const modal = document.getElementById('modal-game-deck-select');
    if (!modal) return;

    if (!options.skipRoutePush) {
      this.pushRoute(`/oyunlar/secim-${encodeURIComponent(gameType)}`, { gameType });
    }

    const titleEl = document.getElementById('gds-title');
    const subEl = document.getElementById('gds-subtitle');
    const listEl = document.getElementById('gds-deck-list');

    if (gameType === 'CABLE_MATCH') {
      if (titleEl) titleEl.textContent = 'Kablo Eşleştirme — Deste Seçimi';
      if (subEl) subEl.textContent = 'Kablolarla bağlayacağınız kelimelerin destelerini seçin';
    } else if (gameType === 'PRONUNCIATION_TRAINER') {
      if (titleEl) titleEl.textContent = 'Telaffuz Koçu — Deste Seçimi';
      if (subEl) subEl.textContent = 'Akustik ve fonetik telaffuz pratiği yapacağınız desteleri seçin';
    } else {
      if (titleEl) titleEl.textContent = 'Kelime Testi — Deste Seçimi';
      if (subEl) subEl.textContent = 'Test sorularında kullanılacak desteleri belirleyin';
    }

    let decks = [];
    let allCards = [];
    try {
      decks = await window.wmDB.getAllDecks();
      allCards = await window.wmDB.getAllCards();
    } catch (_) {}

    const deckCounts = {};
    for (const c of allCards) {
      const dId = String(c.deckId);
      deckCounts[dId] = (deckCounts[dId] || 0) + 1;
    }

    if (listEl) {
      if (decks.length === 0) {
        listEl.innerHTML = `
          <div class="deck-select-row-card selected">
            <div style="display:flex; align-items:center; gap:12px;">
              <input type="checkbox" class="deck-select-checkbox gds-deck-checkbox" value="all" checked>
              <div>
                <strong style="display:block; font-size:0.92rem;">Tüm Kelimeler</strong>
                <span style="font-size:0.75rem; color:var(--text-muted);">${allCards.length || 20} kelime</span>
              </div>
            </div>
          </div>
        `;
      } else {
        listEl.innerHTML = decks
          .map((d) => {
            const count = deckCounts[String(d.id)] || 0;
            return `
              <label class="deck-select-row-card selected" data-deck-id="${this.escapeHtml(d.id)}">
                <div style="display:flex; align-items:center; gap:12px;">
                  <input type="checkbox" class="deck-select-checkbox gds-deck-checkbox" value="${this.escapeHtml(d.id)}" checked>
                  <div>
                    <strong style="display:block; font-size:0.92rem; color:var(--text-primary);">${this.escapeHtml(d.name)}</strong>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${count} kelime kayıtlı</span>
                  </div>
                </div>
                <span class="badge" style="background:rgba(59,130,246,0.15); color:var(--brand-blue); font-size:0.72rem; padding:3px 8px; border-radius:999px;">${count}</span>
              </label>
            `;
          })
          .join('');

        listEl.querySelectorAll('.deck-select-row-card').forEach((row) => {
          const cb = row.querySelector('.gds-deck-checkbox');
          row.addEventListener('click', (e) => {
            if (e.target !== cb) {
              cb.checked = !cb.checked;
            }
            row.classList.toggle('selected', cb.checked);
          });
        });
      }
    }

    modal.classList.remove('hidden');
  },

  // --- KABLO İLE ANLAM EŞLEŞTİRME OYUNU MOTORU ---
  bindCableGameModal() {
    document.getElementById('btn-close-cable-game')?.addEventListener('click', () => {
      document.getElementById('modal-cable-game')?.classList.add('hidden');
      this.refreshHomeDashboard();
      this.navigateBack('tab-games');
    });

    document.getElementById('btn-cable-restart')?.addEventListener('click', () => {
      this.startCableRound();
    });

    document.getElementById('btn-cable-next-round')?.addEventListener('click', () => {
      this.startCableRound();
    });

    // Pencere yeniden boyutlandırıldığında kabloları pixel-perfect yeniden hizala
    window.addEventListener('resize', () => {
      if (document.getElementById('modal-cable-game')?.classList.contains('hidden')) return;
      this.redrawCableConnections();
    });
  },

  openCableGameModal(selectedDeckIds = null, options = {}) {
    const modal = document.getElementById('modal-cable-game');
    if (!modal) return;
    this.cableSelectedDeckIds = selectedDeckIds;
    if (!options.skipRoutePush) {
      this.pushRoute('/oyunlar/CABLE_MATCH', { gameType: 'CABLE_MATCH' });
    }
    modal.classList.remove('hidden');
    this.startCableRound();
  },

  startCableRound() {
    if (!window.WordGameService) return;
    const roundData = window.WordGameService.generateCableMatchRound(5);
    this.cableRound = {
      roundData,
      connections: [],
      matchedCount: 0,
      totalPairs: roundData.totalPairs,
      selectedSource: null
    };

    const svgLayer = document.getElementById('cable-svg-layer');
    if (svgLayer) svgLayer.innerHTML = '';

    const feedbackBanner = document.getElementById('cable-feedback-banner');
    if (feedbackBanner) {
      feedbackBanner.className = 'cable-feedback-banner hidden';
      feedbackBanner.textContent = '';
    }

    document.getElementById('btn-cable-next-round')?.classList.add('hidden');
    const matchedCountEl = document.getElementById('cable-matched-count');
    if (matchedCountEl) matchedCountEl.textContent = `0 / ${roundData.totalPairs}`;

    const leftCol = document.getElementById('cable-left-col');
    const rightCol = document.getElementById('cable-right-col');
    if (!leftCol || !rightCol) return;

    // Sol Sütun (Almanca)
    leftCol.innerHTML = roundData.leftItems
      .map(
        (item) => `
        <div class="cable-node-card cable-node-left" data-id="${this.escapeHtml(item.id)}" data-card-id="${this.escapeHtml(item.cardId)}">
          <span class="cable-node-text">${this.escapeHtml(item.display)}</span>
          <div class="cable-socket cable-socket-left" data-socket-id="${this.escapeHtml(item.id)}"></div>
        </div>
      `
      )
      .join('');

    // Sağ Sütun (Türkçe Anlamlar)
    rightCol.innerHTML = roundData.rightItems
      .map(
        (item) => `
        <div class="cable-node-card cable-node-right" data-id="${this.escapeHtml(item.id)}" data-card-id="${this.escapeHtml(item.cardId)}">
          <div class="cable-socket cable-socket-right" data-socket-id="${this.escapeHtml(item.id)}"></div>
          <span class="cable-node-text">${this.escapeHtml(item.display)}</span>
        </div>
      `
      )
      .join('');

    this.bindCableArenaInteractions();
  },

  bindCableArenaInteractions() {
    const arena = document.getElementById('cable-arena-wrapper');
    const svgLayer = document.getElementById('cable-svg-layer');
    if (!arena || !svgLayer) return;

    let dragActive = false;
    let dragStartNode = null;
    let dragTempPath = null;

    const getSocketCenter = (socketEl) => {
      const sRect = socketEl.getBoundingClientRect();
      const aRect = svgLayer.getBoundingClientRect();
      return {
        x: sRect.left + sRect.width / 2 - aRect.left,
        y: sRect.top + sRect.height / 2 - aRect.top
      };
    };

    const getCurveD = (x1, y1, x2, y2) => {
      const dx = Math.abs(x2 - x1) * 0.45;
      const sag = Math.max(12, Math.abs(y2 - y1) * 0.12);
      return `M ${x1} ${y1} C ${x1 + dx} ${y1 + sag}, ${x2 - dx} ${y2 + sag}, ${x2} ${y2}`;
    };

    const handleNodeSelection = (side, cardEl) => {
      if (cardEl.classList.contains('matched')) return;

      const cardId = cardEl.getAttribute('data-card-id');
      const id = cardEl.getAttribute('data-id');
      const socketEl = cardEl.querySelector('.cable-socket');
      const state = this.cableRound;

      if (!state.selectedSource) {
        state.selectedSource = { side, id, cardId, cardEl, socketEl };
        cardEl.classList.add('selected-source');
        const nextColor = state.roundData.wireColors[state.matchedCount % state.roundData.wireColors.length];
        cardEl.style.setProperty('--active-wire-color', nextColor);
      } else if (state.selectedSource.side === side) {
        state.selectedSource.cardEl.classList.remove('selected-source');
        state.selectedSource.cardEl.style.removeProperty('--active-wire-color');
        if (state.selectedSource.id === id) {
          state.selectedSource = null;
        } else {
          state.selectedSource = { side, id, cardId, cardEl, socketEl };
          cardEl.classList.add('selected-source');
          const nextColor = state.roundData.wireColors[state.matchedCount % state.roundData.wireColors.length];
          cardEl.style.setProperty('--active-wire-color', nextColor);
        }
      } else {
        const source = state.selectedSource;
        const target = { side, id, cardId, cardEl, socketEl };

        const leftNode = source.side === 'left' ? source : target;
        const rightNode = source.side === 'right' ? source : target;

        source.cardEl.classList.remove('selected-source');
        source.cardEl.style.removeProperty('--active-wire-color');
        state.selectedSource = null;

        this.processCableConnection(leftNode, rightNode);
      }
    };

    arena.querySelectorAll('.cable-node-left').forEach((card) => {
      card.addEventListener('click', () => handleNodeSelection('left', card));
    });

    arena.querySelectorAll('.cable-node-right').forEach((card) => {
      card.addEventListener('click', () => handleNodeSelection('right', card));
    });

    arena.querySelectorAll('.cable-socket').forEach((socket) => {
      socket.addEventListener('pointerdown', (e) => {
        const card = socket.closest('.cable-node-card');
        if (!card || card.classList.contains('matched')) return;

        dragActive = true;
        const isLeft = card.classList.contains('cable-node-left');
        dragStartNode = {
          side: isLeft ? 'left' : 'right',
          id: card.getAttribute('data-id'),
          cardId: card.getAttribute('data-card-id'),
          cardEl: card,
          socketEl: socket
        };

        const p1 = getSocketCenter(socket);
        const nextColor = this.cableRound.roundData.wireColors[this.cableRound.matchedCount % this.cableRound.roundData.wireColors.length];

        dragTempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        dragTempPath.setAttribute('d', `M ${p1.x} ${p1.y} L ${p1.x} ${p1.y}`);
        dragTempPath.setAttribute('stroke', nextColor);
        dragTempPath.setAttribute('stroke-width', '5');
        dragTempPath.setAttribute('fill', 'none');
        dragTempPath.setAttribute('stroke-linecap', 'round');
        dragTempPath.setAttribute('stroke-dasharray', '8 4');
        dragTempPath.classList.add('cable-wire-path');
        svgLayer.appendChild(dragTempPath);

        socket.setPointerCapture(e.pointerId);
      });

      socket.addEventListener('pointermove', (e) => {
        if (!dragActive || !dragTempPath || !dragStartNode) return;
        const p1 = getSocketCenter(dragStartNode.socketEl);
        const aRect = svgLayer.getBoundingClientRect();
        const p2 = { x: e.clientX - aRect.left, y: e.clientY - aRect.top };

        const d = dragStartNode.side === 'left' ? getCurveD(p1.x, p1.y, p2.x, p2.y) : getCurveD(p2.x, p2.y, p1.x, p1.y);
        dragTempPath.setAttribute('d', d);
      });

      const onPointerEnd = (e) => {
        if (!dragActive) return;
        dragActive = false;

        if (dragTempPath) {
          dragTempPath.remove();
          dragTempPath = null;
        }

        const dropTarget = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cable-node-card');
        if (dropTarget && !dropTarget.classList.contains('matched') && dragStartNode) {
          const targetIsLeft = dropTarget.classList.contains('cable-node-left');
          const targetSide = targetIsLeft ? 'left' : 'right';

          if (targetSide !== dragStartNode.side) {
            const targetNode = {
              side: targetSide,
              id: dropTarget.getAttribute('data-id'),
              cardId: dropTarget.getAttribute('data-card-id'),
              cardEl: dropTarget,
              socketEl: dropTarget.querySelector('.cable-socket')
            };

            const leftNode = dragStartNode.side === 'left' ? dragStartNode : targetNode;
            const rightNode = dragStartNode.side === 'right' ? dragStartNode : targetNode;

            this.processCableConnection(leftNode, rightNode);
          }
        }
        dragStartNode = null;
      };

      socket.addEventListener('pointerup', onPointerEnd);
      socket.addEventListener('pointercancel', onPointerEnd);
    });
  },

  processCableConnection(leftNode, rightNode) {
    const state = this.cableRound;
    const svgLayer = document.getElementById('cable-svg-layer');
    if (!svgLayer || !leftNode || !rightNode) return;

    const getSocketCenter = (socketEl) => {
      const sRect = socketEl.getBoundingClientRect();
      const aRect = svgLayer.getBoundingClientRect();
      return {
        x: sRect.left + sRect.width / 2 - aRect.left,
        y: sRect.top + sRect.height / 2 - aRect.top
      };
    };

    const getCurveD = (x1, y1, x2, y2) => {
      const dx = Math.abs(x2 - x1) * 0.45;
      const sag = Math.max(12, Math.abs(y2 - y1) * 0.12);
      return `M ${x1} ${y1} C ${x1 + dx} ${y1 + sag}, ${x2 - dx} ${y2 + sag}, ${x2} ${y2}`;
    };

    const p1 = getSocketCenter(leftNode.socketEl);
    const p2 = getSocketCenter(rightNode.socketEl);

    if (String(leftNode.cardId) === String(rightNode.cardId)) {
      // --- DOĞRU EŞLEŞTİRME ---
      const wireColor = state.roundData.wireColors[state.matchedCount % state.roundData.wireColors.length];

      const wirePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      wirePath.setAttribute('d', getCurveD(p1.x, p1.y, p2.x, p2.y));
      wirePath.setAttribute('stroke', wireColor);
      wirePath.setAttribute('stroke-width', '5.5');
      wirePath.setAttribute('fill', 'none');
      wirePath.setAttribute('stroke-linecap', 'round');
      wirePath.classList.add('cable-wire-path', 'connected');
      svgLayer.appendChild(wirePath);

      leftNode.cardEl.classList.add('matched');
      leftNode.cardEl.style.setProperty('--matched-wire-color', wireColor);

      rightNode.cardEl.classList.add('matched');
      rightNode.cardEl.style.setProperty('--matched-wire-color', wireColor);

      state.connections.push({
        leftId: leftNode.id,
        rightId: rightNode.id,
        wireColor,
        pathEl: wirePath,
        leftSocket: leftNode.socketEl,
        rightSocket: rightNode.socketEl
      });

      // Telaffuz ve Titreşim
      const leftItem = state.roundData.leftItems.find((item) => item.id === leftNode.id);
      if (leftItem && window.wmTTS) {
        window.wmTTS.speak(leftItem.germanWord, 'de-DE');
      }
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);

      state.matchedCount++;
      const matchedEl = document.getElementById('cable-matched-count');
      if (matchedEl) matchedEl.textContent = `${state.matchedCount} / ${state.totalPairs}`;

      if (state.matchedCount >= state.totalPairs) {
        const feedback = document.getElementById('cable-feedback-banner');
        if (feedback) {
          feedback.className = 'cable-feedback-banner success';
          feedback.textContent = 'Harika! 5/5 Eşleşme Başarıyla Tamamlandı!';
        }
        document.getElementById('btn-cable-next-round')?.classList.remove('hidden');
        if (navigator.vibrate) navigator.vibrate([60, 80, 100]);
      }
    } else {
      // --- YANLIŞ EŞLEŞTİRME ---
      const wrongPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      wrongPath.setAttribute('d', getCurveD(p1.x, p1.y, p2.x, p2.y));
      wrongPath.setAttribute('stroke', '#EF4444');
      wrongPath.setAttribute('stroke-width', '4.5');
      wrongPath.setAttribute('fill', 'none');
      wrongPath.setAttribute('stroke-linecap', 'round');
      wrongPath.classList.add('cable-wire-path', 'wrong-snap');
      svgLayer.appendChild(wrongPath);

      leftNode.cardEl.classList.add('shake-wrong');
      rightNode.cardEl.classList.add('shake-wrong');

      if (navigator.vibrate) navigator.vibrate(100);

      const feedback = document.getElementById('cable-feedback-banner');
      if (feedback) {
        feedback.className = 'cable-feedback-banner error';
        feedback.textContent = ' Uyuşmadı! Doğru anlamı eşleştirmeyi deneyin.';
      }

      setTimeout(() => {
        wrongPath.remove();
        leftNode.cardEl.classList.remove('shake-wrong');
        rightNode.cardEl.classList.remove('shake-wrong');
        if (feedback && feedback.classList.contains('error')) {
          feedback.className = 'cable-feedback-banner hidden';
        }
      }, 420);
    }
  },

  redrawCableConnections() {
    if (!this.cableRound || !this.cableRound.connections) return;
    const svgLayer = document.getElementById('cable-svg-layer');
    if (!svgLayer) return;

    const getSocketCenter = (socketEl) => {
      const sRect = socketEl.getBoundingClientRect();
      const aRect = svgLayer.getBoundingClientRect();
      return {
        x: sRect.left + sRect.width / 2 - aRect.left,
        y: sRect.top + sRect.height / 2 - aRect.top
      };
    };

    const getCurveD = (x1, y1, x2, y2) => {
      const dx = Math.abs(x2 - x1) * 0.45;
      const sag = Math.max(12, Math.abs(y2 - y1) * 0.12);
      return `M ${x1} ${y1} C ${x1 + dx} ${y1 + sag}, ${x2 - dx} ${y2 + sag}, ${x2} ${y2}`;
    };

    for (const conn of this.cableRound.connections) {
      if (conn.pathEl && conn.leftSocket && conn.rightSocket) {
        const p1 = getSocketCenter(conn.leftSocket);
        const p2 = getSocketCenter(conn.rightSocket);
        conn.pathEl.setAttribute('d', getCurveD(p1.x, p1.y, p2.x, p2.y));
      }
    }
  },

  openGameQuizModal(gameType, options = {}) {
    if (!window.WordGameService) return;
    const modal = document.getElementById('modal-game-quiz');
    if (!modal) return;

    if (!options.skipRoutePush) {
      this.pushRoute(`/oyunlar/${encodeURIComponent(gameType || 'MIXED')}`, { gameType });
    }

    const titles = {
      ARTICLE: 'Artikel Testi (der · die · das)',
      VERB: 'Fiil Testi (Partizip II & Zamanlar)',
      NOUN: 'İsim Testi (Çoğullar & Anlam)',
      ADJECTIVE: 'Sıfat Testi (Komparativ & Sıfatlar)',
      PHRASE: 'Kalıp Testi (Deyimler & İfadeler)',
      REFLEXIV_TRENNBAR: 'Trennbar & Reflexiv Fiil Testi',
      MIXED: 'Karma Test (Tüm Konular)'
    };

    const titleEl = document.getElementById('game-quiz-title');
    if (titleEl) titleEl.textContent = titles[gameType] || 'Kelime Testi';

    document.getElementById('game-result-area')?.classList.add('hidden');
    document.getElementById('game-question-area')?.classList.remove('hidden');

    window.WordGameService.startNewGame(gameType, 15);
    modal.classList.remove('hidden');

    // Canlı Puan Göstergesini Sıfırla
    const scoreVal = document.getElementById('game-quiz-score-val');
    if (scoreVal) scoreVal.textContent = '0';

    // Zamanla Yarış Modu Sayacı
    if (this.gameTimerInterval) {
      clearInterval(this.gameTimerInterval);
      this.gameTimerInterval = null;
    }

    const timerBadge = document.getElementById('game-timer-badge');
    const timerVal = document.getElementById('game-quiz-timer-val');

    if (window.WordGameService.durationSeconds > 0) {
      if (timerBadge) {
        timerBadge.classList.remove('hidden', 'timer-urgent');
      }
      const updateTimerDisplay = () => {
        const rem = Math.max(0, window.WordGameService.remainingSeconds);
        const mins = Math.floor(rem / 60);
        const secs = rem % 60;
        if (timerVal) {
          timerVal.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        if (rem <= 10 && timerBadge) {
          timerBadge.classList.add('timer-urgent');
        } else if (timerBadge) {
          timerBadge.classList.remove('timer-urgent');
        }
      };
      updateTimerDisplay();

      this.gameTimerInterval = setInterval(() => {
        if (!window.WordGameService) return;
        window.WordGameService.remainingSeconds--;
        updateTimerDisplay();
        if (window.WordGameService.remainingSeconds <= 0) {
          clearInterval(this.gameTimerInterval);
          this.gameTimerInterval = null;
          this.showGameResults();
        }
      }, 1000);
    } else {
      if (timerBadge) timerBadge.classList.add('hidden');
    }

    this.renderGameCurrentQuestion();
  },

  renderGameCurrentQuestion() {
    const svc = window.WordGameService;
    if (!svc) return;

    if (svc.isFinished()) {
      this.showGameResults();
      return;
    }

    const q = svc.getCurrentQuestion();
    if (!q) {
      this.showGameResults();
      return;
    }

    const total = svc.questions.length;
    const currentNum = svc.currentIndex + 1;
    const pct = Math.round(((currentNum - 1) / total) * 100);

    const progText = document.getElementById('game-progress-text');
    if (progText) progText.textContent = `Soru ${currentNum} / ${total}`;

    const scoreText = document.getElementById('game-score-text');
    if (scoreText) scoreText.textContent = `Doğru: ${svc.score.correct} • Yanlış: ${svc.score.wrong}`;

    const progFill = document.getElementById('game-progress-fill');
    if (progFill) progFill.style.width = `${pct}%`;

    const streakCount = document.getElementById('game-quiz-streak-count');
    if (streakCount) streakCount.textContent = `${svc.score.streak} Seri`;

    const qPrompt = document.getElementById('game-q-prompt');
    if (qPrompt) qPrompt.textContent = q.prompt;

    const qSubject = document.getElementById('game-q-subject');
    if (qSubject) qSubject.textContent = q.subject;

    const qSubprompt = document.getElementById('game-q-subprompt');
    if (qSubprompt) qSubprompt.textContent = q.subprompt || '';

    const btnTts = document.getElementById('btn-game-tts');
    if (btnTts) {
      btnTts.onclick = () => {
        const speakTxt = q.audioWord || q.subject;
        window.wmTTS.speak(speakTxt, 'de-DE');
      };
    }

    // Geri bildirim ve Sonraki butonunu gizle
    const fbBox = document.getElementById('game-feedback-box');
    if (fbBox) {
      fbBox.classList.add('hidden');
      fbBox.className = 'game-feedback-box hidden';
    }
    document.getElementById('btn-game-next')?.classList.add('hidden');

    // Seçenekler
    const optContainer = document.getElementById('game-options-container');
    if (optContainer) {
      optContainer.innerHTML = '';
      const letters = ['A', 'B', 'C', 'D'];

      q.options.forEach((optText, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'game-option-btn';
        btn.innerHTML = `
          <span class="game-opt-letter">${letters[idx] ? letters[idx] + '-)' : (idx + 1) + '-)'}</span>
          <span class="game-opt-text">${this.escapeHtml(optText)}</span>
        `;

        btn.addEventListener('click', () => {
          if (svc.isAnswerRevealed) return;
          const result = svc.submitAnswer(idx);
          if (!result) return;

          // Butonları renklendir
          const allBtns = optContainer.querySelectorAll('.game-option-btn');
          allBtns.forEach((b, bIdx) => {
            b.disabled = true;
            if (bIdx === result.correctIndex) {
              b.classList.add('correct');
            } else if (bIdx === idx && !result.isCorrect) {
              b.classList.add('wrong');
            }
          });

          // Geri bildirim kutusu
          if (fbBox) {
            fbBox.classList.remove('hidden');
            fbBox.classList.remove('is-correct', 'is-wrong');
            fbBox.classList.add(result.isCorrect ? 'is-correct' : 'is-wrong');
            const msgEl = document.getElementById('game-feedback-message');
            if (msgEl) msgEl.textContent = result.isCorrect ? ' Tebrikler, Doğru!' : ' Maalesef Yanlış!';
            const explEl = document.getElementById('game-feedback-explanation');
            if (explEl) explEl.textContent = result.explanation || '';
          }

          // Canlı Skor, Seri ve Puan güncelle
          if (streakCount) streakCount.textContent = `${result.streak} Seri`;
          if (scoreText) scoreText.textContent = `Doğru: ${svc.score.correct} • Yanlış: ${svc.score.wrong}`;
          const liveScoreVal = document.getElementById('game-quiz-score-val');
          if (liveScoreVal) liveScoreVal.textContent = result.points;

          if (result.isCorrect && result.gainedPoints > 0) {
            this.showToast(`+${result.gainedPoints} Puan! x${result.streakMultiplier}`);
          }

          // Sonraki soru butonunu göster
          document.getElementById('btn-game-next')?.classList.remove('hidden');
        });

        optContainer.appendChild(btn);
      });
    }
  },

  showGameResults() {
    const svc = window.WordGameService;
    if (!svc) return;

    document.getElementById('game-question-area')?.classList.add('hidden');
    const resArea = document.getElementById('game-result-area');
    if (resArea) resArea.classList.remove('hidden');

    const total = svc.questions.length || 1;
    const correct = svc.score.correct;
    const wrong = svc.score.wrong;
    const accuracy = Math.round((correct / total) * 100);

    const grCorrect = document.getElementById('gr-correct');
    if (grCorrect) grCorrect.textContent = correct;

    const grWrong = document.getElementById('gr-wrong');
    if (grWrong) grWrong.textContent = wrong;

    if (this.gameTimerInterval) {
      clearInterval(this.gameTimerInterval);
      this.gameTimerInterval = null;
    }

    const grAcc = document.getElementById('gr-accuracy');
    if (grAcc) grAcc.textContent = `%${accuracy}`;

    const highScore = svc.getHighScore(svc.currentGameType);
    const grScoreEl = document.getElementById('gr-score');
    if (grScoreEl) grScoreEl.textContent = `${svc.score.points} Puan`;

    const subtitle = document.getElementById('game-result-subtitle');
    if (subtitle) {
      if (accuracy >= 80) {
        subtitle.textContent = 'Mükemmel performans! Kelimeleri harika öğrenmişsiniz. ';
      } else if (accuracy >= 50) {
        subtitle.textContent = 'İyi bir tekrar oldu! Pratik yapmaya devam edin. ';
      } else {
        subtitle.textContent = 'Biraz daha pratik yaparak kelimeleri pekiştirebilirsiniz. ';
      }
    }

    const progFill = document.getElementById('game-progress-fill');
    if (progFill) progFill.style.width = '100%';
  }
};
