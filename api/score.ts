import crypto from 'node:crypto';

interface ApiReq {
  method?: string;
  body?: unknown;
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
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(204).end();
    return;
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

  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const tgInitData = typeof body.tgInitData === 'string' ? body.tgInitData : '';
  let playerId = typeof body.playerId === 'string' ? body.playerId.trim().slice(0, 64) : '';

  if (botToken && tgInitData) {
    const check = verifyTelegramInitData(tgInitData, botToken);
    if (!check.valid) {
      res.status(401).json({ ok: false, error: 'invalid_telegram_signature' });
      return;
    }
    if (check.playerId) {
      playerId = check.playerId;
    }
  }

  const callsignRaw = typeof body.callsign === 'string' ? body.callsign.trim() : 'ПИЛОТ';
  const callsign = (callsignRaw || 'ПИЛОТ').slice(0, 16);
  const clanTagRaw = typeof body.clanTag === 'string' ? body.clanTag.trim().toUpperCase() : '';
  const clanTag = clanTagRaw.replace(/[^A-ZА-Я0-9]/gi, '').slice(0, 5);
  const score = Number(body.score);
  const wave = Number(body.wave);
  const durationSec = Number(body.durationSec ?? 0);
  const mode = typeof body.mode === 'string' ? body.mode.slice(0, 24) : 'classic';
  const ship = typeof body.ship === 'string' ? body.ship.slice(0, 32) : 'ИСТРЕБИТЕЛЬ';

  if (
    !playerId ||
    !Number.isFinite(score) ||
    score < 0 ||
    !Number.isFinite(wave) ||
    wave < 1 ||
    wave > 60 ||
    !Number.isFinite(durationSec) ||
    durationSec < 0
  ) {
    res.status(400).json({ ok: false, error: 'invalid_payload' });
    return;
  }

  // Серверный античит: проверяем реалистичность счёта по волне и времени боя
  const maxPlausible = Math.max(25000, wave * 18000 + durationSec * 180);
  if (score > maxPlausible || (wave >= 5 && durationSec > 0 && durationSec < wave * 4)) {
    res.status(422).json({ ok: false, error: 'implausible_score' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  try {
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        player_id: playerId,
        callsign,
        clan_tag: clanTag,
        score: Math.round(score),
        wave: Math.round(wave),
        mode,
        ship,
        duration_sec: Math.round(durationSec),
      }),
    });

    if (!dbRes.ok) {
      res.status(502).json({ ok: false, error: 'supabase_insert_failed' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch {
    res.status(502).json({ ok: false, error: 'network_error' });
  }
}
