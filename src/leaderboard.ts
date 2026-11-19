import { PlayerProfile } from './progression';

export interface GlobalScoreRow {
  player_id?: string;
  callsign: string;
  clan_tag?: string;
  score: number;
  wave: number;
  mode: string;
  ship: string;
  duration_sec?: number;
  isSelf?: boolean;
}

export interface ClanScoreRow {
  clanTag: string;
  totalScore: number;
  bestWave: number;
  members: number;
  isSelf: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const DAILY_BOARD_KEY = 'aether_rift_daily_board_v1';

export async function submitGlobalScore(entry: GlobalScoreRow, tgInitData = ''): Promise<void> {
  try {
    const raw = localStorage.getItem(DAILY_BOARD_KEY);
    const list: GlobalScoreRow[] = raw ? JSON.parse(raw) : [];
    list.push({ ...entry, isSelf: true });
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem(DAILY_BOARD_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    // ignore
  }

  // 1. Безопасная отправка через Vercel /api/score (античит + Telegram HMAC)
  try {
    const apiRes = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: entry.player_id || '',
        callsign: entry.callsign,
        clanTag: entry.clan_tag || '',
        score: entry.score,
        wave: entry.wave,
        mode: entry.mode,
        ship: entry.ship,
        durationSec: entry.duration_sec ?? 0,
        tgInitData,
      }),
    });
    if (apiRes.status === 422 || apiRes.status === 401) {
      return;
    }
    if (apiRes.ok) {
      const data = (await apiRes.json().catch(() => null)) as { ok?: boolean; skipped?: boolean } | null;
      if (data?.ok && !data?.skipped) return;
    }
  } catch {
    // /api/score недоступен (например, на GitHub Pages или локально)
  }

  // 2. Fallback в Supabase REST напрямую (если политики RLS разрешают)
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          player_id: entry.player_id || 'anon',
          callsign: entry.callsign,
          clan_tag: entry.clan_tag || '',
          score: entry.score,
          wave: entry.wave,
          mode: entry.mode,
          ship: entry.ship,
          duration_sec: entry.duration_sec ?? 0,
        }),
      });
    } catch {
      // ignore
    }
  }
}

export async function fetchGlobalLeaderboard(
  modeFilter: 'all' | 'daily' | 'friends',
  myPlayerId: string,
  myCallsign: string,
  friends: string[] = []
): Promise<GlobalScoreRow[]> {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const filter = modeFilter === 'daily' ? '&mode=eq.daily' : '';
      const limit = modeFilter === 'friends' ? 80 : 30;
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/scores?select=*${filter}&order=score.desc&limit=${limit}`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as GlobalScoreRow[];
        const friendSet = new Set(friends.map((f) => f.toUpperCase()));
        const filtered =
          modeFilter === 'friends'
            ? rows.filter(
                (r) =>
                  (myPlayerId && r.player_id === myPlayerId) ||
                  r.callsign === myCallsign ||
                  friendSet.has(r.callsign.toUpperCase()) ||
                  (r.player_id ? friendSet.has(r.player_id.toUpperCase()) : false)
              )
            : rows;
        return filtered.slice(0, 30).map((r) => ({
          ...r,
          isSelf: (Boolean(myPlayerId) && r.player_id === myPlayerId) || r.callsign === myCallsign,
        }));
      }
    } catch {
      // fallback to local
    }
  }

  let local: GlobalScoreRow[] = [];
  try {
    const raw = localStorage.getItem(DAILY_BOARD_KEY);
    local = raw ? JSON.parse(raw) : [];
  } catch {
    local = [];
  }

  const friendSet = new Set(friends.map((f) => f.toUpperCase()));
  const filtered = local.filter((r) => {
    if (modeFilter === 'daily') return r.mode === 'daily';
    if (modeFilter === 'friends') {
      return (
        r.callsign === myCallsign ||
        (myPlayerId && r.player_id === myPlayerId) ||
        friendSet.has(r.callsign.toUpperCase())
      );
    }
    return true;
  });
  filtered.sort((a, b) => b.score - a.score);
  return filtered.slice(0, 20);
}

export async function fetchClanLeaderboard(myClanTag: string): Promise<ClanScoreRow[]> {
  let rows: GlobalScoreRow[] = [];

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/scores?select=player_id,callsign,clan_tag,score,wave&clan_tag=neq.&order=score.desc&limit=120`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (res.ok) {
        rows = (await res.json()) as GlobalScoreRow[];
      }
    } catch {
      rows = [];
    }
  } else {
    try {
      const raw = localStorage.getItem(DAILY_BOARD_KEY);
      rows = raw ? (JSON.parse(raw) as GlobalScoreRow[]).filter((r) => Boolean(r.clan_tag)) : [];
    } catch {
      rows = [];
    }
  }

  const map = new Map<string, { totalScore: number; bestWave: number; members: Set<string> }>();
  for (const r of rows) {
    const tag = (r.clan_tag || '').trim().toUpperCase();
    if (!tag) continue;
    let bucket = map.get(tag);
    if (!bucket) {
      bucket = { totalScore: 0, bestWave: 0, members: new Set<string>() };
      map.set(tag, bucket);
    }
    bucket.totalScore += Number(r.score) || 0;
    bucket.bestWave = Math.max(bucket.bestWave, Number(r.wave) || 1);
    bucket.members.add(r.player_id || r.callsign);
  }

  const out: ClanScoreRow[] = [];
  const normSelf = myClanTag.trim().toUpperCase();
  map.forEach((v, clanTag) => {
    out.push({
      clanTag,
      totalScore: v.totalScore,
      bestWave: v.bestWave,
      members: v.members.size,
      isSelf: Boolean(normSelf) && clanTag === normSelf,
    });
  });
  out.sort((a, b) => b.totalScore - a.totalScore);
  return out.slice(0, 15);
}

export async function saveCloudProfile(profile: PlayerProfile, tgInitData = ''): Promise<void> {
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: profile.playerId,
        profile,
        tgInitData,
      }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { ok?: boolean; skipped?: boolean } | null;
      if (data?.ok && !data?.skipped) return;
    }
  } catch {
    // fallback
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        player_id: profile.playerId,
        callsign: profile.callsign,
        clan_tag: profile.clanTag || '',
        data: profile,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // ignore offline errors
  }
}

export async function fetchCloudProfile(playerId: string, tgInitData = ''): Promise<PlayerProfile | null> {
  if (!playerId) return null;

  try {
    const headers: Record<string, string> = {};
    if (tgInitData) headers['x-tg-init-data'] = tgInitData;
    const res = await fetch(`/api/profile?playerId=${encodeURIComponent(playerId)}`, { headers });
    if (res.ok) {
      const data = (await res.json()) as { profile?: PlayerProfile | null };
      if (data?.profile) return data.profile;
    }
  } catch {
    // fallback
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?player_id=eq.${encodeURIComponent(playerId)}&select=data&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ data: PlayerProfile }>;
    return rows[0]?.data || null;
  } catch {
    return null;
  }
}

export async function recordReferral(referrerCode: string, referredPlayerId: string): Promise<void> {
  if (!referrerCode || !referredPlayerId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/referrals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        referrer_code: referrerCode.slice(0, 12),
        referred_player_id: referredPlayerId.slice(0, 64),
      }),
    });
  } catch {
    // ignore duplicate or offline
  }
}
