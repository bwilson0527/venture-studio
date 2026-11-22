-- Sending W-9 requests and reminders.
--
-- The server's scheduled job asks for payees who may be due an email,
-- claims one, sends, and records the outcome. Deciding whether a reminder is
-- actually due (the cadence and the firm's sending hours) is application
-- code; these functions keep the bookkeeping safe when two runs overlap.

alter table public.payees
  -- When the first request email went out. Reminders count from here.
  add column request_sent_at timestamptz,
  -- Set while a run is sending to this payee, so a second run skips them.
  add column email_claimed_at timestamptz,
  -- Sends that failed in a row. Three and the job stops trying.
  add column email_failures integer not null default 0;

-- Where a vendor's reply should go. Without it, emails say replies are not read.
alter table public.orgs add column reply_to_email text;
grant update (reply_to_email) on public.orgs to authenticated;

-- A partial index over exactly the payees the job looks at.
create index payees_awaiting_w9_idx on public.payees (request_sent_at nulls first)
  where status = 'requested' and not paused and not email_opted_out and email is not null;

-- Payees who may be due an email: every one still waiting for a first
-- request, then those not contacted for at least `p_min_gap_days`.
create function public.w9_email_candidates(p_limit integer, p_min_gap_days integer)
returns table (
  payee_id uuid,
  payee_name text,
  email text,
  firm_name text,
  reply_to_email text,
  time_zone text,
  business_name text,
  tax_year integer,
  portal_token_version integer,
  -- So the job can confirm the link it derives is the one on file.
  portal_token_hash text,
  request_sent_at timestamptz,
  reminders_sent integer,
  last_reminder_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.name, p.email, o.name, o.reply_to_email, o.time_zone,
         b.name, b.tax_year, p.portal_token_version, p.portal_token_hash,
         p.request_sent_at, p.reminders_sent, p.last_reminder_at
  from public.payees p
  join public.orgs o on o.id = p.org_id
  join public.client_businesses b on b.id = p.client_business_id
  where p.status = 'requested'
    and not p.paused
    and not p.email_opted_out
    and p.email is not null
    and p.email_failures < 3
    and (p.email_claimed_at is null or p.email_claimed_at < now() - interval '15 minutes')
    and (
      p.request_sent_at is null
      or coalesce(p.last_reminder_at, p.request_sent_at)
           <= now() - make_interval(days => p_min_gap_days)
    )
  order by p.request_sent_at nulls first, coalesce(p.last_reminder_at, p.request_sent_at)
  limit greatest(p_limit, 0);
$$;

-- Take a payee for sending. False means another run got there first, or
-- something changed since the candidate list was read (they submitted,
-- opted out, were paused, or were already sent this email).
create function public.claim_w9_email(p_payee_id uuid, p_reminders_sent integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.payees
  set email_claimed_at = now()
  where id = p_payee_id
    and status = 'requested'
    and not paused
    and not email_opted_out
    and email is not null
    and reminders_sent = p_reminders_sent
    and (email_claimed_at is null or email_claimed_at < now() - interval '15 minutes');
  return found;
end;
$$;

-- Record a sent email and release the claim.
create function public.complete_w9_email(
  p_payee_id uuid,
  p_kind text,
  p_provider_message_id text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if p_kind = 'request' then
    update public.payees
    set request_sent_at = now(), email_claimed_at = null, email_failures = 0
    where id = p_payee_id
    returning org_id into v_org;
  elsif p_kind = 'reminder' then
    update public.payees
    set reminders_sent = reminders_sent + 1, last_reminder_at = now(),
        email_claimed_at = null, email_failures = 0
    where id = p_payee_id
    returning org_id into v_org;
  else
    raise exception 'unknown_email_kind' using errcode = 'P0001';
  end if;

  if v_org is null then
    raise exception 'unknown_payee' using errcode = 'P0001';
  end if;

  insert into public.payee_reminders
    (org_id, payee_id, kind, status, scheduled_for, sent_at, provider_message_id)
  values (v_org, p_payee_id, p_kind, 'sent', now(), now(), p_provider_message_id);
end;
$$;

-- Record a failed send and release the claim, so a later run tries again.
create function public.fail_w9_email(p_payee_id uuid, p_kind text, p_error text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
begin
  update public.payees
  set email_claimed_at = null, email_failures = email_failures + 1
  where id = p_payee_id
  returning org_id into v_org;

  if v_org is null then
    raise exception 'unknown_payee' using errcode = 'P0001';
  end if;

  insert into public.payee_reminders (org_id, payee_id, kind, status, scheduled_for, error)
  values (v_org, p_payee_id, p_kind, 'failed', now(), left(p_error, 500));
end;
$$;

-- A payee turns reminders off from the link in an email. Returns false for
-- an unknown link. Their form link keeps working.
create function public.portal_stop_emails(p_token_hash text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_payee public.payees%rowtype;
begin
  select * into v_payee
  from public.payees p
  where p.portal_token_hash = p_token_hash
  for update;

  if not found then
    return false;
  end if;

  if not v_payee.email_opted_out then
    update public.payees set email_opted_out = true where id = v_payee.id;
    update public.payee_reminders
    set status = 'cancelled'
    where payee_id = v_payee.id and status = 'scheduled';
    insert into public.audit_events (org_id, actor, action, target)
    values (v_payee.org_id, 'payee:' || v_payee.id, 'w9.emails_stopped', 'payee:' || v_payee.id);
  end if;
  return true;
end;
$$;

-- The portal page shows whether reminders are already off.
drop function public.portal_lookup_payee(text);
create function public.portal_lookup_payee(p_token_hash text)
returns table (
  payee_id uuid,
  payee_name text,
  firm_name text,
  business_name text,
  tax_year integer,
  status public.payee_status,
  submitted_at timestamptz,
  submitted_tin_type text,
  submitted_tin_last4 text,
  email_opted_out boolean
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.name, o.name, b.name, b.tax_year, p.status,
         s.signed_at, s.tin_type, s.tin_last4, p.email_opted_out
  from public.payees p
  join public.orgs o on o.id = p.org_id
  join public.client_businesses b on b.id = p.client_business_id
  left join public.w9_submissions s
    on s.payee_id = p.id and s.superseded_at is null
  where p.portal_token_hash = p_token_hash;
$$;

revoke all on function public.w9_email_candidates(integer, integer) from public, anon, authenticated;
revoke all on function public.claim_w9_email(uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_w9_email(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_w9_email(uuid, text, text) from public, anon, authenticated;
revoke all on function public.portal_stop_emails(text) from public, anon, authenticated;
revoke all on function public.portal_lookup_payee(text) from public, anon, authenticated;
grant execute on function public.w9_email_candidates(integer, integer) to service_role;
grant execute on function public.claim_w9_email(uuid, integer) to service_role;
grant execute on function public.complete_w9_email(uuid, text, text) to service_role;
grant execute on function public.fail_w9_email(uuid, text, text) to service_role;
grant execute on function public.portal_stop_emails(text) to service_role;
grant execute on function public.portal_lookup_payee(text) to service_role;
