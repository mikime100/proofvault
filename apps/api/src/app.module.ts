import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { DisputesModule } from './disputes/disputes.module';
import { HealthController } from './health.controller';
import { PaypalModule } from './paypal/paypal.module';
import { StoreModule } from './store/store.module';
import { StudioModule } from './studio/studio.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({
  imports: [DbModule, PaypalModule, DisputesModule, StoreModule, TrackingModule, StudioModule],
  controllers: [HealthController],
})
export class AppModule {}
