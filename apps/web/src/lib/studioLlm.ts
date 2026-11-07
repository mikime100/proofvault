// Adapter that relays each Studio agent turn to POST /studio/ask on our API,
// where the DeepSeek key lives server-side. Never put AI keys in VITE_* vars.
import { StudioTurnResponse } from '@proofvault/shared';
import type { AgAiEvent, AgLlmAdapter, AgLlmResponse } from 'ag-studio';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const proofvaultLlm: AgLlmAdapter = {
  executeTurn(request, options) {
    const turn = (async () => {
      const res = await fetch(`${API_URL}/studio/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: options?.signal,
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error?.message ?? `Studio agent failed (${res.status})`);
      // Shared zod schema validates the wire shape; ag-studio's types are structurally identical.
      return StudioTurnResponse.parse(json) as unknown as AgLlmResponse;
    })();

    async function* stream(): AsyncGenerator<AgAiEvent> {
      const r = await turn;
      for (const item of r.output) {
        if (item.type === 'message') {
          yield {
            type: 'TEXT_MESSAGE_CHUNK',
            messageId: item.id,
            role: 'assistant',
            delta: item.content
              .map((c) => (c.type === 'text' ? c.text : ''))
              .join(''),
          } as AgAiEvent;
        } else if (item.type === 'function_call') {
          yield { type: 'TOOL_CALL_START', toolCallId: item.callId, toolCallName: item.name } as AgAiEvent;
          yield { type: 'TOOL_CALL_ARGS', toolCallId: item.callId, delta: item.arguments } as AgAiEvent;
          yield { type: 'TOOL_CALL_END', toolCallId: item.callId } as AgAiEvent;
        }
      }
    }

    return { stream: { [Symbol.asyncIterator]: stream }, complete: turn };
  },
};
