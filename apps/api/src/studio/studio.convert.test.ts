import { StudioTurnRequest, StudioTurnResponse } from '@proofvault/shared';
import { describe, expect, it } from 'vitest';
import { fromChatCompletion, MAX_OUTPUT_TOKENS, toChatRequest } from './studio.convert';

const tool = { name: 'addWidget', description: 'Add a chart', parameters: { type: 'object', properties: { kind: { type: 'string' } } } };
const req = (over: object = {}) =>
  StudioTurnRequest.parse({
    instructions: 'You build dashboards.',
    tools: [tool],
    toolChoice: 'auto',
    responseFormat: { type: 'text' },
    input: [
      { id: 'm1', kind: 'input', type: 'message', role: 'user', status: 'completed', content: [{ type: 'text', text: 'Win rate by reason?' }] },
    ],
    ...over,
  });

describe('toChatRequest', () => {
  it('puts the instructions first, then the conversation, with tools and caps', () => {
    const chat = toChatRequest(req());
    expect(chat.messages).toEqual([
      { role: 'system', content: 'You build dashboards.' },
      { role: 'user', content: 'Win rate by reason?' },
    ]);
    expect(chat.tools?.[0]).toEqual({ type: 'function', function: tool });
    expect(chat.tool_choice).toBe('auto');
    expect(chat.max_tokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it('turns tool calls and their results into an assistant message plus tool messages, in order', () => {
    const chat = toChatRequest(
      req({
        input: [
          { type: 'message', role: 'user', content: [{ type: 'text', text: 'Chart it' }] },
          { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Adding two widgets.', annotations: [] }] },
          { type: 'function_call', callId: 'c1', name: 'addWidget', arguments: '{"kind":"bar"}' },
          { type: 'function_call', callId: 'c2', name: 'addWidget', arguments: '{"kind":"pie"}' },
          { type: 'function_call_output', callId: 'c1', output: 'ok' },
          { type: 'function_call_output', callId: 'c2', output: 'ok' },
          { type: 'reasoning', summary: [] },
        ],
      }),
    );
    expect(chat.messages.slice(1)).toEqual([
      { role: 'user', content: 'Chart it' },
      {
        role: 'assistant',
        content: 'Adding two widgets.',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'addWidget', arguments: '{"kind":"bar"}' } },
          { id: 'c2', type: 'function', function: { name: 'addWidget', arguments: '{"kind":"pie"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'ok' },
      { role: 'tool', tool_call_id: 'c2', content: 'ok' },
    ]);
  });

  it('JSON response format: DeepSeek JSON mode, with the schema in the system prompt', () => {
    const chat = toChatRequest(req({ responseFormat: { type: 'json', name: 'plan', schema: { type: 'object' } } }));
    expect(chat.response_format).toEqual({ type: 'json_object' });
    expect(chat.messages[0]!.content).toContain('JSON');
  });

  it('a forced tool becomes a function tool_choice', () => {
    expect(toChatRequest(req({ toolChoice: { name: 'addWidget' } })).tool_choice).toEqual({
      type: 'function',
      function: { name: 'addWidget' },
    });
  });
});

describe('fromChatCompletion', () => {
  it('returns text and tool calls as Studio output items', () => {
    const res = fromChatCompletion({
      id: 'r1',
      model: 'deepseek-chat',
      choices: [{
        finish_reason: 'tool_calls',
        message: { content: 'Here you go.', tool_calls: [{ id: 'c9', type: 'function', function: { name: 'addWidget', arguments: '{"kind":"bar"}' } }] },
      }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    });
    expect(StudioTurnResponse.parse(res)).toEqual(res);
    expect(res.status).toBe('completed');
    expect(res.output.map((o) => o.type)).toEqual(['message', 'function_call']);
    expect(res.output[1]).toMatchObject({ callId: 'c9', name: 'addWidget', arguments: '{"kind":"bar"}' });
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
  });

  it('a reply cut off at the token cap is marked incomplete', () => {
    const res = fromChatCompletion({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] });
    expect(res).toMatchObject({ status: 'incomplete', incompleteDetails: { reason: 'max_output_tokens' } });
  });
});
