# ProofVault: Team Plan

Built from HANDOFF.md. Today is Wed Nov 4, 2026. Devpost deadline is Thu Nov 12, 8:00 PM UTC (11:00 PM EAT).
**Our internal deadline is Nov 12, 12:00 UTC.** The last 8 hours are buffer, not work time.

---

## 1. Verdict: what is feasible

The MVP is doable for 3 people in 8 days **if** we drop every stretch item until the full flow works in sandbox, and **if** the two day-one risks below pass. Most of the work is ordinary CRUD (create, read, update, delete) plus API calls. The hard parts are PayPal sandbox behaviour and getting a demo that looks like a real product.

### Ship (MVP)
| Feature | Effort | Notes |
|---|---|---|
| Demo store, SDK v6 checkout (sandbox) | M | Sells one mini course. Server creates and captures the order. |
| Access tracking (tiny JS snippet + `/track` endpoint) | S | Our "tracking number for digital goods". |
| Dispute intake: webhook **plus** polling fallback | M | Sandbox webhooks can be slow or missing. Polling every 60s means the demo never depends on them. |
| Evidence timeline + PDF | M | PDF is what we upload to `provide-evidence`. |
| AI draft with claim-to-record check | M | The guardrail is the core of our AI story. Design in section 4. |
| Win score | S | Rules-based number, AI writes the reasons. Design in section 4. |
| Auto-action rules + one-click approval | M | `make-offer`, `accept-claim`, `provide-evidence`. |
| Sandbox stage controls (`require-evidence`, `adjudicate`) | S | Buttons in the dashboard so the video can move a dispute to "resolved". |
| Seller dashboard | M | Dispute list, detail page, rules page, action log. |
| Bryntum triage board | S/M | One view: disputes on a timeline against response deadlines. |
| AG Studio analytics | M | Win rate by reason, money recovered, Studio agent for questions. |
| Render deploy | S | Blueprint file, auto deploy from `main`. |

### Cut or defer (in this order if time appears)
1. Proof-of-access receipt email to buyer (cheap, good for the "prevention" angle)
2. Outcome learning (store outcomes from day one; the "learning" view is just win rate per evidence type, which the AG dashboard already shows)
3. Checkout risk flags
4. Zapier alert, KERNEL snapshots: **do not start**

### My opinions on the handoff
- **Win score must not be a number the LLM makes up.** Judges and sellers will not trust it, and it changes between runs. Compute it from evidence features with fixed weights per dispute reason. The LLM only explains it. Honest, testable, repeatable.
- **Do not depend on webhooks alone.** Keep the webhook, add a poll. The video must not stall waiting for PayPal.
- **Render Workflows is a risk, not a given.** It is new. Write each pipeline step as a plain function that is safe to run twice. Wire those into Render Workflows; if it fights us for more than half a day, run the same functions with pg-boss (a job queue that lives in Postgres, so no Redis). The sponsor prize is not worth losing the core flow.
- **No real login.** One seeded demo seller. Login screens are time with zero judging value.
- **Vite, not Next.js**, for the dashboard. It is a single-page app behind no SEO need, and AG Studio and Bryntum are client-side anyway.
- **Store is its own tiny static site** on a different URL. That makes the "drop our snippet into any store" story real on video.

---

## 2. Open decisions (my picks, change them if you disagree)
| Decision | Pick | Why |
|---|---|---|
| LLM | **Claude Sonnet 5.5** (`claude-sonnet-5-5`) via the Vercel AI SDK (a library that gives one tool-calling API across LLM providers) | PayPal Agent Toolkit ships an AI SDK adapter, and Claude is strong at strict JSON output, which the guardrail needs. |
| Product | **Mini course** (4 short lessons + 1 bonus PDF) | Gives several event types over several days (login, lesson views, download). A template pack only gives one download, which makes a weak timeline. |
| ORM | **Prisma** | Fastest schema-to-types loop, simple migrations, works fine in NestJS. |
| Package manager | **pnpm workspaces** | One repo, shared types package, one install. |
| Roles | Mike (A), Fitsum (B), Moges (C) | Mike integrates. See INTEGRATION.md. |
| Seller stat for the video | Moges finds it by Nov 9 | PayPal and Chargebacks911 reports are the first place to look. Must be cited. |

