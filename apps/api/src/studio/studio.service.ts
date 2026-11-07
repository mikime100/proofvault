import { Inject, Injectable, Logger } from '@nestjs/common';
import type { StudioTurnRequest, StudioTurnResponse } from '@proofvault/shared';
import { AppError } from '../common/api-error.filter';
import { type ChatCompletion, type ChatRequest, fromChatCompletion, toChatRequest } from './studio.convert';

/** Nest token for the chat call. Tests override it, so they never reach DeepSeek. */
export const STUDIO_CHAT = Symbol('STUDIO_CHAT');
export type StudioChat = (body: ChatRequest) => Promise<ChatCompletion>;

/** The real call. Key and model come from the server's env (LLM_API_KEY, LLM_MODEL), never the browser. */
export const deepseekChat: StudioChat = async (body) => {
  const key = process.env.LLM_API_KEY;
  if (!key || key === 'pending') throw new AppError(503, 'LLM_NOT_CONFIGURED', 'LLM_API_KEY is not set');
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.LLM_MODEL ?? 'deepseek-chat', ...body }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, 'LLM_ERROR', `DeepSeek answered ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as ChatCompletion;
};

/** Per-visitor and per-day limits, so a public demo route cannot run up the LLM bill. */
const PER_MINUTE = 20;
const PER_DAY = 1_000;

@Injectable()
export class StudioService {
  private readonly log = new Logger('Studio');
  private readonly recent = new Map<string, number[]>();
  private day = { date: '', count: 0 };

  constructor(@Inject(STUDIO_CHAT) private readonly chat: StudioChat) {}

  async ask(req: StudioTurnRequest, visitor: string): Promise<StudioTurnResponse> {
    this.allow(visitor);
    const completion = await this.chat(toChatRequest(req));
    const res = fromChatCompletion(completion);
    this.log.log(`turn for ${visitor}: ${res.output.map((o) => o.type).join(', ') || 'empty'} (${res.status})`);
    return res;
  }

  private allow(visitor: string) {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    if (this.day.date !== today) this.day = { date: today, count: 0 };
    if (this.day.count >= PER_DAY) throw new AppError(429, 'DAILY_LIMIT', 'The Studio agent has reached today\'s limit');

    const times = (this.recent.get(visitor) ?? []).filter((t) => now - t < 60_000);
    if (times.length >= PER_MINUTE) throw new AppError(429, 'RATE_LIMITED', 'Too many requests, wait a minute');
    times.push(now);
    this.recent.set(visitor, times);
    this.day.count++;
  }
}
