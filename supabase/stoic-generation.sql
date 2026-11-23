create table if not exists public.stoic_generation_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  attempts integer not null check (attempts between 1 and 5),
  primary key (user_id, day)
);

alter table public.stoic_generation_limits enable row level security;
revoke all on public.stoic_generation_limits from public, anon, authenticated;

create or replace function public.claim_stoic_generation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  insert into public.stoic_generation_limits (user_id, day, attempts)
  values (auth.uid(), (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, day) do update
    set attempts = public.stoic_generation_limits.attempts + 1
    where public.stoic_generation_limits.attempts < 5
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_stoic_generation() from public, anon;
grant execute on function public.claim_stoic_generation() to authenticated;
