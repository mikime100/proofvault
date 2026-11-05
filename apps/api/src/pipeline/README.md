# pipeline (owner: Mike)
Turns a `DisputeContext` into a `PipelineResult`. Mike's code loads the data, calls
`runPipeline`, saves the result and runs the PayPal action in `result.decision`.
Rules:
- No Prisma or PayPal imports here. ESLint fails the build if you add one.
- The LLM only comes in through `LlmClient`. Tests pass a fake.
- The score is computed by code. The LLM only writes `score.reasons`.
- Acceptance: `apps/api/test/pipeline/scenarios.test.ts` (turn each `it.todo` into a real test).
Functions (see `index.ts` for signatures):
- `buildTimeline` (`timeline.ts`): order, access events and the dispute as one list, oldest first.
  Every entry keeps its record id. IPs stay full; the api masks them on the way out.
- `checkClaims` (`claims.ts`): the guardrail. Rejects invented records, non-YYYY-MM-DD dates
  (including ISO datetimes), mismatched dates, and wrong counts.
- `scoreDispute` (`score.ts`): rules-based 0-100 for the 3 supported reasons.
- `decide` (`rules/decide.ts`): fixed-order auto-action engine (submit/accept/offer/await).
- `draftResponse` (`draft.ts`): LLM draft via LlmClient, one retry then DraftError.
- `explainScore` (`explain.ts`): LLM reasons, falls back to feature labels on failure.
- `runPipeline` (`runPipeline.ts`): orchestrates; flags no_matching_order/unsupported_reason/llm_failed.
- `renderEvidencePdf` (`pdf.ts`): builds the evidence PDF; calls maskIp on every timeline IP.
How to run the real-DeepSeek eval: pnpm --filter @proofvault/api eval:draft
