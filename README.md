# venture-studio

One monorepo for three B2B products that share a core: a no-login upload
portal, an automated reminder engine, and document extraction.

| Path | What it is |
| --- | --- |
| `apps/tax-chase` | Play 1: tax-season document collection for small tax firms (Next.js) |
| `packages/core` | Shared code: reminder cadence, portal tokens |
| `supabase/migrations` | Database schema and row level security |
| `ops/runbook.md` | How the products are operated day to day |

Plays 2 (COI compliance tracker) and 3 (carrier fraud monitor) will be added as
`apps/coi-tracker` and `apps/carrier-monitor`.

## Develop

```sh
pnpm install
pnpm dev:tax      # Play 1 on http://localhost:3000
pnpm test         # unit tests
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
