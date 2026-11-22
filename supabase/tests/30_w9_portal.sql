-- Payee portal: lookup by link, signed submission, corrections, and who may
-- call the portal functions. Runs after 20_w9_chase.sql and reuses its payees.
-- Payee A ('payee-hash-a') already has one W-9 and one scheduled reminder.

-- Members can read the two new answers; they stay server-written.
set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000c');
select test.expect(
  (select backup_withholding or has_foreign_partners from public.w9_submissions) = false,
  'member can read the backup withholding and line 3b answers');

-- The portal functions are for the server only. The refusal must come from
-- the function grant itself, not from a table privilege further in.
select test.expect_error(
  $$select * from public.portal_lookup_payee('payee-hash-a')$$,
  'permission denied for function',
  'a signed-in member calling the portal lookup');
select test.expect_error(
  $$select public.portal_submit_w9('payee-hash-a', '{}'::jsonb, 'v1.x', null, null)$$,
  'permission denied for function',
  'a signed-in member calling the portal submit');
reset role;

set role anon;
select test.sign_in(null);
select test.expect_error(
  $$select * from public.portal_lookup_payee('payee-hash-a')$$,
  'permission denied for function',
  'an anonymous visitor calling the portal lookup');
select test.expect_error(
  $$select public.portal_submit_w9('payee-hash-a', '{}'::jsonb, 'v1.x', null, null)$$,
  'permission denied for function',
  'an anonymous visitor calling the portal submit');
reset role;

-- The server.
set role service_role;

select test.expect(
  (select count(*) from public.portal_lookup_payee('no-such-hash')) = 0,
  'an unknown link finds nothing');

select test.expect(
  (select firm_name is not null and business_name = 'A Bakery' and tax_year = 2026
          and payee_name = 'A vendor' and submitted_tin_last4 = '4567'
   from public.portal_lookup_payee('payee-hash-a')),
  'a link finds its payee, firm, client business and current W-9');

select test.expect(
  (select payee_name = 'B vendor' and business_name = 'B Plumbing'
   from public.portal_lookup_payee('payee-hash-b')),
  'each link finds only its own payee');

select test.expect_error(
  $$select public.portal_submit_w9('no-such-hash', '{}'::jsonb, 'v1.x', null, null)$$,
  'invalid_link',
  'submitting through an unknown link');

-- A correction: the earlier W-9 is retired and the new one becomes current.
select public.portal_submit_w9(
  'payee-hash-a',
  jsonb_build_object(
    'legal_name', 'A Vendor LLC',
    'business_name', '',
    'tax_classification', 'llc_s',
    'address_line1', '1 Main St',
    'address_line2', 'Suite 4',
    'city', 'Austin',
    'state', 'TX',
    'postal_code', '78701',
    'tin_type', 'ein',
    'tin_last4', '9999',
    'backup_withholding', true,
    'has_foreign_partners', false,
    'signed_name', 'Alex Vendor',
    'certification_version', 'w9-2024-03'),
  'v1.sealed-a2',
  '198.51.100.20',
  repeat('u', 600));

select test.expect(
  (select count(*) from public.w9_submissions
   where payee_id = '40000000-0000-0000-0000-000000000001') = 2,
  'the earlier W-9 is kept');
select test.expect(
  (select count(*) from public.w9_submissions
   where payee_id = '40000000-0000-0000-0000-000000000001' and superseded_at is null) = 1,
  'exactly one W-9 is current after a correction');
select test.expect(
  (select tax_classification = 'llc_s' and tin_last4 = '9999' and tin_ciphertext = 'v1.sealed-a2'
          and backup_withholding and business_name is null and address_line2 = 'Suite 4'
          and signed_name = 'Alex Vendor' and signer_ip = '198.51.100.20'
          and length(signer_user_agent) = 500
   from public.w9_submissions
   where payee_id = '40000000-0000-0000-0000-000000000001' and superseded_at is null),
  'the current W-9 holds the submitted answers and signature record');
select test.expect(
  (select submitted_tin_last4 from public.portal_lookup_payee('payee-hash-a')) = '9999',
  'the lookup shows the corrected W-9');
select test.expect(
  (select status from public.payees where id = '40000000-0000-0000-0000-000000000001') = 'submitted',
  'the payee is marked as submitted');
select test.expect(
  (select count(*) from public.payee_reminders
   where payee_id = '40000000-0000-0000-0000-000000000001' and status = 'scheduled') = 0,
  'pending reminders stop after a submission');
select test.expect(
  (select count(*) from public.payee_reminders
   where payee_id = '40000000-0000-0000-0000-000000000002' and status = 'scheduled') = 1,
  'another payee''s reminders are untouched');
select test.expect(
  (select count(*) from public.audit_events
   where actor = 'payee:40000000-0000-0000-0000-000000000001'
     and action = 'w9.resubmitted' and ip = '198.51.100.20'
     and org_id = '10000000-0000-0000-0000-000000000001') = 1,
  'the submission is logged with the signer''s address');
select test.expect(
  (select status from public.payees where id = '40000000-0000-0000-0000-000000000002') = 'not_requested',
  'another payee''s status is untouched');

-- Malformed answers are refused by the table and leave nothing behind.
select test.expect_error(
  $$select public.portal_submit_w9(
      'payee-hash-a',
      jsonb_build_object(
        'legal_name', 'A Vendor LLC', 'tax_classification', 'not-a-class',
        'address_line1', '1 Main St', 'city', 'Austin', 'state', 'TX',
        'postal_code', '78701', 'tin_type', 'ein', 'tin_last4', '9999',
        'signed_name', 'Alex Vendor', 'certification_version', 'w9-2024-03'),
      'v1.x', null, null)$$,
  'w9_submissions_tax_classification_check',
  'an unknown tax classification');
select test.expect(
  (select count(*) from public.w9_submissions
   where payee_id = '40000000-0000-0000-0000-000000000001' and superseded_at is null) = 1,
  'a refused submission leaves the current W-9 in place');

-- A link is not an open inbox.
do $$
begin
  for i in 1..8 loop
    perform public.portal_submit_w9(
      'payee-hash-a',
      jsonb_build_object(
        'legal_name', 'A Vendor LLC', 'tax_classification', 'llc_s',
        'address_line1', '1 Main St', 'city', 'Austin', 'state', 'TX',
        'postal_code', '78701', 'tin_type', 'ein', 'tin_last4', '9999',
        'signed_name', 'Alex Vendor', 'certification_version', 'w9-2024-03'),
      'v1.x', null, null);
  end loop;
end
$$;
select test.expect_error(
  $$select public.portal_submit_w9(
      'payee-hash-a',
      jsonb_build_object(
        'legal_name', 'A Vendor LLC', 'tax_classification', 'llc_s',
        'address_line1', '1 Main St', 'city', 'Austin', 'state', 'TX',
        'postal_code', '78701', 'tin_type', 'ein', 'tin_last4', '9999',
        'signed_name', 'Alex Vendor', 'certification_version', 'w9-2024-03'),
      'v1.x', null, null)$$,
  'too_many_submissions',
  'an eleventh submission through one link');

-- A first submission is logged as such.
select public.portal_submit_w9(
  'payee-hash-b',
  jsonb_build_object(
    'legal_name', 'B Vendor', 'tax_classification', 'individual',
    'address_line1', '2 Main St', 'city', 'Austin', 'state', 'TX',
    'postal_code', '78701', 'tin_type', 'ssn', 'tin_last4', '6789',
    'signed_name', 'B Vendor', 'certification_version', 'w9-2024-03'),
  'v1.sealed-b2', null, null);
reset role;
