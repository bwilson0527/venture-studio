-- W-9 request and reminder emails: who the job considers, claiming under
-- overlap, recording outcomes, and a payee turning reminders off.
-- Runs after the earlier files and reuses firm A and its client business.

update public.orgs set payees_per_business_limit = null
where id = '10000000-0000-0000-0000-000000000001';

insert into public.payees
  (id, org_id, client_business_id, name, email, status, paused, email_opted_out,
   email_failures, request_sent_at, reminders_sent, last_reminder_at, email_claimed_at,
   portal_token_hash)
select
  ('50000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  label, email, status::public.payee_status, paused, opted_out, failures,
  request_sent_at, reminders_sent, last_reminder_at, claimed_at, 'email-hash-' || n
from (values
  (1,  'new request',        'e1@example.com',  'requested',     false, false, 0, null::timestamptz,          0, null::timestamptz,         null::timestamptz),
  (2,  'first reminder due', 'e2@example.com',  'requested',     false, false, 0, now() - interval '5 days',  0, null,                      null),
  (3,  'asked yesterday',    'e3@example.com',  'requested',     false, false, 0, now() - interval '1 day',   0, null,                      null),
  (4,  'paused',             'e4@example.com',  'requested',     true,  false, 0, null,                       0, null,                      null),
  (5,  'opted out',          'e5@example.com',  'requested',     false, true,  0, null,                       0, null,                      null),
  (6,  'no email',           null,              'requested',     false, false, 0, null,                       0, null,                      null),
  (7,  'failing address',    'e7@example.com',  'requested',     false, false, 3, null,                       0, null,                      null),
  (8,  'not asked yet',      'e8@example.com',  'not_requested', false, false, 0, null,                       0, null,                      null),
  (9,  'reminded recently',  'e9@example.com',  'requested',     false, false, 0, now() - interval '10 days', 1, now() - interval '2 days', null),
  (10, 'being sent now',     'e10@example.com', 'requested',     false, false, 0, null,                       0, null,                      now() - interval '1 minute'),
  (11, 'stale claim',        'e11@example.com', 'requested',     false, false, 0, null,                       0, null,                      now() - interval '20 minutes'),
  (12, 'later reminder due', 'e12@example.com', 'requested',     false, false, 0, now() - interval '12 days', 2, now() - interval '4 days', null)
) as t(n, label, email, status, paused, opted_out, failures, request_sent_at, reminders_sent, last_reminder_at, claimed_at);

-- These functions are for the server only.
set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000a');
select test.expect_error($$select * from public.w9_email_candidates(10, 3)$$,
  'permission denied for function', 'a member listing email candidates');
select test.expect_error($$select public.claim_w9_email('50000000-0000-0000-0000-000000000001', 0)$$,
  'permission denied for function', 'a member claiming an email');
select test.expect_error($$select public.complete_w9_email('50000000-0000-0000-0000-000000000001', 'request', 'x')$$,
  'permission denied for function', 'a member recording a sent email');
select test.expect_error($$select public.fail_w9_email('50000000-0000-0000-0000-000000000001', 'request', 'x')$$,
  'permission denied for function', 'a member recording a failed email');
select test.expect_error($$select public.portal_stop_emails('email-hash-1')$$,
  'permission denied for function', 'a member stopping a payee''s emails');

-- Members cannot touch the send bookkeeping.
select test.expect_denied(
  $$update public.payees set request_sent_at = null where id = '50000000-0000-0000-0000-000000000003'$$,
  'a member resetting when a request was sent');
select test.expect_denied(
  $$update public.payees set email_failures = 0 where id = '50000000-0000-0000-0000-000000000007'$$,
  'a member clearing failed sends');

-- The owner sets where replies go.
update public.orgs set reply_to_email = 'office@firm-a.example'
where id = '10000000-0000-0000-0000-000000000001';
select test.expect(
  (select reply_to_email from public.orgs where id = '10000000-0000-0000-0000-000000000001')
    = 'office@firm-a.example',
  'an owner can set the reply-to address');
reset role;

set role anon;
select test.sign_in(null);
select test.expect_error($$select * from public.w9_email_candidates(10, 3)$$,
  'permission denied for function', 'an anonymous visitor listing email candidates');
select test.expect_error($$select public.portal_stop_emails('email-hash-1')$$,
  'permission denied for function', 'an anonymous visitor stopping emails');
reset role;

-- The server.
set role service_role;

select test.expect(
  (select array_agg(payee_name order by payee_name) from public.w9_email_candidates(100, 3))
    = array['first reminder due', 'later reminder due', 'new request', 'stale claim'],
  'candidates are exactly the payees who may be due an email');
select test.expect(
  (select bool_and(request_sent_at is null)
   from (select * from public.w9_email_candidates(2, 3)) first_two),
  'payees waiting for a first request come first');
select test.expect(
  (select firm_name is not null and reply_to_email = 'office@firm-a.example'
          and business_name = 'A Bakery' and tax_year = 2026
          and email = 'e1@example.com' and portal_token_version = 1
          and portal_token_hash = 'email-hash-1'
          and time_zone = 'America/New_York'
   from public.w9_email_candidates(100, 3) where payee_name = 'new request'),
  'a candidate carries what the email needs');
select test.expect(
  (select count(*) from public.w9_email_candidates(100, 30)) = 2,
  'a longer gap leaves only the first requests');

-- Claiming.
select test.expect(public.claim_w9_email('50000000-0000-0000-0000-000000000001', 0),
  'the first run claims the payee');
select test.expect(not public.claim_w9_email('50000000-0000-0000-0000-000000000001', 0),
  'an overlapping run cannot claim the same payee');
select test.expect(
  (select count(*) from public.w9_email_candidates(100, 3) where payee_name = 'new request') = 0,
  'a claimed payee leaves the candidate list');
select test.expect(not public.claim_w9_email('50000000-0000-0000-0000-000000000002', 1),
  'a claim made from stale information is refused');
select test.expect(not public.claim_w9_email('50000000-0000-0000-0000-000000000004', 0),
  'a paused payee cannot be claimed');
select test.expect(not public.claim_w9_email('50000000-0000-0000-0000-000000000005', 0),
  'an opted-out payee cannot be claimed');
select test.expect(not public.claim_w9_email('50000000-0000-0000-0000-000000000008', 0),
  'a payee who was never asked cannot be claimed');
select test.expect(public.claim_w9_email('50000000-0000-0000-0000-000000000011', 0),
  'a claim left by a crashed run can be taken over');

-- A sent request.
select public.complete_w9_email('50000000-0000-0000-0000-000000000001', 'request', 'msg-1');
select test.expect(
  (select request_sent_at is not null and email_claimed_at is null
          and reminders_sent = 0 and last_reminder_at is null
   from public.payees where id = '50000000-0000-0000-0000-000000000001'),
  'a sent request starts the clock and releases the claim');
select test.expect(
  (select kind = 'request' and status = 'sent' and sent_at is not null and provider_message_id = 'msg-1'
   from public.payee_reminders where payee_id = '50000000-0000-0000-0000-000000000001'),
  'a sent request is logged');
select test.expect(
  (select count(*) from public.w9_email_candidates(100, 3) where payee_name = 'new request') = 0,
  'a payee just sent a request is not due again');

-- A sent reminder.
select test.expect(public.claim_w9_email('50000000-0000-0000-0000-000000000012', 2),
  'a due reminder can be claimed');
select public.complete_w9_email('50000000-0000-0000-0000-000000000012', 'reminder', 'msg-2');
select test.expect(
  (select reminders_sent = 3 and last_reminder_at > now() - interval '1 minute'
          and email_claimed_at is null
   from public.payees where id = '50000000-0000-0000-0000-000000000012'),
  'a sent reminder is counted');
select test.expect(not public.claim_w9_email('50000000-0000-0000-0000-000000000012', 2),
  'the same reminder cannot be sent twice');

-- Failed sends back off after three in a row, and a success clears them.
select public.fail_w9_email('50000000-0000-0000-0000-000000000011', 'request', repeat('e', 900));
select test.expect(
  (select email_failures = 1 and email_claimed_at is null and request_sent_at is null
   from public.payees where id = '50000000-0000-0000-0000-000000000011'),
  'a failed send releases the claim and does not start the clock');
select test.expect(
  (select status = 'failed' and length(error) = 500 and sent_at is null
   from public.payee_reminders where payee_id = '50000000-0000-0000-0000-000000000011'),
  'a failed send is logged with a bounded error');
select test.expect(
  (select count(*) from public.w9_email_candidates(100, 3) where payee_name = 'stale claim') = 1,
  'a payee is retried after a failure');
select public.fail_w9_email('50000000-0000-0000-0000-000000000011', 'request', 'again');
select public.fail_w9_email('50000000-0000-0000-0000-000000000011', 'request', 'again');
select test.expect(
  (select count(*) from public.w9_email_candidates(100, 3) where payee_name = 'stale claim') = 0,
  'three failures in a row stop the retries');
select public.complete_w9_email('50000000-0000-0000-0000-000000000011', 'request', 'msg-3');
select test.expect(
  (select email_failures from public.payees where id = '50000000-0000-0000-0000-000000000011') = 0,
  'a successful send clears the failure count');

select test.expect_error(
  $$select public.complete_w9_email('50000000-0000-0000-0000-000000000002', 'escalation', 'x')$$,
  'unknown_email_kind', 'recording an email kind the job does not send');
select test.expect_error(
  $$select public.complete_w9_email('59999999-0000-0000-0000-000000000000', 'request', 'x')$$,
  'unknown_payee', 'recording a send for a payee that does not exist');
select test.expect_error(
  $$select public.fail_w9_email('59999999-0000-0000-0000-000000000000', 'request', 'x')$$,
  'unknown_payee', 'recording a failure for a payee that does not exist');

-- A payee turns reminders off.
select test.expect(not public.portal_stop_emails('no-such-hash'), 'an unknown link stops nothing');
select test.expect(
  (select not email_opted_out from public.portal_lookup_payee('email-hash-2')),
  'the lookup shows reminders are on');
select test.expect(public.portal_stop_emails('email-hash-2'), 'a payee stops their reminders');
select test.expect(public.portal_stop_emails('email-hash-2'), 'stopping twice is harmless');
select test.expect(
  (select email_opted_out from public.portal_lookup_payee('email-hash-2')),
  'the lookup shows reminders are off');
select test.expect(
  (select count(*) from public.audit_events
   where actor = 'payee:50000000-0000-0000-0000-000000000002' and action = 'w9.emails_stopped') = 1,
  'stopping reminders is logged once');
select test.expect(
  (select count(*) from public.w9_email_candidates(100, 3) where payee_name = 'first reminder due') = 0,
  'a payee who stopped reminders is no longer a candidate');
select test.expect(
  (select status from public.payees where id = '50000000-0000-0000-0000-000000000002') = 'requested',
  'stopping reminders leaves the W-9 request open');
reset role;
