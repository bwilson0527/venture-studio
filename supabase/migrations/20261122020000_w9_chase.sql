-- W-9 chase and 1099 prep: a firm tracks its client businesses, the payees
-- (vendors and contractors) each one paid, and the W-9 each payee submits.
--
-- Access model, on top of the org membership rules already in place:
--   * Firm members manage client businesses and payees for their own org.
--   * Payees never sign in. Their W-9 arrives through the portal, which runs
--     server-side with the service role after checking the link token.
--   * A submitted W-9 is written only by the server. Members can read it,
--     except the encrypted taxpayer ID and the signer's network details.
--     Revealing a taxpayer ID happens server-side and is logged.

create type public.payee_status as enum ('not_requested', 'requested', 'submitted');

-- Plan limits for this product. The free tier is one client business with
-- up to ten payees. A null payee limit means unlimited.
alter table public.orgs
  add column business_limit integer not null default 1,
  add column payees_per_business_limit integer default 10;

create table public.client_businesses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  tax_year integer not null,
  created_at timestamptz not null default now(),
  unique (org_id, name, tax_year)
);
create index client_businesses_org_id_idx on public.client_businesses (org_id);

create table public.payees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_business_id uuid not null references public.client_businesses (id) on delete cascade,
  name text not null,
  email text,
  -- Paid by cash, check or bank transfer in the tax year. Null if unknown.
  amount_paid_cents bigint,
  -- Attorney fees and medical payments are reportable even to corporations.
  legal_or_medical boolean not null default false,
  status public.payee_status not null default 'not_requested',
  paused boolean not null default false,
  portal_token_hash text not null unique,
  portal_token_version integer not null default 1,
  requested_at timestamptz,
  reminders_sent integer not null default 0,
  last_reminder_at timestamptz,
  email_opted_out boolean not null default false,
  created_at timestamptz not null default now()
);
create index payees_client_business_id_idx on public.payees (client_business_id);
create index payees_org_id_status_idx on public.payees (org_id, status);

create table public.w9_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  payee_id uuid not null references public.payees (id) on delete cascade,
  -- Line 1 and line 2 of Form W-9.
  legal_name text not null,
  business_name text,
  tax_classification text not null check (tax_classification in (
    'individual', 'c_corp', 's_corp', 'partnership', 'trust_estate',
    'llc_c', 'llc_s', 'llc_p', 'other')),
  other_classification text,
  exempt_payee_code text,
  fatca_exemption_code text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  tin_type text not null check (tin_type in ('ssn', 'ein')),
  -- Encrypted by the application; the key never reaches the database.
  tin_ciphertext text not null,
  tin_last4 text not null check (tin_last4 ~ '^[0-9]{4}$'),
  -- Electronic signature record.
  signed_name text not null,
  signed_at timestamptz not null default now(),
  signer_ip inet,
  signer_user_agent text,
  certification_version text not null,
  -- A payee may resubmit to correct a mistake; the newest row is current.
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);
create index w9_submissions_payee_id_idx on public.w9_submissions (payee_id, created_at desc);
create unique index w9_submissions_one_current_idx
  on public.w9_submissions (payee_id) where superseded_at is null;

create table public.payee_reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  payee_id uuid not null references public.payees (id) on delete cascade,
  kind text not null check (kind in ('request', 'reminder', 'escalation')),
  status public.reminder_status not null default 'scheduled',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);
create index payee_reminders_due_idx
  on public.payee_reminders (scheduled_for) where status = 'scheduled';
create index payee_reminders_payee_id_idx on public.payee_reminders (payee_id);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_business_id uuid not null references public.client_businesses (id) on delete cascade,
  format text not null,
  payee_count integer not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index exports_org_id_idx on public.exports (org_id, created_at desc);

-- Plan limits. The org row lock makes concurrent inserts queue instead of
-- racing past the limit.
create function public.enforce_business_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed integer;
  current_count integer;
begin
  -- Triggers run before row level security checks the new row, so refuse
  -- other firms here first; otherwise the limit message would describe
  -- another firm's plan. The server (no signed-in user) is not affected.
  if (select auth.uid()) is not null and not public.is_org_member(new.org_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  select o.business_limit into allowed
  from public.orgs o where o.id = new.org_id for update;

  select count(*) into current_count
  from public.client_businesses b where b.org_id = new.org_id;

  if current_count >= allowed then
    raise exception 'business_limit_reached'
      using errcode = 'P0001',
            detail = format('This plan allows %s client businesses.', allowed);
  end if;
  return new;
end;
$$;

create function public.enforce_payee_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed integer;
  current_count integer;
  business_org uuid;
begin
  -- Triggers run before row level security checks the new row, so refuse
  -- other firms here first; otherwise the limit message would describe
  -- another firm's plan. The server (no signed-in user) is not affected.
  if (select auth.uid()) is not null and not public.is_org_member(new.org_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  select b.org_id into business_org
  from public.client_businesses b where b.id = new.client_business_id;

  -- A payee must belong to the same org as its client business.
  if business_org is distinct from new.org_id then
    raise exception 'client_business_org_mismatch' using errcode = '42501';
  end if;

  select o.payees_per_business_limit into allowed
  from public.orgs o where o.id = new.org_id for update;

  if allowed is not null then
    select count(*) into current_count
    from public.payees p where p.client_business_id = new.client_business_id;

    if current_count >= allowed then
      raise exception 'payee_limit_reached'
        using errcode = 'P0001',
              detail = format('This plan allows %s payees per client business.', allowed);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_business_limit() from public, anon, authenticated;
revoke all on function public.enforce_payee_limit() from public, anon, authenticated;

create trigger client_businesses_enforce_limit
  before insert on public.client_businesses
  for each row execute function public.enforce_business_limit();

create trigger payees_enforce_limit
  before insert on public.payees
  for each row execute function public.enforce_payee_limit();

alter table public.client_businesses enable row level security;
alter table public.payees enable row level security;
alter table public.w9_submissions enable row level security;
alter table public.payee_reminders enable row level security;
alter table public.exports enable row level security;

create policy client_businesses_all on public.client_businesses
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Payees: members add, read and remove them, and may edit only the fields a
-- person should change. Status, link tokens and reminder counters belong to
-- the server.
create policy payees_all on public.payees
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
revoke update on public.payees from authenticated;
grant update (name, email, amount_paid_cents, legal_or_medical, paused)
  on public.payees to authenticated;

-- Plan limits changed only server-side, like the other plan columns on orgs.
-- (orgs already restricts member updates to name and time_zone.)

-- W-9 submissions: read-only for members, and never the encrypted taxpayer
-- ID or the signer's network details.
create policy w9_submissions_select on public.w9_submissions
  for select to authenticated using (public.is_org_member(org_id));
revoke all on public.w9_submissions from anon, authenticated;
grant select (
  id, org_id, payee_id, legal_name, business_name, tax_classification,
  other_classification, exempt_payee_code, fatca_exemption_code,
  address_line1, address_line2, city, state, postal_code,
  tin_type, tin_last4, signed_name, signed_at, certification_version,
  superseded_at, created_at
) on public.w9_submissions to authenticated;

create policy payee_reminders_select on public.payee_reminders
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.payee_reminders from anon, authenticated;

create policy exports_select on public.exports
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.exports from anon, authenticated;
