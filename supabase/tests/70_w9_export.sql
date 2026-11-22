-- Exports for 1099 filing: who may run one, what it returns, what it records.
-- Reuses firm A's client business ('A Bakery') and its vendors from earlier files.

-- Members cannot call it directly, so encrypted taxpayer IDs never reach a browser.
set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000a');
select test.expect_error(
  $$select * from public.export_w9s('30000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000a', true)$$,
  'permission denied for function', 'a member calling the export directly');
set role anon;
select test.expect_error(
  $$select * from public.export_w9s('30000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000a', false)$$,
  'permission denied for function', 'a visitor calling the export');
reset role;
select set_config('request.jwt.claim.sub', '', false);

set role service_role;

-- The server must name a user who belongs to the firm.
select test.expect_error(
  $$select * from public.export_w9s('30000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-00000000000b', true)$$,
  'not_a_member', 'an export for a user from another firm');
select test.expect_error(
  $$select * from public.export_w9s('39999999-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-00000000000a', true)$$,
  'not_a_member', 'an export of a client business that does not exist');
select test.expect_error(
  $$select * from public.export_w9s('30000000-0000-0000-0000-000000000001', null, true)$$,
  'not_a_member', 'an export with no user');
select test.expect(
  (select count(*) from public.exports where format like 'csv_%') = 0 and
  (select count(*) from public.audit_events where action like 'w9.exported%') = 0,
  'a refused export records nothing');

-- A full export for the owner.
create temp table full_export as
select * from public.export_w9s('30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a', true);

select test.expect(
  (select count(*) from full_export) =
  (select count(*) from public.payees where client_business_id = '30000000-0000-0000-0000-000000000001'),
  'the export lists every vendor of the client business, signed or not');
select test.expect(
  (select count(*) from full_export e join public.payees p on p.id = e.payee_id
   where p.client_business_id <> '30000000-0000-0000-0000-000000000001') = 0,
  'and nobody else''s');
select test.expect(
  (select count(*) from full_export where signed_at is not null) =
  (select count(*) from public.w9_submissions s join public.payees p on p.id = s.payee_id
   where p.client_business_id = '30000000-0000-0000-0000-000000000001' and s.superseded_at is null),
  'each signed vendor appears with its current W-9 only');
select test.expect(
  (select count(*) from full_export where signed_at is not null) >= 1,
  'the fixtures include at least one signed W-9');
select test.expect(
  (select bool_and(e.tin_ciphertext = s.tin_ciphertext and e.tin_last4 = s.tin_last4
                   and e.legal_name = s.legal_name and e.address_line1 = s.address_line1)
   from full_export e join public.w9_submissions s
     on s.payee_id = e.payee_id and s.superseded_at is null),
  'a full export carries the sealed taxpayer ID and the W-9 details');
select test.expect(
  (select count(*) from full_export where signed_at is null and tin_ciphertext is not null) = 0,
  'a vendor without a W-9 has no taxpayer ID');

-- A last-four export for the preparer.
create temp table masked_export as
select * from public.export_w9s('30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000c', false);
select test.expect(
  (select count(*) from masked_export where tin_ciphertext is not null) = 0,
  'a last-four export carries no sealed taxpayer IDs');
select test.expect(
  (select count(*) from masked_export where tin_last4 is not null) >= 1,
  'but keeps the last four digits');

-- Both were recorded, with who ran them.
select test.expect(
  (select count(*) from public.exports
   where client_business_id = '30000000-0000-0000-0000-000000000001'
     and format = 'csv_full_tins' and created_by = '00000000-0000-0000-0000-00000000000a'
     and payee_count = (select count(*) from full_export)) = 1,
  'the full export is recorded against the owner');
select test.expect(
  (select count(*) from public.exports
   where format = 'csv_last4' and created_by = '00000000-0000-0000-0000-00000000000c') = 1,
  'the last-four export is recorded against the preparer');
select test.expect(
  (select count(*) from public.audit_events
   where action = 'w9.exported_with_tins'
     and actor = 'member:00000000-0000-0000-0000-00000000000a') = 1
  and (select count(*) from public.audit_events
   where action = 'w9.exported'
     and actor = 'member:00000000-0000-0000-0000-00000000000c') = 1,
  'both exports are in the audit log, and the log says which one included taxpayer IDs');
reset role;

-- The firm's own members can see that exports happened; another firm cannot.
set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000c');
select test.expect((select count(*) from public.exports where format like 'csv_%') = 2,
  'a member sees the firm''s exports');
select test.sign_in('00000000-0000-0000-0000-00000000000b');
select test.expect((select count(*) from public.exports where format like 'csv_%') = 0,
  'another firm sees none of them');
reset role;
