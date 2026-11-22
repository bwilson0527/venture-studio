-- Paid plans. A firm buys a plan for a season with a one-time payment
-- (Stripe Checkout). The server records the payment here and raises the
-- firm's limits. Members can see their firm's purchases; only the server
-- writes them.

create table public.plan_purchases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  plan text not null check (plan in ('season', 'firm')),
  -- The 1099 season the payment covers.
  tax_year integer not null,
  amount_cents integer not null check (amount_cents >= 0),
  -- One row per Stripe Checkout Session, so a payment is never applied twice.
  stripe_session_id text not null unique,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);
create index plan_purchases_org_id_idx on public.plan_purchases (org_id, created_at desc);

alter table public.plan_purchases enable row level security;
create policy plan_purchases_select on public.plan_purchases
  for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete on public.plan_purchases from anon, authenticated;

-- Apply a payment Stripe has confirmed. Safe to call more than once for the
-- same Checkout Session: only the first call changes anything. Returns true
-- when this call applied the payment.
--
-- Season covers 25 client businesses and Firm covers 100, both with no limit
-- on vendors. A purchase never lowers a limit the firm already has.
create function public.apply_plan_purchase(
  p_org_id uuid,
  p_plan text,
  p_tax_year integer,
  p_amount_cents integer,
  p_stripe_session_id text,
  p_stripe_customer_id text
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_limit integer;
  v_inserted integer;
begin
  v_limit := case p_plan when 'season' then 25 when 'firm' then 100 end;
  if v_limit is null then
    raise exception 'unknown_plan' using errcode = 'P0001';
  end if;
  if coalesce(p_stripe_session_id, '') = '' then
    raise exception 'missing_session' using errcode = 'P0001';
  end if;

  -- Lock the firm so two deliveries of the same payment queue up.
  perform 1 from public.orgs o where o.id = p_org_id for update;
  if not found then
    raise exception 'unknown_org' using errcode = 'P0001';
  end if;

  insert into public.plan_purchases
    (org_id, plan, tax_year, amount_cents, stripe_session_id, stripe_customer_id)
  values (p_org_id, p_plan, p_tax_year, p_amount_cents, p_stripe_session_id, p_stripe_customer_id)
  on conflict (stripe_session_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  update public.orgs o
  set plan = case when o.plan = 'firm' then 'firm' else p_plan end,
      business_limit = greatest(o.business_limit, v_limit),
      payees_per_business_limit = null,
      stripe_customer_id = case
        when o.stripe_customer_id is null and p_stripe_customer_id is not null
             and not exists (select 1 from public.orgs x
                             where x.stripe_customer_id = p_stripe_customer_id)
        then p_stripe_customer_id
        else o.stripe_customer_id
      end
  where o.id = p_org_id;

  insert into public.audit_events (org_id, actor, action, target)
  values (p_org_id, 'system', 'plan.purchased',
          p_plan || ' tax_year:' || p_tax_year || ' session:' || p_stripe_session_id);
  return true;
end;
$$;

revoke all on function public.apply_plan_purchase(uuid, text, integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_plan_purchase(uuid, text, integer, integer, text, text)
  to service_role;

-- What the caller's firm has paid for, newest first, for the plan page.
create function public.firm_purchases()
returns table (plan text, tax_year integer, amount_cents integer, purchased_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select p.plan, p.tax_year, p.amount_cents, p.created_at
  from public.plan_purchases p
  where p.org_id = (
    select m.org_id from public.members m
    where m.user_id = (select auth.uid())
    order by m.created_at
    limit 1
  )
  order by p.created_at desc, p.id;
$$;

revoke all on function public.firm_purchases() from public, anon;
grant execute on function public.firm_purchases() to authenticated;
