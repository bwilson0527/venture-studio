-- The payee portal: the two calls the server makes when a vendor opens their
-- W-9 link and when they sign and submit the form.
--
-- Both run as the caller (no SECURITY DEFINER) and are granted only to the
-- service role, so they are reachable from the server and nowhere else. If a
-- grant were ever loosened by mistake, row level security would still apply
-- to a signed-in or anonymous caller.

-- Two answers the paper form carries that the first table left out:
--   * the payee struck out certification item 2 because the IRS told them
--     they are subject to backup withholding;
--   * line 3b, foreign partners, owners or beneficiaries.
alter table public.w9_submissions
  add column backup_withholding boolean not null default false,
  add column has_foreign_partners boolean not null default false;

grant select (backup_withholding, has_foreign_partners)
  on public.w9_submissions to authenticated;

-- What the portal page needs to greet a payee, found by the hash of the
-- token in their link. Returns no row for an unknown or rotated link.
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
  submitted_tin_last4 text
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.name, o.name, b.name, b.tax_year, p.status,
         s.signed_at, s.tin_type, s.tin_last4
  from public.payees p
  join public.orgs o on o.id = p.org_id
  join public.client_businesses b on b.id = p.client_business_id
  left join public.w9_submissions s
    on s.payee_id = p.id and s.superseded_at is null
  where p.portal_token_hash = p_token_hash;
$$;

-- Record a signed W-9 in one transaction: retire the previous one if the
-- payee is correcting a mistake, store the new one, mark the payee as done,
-- stop their pending reminders, and log who submitted it and from where.
--
-- The taxpayer ID arrives already encrypted; the key never reaches the
-- database. Field formats are checked by the application before this call,
-- and the table constraints refuse anything malformed that gets past it.
create function public.portal_submit_w9(
  p_token_hash text,
  p_form jsonb,
  p_tin_ciphertext text,
  p_signer_ip inet,
  p_signer_user_agent text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_payee public.payees%rowtype;
  v_previous integer;
  v_id uuid;
begin
  -- The row lock makes two submissions from the same link queue up.
  select * into v_payee
  from public.payees p
  where p.portal_token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'invalid_link' using errcode = 'P0001';
  end if;

  -- A payee may correct a mistake, but a link is not an open inbox.
  select count(*) into v_previous
  from public.w9_submissions s where s.payee_id = v_payee.id;
  if v_previous >= 10 then
    raise exception 'too_many_submissions' using errcode = 'P0001';
  end if;

  update public.w9_submissions
  set superseded_at = now()
  where payee_id = v_payee.id and superseded_at is null;

  insert into public.w9_submissions (
    org_id, payee_id, legal_name, business_name, tax_classification,
    other_classification, exempt_payee_code, fatca_exemption_code,
    address_line1, address_line2, city, state, postal_code,
    tin_type, tin_ciphertext, tin_last4,
    backup_withholding, has_foreign_partners,
    signed_name, signer_ip, signer_user_agent, certification_version
  ) values (
    v_payee.org_id, v_payee.id,
    p_form->>'legal_name',
    nullif(p_form->>'business_name', ''),
    p_form->>'tax_classification',
    nullif(p_form->>'other_classification', ''),
    nullif(p_form->>'exempt_payee_code', ''),
    nullif(p_form->>'fatca_exemption_code', ''),
    p_form->>'address_line1',
    nullif(p_form->>'address_line2', ''),
    p_form->>'city',
    p_form->>'state',
    p_form->>'postal_code',
    p_form->>'tin_type',
    p_tin_ciphertext,
    p_form->>'tin_last4',
    coalesce((p_form->>'backup_withholding')::boolean, false),
    coalesce((p_form->>'has_foreign_partners')::boolean, false),
    p_form->>'signed_name',
    p_signer_ip,
    left(p_signer_user_agent, 500),
    p_form->>'certification_version'
  )
  returning id into v_id;

  update public.payees set status = 'submitted' where id = v_payee.id;

  update public.payee_reminders
  set status = 'cancelled'
  where payee_id = v_payee.id and status = 'scheduled';

  insert into public.audit_events (org_id, actor, action, target, ip)
  values (
    v_payee.org_id,
    'payee:' || v_payee.id,
    case when v_previous = 0 then 'w9.submitted' else 'w9.resubmitted' end,
    'w9_submission:' || v_id,
    p_signer_ip
  );

  return v_id;
end;
$$;

revoke all on function public.portal_lookup_payee(text) from public, anon, authenticated;
revoke all on function public.portal_submit_w9(text, jsonb, text, inet, text) from public, anon, authenticated;
grant execute on function public.portal_lookup_payee(text) to service_role;
grant execute on function public.portal_submit_w9(text, jsonb, text, inet, text) to service_role;
