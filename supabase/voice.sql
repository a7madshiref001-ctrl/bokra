-- BOKRA v1.9 — voice notes as audio + live updates. Run once: Supabase → SQL Editor → New query → Run.
-- (Already part of schema.sql for a fresh setup; safe to run again.)

-- 1) A private bucket for voice recordings. Each user only reaches files under a folder named with their id.
insert into storage.buckets (id, name, public, file_size_limit)
values ('bokra-voice', 'bokra-voice', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "bokra voice read" on storage.objects;
drop policy if exists "bokra voice insert" on storage.objects;
drop policy if exists "bokra voice update" on storage.objects;
drop policy if exists "bokra voice delete" on storage.objects;

create policy "bokra voice read" on storage.objects for select to authenticated
  using (bucket_id = 'bokra-voice' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bokra voice insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'bokra-voice' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bokra voice update" on storage.objects for update to authenticated
  using (bucket_id = 'bokra-voice' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'bokra-voice' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bokra voice delete" on storage.objects for delete to authenticated
  using (bucket_id = 'bokra-voice' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2) Realtime: the app hears about every change to its rows the moment it's written (RLS still applies).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bokra_items') then
    alter publication supabase_realtime add table public.bokra_items;
  end if;
end $$;
