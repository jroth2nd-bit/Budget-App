-- Apply once in the existing Supabase project's SQL editor.
begin;

create table public.tracker_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision uuid not null,
  data jsonb not null
);

alter table public.tracker_data enable row level security;

create policy "Users can read their tracker"
  on public.tracker_data for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their tracker"
  on public.tracker_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their tracker"
  on public.tracker_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.tracker_data from anon, authenticated;
grant select, insert, update on public.tracker_data to authenticated;

commit;
