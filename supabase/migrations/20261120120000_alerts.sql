-- Card 20: the alerts table. One row per thing Halo should tell Liam about.
-- Owner only. A scheduled task inserts rows with the service role key (see docs/alerts.md), the app reads them,
-- marks them read and clears them as the signed in user.

create table if not exists public.alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type         text not null check (char_length(type) between 1 and 40),
  title        text not null check (char_length(title) between 1 and 80),
  body         text not null default '' check (char_length(body) <= 160),
  action_label text check (action_label is null or char_length(action_label) <= 24),
  action_url   text check (action_url is null or action_url ~ '^https?://'),
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);

-- The tab asks for the unread rows of one user, newest first.
create index if not exists alerts_user_unread_idx on public.alerts (user_id, created_at desc) where read_at is null;

alter table public.alerts enable row level security;

-- Signed in users only see and change their own rows. The service role bypasses RLS, so a scheduled task can insert.
create policy "alerts select own" on public.alerts for select to authenticated using (user_id = (select auth.uid()));
create policy "alerts insert own" on public.alerts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "alerts update own" on public.alerts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "alerts delete own" on public.alerts for delete to authenticated using (user_id = (select auth.uid()));

-- Realtime, so a new row shows within a couple of seconds. Row level security applies to the stream too.
alter publication supabase_realtime add table public.alerts;
