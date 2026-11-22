-- Bounces and spam complaints reported by the email provider.
-- Uses firm B ('...0002', owner ...0b) with its own client business.

insert into public.client_businesses (id, org_id, name, tax_year)
values ('3e000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Bounce Test Co', 2026);

insert into public.payees (id, org_id, client_business_id, name, email, status, portal_token_hash)
values
  ('5e000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
   '3e000000-0000-0000-0000-000000000001', 'Bouncer', 'gone@example.com', 'requested', 'event-hash-1'),
  ('5e000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
   '3e000000-0000-0000-0000-000000000001', 'Complainer', 'annoyed@example.com', 'requested', 'event-hash-2'),
  ('5e000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',
   '3e000000-0000-0000-0000-000000000001', 'Corrected', 'typo@example.com', 'requested', 'event-hash-3');

set role service_role;
select public.complete_w9_email('5e000000-0000-0000-0000-000000000001', 'request', 'ev-1');
select public.complete_w9_email('5e000000-0000-0000-0000-000000000002', 'request', 'ev-2');
select public.complete_w9_email('5e000000-0000-0000-0000-000000000003', 'request', 'ev-3');
reset role;

-- Only the server records delivery news.
set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000b');
select test.expect_error(
  $$select public.record_w9_email_event('ev-1', 'bounced', null, null)$$,
  'permission denied for function', 'a member reporting a bounce');
set role anon;
select test.expect_error(
  $$select public.record_w9_email_event('ev-1', 'bounced', null, null)$$,
  'permission denied for function', 'a visitor reporting a bounce');
reset role;
select set_config('request.jwt.claim.sub', '', false);

set role service_role;
select test.expect_error(
  $$select public.record_w9_email_event('ev-1', 'delivered', null, null)$$,
  'unknown_email_event', 'news we do not act on');
select test.expect(
  public.record_w9_email_event('not-ours', 'bounced', 'gone@example.com', 'x') = 'unknown',
  'an email we did not send is unknown');
select test.expect(
  public.record_w9_email_event('', 'bounced', 'gone@example.com', 'x') = 'unknown',
  'an empty id is unknown');
select test.expect(
  (select count(*) from public.audit_events where action in ('w9.email_bounced', 'w9.email_complained')) = 0,
  'unknown news records nothing');

-- A bounce.
select test.expect(
  public.record_w9_email_event('ev-1', 'bounced', 'GONE@example.com', 'Permanent: General: ' || repeat('m', 900)) = 'recorded',
  'a bounce is recorded, whatever the case of the address');
select test.expect(
  (select email_failures = 3 from public.payees where id = '5e000000-0000-0000-0000-000000000001'),
  'a bounced address is marked as failing');
select test.expect(
  (select status = 'failed' and error like 'bounced: Permanent: General: m%' and length(error) <= 410
   from public.payee_reminders where provider_message_id = 'ev-1'),
  'the email is logged as bounced with a bounded reason');
update public.payees set request_sent_at = now() - interval '30 days'
where id in ('5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000002');
select test.expect(
  (select count(*) from public.w9_email_candidates(100, 3) where payee_name = 'Bouncer') = 0,
  'a bounced address gets no more reminders');
select test.expect(
  (select count(*) from public.w9_email_candidates(100, 3) where payee_name = 'Complainer') = 1,
  'while a vendor with a working address is still due one');

-- The provider may deliver the same news twice.
select test.expect(
  public.record_w9_email_event('ev-1', 'bounced', 'gone@example.com', 'again') = 'recorded',
  'the same bounce again is accepted');
select test.expect(
  (select count(*) from public.audit_events where action = 'w9.email_bounced') = 1
  and (select error like 'bounced: Permanent%' from public.payee_reminders where provider_message_id = 'ev-1'),
  'and changes nothing more');

-- A spam complaint.
select test.expect(
  public.record_w9_email_event('ev-2', 'complained', 'annoyed@example.com', 'marked as spam') = 'recorded',
  'a complaint is recorded');
select test.expect(
  (select email_opted_out and email_failures = 0 from public.payees where id = '5e000000-0000-0000-0000-000000000002'),
  'a vendor who complains gets no more email');
select test.expect(
  (select status = 'sent' and error = 'complained: marked as spam'
   from public.payee_reminders where provider_message_id = 'ev-2'),
  'the email stays logged as sent, with the complaint noted');
select test.expect(
  (select count(*) from public.w9_email_candidates(100, 3) where payee_name = 'Complainer') = 0,
  'and is no longer due a reminder');
reset role;

-- The firm sees both on its board, and correcting the address clears a bounce.
set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000b');
select test.expect(
  (select email_failures = 3 from public.business_payees('3e000000-0000-0000-0000-000000000001') where name = 'Bouncer')
  and (select email_opted_out from public.business_payees('3e000000-0000-0000-0000-000000000001') where name = 'Complainer'),
  'the firm sees the failing address and the stopped reminders');
select test.expect(
  public.update_payee('5e000000-0000-0000-0000-000000000001', 'Bouncer', 'here@example.com', null, false, false),
  'the firm corrects the address');
select test.expect(
  (select email_failures = 0 and request_sent_at is null
   from public.business_payees('3e000000-0000-0000-0000-000000000001') where name = 'Bouncer'),
  'which clears the failure so the request goes out again');
select test.expect(
  public.update_payee('5e000000-0000-0000-0000-000000000003', 'Corrected', 'fixed@example.com', null, false, false),
  'another address is corrected before its bounce arrives');
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- News about an address the firm has already replaced.
set role service_role;
select test.expect(
  public.record_w9_email_event('ev-3', 'bounced', 'typo@example.com', 'Permanent') = 'ignored',
  'a bounce for a replaced address is ignored');
select test.expect(
  (select email_failures = 0 from public.payees where id = '5e000000-0000-0000-0000-000000000003'),
  'and the new address is not marked as failing');
select test.expect(
  public.record_w9_email_event('ev-1', 'complained', 'gone@example.com', 'late') = 'ignored',
  'so is a late complaint about one');

-- News that does not say who the email was to still counts.
select public.complete_w9_email('5e000000-0000-0000-0000-000000000003', 'request', 'ev-4');
select test.expect(
  public.record_w9_email_event('ev-4', 'bounced', null, null) = 'recorded',
  'a bounce without a recipient is recorded');
select test.expect(
  (select email_failures = 3 from public.payees where id = '5e000000-0000-0000-0000-000000000003')
  and (select error = 'bounced' from public.payee_reminders where provider_message_id = 'ev-4'),
  'against the vendor that email went to');
reset role;
