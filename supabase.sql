-- Bonkoball leaderboard table. Paste into Supabase > SQL editor > Run.
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  game text not null check (char_length(game) between 1 and 32),
  name text not null check (char_length(name) between 1 and 16),
  score integer not null check (score >= 0 and score <= 50000000),
  cid text not null check (char_length(cid) between 4 and 16),
  day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now()
);
create index if not exists scores_game_day_score on public.scores (game, day, score desc);
create index if not exists scores_game_score on public.scores (game, score desc);
alter table public.scores enable row level security;
drop policy if exists "read scores" on public.scores;
create policy "read scores" on public.scores for select using (true);
drop policy if exists "insert scores" on public.scores;
create policy "insert scores" on public.scores for insert with check (true);
-- Live presence ("now playing") uses Supabase Realtime channels; no table needed.
-- Enable Realtime in Project Settings > API if it is off (it is on by default).
