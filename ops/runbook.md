# Operations runbook

The playbook every scheduled operations run follows. Keep it current: when a
rule changes, change it here in the same pull request.

## Goal and limits (Nov 23 to Dec 22, 2026)

- Goal: 10 paying customers and $2,000 collected from Play 1.
- Floor: 3 paying customers by Dec 15, or the offer or channel changes.
- Spending cap: $1,500 total (about $1,100 ads, $250 outbound tools, $150
  infrastructure). Nothing beyond the cap without the owner's approval.

## Each daily run

1. Health: failed deploys, application errors, failed reminder sends.
2. Funnel: visits, signups, clients imported, checkouts, payments.
3. Billing: failed payments and disputes in Stripe.
4. Support inbox: answer from the playbook below; escalate the rest.
5. Post the morning digest; message the owner only if something needs them.

## Escalate to the owner, do not act

- Any spending beyond the cap, and any new paid tool.
- Refunds outside the published guarantee.
- Anything involving customer data exposure or a suspected breach.
- Legal threats, chargebacks, ad account or sending domain suspensions.
- A prospect who asks for a phone call.

## Standing approvals

- Granted Nov 22, 2026: Claude decides when its own pull requests are ready
  and merges them. Merge only with CI green and no open review comments.
- Not granted yet: emailing customers or prospects, refunds, and moving ad
  budget. Ask before each of these.

## Support playbook

To be written with the Play 1 launch.
