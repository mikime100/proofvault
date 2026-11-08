// The Rules page's API: GET and PUT /seller/rules. Real Postgres, seeded demo seller.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { DEMO_PASSCODE_HEADER, type SellerRules } from '@proofvault/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ApiErrorFilter } from '../src/common/api-error.filter';
import { PrismaService } from '../src/db/prisma.service';

describe('seller rules', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let original: Prisma.JsonValue;
  let sellerId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);
    const seller = await prisma.seller.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
    sellerId = seller.id;
    original = seller.autoActionRules;
  });
  afterEach(() => {
    delete process.env.DEMO_PASSCODE;
  });
  afterAll(async () => {
    await prisma.seller.update({ where: { id: sellerId }, data: { autoActionRules: original as Prisma.InputJsonValue } });
    await app.close();
  });

  it('GET returns the rules the analysis uses', async () => {
    const res = await http().get('/seller/rules').expect(200);
    expect(res.body).toEqual(original);
  });

  it('PUT saves valid rules and GET then returns them', async () => {
    const next: SellerRules = { ...(original as SellerRules), autoSubmitMinScore: 80, offerPercent: 40 };
    await http().put('/seller/rules').send(next).expect(200, next);
    await http().get('/seller/rules').expect(200, next);
  });

  it('PUT refuses invalid rules with 400 and changes nothing', async () => {
    const before = (await http().get('/seller/rules')).body;
    const res = await http().put('/seller/rules').send({ ...before, offerPercent: 500 }).expect(400);
    expect(res.body.error.code).toBe('BAD_RULES');
    await http().get('/seller/rules').expect(200, before);
  });

  it('PUT needs the passcode when one is set; GET stays open', async () => {
    process.env.DEMO_PASSCODE = 'secret';
    const rules = (await http().get('/seller/rules').expect(200)).body;
    await http().put('/seller/rules').send(rules).expect(401);
    await http().put('/seller/rules').set(DEMO_PASSCODE_HEADER, 'secret').send(rules).expect(200);
  });
});
