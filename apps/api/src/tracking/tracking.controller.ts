import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TrackRequest } from '@proofvault/shared';
import type { Request } from 'express';
import { AppError } from '../common/api-error.filter';
import { clientIp, deviceOf } from '../common/client';
import { PrismaService } from '../db/prisma.service';

/**
 * The tracking number for digital goods. The store's SDK posts here on every login, lesson view
 * and download. Decision 2: the event is tied to the order's private accessToken, and the server
 * sets the time and IP. Anything else the browser sends (an `at` or `ip` field) is dropped.
 */
@Controller('track')
export class TrackingController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  async track(@Body() body: unknown, @Req() req: Request): Promise<void> {
    const parsed = TrackRequest.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'BAD_TRACK_REQUEST', parsed.error.issues.map((i) => i.message).join('; '));
    }
    const { accessToken, type, meta } = parsed.data;

    const order = await this.prisma.order.findUnique({ where: { accessToken }, select: { id: true } });
    if (!order) throw new AppError(401, 'UNKNOWN_ACCESS_TOKEN', 'This access link is not valid');

    const userAgent = req.header('user-agent') ?? '';
    await this.prisma.accessEvent.create({
      data: {
        orderId: order.id,
        type,
        ip: clientIp(req),
        device: deviceOf(userAgent),
        userAgent,
        meta: meta as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
