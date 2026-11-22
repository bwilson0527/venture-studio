-- W-9 chase: tenant isolation, server-only fields, and plan limits.
-- Runs after 10_tenant_isolation.sql and reuses its two firms and users.

-- Give firm A room for the fixtures; firm B stays on the free tier.
update public.orgs set business_limit = 2, payees_per_business_limit = 2
where id = '10000000-0000-0000-0000-000000000001';

insert into public.client_businesses (id, org_id, name, tax_year) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A Bakery', 2026),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'B Plumbing', 2026);

insert into public.payees (id, org_id, client_business_id, name, portal_token_hash) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'A vendor', 'payee-hash-a'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000002', 'B vendor', 'payee-hash-b');

insert into public.w9_submissions
  (org_id, payee_id, legal_name, tax_classification, address_line1, city, state,
   postal_code, tin_type, tin_ciphertext, tin_last4, signed_name, signer_ip,
   certification_version)
values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'A Vendor LLC', 'llc_p', '1 Main St', 'Austin', 'TX', '78701', 'ein',
   'v1.sealed-a', '4567', 'A Vendor', '203.0.113.7', '2024-03'),
  ('10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002',
   'B Vendor', 'individual', '2 Main St', 'Austin', 'TX', '78701', 'ssn',
   'v1.sealed-b', '6789', 'B Vendor', '203.0.113.8', '2024-03');

insert into public.payee_reminders (org_id, payee_id, kind, scheduled_for) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'request', now()),
  ('10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'request', now());

insert into public.exports (org_id, client_business_id, format, payee_count) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'generic', 1),
  ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'generic', 1);

-- Only one current W-9 per payee.
select test.expect_error(
  $$insert into public.w9_submissions
      (org_id, payee_id, legal_name, tax_classification, address_line1, city, state,
       postal_code, tin_type, tin_ciphertext, tin_last4, signed_name, certification_version)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
       'Dup', 'individual', 'x', 'x', 'TX', '78701', 'ssn', 'v1.x', '0001', 'Dup', '2024-03')$$,
  'w9_submissions_one_current_idx',
  'a second current W-9 for the same payee');

-- A preparer in firm A.
set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000c');

select test.expect((select count(*) from public.client_businesses) = 1, 'member sees only their client businesses');
select test.expect((select count(*) from public.payees) = 1, 'member sees only their payees');
select test.expect((select count(*) from public.w9_submissions) = 1, 'member sees only their W-9s');
select test.expect((select count(*) from public.payee_reminders) = 1, 'member sees only their reminders');
select test.expect((select count(*) from public.exports) = 1, 'member sees only their exports');
select test.expect((select tin_last4 from public.w9_submissions) = '4567', 'member can read the last four digits');

-- Server-only columns.
select test.expect_denied(
  $$select tin_ciphertext from public.w9_submissions$$,
  'reading the encrypted taxpayer ID');
select test.expect_denied(
  $$select signer_ip from public.w9_submissions$$,
  'reading the signer''s IP address');
select test.expect_denied(
  $$select * from public.w9_submissions$$,
  'selecting every W-9 column');

-- W-9s, reminders and exports are written only by the server.
select test.expect_denied(
  $$insert into public.w9_submissions
      (org_id, payee_id, legal_name, tax_classification, address_line1, city, state,
       postal_code, tin_type, tin_ciphertext, tin_last4, signed_name, certification_version,
       superseded_at)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
       'Forged', 'individual', 'x', 'x', 'TX', '78701', 'ssn', 'v1.x', '0001', 'Forged', '2024-03',
       now())$$,
  'forging a W-9');
select test.expect_denied(
  $$update public.w9_submissions set legal_name = 'Changed'$$,
  'editing a submitted W-9');
select test.expect_denied(
  $$delete from public.w9_submissions$$,
  'deleting a submitted W-9');
select test.expect_denied(
  $$insert into public.payee_reminders (org_id, payee_id, kind, scheduled_for)
    values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'reminder', now())$$,
  'writing reminders from the client');
select test.expect_denied(
  $$insert into public.exports (org_id, client_business_id, format, payee_count)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'generic', 1)$$,
  'writing export records from the client');

-- Payee fields that belong to the server.
select test.expect_denied(
  $$update public.payees set status = 'submitted'$$,
  'marking a payee submitted');
select test.expect_denied(
  $$update public.payees set portal_token_hash = 'attacker-known'$$,
  'replacing a payee''s link token');
select test.expect_denied(
  $$update public.payees set reminders_sent = 0$$,
  'resetting the reminder counter');

-- Fields a member may edit.
update public.payees set amount_paid_cents = 250000, paused = true;
select test.expect(
  (select amount_paid_cents = 250000 and paused from public.payees),
  'member can edit amount and pause');

-- Other firms.
select test.expect_denied(
  $$update public.client_businesses set name = 'x' where org_id = '10000000-0000-0000-0000-000000000002'$$,
  'renaming another firm''s client business');
select test.expect_denied(
  $$delete from public.payees where org_id = '10000000-0000-0000-0000-000000000002'$$,
  'deleting another firm''s payee');
select test.expect_denied(
  $$insert into public.client_businesses (org_id, name, tax_year)
    values ('10000000-0000-0000-0000-000000000002', 'Planted', 2026)$$,
  'adding a client business to another firm');
select test.expect_error(
  $$insert into public.payees (org_id, client_business_id, name, portal_token_hash)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'Crossed', 'payee-hash-x')$$,
  'client_business_org_mismatch',
  'attaching a payee to another firm''s client business');
select test.expect_denied(
  $$update public.orgs set business_limit = 1000, payees_per_business_limit = null$$,
  'raising your own plan limits');

-- Plan limits: firm A has 2 businesses x 2 payees.
insert into public.payees (org_id, client_business_id, name, portal_token_hash)
values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Second vendor', 'payee-hash-a2');
select test.expect_error(
  $$insert into public.payees (org_id, client_business_id, name, portal_token_hash)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Third vendor', 'payee-hash-a3')$$,
  'payee_limit_reached',
  'a third payee on a two-payee plan');

select test.expect_error(
  $$insert into public.client_businesses (org_id, name, tax_year)
    values ('10000000-0000-0000-0000-000000000001', 'A Bakery', 2026)$$,
  'duplicate key',
  'the same client business twice in one tax year');

insert into public.client_businesses (org_id, name, tax_year)
values ('10000000-0000-0000-0000-000000000001', 'A Cafe', 2026);
select test.expect_error(
  $$insert into public.client_businesses (org_id, name, tax_year)
    values ('10000000-0000-0000-0000-000000000001', 'A Diner', 2026)$$,
  'business_limit_reached',
  'a third client business on a two-business plan');

-- Signed out.
reset role;
set role anon;
select test.sign_in(null);
select test.expect((select count(*) from public.client_businesses) = 0, 'anon sees no client businesses');
select test.expect((select count(*) from public.payees) = 0, 'anon sees no payees');
select test.expect((select count(*) from public.payee_reminders) = 0, 'anon sees no reminders');
select test.expect((select count(*) from public.exports) = 0, 'anon sees no exports');
select test.expect_denied(
  $$select legal_name from public.w9_submissions$$,
  'anon reading W-9s');
reset role;
