interface ApiReq {
  method?: string;
  url?: string;
}

interface ApiRes {
  status: (code: number) => ApiRes;
  json: (body: unknown) => void;
  setHeader: (name: string, val: string) => void;
  end: () => void;
}

function setCors(res: ApiRes): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!supabaseUrl || !supabaseKey) {
    res.status(200).json({ ok: true, unconfigured: true, rows: [] });
    return;
  }

  const reqUrl = new URL(req.url || '/', 'https://localhost');
  const mode = (reqUrl.searchParams.get('mode') || 'all').trim();
  const limitRaw = Number(reqUrl.searchParams.get('limit') || (mode === 'all' || mode === 'daily' ? 30 : 100));
  const limit = Math.max(1, Math.min(120, Number.isFinite(limitRaw) ? limitRaw : 30));

  let query = `${supabaseUrl}/rest/v1/scores?select=player_id,callsign,clan_tag,score,wave,mode,ship,duration_sec,created_at`;
  if (mode === 'daily') {
    query += '&mode=eq.daily';
  } else if (mode === 'clans') {
    query += '&clan_tag=neq.';
  }
  query += `&order=score.desc&limit=${limit}`;

  try {
    const dbRes = await fetch(query, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    if (!dbRes.ok) {
      res.status(502).json({ ok: false, error: 'supabase_query_failed', rows: [] });
      return;
    }
    const rows = (await dbRes.json()) as unknown[];
    res.status(200).json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch {
    res.status(502).json({ ok: false, error: 'network_error', rows: [] });
  }
}
