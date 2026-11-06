# ProofVault: instructions for AI coding agents

Read by any AI coding tool (Claude Code reads it through `CLAUDE.md`). Humans: the same rules apply to you.

## Read first
- `PLAN.md`: what we are building and the schedule.
- `INTEGRATION.md`: the team standard. Section 2 holds the 16 agreed contract decisions; do not contradict them.
- `docs/paypal-sandbox-notes.md`: how the PayPal sandbox actually behaves.

## Rules
- `pnpm check` must pass before any PR (typecheck, lint, tests, build).
- Only edit the folders your owner owns (INTEGRATION.md section 3). Mike: api and shared contract. Fitsum: `apps/api/src/{pipeline,agent,rules}`. Moges: `apps/web`, `apps/store`, `packages/sdk`, `docs/`.
- Anything that crosses between people is defined once in `packages/shared` (Zod schemas). Change it only through a PR all three see.
- Pipeline code (`pipeline/`, `rules/`) never imports Prisma or the PayPal client. ESLint enforces it.
- Money is `{ value: "49.00", currency: "USD" }`. Times are UTC ISO strings. IPs are masked in every API response.
- Never commit secrets. Real keys live in `apps/api/.env`, `apps/web/.env`, `apps/store/.env` (all git-ignored).
- Do not commit or push on a person's behalf unless they ask.

## Agent skills

### Issue tracker
GitHub Issues on `mikime100/proofvault`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels
The five default labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs
Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created when first needed. See `docs/agents/domain.md`.
