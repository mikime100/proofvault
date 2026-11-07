import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { StudioTurnRequest, type StudioTurnResponse } from '@proofvault/shared';
import type { Request } from 'express';
import { AppError } from '../common/api-error.filter';
import { clientIp } from '../common/client';
import { StudioService } from './studio.service';

/**
 * #26: one turn of the AG Studio dashboard agent, relayed to the LLM. Open to judges (no passcode),
 * protected by rate limits and size caps instead. Contract: StudioTurnRequest / StudioTurnResponse.
 */
@Controller('studio')
export class StudioController {
  constructor(private readonly studio: StudioService) {}

  @Post('ask')
  @HttpCode(200)
  ask(@Body() body: unknown, @Req() req: Request): Promise<StudioTurnResponse> {
    const parsed = StudioTurnRequest.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'BAD_STUDIO_TURN', parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    return this.studio.ask(parsed.data, clientIp(req));
  }
}
