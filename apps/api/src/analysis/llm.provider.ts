import type { Provider } from '@nestjs/common';
import type { LlmClient } from '@proofvault/shared';
import { createLlmClient } from '../pipeline/llm';

/** Nest token for the LLM. Tests override it with a fake, so they never call the network. */
export const LLM_CLIENT = Symbol('LLM_CLIENT');

/**
 * The real client is created on first use: a missing LLM_API_KEY then fails one analysis
 * (logged, retryable) instead of stopping the whole api from starting.
 */
export const llmProvider: Provider = {
  provide: LLM_CLIENT,
  useFactory: (): LlmClient => {
    let client: LlmClient | null = null;
    return { generateJson: (args) => (client ??= createLlmClient()).generateJson(args) };
  },
};
