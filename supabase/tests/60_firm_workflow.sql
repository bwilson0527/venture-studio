-- What a signed-in firm does: create the firm, add a client business,
-- import vendors, send requests, edit and remove vendors, change settings.
-- Runs after the earlier files: firm A (owner ...0a, preparer ...0c) and
-- firm B (owner ...0b) already exist. User ...0d is new and has no firm.

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000d');

-- Nothing here is open to visitors who are not signed in.
set role anon;
select test.expect_error($$select public.create_firm('x')$$,
  'permission denied for function', 'a visitor creating a firm');
select test.expect_error($$select * from public.my_firm()$$,
  'permission denied for function', 'a visitor reading a firm');
select test.expect_error($$select public.update_firm('x', null, 'UTC')$$,
  'permission denied for function', 'a visitor editing a firm');
select test.expect_error($$select public.create_client_business('x', 2026)$$,
  'permission denied for function', 'a visitor adding a client business');
select test.expect_error($$select * from public.firm_businesses()$$,
  'permission denied for function', 'a visitor listing client businesses');
select test.expect_error(
  $$select * from public.business_payees('30000000-0000-0000-0000-000000000001')$$,
  'permission denied for function', 'a visitor listing vendors');
select test.expect_error(
  $$select * from public.import_payees('30000000-0000-0000-0000-000000000001', '[]')$$,
  'permission denied for function', 'a visitor importing vendors');
select test.expect_error(
  $$select public.request_w9s('30000000-0000-0000-0000-000000000001')$$,
  'permission denied for function', 'a visitor sending requests');
select test.expect_error(
  $$select public.update_payee('40000000-0000-0000-0000-000000000001', 'x', null, null, false, false)$$,
  'permission denied for function', 'a visitor editing a vendor');
select test.expect_error(
  $$select public.delete_payee('40000000-0000-0000-0000-000000000001')$$,
  'permission denied for function', 'a visitor removing a vendor');
reset role;

-- A session with no user cannot create a firm.
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select test.expect_error($$select public.create_firm('Nobody')$$,
  'not_signed_in', 'creating a firm without a user');

-- A new user starts with nothing.
select test.sign_in('00000000-0000-0000-0000-00000000000d');
select test.expect((select count(*) from public.my_firm()) = 0, 'a new user has no firm');
select test.expect((select count(*) from public.firm_businesses()) = 0,
  'a new user sees no client businesses');
select test.expect_error($$select public.create_client_business('Too early', 2026)$$,
  'no_firm', 'adding a client business before creating a firm');
select test.expect_error($$select public.create_firm('   ')$$,
  'invalid_firm_name', 'a blank firm name');
select test.expect_error($$select public.create_firm(repeat('x', 201))$$,
  'invalid_firm_name', 'a firm name that is too long');

-- Creating the firm makes them its owner, on the free plan.
select public.create_firm('  Delta   Tax  Partners ') as firm \gset
select test.expect(
  (select org_id = :'firm' and name = 'Delta Tax Partners' and role = 'owner' and plan = 'free'
          and business_limit = 1 and payees_per_business_limit = 10
   from public.my_firm()),
  'the new firm is on the free plan, owned by its creator, with a tidied name');
select test.expect_error($$select public.create_firm('Another one')$$,
  'already_in_a_firm', 'creating a second firm');
select test.expect((select count(*) from public.orgs) = 1, 'the new owner sees only their firm');

-- Client businesses, within the plan.
select test.expect_error($$select public.create_client_business('  ', 2026)$$,
  'invalid_business_name', 'a blank client business name');
select test.expect_error($$select public.create_client_business('Old books', 1999)$$,
  'invalid_tax_year', 'a tax year out of range');
select public.create_client_business(' Harbor  Street Bakery ', 2026) as biz \gset
select test.expect(
  (select name = 'Harbor Street Bakery' and tax_year = 2026 and payees = 0 and submitted = 0
          and waiting = 0 and not_requested = 0 and missing_email = 0 and needs_attention = 0
   from public.firm_businesses() where id = :'biz'),
  'a new client business is listed with nothing in it');
select test.expect_error($$select public.create_client_business('Second Shop', 2026)$$,
  'business_limit_reached', 'a second client business on the free plan');

