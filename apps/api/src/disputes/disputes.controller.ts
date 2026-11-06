import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { type DisputeDetail, type DisputeList, FetchDisputeRequest, type SyncResult } from '@proofvault/shared';
import { AppError } from '../common/api-error.filter';
import { PasscodeGuard } from '../common/passcode.guard';
import { DisputesService } from './disputes.service';
import { IntakeService } from './intake.service';

// Reads stay open for judges (decision 14). Every route that changes something needs the passcode.
@Controller('disputes')
export class DisputesController {
  constructor(
    private readonly disputes: DisputesService,
    private readonly intake: IntakeService,
  ) {}

  @Get()
  list(): Promise<DisputeList> {
    return this.disputes.list();
  }

  /** Pull in every new or changed case right now, instead of waiting for the 60-second poll. */
  @Post('sync')
  @HttpCode(200)
  @UseGuards(PasscodeGuard)
  async sync(): Promise<SyncResult> {
    return { synced: await this.intake.sync() };
  }

  /** Load one case by its PayPal id (PP-...). Instant, unlike the list. */
  @Post('fetch')
  @HttpCode(200)
  @UseGuards(PasscodeGuard)
  async fetch(@Body() body: unknown): Promise<DisputeDetail> {
    const parsed = FetchDisputeRequest.safeParse(body);
    if (!parsed.success) throw new AppError(400, 'BAD_CASE_ID', 'caseId must look like PP-R-ABC-12345678');
    const row = await this.intake.ingest(parsed.data.caseId);
    return this.disputes.get(row.id);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<DisputeDetail> {
    return this.disputes.get(id);
  }
}
