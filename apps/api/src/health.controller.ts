import { Controller, Get } from '@nestjs/common';
import type { Health } from '@proofvault/shared';

@Controller('health')
export class HealthController {
  @Get()
  get(): Health {
    return { ok: true, version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev' };
  }
}
