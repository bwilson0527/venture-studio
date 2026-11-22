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

## Scheduled jobs

- Hourly: `POST /api/cron/w9-emails` with the cron secret. Sends W-9 requests
  and due reminders to vendors on behalf of firms. These are the product's own
  transactional emails to vendors, not marketing to prospects.
- Watch for: runs that report `failed` above zero twice in a row, and any run
  that returns an error. Check `payee_reminders.error` for the cause.

- Resend reports bounces and spam complaints to `POST /api/resend/webhook`.
  Watch the complaint rate in Resend: its policy allows closing an account
  above 0.08% complaints or 4% bounces. If either climbs, pause the hourly
  job and tell the owner.

## Payments

- Stripe sends paid Checkout Sessions to `POST /api/stripe/webhook`. In
  Stripe, check the endpoint's recent deliveries: every one should be a 2xx.
- A log line "Applying paid session ... failed" means someone paid and the
  plan was not raised. Fix that the same day: find the session in Stripe and
  re-send the event from the endpoint's delivery list.
- Refunds are the owner's call. Do not issue one without approval.

## Support playbook

To be written with the Play 1 launch.
