/**
 * DeepSeek LlmClient (issue #11).
 *
 * Implements the LlmClient interface from packages/shared so the pipeline never
 * imports this file directly — only the NestJS wiring and the eval script do.
 * Provider, model and key come from env vars (LLM_PROVIDER, LLM_MODEL, LLM_API_KEY).
 *
 * DeepSeek is OpenAI-compatible: POST /v1/chat/completions with
 * response_format: { type: 'json_object' }. The prompt must contain the word "json"
 * (DeepSeek requires it when JSON mode is on — we include it in every system prompt).
 */
import type { LlmClient } from '@proofvault/shared';

const BASE_URL = 'https://api.deepseek.com/v1';

export function createLlmClient(): LlmClient {
  const model = process.env['LLM_MODEL'] ?? 'deepseek-chat';
  const apiKey = process.env['LLM_API_KEY'];
  if (!apiKey) throw new Error('LLM_API_KEY is not set');

  return {
    async generateJson({ system, prompt }: { system: string; prompt: string }): Promise<unknown> {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '(no body)');
        throw new Error(`DeepSeek ${res.status}: ${text}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('DeepSeek returned no content');
      return JSON.parse(content);
    },
  };
}
