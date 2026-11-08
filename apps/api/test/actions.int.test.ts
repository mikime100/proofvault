// PayPal actions for #18 and #21: submit evidence, offer, accept, message, sandbox steps.
// Real Postgres, fake PayPal. The PDF comes from the pipeline (Fitsum's #12), so it is mocked here.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { ActionLogEntry, DEMO_PASSCODE_HEADER } from '@proofvault/shared';
import { disputeDetailFixtures } from '@proofvault/shared/fixtures';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ApiErrorFilter } from '../src/common/api-error.filter';
import { PrismaService } from '../src/db/prisma.service';
import { PaypalClient, PaypalError } from '../src/paypal/paypal.client';
import { renderEvidencePdf } from '../src/pipeline';

vi.mock('../src/pipeline', async (orig) => ({
  ...(await orig<typeof import('../src/pipeline')>()),
  renderEvidencePdf: vi.fn(async () => Buffer.from('%PDF-1.4 test')),
}));

const fakePaypal = {
  provideEvidence: vi.fn(async () => ({ links: [] })),
  makeOffer: vi.fn(async () => ({ links: [] })),
  acceptClaim: vi.fn(async () => ({ links: [] })),
  sendMessage: vi.fn(async () => ({ links: [] })),
  requireEvidence: vi.fn(async () => ({ links: [] })),
  adjudicate: vi.fn(async () => ({ links: [] })),
  escalate: vi.fn(async () => ({ links: [] })),
  // Refresh before and after an action. Cases whose id contains LIMITED only allow a message,
  // like a real case right after escalating; the rest come back without links (no restriction known).
  // Cases whose id contains CLAIM are in the claim stage with sandbox adjudicate allowed (Nov 8, PP-R-HUT-10197163).
  getDispute: vi.fn(async (id: string) => ({
    ...(id.includes('LIMITED') ? { links: [{ rel: 'self' }, { rel: 'send_message' }] } : {}),
    ...(id.includes('CLAIM')
      ? {
          dispute_life_cycle_stage: 'CHARGEBACK',
          links: [{ rel: 'self' }, { rel: 'adjudicate' }, { rel: 'require_evidence' }, { rel: 'provide_supporting_info' }],
        }
      : {}),
    dispute_id: id,
    create_time: '2026-11-06T10:00:00.000Z',
    update_time: '2026-11-06T11:00:00.000Z',
    reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
    status: 'UNDER_REVIEW',
    dispute_amount: { currency_code: 'USD', value: '49.00' },
    disputed_transactions: [{ seller_transaction_id: 'PP-CAPTURE-S1' }],
  })),
};

