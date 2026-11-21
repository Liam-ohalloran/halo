-- Card 22: the Claude, Shelf and Widgets tabs.
-- task_runs    what scheduled tasks did lately. A scheduled task inserts a row with the service role key (docs/claude-tab.md).
-- shelf_items  things Liam drops on the Shelf: a file (stored in the private `shelf` bucket), a link or a note.
-- countdowns   the Widgets tab's countdowns (Doomsday, birthday, Christmas).
-- All owner only, like every other Halo table. The bucket is private: files are only reachable through short lived signed links.

create table if not exists public.task_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  status      text not null default 'done' check (status in ('running', 'done', 'failed')),
  detail      text not null default '' check (char_length(detail) <= 160),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists task_runs_user_idx on public.task_runs (user_id, created_at desc);

create table if not exists public.shelf_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('file', 'link', 'text')),
  name         text not null check (char_length(name) between 1 and 120),
  -- A link's address, or a note's text. Empty for a file.
  content      text not null default '' check (char_length(content) <= 4000),
  -- Where a file lives in the shelf bucket: <user id>/<item id>/<file name>
  storage_path text,
  size_bytes   bigint check (size_bytes is null or size_bytes >= 0),
  mime         text,
  created_at   timestamptz not null default now(),
  check (kind <> 'file' or storage_path is not null),
  check (kind <> 'link' or content ~ '^https?://')
);
create index if not exists shelf_items_user_idx on public.shelf_items (user_id, created_at desc);

create table if not exists public.countdowns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 24),
  target_date date not null,
  -- A birthday or Christmas comes round every year. Doomsday happens once.
  yearly      boolean not null default false,
  colour      text not null default '#FFC23D' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.task_runs enable row level security;
alter table public.shelf_items enable row level security;
alter table public.countdowns enable row level security;

create policy "task_runs select own" on public.task_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "task_runs insert own" on public.task_runs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "task_runs update own" on public.task_runs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "task_runs delete own" on public.task_runs for delete to authenticated using (user_id = (select auth.uid()));

create policy "shelf_items select own" on public.shelf_items for select to authenticated using (user_id = (select auth.uid()));
create policy "shelf_items insert own" on public.shelf_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "shelf_items update own" on public.shelf_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "shelf_items delete own" on public.shelf_items for delete to authenticated using (user_id = (select auth.uid()));

create policy "countdowns select own" on public.countdowns for select to authenticated using (user_id = (select auth.uid()));
create policy "countdowns insert own" on public.countdowns for insert to authenticated with check (user_id = (select auth.uid()));
create policy "countdowns update own" on public.countdowns for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "countdowns delete own" on public.countdowns for delete to authenticated using (user_id = (select auth.uid()));

-- The private bucket. 20 MB a file. Each user only reaches the folder named after their own id.
insert into storage.buckets (id, name, public, file_size_limit)
values ('shelf', 'shelf', false, 20971520)
on conflict (id) do nothing;

create policy "shelf files select own" on storage.objects for select to authenticated
  using (bucket_id = 'shelf' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "shelf files insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'shelf' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "shelf files delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'shelf' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Realtime, so the Shelf and the task list update on the other device within a couple of seconds.
alter publication supabase_realtime add table public.shelf_items;
alter publication supabase_realtime add table public.task_runs;
