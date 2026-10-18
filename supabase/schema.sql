-- BOKRA — database schema for Supabase
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- One flexible table holds everything (trackers, entries, tasks, goals, reports...),
-- so adding a new kind of thing never needs a schema change.

create table if not exists public.bokra_items (
  id          text        not null,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text        not null,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  deleted     boolean     not null default false,
  synced_at   timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists bokra_items_synced on public.bokra_items (user_id, synced_at);
create index if not exists bokra_items_kind   on public.bokra_items (user_id, kind);

alter table public.bokra_items enable row level security;

-- only signed-in users reach the table (and RLS limits them to their own rows)
grant select, insert, update, delete on public.bokra_items to authenticated;
revoke all on public.bokra_items from anon;

drop policy if exists "bokra own select" on public.bokra_items;
drop policy if exists "bokra own insert" on public.bokra_items;
drop policy if exists "bokra own update" on public.bokra_items;
drop policy if exists "bokra own delete" on public.bokra_items;

create policy "bokra own select" on public.bokra_items
  for select using (auth.uid() = user_id);
create policy "bokra own insert" on public.bokra_items
  for insert with check (auth.uid() = user_id);
create policy "bokra own update" on public.bokra_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bokra own delete" on public.bokra_items
  for delete using (auth.uid() = user_id);

-- Every write gets a server timestamp (used by devices to pull changes),
-- and an older edit can never overwrite a newer one (last write wins by updated_at).
create or replace function public.bokra_touch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists bokra_touch on public.bokra_items;
create trigger bokra_touch
  before insert or update on public.bokra_items
  for each row execute function public.bokra_touch();
