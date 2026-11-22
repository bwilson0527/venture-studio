-- Landing page sign-ups: server-only, and one row per address.

set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000a');
select test.expect_error(
  $$select public.capture_lead('x@example.com', null, null, null)$$,
  'permission denied for function',
  'a signed-in member calling capture_lead');
select test.expect_denied(
  $$select email from public.leads$$,
  'a signed-in member reading leads');
select test.expect_denied(
  $$insert into public.leads (email) values ('x@example.com')$$,
  'a signed-in member writing leads');
reset role;

set role anon;
select test.sign_in(null);
select test.expect_error(
  $$select public.capture_lead('x@example.com', null, null, null)$$,
  'permission denied for function',
  'an anonymous visitor calling capture_lead');
select test.expect_denied(
  $$select email from public.leads$$,
  'an anonymous visitor reading leads');
select test.expect_denied(
  $$insert into public.leads (email) values ('x@example.com')$$,
  'an anonymous visitor writing leads');
reset role;

set role service_role;
select public.capture_lead('pat@example.com', 'Lakeside Books', null, 'outreach-1');
select public.capture_lead('pat@example.com', '', '11-25', 'ad-7');
select public.capture_lead('lee@example.com', null, null, repeat('s', 300));

select test.expect((select count(*) from public.leads) = 2, 'one lead per address');
select test.expect(
  (select firm_name = 'Lakeside Books' and client_count = '11-25'
          and source = 'outreach-1' and signups = 2
   from public.leads where email = 'pat@example.com'),
  'a repeat sign-up fills in blanks and keeps the first source');
select test.expect(
  (select length(source) = 100 and firm_name is null from public.leads where email = 'lee@example.com'),
  'an overlong source is cut and a blank firm name is stored as null');
select test.expect_error(
  $$select public.capture_lead('Pat@Example.com', null, null, null)$$,
  'leads_email_check',
  'an address that was not lowercased');
select test.expect_error(
  $$select public.capture_lead('kim@example.com', null, 'lots', null)$$,
  'leads_client_count_check',
  'an unknown client count');
reset role;
