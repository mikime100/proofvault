// Mike's executor: runs the pipeline's Decision against PayPal (INTEGRATION.md section 2, rows 9, 10, 12).
// Integration tests: real Postgres, fake PayPal client.
import { describe, it } from 'vitest';

describe('action executor', () => {
  it.todo('auto-runs the decision on the first analysis when status is WAITING_FOR_SELLER_RESPONSE');
  it.todo('does not auto-run when an earlier agent action exists on the dispute');
  it.todo('does not auto-run when status is anything other than WAITING_FOR_SELLER_RESPONSE');
  it.todo('re-analysis updates draft and score but takes no action');
  it.todo('rejected offer moves the dispute to await_approval, never a second auto offer');
  it.todo('provide-evidence sends exactly one evidence item: notes + PDF + reason-matched type');
  it.todo('every action, success or failure, writes an ActionLog row');
});
