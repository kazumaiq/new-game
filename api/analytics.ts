interface ApiReq {
  method?: string;
  body?: unknown;
}

interface ApiRes {
  status: (code: number) => ApiRes;
  json: (body: unknown) => void;
  setHeader: (name: string, val: string) => void;
  end: () => void;
}

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    body = typeof req.body === 'string' ? (JSON.parse(req.body) as Record<string, unknown>) : ((req.body as Record<string, unknown>) || {});
  } catch {
    res.status(200).json({ ok: true });
    return;
  }

  const eventName = typeof body.eventName === 'string' ? body.eventName.trim().slice(0, 48) : '';
  const playerId = typeof body.playerId === 'string' ? body.playerId.trim().slice(0, 64) : '';
  const payload = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Record<string, unknown>;

  if (!eventName) {
    res.status(200).json({ ok: true });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  if (supabaseUrl && supabaseKey) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/analytics_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          player_id: playerId,
          event_name: eventName,
          payload,
        }),
      });
    } catch {
      // ignore analytics errors
    }
  }

  res.status(200).json({ ok: true });
}
