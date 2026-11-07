// #26: POST /studio/ask relays one AG Studio turn to the LLM. Fake chat call, nothing leaves the machine.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StudioTurnResponse } from '@proofvault/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { ApiErrorFilter } from '../src/common/api-error.filter';
import { AppError } from '../src/common/api-error.filter';
import { STUDIO_CHAT } from '../src/studio/studio.service';

const fakeChat = vi.fn(async (_body: unknown) => ({
  id: 'r1',
  model: 'deepseek-chat',
  choices: [{
    finish_reason: 'tool_calls',
    message: { content: 'Adding a chart.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'addWidget', arguments: '{"kind":"bar"}' } }] },
  }],
  usage: { prompt_tokens: 50, completion_tokens: 10 },
}));

const turn = {
  instructions: 'You build dashboards.',
  tools: [{ name: 'addWidget', description: 'Add a chart', parameters: { type: 'object' } }],
  responseFormat: { type: 'text' },
  input: [{ id: 'm1', kind: 'input', type: 'message', role: 'user', status: 'completed', content: [{ type: 'text', text: 'Win rate by reason?' }] }],
};

describe('POST /studio/ask', () => {
  let app: INestApplication;
  let ip = 0;
  const ask = (body: object = turn, from = `10.9.0.${ip++}`) =>
    request(app.getHttpServer()).post('/studio/ask').set('X-Forwarded-For', from).send(body);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(STUDIO_CHAT).useValue(fakeChat).compile();
    app = mod.createNestApplication();
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
  });
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete process.env.DEMO_PASSCODE;
  });
  afterAll(() => app.close());

  it('relays one turn and answers with Studio output items', async () => {
    const res = await ask().expect(200);
    const body = StudioTurnResponse.parse(res.body);
    expect(body.output.map((o) => o.type)).toEqual(['message', 'function_call']);
    expect(body.output[1]).toMatchObject({ kind: 'output', callId: 'c1', name: 'addWidget' });
    // The model saw the instructions and the user's question, with the tool advertised.
    const sent = fakeChat.mock.calls[0]![0] as { messages: { role: string }[]; tools: unknown[] };
    expect(sent.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(sent.tools).toHaveLength(1);
  });

  it('is open to judges: no passcode needed even when one is set', async () => {
    process.env.DEMO_PASSCODE = 'secret';
    await ask().expect(200);
  });

  it('rejects something that is not a Studio turn: 400', async () => {
    const res = await ask({ hello: 'world' }).expect(400);
    expect(res.body.error.code).toBe('BAD_STUDIO_TURN');
    expect(fakeChat).not.toHaveBeenCalled();
  });

  it('limits each visitor to 20 turns a minute: the 21st gets 429', async () => {
    for (let i = 0; i < 20; i++) await ask(turn, '10.8.8.8').expect(200);
    const res = await ask(turn, '10.8.8.8').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    await ask(turn, '10.8.8.9').expect(200);
  });

  it('an LLM failure comes back in the standard error shape', async () => {
    fakeChat.mockRejectedValueOnce(new AppError(502, 'LLM_ERROR', 'DeepSeek answered 500'));
    const res = await ask().expect(502);
    expect(res.body.error.code).toBe('LLM_ERROR');
  });
});
