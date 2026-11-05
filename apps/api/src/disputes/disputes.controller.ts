import { Controller, Get, Param } from '@nestjs/common';
import type { DisputeDetail, DisputeList } from '@proofvault/shared';
import { DisputesService } from './disputes.service';

// Reads stay open for judges (decision 14). Write routes added later get @UseGuards(PasscodeGuard).
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  list(): Promise<DisputeList> {
    return this.disputes.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<DisputeDetail> {
    return this.disputes.get(id);
  }
}
