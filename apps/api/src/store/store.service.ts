import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CaptureOrderResponse, CreateOrderResponse } from '@proofvault/shared';
import type { z } from 'zod';
import { AppError } from '../common/api-error.filter';
import { PrismaService } from '../db/prisma.service';
import { PaypalClient, PaypalError } from '../paypal/paypal.client';

type CreateOrder = z.infer<typeof CreateOrderResponse>;
type CaptureOrder = z.infer<typeof CaptureOrderResponse>;

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paypal: PaypalClient,
  ) {}

  /** Creates our order and the PayPal order together. Our id travels to PayPal as custom_id. */
  async createOrder(checkout: { ip: string; device: string }): Promise<CreateOrder> {
    // The demo store sells one product (PLAN.md section 2).
    const product = await this.prisma.product.findFirst({ orderBy: { id: 'asc' } });
    if (!product) throw new AppError(500, 'NO_PRODUCT', 'No product is seeded');

    const id = `ord_${randomUUID()}`;
    const storeOrigin = process.env.STORE_ORIGIN ?? 'http://localhost:5174';
    const paypalOrder = await this.paypal.createOrder({
      amount: product.price,
      customId: id,
      description: product.name,
      returnUrl: `${storeOrigin}/checkout/return`,
      cancelUrl: `${storeOrigin}/checkout/cancel`,
    });

    await this.prisma.order.create({
      data: {
        id,
        paypalOrderId: paypalOrder.id,
        productId: product.id,
        buyerEmail: '', // known only after capture
        amount: product.price,
        currency: product.currency,
        checkoutIp: checkout.ip,
        checkoutDevice: checkout.device,
      },
    });
    return { paypalOrderId: paypalOrder.id };
  }

  /**
   * Takes the money and hands the buyer their private access token.
   * Safe to call twice: a captured order returns its token without asking PayPal again.
   */
  async captureOrder(paypalOrderId: string): Promise<CaptureOrder> {
    const order = await this.prisma.order.findUnique({ where: { paypalOrderId } });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', `No order ${paypalOrderId}`);
    if (order.paypalCaptureId) {
      return { paypalOrderId, status: 'COMPLETED', accessToken: order.accessToken };
    }

    let captured;
    try {
      captured = await this.paypal.captureOrder(paypalOrderId);
    } catch (e) {
      if (e instanceof PaypalError && e.issue === 'ORDER_NOT_APPROVED') {
        throw new AppError(409, 'ORDER_NOT_APPROVED', 'The buyer has not approved this payment yet');
      }
      throw e;
    }
    if (captured.status !== 'COMPLETED' || !captured.captureId) {
      throw new AppError(402, 'PAYMENT_NOT_COMPLETED', `PayPal returned status ${captured.status}`);
    }

    const saved = await this.prisma.order.update({
      where: { id: order.id },
      data: { paypalCaptureId: captured.captureId, buyerEmail: captured.payerEmail ?? '' },
    });
    return { paypalOrderId, status: captured.status, accessToken: saved.accessToken };
  }
}
