# ProofVault: Team Standard and Deliverables

The rules all three of us follow, and exactly what each person hands to Mike for integration.

**Nov 6:** Fitsum stepped away and came back the same day; slice B is his again. #6 (timeline and claim checker) was built by Mike in the meantime and is on `main`. Analytics and triage endpoints stay cut (#24). Current owners and dates live on the GitHub Issues board.
Read this before writing code. It goes with PLAN.md.

| Person | Slice | Role in integration |
|---|---|---|
| **Mike** (A) | PayPal + backend core | Integrator. Owns `main`, the shared contract, CI and Render. |
| **Fitsum** (B) | AI agent + pipeline | Delivers the pipeline module. |
| **Moges** (C) | Frontend + demo | Delivers store, dashboard, SDK, video. |

---

## 1. The one idea that makes integration smooth

**Everything that crosses between two people is defined once, in `packages/shared`, as a Zod schema** (Zod checks the shape of data while the code runs and also gives us TypeScript types). Both sides test against that same schema.

So:
- Mike's API tests check that every response passes its schema.
- Moges's API client checks every response it receives with the same schema.
- Fitsum's pipeline functions take and return those same types.

If someone changes a shape, the other two get a TypeScript error the same day, not a broken demo on Nov 11.

On top of that, we share **five fixed test scenarios** (section 5). Every slice must give the expected result on all five. If all three pass them alone, they will pass together.

---

## 2. Contract decisions (agreed Nov 4)

Settled by grilling the contract. Code already matches. Change only through a PR all three see.

| # | Decision |
|---|---|
| 1 | **Matching a dispute to an order:** our order id is sent to PayPal as `custom_id` when the order is created. Match on `paypalCaptureId` first, `custom_id` second. `paypalCaptureId` is null only before capture. |
| 2 | **Tracking is tied to the order's private `accessToken`**, not the public PayPal order id. The server sets event time and IP (from `X-Forwarded-For`); the browser never sends them. |
| 3 | **`decide()` rule order is fixed** (first match wins): (1) unsupported reason or no matching order: `await_approval`; (2) auto-submit on and score >= `autoSubmitMinScore`: `submit`; (3) score < `weakScoreBelow` and amount <= `autoAcceptMaxAmount`: `accept`; (4) score < `weakScoreBelow` and amount <= `autoOfferMaxAmount`: `offer` at `offerPercent`; (5) otherwise `await_approval`. `weakScoreBelow` (default 40) is a seller rule. |
| 4 | **Only three reasons are scored** (`SUPPORTED_REASONS`): not received, not as described, unauthorised. Any other reason goes to `await_approval` with flag `unsupported_reason`. |
| 5 | **Claim checker rule:** every claim cites at least one record from this order; any date in it matches a cited record's date; any count equals the number of cited records of that type, or their distinct days. Everything else is accepted on its citations. |
| 6 | **One evidence package per dispute.** Re-running the analysis replaces it; each run is logged as an `analyze` action. |
| 7 | **USD only** for the whole hackathon. |
| 8 | **Buyer access:** after payment the store shows a private link `/learn?t=<token>` and saves the token in local storage. A `login` event fires once per new browser session. Receipt email with the link stays stretch. |
| 9 | **Auto-actions run at most once per dispute:** only on the first analysis, only with no earlier agent action, only while status is `WAITING_FOR_SELLER_RESPONSE`. Later runs update draft and score only; further actions need a seller click. Enforced by Mike's executor, not by `decide()`. |
| 10 | **Rejected offer:** the dispute drops to `await_approval`. Never a second automatic offer. |
| 11 | **Dates inside claims are `YYYY-MM-DD` only.** The checker rejects any other date format. Dashboard and PDF format dates for display. |
| 12 | **`provide-evidence` payload:** one evidence item per submission: response text as notes, evidence PDF as the document, evidence type matched to the dispute reason (exact PayPal names checked by Mike before Nov 6). |
| 13 | **No automatic action at the deadline.** Only warnings: Bryntum row turns red, dashboard shows a "due in under 48h" badge. |
| 14 | **Demo passcode on writes:** every route that changes something (approve, submit, offer, accept, sandbox steps, rules) needs header `x-demo-passcode` (`DEMO_PASSCODE_HEADER`) to match the server's `DEMO_PASSCODE`. Reads stay open. Mike puts `@UseGuards(PasscodeGuard)` on write routes; the dashboard asks for the passcode once and sends it on every write. |
| 15 | **Production database:** only the demo seller and product (`SEED_SCENARIOS=false`, run on every deploy). Real sandbox disputes fill the rest. The five scenarios exist only in local dev and CI. |

