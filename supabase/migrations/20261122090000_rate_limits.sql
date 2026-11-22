-- Limits on how often the public pages can be used: asking for sign-in
-- codes, trying codes, and the early-access form. Without them anyone could
-- flood a stranger's inbox with codes, guess a code by brute force, or fill
-- the leads table.
--
-- The server counts each attempt here before doing the work. Keys are
-- opaque: the server hashes addresses before they reach the database.

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (key, window_start)
);

-- Server only: no policies, and no access for visitors or signed-in users.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Count one attempt against `p_key` and say whether it is within the limit.
-- Time is cut into fixed windows of `p_window_seconds`; an attempt is allowed
-- while its window has seen no more than `p_limit` attempts, this one included.
create function public.take_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if coalesce(p_key, '') = '' or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit' using errcode = 'P0001';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start)
  values (p_key, v_window)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Old windows are of no use. Sweep them now and then instead of on a schedule.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.take_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_rate_limit(text, integer, integer) to service_role;
