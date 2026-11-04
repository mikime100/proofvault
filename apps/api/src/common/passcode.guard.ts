import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { DEMO_PASSCODE_HEADER } from '@proofvault/shared';
import type { Request } from 'express';
import { AppError } from './api-error.filter';

/**
 * Put @UseGuards(PasscodeGuard) on every route that changes something.
 * With no DEMO_PASSCODE set (local dev) it lets everything through.
 */
@Injectable()
export class PasscodeGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.DEMO_PASSCODE;
    if (!expected) return true;
    const given = ctx.switchToHttp().getRequest<Request>().header(DEMO_PASSCODE_HEADER);
    if (given !== expected) throw new AppError(401, 'BAD_PASSCODE', 'Demo passcode required');
    return true;
  }
}
