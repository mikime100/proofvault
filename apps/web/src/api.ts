// The only file in this app that talks to the api (INTEGRATION.md section 6, Moges rules).
// Every response is checked against the shared schema, so a contract break is loud, not silent.
import {
  ActionLogEntry,
  DEMO_PASSCODE_HEADER,
  DisputeDetail,
  DisputeList,
  Health,
  SellerRules,
  SyncResult,
} from '@proofvault/shared';
import { toast } from 'sonner';
import { z } from 'zod';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const USE_FIXTURES = import.meta.env.VITE_USE_FIXTURES === 'true';

async function get<S extends z.ZodType>(path: string, schema: S, fixture: () => Promise<unknown>) {
  let data: unknown;
  if (USE_FIXTURES) data = await fixture();
  else {
    const res = await fetch(`${API_URL}${path}`);
    data = await res.json().catch(() => null);
    if (!res.ok) throw errorOf(data, res.status);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error(`Contract mismatch on GET ${path}`, parsed.error.issues);
    toast.error(`API contract mismatch on ${path}`);
    throw parsed.error;
  }
  return parsed.data as z.infer<S>;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Error body from the api: { error: { code, message } } (apps/api common/api-error.filter.ts). */
function errorOf(data: unknown, status: number): ApiError {
  const err =
    data && typeof data === 'object' && 'error' in data && data.error && typeof data.error === 'object'
      ? (data.error as { code?: unknown; message?: unknown })
      : null;
  return new ApiError(
    typeof err?.code === 'string' ? err.code : `HTTP_${status}`,
    typeof err?.message === 'string' ? err.message : `Request failed (${status})`,
  );
}

async function send<S extends z.ZodType>(
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  schema: S,
  fixture: () => Promise<unknown>,
  passcode: string,
) {
  if (USE_FIXTURES) return schema.parse(await fixture()) as z.infer<S>;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', [DEMO_PASSCODE_HEADER]: passcode },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw errorOf(data, res.status);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error(`Contract mismatch on ${method} ${path}`, parsed.error.issues);
    toast.error(`API contract mismatch on ${path}`);
    throw parsed.error;
  }
  return parsed.data as z.infer<S>;
}

const post = <S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  fixture: () => Promise<unknown>,
  passcode: string,
) => send('POST', path, body, schema, fixture, passcode);

const put = <S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  fixture: () => Promise<unknown>,
  passcode: string,
) => send('PUT', path, body, schema, fixture, passcode);

// Fixtures are loaded lazily so they stay out of the production bundle.
const fixtures = () => import('@proofvault/shared/fixtures');

const okAction = (disputeId: string, action: string, detailText: string): Promise<ActionLogEntry> =>
  Promise.resolve({
    id: `act_ui_${Date.now()}`,
    disputeId,
    action: action as ActionLogEntry['action'],
    actor: 'seller',
    ok: true,
    detail: detailText,
    createdAt: new Date().toISOString(),
  });

export const api = {
  health: () => get('/health', Health, async () => ({ ok: true, version: 'fixtures' })),
  disputes: () => get('/disputes', DisputeList, async () => (await fixtures()).disputeListFixture),
  dispute: (id: string) =>
    get(`/disputes/${id}`, DisputeDetail, async () => (await fixtures()).disputeDetailFixtures[id]),

  // POST /disputes/:id/actions {type: submit | offer | accept | escalate}
  // amount only for an offer; without it the api offers the seller's offerPercent.
  disputeAction: (
    id: string,
    type: 'submit' | 'offer' | 'accept' | 'escalate',
    passcode: string,
    amount?: { value: string; currency: string },
  ) =>
    post(
      `/disputes/${id}/actions`,
      amount && type === 'offer' ? { type, amount } : { type },
      ActionLogEntry,
      () => okAction(id, type, `Seller ${type} from dashboard`),
      passcode,
    ),

  // POST /disputes/:id/sandbox/:step: step is require-evidence or adjudicate
  sandboxStep: (id: string, step: 'require-evidence' | 'adjudicate', passcode: string) =>
    post(
      `/disputes/${id}/sandbox/${step}`,
      {},
      ActionLogEntry,
      () => okAction(id, step === 'require-evidence' ? 'require_evidence' : 'adjudicate', `Sandbox ${step}`),
      passcode,
    ),

  // POST /disputes/sync: manual poll of PayPal
  syncDisputes: (passcode: string) =>
    post(
      '/disputes/sync',
      {},
      SyncResult,
      async () => ({ synced: 0 }),
      passcode,
    ),

  // POST /disputes/fetch {caseId}: load one PayPal case by id (sandbox list lags)
  fetchDispute: (caseId: string, passcode: string) =>
    post(
      '/disputes/fetch',
      { caseId },
      DisputeDetail,
      async () => {
        const fx = await fixtures();
        const found = Object.values(fx.disputeDetailFixtures).find(
          (d) => d.dispute.paypalDisputeId === caseId,
        );
        if (!found) throw new Error(`No fixture dispute with case id ${caseId}`);
        return found;
      },
      passcode,
    ),

  rules: () => get('/seller/rules', SellerRules, async () => (await fixtures()).DEFAULT_RULES),
  saveRules: (rules: SellerRules, passcode: string) =>
    put('/seller/rules', rules, SellerRules, async () => rules, passcode),
};
