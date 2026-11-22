-- Paid plans: applying a confirmed payment, once, and who can see or do what.
-- Firm B ('...0002', owner ...0b) starts on the free plan.

update public.orgs set plan = 'free', business_limit = 1, payees_per_business_limit = 10
where id = '10000000-0000-0000-0000-000000000002';

-- Only the server applies payments.
set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000b');
select test.expect_error(
  $$select public.apply_plan_purchase('10000000-0000-0000-0000-000000000002', 'firm', 2026, 0, 'cs_forged', null)$$,
  'permission denied for function', 'a member giving their own firm a plan');
select test.expect_denied(
  $$insert into public.plan_purchases (org_id, plan, tax_year, amount_cents, stripe_session_id)
    values ('10000000-0000-0000-0000-000000000002', 'firm', 2026, 0, 'cs_forged')$$,
  'a member writing a purchase row');
set role anon;
select test.expect_error(
  $$select public.apply_plan_purchase('10000000-0000-0000-0000-000000000002', 'firm', 2026, 0, 'cs_forged', null)$$,
  'permission denied for function', 'a visitor giving a firm a plan');
reset role;
select set_config('request.jwt.claim.sub', '', false);

set role service_role;
select test.expect_error(
  $$select public.apply_plan_purchase('10000000-0000-0000-0000-000000000002', 'platinum', 2026, 100, 'cs_1', null)$$,
  'unknown_plan', 'a plan that does not exist');
select test.expect_error(
  $$select public.apply_plan_purchase('19999999-0000-0000-0000-000000000000', 'season', 2026, 14900, 'cs_1', null)$$,
  'unknown_org', 'a payment for a firm that does not exist');
select test.expect_error(
  $$select public.apply_plan_purchase('10000000-0000-0000-0000-000000000002', 'season', 2026, 14900, '', null)$$,
  'missing_session', 'a payment with no Stripe session');
select test.expect((select count(*) from public.plan_purchases) = 0, 'refused payments record nothing');

-- The Season plan.
select test.expect(
  public.apply_plan_purchase('10000000-0000-0000-0000-000000000002', 'season', 2026, 14900, 'cs_season', 'cus_b'),
  'a confirmed payment is applied');
select test.expect(
  (select plan = 'season' and business_limit = 25 and payees_per_business_limit is null
          and stripe_customer_id = 'cus_b'
   from public.orgs where id = '10000000-0000-0000-0000-000000000002'),
  'Season covers 25 client businesses with no vendor limit');

-- Stripe may deliver the same payment again.
select test.expect(
  not public.apply_plan_purchase('10000000-0000-0000-0000-000000000002', 'season', 2026, 14900, 'cs_season', 'cus_b'),
  'the same payment is not applied twice');
select test.expect(
  (select count(*) from public.plan_purchases where stripe_session_id = 'cs_season') = 1
  and (select count(*) from public.audit_events where action = 'plan.purchased') = 1,
  'and is recorded once');

-- Upgrading to Firm, then a stray Season payment does not downgrade.
select test.expect(
  public.apply_plan_purchase('10000000-0000-0000-0000-000000000002', 'firm', 2026, 29900, 'cs_firm', 'cus_b'),
  'an upgrade is applied');
select test.expect(
  (select plan = 'firm' and business_limit = 100
   from public.orgs where id = '10000000-0000-0000-0000-000000000002'),
  'Firm covers 100 client businesses');
select test.expect(
  public.apply_plan_purchase('10000000-0000-0000-0000-000000000002', 'season', 2026, 14900, 'cs_season_again', 'cus_b'),
  'a later Season payment is still recorded');
select test.expect(
  (select plan = 'firm' and business_limit = 100
   from public.orgs where id = '10000000-0000-0000-0000-000000000002'),
  'but never lowers the firm''s plan or limits');

-- A customer id already tied to another firm is not copied onto a second one.
select test.expect(
  public.apply_plan_purchase('10000000-0000-0000-0000-000000000001', 'season', 2026, 14900, 'cs_a', 'cus_b'),
  'a payment whose customer id belongs to another firm still applies');
select test.expect(
  (select stripe_customer_id is null and plan = 'season'
   from public.orgs where id = '10000000-0000-0000-0000-000000000001'),
  'without taking over the other firm''s customer id');
reset role;

-- A firm sees its own purchases only.
set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000b');
select test.expect((select count(*) from public.plan_purchases) = 3, 'a firm sees its purchases');
select test.sign_in('00000000-0000-0000-0000-00000000000c');
select test.expect((select count(*) from public.plan_purchases) = 1, 'and not another firm''s');

-- The list the plan page shows.
select test.sign_in('00000000-0000-0000-0000-00000000000b');
select test.expect(
  (select count(*) = 3 and sum(amount_cents) = 59700 from public.firm_purchases()),
  'the plan page lists the firm''s purchases');
select test.sign_in('00000000-0000-0000-0000-00000000000c');
select test.expect(
  (select count(*) = 1 and min(plan) = 'season' from public.firm_purchases()),
  'and only its own');
set role anon;
select test.expect_error(
  $$select * from public.firm_purchases()$$,
  'permission denied for function', 'a visitor listing purchases');
reset role;
