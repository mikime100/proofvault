// #38: PayPal reason codes never reach the timeline, the LLM prompts or the PDF as raw codes.
import { DEFAULT_RULES, SCENARIOS } from '@proofvault/shared/fixtures';
import type { LlmClient } from '@proofvault/shared';
import { describe, expect, it } from 'vitest';
import { buildTimeline, runPipeline } from '../../src/pipeline';
import { reasonLabel } from '../../src/pipeline/reason';

const RAW_CODE = /[A-Z]+_[A-Z_]+/;

describe('reasonLabel', () => {
  it('maps PayPal codes to plain English', () => {
    expect(reasonLabel('MERCHANDISE_OR_SERVICE_NOT_RECEIVED')).toBe('Item not received');
    expect(reasonLabel('UNAUTHORISED')).toBe('Unauthorised transaction');
  });

  it('turns an unknown code into plain words instead of echoing it', () => {
    expect(reasonLabel('SOME_NEW_REASON')).toBe('Some new reason');
  });
});

describe('no raw reason code', () => {
  it('in any timeline summary', () => {
    for (const s of SCENARIOS) {
      for (const e of buildTimeline(s.context).entries) expect(e.summary).not.toMatch(RAW_CODE);
    }
  });

  it('in the dispute-opened summary, which reads in plain words', () => {
    const opened = buildTimeline(SCENARIOS[0]!.context).entries.find((e) => e.type === 'dispute_opened')!;
    expect(opened.summary).toBe('Buyer opened a PayPal dispute: item not received');
  });

  it('in the draft or explain prompts sent to the LLM', async () => {
    const prompts: string[] = [];
    const llm: LlmClient = {
      async generateJson({ system, prompt }) {
        prompts.push(system, prompt);
        return prompt.includes('TASK: draft')
          ? { recommendation: 'refund', claims: [] }
          : { reasons: ['The buyer never opened the course.'] };
      },
    };
    for (const s of SCENARIOS.filter((x) => ['S1', 'S2', 'S3'].includes(x.id))) {
      await runPipeline(s.context, DEFAULT_RULES, { llm });
    }
    expect(prompts.some((p) => p.includes('TASK: explain'))).toBe(true);
    // Example placeholders in the instructions are allowed; codes from the data are not.
    for (const p of prompts) expect(p).not.toContain('MERCHANDISE_OR_SERVICE');
  });
});
