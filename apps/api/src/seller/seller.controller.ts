import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { SellerRules } from '@proofvault/shared';
import { AppError } from '../common/api-error.filter';
import { PasscodeGuard } from '../common/passcode.guard';
import { PrismaService } from '../db/prisma.service';

/**
 * The seller's auto-action rules (the dashboard's Rules page). One demo seller, so "the seller" is
 * the first one, the same row the analysis reads its rules from. Writes need the demo passcode
 * (decision 14). New rules apply from the next analysis; a frozen evidence package is not redone.
 */
@Controller('seller')
export class SellerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('rules')
  async rules(): Promise<SellerRules> {
    const seller = await this.seller();
    return SellerRules.parse(seller.autoActionRules);
  }

  @Put('rules')
  @UseGuards(PasscodeGuard)
  async save(@Body() body: unknown): Promise<SellerRules> {
    const parsed = SellerRules.safeParse(body);
    if (!parsed.success) {
      const why = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new AppError(400, 'BAD_RULES', why);
    }
    const seller = await this.seller();
    await this.prisma.seller.update({ where: { id: seller.id }, data: { autoActionRules: parsed.data } });
    return parsed.data;
  }

  private async seller() {
    const seller = await this.prisma.seller.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!seller) throw new AppError(404, 'NO_SELLER', 'No seller set up yet (run the seed)');
    return seller;
  }
}
