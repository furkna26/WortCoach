// WortCoach istemci yapilandirmasi ve Coach API istemcisi.
// Gemini anahtari ve promptlar istemcide YOKTUR; sunucu (Cloudflare Worker) sabit gorevleri calistirir.
window.WORTCOACH_CONFIG = {
  COACH_API: 'https://wortcoach-proxy.mosmandurmaz26.workers.dev',
};

/**
 * Coach gorevi cagirir.
 * @param {'analyze'|'deck'} task
 * @param {{text?: string, file?: {mime: string, data: string}, instruction?: string}} payload
 * @param {AbortSignal} [signal]
 */
window.coachRequest = async function (task, payload, signal) {
  const res = await fetch(`${window.WORTCOACH_CONFIG.COACH_API}/coach/${task}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error((data && data.error) || 'Coach servisine ulasilamadi.');
  return data;
};