reset role;
update public.orgs set business_limit = 3 where id = :'firm';
set role authenticated;
select test.expect_error($$select public.create_client_business('Harbor Street Bakery', 2026)$$,
  'duplicate_client_business', 'the same client business and year twice');
select public.create_client_business('Harbor Street Bakery', 2025) as biz_2025 \gset
select test.expect((select count(*) from public.firm_businesses()) = 2,
  'the same business in another tax year is separate');

-- Importing vendors.
select test.expect(
  (select added = 3 and updated = 0 and unchanged = 0
   from public.import_payees(:'biz', jsonb_build_array(
     jsonb_build_object('id', '60000000-0000-0000-0000-000000000001', 'name', '  Alpha   LLC ',
       'email', ' Alpha@Example.com ', 'amount_paid_cents', 500000,
       'portal_token_hash', repeat('a', 63) || '1'),
     jsonb_build_object('id', '60000000-0000-0000-0000-000000000002', 'name', 'Beta Hauling',
       'email', null, 'amount_paid_cents', 120000,
       'portal_token_hash', repeat('a', 63) || '2'),
     jsonb_build_object('id', '60000000-0000-0000-0000-000000000003', 'name', 'Gamma Smith',
       'email', 'gamma@example.com',
       'portal_token_hash', repeat('a', 63) || '3')))),
  'a first import adds every vendor');
select test.expect(
  (select name = 'Alpha LLC' and email = 'alpha@example.com' and amount_paid_cents = 500000
          and status = 'not_requested'
   from public.business_payees(:'biz') where id = '60000000-0000-0000-0000-000000000001'),
  'imported names and emails are tidied');

-- A second upload of the same list updates, never duplicates.
select test.expect(
  (select added = 2 and updated = 2 and unchanged = 1
   from public.import_payees(:'biz', jsonb_build_array(
     -- Same email under a different spelling of the name: the amount is updated.
     jsonb_build_object('id', '60000000-0000-0000-0000-0000000000f1', 'name', 'ALPHA',
       'email', 'alpha@example.com', 'amount_paid_cents', 650000,
       'portal_token_hash', repeat('b', 63) || '1'),
     -- Same name, and the list now has an email: it is filled in.
     jsonb_build_object('id', '60000000-0000-0000-0000-0000000000f2', 'name', 'beta hauling',
       'email', 'beta@example.com', 'amount_paid_cents', 120000,
       'portal_token_hash', repeat('b', 63) || '2'),
     -- Nothing new.
     jsonb_build_object('id', '60000000-0000-0000-0000-0000000000f3', 'name', 'Gamma Smith',
       'email', 'gamma@example.com',
       'portal_token_hash', repeat('b', 63) || '3'),
     -- New, with no email.
     jsonb_build_object('id', '60000000-0000-0000-0000-000000000004', 'name', 'Delta Signs',
       'amount_paid_cents', 90000,
       'portal_token_hash', repeat('a', 63) || '4'),
     -- Shares a name with an existing vendor but has a different email: a different person.
     jsonb_build_object('id', '60000000-0000-0000-0000-000000000005', 'name', 'Gamma Smith',
       'email', 'other.gamma@example.com', 'amount_paid_cents', 310000,
       'portal_token_hash', repeat('a', 63) || '5')))),
  'a second import adds the new vendors and updates the changed ones');
select test.expect((select count(*) from public.business_payees(:'biz')) = 5,
  'no vendor was added twice');
select test.expect(
  (select amount_paid_cents = 650000 and name = 'Alpha LLC'
   from public.business_payees(:'biz') where id = '60000000-0000-0000-0000-000000000001'),
  'a re-imported vendor keeps its id and name and takes the new amount');
select test.expect(
  (select email = 'beta@example.com'
   from public.business_payees(:'biz') where id = '60000000-0000-0000-0000-000000000002'),
  'a missing email is filled in from the new list');
select test.expect(
  (select count(*) from public.payees where portal_token_hash like 'bbb%') = 0,
  'a vendor already on the list keeps its private link');

-- Malformed input adds nothing.
select test.expect_error(
  format($$select * from public.import_payees(%L, '{"name": "x"}')$$, :'biz'),
  'invalid_import', 'an import that is not a list');
