# ProofVault: AI Dispute Defense for Digital Sellers

Digital sellers lose PayPal disputes because there is no tracking number for a download.
ProofVault logs proof of access, and an AI agent builds, scores and submits the evidence.

Built for the PayPal AI Hackathon. Team plan: [PLAN.md](PLAN.md). Team rules: [INTEGRATION.md](INTEGRATION.md).

## Repo
```
apps/api        NestJS + Prisma, including the AI pipeline in src/pipeline (Mike)
apps/web        Seller dashboard, Vite + React (Moges)
apps/store      Demo course store with PayPal checkout (Moges)
packages/shared The contract: Zod schemas, types, the five test scenarios
packages/sdk    Tracking snippet for stores
scripts/smoke.ts PayPal sandbox smoke test
render.yaml     Render blueprint
```

## Setup
Needs Node 22, pnpm 11, and Postgres 16 (Docker is easiest).

```bash
pnpm install
```
```bash
cp apps/api/.env.example apps/api/.env
```
```bash
cp apps/web/.env.example apps/web/.env
```
```bash
cp apps/store/.env.example apps/store/.env
```
```bash
docker compose up -d
```
```bash
pnpm db:reset
```
```bash
pnpm dev
```
API on http://localhost:3000, dashboard on http://localhost:5173, store on http://localhost:5174.

No Docker? Any local Postgres 16 works; put its URL in `DATABASE_URL` in `apps/api/.env`.

## Commands
| Command | What it does |
|---|---|
| `pnpm check` | Typecheck, lint, test, build. Must pass before any PR. |
| `pnpm db:reset` | Wipe local DB, run migrations, load the five scenarios |
| `pnpm test:int` | API tests against a real Postgres |
| `pnpm smoke` | Talks to PayPal sandbox: token, order, disputes |

## shadcn/ui
Add components inside the app folder, for example:
```bash
cd apps/web && pnpm dlx shadcn@latest add button
```

## License
MIT, see [LICENSE](LICENSE).
