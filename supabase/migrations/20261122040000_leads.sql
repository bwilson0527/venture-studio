-- Early-access sign-ups from the landing page. Written by the server only;
-- nobody reads or writes this table through the public API.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  -- Lowercased by the application, so one address is one lead.
  email text not null unique check (email = lower(email)),
  firm_name text,
  client_count text check (client_count in ('1-10', '11-25', '26-100', '100+')),
  -- Where the visitor came from (a campaign tag), if known.
  source text,
  signups integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

-- Store a sign-up. Signing up again with the same address updates the lead
-- instead of failing, and keeps earlier answers the visitor left blank.
create function public.capture_lead(
  p_email text,
  p_firm_name text,
  p_client_count text,
  p_source text
)
returns void
language sql
set search_path = ''
as $$
  insert into public.leads (email, firm_name, client_count, source)
  values (p_email, nullif(p_firm_name, ''), p_client_count, left(nullif(p_source, ''), 100))
  on conflict (email) do update
  set firm_name = coalesce(excluded.firm_name, public.leads.firm_name),
      client_count = coalesce(excluded.client_count, public.leads.client_count),
      source = coalesce(public.leads.source, excluded.source),
      signups = public.leads.signups + 1,
      updated_at = now();
$$;

revoke all on function public.capture_lead(text, text, text, text) from public, anon, authenticated;
grant execute on function public.capture_lead(text, text, text, text) to service_role;