**Note on STACK.md:** AG Grid/AG Studio and Bryntum are deliberate exceptions to the shadcn + Recharts standard, because they are sponsor tools. Everything else in the dashboard uses shadcn/ui, Tailwind, lucide icons, Sonner toasts, TanStack Query.

---

## 3. Architecture

```
 Buyer browser                       Seller browser
 ┌────────────────────┐              ┌──────────────────────────────┐
 │ apps/store (static)│              │ apps/web (static, Vite)      │
 │ SDK v6 checkout    │              │ dashboard, approvals, rules, │
 │ packages/sdk snippet│             │ Bryntum board, AG Studio     │
 └─────────┬──────────┘              └──────────────┬───────────────┘
           │ /store/orders, /track                  │ REST
           ▼                                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ apps/api (NestJS on Render)                                      │
 │  paypal/    OAuth, Orders, Disputes, webhook verify              │
 │  tracking/  access events                                        │
 │  disputes/  sync (webhook + poll), actions                       │
 │  pipeline/  timeline -> draft -> check -> score -> decide -> act │
 │  agent/     Claude + PayPal Agent Toolkit tools                  │
 └───────┬────────────────────────────┬────────────────────────────┘
         │                            │
         ▼                            ▼
  PostgreSQL (Render)          PayPal Sandbox APIs
                               (Orders v2, Disputes, Webhooks)
  Render Workflows runs the pipeline/ steps (fallback: pg-boss)
```

### Repo layout
```
proofvault/
  apps/
    api/        NestJS + Prisma
    web/        seller dashboard (Vite + React + shadcn)
    store/      demo course store (Vite + React, SDK v6)
  packages/
    shared/     TS types + Zod schemas (Zod = runtime checks for JSON shapes) shared by all apps
    sdk/        tracking snippet, ~1 KB, no dependencies
  scripts/
    smoke.ts    sandbox smoke test (token, order, list + show disputes)
    seed.ts     demo seller, product, orders, events, fake disputes
  render.yaml   Render blueprint (all services in one file)
  LICENSE       MIT
```

### Pipeline (one dispute)
1. **Intake**: webhook or poll sees a new or changed dispute, saves it (upsert by `paypal_dispute_id`, so duplicates do nothing).
2. **Load**: `GET /v1/customer/disputes/{id}`, match to our order by capture ID first, then by `custom_id` (our order id, sent to PayPal at order creation).
3. **Timeline**: collect order + access events, sort, save as JSON. Every timeline entry keeps its database record ID.
4. **Draft**: Claude gets the timeline and the dispute reason, returns structured claims (see section 4).
5. **Check**: code verifies every claim against the database. Failing claims are dropped and logged.
6. **Score**: rules-based 0 to 100, Claude writes 2 to 4 plain reasons.
7. **Decide**: seller rules pick one of: auto-submit, auto-offer, auto-accept, or wait for approval.
8. **Act**: call PayPal. Store the result in an action log.
9. **Track**: on `RESOLVED` (webhook or poll), write an Outcome row.

---

## 4. AI design (the part judges will poke at)

### Guardrail: no invented evidence
Claude never writes free text that goes straight to PayPal. It returns JSON like:
```json
{
  "claims": [
    { "text": "Buyer logged in from the purchase device on Nov 3.", "record_ids": ["evt_81"] },
    { "text": "Buyer viewed 3 of 4 lessons over 2 days.", "record_ids": ["evt_82","evt_85","evt_90"] }
  ],
  "recommendation": "fight" 
}
```
Then plain code checks each claim:
- every `record_id` exists and belongs to **this** order,
- every date, count and amount in `text` matches the records (simple pattern checks on numbers and dates),
- claims with no records are rejected.

Only passing claims are joined into the final response. The dashboard shows each sentence with its linked records highlighted, so the seller (and the judge watching the video) can see the proof behind every line. Rejected claims show in a "removed by guardrail" box. That box is a great 5 seconds of video.

### Win score
Points per evidence feature, weights depend on dispute reason:
- `MERCHANDISE_OR_SERVICE_NOT_RECEIVED`: download or lesson view after purchase (big), login from same IP/device as checkout (medium), multiple sessions on different days (medium), activity after the dispute date (big).
- `NOT_AS_DESCRIBED`: amount of content consumed, product page snapshot (stretch), refund policy shown at checkout.
- `UNAUTHORISED`: device and IP match with checkout, prior purchases.

