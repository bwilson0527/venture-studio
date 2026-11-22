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
