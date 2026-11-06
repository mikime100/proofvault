import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { AppError } from '../common/api-error.filter';
import { PrismaService } from '../db/prisma.service';
import { IntakeService } from '../disputes/intake.service';
import { PaypalClient } from '../paypal/paypal.client';

interface PaypalEvent {
  id?: string;
  event_type?: string;
  resource?: { dispute_id?: string };
}

/**
 * PayPal calls this when a dispute is created, updated or resolved. Open route, but every call is
 * checked with PayPal before we trust it. A repeat of an event we already handled does nothing.
 * Any failure after the signature check returns 500, so PayPal retries later.
 */
@Controller('webhooks/paypal')
export class WebhooksController {
  constructor(
    private readonly paypal: PaypalClient,
    private readonly intake: IntakeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(@Body() event: PaypalEvent, @Headers() headers: Record<string, string | undefined>) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId || webhookId === 'pending' || webhookId.startsWith('your-')) {
      throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'PAYPAL_WEBHOOK_ID is not set');
    }
    if (!event?.id || !event.event_type) throw new AppError(400, 'BAD_WEBHOOK', 'Not a PayPal event');

    if (!(await this.paypal.verifyWebhook(headers, event, webhookId))) {
      throw new AppError(401, 'BAD_SIGNATURE', 'PayPal did not confirm this webhook');
    }
    if (await this.prisma.webhookEvent.findUnique({ where: { id: event.id } })) {
      return { ok: true, duplicate: true };
    }

    const disputeId = event.resource?.dispute_id;
    if (event.event_type.startsWith('CUSTOMER.DISPUTE.') && disputeId) {
      await this.intake.ingest(disputeId);
    }
    await this.prisma.webhookEvent.create({ data: { id: event.id, eventType: event.event_type } });
    return { ok: true };
  }
}
