// #21: the agent acts on its own decision (decisions 9, 10, 16) and outcomes are recorded.
// Real Postgres and the real pipeline; fake LLM and fake PayPal.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LLM_CLIENT } from '../../src/analysis/llm.provider';
import { AppModule } from '../../src/app.module';
import { ApiErrorFilter } from '../../src/common/api-error.filter';
import { PrismaService } from '../../src/db/prisma.service';
import { outcomeOf } from '../../src/executor/outcome.service';
import { PaypalClient, PaypalError } from '../../src/paypal/paypal.client';

const fakeLlm = {
  generateJson: vi.fn(async ({ prompt }: { system: string; prompt: string }) => {
    if (prompt.includes('TASK: explain')) return { reasons: ['Example reason.'] };
    const access = prompt.split('\n').find((l) => /^evt_\S+ \| (login|lesson_view|download)/.test(l));
    if (!access) return { claims: [], recommendation: 'refund' };
    return { claims: [{ text: 'The buyer opened the course.', recordIds: [access.split(' | ')[0]] }], recommendation: 'fight' };
  }),
};

/** What PayPal says about each case when it is reloaded: status, links, outcome. */
const paypalState = new Map<string, { status: string; links?: string[]; outcome?: string }>();
/** Like real PayPal: every reload names the payment, so intake can match the order. */
const captureOf = new Map<string, string>();
const ok = async () => ({ links: [] });
const fakePaypal = {
  provideEvidence: vi.fn(ok),
  makeOffer: vi.fn(ok),
  acceptClaim: vi.fn(ok),
  sendMessage: vi.fn(ok),
  escalate: vi.fn(ok),
  getDispute: vi.fn(async (id: string) => {
    const s = paypalState.get(id) ?? { status: 'UNDER_REVIEW' };
    return {
      dispute_id: id,
      create_time: '2026-11-07T10:00:00.000Z',
      update_time: '2026-11-07T11:00:00.000Z',
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      status: s.status,
      dispute_amount: { currency_code: 'USD', value: '49.00' },
      disputed_transactions: [{ seller_transaction_id: captureOf.get(id) ?? 'UNKNOWN' }],
      ...(s.links ? { links: s.links.map((rel) => ({ rel })) } : {}),
      ...(s.outcome ? { dispute_outcome: { outcome_code: s.outcome } } : {}),
    };
  }),
};

