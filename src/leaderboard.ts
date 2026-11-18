import { PlayerProfile } from './progression';

export interface GlobalScoreRow {
  callsign: string;
  score: number;
  wave: number;
  mode: string;
  ship: string;
  isSelf?: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const DAILY_BOARD_KEY = 'aether_rift_daily_board_v1';

function todaySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getDailyRivals(): GlobalScoreRow[] {
  const rand = seededRand(todaySeed());
  const names = ['KAZUMA', 'VALKYRIE', 'NEON_FOX', 'ZERO_COOL', 'ASTRA', 'PHANTOM_X', 'KIRA_99', 'SOLARIS'];
  return names.map((name, i) => ({
    callsign: name,
    score: Math.floor(4500 + rand() * 16000 + (8 - i) * 900),
    wave: Math.floor(4 + rand() * 7),
    mode: 'daily',
    ship: ['ИСТРЕБИТЕЛЬ', 'ТАНК', 'НИНДЗЯ', 'ЭЛЕКТРО'][Math.floor(rand() * 4)],
  }));
}

export async function submitGlobalScore(entry: GlobalScoreRow): Promise<void> {
  try {
    const raw = localStorage.getItem(DAILY_BOARD_KEY);
    const list: GlobalScoreRow[] = raw ? JSON.parse(raw) : [];
    list.push({ ...entry, isSelf: true });
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem(DAILY_BOARD_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // ignore
  }

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
          callsign: entry.callsign,
          score: entry.score,
          wave: entry.wave,
          mode: entry.mode,
          ship: entry.ship,
        }),
      });
    } catch {
      // fallback silently
    }
  }
}

export async function fetchGlobalLeaderboard(modeFilter: 'all' | 'daily', myCallsign: string): Promise<GlobalScoreRow[]> {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const filter = modeFilter === 'daily' ? '&mode=eq.daily' : '';
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores?select=*${filter}&order=score.desc&limit=30`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (res.ok) {
        const rows = (await res.json()) as GlobalScoreRow[];
        return rows.map((r) => ({ ...r, isSelf: r.callsign === myCallsign }));
      }
    } catch {
      // fallback
    }
  }

  let local: GlobalScoreRow[] = [];
  try {
    const raw = localStorage.getItem(DAILY_BOARD_KEY);
    local = raw ? JSON.parse(raw) : [];
  } catch {
    local = [];
  }

  const rivals = getDailyRivals();
  const combined = [...local, ...rivals].filter((r) => modeFilter === 'all' || r.mode === 'daily');
  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, 15);
}

export async function saveCloudProfile(profile: PlayerProfile): Promise<void> {
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
        callsign: profile.callsign,
        data: profile,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // ignore offline errors
  }
}

export async function fetchCloudProfile(callsign: string): Promise<PlayerProfile | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !callsign) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?callsign=eq.${encodeURIComponent(callsign)}&select=data&limit=1`,
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
