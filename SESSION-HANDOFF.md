# ProofVault: session handoff (state as of Nov 8, 2026)

For a new chat or teammate picking up the work. Read this first, then `AGENTS.md`, then
`INTEGRATION.md` section 2 (the 16 agreed contract decisions). `HANDOFF.md` is the original
project brief; `PLAN.md` is the plan; `docs/paypal-sandbox-notes.md` is how PayPal really behaves.

## 1. The project in one paragraph
Hackathon entry for the **PayPal AI Hackathon on Devpost**. Deadline **Nov 12, 2026, 8:00 PM UTC**
(internal target **12:00 UTC**). Digital sellers lose "item not received" PayPal disputes because a
download has no tracking number. ProofVault logs proof of access (logins, lesson views, downloads,
with time, IP, device) from the seller's store, and when PayPal opens a dispute an AI pipeline builds
an evidence timeline, drafts claims that are each checked against database records (no invented
evidence), scores the chance of winning with code (not the LLM), decides an action within the
seller's rules, and the agent acts on PayPal by itself (submit evidence, offer, accept).

## 2. Team and ownership
| Person | GitHub | Owns |
|---|---|---|
| **Mike** (user, integrator) | `mikime100` | `apps/api` except pipeline, `packages/shared` contract, Render, PayPal app, merges PRs |
| **Fitsum** | `ellibertador00` | `apps/api/src/{pipeline,agent,rules}`: AI pipeline, DeepSeek client, eval |
| **Moges** | `Moges-Mulatu` | `apps/web` (dashboard), `apps/store`, `packages/sdk`, `docs/`, video |

Fitsum stepped away on Nov 6 and came back the same day; slice B is his again.

**How Mike wants to work:** plain, direct language, no em dashes, define terms simply. **Never commit
or push for him** unless he explicitly asks for that specific commit (then commit only that, with the
attribution line, and still do not push). Give him copy-paste commands. PowerShell 5.1 is his shell.

## 3. Live system (Render, Frankfurt, deployed from `main` via `render.yaml`)
| Service | URL |
|---|---|
| API | https://proofvault-api.onrender.com (`/health` shows the deployed commit) |
| Seller dashboard | https://proofvault-web.onrender.com |
| Demo store | https://proofvault-store.onrender.com |
| Postgres | `proofvault-db` (Render, Basic) |

Render env (set in the dashboard, never in git): `PAYPAL_CLIENT_ID/SECRET`, `PAYPAL_WEBHOOK_ID`
(**still `pending`**), `LLM_PROVIDER=deepseek`, `LLM_MODEL=deepseek-chat`, `LLM_API_KEY`,
`DEMO_PASSCODE`, `WEB_ORIGIN`, `STORE_ORIGIN`; web/store: `VITE_API_URL`, `VITE_PAYPAL_CLIENT_ID`,
`VITE_AG_STUDIO_LICENSE_KEY`, `VITE_BRYNTUM_LICENSE_KEY`. Kill switches on the API:
`AUTO_ACTIONS=false` (agent stops acting), `AUTO_ANALYZE=false`, `POLL_DISPUTES=false`.
After changing a Render env var on a static site, click Manual Deploy (built in at build time).
After changing `render.yaml`, use the Blueprint's **Manual sync** before redeploying.

