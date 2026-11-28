// WortCoach istemci yapılandırması
window.WORTCOACH_CONFIG = {
  COACH_API: 'https://wortcoach-proxy.cigarahigh.workers.dev',
};

/**
 * Coach API görevini çağırır.
 * @param {'analyze'|'deck'|'ocr'|'chat'} task
 * @param {object} payload
 * @param {AbortSignal} [signal]
 */
window.coachRequest = async function (task, payload, signal) {
  const call = async () => {
    const res = await fetch(`${window.WORTCOACH_CONFIG.COACH_API}/coach/${task}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    return { res, data };
  };

  let { res, data } = await call();
  if (res.status === 502) {
    await new Promise((r) => setTimeout(r, 700));
    ({ res, data } = await call());
  }
  if (!res.ok) {
    throw new Error((data && data.error) || 'Coach servisine ulaşılamadı.');
  }
  return data;
};

/**
 * Ağır harici kütüphaneleri (PDF.js, Mammoth DOCX vb.) açılışta değil,
 * yalnızca ilgili özellik kullanıldığında bir defaya mahsus yükler.
 */
window.WortCoachLoader = (() => {
  const inflight = new Map();

  function loadScriptOnce(src, checkFn) {
    if (typeof checkFn === 'function' && checkFn()) {
      return Promise.resolve(checkFn());
    }
    if (inflight.has(src)) {
      return inflight.get(src);
    }

    const promise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (typeof checkFn === 'function' && checkFn()) {
          resolve(checkFn());
          return;
        }
        existing.addEventListener('load', () => resolve(checkFn ? checkFn() : true), { once: true });
        existing.addEventListener('error', () => {
          inflight.delete(src);
          reject(new Error('Kütüphane yüklenemedi: ' + src));
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(checkFn ? checkFn() : true);
      script.onerror = () => {
        inflight.delete(src);
        script.remove();
        reject(new Error('Harici kütüphane yüklenemedi: ' + src));
      };
      document.head.appendChild(script);
    });

    inflight.set(src, promise);
    return promise;
  }

  return {
    loadScriptOnce,
    async ensurePdfJs() {
      await loadScriptOnce(
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
        () => window.pdfjsLib
      );
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      return window.pdfjsLib;
    },
    async ensureMammoth() {
      return loadScriptOnce(
        'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
        () => window.mammoth
      );
    },
    async ensureCuratedPacks() {
      return loadScriptOnce(
        'js/curatedPacks.js?v=3.13.5',
        () => (Array.isArray(window.CURATED_CEFR_PACKS) && window.CURATED_CEFR_PACKS[0] && Array.isArray(window.CURATED_CEFR_PACKS[0].cards)
          ? window.CURATED_CEFR_PACKS
          : null)
      );
    },
    async ensurePronunciation() {
      return loadScriptOnce(
        'js/pronunciation.js?v=3.13.5',
        () => window.wmPronunciation
      );
    },
  };
})();
