import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Health } from '@proofvault/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorFilter } from './common/api-error.filter';
import { HealthController } from './health.controller';

// Pattern for every api test: response must pass the shared schema.
describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    app = mod.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
  });
  afterAll(() => app.close());

  it('returns the Health contract', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(() => Health.parse(res.body)).not.toThrow();
  });

  it('unknown routes use the ApiError shape', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });
});