---

## 3. Shared standard (everyone)

### Tools (same versions for all)
- Node 22 LTS, pnpm 11, Docker Desktop (for local Postgres)
- TypeScript strict mode in every package
- **Vitest** for every test (one test runner across the repo, Mike sets it up for NestJS too)
- ESLint + Prettier with the repo config. Do not change the config in your own PR.
- Any AI coding tool is fine. `AGENTS.md` holds the rules every tool reads (Claude Code reads it through `CLAUDE.md`). Claude Code users also get the `mattpocock-skills` plugin, enabled in `.claude/settings.json`: `tdd` for pipeline logic, `code-review` before every PR, `diagnosing-bugs` for anything broken. Mike uses `to-tickets` and `triage` to run the GitHub Issues board.

### One command decides if code is ready
```bash
pnpm check
```
Runs typecheck, lint, tests and build for the whole repo. **If `pnpm check` fails, the PR is not ready.** CI runs the same command on every PR, with a real Postgres.

### Local setup (same for all)
```bash
pnpm install
docker compose up -d
pnpm db:reset
pnpm dev
```
`db:reset` wipes the local database, runs migrations and loads the seed. Everyone works on the same seed data, so "it works on my machine" means it works on everyone's.

### Folder ownership
You only edit your own folders. Need a change somewhere else? Ask the owner, or open a PR and tag them.

| Owner | Folders |
|---|---|
| Mike | `apps/api/src/{paypal,store,tracking,webhooks,disputes,analytics,triage,db}`, `apps/api/prisma`, `packages/shared` (others propose, Mike merges), `scripts/`, `render.yaml`, `.github/` |
| Fitsum | `apps/api/src/{pipeline,agent,rules}`, `apps/api/test/pipeline` |
| Moges | `apps/web`, `apps/store`, `packages/sdk`, `docs/` |

### Data rules (these cause most integration bugs, so they are fixed)
| Thing | Rule | Example |
|---|---|---|
| Time | ISO 8601 string, always UTC | `"2026-11-05T14:03:00Z"` |
| Money | Object, value as a **string** with 2 decimals (same as PayPal) | `{ "value": "29.00", "currency": "USD" }` |
| Our IDs | cuid strings from Prisma | `"clx9a..."` |
| PayPal IDs | Separate fields, never mixed with ours | `paypalOrderId`, `paypalDisputeId` |
| Dispute reason | PayPal's own enum, unchanged | `MERCHANDISE_OR_SERVICE_NOT_RECEIVED` |
| IP address | Full in the database, **masked in every API response** | `"196.188.x.x"` |
| Errors from the API | Always this shape | `{ "error": { "code": "DISPUTE_NOT_FOUND", "message": "..." } }` |
| Logs | JSON (pino), include `disputeId` or `orderId` when there is one | |

### Secrets
Never in git. Each app has a `.env.example` listing every variable with a fake value. Real values: `apps/api/.env` for the api, `apps/web/.env` and `apps/store/.env` for the frontends (all ignored by git) and Render env settings. Mike shares the sandbox keys privately.

