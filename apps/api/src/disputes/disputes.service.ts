import { Injectable } from '@nestjs/common';
import { DisputeDetail, DisputeList } from '@proofvault/shared';
import { AppError } from '../common/api-error.filter';
import { PrismaService } from '../db/prisma.service';
import { allowedActionsOf, toAction, toAnalysis, toDispute, toOrder } from './mappers';

@Injectable()
export class DisputesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<DisputeList> {
    const rows = await this.prisma.dispute.findMany({
      include: { order: { select: { buyerEmail: true } }, evidence: { select: { analysis: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // Parsing on the way out makes a contract break fail loudly here, not in the dashboard.
    return DisputeList.parse({
      items: rows.map((row) => ({
        ...toDispute(row),
        decision: row.evidence ? toAnalysis(row.evidence.analysis).decision.action : null,
        buyerEmail: row.order?.buyerEmail ?? null,
        allowedActions: allowedActionsOf(row.raw),
      })),
    });
  }

  async get(id: string): Promise<DisputeDetail> {
    const row = await this.prisma.dispute.findUnique({
      where: { id },
      include: { order: true, evidence: true, actions: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) throw new AppError(404, 'DISPUTE_NOT_FOUND', `No dispute with id ${id}`);
    return DisputeDetail.parse({
      dispute: toDispute(row),
      order: row.order ? toOrder(row.order) : null,
      analysis: row.evidence ? toAnalysis(row.evidence.analysis) : null,
      actions: row.actions.map(toAction),
      allowedActions: allowedActionsOf(row.raw),
    });
  }
}
