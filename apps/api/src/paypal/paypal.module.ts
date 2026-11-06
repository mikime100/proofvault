import { Global, Module } from '@nestjs/common';
import { PaypalClient } from './paypal.client';

@Global()
@Module({ providers: [PaypalClient], exports: [PaypalClient] })
export class PaypalModule {}