### Branches and PRs
- Branch names: `mike/...`, `fitsum/...`, `moges/...`
- Small PRs, merged at least once a day. A branch older than 2 days is a warning sign.
- Every PR fills in the template (section 7).
- Mike merges. Mike's own PRs get a quick look from Fitsum or Moges.

---

## 4. Testing standard

| Level | What | Who | Tool |
|---|---|---|---|
| Unit | Pure logic: timeline, claim check, score, rules engine, SDK payload | Fitsum, Moges (SDK) | Vitest |
| Contract | API responses and pipeline outputs pass the shared Zod schemas | Mike (API side), Fitsum (pipeline side), Moges (client side, at runtime) | Vitest + Zod |
| Integration | API against real local Postgres: webhook duplicates, `/track`, disputes endpoints | Mike | Vitest + supertest |
| AI eval | Real LLM (DeepSeek) call on the 5 scenarios, checks the rules in section 5 | Fitsum | `pnpm eval:draft` script |
| Click path | Manual run of the demo flow on staging | Moges writes it, Mike runs it at each checkpoint | Checklist in `docs/click-path.md` |

What we do **not** test: UI components, CSS, PayPal itself. The click path covers the UI.

**No network in unit or contract tests.** The LLM and PayPal are passed in as interfaces so tests use fakes. Only `pnpm eval:draft` and the smoke test hit real services.

---

## 5. The five shared scenarios (golden fixtures)

These live in `packages/shared/fixtures/` as JSON, and the seed loads the same data into Postgres. Mike writes them on Nov 4. **They are the acceptance test for everyone.**

| ID | Situation | Expected score | Expected decision (default rules) | Must also be true |
|---|---|---|---|---|
| **S1 strong** | `MERCHANDISE_OR_SERVICE_NOT_RECEIVED`, $49. Bought, logged in same IP as checkout, viewed 4 of 4 lessons over 3 days, downloaded PDF. | 75 or more | `submit` (auto, if auto-submit is on) | Draft mentions lessons and download, each claim links records |
| **S2 medium** | `MERCHANDISE_OR_SERVICE_NOT_RECEIVED`, $49. One login, one lesson view, different IP. | 40 to 74 | `await_approval` | Reasons say evidence is partial |
| **S3 weak** | `MERCHANDISE_OR_SERVICE_NOT_RECEIVED`, $9. Purchase only, no access events. | Under 40 | `accept` (amount under auto-accept limit) | Recommendation is `refund`, not `fight` |
| **S4 no match** | Dispute whose PayPal order is not in our database | n/a | `await_approval` | Flagged "no matching order", pipeline does not crash |
| **S5 guardrail trap** | Same data as S2, but the fake LLM returns 3 claims: one good, one citing a record that does not exist, one saying "5 lessons" when there was 1 | n/a | n/a | Checker keeps 1 claim, rejects 2, each with a reason |

Default seller rules for the scenarios:
```json
{ "autoSubmitMinScore": 75, "autoSubmitEnabled": true, "weakScoreBelow": 40,
  "autoAcceptMaxAmount": "15.00", "autoOfferMaxAmount": "30.00", "offerPercent": 50 }
```

---

## 6. What each person delivers to Mike

### Fitsum delivers: the pipeline module

**What it is:** code in `apps/api/src/pipeline`, `agent`, `rules` that turns dispute data into a checked evidence package and a decision. **Pipeline code never calls Prisma or PayPal directly.** The API layer loads the data and passes it in; the pipeline returns results; the API layer saves them and runs the PayPal call. This keeps the pipeline fully testable without the database or the sandbox.

