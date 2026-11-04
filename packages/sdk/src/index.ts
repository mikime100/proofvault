// Moges owns this file. Keep it tiny: no dependencies, under 2 KB, never throws.
// Types only from shared (erased at build), so nothing from shared ends up in the bundle.
import type { AccessEventType, TrackRequest } from '@proofvault/shared';

let config: { apiUrl: string; paypalOrderId: string } | null = null;

export function init(opts: { apiUrl: string; paypalOrderId: string }): void {
  config = opts;
}

export async function track(type: AccessEventType, meta?: Record<string, string>): Promise<void> {
  if (!config) return;
  const body: TrackRequest = { paypalOrderId: config.paypalOrderId, type, ...(meta ? { meta } : {}) };
  try {
    await fetch(`${config.apiUrl}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // A tracking failure must never break the buyer's page.
  }
}
