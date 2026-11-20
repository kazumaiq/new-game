interface ApiReq {
  method?: string;
  url?: string;
}

interface ApiRes {
  status: (code: number) => ApiRes;
  json: (body: unknown) => void;
}

// Серверный S2S-вебхук для AdsGram Reward URL:
// https://new-game-gray.vercel.app/api/reward?userId=[userId]
export default async function handler(req: ApiReq, res: ApiRes): Promise<void> {
  const reqUrl = new URL(req.url || '/', 'https://localhost');
  const rawUserId = (reqUrl.searchParams.get('userId') || '').trim().slice(0, 48);
  const playerId = rawUserId && rawUserId !== '[userId]' ? `tg_${rawUserId}` : '';

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  if (playerId && supabaseUrl && supabaseKey) {
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
          event_name: 'adsgram_s2s_reward',
          payload: { telegram_user_id: rawUserId },
        }),
      });
    } catch {
      // ignore webhook logging errors so AdsGram always receives 200 OK
    }
  }

  res.status(200).json({ ok: true, userId: rawUserId });
}
