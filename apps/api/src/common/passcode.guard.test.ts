import { Controller, INestApplication, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEMO_PASSCODE_HEADER } from '@proofvault/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorFilter } from './api-error.filter';
import { PasscodeGuard } from './passcode.guard';

@Controller('write')
class WriteController {
  @Post()
  @UseGuards(PasscodeGuard)
  write() {
    return { ok: true };
  }
}

describe('PasscodeGuard', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [WriteController] }).compile();
    app = mod.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
  });
  afterAll(() => app.close());
  afterEach(() => {
    delete process.env.DEMO_PASSCODE;
  });

  it('lets writes through when no passcode is configured', async () => {
    await request(app.getHttpServer()).post('/write').expect(201);
  });

  it('rejects a missing or wrong passcode with the ApiError shape', async () => {
    process.env.DEMO_PASSCODE = 'secret';
    const res = await request(app.getHttpServer())
      .post('/write')
      .set(DEMO_PASSCODE_HEADER, 'wrong')
      .expect(401);
    expect(res.body).toEqual({ error: { code: 'BAD_PASSCODE', message: 'Demo passcode required' } });
  });

  it('accepts the right passcode', async () => {
    process.env.DEMO_PASSCODE = 'secret';
    await request(app.getHttpServer()).post('/write').set(DEMO_PASSCODE_HEADER, 'secret').expect(201);
  });
});
