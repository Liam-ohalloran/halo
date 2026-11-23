-- Card 24: the Launch tab. Apps and sites Liam keeps one tap away.
-- kind 'app'  : target is a Start menu shortcut path the helper lists (for example "Spotify.lnk"). Only the helper can open it.
-- kind 'site' : target is a web address. grp is the group it sits under (School, Work, Build).
-- Owner only, like every other Halo table. NOT APPLIED YET: run it from the Supabase SQL editor, or ask Claude to apply it.

create table if not exists public.launch_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('app', 'site')),
  name       text not null check (char_length(name) between 1 and 24),
  target     text not null check (char_length(target) between 1 and 300),
  grp        text not null default '' check (char_length(grp) <= 16),
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  check (kind <> 'site' or target ~ '^https?://')
);
create index if not exists launch_items_user_idx on public.launch_items (user_id, sort, created_at);

alter table public.launch_items enable row level security;

create policy "launch_items select own" on public.launch_items for select to authenticated using (user_id = (select auth.uid()));
create policy "launch_items insert own" on public.launch_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "launch_items update own" on public.launch_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "launch_items delete own" on public.launch_items for delete to authenticated using (user_id = (select auth.uid()));
