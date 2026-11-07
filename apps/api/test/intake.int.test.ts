// #10 dispute intake: webhook, poll backstop, fetch by case id. Real Postgres, fake PayPal.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEMO_PASSCODE_HEADER, DisputeDetail, SyncResult } from '@proofvault/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ApiErrorFilter } from '../src/common/api-error.filter';
import { PrismaService } from '../src/db/prisma.service';
import { PaypalClient, type PaypalDispute } from '../src/paypal/paypal.client';

// Shaped like the real sandbox case PP-R-WQU-10196685 (docs/paypal-sandbox-notes.md).
const paypalCase = (id: string, tx: { seller_transaction_id?: string; custom?: string }, status = 'WAITING_FOR_SELLER_RESPONSE'): PaypalDispute => ({
  dispute_id: id,
  create_time: '2026-11-05T19:42:10.313Z',
  update_time: `2026-11-05T19:4${status.length % 10}:54.083Z`,
  reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
  status,
  dispute_amount: { currency_code: 'USD', value: '49.00' },
  seller_response_due_date: '2026-11-25T19:42:05.000Z',
  disputed_transactions: [{ ...tx }],
});

const cases = new Map<string, PaypalDispute>();
const fakePaypal = {
  getDispute: vi.fn(async (id: string) => {
    const d = cases.get(id);
    if (!d) throw new Error(`unknown case ${id}`);
    return d;
  }),
  // Like the real list: update_time rounded to whole seconds.
  listDisputes: vi.fn(async () =>
    [...cases.values()].map((d) => ({ dispute_id: d.dispute_id, update_time: d.update_time?.replace(/\.\d+Z$/, '.000Z') })),
  ),
  verifyWebhook: vi.fn(async () => true),
};

