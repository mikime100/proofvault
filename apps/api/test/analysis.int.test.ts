// #17: run the pipeline on a dispute, save the evidence package, trigger on new disputes.
// Real Postgres and the real pipeline; fake LLM and fake PayPal, so nothing leaves the machine.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DisputeDetail } from '@proofvault/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisService } from '../src/analysis/analysis.service';
import { LLM_CLIENT } from '../src/analysis/llm.provider';
import { AppModule } from '../src/app.module';
import { ApiErrorFilter } from '../src/common/api-error.filter';
import { PrismaService } from '../src/db/prisma.service';
import { PaypalClient } from '../src/paypal/paypal.client';

/** A well-behaved fake model: one claim citing the first access event listed in the prompt. */
const fakeLlm = {
  generateJson: vi.fn(async ({ prompt }: { system: string; prompt: string }) => {
    if (prompt.includes('TASK: explain')) return { reasons: ['The buyer used the course after paying.'] };
    const access = prompt.split('\n').find((l) => /^evt_\S+ \| (login|lesson_view|download)/.test(l));
    if (!access) return { claims: [], recommendation: 'refund' };
    return { claims: [{ text: 'The buyer opened the course after paying.', recordIds: [access.split(' | ')[0]] }], recommendation: 'fight' };
  }),
};
const fakePaypal = {
  getDispute: vi.fn(async (id: string) => ({
    dispute_id: id,
    create_time: '2026-11-07T10:00:00.000Z',
    update_time: '2026-11-07T10:00:00.000Z',
    reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
    status: 'WAITING_FOR_SELLER_RESPONSE',
    dispute_amount: { currency_code: 'USD', value: '49.00' },
    disputed_transactions: [{ seller_transaction_id: 'PP-CAPTURE-S1' }],
  })),
};

describe('analysis', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const analyze = (id: string) => http().post(`/disputes/${id}/analyze`).expect(200);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LLM_CLIENT)
      .useValue(fakeLlm)
      .overrideProvider(PaypalClient)
      .useValue(fakePaypal)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(() => vi.clearAllMocks());
  afterEach(async () => {
    delete process.env.AUTO_ANALYZE;
    const seeded = { disputeId: { in: ['dsp_s1', 'dsp_s4'] } };
    await prisma.evidencePackage.deleteMany({ where: seeded });
    await prisma.actionLog.deleteMany({ where: seeded });
    await prisma.dispute.updateMany({ where: { id: { in: ['dsp_s1', 'dsp_s4'] } }, data: { winScore: null } });
    const mine = { dispute: { paypalDisputeId: { startsWith: 'PP-TEST-AN-' } } };
    await prisma.evidencePackage.deleteMany({ where: mine });
    await prisma.actionLog.deleteMany({ where: mine });
    await prisma.dispute.deleteMany({ where: { paypalDisputeId: { startsWith: 'PP-TEST-AN-' } } });
  });
  afterAll(() => app.close());

  it('S1: saves the evidence package and score, serves it with IPs masked, logs the run', async () => {
    const detail = DisputeDetail.parse((await analyze('dsp_s1')).body);
    expect(detail.analysis?.decision.action).toBe('submit');
    expect(detail.analysis?.score.value).toBeGreaterThanOrEqual(75);
    expect(detail.analysis?.accepted).toHaveLength(1);
    expect(detail.dispute.winScore).toBe(detail.analysis?.score.value);
    expect(JSON.stringify(detail)).not.toMatch(/\b196\.188\.12\.7\b/);
    expect(detail.actions.at(-1)).toMatchObject({ action: 'analyze', actor: 'agent', ok: true });

    // The pipeline saw full IPs: the stored copy keeps them (only responses are masked).
    const pkg = await prisma.evidencePackage.findUniqueOrThrow({ where: { disputeId: 'dsp_s1' } });
    expect(JSON.stringify(pkg.analysis)).toContain('196.188.12.7');
  });

  it('S4: no matching order, flagged, waits for the seller, no crash', async () => {
    const detail = DisputeDetail.parse((await analyze('dsp_s4')).body);
    expect(detail.analysis?.flags).toContain('no_matching_order');
    expect(detail.analysis?.decision.action).toBe('await_approval');
  });

  it('running it again replaces the package (decision 6) and logs each run', async () => {
    await analyze('dsp_s1');
    await analyze('dsp_s1');
    expect(await prisma.evidencePackage.count({ where: { disputeId: 'dsp_s1' } })).toBe(1);
    expect(await prisma.actionLog.count({ where: { disputeId: 'dsp_s1', action: 'analyze' } })).toBe(2);
  });

  it('once evidence is submitted the package is frozen: re-analysis changes nothing and calls no LLM', async () => {
    await analyze('dsp_s1');
    await prisma.evidencePackage.update({
      where: { disputeId: 'dsp_s1' },
      data: { submittedAt: new Date(), draftResponse: 'exactly what PayPal received' },
    });
    fakeLlm.generateJson.mockClear();
    await analyze('dsp_s1');
    expect(fakeLlm.generateJson).not.toHaveBeenCalled();
    const pkg = await prisma.evidencePackage.findUniqueOrThrow({ where: { disputeId: 'dsp_s1' } });
    expect(pkg.draftResponse).toBe('exactly what PayPal received');
    expect(await prisma.actionLog.count({ where: { disputeId: 'dsp_s1', action: 'analyze' } })).toBe(1);
  });

  it('the LLM failing still saves a package: flag llm_failed, await_approval', async () => {
    fakeLlm.generateJson.mockRejectedValue(new Error('DeepSeek 503'));
    const detail = DisputeDetail.parse((await analyze('dsp_s1')).body);
    fakeLlm.generateJson.mockReset();
    expect(detail.analysis?.flags).toContain('llm_failed');
    expect(detail.analysis?.decision.action).toBe('await_approval');
  });

  it('a new dispute arriving is analysed in the background', async () => {
    process.env.AUTO_ANALYZE = 'true';
    const res = await http().post('/disputes/fetch').send({ caseId: 'PP-TEST-AN-1' }).expect(200);
    await app.get(AnalysisService).settled();
    const pkg = await prisma.evidencePackage.findUnique({ where: { disputeId: res.body.dispute.id } });
    expect(pkg).not.toBeNull();
  });

  it('auto-analysis stays off in tests unless switched on', async () => {
    await http().post('/disputes/fetch').send({ caseId: 'PP-TEST-AN-2' }).expect(200);
    await app.get(AnalysisService).settled();
    expect(fakeLlm.generateJson).not.toHaveBeenCalled();
  });
});
