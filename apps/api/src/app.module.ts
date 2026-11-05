import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { DisputesModule } from './disputes/disputes.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DbModule, DisputesModule],
  controllers: [HealthController],
})
export class AppModule {}
