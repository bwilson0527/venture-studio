# Launch checklist

What it takes to put the tax-chase app on the internet for the first time.
Nothing here has been done yet. Steps that cost money or create accounts
need the owner's OK first; they are marked **owner**.

The app has so far run only against local stand-ins for Supabase, Resend and
Stripe. Expect small surprises on the first real run and do the smoke test at
the end before telling anyone the address.

## 1. Domain and legal details (owner)

Buy the domain and point its DNS at Netlify. Everything below uses it.

Fill in `LEGAL` in `apps/tax-chase/lib/brand.ts`: the company name, the state
whose law governs the terms, a contact email on the domain, a postal address,
the effective date and the refund window. Until every value is set, `/privacy`
and `/terms` show a draft notice and are hidden from search engines. Do not
take a payment while they are drafts. Both pages were written without a
lawyer; a review before paid advertising starts is worth its cost.

## 2. Supabase (owner approves the cost prompt)

1. Create a new project in the owner's organization, in a US region (the
   privacy policy says the data is stored in the United States). Do not touch
   the other projects there.
2. Apply every file in `supabase/migrations/` in order.
3. Check that the tables in `public` are granted to `authenticated` and
   `service_role`. The migrations rely on Supabase's default grants.
4. Authentication, email template for sign-in: it must show the code,
   `{{ .Token }}`, not only a link.
5. Authentication, SMTP: set a custom sender (Resend's SMTP). The built-in
   sender allows only a few emails an hour.
6. Authentication, URL configuration: set the site URL to the app's address.

## 3. Resend

1. Add the domain and its DNS records, and wait until it shows as verified.
2. Create an API key for sending.
3. Add a webhook for `<APP_URL>/api/resend/webhook` with the events
   `email.bounced` and `email.complained`. Keep its signing secret.

Resend is for the product's own email only. Its policy bans cold outreach.

## 4. Stripe (owner: the account is live and shared with another business)

1. Create a secret key for the app.
2. Add a webhook endpoint for `<APP_URL>/api/stripe/webhook` with the events
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
   Keep its signing secret.

Until the secret key is set, the plan page says paid plans open soon.

## 5. Netlify

1. Create a project from the repository. Leave the base directory at the
   repository root and set the **package directory** to `apps/tax-chase`. The
   build command, publish directory and Node version come from
   `apps/tax-chase/netlify.toml`.
2. Set the environment variables below, with the scopes Builds and Functions.
   Mark all but `APP_URL` and `EMAIL_FROM` as secret.
3. Add the domain.
4. Deploy. The function `w9-emails` then calls the app every five minutes to
   send what is due. It runs only on the published deploy.

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | The Supabase project's API settings |
| `TIN_ENCRYPTION_KEY` | Generate once (see `.env.example`). Back it up: losing it makes every stored taxpayer ID unreadable |
| `PORTAL_TOKEN_SECRET` | Generate once, at least 32 characters. Changing it breaks every link already emailed |
| `APP_URL` | The app's public address, no trailing slash |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Resend |
| `EMAIL_FROM` | For example `FormStickler <requests@the-domain>` |
| `CRON_SECRET` | Generate once. The scheduled function sends it to the app |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe |

## 6. Smoke test

1. Open `/privacy` and `/terms`: no draft notice, no gaps in square brackets.
2. Sign in with an emailed code and create a firm.
3. Add a client business and a vendor with an address you can read.
4. Send the request. Within about five minutes, inside working hours, the
   email arrives. Open the link and sign the W-9.
5. The board shows the W-9 as received. Download the export.
6. In Stripe test mode, or with a real card refunded afterwards (owner),
   buy the Season plan and check the plan page.
7. In Resend and Stripe, check that the webhook deliveries are all 2xx.
