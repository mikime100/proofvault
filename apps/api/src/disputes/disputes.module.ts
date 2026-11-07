import { Module } from '@nestjs/common';
import { ActionsService } from '../actions/actions.service';
import { AnalysisService } from '../analysis/analysis.service';
import { llmProvider } from '../analysis/llm.provider';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { IntakeService } from './intake.service';

@Module({
  controllers: [DisputesController, WebhooksController],
  providers: [DisputesService, IntakeService, ActionsService, AnalysisService, llmProvider],
  exports: [IntakeService, ActionsService, AnalysisService],
})
export class DisputesModule {}
