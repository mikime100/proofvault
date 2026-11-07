import { Module } from '@nestjs/common';
import { StudioController } from './studio.controller';
import { deepseekChat, STUDIO_CHAT, StudioService } from './studio.service';

@Module({
  controllers: [StudioController],
  providers: [StudioService, { provide: STUDIO_CHAT, useValue: deepseekChat }],
})
export class StudioModule {}
