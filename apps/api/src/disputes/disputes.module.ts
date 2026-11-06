import { Module } from '@nestjs/common';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { IntakeService } from './intake.service';

@Module({
  controllers: [DisputesController, WebhooksController],
  providers: [DisputesService, IntakeService],
  exports: [IntakeService],
})
export class DisputesModule {}
