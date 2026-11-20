import crypto from 'node:crypto';

interface ApiReq {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiRes {
  status: (code: number) => ApiRes;
  json: (body: unknown) => void;
  setHeader: (name: string, val: string) => void;
  end: () => void;
}

interface VerifiedTg {
  valid: boolean;
  playerId?: string;
}

function verifyTelegramInitData(initData: string, botToken: string): VerifiedTg {
  if (!initData || !botToken) return { valid: false };
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { valid: false };

    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key !== 'hash') {
        pairs.push(`${key}=${value}`);
      }
    });
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

    const hashBuf = Buffer.from(hash, 'hex');
    const expBuf = Buffer.from(expectedHash, 'hex');
    if (hashBuf.length !== expBuf.length || !crypto.timingSafeEqual(hashBuf, expBuf)) {
      return { valid: false };
    }

    const userRaw = params.get('user');
    if (userRaw) {
      const user = JSON.parse(userRaw) as { id?: number | string };
      if (user?.id) {
        return { valid: true, playerId: `tg_${String(user.id)}` };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false };
  }
}

export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-tg-init-data');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

  if (req.method === 'GET') {
    const rawHeader = req.headers['x-tg-init-data'];
    const tgInitData = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader || '';
    const reqUrl = new URL(req.url || '/', 'https://localhost');
    let playerId = (reqUrl.searchParams.get('playerId') || '').trim().slice(0, 64);

    if (botToken && tgInitData) {
      const check = verifyTelegramInitData(tgInitData, botToken);
      if (!check.valid) {
        res.status(401).json({ ok: false, error: 'invalid_telegram_signature' });
        return;
      }
      if (check.playerId) playerId = check.playerId;
    }

    if (!playerId || !supabaseUrl || !supabaseKey) {
      res.status(200).json({ ok: true, profile: null });
      return;
    }

    try {
      const dbRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?player_id=eq.${encodeURIComponent(playerId)}&select=data&limit=1`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        }
      );
      if (!dbRes.ok) {
        res.status(200).json({ ok: true, profile: null });
        return;
      }
      const rows = (await dbRes.json()) as Array<{ data: unknown }>;
      res.status(200).json({ ok: true, profile: rows[0]?.data || null });
      return;
    } catch {
      res.status(200).json({ ok: true, profile: null });
      return;
    }
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    body = typeof req.body === 'string' ? (JSON.parse(req.body) as Record<string, unknown>) : ((req.body as Record<string, unknown>) || {});
  } catch {
    res.status(400).json({ ok: false, error: 'invalid_json' });
    return;
  }

  const tgInitData = typeof body.tgInitData === 'string' ? body.tgInitData : '';
  let playerId = typeof body.playerId === 'string' ? body.playerId.trim().slice(0, 64) : '';
  const profile = (body.profile as Record<string, unknown>) || null;

  if (botToken && tgInitData) {
    const check = verifyTelegramInitData(tgInitData, botToken);
    if (!check.valid) {
      res.status(401).json({ ok: false, error: 'invalid_telegram_signature' });
      return;
    }
    if (check.playerId) playerId = check.playerId;
  }

  if (!playerId || !profile) {
    res.status(400).json({ ok: false, error: 'invalid_payload' });
    return;
  }

  const callsignRaw = typeof profile.callsign === 'string' ? profile.callsign.trim() : 'ПИЛОТ';
  const callsign = (callsignRaw || 'ПИЛОТ').slice(0, 14);
  const clanRaw = typeof profile.clanTag === 'string' ? profile.clanTag.trim().toUpperCase() : '';
  const clanTag = clanRaw.replace(/[^A-ZА-Я0-9]/gi, '').slice(0, 5);

  const sanitizedProfile = {
    ...profile,
    playerId,
    callsign,
    clanTag,
  };

  if (!supabaseUrl || !supabaseKey) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  try {
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        player_id: playerId,
        callsign,
        clan_tag: clanTag,
        data: sanitizedProfile,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!dbRes.ok) {
      res.status(502).json({ ok: false, error: 'supabase_upsert_failed' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch {
    res.status(502).json({ ok: false, error: 'network_error' });
  }
}