describe('dispute actions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  let n = 0;

  const newDispute = async (opts: { limited?: boolean; claim?: boolean } = {}) => {
    const id = `dsp_test_act_${n++}`;
    const kind = opts.limited ? 'LIMITED-' : opts.claim ? 'CLAIM-' : '';
    await prisma.dispute.create({
      data: {
        id,
        paypalDisputeId: `PP-TEST-ACT-${kind}${n}`,
        // A saved PayPal copy, so the action reloads it and reads the current links.
        ...(opts.limited || opts.claim ? { raw: { links: [{ rel: 'self' }] } } : {}),
        orderId: 'ord_s1',
        reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
        amount: '49.00',
        status: 'WAITING_FOR_SELLER_RESPONSE',
      },
    });
    return id;
  };
  const withPackage = async (disputeId: string) => {
    const analysis = disputeDetailFixtures.dsp_s1!.analysis!;
    await prisma.evidencePackage.create({
      data: { disputeId, analysis: analysis as unknown as Prisma.InputJsonValue, draftResponse: analysis.responseText },
    });
  };
  const act = (id: string, body: object) => http().post(`/disputes/${id}/actions`).send(body);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaypalClient)
      .useValue(fakePaypal)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete process.env.DEMO_PASSCODE;
    delete process.env.PAYPAL_ENV;
  });
  afterAll(async () => {
    const mine = { disputeId: { startsWith: 'dsp_test_act_' } };
    await prisma.actionLog.deleteMany({ where: mine });
    await prisma.evidencePackage.deleteMany({ where: mine });
    await prisma.dispute.deleteMany({ where: { id: { startsWith: 'dsp_test_act_' } } });
    await app.close();
  });

  describe('submit evidence', () => {
    it('sends one item (notes + PDF, reason-matched type), logs it, marks the package submitted, refreshes status', async () => {
      const id = await newDispute();
      await withPackage(id);
      const res = await act(id, { type: 'submit' }).expect(200);

      const entry = ActionLogEntry.parse(res.body);
      expect(entry).toMatchObject({ action: 'submit', actor: 'seller', ok: true });
      expect(fakePaypal.provideEvidence).toHaveBeenCalledWith(
        expect.stringMatching(/^PP-TEST-ACT-/),
        expect.objectContaining({ evidenceType: 'PROOF_OF_FULFILLMENT', notes: disputeDetailFixtures.dsp_s1!.analysis!.responseText }),
      );
      const pkg = await prisma.evidencePackage.findUniqueOrThrow({ where: { disputeId: id } });
      expect(pkg.submittedAt).not.toBeNull();
      expect(pkg.approvedBy).toBe('seller');
      expect((await prisma.dispute.findUniqueOrThrow({ where: { id } })).status).toBe('UNDER_REVIEW');
    });

    it('no analysis yet: 409 NO_EVIDENCE_PACKAGE, PayPal never called', async () => {
      const id = await newDispute();
      const res = await act(id, { type: 'submit' }).expect(409);
      expect(res.body.error.code).toBe('NO_EVIDENCE_PACKAGE');
      expect(fakePaypal.provideEvidence).not.toHaveBeenCalled();
    });

    it('PDF cannot be built (pipeline not ready): 409 PDF_NOT_AVAILABLE', async () => {
      const id = await newDispute();
      await withPackage(id);
      vi.mocked(renderEvidencePdf).mockRejectedValueOnce(new Error('pipeline.renderEvidencePdf not implemented yet'));
      const res = await act(id, { type: 'submit' }).expect(409);
      expect(res.body.error.code).toBe('PDF_NOT_AVAILABLE');
    });
  });

  describe('offer, accept, message', () => {
    it('offer with no amount uses the seller offerPercent (50% of 49.00)', async () => {
      const id = await newDispute();
      await act(id, { type: 'offer' }).expect(200);
      expect(fakePaypal.makeOffer).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ amount: '24.50' }));
    });

    it('accept and message reach PayPal and are logged', async () => {
      const id = await newDispute();
      await act(id, { type: 'accept' }).expect(200);
      await act(id, { type: 'message', text: 'Your access log is attached.' }).expect(200);
      expect(fakePaypal.acceptClaim).toHaveBeenCalledOnce();
      expect(fakePaypal.sendMessage).toHaveBeenCalledWith(expect.any(String), { message: 'Your access log is attached.' });
      const logs = await prisma.actionLog.findMany({ where: { disputeId: id }, orderBy: { createdAt: 'asc' } });
      expect(logs.map((l) => [l.action, l.ok])).toEqual([['accept', true], ['message', true]]);
    });

    it('PayPal refuses: 422 with PayPal issue code, and a failed log row is still written', async () => {
      const id = await newDispute();
      fakePaypal.makeOffer.mockRejectedValueOnce(new PaypalError(422, 'CANNOT_MAKE_OFFER', 'not in this stage'));
      const res = await act(id, { type: 'offer' }).expect(422);
      expect(res.body.error.code).toBe('PAYPAL_CANNOT_MAKE_OFFER');
      const log = await prisma.actionLog.findFirstOrThrow({ where: { disputeId: id } });
      expect(log).toMatchObject({ action: 'offer', ok: false });
    });

    it('unknown action type: 400; unknown dispute: 404', async () => {
      const id = await newDispute();
      await act(id, { type: 'refund-everything' }).expect(400);
      await act('dsp_nope', { type: 'accept' }).expect(404);
    });
  });

  describe('decision 16: only what PayPal allows right now', () => {
    it('an action PayPal does not list: 409 ACTION_NOT_ALLOWED_NOW, PayPal never called, nothing logged', async () => {
      const id = await newDispute({ limited: true });
      const res = await act(id, { type: 'offer' }).expect(409);
      expect(res.body.error.code).toBe('ACTION_NOT_ALLOWED_NOW');
      expect(res.body.error.message).toContain('Allowed: message');
      expect(fakePaypal.makeOffer).not.toHaveBeenCalled();
      expect(await prisma.actionLog.count({ where: { disputeId: id } })).toBe(0);
    });

    it('reloads the case first, so a just-allowed action goes through', async () => {
      const id = await newDispute({ limited: true });
      await act(id, { type: 'message', text: 'Access log available.' }).expect(200);
      expect(fakePaypal.getDispute).toHaveBeenCalled();
    });

    it('detail and list show the allowed actions', async () => {
      const id = await newDispute({ limited: true });
      await act(id, { type: 'message', text: 'refresh' }).expect(200);
      const detail = await http().get(`/disputes/${id}`).expect(200);
      expect(detail.body.allowedActions).toEqual(['message']);
      const list = await http().get('/disputes').expect(200);
      expect(list.body.items.find((d: { id: string }) => d.id === id).allowedActions).toEqual(['message']);
    });

    it('escalate reaches PayPal with a default note and is logged', async () => {
      const id = await newDispute();
      const res = await act(id, { type: 'escalate' }).expect(200);
      expect(ActionLogEntry.parse(res.body)).toMatchObject({ action: 'escalate', ok: true });
      expect(fakePaypal.escalate).toHaveBeenCalledWith(expect.any(String), { note: expect.stringContaining('review') });
    });
  });

  describe('sandbox steps', () => {
    it('defaults: require-evidence asks the seller, adjudicate decides for the seller', async () => {
      const id = await newDispute();
      await http().post(`/disputes/${id}/sandbox/require-evidence`).send({}).expect(200);
      await http().post(`/disputes/${id}/sandbox/adjudicate`).expect(200);
      expect(fakePaypal.requireEvidence).toHaveBeenCalledWith(expect.any(String), 'SELLER_EVIDENCE');
      expect(fakePaypal.adjudicate).toHaveBeenCalledWith(expect.any(String), 'SELLER_FAVOR');
    });

    it('#45: a step PayPal does not list yet: 409, PayPal never called, nothing logged', async () => {
      const id = await newDispute({ limited: true });
      const res = await http().post(`/disputes/${id}/sandbox/adjudicate`).expect(409);
      expect(res.body.error.code).toBe('ACTION_NOT_ALLOWED_NOW');
      expect(fakePaypal.adjudicate).not.toHaveBeenCalled();
      expect(await prisma.actionLog.count({ where: { disputeId: id } })).toBe(0);
    });

    it('#45: once PayPal lists adjudicate it goes through, and the case shows its stage and the sandbox steps', async () => {
      const id = await newDispute({ claim: true });
      await http().post(`/disputes/${id}/sandbox/adjudicate`).expect(200);
      expect(fakePaypal.adjudicate).toHaveBeenCalledOnce();
      const detail = await http().get(`/disputes/${id}`).expect(200);
      expect(detail.body.dispute).toMatchObject({ stage: 'CHARGEBACK', outcome: null });
      expect(detail.body.allowedActions).toEqual(['adjudicate', 'require_evidence']);
      const list = await http().get('/disputes').expect(200);
      expect(list.body.items.find((d: { id: string }) => d.id === id)).toMatchObject({ stage: 'CHARGEBACK' });
    });

    it('unknown step: 400; live PayPal: 403', async () => {
      const id = await newDispute();
      await http().post(`/disputes/${id}/sandbox/delete-everything`).expect(400);
      process.env.PAYPAL_ENV = 'live';
      const res = await http().post(`/disputes/${id}/sandbox/adjudicate`).expect(403);
      expect(res.body.error.code).toBe('SANDBOX_ONLY');
    });
  });

  it('every action route needs the passcode when one is set', async () => {
    const id = await newDispute();
    process.env.DEMO_PASSCODE = 'secret';
    await act(id, { type: 'accept' }).expect(401);
    await http().post(`/disputes/${id}/sandbox/adjudicate`).expect(401);
    await act(id, { type: 'accept' }).set(DEMO_PASSCODE_HEADER, 'secret').expect(200);
  });
});
