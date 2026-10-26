// WortCoach istemci yapılandırması ve Coach API istemcisi.
// Gemini anahtarı ve promptlar istemcide YOKTUR; sunucu (Cloudflare Worker) sabit görevleri çalıştırır.
window.WORTCOACH_CONFIG = {
  COACH_API: 'https://wortcoach-proxy.mosmandurmaz26.workers.dev',
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
  // Model geçici bir 502 verirse 1 kez otomatik tekrar dene
  if (res.status === 502) {
    await new Promise((r) => setTimeout(r, 700));
    ({ res, data } = await call());
  }
  if (!res.ok) {
    throw new Error((data && data.error) || 'Coach servisine ulaşılamadı.');
  }
  return data;
};
