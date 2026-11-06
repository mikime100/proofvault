import { Module } from '@nestjs/common';
import { ActionsService } from '../actions/actions.service';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { IntakeService } from './intake.service';

@Module({
  controllers: [DisputesController, WebhooksController],
  providers: [DisputesService, IntakeService, ActionsService],
  exports: [IntakeService, ActionsService],
})
export class DisputesModule {}
