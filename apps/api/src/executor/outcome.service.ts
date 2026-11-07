import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Dispute as DisputeRow, OutcomeResult } from '@prisma/client';
import { PipelineResult } from '@proofvault/shared';
import { PrismaService } from '../db/prisma.service';
import { IntakeService } from '../disputes/intake.service';

/**
 * Records how each case ended, once PayPal marks it RESOLVED (handoff section 2, step 5).
 * The analytics views count wins by reason and by evidence type from these rows.
 */
@Injectable()
export class OutcomeService implements OnModuleInit {
  private readonly log = new Logger('Outcome');

  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: IntakeService,
  ) {}

  onModuleInit() {
    this.intake.onChange((row) => {
      if (row.status !== 'RESOLVED') return;
      // Off in tests unless a test turns it on (it writes in the background).
      if (process.env.VITEST && process.env.RECORD_OUTCOMES !== 'true') return;
      this.record(row).catch((e: unknown) => this.log.warn(`outcome for ${row.id} failed: ${String(e)}`));
    });
  }

  async record(row: DisputeRow): Promise<OutcomeResult> {
    const actions = await this.prisma.actionLog.findMany({
      where: { disputeId: row.id, ok: true, action: { in: ['accept', 'offer'] } },
      select: { action: true },
    });
    const code = (row.raw as { dispute_outcome?: { outcome_code?: string } } | null)?.dispute_outcome?.outcome_code;
    const result = outcomeOf(code, new Set(actions.map((a) => a.action)));

    const pkg = await this.prisma.evidencePackage.findUnique({ where: { disputeId: row.id } });
    const parsed = pkg?.submittedAt ? PipelineResult.safeParse(pkg.analysis) : null;
    const evidenceTypesUsed = parsed?.success ? parsed.data.score.features.map((f) => f.key) : [];

    await this.prisma.outcome.upsert({
      where: { disputeId: row.id },
      update: { result, evidenceTypesUsed },
      create: { disputeId: row.id, result, evidenceTypesUsed },
    });
    this.log.log(`${row.id}: ${result} (${code ?? 'no outcome code'})`);
    return result;
  }
}

/**
 * PayPal's outcome code plus what we did. We refunded if we accepted the claim; the buyer took
 * our offer if we made one and did not win outright; otherwise PayPal decided for one side.
 */
export function outcomeOf(code: string | undefined, did: Set<string>): OutcomeResult {
  if (code === 'RESOLVED_SELLER_FAVOUR' || code === 'CANCELED_BY_BUYER') return 'won';
  if (did.has('accept')) return 'refunded';
  if (did.has('offer')) return 'offer_accepted';
  return 'lost';
}