**Interfaces (types in `packages/shared`):**
```ts
buildTimeline(input: DisputeContext): Timeline
draftResponse(timeline: Timeline, reason: DisputeReason, llm: LlmClient): Promise<Draft>
checkClaims(draft: Draft, timeline: Timeline): CheckResult
scoreDispute(timeline: Timeline, reason: DisputeReason): Score
explainScore(score: Score, llm: LlmClient): Promise<string[]>
decide(score: Score, amount: Money, rules: SellerRules): Decision
renderEvidencePdf(pkg: EvidencePackage): Promise<Buffer>
runPipeline(input: DisputeContext, rules: SellerRules, deps: { llm: LlmClient }): Promise<PipelineResult>
```
`DisputeContext` = dispute + order (or null) + access events. `PipelineResult` = timeline + accepted claims + rejected claims + final response text + score + reasons + decision.

**Acceptance (Mike checks all of these before closing the tickets):**
- [ ] All five scenarios pass as unit tests with a fake LLM
- [ ] `pnpm eval:draft` with the real LLM (DeepSeek): S1 to S4 give the expected decision, zero invented claims get through, output printed as a pass/fail table
- [ ] Same input twice gives the same score (score is code, not the LLM)
- [ ] The LLM returning broken JSON: one retry, then `Decision = await_approval` with reason "manual review", no crash
- [ ] Evidence PDF opens, shows timeline with masked IPs, under 5 MB (PayPal upload limit, verify in docs)
- [ ] No Prisma or PayPal imports inside `pipeline/`, `rules/`
- [ ] Short `apps/api/src/pipeline/README.md`: what each function does, how to run the eval

