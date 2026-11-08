import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { DisputeActionRequest, PipelineResult } from '@proofvault/shared';
import { ActionsService } from '../actions/actions.service';
import { AnalysisService } from '../analysis/analysis.service';
import { AppError } from '../common/api-error.filter';
import { PrismaService } from '../db/prisma.service';
import { stageOf } from '../disputes/mappers';

/**
 * #21: the agent carries out its own decision, inside the seller's rules.
 *
 * Decision 9: at most once per PayPal stage (inquiry, then claim), never after anyone (agent or
 * seller) has acted in that stage, and only while PayPal is waiting on the seller. A failed agent
 * attempt counts as acting, so there are no retry loops. An action with no known stage (older rows)
 * counts in every stage. Decision 10: the agent never makes a second offer, in any stage.
 * Decision 16: ActionsService refuses what PayPal does not allow right now; the agent then waits
 * and may act on a later analysis, once PayPal allows it and still nobody has acted.
 */
@Injectable()
export class ExecutorService implements OnModuleInit {
  private readonly log = new Logger('Executor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly analysis: AnalysisService,
    private readonly actions: ActionsService,
  ) {}

  onModuleInit() {
    this.analysis.onAnalyzed(async (disputeId, result) => {
      await this.consider(disputeId, result);
    });
  }

  /** Returns what it did, for the log and the tests. */
  async consider(disputeId: string, result: PipelineResult): Promise<string> {
    // Off in tests unless a test turns it on; AUTO_ACTIONS=false is the kill switch in production.
    if (process.env.VITEST && process.env.AUTO_ACTIONS !== 'true') return this.skip(disputeId, 'off in tests');
    if (process.env.AUTO_ACTIONS === 'false') return this.skip(disputeId, 'AUTO_ACTIONS=false');

    const request = this.toRequest(result);
    if (!request) return this.skip(disputeId, `decision is ${result.decision.action}`);

    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      select: {
        status: true,
        raw: true,
        actions: { where: { action: { not: 'analyze' } }, select: { action: true, stage: true } },
      },
    });
    if (!dispute) return this.skip(disputeId, 'dispute gone');
    if (dispute.status !== 'WAITING_FOR_SELLER_RESPONSE') return this.skip(disputeId, `status is ${dispute.status}`);
    const stage = stageOf(dispute.raw);
    if (dispute.actions.some((a) => a.stage === null || a.stage === stage)) {
      return this.skip(disputeId, `someone already acted in stage ${stage ?? 'unknown'}`);
    }
    if (request.type === 'offer' && dispute.actions.some((a) => a.action === 'offer')) {
      return this.skip(disputeId, 'an offer was already made (decision 10)');
    }

    try {
      await this.actions.act(disputeId, request, 'agent');
      this.log.log(`${disputeId}: agent did ${request.type}`);
      return `did ${request.type}`;
    } catch (e) {
      if (e instanceof AppError && e.getStatus() === 409) {
        return this.skip(disputeId, `waiting: ${e.code} (${e.message})`);
      }
      // PayPal refused: ActionsService already logged the failed attempt, so the agent will not retry.
      this.log.warn(`${disputeId}: agent ${request.type} failed: ${String(e)}`);
      return `failed ${request.type}`;
    }
  }

  private toRequest(result: PipelineResult): DisputeActionRequest | null {
    // No note from decision.reason: it names our score and rules, and notes are shown to the
    // buyer and PayPal. ActionsService's default notes are written for them.
    const { action, offerAmount } = result.decision;
    switch (action) {
      case 'submit':
        return { type: 'submit' };
      case 'offer':
        return { type: 'offer', ...(offerAmount ? { amount: offerAmount } : {}) };
      case 'accept':
        return { type: 'accept' };
      case 'await_approval':
        return null;
    }
  }

  private skip(disputeId: string, why: string): string {
    this.log.log(`${disputeId}: no auto-action (${why})`);
    return `skipped: ${why}`;
  }
}
