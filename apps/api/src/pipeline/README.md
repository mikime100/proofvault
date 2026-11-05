# pipeline (owner: Fitsum)

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
- `checkClaims` (`claims.ts`): the guardrail. A claim is rejected, with a plain reason, if it cites
  no records, cites a record that is not in this timeline, writes a date any way other than
  YYYY-MM-DD, names a date no cited record is from, or states a count ("4 lessons", "3 days")
  that the cited records do not show. Everything else in the text is accepted on its citations.
- Not built yet: `draftResponse`, `scoreDispute`, `explainScore`, `decide`, `renderEvidencePdf`, `runPipeline`.
How to run the real-Claude eval: (add `pnpm eval:draft` here once it exists)