describe('dispute intake', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const event = (id: string, disputeId: string, type = 'CUSTOMER.DISPUTE.CREATED') => ({
    id,
    event_type: type,
    resource: { dispute_id: disputeId },
  });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaypalClient)
      .useValue(fakePaypal)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.order.create({
      data: {
        id: 'ord_test_intake',
        paypalOrderId: 'TEST-INTAKE-ORDER',
        paypalCaptureId: 'TEST-INTAKE-CAPTURE',
        productId: 'prod_course',
        buyerEmail: 'b@personal.example.com',
        amount: '49.00',
        checkoutIp: '196.188.12.7',
        checkoutDevice: 'Windows / Chrome',
      },
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    cases.clear();
    process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST';
  });
  afterEach(async () => {
    delete process.env.DEMO_PASSCODE;
    await prisma.outcome.deleteMany({ where: { dispute: { paypalDisputeId: { startsWith: 'PP-TEST-' } } } });
    await prisma.dispute.deleteMany({ where: { paypalDisputeId: { startsWith: 'PP-TEST-' } } });
    await prisma.webhookEvent.deleteMany({ where: { id: { startsWith: 'WH-EVT-TEST-' } } });
  });
  afterAll(async () => {
    await prisma.order.delete({ where: { id: 'ord_test_intake' } });
    await app.close();
  });

  describe('webhook', () => {
    it('a verified dispute event saves the case, matched to our order by capture id', async () => {
      cases.set('PP-TEST-1', paypalCase('PP-TEST-1', { seller_transaction_id: 'TEST-INTAKE-CAPTURE' }));
      await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-1', 'PP-TEST-1')).expect(200);

      const row = await prisma.dispute.findUniqueOrThrow({ where: { paypalDisputeId: 'PP-TEST-1' } });
      expect(row).toMatchObject({
        orderId: 'ord_test_intake',
        reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
        status: 'WAITING_FOR_SELLER_RESPONSE',
        amount: '49.00',
      });
      expect(row.responseDueAt?.toISOString()).toBe('2026-11-25T19:42:05.000Z');
    });

    it('falls back to custom_id (our order id) when the capture id is unknown', async () => {
      cases.set('PP-TEST-2', paypalCase('PP-TEST-2', { seller_transaction_id: 'SOMETHING-ELSE', custom: 'ord_test_intake' }));
      await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-2', 'PP-TEST-2')).expect(200);
      const row = await prisma.dispute.findUniqueOrThrow({ where: { paypalDisputeId: 'PP-TEST-2' } });
      expect(row.orderId).toBe('ord_test_intake');
    });

    it('a case for an order we never saw is saved with no order (S4)', async () => {
      cases.set('PP-TEST-3', paypalCase('PP-TEST-3', { seller_transaction_id: 'NOT-OURS' }));
      await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-3', 'PP-TEST-3')).expect(200);
      const row = await prisma.dispute.findUniqueOrThrow({ where: { paypalDisputeId: 'PP-TEST-3' } });
      expect(row.orderId).toBeNull();
    });

    it('the same event twice is handled once', async () => {
      cases.set('PP-TEST-4', paypalCase('PP-TEST-4', {}));
      await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-4', 'PP-TEST-4')).expect(200);
      const again = await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-4', 'PP-TEST-4')).expect(200);
      expect(again.body.duplicate).toBe(true);
      expect(fakePaypal.getDispute).toHaveBeenCalledTimes(1);
    });

    it('an UPDATED event refreshes the saved status', async () => {
      cases.set('PP-TEST-5', paypalCase('PP-TEST-5', {}, 'UNDER_REVIEW'));
      await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-5a', 'PP-TEST-5')).expect(200);
      cases.set('PP-TEST-5', paypalCase('PP-TEST-5', {}, 'RESOLVED'));
      await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-5b', 'PP-TEST-5', 'CUSTOMER.DISPUTE.RESOLVED')).expect(200);
      const row = await prisma.dispute.findUniqueOrThrow({ where: { paypalDisputeId: 'PP-TEST-5' } });
      expect(row.status).toBe('RESOLVED');
    });

    it('a later reload without payment details keeps the order link it already found', async () => {
      cases.set('PP-TEST-12', paypalCase('PP-TEST-12', { seller_transaction_id: 'TEST-INTAKE-CAPTURE' }));
      await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-12a', 'PP-TEST-12')).expect(200);
      cases.set('PP-TEST-12', paypalCase('PP-TEST-12', {}, 'UNDER_REVIEW'));
      await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-12b', 'PP-TEST-12', 'CUSTOMER.DISPUTE.UPDATED')).expect(200);
      const row = await prisma.dispute.findUniqueOrThrow({ where: { paypalDisputeId: 'PP-TEST-12' } });
      expect(row).toMatchObject({ orderId: 'ord_test_intake', status: 'UNDER_REVIEW' });
    });

    it('a webhook PayPal does not confirm: 401, nothing saved', async () => {
      fakePaypal.verifyWebhook.mockResolvedValueOnce(false);
      cases.set('PP-TEST-6', paypalCase('PP-TEST-6', {}));
      const res = await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-6', 'PP-TEST-6')).expect(401);
      expect(res.body.error.code).toBe('BAD_SIGNATURE');
      expect(await prisma.dispute.findUnique({ where: { paypalDisputeId: 'PP-TEST-6' } })).toBeNull();
    });

    it('no webhook id configured: 503 instead of trusting anything', async () => {
      process.env.PAYPAL_WEBHOOK_ID = 'pending';
      const res = await http().post('/webhooks/paypal').send(event('WH-EVT-TEST-7', 'PP-TEST-7')).expect(503);
      expect(res.body.error.code).toBe('WEBHOOK_NOT_CONFIGURED');
      expect(fakePaypal.verifyWebhook).not.toHaveBeenCalled();
    });
  });

  describe('fetch by case id and sync', () => {
    it('fetch loads one case and returns it in the DisputeDetail shape', async () => {
      cases.set('PP-TEST-8', paypalCase('PP-TEST-8', { seller_transaction_id: 'TEST-INTAKE-CAPTURE' }));
      const res = await http().post('/disputes/fetch').send({ caseId: 'PP-TEST-8' }).expect(200);
      const detail = DisputeDetail.parse(res.body);
      expect(detail.dispute.paypalDisputeId).toBe('PP-TEST-8');
      expect(detail.order?.checkoutIp).toBe('196.188.x.x');
    });

    it('fetch rejects something that is not a case id', async () => {
      const res = await http().post('/disputes/fetch').send({ caseId: 'drop table' }).expect(400);
      expect(res.body.error.code).toBe('BAD_CASE_ID');
    });

    it('both routes need the passcode when one is set', async () => {
      process.env.DEMO_PASSCODE = 'secret';
      await http().post('/disputes/sync').expect(401);
      await http().post('/disputes/fetch').send({ caseId: 'PP-TEST-9' }).expect(401);
      await http().post('/disputes/sync').set(DEMO_PASSCODE_HEADER, 'secret').expect(200);
    });

    it('sync brings in new or changed cases only', async () => {
      cases.set('PP-TEST-10', paypalCase('PP-TEST-10', {}));
      cases.set('PP-TEST-11', paypalCase('PP-TEST-11', {}));
      const first = SyncResult.parse((await http().post('/disputes/sync').expect(200)).body);
      expect(first.synced).toBe(2);
      const second = SyncResult.parse((await http().post('/disputes/sync').expect(200)).body);
      expect(second.synced).toBe(0);
    });
  });
});
