import { Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { clientIp, deviceOf } from '../common/client';
import { StoreService } from './store.service';

// Called by the demo store. Open routes: a buyer has no passcode, and PayPal decides who can pay.
@Controller('store/orders')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Post()
  create(@Req() req: Request) {
    return this.store.createOrder({ ip: clientIp(req), device: deviceOf(req.header('user-agent')) });
  }

  @Post(':paypalOrderId/capture')
  @HttpCode(200)
  capture(@Param('paypalOrderId') paypalOrderId: string) {
    return this.store.captureOrder(paypalOrderId);
  }
}
