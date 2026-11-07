// AG Studio's turn format <-> DeepSeek's chat format (OpenAI-compatible). Pure, no network.
import { randomUUID } from 'node:crypto';
import type { StudioConversationItem, StudioTurnRequest, StudioTurnResponse } from '@proofvault/shared';

/** Hard cap on one reply, so a single turn cannot run up the bill. */
export const MAX_OUTPUT_TOKENS = 4096;

interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: { type: 'function'; function: { name: string; description: string; parameters: unknown } }[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  response_format?: { type: 'json_object' };
  max_tokens: number;
  temperature: number;
}

export interface ChatCompletion {
  id?: string;
  model?: string;
  choices?: {
    finish_reason?: string;
    message?: { content?: string | null; tool_calls?: ChatToolCall[] };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const textOf = (item: Extract<StudioConversationItem, { type: 'message' }>) =>
  item.content
    .map((c) => (typeof c.text === 'string' ? c.text : ''))
    .filter(Boolean)
    .join('\n');

/** Studio's request for one turn, as a DeepSeek chat request. */
export function toChatRequest(req: StudioTurnRequest): ChatRequest {
  const messages: ChatMessage[] = [];
  const system: string[] = [];
  if (req.instructions) system.push(req.instructions);
  if (req.responseFormat.type === 'json') {
    // DeepSeek's JSON mode needs the word "json" in the prompt and does not take a schema.
    system.push(`Reply with JSON only ("${req.responseFormat.name}"), matching this JSON schema:\n${JSON.stringify(req.responseFormat.schema)}`);
  }
  if (system.length) messages.push({ role: 'system', content: system.join('\n\n') });

  for (const item of req.input) {
    if (item.type === 'message') {
      const text = textOf(item);
      if (!text) continue;
      messages.push(item.role === 'assistant' ? { role: 'assistant', content: text } : { role: item.role, content: text });
    } else if (item.type === 'function_call') {
      const call: ChatToolCall = { id: item.callId, type: 'function', function: { name: item.name, arguments: item.arguments } };
      // Consecutive calls (and a call right after the assistant's own text) belong to one assistant message.
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') (last.tool_calls ??= []).push(call);
      else messages.push({ role: 'assistant', content: null, tool_calls: [call] });
    } else if (item.type === 'function_call_output') {
      messages.push({ role: 'tool', tool_call_id: item.callId, content: item.output });
    }
    // 'reasoning' items are Studio's own record of thinking; the model does not need them back.
  }

  const chat: ChatRequest = { messages, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0.2 };
  if (req.tools?.length) {
    chat.tools = req.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    if (req.toolChoice) {
      chat.tool_choice =
        typeof req.toolChoice === 'string' ? req.toolChoice : { type: 'function', function: { name: req.toolChoice.name } };
    }
  }
  if (req.responseFormat.type === 'json') chat.response_format = { type: 'json_object' };
  return chat;
}

/** DeepSeek's reply as Studio's turn response: the output items Studio adds to the conversation. */
export function fromChatCompletion(completion: ChatCompletion): StudioTurnResponse {
  const choice = completion.choices?.[0];
  const message = choice?.message;
  const output: StudioTurnResponse['output'] = [];
  if (message?.content) {
    output.push({
      id: `msg_${randomUUID()}`,
      kind: 'output',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'text', text: message.content, annotations: [] }],
    });
  }
  for (const call of message?.tool_calls ?? []) {
    output.push({
      id: `fc_${randomUUID()}`,
      kind: 'output',
      type: 'function_call',
      callId: call.id,
      name: call.function.name,
      arguments: call.function.arguments || '{}',
      status: 'completed',
    });
  }
  const truncated = choice?.finish_reason === 'length';
  return {
    id: completion.id ?? `resp_${randomUUID()}`,
    createdAt: Date.now(),
    status: truncated ? 'incomplete' : 'completed',
    output,
    ...(completion.model ? { model: completion.model } : {}),
    ...(completion.usage
      ? { usage: { inputTokens: completion.usage.prompt_tokens ?? 0, outputTokens: completion.usage.completion_tokens ?? 0 } }
      : {}),
    ...(truncated ? { incompleteDetails: { reason: 'max_output_tokens' as const } } : {}),
  };
}
