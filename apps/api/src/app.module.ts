import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { DisputesModule } from './disputes/disputes.module';
import { HealthController } from './health.controller';
import { PaypalModule } from './paypal/paypal.module';
import { StoreModule } from './store/store.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({
  imports: [DbModule, PaypalModule, DisputesModule, StoreModule, TrackingModule],
  controllers: [HealthController],
})
export class AppModule {}
