-- What a firm does once signed in: create the firm, add client businesses,
-- import vendors, send W-9 requests and read the status board.
--
-- Everything here is a function the app calls as the signed-in user. Unless
-- noted, the functions run as the caller, so the row level security and
-- column grants already in place decide what they can see and change. Two
-- run with elevated rights because members cannot do the step directly:
-- create_firm (nobody is a member yet) and request_w9s (status belongs to
-- the server). Each checks the caller itself.

-- A new user starts their firm and becomes its owner. One firm per user.
create function public.create_firm(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_org uuid;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 200 then
    raise exception 'invalid_firm_name' using errcode = 'P0001';
  end if;

  -- Two tabs submitting at once must not create two firms.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  if exists (select 1 from public.members m where m.user_id = v_user) then
    raise exception 'already_in_a_firm' using errcode = 'P0001';
  end if;

  insert into public.orgs (name) values (v_name) returning id into v_org;
  insert into public.members (org_id, user_id, role) values (v_org, v_user, 'owner');
  insert into public.audit_events (org_id, actor, action)
  values (v_org, 'member:' || v_user, 'firm.created');
  return v_org;
end;
$$;

-- The caller's firm and plan. No row if they have not created or joined one.
create function public.my_firm()
returns table (
  org_id uuid,
  name text,
  role public.member_role,
  plan text,
  business_limit integer,
  payees_per_business_limit integer,
  reply_to_email text,
  time_zone text
)
language sql
stable
set search_path = ''
as $$
  select o.id, o.name, m.role, o.plan, o.business_limit,
         o.payees_per_business_limit, o.reply_to_email, o.time_zone
  from public.members m
  join public.orgs o on o.id = m.org_id
  where m.user_id = (select auth.uid())
  order by m.created_at
  limit 1;
$$;

-- The owner edits the firm's name, reply-to address and time zone.
-- Returns false when the caller is not the owner.
create function public.update_firm(p_name text, p_reply_to_email text, p_time_zone text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_reply text := nullif(lower(btrim(coalesce(p_reply_to_email, ''))), '');
begin
  if v_name = '' or length(v_name) > 200 then
    raise exception 'invalid_firm_name' using errcode = 'P0001';
  end if;
  if v_reply is not null and (length(v_reply) > 254 or v_reply !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
    raise exception 'invalid_reply_to_email' using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_time_zone) then
    raise exception 'invalid_time_zone' using errcode = 'P0001';
  end if;

  update public.orgs o
  set name = v_name, reply_to_email = v_reply, time_zone = p_time_zone
  where o.id = (select f.org_id from public.my_firm() f);
  return found;
end;
$$;

create function public.create_client_business(p_name text, p_tax_year integer)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid := (select f.org_id from public.my_firm() f);
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if v_org is null then
    raise exception 'no_firm' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 200 then
    raise exception 'invalid_business_name' using errcode = 'P0001';
  end if;
  if p_tax_year is null or p_tax_year < 2024 or p_tax_year > 2100 then
    raise exception 'invalid_tax_year' using errcode = 'P0001';
  end if;

  begin
    insert into public.client_businesses (org_id, name, tax_year)
    values (v_org, v_name, p_tax_year)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'duplicate_client_business' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;

-- The firm's client businesses with the counts the overview shows.
create function public.firm_businesses()
returns table (
  id uuid,
  name text,
  tax_year integer,
  payees integer,
  submitted integer,
  waiting integer,
  not_requested integer,
  -- Still owed a W-9 but there is no address to ask at.
  missing_email integer,
  -- Asked, but emails are failing or the vendor turned reminders off.
  needs_attention integer
)
language sql
stable
set search_path = ''
as $$
  select b.id, b.name, b.tax_year,
         count(p.id)::integer,
         (count(*) filter (where p.status = 'submitted'))::integer,
         (count(*) filter (where p.status = 'requested'))::integer,
         (count(*) filter (where p.status = 'not_requested'))::integer,
         (count(*) filter (where p.status <> 'submitted' and p.email is null))::integer,
         (count(*) filter (where p.status = 'requested'
                             and (p.email_failures >= 3 or p.email_opted_out)))::integer
  from public.client_businesses b
  left join public.payees p on p.client_business_id = b.id
  group by b.id
  order by b.name, b.tax_year desc;
$$;

-- One client business's vendors, each with the W-9 on file if there is one.
create function public.business_payees(p_client_business_id uuid)
returns table (
  id uuid,
  name text,
  email text,
  amount_paid_cents bigint,
  legal_or_medical boolean,
  status public.payee_status,
  paused boolean,
  email_opted_out boolean,
  email_failures integer,
  request_sent_at timestamptz,
  reminders_sent integer,
  last_reminder_at timestamptz,
  w9_legal_name text,
  w9_business_name text,
  w9_tax_classification text,
  w9_exempt_payee_code text,
  w9_tin_type text,
  w9_tin_last4 text,
  w9_backup_withholding boolean,
  w9_signed_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.name, p.email, p.amount_paid_cents, p.legal_or_medical, p.status,
         p.paused, p.email_opted_out, p.email_failures, p.request_sent_at,
         p.reminders_sent, p.last_reminder_at,
         s.legal_name, s.business_name, s.tax_classification, s.exempt_payee_code,
         s.tin_type, s.tin_last4, s.backup_withholding, s.signed_at
  from public.payees p
  left join public.w9_submissions s
    on s.payee_id = p.id and s.superseded_at is null
  where p.client_business_id = p_client_business_id
  order by lower(p.name), p.id;
$$;

-- Add vendors from an uploaded list. The app supplies each new vendor's id
-- and the hash of the private link it derived for that id.
--
-- A vendor already on the list is not added twice: a newer amount paid
-- replaces the old one and a missing email is filled in. "Already on the
-- list" means the same email, or the same name when one of the two has no
-- email. Two vendors who share a name but have different emails stay
-- separate. All or nothing: if the plan's limit would be passed, or any
-- row is malformed, nothing is added.
create function public.import_payees(p_client_business_id uuid, p_payees jsonb)
returns table (added integer, updated integer, unchanged integer)
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
  v_row jsonb;
  v_name text;
  v_email text;
  v_amount bigint;
  v_existing public.payees%rowtype;
begin
  added := 0;
  updated := 0;
  unchanged := 0;

  -- Row level security hides other firms' businesses, so this also checks access.
  select b.org_id into v_org
  from public.client_businesses b where b.id = p_client_business_id;
  if v_org is null then
    raise exception 'unknown_client_business' using errcode = '42501';
  end if;

  if p_payees is null or jsonb_typeof(p_payees) <> 'array' or jsonb_array_length(p_payees) > 5000 then
    raise exception 'invalid_import' using errcode = 'P0001';
  end if;

  for v_row in select * from jsonb_array_elements(p_payees) loop
    v_name := btrim(regexp_replace(coalesce(v_row->>'name', ''), '\s+', ' ', 'g'));
    v_email := nullif(lower(btrim(coalesce(v_row->>'email', ''))), '');
    if jsonb_typeof(v_row) <> 'object'
       or v_name = '' or length(v_name) > 200
       or length(coalesce(v_email, '')) > 254
       or coalesce(v_row->>'amount_paid_cents', '0') !~ '^-?[0-9]{1,15}$' then
      raise exception 'invalid_import' using errcode = 'P0001';
    end if;
    v_amount := (v_row->>'amount_paid_cents')::bigint;

    select * into v_existing
    from public.payees p
    where p.client_business_id = p_client_business_id
      and (lower(p.email) = v_email
           or (lower(p.name) = lower(v_name) and (p.email is null or v_email is null)))
    order by (lower(p.email) is not distinct from v_email) desc, p.created_at, p.id
    limit 1;

    if found then
      if (v_amount is not null and v_amount is distinct from v_existing.amount_paid_cents)
         or (v_existing.email is null and v_email is not null) then
        update public.payees p
        set amount_paid_cents = coalesce(v_amount, p.amount_paid_cents),
            email = coalesce(p.email, v_email)
        where p.id = v_existing.id;
        updated := updated + 1;
      else
        unchanged := unchanged + 1;
      end if;
    else
      if coalesce(v_row->>'portal_token_hash', '') !~ '^[0-9a-f]{64}$'
         or coalesce(v_row->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'invalid_import' using errcode = 'P0001';
      end if;
      insert into public.payees
        (id, org_id, client_business_id, name, email, amount_paid_cents, portal_token_hash)
      values
        ((v_row->>'id')::uuid, v_org, p_client_business_id, v_name, v_email, v_amount,
         v_row->>'portal_token_hash');
      added := added + 1;
    end if;
  end loop;

  return next;
end;
$$;

-- Ask vendors for their W-9. With no ids, every vendor of the business who
-- has not been asked yet; otherwise only those listed. Vendors without an
-- email or on pause are left alone. The scheduled job sends the emails.
-- Returns how many were queued.
create function public.request_w9s(p_client_business_id uuid, p_payee_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_count integer;
begin
  select b.org_id into v_org
  from public.client_businesses b where b.id = p_client_business_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  update public.payees p
  set status = 'requested', requested_at = now()
  where p.client_business_id = p_client_business_id
    and p.status = 'not_requested'
    and p.email is not null
    and not p.paused
    and (p_payee_ids is null or p.id = any (p_payee_ids));
  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into public.audit_events (org_id, actor, action, target)
    values (v_org, 'member:' || (select auth.uid()), 'w9.requested',
            'client_business:' || p_client_business_id || ' count:' || v_count);
  end if;
  return v_count;
end;
$$;

-- Edit a vendor. Returns false if the caller cannot see them.
create function public.update_payee(
  p_payee_id uuid,
  p_name text,
  p_email text,
  p_amount_paid_cents bigint,
  p_legal_or_medical boolean,
  p_paused boolean
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_name = '' or length(v_name) > 200 then
    raise exception 'invalid_payee_name' using errcode = 'P0001';
  end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
    raise exception 'invalid_payee_email' using errcode = 'P0001';
  end if;
  if p_amount_paid_cents is not null and p_amount_paid_cents < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  update public.payees p
  set name = v_name, email = v_email, amount_paid_cents = p_amount_paid_cents,
      legal_or_medical = coalesce(p_legal_or_medical, false),
      paused = coalesce(p_paused, false)
  where p.id = p_payee_id;
  return found;
end;
$$;

-- Remove a vendor added by mistake. Returns false if the caller cannot see them.
create function public.delete_payee(p_payee_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  delete from public.payees p where p.id = p_payee_id;
  return found;
end;
$$;

-- A new address has never been asked: start the emails over for it, and
-- forget failures that belonged to the old one. An opt-out stays.
create function public.payees_email_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    new.email_failures := 0;
    new.email_claimed_at := null;
    if new.status = 'requested' then
      new.request_sent_at := null;
      new.reminders_sent := 0;
      new.last_reminder_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger payees_email_changed
  before update on public.payees
  for each row execute function public.payees_email_changed();

-- A signed W-9 is a record the firm has to be able to produce. A signed-in
-- user cannot delete a vendor who has one, directly or by removing the
-- client business. The server still can, for closing an account.
create function public.payees_keep_signed_w9s()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and exists (select 1 from public.w9_submissions s where s.payee_id = old.id) then
    raise exception 'payee_has_w9' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger payees_keep_signed_w9s
  before delete on public.payees
  for each row execute function public.payees_keep_signed_w9s();

revoke all on function public.payees_email_changed() from public, anon, authenticated;
revoke all on function public.payees_keep_signed_w9s() from public, anon, authenticated;

-- Signed-in users only.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_firm(text)',
    'public.my_firm()',
    'public.update_firm(text, text, text)',
    'public.create_client_business(text, integer)',
    'public.firm_businesses()',
    'public.business_payees(uuid)',
    'public.import_payees(uuid, jsonb)',
    'public.request_w9s(uuid, uuid[])',
    'public.update_payee(uuid, text, text, bigint, boolean, boolean)',
    'public.delete_payee(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
