// The only file in this app that talks to the api (INTEGRATION.md section 5, Moges rules).
// Every response is checked against the shared schema, so a contract break is loud, not silent.
import { DisputeDetail, DisputeList, Health } from '@proofvault/shared';
import { toast } from 'sonner';
import type { z } from 'zod';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const USE_FIXTURES = import.meta.env.VITE_USE_FIXTURES === 'true';

async function get<S extends z.ZodType>(path: string, schema: S, fixture: () => Promise<unknown>) {
  const data = USE_FIXTURES ? await fixture() : await (await fetch(`${API_URL}${path}`)).json();
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error(`Contract mismatch on GET ${path}`, parsed.error.issues);
    toast.error(`API contract mismatch on ${path}`);
    throw parsed.error;
  }
  return parsed.data as z.infer<S>;
}

// Fixtures are loaded lazily so they stay out of the production bundle.
const fixtures = () => import('@proofvault/shared/fixtures');

export const api = {
  health: () => get('/health', Health, async () => ({ ok: true, version: 'fixtures' })),
  disputes: () => get('/disputes', DisputeList, async () => (await fixtures()).disputeListFixture),
  dispute: (id: string) =>
    get(`/disputes/${id}`, DisputeDetail, async () => (await fixtures()).disputeDetailFixtures[id]),
};