Score below the seller's threshold means the agent recommends refund or offer, not a fight. That is the "honest advice" guardrail.

### Agent tools
Use the PayPal Agent Toolkit tools it already has (check on day one which dispute tools exist). Add our own tools for what it lacks: `get_evidence_timeline`, `provide_evidence`, `make_offer`. Every tool that moves money or submits evidence goes through the rules engine first, never straight from the model.

### Privacy
IPs stored in full, masked in every dashboard response (`196.188.x.x`). Store checkout page shows one line: access to the course is logged to prevent fraud.

---

## 5. The 3-way split

Each person owns a vertical slice and its tests. Owners merge their own PRs after a 10-minute review from one other person.

### Mike (A): PayPal + backend core + integration
- NestJS app, Prisma schema (handoff section 7), migrations, seed script
- PayPal client: OAuth token cache, Orders v2 create and capture, Disputes list/get, `provide-evidence` (multipart upload with the PDF), `make-offer`, `accept-claim`, `send-message`, sandbox `require-evidence` and `adjudicate`
- Webhook endpoint with signature check (PayPal's verify-webhook-signature call) + 60s poll fallback
- `/track` endpoint, `/store/orders` endpoints
- Outcome writing on resolve
- Owns `render.yaml`, env vars, Render services, PayPal app config

### Fitsum (B): AI agent + pipeline
- Timeline builder, evidence PDF generator
- Claude draft with structured output, claim checker, unit tests on seed data (this code must be tested, it is our main promise)
- Win score rules + reasons
- Auto-action rules engine (reads seller rules JSON, returns a decision)
- Agent Toolkit wiring
- Render Workflows wiring (and the pg-boss fallback if needed)
- Helps C with the AG Studio agent on Nov 10 (it is an AI feature)

### Moges (C): frontend + product/demo
- `apps/store`: course landing page, SDK v6 checkout, lesson pages, bonus download, tracking snippet in `packages/sdk`
- `apps/web`: dispute list, dispute detail (timeline, claims with record highlight, score, removed claims, action buttons), approval flow, rules page, action log, sandbox stage buttons
- Bryntum triage board, AG Studio analytics dashboard
- Video script, recording, README, Devpost text, the seller stat

**Why this split:** the three slices meet at only two seams (the database and the REST API), both frozen on day one. Nobody waits on anybody after Nov 5.

---

## 6. Contracts (agree and commit on Nov 4, before splitting)

Frozen in `packages/shared`. Changing one needs a PR all three see.

1. **Prisma schema** from handoff section 7, plus `ActionLog` (id, dispute_id, action, actor: `agent` | `seller`, request JSON, response JSON, created_at).
2. **Seed data**: 1 seller, 1 product, 6 orders with events, 4 fake disputes (strong, medium, weak evidence, and one with no matching order). B and C build against this from day one without touching PayPal.
3. **REST API** (all JSON, IPs masked):

| Method | Path | Owner | Used by |
|---|---|---|---|
| POST | `/store/orders` | A | store |
| POST | `/store/orders/:id/capture` | A | store |
| POST | `/track` | A | sdk |
| POST | `/webhooks/paypal` | A | PayPal |
| GET | `/disputes` | A | web |
| GET | `/disputes/:id` (dispute + package + claims + actions) | A/B | web |
| POST | `/disputes/:id/analyze` (re-run pipeline) | B | web |
| POST | `/disputes/:id/approve` | B | web |
| POST | `/disputes/:id/actions` `{type: submit, offer, accept}` | A/B | web |
| POST | `/disputes/:id/sandbox/:step` `{require-evidence, adjudicate}` | A | web |
| POST | `/disputes/sync` (manual poll) | A | web |
| POST | `/disputes/fetch` `{caseId}` (load one case by id; the sandbox list lags, see docs/paypal-sandbox-notes.md) | A | web |
| GET/PUT | `/seller/rules` | B | web |
| GET | `/analytics/summary`, `/analytics/by-reason` | A | AG Studio |
| GET | `/triage` (rows + deadline events) | A | Bryntum |

4. **Pipeline function signatures** (B implements, A calls):
   `runPipeline(disputeId)`, `buildTimeline(orderId)`, `draftResponse(timeline, reason)`, `checkClaims(draft, orderId)`, `scoreDispute(timeline, reason)`, `decide(score, amount, rules)`.

---

## 7. Day-by-day

| Day | Mike (PayPal/backend) | Fitsum (AI/pipeline) | Moges (frontend/demo) |
|---|---|---|---|
| **Wed Nov 4** | **Smoke test: token, order, open a sandbox dispute as buyer, read it via API.** Enable Disputes in app features. | Get API key, prototype the claims prompt on hand-written data, check Agent Toolkit dispute tools | Repo + pnpm workspaces, Vite apps, hello-world deploy to Render, claim AG/Bryntum trials |
| All | Agree contracts (section 6), commit schema + shared types + seed | | |
| **Thu Nov 5** | Prisma + seed, store order endpoints, `/track`, webhook + signature check, poll | Timeline builder, claim checker + tests | Store: landing, SDK v6 checkout, lessons, download, snippet |
| **Fri Nov 6** | Disputes sync + details, `provide-evidence` with PDF, sandbox stage calls | Claude draft, win score, PDF | Dashboard shell, dispute list, detail page on seed data |
| **Checkpoint** | **Walking skeleton on Render staging:** seeded dispute goes intake to draft to submit, shown in the dashboard. | | |
| **Sat Nov 7** | `make-offer`, `accept-claim`, `send-message`, outcomes on resolve | Rules engine, approval flow logic, Render Workflows wiring | Approval UI, rules page, action log, sandbox buttons |
| **Sun Nov 8** | **Integration day (all three): real sandbox buyer, real dispute, end to end on Render.** Fix whatever breaks. | | |
| **Mon Nov 9** | Analytics + triage endpoints, retries, duplicate webhook safety | Agent Toolkit polish, reasons text, edge cases (no order match, weak evidence) | Bryntum triage board, find the seller stat |
| **Tue Nov 10** | Receipt email (stretch) or bug fixes. **Pre-create 5+ sandbox disputes at different stages for the video.** | AG Studio agent with C | AG Studio dashboard, theme |
| **Feature freeze end of Nov 10.** | | | |
| **Wed Nov 11** | Drive the demo on video, README setup section | Tools list (AI model, PayPal APIs, sponsors) for Devpost, architecture section | Record and edit video, README, Devpost text, LICENSE in About |
| **Code freeze 12:00 UTC.** Only demo-breaking fixes after this. | | | |
| **Thu Nov 12** | Make repo public, final deploy check | Check video is public, under 3 min | **Submit by 12:00 UTC** |

**Why we pre-create disputes on Nov 10:** each sandbox order can be disputed once, and moving a dispute through stages takes several API calls. Recording with disputes already in place means the video shows a clean flow in one take.

---

## 8. Integration and workflow

- **Branches:** `main` is always deployable and auto-deploys to Render. Each person works on short branches (`a/webhooks`, `b/claim-check`), merges at least once a day.
- **Daily sync:** 15 minutes, 8:00 PM EAT. Each person says: what merged, what is blocked, what merges tomorrow.
- **No hand-made mocks.** Fitsum and Moges build on the shared fixtures in `packages/shared/fixtures` and the matching seed data. Same shapes as the real API, so switching is one env change. Full rules in INTEGRATION.md.
- **Shared types** in `packages/shared`. If the API shape changes, the PR updates the Zod schema and both sides see the TypeScript error.
- **Tests that matter:** claim checker, score rules, rules engine, webhook duplicate handling. Skip UI tests, the video is the UI test.
- **Local webhooks:** use a tunnel (cloudflared or ngrok, tools that give your laptop a public URL) only when needed. Normally point the PayPal sandbox webhook at the Render staging URL.

---

## 9. Deployment (Render)

One `render.yaml` blueprint creates everything:

| Service | Render type | Plan | Est. cost |
|---|---|---|---|
| `proofvault-api` | Web service (Node) | Starter | ~$7/mo |
| `proofvault-web` | Static site | Free | $0 |
| `proofvault-store` | Static site | Free | $0 |
| `proofvault-db` | Postgres | Basic | ~$6/mo |
| Pipeline | Render Workflows (or in-process pg-boss) | usage | small |

All within the $50 Render credits. Do not use the free web service plan for the API: it sleeps when idle and the first request takes ~50 seconds, which kills webhooks and the live demo.

**Env vars (API):** `DATABASE_URL`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`, `ANTHROPIC_API_KEY`, `WEB_ORIGIN`, `STORE_ORIGIN`, `DEMO_PASSCODE`.
**Env vars (web/store, build time):** `VITE_API_URL`, `VITE_PAYPAL_CLIENT_ID`, `VITE_AG_LICENSE_KEY` (trial key, never committed).

**Release checklist (Nov 11):** migrations and the seller-only seed run on deploy, `DEMO_PASSCODE` set, webhook URL in PayPal app points at the prod API, CORS allows web + store origins, health check route `/health` returns 200, no secrets in git history.

---

## 10. Resources we need

### Accounts (all free or trial)
| What | Who sets up | By |
|---|---|---|
| GitHub private repo, all 3 as collaborators | C | Nov 4 |
| PayPal Developer account, sandbox app with **Disputes** enabled, sandbox business (seller) + personal (buyer) accounts | A | Nov 4 |
| Render account, team workspace, $50 credits claimed | A | Nov 4 |
| Anthropic API key with a spend limit (~$30) | B | Nov 4 |
| AG Grid / AG Studio trial (45 days) + their PayPal boilerplate | C | Nov 4 |
| Bryntum Scheduler trial | C | Nov 5 |
| Postman with the PayPal collection | A | Nov 4 |
| APIMatic Context Plugin in Claude Code (all 3) | each | Nov 4 |
| Devpost team: all 3 added | C | Nov 5 |
| YouTube channel for the video | C | Nov 11 |

### Local tools (each person)
Node 22 LTS, pnpm, Docker Desktop (local Postgres), Git, Claude Code with APIMatic plugin, a screen recorder (OBS) for C.

### Money
About $40 to $60 total out of pocket: Anthropic usage (~$10 to $30), anything over Render credits (should be $0). Everything else is free or trial.

### Licence checks (do on Nov 4, 10 minutes)
- Can the Bryntum trial package be used in a **public** repo? If not, the repo installs it but the README says to install the trial yourself.
- AG Studio trial key must stay in env vars, not in code.
- Our code: MIT LICENSE.

---

## 11. Risks and what we do if they hit

| Risk | Sign | Plan B |
|---|---|---|
| Cannot create or read sandbox disputes | Smoke test fails on Nov 4 | Ask in PayPal Discord the same day. Meanwhile build on seed disputes; pipeline does not care where the dispute came from. |
| `provide-evidence` rejected at current stage | 4xx with stage error | Call sandbox `require-evidence` first to move the dispute to the stage that accepts evidence. |
| Webhooks late or missing | No event in minutes | Poll already covers it. |
| Render Workflows too new or unclear | Half a day lost | Same step functions on pg-boss. Mention Workflows only if it actually runs. |
| AG Studio learning curve | Nothing usable by Nov 10 noon | Plain AG Grid table + charts from their boilerplate, still sponsor-eligible use. |
| LLM output breaks JSON | Parse errors | Structured output mode + Zod parse + one retry, then fall back to "needs manual review". |
| Someone gets sick or busy | Missed daily sync | Slices are vertical; the other two cut that person's stretch items first, not the MVP. |

---

## 12. Submission checklist (Devpost)
- [ ] Hosted demo URLs (store + dashboard) on Render
- [ ] Public GitHub repo, README with setup and run steps, MIT LICENSE shown in About
- [ ] Video under 3 minutes, public on YouTube, no copyrighted music, shows the real flow
- [ ] Description of features
- [ ] Tools used: Claude Sonnet 5.5, PayPal JS SDK v6, Orders v2, Disputes API (each endpoint), Webhooks, Agent Toolkit, AG Studio, Bryntum, Render (+ Workflows), APIMatic, Postman
- [ ] Submitted by Nov 12, 12:00 UTC

---

## 13. First things to do right now (Nov 4)
1. Everyone reads INTEGRATION.md (team standard, deliverables, the five test scenarios).
2. Mike starts the sandbox smoke test. Nothing else matters if this fails.
3. Mike scaffolds the repo, CI and `packages/shared`; Moges adds the two Vite apps.
4. All three agree section 6 on a call, then Mike commits the schema, fixtures and seed.
