-- AETHER RIFT: Полная схема базы данных Supabase (с безопасным обновлением старых таблиц)
-- Скопируйте весь этот SQL в Supabase -> SQL Editor -> New Query и нажмите Run.

-- 1. Профили игроков (первичный ключ — неизменяемый player_id: tg_<id>, ya_<id> или web_<uuid>)
create table if not exists public.profiles (
  player_id text primary key,
  callsign text not null,
  clan_tag text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Миграция колонок, если таблица profiles была создана в прошлой версии
alter table public.profiles add column if not exists player_id text;
alter table public.profiles add column if not exists clan_tag text not null default '';
alter table public.profiles add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

update public.profiles
set player_id = coalesce(nullif(data->>'playerId', ''), 'legacy_' || callsign)
where player_id is null or player_id = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'p'
      and a.attname = 'player_id'
  ) then
    alter table public.profiles drop constraint if exists profiles_pkey;
    alter table public.profiles alter column player_id set not null;
    alter table public.profiles add primary key (player_id);
  end if;
end $$;

create index if not exists idx_profiles_callsign on public.profiles (callsign);
create index if not exists idx_profiles_clan_tag on public.profiles (clan_tag);

-- 2. Таблица рекордов (с проверкой длительности боя для античита)
create table if not exists public.scores (
  id bigserial primary key,
  player_id text not null default 'legacy',
  callsign text not null,
  clan_tag text not null default '',
  score integer not null check (score >= 0 and score <= 5000000),
  wave integer not null check (wave >= 1 and wave <= 100),
  mode text not null,
  ship text not null,
  duration_sec integer not null default 0 check (duration_sec >= 0),
  created_at timestamptz not null default now()
);

-- Миграция колонок, если таблица scores была создана в прошлой версии
alter table public.scores add column if not exists player_id text not null default 'legacy';
alter table public.scores add column if not exists clan_tag text not null default '';
alter table public.scores add column if not exists duration_sec integer not null default 0;

create index if not exists idx_scores_score_desc on public.scores (score desc);
create index if not exists idx_scores_mode_score on public.scores (mode, score desc);
create index if not exists idx_scores_clan_tag on public.scores (clan_tag);
create index if not exists idx_scores_player_id on public.scores (player_id);

-- 3. Реферальные приглашения друзей
create table if not exists public.referrals (
  id bigserial primary key,
  referrer_code text not null,
  referred_player_id text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_referrals_code on public.referrals (referrer_code);

-- 4. Аналитика воронки игры
create table if not exists public.analytics_events (
  id bigserial primary key,
  player_id text not null default '',
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_event_name on public.analytics_events (event_name, created_at desc);

-- ==================== ROW LEVEL SECURITY (RLS) ====================
alter table public.profiles enable row level security;
alter table public.scores enable row level security;
alter table public.referrals enable row level security;
alter table public.analytics_events enable row level security;

-- Публичное чтение профилей и рекордов; запись идёт через Vercel /api/* с SUPABASE_SERVICE_ROLE_KEY
drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read" on public.profiles
  for select using (true);

drop policy if exists "scores_public_read" on public.scores;
create policy "scores_public_read" on public.scores
  for select using (true);

drop policy if exists "referrals_public_read" on public.referrals;
create policy "referrals_public_read" on public.referrals
  for select using (true);

drop policy if exists "referrals_insert_anon" on public.referrals;
create policy "referrals_insert_anon" on public.referrals
  for insert with check (length(referrer_code) between 3 and 16 and length(referred_player_id) > 3);

drop policy if exists "analytics_insert_anon" on public.analytics_events;
create policy "analytics_insert_anon" on public.analytics_events
  for insert with check (length(event_name) between 1 and 48);
