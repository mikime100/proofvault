import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Dispute as DisputeRow, Prisma } from '@prisma/client';
import { DisputeReason, DisputeStatus } from '@proofvault/shared';
import { PrismaService } from '../db/prisma.service';
import { PaypalClient, type PaypalDispute } from '../paypal/paypal.client';

const POLL_MS = 60_000;
const sameSecond = (a: string, b: string) => Math.floor(Date.parse(a) / 1000) === Math.floor(Date.parse(b) / 1000);

/**
 * Every way a dispute reaches us (webhook, poll, "fetch by case ID") ends in ingest():
 * fetch the case from PayPal, match it to our order, save it. Safe to run any number of times.
 */
@Injectable()
export class IntakeService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Intake');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paypal: PaypalClient,
  ) {}

  /** The poll is the backstop for missed webhooks. Off in tests and when POLL_DISPUTES=false. */
  onModuleInit() {
    if (process.env.VITEST || process.env.POLL_DISPUTES === 'false' || !process.env.PAYPAL_CLIENT_ID) return;
    this.timer = setInterval(() => {
      this.sync().catch((e: unknown) => this.log.warn(`poll failed: ${String(e)}`));
    }, POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Loads one case from PayPal and saves it. Returns our row. */
  async ingest(paypalDisputeId: string): Promise<DisputeRow> {
    const d = await this.paypal.getDispute(paypalDisputeId);
    const orderId = await this.matchOrder(d);
    const status = DisputeStatus.safeParse(d.status);
    const reason = DisputeReason.safeParse(d.reason);
    const fields = {
      orderId,
      reason: reason.success ? reason.data : 'OTHER',
      amount: d.dispute_amount.value,
      currency: d.dispute_amount.currency_code,
      status: status.success ? status.data : 'OTHER',
      responseDueAt: d.seller_response_due_date ? new Date(d.seller_response_due_date) : null,
      raw: d as unknown as Prisma.InputJsonValue,
    };
    const row = await this.prisma.dispute.upsert({
      where: { paypalDisputeId: d.dispute_id },
      update: fields,
      create: { paypalDisputeId: d.dispute_id, createdAt: new Date(d.create_time), ...fields },
    });
    this.log.log(`ingested ${d.dispute_id} (${row.status}, order ${orderId ?? 'none'})`);
    return row;
  }

  /**
   * Decision 1: our capture id first (PayPal's seller_transaction_id), then our order id,
   * which we sent as custom_id. Null when the case is for an order we never saw (scenario S4).
   */
  private async matchOrder(d: PaypalDispute): Promise<string | null> {
    for (const tx of d.disputed_transactions ?? []) {
      if (tx.seller_transaction_id) {
        const byCapture = await this.prisma.order.findUnique({
          where: { paypalCaptureId: tx.seller_transaction_id },
          select: { id: true },
        });
        if (byCapture) return byCapture.id;
      }
      if (tx.custom) {
        const byOurId = await this.prisma.order.findUnique({ where: { id: tx.custom }, select: { id: true } });
        if (byOurId) return byOurId.id;
      }
    }
    return null;
  }

  /** Ingests every listed case that is new or changed since we last saw it. Returns how many. */
  async sync(): Promise<number> {
    const items = await this.paypal.listDisputes();
    let synced = 0;
    for (const item of items) {
      const known = await this.prisma.dispute.findUnique({
        where: { paypalDisputeId: item.dispute_id },
        select: { raw: true },
      });
      const knownUpdate = (known?.raw as { update_time?: string } | null)?.update_time;
      // The list rounds update_time to whole seconds; the full case keeps milliseconds.
      if (known && item.update_time && knownUpdate && sameSecond(knownUpdate, item.update_time)) continue;
      await this.ingest(item.dispute_id);
      synced++;
    }
    return synced;
  }
}