The PayPal sandbox app lives on a **trusted contact's PayPal developer account** (Mike's Ethiopian
number could not sign up). That person must register the webhook (#10). LLM is **DeepSeek**, not
Claude (decided Nov 6; key Mike can pay for).

## 4. What is built and verified
- **Monorepo** (pnpm 11 workspaces): `apps/api` (NestJS + Prisma), `apps/web` (Vite React,
  shadcn/Tailwind, AG Studio, Bryntum), `apps/store` (Vite React, PayPal JS SDK **v5**, decided over
  v6), `packages/shared` (Zod contract + 5 test scenarios S1 to S5), `packages/sdk` (tracking snippet).
- **One command:** `pnpm check` (typecheck, lint, unit tests, build). `pnpm test:int` (integration,
  real local Postgres). CI runs both on every PR.
- **API routes:** checkout create/capture (`/store/orders`), `/track` (accessToken based, server
  sets time/IP), `/disputes` list/detail (IPs masked), `/webhooks/paypal` (signature verified,
  deduped), 60s poll, `/disputes/fetch` and `/disputes/sync`, `/disputes/:id/analyze`,
  `/disputes/:id/actions` (submit, offer, accept, message, escalate), `/disputes/:id/sandbox/:step`,
  `/studio/ask` (AG Studio agent relay to DeepSeek, rate-limited, no passcode). Write routes need the
  `x-demo-passcode` header.
- **Pipeline (Fitsum):** timeline (dedupes repeat clicks), claim checker guardrail, rules-based score,
  DeepSeek draft and reasons, decide, evidence PDF, `runPipeline`. `pnpm eval:draft` passes S1 to S4
  on real DeepSeek with zero invented claims.
- **Analysis + agent (Mike):** new or changed disputes are analysed in the background; the evidence
  package is **frozen once submitted**; the executor acts at most once per PayPal stage (#44), only while PayPal
  waits on the seller, only on PayPal's currently allowed actions (decision 16); outcomes recorded.
- **Dashboard (Moges):** list, detail (claims linked to records, timeline, activity), buttons gated
  by `allowedActions`, Escalate/Refresh, rules page, passcode dialog, Bryntum triage board,
  Analytics, AG Studio page (lazy-loaded).
- **Walking skeleton passed live on Render (Nov 7, #19 closed):** real buyer dispute
  `PP-R-OQT-10197028` found in 3 min, matched by capture ID, DeepSeek score 90, **agent submitted
  evidence by itself**, PayPal accepted it. That case was later refunded by an accidental local
  "Accept claim" click during testing (Moges confirmed), so it cannot be won for the demo.

## 5. Open work (GitHub Issues on `mikime100/proofvault` are the source of truth)
| # | Owner | What | Due |
|---|---|---|---|
| **#38** | Fitsum | **Evidence PDF must contain facts only** (it currently tells PayPal our win score, recommendation and auto-submit rule); honest score reasons for weak cases; plain-word dispute reason | **Nov 8, most urgent** |
| #23 | Fitsum | PayPal Agent Toolkit read tools, edge cases | Nov 9 |
| PR #42 | Moges | Studio chat fix (register `AgStudioAiModule`, all five agents). Code verified; **remove the two screenshots committed at repo root** (`image.png`, `image copy.png`, they show personal browser tabs) before merge. Then check two questions on the live site to close #26 | Nov 8 |
| #41 | Moges | Confirm dialogs before Accept claim / Make offer; local tests only on seeded cases | Nov 8 |
| #9, #14 | Moges | Already delivered; just close them | now |
| #22 | Mike | End-to-end checkpoint: needs **one case resolved in the seller's favour**. Requires a **new purchase** on the live store (each payment can be disputed once), dispute, agent submits, then sandbox adjudicate when PayPal allows it | Nov 10 |
| #10 | Mike | Register the PayPal webhook (trusted contact): URL `https://proofvault-api.onrender.com/webhooks/paypal`, events dispute created/updated/resolved, then set `PAYPAL_WEBHOOK_ID` on Render. Test with a real dispute, not the simulator | when contact is free |
| #27 | Mike | Pre-create 5+ demo disputes at different stages (escalation to claim takes about 30 min) | Nov 10 |
| #28 | all, Moges leads | Video under 3 min, README, Devpost text, tools list (Fitsum); swap the 473-byte placeholder `bonus.pdf` for a real-looking one | Nov 11 |
| Bryntum | Moges | Ask Bryntum for a hackathon licence (trial runs to Nov 21; check Devpost judging dates) | asap |

**Schedule:** feature freeze end of Nov 10; code freeze Nov 11 12:00 UTC; submit Nov 12 by 12:00
UTC. Submission: repo public, MIT licence in GitHub About, public YouTube video, Devpost text.

## 6. Hard-won facts (details in `docs/paypal-sandbox-notes.md`)
- Sandbox dispute list lags new cases by minutes; fetch by case ID works instantly.
- Disputes start `UNDER_REVIEW`, then briefly `WAITING_FOR_SELLER_RESPONSE` (about a minute; the
  agent submitted evidence in that window), then `WAITING_FOR_BUYER_RESPONSE`.
- The case's `links` are PayPal's list of allowed actions; anything else is refused.
- Escalating an inquiry makes it a claim (`CHARGEBACK` stage) after about 30 minutes.
- Sandbox `adjudicate` has not yet been accepted in any stage we reached.
- Creating orders needs `payment_source.paypal.experience_context` with `return_url` (else the
  buyer page loops); approving moves no money, capture does.
- Open a dispute as the **buyer** (`@personal.example.com`), never the seller account.

## 7. Working locally (Windows)
- Postgres 17 native (no Docker): user/db `proofvault`/`proofvault`. Seed: Prisma blocks
  `db:reset` for AI agents without explicit consent; on an empty DB run `prisma migrate deploy` and
  `prisma db seed` from `apps/api`.
- Secrets: `apps/api/.env` (git-ignored). Never paste keys into chat.
- **Start locally with `.claude/launch.json`** (API with poll, auto-analysis and agent **off**, so a
  local server never acts on real sandbox cases), and test buttons only on seeded `PP-D-...` cases.
- `gh` is at `C:\Program Files\GitHub CLI\gh.exe` (PowerShell: `& "C:\Program Files\GitHub CLI\gh.exe" ...`);
  GitHub GraphQL calls sometimes time out, the REST form (`gh api repos/...`) is more reliable.
- Production database reads from the agent are blocked by the permission classifier; Mike can run
  read-only SQL himself if needed.
- Deleting worktrees with `node_modules` hits Windows long-path errors; delete with the `\\?\` prefix
  in PowerShell, then `git worktree prune`.

## 8. Suggested next steps for the next chat
1. Review and merge PR #42 once the screenshots are removed; check the chat on the live site.
2. Chase Fitsum on #38 (PDF facts only) and review it when it lands.
3. Help Mike run #22 with a fresh purchase and dispute.
4. Plan #27 demo disputes and the #28 video script with the team.