describe('auto-action executor', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let n = 0;

  /** A dispute on a seeded order. ord_s1 = strong evidence (submit); ord_s3 = no access (accept / offer). */
  const newDispute = async (order: 'ord_s1' | 'ord_s3', opts: { amount?: string; status?: string; raw?: object } = {}) => {
    const id = `dsp_test_ex_${n++}`;
    const paypalDisputeId = `PP-TEST-EX-${n}`;
    captureOf.set(paypalDisputeId, order === 'ord_s1' ? 'PP-CAPTURE-S1' : 'PP-CAPTURE-S3');
    await prisma.dispute.create({
      data: {
        id,
        paypalDisputeId,
        orderId: order,
        reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
        amount: opts.amount ?? (order === 'ord_s3' ? '9.00' : '49.00'),
        status: opts.status ?? 'WAITING_FOR_SELLER_RESPONSE',
        ...(opts.raw ? { raw: opts.raw } : {}),
      },
    });
    return { id, paypalDisputeId };
  };
  const analyze = (id: string) => request(app.getHttpServer()).post(`/disputes/${id}/analyze`).expect(200);
  const logs = (id: string) =>
    prisma.actionLog.findMany({ where: { disputeId: id, action: { not: 'analyze' } }, orderBy: { createdAt: 'asc' } });

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
  beforeEach(() => {
    vi.clearAllMocks();
    paypalState.clear();
    process.env.AUTO_ACTIONS = 'true';
  });
  afterEach(() => {
    delete process.env.AUTO_ACTIONS;
  });
  afterAll(async () => {
    const mine = { disputeId: { startsWith: 'dsp_test_ex_' } };
    await prisma.outcome.deleteMany({ where: mine });
    await prisma.actionLog.deleteMany({ where: mine });
    await prisma.evidencePackage.deleteMany({ where: mine });
    await prisma.dispute.deleteMany({ where: { id: { startsWith: 'dsp_test_ex_' } } });
    await app.close();
  });

  it('strong evidence, waiting on the seller: the agent submits evidence once, logged as the agent', async () => {
    const { id } = await newDispute('ord_s1');
    await analyze(id);
    expect(fakePaypal.provideEvidence).toHaveBeenCalledOnce();
    expect((await logs(id)).map((l) => [l.action, l.actor, l.ok])).toEqual([['submit', 'agent', true]]);
  });

  it('re-analysis after the agent acted takes no second action', async () => {
    const { id } = await newDispute('ord_s1');
    await analyze(id);
    await analyze(id);
    expect(fakePaypal.provideEvidence).toHaveBeenCalledOnce();
  });

  it('weak evidence on a $9 case: the agent accepts the claim', async () => {
    const { id } = await newDispute('ord_s3');
    await analyze(id);
    expect(fakePaypal.acceptClaim).toHaveBeenCalledOnce();
  });

  it('weak evidence on a $25 case: one offer at 50%, and never a second one (decision 10)', async () => {
    const { id } = await newDispute('ord_s3', { amount: '25.00' });
    await analyze(id);
    expect(fakePaypal.makeOffer).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ amount: '12.50' }));
    // Buyer rejects; the case waits on the seller again and is re-analysed.
    await prisma.dispute.update({ where: { id }, data: { status: 'WAITING_FOR_SELLER_RESPONSE' } });
    await analyze(id);
    expect(fakePaypal.makeOffer).toHaveBeenCalledOnce();
  });

  it('a seller already acted: the agent stays out', async () => {
    const { id } = await newDispute('ord_s1');
    await prisma.actionLog.create({ data: { disputeId: id, action: 'message', actor: 'seller', ok: true, detail: 'seller wrote' } });
    await analyze(id);
    expect(fakePaypal.provideEvidence).not.toHaveBeenCalled();
  });

  it('not waiting on the seller: no action', async () => {
    const { id } = await newDispute('ord_s1', { status: 'UNDER_REVIEW' });
    await analyze(id);
    expect(fakePaypal.provideEvidence).not.toHaveBeenCalled();
  });

  it('PayPal does not allow it yet (decision 16): the agent waits, then acts on a later analysis', async () => {
    const { id, paypalDisputeId } = await newDispute('ord_s1', { raw: { links: [{ rel: 'self' }] } });
    paypalState.set(paypalDisputeId, { status: 'WAITING_FOR_SELLER_RESPONSE', links: ['self', 'escalate'] });
    await analyze(id);
    expect(fakePaypal.provideEvidence).not.toHaveBeenCalled();
    expect(await logs(id)).toHaveLength(0);

    paypalState.set(paypalDisputeId, { status: 'WAITING_FOR_SELLER_RESPONSE', links: ['self', 'provide_evidence'] });
    await analyze(id);
    expect(fakePaypal.provideEvidence).toHaveBeenCalledOnce();
  });

  it('PayPal refuses: the failed attempt is logged and the agent never retries', async () => {
    const { id } = await newDispute('ord_s1');
    fakePaypal.provideEvidence.mockRejectedValueOnce(new PaypalError(422, 'ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE', 'no'));
    await analyze(id);
    await analyze(id);
    expect(fakePaypal.provideEvidence).toHaveBeenCalledOnce();
    expect((await logs(id)).map((l) => [l.action, l.ok])).toEqual([['submit', false]]);
  });

  it('kill switch AUTO_ACTIONS=false: analysis runs, nothing is done', async () => {
    process.env.AUTO_ACTIONS = 'false';
    const { id } = await newDispute('ord_s1');
    await analyze(id);
    expect(fakePaypal.provideEvidence).not.toHaveBeenCalled();
  });

  describe('outcomes', () => {
    it('a case resolved in the seller favour is recorded as won', async () => {
      process.env.RECORD_OUTCOMES = 'true';
      paypalState.set('PP-R-TEST-OUT-1', { status: 'RESOLVED', outcome: 'RESOLVED_SELLER_FAVOUR' });
      const res = await request(app.getHttpServer()).post('/disputes/fetch').send({ caseId: 'PP-R-TEST-OUT-1' }).expect(200);
      await vi.waitFor(async () => {
        const outcome = await prisma.outcome.findUnique({ where: { disputeId: res.body.dispute.id } });
        expect(outcome?.result).toBe('won');
      });
      delete process.env.RECORD_OUTCOMES;
      await prisma.outcome.deleteMany({ where: { disputeId: res.body.dispute.id } });
      await prisma.dispute.delete({ where: { id: res.body.dispute.id } });
    });

    it('maps PayPal outcome codes and our own actions', () => {
      expect(outcomeOf('RESOLVED_SELLER_FAVOUR', new Set())).toBe('won');
      expect(outcomeOf('CANCELED_BY_BUYER', new Set())).toBe('won');
      expect(outcomeOf('RESOLVED_BUYER_FAVOUR', new Set(['accept']))).toBe('refunded');
      expect(outcomeOf('RESOLVED_WITH_PAYOUT', new Set(['offer']))).toBe('offer_accepted');
      expect(outcomeOf('RESOLVED_BUYER_FAVOUR', new Set())).toBe('lost');
    });
  });
});
