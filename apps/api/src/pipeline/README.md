# pipeline (owner: Mike)

Turns a `DisputeContext` into a `PipelineResult`. Mike's code loads the data, calls
`runPipeline`, saves the result and runs the PayPal action in `result.decision`.

Rules:
- No Prisma or PayPal imports here. ESLint fails the build if you add one.
- The LLM only comes in through `LlmClient`. Tests pass a fake.
- The score is computed by code. The LLM only writes `score.reasons`.
- Acceptance: `apps/api/test/pipeline/scenarios.test.ts` (turn each `it.todo` into a real test).

Functions: see `index.ts`. Fill in what each one does here as you build it.
How to run the real-Claude eval: (add `pnpm eval:draft` here once it exists)
