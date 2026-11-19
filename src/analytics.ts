const METRICS_KEY = 'aether_rift_metrics_v1';

interface LocalMetrics {
  counts: Record<string, number>;
  lastEvents: Array<{ name: string; at: string; payload?: Record<string, unknown> }>;
}

function loadMetrics(): LocalMetrics {
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalMetrics;
      if (parsed && parsed.counts && Array.isArray(parsed.lastEvents)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { counts: {}, lastEvents: [] };
}

export function trackEvent(
  eventName: string,
  payload: Record<string, unknown> = {},
  playerId = ''
): void {
  if (!eventName) return;

  try {
    const m = loadMetrics();
    m.counts[eventName] = (m.counts[eventName] || 0) + 1;
    m.lastEvents.unshift({
      name: eventName,
      at: new Date().toISOString(),
      payload,
    });
    m.lastEvents = m.lastEvents.slice(0, 40);
    localStorage.setItem(METRICS_KEY, JSON.stringify(m));
  } catch {
    // ignore storage quota
  }

  // Неблокирующая отправка воронки в Vercel /api/analytics -> Supabase
  try {
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId,
        eventName: eventName.slice(0, 48),
        payload,
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // ignore
  }
}
