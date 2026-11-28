/**
 * WortMeister — İstatistik ve Öğrenme Analitiği Motoru (tab-stats)
 */

class WortMeisterStats {
  constructor() {
    this.currentRange = '7';
    this._bound = false;
  }

  init() {
    if (this._bound) return;
    const container = document.getElementById('stats-range-selector');
    const modal = document.getElementById('modal-study-stats');
    if (!container && !modal) return;
    this._bound = true;

    container?.querySelectorAll('.range-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.range-pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentRange = btn.getAttribute('data-range') || '7';
        this.renderStats();
      });
    });

    const closeModal = () => modal?.classList.add('hidden');
    document.getElementById('btn-close-stats-modal')?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.getElementById('btn-stats-open-mastery')?.addEventListener('click', () => {
      closeModal();
      const deckId = window.wmStudy?.deckSelect?.value || 'all';
      window.wmApp?.openMasteryAnalyzerModal?.(deckId);
    });
  }

  async openModal() {
    this.init();
    const modal = document.getElementById('modal-study-stats');
    if (modal) {
      modal.classList.remove('hidden');
    }
    await this.renderStats();
  }

  calculateStreak(logs) {
    if (!logs || logs.length === 0) return 0;

    const uniqueDays = new Set(
      logs.map((l) => {
        const d = new Date(l.reviewedAt);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    );

    let streak = 0;
    const cursor = new Date();

    for (let i = 0; i < 365; i++) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      if (uniqueDays.has(key)) {
        streak++;
      } else if (i > 0) {
        break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  async renderStats() {
    const cards = await window.wmDB.getAllCards();
    const logs = await window.wmDB.getAllStudyLogs();
    const now = Date.now();
    const ONE_DAY = 24 * 3600 * 1000;

    const rangeDays = this.currentRange === 'all' ? 3650 : Number(this.currentRange);
    const cutoff = now - rangeDays * ONE_DAY;

    const filteredLogs = logs.filter((l) => l.reviewedAt >= cutoff);
    const passLogs = filteredLogs.filter((l) => l.rating === 'good' || l.rating === 'easy');
    const accuracy =
      filteredLogs.length > 0 ? Math.round((passLogs.length / filteredLogs.length) * 100) : 0;

    const learnedCards = cards.filter((c) => {
      if (window.wmDB && typeof window.wmDB.getCardMasteryProfile === 'function') {
        return window.wmDB.getCardMasteryProfile(c).tier === 'mastered';
      }
      return (Number(c.srsStage) || 0) >= 3;
    });
    const streak = this.calculateStreak(logs);

    const learnedEl = document.getElementById('stat-learned-count');
    const totalEl = document.getElementById('stat-total-cards');
    const accEl = document.getElementById('stat-accuracy-rate');
    const streakEl = document.getElementById('stat-streak-days');

    if (learnedEl) learnedEl.textContent = String(learnedCards.length);
    if (totalEl) totalEl.textContent = String(cards.length);
    if (accEl) accEl.textContent = `%${accuracy}`;
    if (streakEl) streakEl.textContent = `${streak} Gün`;

    this.renderDailyBarChart(logs);
    this.renderCefrDistribution(cards);
  }

  renderDailyBarChart(logs) {
    const chartEl = document.getElementById('stats-bar-chart');
    if (!chartEl) return;

    const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    const daysData = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const end = start + 24 * 3600 * 1000;

      const count = logs.filter((l) => l.reviewedAt >= start && l.reviewedAt < end).length;
      daysData.push({
        label: dayNames[d.getDay()],
        count
      });
    }

    const maxCount = Math.max(5, ...daysData.map((d) => d.count));

    chartEl.innerHTML = daysData
      .map((d) => {
        const heightPct = Math.max(6, Math.round((d.count / maxCount) * 100));
        return `
          <div class="bar-col">
            <div class="bar-fill" style="height: ${heightPct}%" title="${d.count} tekrar"></div>
            <span class="bar-label">${d.label} (${d.count})</span>
          </div>
        `;
      })
      .join('');
  }

  renderCefrDistribution(cards) {
    const cefrEl = document.getElementById('stats-cefr-bars');
    if (!cefrEl) return;

    const levels = ['A1', 'A2', 'B1', 'B2', 'C1'];
    const total = Math.max(1, cards.length);

    cefrEl.innerHTML = levels
      .map((lvl) => {
        const count = cards.filter((c) => {
          const raw = String(c.cefr || 'A1').trim().toUpperCase();
          if (lvl === 'C1') return raw === 'C1' || raw === 'C2';
          return raw === lvl;
        }).length;
        const pct = Math.round((count / total) * 100);
        return `
          <div class="cefr-row">
            <div class="cefr-row-top">
              <span>Seviye ${lvl === 'C1' ? 'C1 / C2' : lvl}</span>
              <span>${count} Kart (%${pct})</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

window.wmStats = new WortMeisterStats();
