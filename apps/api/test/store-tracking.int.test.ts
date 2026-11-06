// #3 checkout endpoints and #4 access tracking, against real Postgres and a fake PayPal.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CaptureOrderResponse, CreateOrderResponse } from '@proofvault/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ApiErrorFilter } from '../src/common/api-error.filter';
import { PrismaService } from '../src/db/prisma.service';
import { PaypalClient, PaypalError } from '../src/paypal/paypal.client';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
let nextOrder = 0;
const fakePaypal = {
  createOrder: vi.fn(async () => ({ id: `TEST-PP-${Date.now()}-${nextOrder++}` })),
  captureOrder: vi.fn(async (_id: string) => ({
    status: 'COMPLETED',
    captureId: `TEST-CAP-${Date.now()}-${nextOrder++}`,
    payerEmail: 'buyer@personal.example.com',
  })),
};

describe('store checkout and tracking', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  const createOrder = async () => {
    const res = await http()
      .post('/store/orders')
      .set('X-Forwarded-For', '196.188.12.7, 10.0.0.2')
      .set('User-Agent', CHROME_WIN)
      .expect(201);
    return CreateOrderResponse.parse(res.body).paypalOrderId;
  };
  const captured = async () => {
    const paypalOrderId = await createOrder();
    const res = await http().post(`/store/orders/${paypalOrderId}/capture`).expect(200);
    return CaptureOrderResponse.parse(res.body);
  };

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
  afterAll(async () => {
    const orders = { paypalOrderId: { startsWith: 'TEST-PP-' } };
    await prisma.accessEvent.deleteMany({ where: { order: orders } });
    await prisma.order.deleteMany({ where: orders });
    await app.close();
  });

  describe('#3 checkout', () => {
    it('creates our order and a PayPal order, with our id as custom_id and the checkout IP and device', async () => {
      const paypalOrderId = await createOrder();
      const order = await prisma.order.findUniqueOrThrow({ where: { paypalOrderId } });
      expect(fakePaypal.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '49.00', customId: order.id }),
      );
      expect(order).toMatchObject({ checkoutIp: '196.188.12.7', checkoutDevice: 'Windows / Chrome', paypalCaptureId: null });
    });

    it('captures, saves the capture id and buyer email, and returns the private access token', async () => {
      const { paypalOrderId, accessToken, status } = await captured();
      const order = await prisma.order.findUniqueOrThrow({ where: { paypalOrderId } });
      expect(status).toBe('COMPLETED');
      expect(accessToken).toBe(order.accessToken);
      expect(order.paypalCaptureId).toMatch(/^TEST-CAP-/);
      expect(order.buyerEmail).toBe('buyer@personal.example.com');
    });

    it('capturing twice returns the same token and asks PayPal only once', async () => {
      const first = await captured();
      const again = await http().post(`/store/orders/${first.paypalOrderId}/capture`).expect(200);
      expect(again.body.accessToken).toBe(first.accessToken);
      expect(fakePaypal.captureOrder).toHaveBeenCalledTimes(1);
    });

    it('an order the buyer has not approved: 409 ORDER_NOT_APPROVED', async () => {
      const paypalOrderId = await createOrder();
      fakePaypal.captureOrder.mockRejectedValueOnce(new PaypalError(422, 'ORDER_NOT_APPROVED', 'not approved'));
      const res = await http().post(`/store/orders/${paypalOrderId}/capture`).expect(409);
      expect(res.body.error.code).toBe('ORDER_NOT_APPROVED');
    });

    it('an unknown order: 404 ORDER_NOT_FOUND', async () => {
      const res = await http().post('/store/orders/NOPE/capture').expect(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('#4 tracking', () => {
    it('records an event with the server-side time, IP and device, ignoring browser-sent at and ip', async () => {
      const { paypalOrderId, accessToken } = await captured();
      const before = Date.now();
      await http()
        .post('/track')
        .set('X-Forwarded-For', '41.215.88.20')
        .set('User-Agent', CHROME_WIN)
        .send({ accessToken, type: 'lesson_view', meta: { lesson: '2' }, at: '2020-01-01T00:00:00Z', ip: '6.6.6.6' })
        .expect(204);

      const order = await prisma.order.findUniqueOrThrow({ where: { paypalOrderId }, include: { events: true } });
      expect(order.events).toHaveLength(1);
      const event = order.events[0]!;
      expect(event).toMatchObject({ type: 'lesson_view', ip: '41.215.88.20', device: 'Windows / Chrome', meta: { lesson: '2' } });
      expect(event.at.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('an unknown token: 401 UNKNOWN_ACCESS_TOKEN, nothing stored', async () => {
      const res = await http().post('/track').send({ accessToken: 'not-a-token', type: 'download' }).expect(401);
      expect(res.body.error.code).toBe('UNKNOWN_ACCESS_TOKEN');
    });

    it('a missing token or a bad event type: 400 BAD_TRACK_REQUEST', async () => {
      await http().post('/track').send({ type: 'download' }).expect(400);
      const res = await http().post('/track').send({ accessToken: 'x', type: 'hacked' }).expect(400);
      expect(res.body.error.code).toBe('BAD_TRACK_REQUEST');
    });
  });
});
