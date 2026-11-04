# ProofVault: Project Handoff

Context for Claude Code. Read this fully before writing any code.

## 1. Who and what
- **Developer:** Mike (Michael Biniyam), full-stack developer. Stack: React, React Native, NestJS, Node.js, PostgreSQL, TypeScript, Tailwind, Zustand, TanStack Query, Python. Prefers direct, minimal, execution-ready output.
- **Event:** PayPal AI Hackathon on Devpost. About 24,800 participants, $67,500+ in prizes.
- **Deadline:** **November 12, 2026, 8:00 PM UTC** (11:00 PM Addis Ababa time). Today is Nov 4, so about 8 days remain.
- **Hard rule:** the project must meaningfully integrate at least one PayPal technology (API, SDK or product) **and** meaningfully use AI. It must work in the PayPal sandbox.

## 2. The project
- **Name (on Devpost):** ProofVault: AI Dispute Defense for Digital Sellers
- **Pitch (on Devpost):** "Digital sellers lose PayPal disputes with no tracking number. ProofVault logs proof of access and an AI agent builds, scores and submits the evidence for you."

### Problem
People who sell digital products (courses, templates, e-books, software licenses) lose "item not received" PayPal disputes because there is no shipping tracking number to prove delivery. Responding takes hours of digging through logs, so many sellers give up and accept the loss.

### Solution
1. A small SDK or webhook records **access events** (download, login, license activation, lesson view) with time, IP, device and user agent, linked to the PayPal order ID. This works as a "tracking number for digital goods".
2. When PayPal sends a dispute webhook, an **AI agent** gathers all evidence for that order, builds a timeline, drafts a response tailored to the dispute reason, and gives a **win-probability score** with its reasons.
3. **Autonomous action within seller-set rules.** PayPal's hackathon guidance says agents should "actually transact, not just recommend". Examples:
   - Low score and small amount: the agent automatically makes an offer or accepts the claim.
   - Strong evidence: the agent can submit evidence automatically when the seller has enabled that.
   - Everything else waits for one-click seller approval.
4. Submission goes through the PayPal Disputes API `provide-evidence` endpoint, and the case is tracked until resolved.
5. Outcomes are stored, and the system learns which evidence wins for each dispute reason.
6. **Prevention (stretch):** proof-of-access receipt emails sent to buyers, and risk flags at checkout.

### AI guardrails (must implement)
- **No invented evidence.** Drafts may only use facts from the database. Each claim maps to a record, and an automatic check runs before the seller sees the draft.
- **Human approval** for anything outside the seller's auto-action rules.
- **Honest advice.** If the evidence is weak, recommend a refund or offer instead of fighting.
- **Minimal buyer data.** IP addresses are masked in the UI.

## 3. Scope
**MVP (must ship):**
- Demo digital store (sells one product type, for example a template pack) using **PayPal JS SDK v6** checkout in sandbox
- Access event tracking endpoint linked to order IDs
- Dispute webhook intake, then loading dispute details from the Disputes API
- AI evidence package (timeline), response draft, win score
- Auto-action rules, plus a one-click approval flow
- Submission through provide-evidence; resolution tracking (use the sandbox-only `require-evidence` and `adjudicate` endpoints to move test disputes along)
- Seller dashboard

**Stretch:** proof-of-access receipts, checkout risk flags, outcome-learning view, KERNEL product-page snapshots (evidence for "not as described"), Zapier alert to Slack or email.

**Out of scope:** physical goods, marketplaces, live payments, integrations with many store platforms.

## 4. PayPal integration
| Capability | Use |
|---|---|
| JS SDK v6 / Orders v2 | Demo store checkout; order ID links payment to access events |
| Disputes API: `GET /v1/customer/disputes`, `GET /v1/customer/disputes/{id}` | Dispute list and details |
| `POST /v1/customer/disputes/{id}/provide-evidence` | Submit the evidence package |
| `make-offer`, `accept-claim`, `send-message` | Autonomous or recommended strategy actions |
| `require-evidence`, `adjudicate` (**sandbox only**) | Move test disputes through their stages for the demo |
| Webhooks (`CUSTOMER.DISPUTE.CREATED`, `UPDATED`, `RESOLVED`) | Start the workflow |
| PayPal Agent Toolkit (TypeScript) / MCP server | Give the AI agent PayPal tools |

**Sandbox notes:**
- Disputes must be **enabled in the app's feature options** in the PayPal Developer Dashboard.
- To create a test dispute, a sandbox buyer pays in the demo store, then opens a dispute.
- **Day-one risk test:** create one sandbox dispute and read it through the API before building anything else. If this is blocked, ask in the PayPal Discord.
- Verify exact package names and SDK v6 usage against the current docs (developer.paypal.com, the PayPal Agent Toolkit GitHub repo).