**Delivery dates:**
| Date | Deliverable |
|---|---|
| Nov 6 EOD | `buildTimeline`, `checkClaims`, tests for S4, S5 (#6) |
| Nov 8 EOD | `draftResponse`, `eval:draft` (#11); `scoreDispute`, `explainScore`, PDF (#12); `decide`, `runPipeline` (#16) |
| Nov 8 noon | Render Workflows running, or decision to fall back to in-process (#20) |
| Nov 9 EOD | Agent Toolkit tools, edge cases (#23) |
| Nov 10 | AG Studio agent help with Moges (#26) |
| Nov 11 | Tools list text for Devpost (AI model, how each PayPal API is used) |

### Moges delivers: store, dashboard, SDK, video

**What it is:** two static web apps and the tracking snippet, plus all demo material. Moges never talks to PayPal's REST API directly; only the store's browser checkout uses the PayPal JS SDK. Everything else goes through Mike's API.

**Rules for Moges's code:**
- One API client file per app (`src/api.ts`). Every call parses the response with the shared Zod schema. If parsing fails, show a toast and log it, so a contract break is loud.
- Write calls send the `x-demo-passcode` header. Ask for the passcode once (a small dialog), keep it in local storage.
- Until Mike's endpoint for a screen exists, the client returns the matching JSON from `packages/shared/fixtures` (switch: `VITE_USE_FIXTURES=true`). Same shapes, so switching to the real API is one env change.
- shadcn/ui, Tailwind, lucide, Sonner, TanStack Query. AG Studio and Bryntum only where planned.

**SDK interface (`packages/sdk`):**
```ts
ProofVault.init({ apiUrl, accessToken })   // private token from capture, not the PayPal order id
ProofVault.track(type: 'login' | 'lesson_view' | 'download' | 'activation', meta?: Record<string, string>)
```
Sends `POST /track`. The server sets the time and IP, never the browser. Under 2 KB, no dependencies, never throws (a tracking failure must not break the buyer's page).

**Screens and what each must show:**
| App | Screen | Must show / do |
|---|---|---|
| store | Course page | Price, PayPal button (SDK v6), "access is logged" line |
| store | After payment | Private link `/learn?t=<token>` shown and token saved in local storage; `login` fired once per browser session |
| store | Lessons | Lessons 1 to 4, bonus PDF download, each fires `track` |
| web | Dispute list | Reason, amount, status, deadline, score, decision badge, "due in under 48h" badge |
| web | Dispute detail | Timeline, each claim with its linked records highlighted, "removed by guardrail" box, score + reasons, action buttons |
| web | Approval | One click approve/submit, offer, accept; result toast; action log updates |
| web | Rules | Edit the seller rules JSON fields as a form |
| web | Sandbox controls | Buttons: sync now, require evidence, adjudicate; a "fetch by case ID" box (`PP-...`) |
| web | Triage | Bryntum board: disputes against deadlines, warning colour near deadline |
| web | Analytics | AG Studio: win rate by reason, money recovered, Studio agent question box |

**Acceptance (Mike checks):**
- [ ] `pnpm check` passes, both apps build as static sites
- [ ] Every screen works on fixtures, then on the real API with `VITE_USE_FIXTURES=false`
- [ ] All five scenarios display correctly in the dashboard (S4 shows "no matching order", S5 shows the rejected claims)
- [ ] SDK unit test: payload shape, and it does not throw when the API is down
- [ ] No IP shown unmasked anywhere
- [ ] `docs/click-path.md`: numbered steps of the demo flow, each with what you should see

**Delivery dates:**
| Date | Deliverable |
|---|---|
| Nov 4 EOD | Monorepo apps building, hello-world on Render (with Mike) |
| Nov 5 EOD | Store complete on fixtures, SDK with test |
| Nov 6 EOD | Dispute list + detail on fixtures |
| Nov 7 EOD | Approval, rules, action log, sandbox controls, click path doc v1 |
| Nov 9 EOD | Bryntum triage, seller statistic with source |
| Nov 10 EOD | AG Studio analytics |
| Nov 11 | Video (under 3 min), README, Devpost text |

### Mike delivers (to Fitsum and Moges)
They are blocked without these, so they come first.
| Date | Deliverable |
|---|---|
| Nov 4 to 5 (done) | Repo scaffold, `pnpm check`, CI, `docker compose`, `packages/shared` schemas and types, 5 scenario fixtures + seed, sandbox smoke test passed |
| Nov 6 | Read endpoints for disputes on seed data (#5) |
| Nov 7 | Render staging URLs (#2), `/store/orders` + capture (#3), `/track` (#4), webhook + poll + fetch by case ID (#10) |
| Nov 9 | `provide-evidence`, sandbox stage calls, walking skeleton on staging (#18, #19) |
| Nov 10 | `make-offer`, `accept-claim`, action executor (#21); real end to end (#22) |

No analytics or triage endpoints (cut Nov 6): the Bryntum board and AG Studio compute their numbers in the browser from the dispute list.

---

## 7. PR template (`.github/pull_request_template.md`)
```md
## What
One or two lines.

## Contract
- [ ] No change to packages/shared
- [ ] Changed packages/shared (describe, tag the other two)

## Checks
- [ ] `pnpm check` passes
- [ ] Scenarios S1 to S5 still pass (or not affected)
- [ ] No secrets, no unmasked IPs
- [ ] Only my folders touched (or owner tagged)

## How to see it
Command, URL or screen to look at.
```

---

## 8. How Mike integrates

1. **Daily, 8:00 PM EAT:** 15-minute sync. Each person says what is merged, what is blocked, what merges tomorrow.
2. **Merge:** pull the branch, `pnpm check`, read the diff, merge. Bounce it back if any acceptance box is unticked; say which box.
3. **After each merge:** `main` auto-deploys to Render staging. Mike runs the 2-minute smoke (`/health`, open the dashboard, open one dispute).
4. **Checkpoints, full click path on staging:**
   - **Nov 6 EOD:** walking skeleton, seeded dispute from intake to submit
   - **Nov 8:** real sandbox dispute end to end
   - **Nov 10 EOD:** feature freeze, all screens done
   - **Nov 11 12:00 UTC:** code freeze
5. **Contract change:** propose in a PR to `packages/shared`, all three see it, Mike merges. No silent changes.
6. **Blocked for more than 2 hours:** say so in the group chat right away, do not wait for the evening sync.
