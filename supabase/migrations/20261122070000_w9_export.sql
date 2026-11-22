-- Exporting a client business's vendors and W-9s for 1099 filing.
--
-- The export can carry full taxpayer IDs, so it runs on the server: the app
-- checks who is signed in, calls this with that user's id, decrypts the IDs
-- and builds the file. The function checks the membership again itself, and
-- records every export. Members never receive the encrypted IDs directly.
create function public.export_w9s(
  p_client_business_id uuid,
  p_member_id uuid,
  p_include_tins boolean
)
returns table (
  payee_id uuid,
  payee_name text,
  email text,
  amount_paid_cents bigint,
  legal_or_medical boolean,
  legal_name text,
  business_name text,
  tax_classification text,
  other_classification text,
  exempt_payee_code text,
  fatca_exemption_code text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  tin_type text,
  tin_last4 text,
  -- Null unless full taxpayer IDs were asked for.
  tin_ciphertext text,
  backup_withholding boolean,
  signed_name text,
  signed_at timestamptz
)
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
  v_count integer;
begin
  select b.org_id into v_org
  from public.client_businesses b where b.id = p_client_business_id;
  if v_org is null or not exists (
    select 1 from public.members m where m.org_id = v_org and m.user_id = p_member_id
  ) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  select count(*) into v_count
  from public.payees p where p.client_business_id = p_client_business_id;

  insert into public.exports (org_id, client_business_id, format, payee_count, created_by)
  values (v_org, p_client_business_id,
          case when p_include_tins then 'csv_full_tins' else 'csv_last4' end,
          v_count, p_member_id);
  insert into public.audit_events (org_id, actor, action, target)
  values (v_org, 'member:' || p_member_id,
          case when p_include_tins then 'w9.exported_with_tins' else 'w9.exported' end,
          'client_business:' || p_client_business_id || ' count:' || v_count);

  return query
  select p.id, p.name, p.email, p.amount_paid_cents, p.legal_or_medical,
         s.legal_name, s.business_name, s.tax_classification, s.other_classification,
         s.exempt_payee_code, s.fatca_exemption_code,
         s.address_line1, s.address_line2, s.city, s.state, s.postal_code,
         s.tin_type, s.tin_last4,
         case when p_include_tins then s.tin_ciphertext end,
         s.backup_withholding, s.signed_name, s.signed_at
  from public.payees p
  left join public.w9_submissions s
    on s.payee_id = p.id and s.superseded_at is null
  where p.client_business_id = p_client_business_id
  order by lower(p.name), p.id;
end;
$$;

revoke all on function public.export_w9s(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.export_w9s(uuid, uuid, boolean) to service_role;