select test.expect_error(
  format($$select * from public.import_payees(%L, jsonb_build_array(
    jsonb_build_object('id', '60000000-0000-0000-0000-000000000011', 'name', 'Good one',
      'portal_token_hash', repeat('c', 64)),
    jsonb_build_object('id', '60000000-0000-0000-0000-000000000012', 'name', 'Bad hash',
      'portal_token_hash', 'not-a-hash')))$$, :'biz'),
  'invalid_import', 'a new vendor without a proper link hash');
select test.expect_error(
  format($$select * from public.import_payees(%L, jsonb_build_array(
    jsonb_build_object('id', 'nope', 'name', 'Bad id', 'portal_token_hash', repeat('c', 64))))$$,
    :'biz'),
  'invalid_import', 'a new vendor without a proper id');
select test.expect_error(
  format($$select * from public.import_payees(%L, jsonb_build_array(
    jsonb_build_object('id', '60000000-0000-0000-0000-000000000013', 'name', 'Bad amount',
      'amount_paid_cents', '12.50', 'portal_token_hash', repeat('c', 64))))$$, :'biz'),
  'invalid_import', 'an amount that is not whole cents');
select test.expect_error(
  format($$select * from public.import_payees(%L, jsonb_build_array(
    jsonb_build_object('id', '60000000-0000-0000-0000-000000000014', 'name', ' ',
      'portal_token_hash', repeat('c', 64))))$$, :'biz'),
  'invalid_import', 'a vendor with no name');
select test.expect_error(
  format($$select * from public.import_payees(%L, '["just text"]')$$, :'biz'),
  'invalid_import', 'a list of something other than vendors');

-- The free plan allows ten vendors per client business; six more would pass it.
select test.expect_error(
  format($$select * from public.import_payees(%L, (
    select jsonb_agg(jsonb_build_object(
      'id', '60000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'),
      'name', 'Extra vendor ' || n,
      'portal_token_hash', repeat('d', 62) || lpad(n::text, 2, '0')))
    from generate_series(1, 6) n))$$, :'biz'),
  'payee_limit_reached', 'an import that would pass the plan limit');
select test.expect((select count(*) from public.business_payees(:'biz')) = 5,
  'a refused import adds nothing at all');

-- Another firm's client business is out of reach.
select test.expect_error(
  $$select * from public.import_payees('30000000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('id', '60000000-0000-0000-0000-000000000021', 'name', 'Planted',
      'portal_token_hash', repeat('e', 64))))$$,
  'unknown_client_business', 'importing into another firm''s client business');
select test.expect(
  (select count(*) from public.business_payees('30000000-0000-0000-0000-000000000001')) = 0,
  'another firm''s vendors are not listed');
select test.expect_error(
  $$select public.request_w9s('30000000-0000-0000-0000-000000000001')$$,
  'not_a_member', 'sending requests for another firm''s client business');
select test.expect_error(
  $$select public.request_w9s('39999999-0000-0000-0000-000000000000')$$,
  'not_a_member', 'sending requests for a client business that does not exist');
select test.expect(
  not public.update_payee('40000000-0000-0000-0000-000000000001', 'Renamed', null, null, false, false),
  'editing another firm''s vendor changes nothing');
select test.expect(
  not public.delete_payee('40000000-0000-0000-0000-000000000001'),
  'removing another firm''s vendor removes nothing');

-- Firm B's owner cannot see or touch the new firm.
select test.sign_in('00000000-0000-0000-0000-00000000000b');
select test.expect(
  (select count(*) from public.firm_businesses() where id in (:'biz', :'biz_2025')) = 0,
  'another firm does not see the client business');
select test.expect((select count(*) from public.business_payees(:'biz')) = 0,
  'another firm does not see the vendors');
select test.expect_error(
  format($$select public.request_w9s(%L)$$, :'biz'),
  'not_a_member', 'another firm sending this firm''s requests');
select test.expect_error(
  format($$select * from public.import_payees(%L, '[]')$$, :'biz'),
  'unknown_client_business', 'another firm importing into this client business');
select test.expect(
  not public.update_payee('60000000-0000-0000-0000-000000000001', 'Hijacked', null, null, false, false),
  'another firm editing a vendor changes nothing');
select test.expect(
  not public.delete_payee('60000000-0000-0000-0000-000000000001'),
  'another firm removing a vendor removes nothing');

