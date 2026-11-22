# venture-studio

One monorepo for B2B products that share a core: a no-login portal, an
automated reminder engine, and field encryption for sensitive data.

The lead product is a W-9 chase and 1099 prep tool for CPA and bookkeeping
firms (working name FormStickler, set in `apps/tax-chase/lib/brand.ts`). A firm
lists the vendors each client business paid, every vendor gets a private link
to fill in and e-sign a Form W-9, reminders go out until they do, and the firm
exports the results for its 1099 filing tool. Tax-document collection for the
same firms follows in February.

| Path | What it is |
| --- | --- |
| `apps/tax-chase` | The Next.js app. `/w9/[token]` is the vendor's W-9 form |
| `packages/core` | Shared code: reminder cadence, portal link tokens, CSV, field encryption, and the W-9 logic (form checks and certification wording, TIN format checks, vendor import, 1099 sorting) |
| `supabase/migrations` | Database schema, row level security, and the portal functions |
| `supabase/tests` | SQL tests for access rules and the portal functions |
| `ops/runbook.md` | How the products are operated day to day |

## Develop

```sh
pnpm install
pnpm dev:tax      # the app on http://localhost:3000
pnpm test         # unit tests
pnpm test:db      # migrations and access-rule tests (needs DATABASE_URL)
pnpm typecheck
pnpm lint
pnpm build
```

Requires Node 22 and pnpm 10.

## Database

Migrations in `supabase/migrations` are plain SQL and are applied to the
Supabase project in order. Every table has row level security: firm users reach
only their own organization's rows, and the client portal runs server-side
with the service role after checking the link token.

`pnpm test:db` applies every migration to a throwaway database on a plain
Postgres, using stand-ins for Supabase's `auth` and `storage` schemas, and runs
the SQL tests in `supabase/tests`. They check that one firm can never read or
change another firm's rows and that nothing is open to signed-out visitors.
Add a test there with every migration that touches access rules.

## The vendor W-9 form

A vendor opens `/w9/<token>`. The token is their only credential: 32 random
bytes, of which the database stores only a hash. The page and its submit
action run on the server with the Supabase secret key and call two database
functions, `portal_lookup_payee` and `portal_submit_w9`, which are granted to
the service role alone.

The form follows the IRS rules for an electronic Form W-9 (Instructions for the
Requester of Form W-9, Rev. March 2024): it asks for the same information as
the paper form, the last entry is a signature made under penalties of perjury
in the paper form's own words, each submission is logged with its time and
network address, and every signed form is kept so a copy can be produced. A
vendor the IRS has told is subject to backup withholding strikes item 2, as on
paper. The certification text lives in `packages/core/src/w9/form.ts` and is
versioned; do not reword it.

The taxpayer ID is encrypted in the app with `TIN_ENCRYPTION_KEY` before it is
stored, bound to its vendor, and never returned to the browser or written to
logs. Firm users see the last four digits. See `apps/tax-chase/.env.example`
for the settings the app needs.

## Requests and reminders

A scheduler calls `POST /api/cron/w9-emails` about once an hour with
`Authorization: Bearer $CRON_SECRET`. Each run looks at vendors whose W-9 is
outstanding and sends what is due: the first request as soon as a firm asks for
it, then reminders after 3 days and every 4 days up to 8, only between 9 and 6
in the firm's time zone. The schedule lives in `packages/core/src/reminders`
and the wording in `packages/core/src/w9/emails.ts`.

A run claims each vendor before sending, so overlapping runs cannot send the
same email twice, and every send or failure is logged in `payee_reminders`.
Three failures in a row stop the retries for that address. If the mail provider
says to slow down, the run ends early and the next one carries on.

Every email carries the vendor's private form link, rebuilt each time from
`PORTAL_TOKEN_SECRET`, and a link to turn reminders off (`/w9/<token>/stop`,
plus one-click unsubscribe for mail apps). A vendor who submits their W-9 or
turns reminders off gets no more email. Nothing is sent until `RESEND_API_KEY`
and `EMAIL_FROM` are set.

## The firm dashboard

Firm users sign in at `/sign-in` with a six-digit code sent to their email
(Supabase Auth). There are no passwords, and a new email address gets a new
account the same way. The first visit asks for the firm's name, then:

- `/dashboard` lists the firm's client businesses with how many W-9s are in.
- `/dashboard/clients/<id>` is the vendor board for one client business.
  Upload a vendor CSV or add vendors by hand, send W-9 requests, and see each
  vendor's W-9 status beside a first-pass 1099 sort. A vendor can be edited,
  put on hold or removed, and their private form link can be shown so the firm
  can send it themselves.
- `/dashboard/settings` holds the firm name, reply-to address and time zone.

Everything the dashboard reads or changes goes through a database function
called as the signed-in user (`lib/firm-store.ts`), so row level security
decides what each firm can reach. `lib/session.ts` is the one place that says
who is signed in, and every page and action starts there. `proxy.ts` keeps the
session cookie fresh and redirects signed-out visitors, as a convenience only.

Two Supabase settings are needed before real sign-ins work: the email template
for sign-in must include the code (`{{ .Token }}`), and the project needs a
custom SMTP sender, because the built-in one only sends a few emails an hour.

## The export for 1099 filing

The vendor board offers two CSV downloads (`/dashboard/clients/<id>/export`):
one with full taxpayer IDs for filing (`?tins=full`), and one with the last
four digits only. Each has one row per vendor with the W-9 details and the
1099 sort. The layout lives in `packages/core/src/w9/export.ts`.

Taxpayer IDs are decrypted on the server, in memory, only for a user who can
see the client business. The database function `export_w9s` checks the
membership again and records every download in `exports` and the audit log,
including whether it carried full IDs. Responses are sent with `no-store`.

The layout is a general one with plain column names, which filing tools can
map on import. Layouts matched to specific tools (Avalara 1099 & W-9, Tax1099,
IRS IRIS) are not built yet: their templates have to be confirmed first.