## 5. Sponsor tools (decided)
| Tool | Role in ProofVault | Prize |
|---|---|---|
| **AG Grid / AG Studio** | Seller analytics dashboard: win rate by dispute reason, money recovered, trends. Use custom widgets and theming, plus the **Studio Agent Framework** (natural-language questions that produce widgets). They provide a boilerplate with AG Studio and PayPal set up. 45-day trial. Docs: ag-grid.com/studio/react/quick-start, /custom-widgets, /ai-agents | $5k / $2k / $1k×3 |
| **Bryntum Scheduler** | **Dispute triage board**, which Bryntum lists as one of their own example ideas: rows per dispute or handler, response deadlines, evidence readiness, warnings for cases near their deadline with no work scheduled. Trial install: `npm install @bryntum/scheduler@npm:@bryntum/scheduler-trial` | $1k×3 |
| **Render** | Hosting (required demo URL) plus **Render Workflows** for the pipeline (webhook, evidence, AI draft, submit), replacing BullMQ/Redis. $50 credits. | up to $1k credits |
| **APIMatic Context Plugin** | Install in Claude Code to get PayPal API context while building. Mention it in the submission. | $1k×3 |
| **Postman** | PayPal API collection for testing Disputes calls | none |
| KERNEL, Zapier | Stretch only | none |
| Elastic, Astropods, Channel3 | **Skipped** (no fit, or overlap) | n/a |

Sponsor prizes require meaningful use; just mentioning a sponsor does not count.

## 6. Tech stack
- **Frontend:** React (Vite or Next.js), Tailwind, AG Studio/AG Grid, Bryntum Scheduler
- **Backend:** NestJS (TypeScript)
- **Database:** PostgreSQL
- **Jobs:** Render Workflows
- **AI:** an LLM with tool calling (team to choose: Claude, OpenAI or Gemini), using the PayPal Agent Toolkit
- **Hosting:** Render

## 7. Data model
- **Seller:** id, name, email, paypal_merchant_id, auto_action_rules (JSON)
- **Product:** id, seller_id, name, type (course, file, license), price
- **Order:** id, paypal_order_id, product_id, buyer_email, amount, created_at, risk_level
- **AccessEvent:** id, order_id, type (download, login, activation, lesson_view), ip, device, user_agent, timestamp
- **Dispute:** id, paypal_dispute_id, order_id, reason, amount, status, response_due, win_score
- **EvidencePackage:** id, dispute_id, timeline (JSON), draft_response, claim_record_map (JSON), approved_by, auto_submitted, submitted_at
- **Outcome:** id, dispute_id, result (won, lost, refunded, offer_accepted), evidence_types_used

## 8. Build plan (8 days)
| Date | Goal |
|---|---|
| Nov 4–5 | Repo and Render deploy; PayPal sandbox app with Disputes enabled; **one sandbox dispute read through the API**; claim AG Grid, Bryntum and Render credits; install the APIMatic plugin; demo store with SDK v6 checkout; access event tracking |
| Nov 6–7 | Dispute pipeline on Render Workflows: webhook, load details, evidence timeline, provide-evidence, resolution tracking |
| Nov 8–9 | AI layer: Agent Toolkit tools, draft, win score, guardrail check, auto-action rules, approval flow |
| Nov 10 | AG Studio analytics dashboard (custom widgets, theme, Studio agent) and Bryntum triage board |
| Nov 11 | Polish, README, LICENSE, demo video recording |
| Nov 12 | Final checks; **submit before 8:00 PM UTC** |

Rule: get the complete flow working end to end before adding any stretch features.

## 9. Demo video (under 3 minutes)
- **0:00–0:20:** the problem (a digital seller with no tracking number)
- **0:20–0:50:** a buyer pays with PayPal and downloads; the access event appears
- **0:50–1:50:** the buyer opens a dispute; the evidence timeline, AI draft and score appear in seconds; the agent auto-acts or the seller approves; the evidence is submitted through the API
- **1:50–2:30:** the dispute resolves in sandbox; the AG Studio dashboard and Bryntum triage board
- **2:30–2:55:** architecture, PayPal APIs used, guardrails, sponsor tools

## 10. Judging criteria
- **Technological implementation:** depth of PayPal + AI use, with a real working build
- **Design:** a complete, coherent product, not a technical proof of concept
- **Potential impact:** a specific, credible solution for a real audience
- **Innovation:** how it differs from what already exists
- **Presentation:** the video shows it working end to end

## 11. Submission requirements (Devpost)
- [ ] Working project with PayPal + AI integrated
- [ ] Hosted demo URL (Render) **or** clear build and run instructions in the repo
- [ ] **Public** GitHub repo with all source code and run instructions
- [ ] Open-source **LICENSE** file, visible in the repo's About section
- [ ] Demo video **under 3 minutes**, public on YouTube, showing the app actually working; no copyrighted music
- [ ] Text description of features and functionality
- [ ] List of tools used (AI model, PayPal APIs, sponsor tools) and how each was used
- Keep the repo private while building; make it public just before submitting.

## 12. Open decisions
1. Which LLM provider to use
2. Which product the demo store sells (pick one: course, template pack, or software license)
3. Team role owners: backend/PayPal, AI agent, frontend, product/demo
4. Find one real digital seller quote or statistic for the video

## 13. First tasks for Claude Code
1. Propose the repo structure (monorepo: `apps/web`, `apps/api`, `apps/store`, `packages/sdk`) and scaffold it.
2. Write a sandbox smoke test script: OAuth token, then create an order, then list and show disputes.
3. Set up the PostgreSQL schema from section 7 (use Prisma or TypeORM, whichever fits NestJS best).
4. Deploy a hello-world API and web app to Render.