-- Sending requests.
select test.sign_in('00000000-0000-0000-0000-00000000000d');
select test.expect(
  (select name = 'Alpha LLC' from public.business_payees(:'biz')
   where id = '60000000-0000-0000-0000-000000000001'),
  'the vendor is untouched by the other firm');
select test.expect(
  public.request_w9s(:'biz', array['60000000-0000-0000-0000-000000000001']::uuid[]) = 1,
  'requesting one chosen vendor queues one');
select test.expect(
  (select status = 'requested' and request_sent_at is null
   from public.business_payees(:'biz') where id = '60000000-0000-0000-0000-000000000001'),
  'the chosen vendor is waiting for the first email');
select test.expect(
  (select requested_at is not null from public.payees
   where id = '60000000-0000-0000-0000-000000000001'),
  'the time of the request is recorded');

-- Gamma is put on hold, Delta has no email: neither is asked.
select test.expect(
  public.update_payee('60000000-0000-0000-0000-000000000003', 'Gamma Smith',
    'gamma@example.com', null, true, true),
  'a member pauses a vendor');
select test.expect(public.request_w9s(:'biz') = 2,
  'requesting everyone queues those with an email who are not on hold');
select test.expect(public.request_w9s(:'biz') = 0, 'requesting again queues nobody twice');
select test.expect(
  (select count(*) from public.business_payees(:'biz')
   where status = 'not_requested'
     and id in ('60000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000004')) = 2,
  'the vendor on hold and the vendor with no email were left alone');
select test.expect(
  (select legal_or_medical and paused from public.business_payees(:'biz')
   where id = '60000000-0000-0000-0000-000000000003'),
  'the legal or medical flag and the hold are saved');
select test.expect(
  (select payees = 5 and submitted = 0 and waiting = 3 and not_requested = 2
          and missing_email = 1 and needs_attention = 0
   from public.firm_businesses() where id = :'biz'),
  'the overview counts match');
select test.expect(
  (select count(*) from public.audit_events
   where action = 'w9.requested' and actor = 'member:00000000-0000-0000-0000-00000000000d') = 2,
  'each batch of requests is logged for the owner');

-- Editing a vendor.
select test.expect_error(
  $$select public.update_payee('60000000-0000-0000-0000-000000000001', ' ', null, null, false, false)$$,
  'invalid_payee_name', 'a blank vendor name');
select test.expect_error(
  $$select public.update_payee('60000000-0000-0000-0000-000000000001', 'Alpha LLC', 'not an email', null, false, false)$$,
  'invalid_payee_email', 'a vendor email that is not an email');
select test.expect_error(
  $$select public.update_payee('60000000-0000-0000-0000-000000000001', 'Alpha LLC', null, -1, false, false)$$,
  'invalid_amount', 'a negative amount paid');

-- The server has emailed Alpha twice and the address is failing.
reset role;
update public.payees
set request_sent_at = now() - interval '9 days', reminders_sent = 2,
    last_reminder_at = now() - interval '1 day', email_failures = 3
where id = '60000000-0000-0000-0000-000000000001';
set role authenticated;
select test.expect(
  (select needs_attention = 1 from public.firm_businesses() where id = :'biz'),
  'a failing address is flagged on the overview');

-- A change that keeps the address keeps the email history.
select test.expect(
  public.update_payee('60000000-0000-0000-0000-000000000001', 'Alpha Design LLC',
    'alpha@example.com', 700000, false, false),
  'a member renames a vendor');
select test.expect(
  (select name = 'Alpha Design LLC' and amount_paid_cents = 700000 and reminders_sent = 2
          and request_sent_at is not null and email_failures = 3
   from public.business_payees(:'biz') where id = '60000000-0000-0000-0000-000000000001'),
  'renaming a vendor leaves the email history alone');

-- A corrected address starts the emails over.
select test.expect(
  public.update_payee('60000000-0000-0000-0000-000000000001', 'Alpha Design LLC',
    ' Billing@Alpha.Example ', 700000, false, false),
  'a member corrects a vendor''s email');
select test.expect(
  (select email = 'billing@alpha.example' and status = 'requested' and request_sent_at is null
          and reminders_sent = 0 and last_reminder_at is null and email_failures = 0
   from public.business_payees(:'biz') where id = '60000000-0000-0000-0000-000000000001'),
  'the new address is asked from the start, with the failures cleared');
select test.expect(
  (select needs_attention = 0 from public.firm_businesses() where id = :'biz'),
  'the overview flag clears with the corrected address');

