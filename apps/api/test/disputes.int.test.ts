// #5: dispute read endpoints on the seeded scenarios. Needs the seeded database (`pnpm db:reset`).
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { DisputeDetail, DisputeList } from '@proofvault/shared';
import { disputeDetailFixtures } from '@proofvault/shared/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ApiErrorFilter } from '../src/common/api-error.filter';
import { PrismaService } from '../src/db/prisma.service';

const FULL_IP = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;

describe('dispute read endpoints', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await prisma.evidencePackage.deleteMany({ where: { disputeId: 'dsp_s2' } });
    await app.close();
  });

  it('lists all five scenarios in the DisputeList shape', async () => {
    const res = await request(app.getHttpServer()).get('/disputes').expect(200);
    const list = DisputeList.parse(res.body);
    expect(list.items.map((d) => d.id).sort()).toEqual(['dsp_s1', 'dsp_s2', 'dsp_s3', 'dsp_s4', 'dsp_s5']);
    const s4 = list.items.find((d) => d.id === 'dsp_s4')!;
    expect(s4.orderId).toBeNull();
    expect(s4.buyerEmail).toBeNull();
  });

  it('returns one dispute in the DisputeDetail shape with the IP masked', async () => {
    const res = await request(app.getHttpServer()).get('/disputes/dsp_s1').expect(200);
    const detail = DisputeDetail.parse(res.body);
    expect(detail.dispute.amount).toEqual({ value: '49.00', currency: 'USD' });
    expect(detail.order?.checkoutIp).toBe('196.188.x.x');
    expect(JSON.stringify(res.body)).not.toMatch(FULL_IP);
  });

  it('returns S4 cleanly with a null order', async () => {
    const res = await request(app.getHttpServer()).get('/disputes/dsp_s4').expect(200);
    expect(DisputeDetail.parse(res.body).order).toBeNull();
  });

  it('serves a saved analysis with every IP masked, and shows its decision in the list', async () => {
    const analysis = structuredClone(disputeDetailFixtures.dsp_s2!.analysis!);
    analysis.timeline.entries = analysis.timeline.entries.map((e) => ({ ...e, ip: '41.215.88.20' }));
    const json = analysis as unknown as Prisma.InputJsonValue;
    await prisma.evidencePackage.upsert({
      where: { disputeId: 'dsp_s2' },
      update: { analysis: json, draftResponse: analysis.responseText },
      create: { disputeId: 'dsp_s2', analysis: json, draftResponse: analysis.responseText },
    });

    const res = await request(app.getHttpServer()).get('/disputes/dsp_s2').expect(200);
    const detail = DisputeDetail.parse(res.body);
    expect(detail.analysis?.timeline.entries.every((e) => e.ip === '41.215.x.x')).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(FULL_IP);

    const list = DisputeList.parse((await request(app.getHttpServer()).get('/disputes')).body);
    expect(list.items.find((d) => d.id === 'dsp_s2')!.decision).toBe('await_approval');
  });

  it('unknown dispute: 404 in the ApiError shape', async () => {
    const res = await request(app.getHttpServer()).get('/disputes/nope').expect(404);
    expect(res.body.error.code).toBe('DISPUTE_NOT_FOUND');
  });
});
