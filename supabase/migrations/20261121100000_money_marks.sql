-- Card 21: the Money and Marks tabs.
-- goals        savings goals Liam edits by hand (ring on the Money tab)
-- money_items  manual rows: things he spent, and subscriptions that renew each month. No bank connection, nothing moves money.
-- marks        one row per assessment he types in. Nothing is scraped from SEQTA.
-- All three are owner only, like every other Halo table.

create table if not exists public.goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  saved      numeric(10, 2) not null default 0 check (saved >= 0),
  target     numeric(10, 2) not null check (target > 0),
  colour     text not null default '#5CFF7A' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.money_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('spend', 'sub')),
  name       text not null check (char_length(name) between 1 and 40),
  amount     numeric(10, 2) not null check (amount > 0),
  category   text not null default 'Other' check (char_length(category) between 1 and 24),
  -- A Perth calendar date. For a spend, the day it was spent. For a subscription, the day of the month it renews.
  on_date    date not null default ((now() at time zone 'Australia/Perth')::date),
  created_at timestamptz not null default now()
);
create index if not exists money_items_user_date_idx on public.money_items (user_id, on_date desc);

create table if not exists public.marks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject    text not null check (char_length(subject) between 1 and 40),
  assessment text not null check (char_length(assessment) between 1 and 60),
  score      numeric(7, 2) not null check (score >= 0),
  out_of     numeric(7, 2) not null check (out_of > 0),
  weighting  numeric(5, 2) check (weighting is null or (weighting >= 0 and weighting <= 100)),
  date       date not null default ((now() at time zone 'Australia/Perth')::date),
  created_at timestamptz not null default now()
);
create index if not exists marks_user_date_idx on public.marks (user_id, date desc);

alter table public.goals enable row level security;
alter table public.money_items enable row level security;
alter table public.marks enable row level security;

-- Signed in users only see and change their own rows.
create policy "goals select own" on public.goals for select to authenticated using (user_id = (select auth.uid()));
create policy "goals insert own" on public.goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy "goals update own" on public.goals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "goals delete own" on public.goals for delete to authenticated using (user_id = (select auth.uid()));

create policy "money_items select own" on public.money_items for select to authenticated using (user_id = (select auth.uid()));
create policy "money_items insert own" on public.money_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "money_items update own" on public.money_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "money_items delete own" on public.money_items for delete to authenticated using (user_id = (select auth.uid()));

create policy "marks select own" on public.marks for select to authenticated using (user_id = (select auth.uid()));
create policy "marks insert own" on public.marks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "marks update own" on public.marks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "marks delete own" on public.marks for delete to authenticated using (user_id = (select auth.uid()));