-- Removing vendors. One with a signed W-9 stays.
reset role;
insert into public.w9_submissions
  (org_id, payee_id, legal_name, tax_classification, address_line1, city, state,
   postal_code, tin_type, tin_ciphertext, tin_last4, signed_name, certification_version)
values
  (:'firm', '60000000-0000-0000-0000-000000000002', 'Beta Hauling Inc', 'c_corp', '5 Dock Rd',
   'Portland', 'ME', '04101', 'ein', 'v1.sealed-beta', '7788', 'Bea Beta', 'w9-2024-03');
update public.payees set status = 'submitted'
where id = '60000000-0000-0000-0000-000000000002';
set role authenticated;

select test.expect(
  (select status = 'submitted' and w9_legal_name = 'Beta Hauling Inc'
          and w9_tax_classification = 'c_corp' and w9_tin_type = 'ein' and w9_tin_last4 = '7788'
          and w9_signed_at is not null
   from public.business_payees(:'biz') where id = '60000000-0000-0000-0000-000000000002'),
  'the vendor board shows the W-9 on file with the last four digits only');
select test.expect(
  (select submitted = 1 and waiting = 2 from public.firm_businesses() where id = :'biz'),
  'the overview counts the received W-9');
select test.expect_error(
  $$select public.delete_payee('60000000-0000-0000-0000-000000000002')$$,
  'payee_has_w9', 'removing a vendor who has signed a W-9');
select test.expect_error(
  format($$delete from public.client_businesses where id = %L$$, :'biz'),
  'payee_has_w9', 'removing a client business that holds a signed W-9');
select test.expect(public.delete_payee('60000000-0000-0000-0000-000000000004'),
  'a member removes a vendor added by mistake');
select test.expect(not public.delete_payee('60000000-0000-0000-0000-000000000004'),
  'removing a vendor twice does nothing');
select test.expect((select count(*) from public.business_payees(:'biz')) = 4,
  'only that vendor is gone');

-- Firm settings: the owner's to change.
select test.expect_error($$select public.update_firm(' ', null, 'America/Chicago')$$,
  'invalid_firm_name', 'a blank firm name in settings');
select test.expect_error($$select public.update_firm('Delta', 'nope', 'America/Chicago')$$,
  'invalid_reply_to_email', 'a reply-to that is not an email');
select test.expect_error($$select public.update_firm('Delta', null, 'Mars/Olympus')$$,
  'invalid_time_zone', 'a time zone that does not exist');
select test.expect_error($$select public.update_firm('Delta', null, null)$$,
  'invalid_time_zone', 'no time zone');
select test.expect(
  public.update_firm(' Delta Tax  Partners LLP ', ' Office@Delta.Example ', 'America/Chicago'),
  'the owner saves firm settings');
select test.expect(
  (select name = 'Delta Tax Partners LLP' and reply_to_email = 'office@delta.example'
          and time_zone = 'America/Chicago' and plan = 'free'
   from public.my_firm()),
  'the settings are saved tidied, and the plan is untouched');
select test.expect(public.update_firm('Delta Tax Partners LLP', '', 'America/Chicago'),
  'the owner clears the reply-to address');
select test.expect((select reply_to_email is null from public.my_firm()),
  'a blank reply-to is stored as none');

-- A preparer reads the firm but cannot change its settings.
select test.sign_in('00000000-0000-0000-0000-00000000000c');
select test.expect(
  (select org_id = '10000000-0000-0000-0000-000000000001' and role = 'preparer'
   from public.my_firm()),
  'a preparer sees their firm and their own role');
select test.expect(not public.update_firm('Taken over', null, 'America/New_York'),
  'a preparer cannot change firm settings');
select test.expect_error($$select public.create_firm('Side firm')$$,
  'already_in_a_firm', 'a member of one firm creating another');

-- The server can still remove everything, for closing an account.
reset role;
select set_config('request.jwt.claim.sub', '', false);
select test.expect(
  (select name <> 'Taken over' from public.orgs where id = '10000000-0000-0000-0000-000000000001'),
  'firm A kept its name');
delete from public.orgs where id = :'firm';
select test.expect(
  (select count(*) from public.payees where id::text like '60000000-%') = 0,
  'closing a firm removes its vendors, signed W-9s included');
