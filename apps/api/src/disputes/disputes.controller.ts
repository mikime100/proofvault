import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  type ActionLogEntry,
  DisputeActionRequest,
  type DisputeDetail,
  type DisputeList,
  FetchDisputeRequest,
  SandboxStep,
  SandboxStepBody,
  type SyncResult,
} from '@proofvault/shared';
import { ActionsService } from '../actions/actions.service';
import { AnalysisService } from '../analysis/analysis.service';
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
    private readonly actions: ActionsService,
    private readonly analysis: AnalysisService,
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

  /** Run the AI pipeline again now (decision 6: replaces the saved analysis). Waits for it. */
  @Post(':id/analyze')
  @HttpCode(200)
  @UseGuards(PasscodeGuard)
  async analyze(@Param('id') id: string): Promise<DisputeDetail> {
    await this.analysis.analyze(id);
    return this.disputes.get(id);
  }

  /** The seller's buttons: submit evidence, offer, accept, message. Answers with the log entry. */
  @Post(':id/actions')
  @HttpCode(200)
  @UseGuards(PasscodeGuard)
  act(@Param('id') id: string, @Body() body: unknown): Promise<ActionLogEntry> {
    const parsed = DisputeActionRequest.safeParse(body);
    if (!parsed.success) throw new AppError(400, 'BAD_ACTION', 'type must be submit, offer, accept or message');
    return this.actions.act(id, parsed.data, 'seller');
  }

  /** Sandbox only: require-evidence or adjudicate, for the demo. Body optional. */
  @Post(':id/sandbox/:step')
  @HttpCode(200)
  @UseGuards(PasscodeGuard)
  sandbox(@Param('id') id: string, @Param('step') step: string, @Body() body: unknown): Promise<ActionLogEntry> {
    const parsedStep = SandboxStep.safeParse(step);
    const parsedBody = SandboxStepBody.safeParse(body ?? {});
    if (!parsedStep.success || !parsedBody.success) {
      throw new AppError(400, 'BAD_SANDBOX_STEP', 'step must be require-evidence or adjudicate');
    }
    return this.actions.sandbox(id, parsedStep.data, parsedBody.data);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<DisputeDetail> {
    return this.disputes.get(id);
  }
}
