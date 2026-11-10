# ProofVault: AI Dispute Defense for Digital Sellers

Sellers of digital products lose PayPal disputes because a download has no tracking number.
When a buyer says "I never got it", the seller has nothing to show.

ProofVault records proof that the buyer used what they paid for: logins, lessons opened, files
downloaded, with time, IP and device. When PayPal opens a dispute, an AI agent turns those records
into an evidence package, scores the chance of winning, and responds on PayPal within the
seller's own rules. Every claim it sends is checked against a real record first.

Built for the PayPal AI Hackathon by Mike, Fitsum and Moges.

## Try it

| What | Where |
|---|---|
| Demo store (sandbox checkout) | https://proofvault-store.onrender.com |
| Seller dashboard | https://proofvault-web.onrender.com |
| API | https://proofvault-api.onrender.com (`/health` shows the deployed commit) |

Everything runs on the PayPal **sandbox**. No real money moves.

1. Buy the course in the store with a PayPal sandbox **buyer** account, then open a few lessons.
2. Log in to sandbox PayPal as that buyer and open a dispute on the payment ("item not received").
3. Within a few minutes (PayPal's sandbox list lags new cases) the case shows up in the dashboard with its evidence, score and the
   agent's decision. A strong case is answered automatically.

The dashboard is read-only for visitors. Anything that changes a case (submit, offer, refund,
rules) asks for a demo passcode.

## How it works

```
 Store + tracking SDK        API (NestJS)                          PayPal sandbox
 ────────────────────        ────────────                          ──────────────
 buyer pays ───────────────► create + capture order ─────────────► Orders v2
 buyer opens lessons ──────► /track: access events (time, IP,
                             device), tied to the order

                             intake: webhook, plus a 60 s poll ◄── Disputes API
                               │
                               ▼
                             pipeline (pure functions, no database)
                               1. timeline   order + access events in date order
                               2. score      0 to 100, from rules in code, not the AI
                               3. draft      DeepSeek writes claims, each citing record ids
                               4. check      drop any claim whose records do not back it
                               5. explain    plain-English reasons for the seller
                               6. decide     seller's rules pick submit / offer / refund / wait
                               │
                               ▼
                             executor: acts once per PayPal stage ──► provide-evidence (PDF),
                                                                      make-offer, accept-claim
 Seller dashboard ◄────────── /disputes, /seller/rules
```

**The AI never decides alone.** The score is computed by code from the records. The AI writes the
wording of the claims and the reasons, and every claim must cite records that exist and say what
the claim says, or it is dropped. The final action comes from the seller's rules.

### The score

For "item not received", points come from what the records show:

| Evidence | Points |
|---|---|
| Content opened after purchase (more for 3+ lessons, a download) | 25 to 50 |
| Buyer logged in | 10 |
| Access from the checkout device | 15 |
| Access from the checkout IP | 15 |
| Activity across several days | 10 or 20 |
| Activity after the dispute was opened | 15 |

"Unauthorised" and "not as described" have their own weights. Other reasons are not scored and
wait for the seller.

### The seller's rules (defaults)

Checked in this order, first match wins:

1. Unsupported reason or no matching order: wait for the seller.
2. Score 75 or more: submit the evidence.
3. Score under 40 and amount up to $15: refund.
4. Score under 40 and amount up to $30: offer 50% back.
5. Anything else: wait for the seller.

The seller changes these on the Agent rules page.

### Safety

- The agent acts at most once per PayPal stage (inquiry, then claim) and never makes a second
  offer. A failed attempt counts, so there are no retry loops.
- Refunds and offers from the dashboard need a confirm step that shows the exact amount.
- IP addresses are masked in every API response and in the evidence PDF.
- The evidence PDF and claims contain facts only: no internal ids, no PayPal reason codes.

## PayPal APIs used

| API | Endpoint | Used for |
|---|---|---|
| OAuth | `POST /v1/oauth2/token` | API access token |
| Orders v2 | `POST /v2/checkout/orders`, `POST /v2/checkout/orders/{id}/capture` | Store checkout, order created and captured server-side |
| JS SDK (v5) | PayPal buttons in the store | Buyer approves the payment |
| Disputes | `GET /v1/customer/disputes`, `GET /v1/customer/disputes/{id}` | Intake (poll) and loading a case by ID |
| Disputes | `POST .../provide-evidence` | Submit the evidence PDF |
| Disputes | `POST .../make-offer`, `.../accept-claim`, `.../escalate`, `.../send-message` | Seller and agent actions |
| Disputes (sandbox only) | `POST .../require-evidence`, `.../adjudicate` | Move a sandbox case forward for testing |
| Webhooks | `POST /v1/notifications/verify-webhook-signature` | Verify dispute webhooks before trusting them |

How the sandbox actually behaves (timings, stages, quirks): [docs/paypal-sandbox-notes.md](docs/paypal-sandbox-notes.md).

## Built with

| Part | Tools |
|---|---|
| AI | DeepSeek (`deepseek-chat`) for claims, reasons and the Studio assistant |
| API | NestJS, Prisma, PostgreSQL, pdfkit for the evidence PDF |
| Dashboard | React, Vite, Tailwind, shadcn/ui, TanStack Query, Recharts |
| Dashboard extras | Bryntum Scheduler (triage board, trial/hackathon licence), AG Studio (AI assistant page) |
| Store | React, Vite, PayPal JS SDK, our tracking SDK (`packages/sdk`) |
| Shared contract | Zod schemas in `packages/shared`, used by the API and both apps |
| Hosting | Render (API, two static sites, Postgres), deployed from `main` |

## Repo

```
apps/api         NestJS + Prisma API. AI pipeline in src/pipeline
apps/web         Seller dashboard
apps/store       Demo course store with PayPal checkout
packages/shared  The contract: Zod schemas, types, the five test scenarios
packages/sdk     Tracking snippet for stores
scripts/         smoke.ts (PayPal sandbox check), eval-draft.ts (AI draft check)
render.yaml      Render blueprint for every service
```

## Run it locally

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

Fill in `apps/api/.env`: your PayPal sandbox app's client ID and secret, and a DeepSeek API key.
Put the same PayPal client ID in `apps/store/.env`. Without a DeepSeek key everything starts, but
analysing a dispute fails (logged, and it can be retried once the key is set).

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
The database starts with five seeded demo disputes (`PP-D-...`), one per test scenario.

To look at the dashboard without any API or keys, set `VITE_USE_FIXTURES=true` in `apps/web/.env`.

No Docker? Any local Postgres 16 or newer works. Create the dev user and database once (asks for your `postgres` password):
```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE ROLE proofvault LOGIN PASSWORD 'proofvault' CREATEDB;"
```
```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE proofvault OWNER proofvault;"
```
Then `pnpm db:reset` as above.

Using an AI coding agent? Prisma refuses to run `db:reset` for an agent without your explicit consent, because it wipes the database. On a fresh, empty database the agent can instead run `prisma migrate deploy` and `prisma db seed` from `apps/api`.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API, dashboard and store together |
| `pnpm check` | Typecheck, lint, test, build. Must pass before any PR. |
| `pnpm db:reset` | Wipe local DB, run migrations, load the five scenarios |
| `pnpm test:int` | API tests against a real Postgres |
| `pnpm smoke` | Talks to PayPal sandbox: token, order, disputes |
| `pnpm eval:draft` | Runs the AI draft on the five scenarios and checks every claim is backed |

## Known limits

- The store logs a "login" the moment checkout finishes, so a buyer who pays and never comes back
  still shows one access. A real store would log it on the buyer's first visit instead.
- Dispute webhooks need registering on the PayPal app by its account owner. Until then the
  60-second poll brings cases in; PayPal's dispute list itself can lag a new case by a few minutes.
- Sandbox only. Going live needs a live PayPal app and the same env variables with live keys.

## License

MIT, see [LICENSE](LICENSE).
