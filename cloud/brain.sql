-- BOKRA → Claude, right away: when a new note lands in «دماغي» (voice or typed), wake the cloud brain
-- (the "BOKRA · Inbox" scheduled task on claude.ai) through its API trigger. Run once in Supabase → SQL Editor.
-- The task's API token is NOT in this file: put it in Vault once, in its own query:
--   select vault.create_secret('PASTE-THE-TOKEN-HERE', 'bokra_fire_token');
-- and the task's Fire URL the same way:
--   select vault.create_secret('https://api.anthropic.com/v1/claude_code/routines/trig_.../fire', 'bokra_fire_url');

create extension if not exists pg_net;

-- the brain's lock: set when a run starts, cleared when it ends (tools/bokra.py brain-start / brain-done),
-- so two runs never apply the same note twice. No policies: only the database and the secret key touch it.
create table if not exists public.bokra_brain (id int primary key default 1, running_since timestamptz);
insert into public.bokra_brain (id) values (1) on conflict do nothing;
alter table public.bokra_brain enable row level security;

create or replace function public.bokra_wake_brain() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  tok text;
  fire_url text;
begin
  if new.kind <> 'inbox' or new.deleted or coalesce((new.data->>'processed')::boolean, false) then
    return new;
  end if;
  -- a recording counts once its audio is in Storage (the scheduled run picks up the rest)
  if new.data ? 'audio' and not coalesce((new.data->'audio'->>'up')::boolean, false) then
    return new;
  end if;
  -- a run is already working: it checks again for new notes before it lets go of the lock
  update public.bokra_brain set running_since = now()
   where id = 1 and (running_since is null or running_since < now() - interval '20 minutes');
  if not found then
    return new;
  end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'bokra_fire_token';
  select decrypted_secret into fire_url from vault.decrypted_secrets where name = 'bokra_fire_url';
  if tok is null or fire_url is null then
    update public.bokra_brain set running_since = null where id = 1;
    return new;
  end if;
  perform net.http_post(
    url := fire_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'anthropic-beta', 'experimental-cc-routine-2026-04-01',
      'anthropic-version', '2023-06-01',
      'Content-Type', 'application/json'),
    body := jsonb_build_object('text', 'new note in دماغي: ' || new.id)
  );
  return new;
exception when others then
  -- waking Claude must never stop a note from saving
  return new;
end $$;

drop trigger if exists bokra_wake_brain on public.bokra_items;
create trigger bokra_wake_brain after insert on public.bokra_items
  for each row execute function public.bokra_wake_brain();
