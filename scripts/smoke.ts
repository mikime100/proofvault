// Day-one risk test (HANDOFF.md section 4): can we reach PayPal sandbox Orders and Disputes?
// Run: pnpm smoke             (reads apps/api/.env)
//      pnpm smoke <orderId>   capture an order the buyer has approved, then stop
//      pnpm smoke PP-...      fetch one dispute by case id, then stop
//
// Steps:
//   1. OAuth token
//   2. Create a $49 order, print the approval link (approve it as the sandbox buyer)
//   3. List disputes, show the first one in full
// To get a dispute: approve the order as the buyer, capture it with `pnpm smoke <orderId>`
// (approving alone moves no money), open a dispute from the buyer account at
// sandbox.paypal.com, then run `pnpm smoke` again.

const BASE =
  process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;

function fail(msg: string): never {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function main() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || PAYPAL_CLIENT_ID.startsWith('your-')) {
    fail('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in apps/api/.env');
  }

  // 1. Token
  const tokenRes = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!tokenRes.ok) fail(`OAuth token: HTTP ${tokenRes.status} ${await tokenRes.text()}`);
  const { access_token: token, scope } = (await tokenRes.json()) as { access_token: string; scope: string };
  console.log('1. Token OK');
  const hasDisputes = scope.includes('disputes');
  console.log(`   Disputes scope in token: ${hasDisputes ? 'yes' : 'NO (enable Disputes in the app features)'}`);

  // Dispute mode: fetch one case by id. The list endpoint can lag minutes behind a new case,
  // fetching by id works straight away.
  const arg = process.argv[2];
  if (arg?.startsWith('PP-')) {
    const one = await call(token, 'GET', `/v1/customer/disputes/${arg}`);
    if (one.status !== 200) fail(`Dispute ${arg}: HTTP ${one.status} ${JSON.stringify(one.json)}`);
    const tx = (one.json.disputed_transactions as { seller_transaction_id: string }[])[0];
    console.log(`Dispute ${arg}: ${String(one.json.status)} / ${String(one.json.dispute_life_cycle_stage)}`);
    console.log(`   Reason: ${String(one.json.reason)}`);
    console.log(`   Seller transaction (our capture id): ${tx?.seller_transaction_id}`);
    console.log('\nPASS: dispute readable by id.');
    return;
  }

  // Capture mode: take the money for an order the buyer approved.
  const captureId = arg;
  if (captureId) {
    const cap = await call(token, 'POST', `/v2/checkout/orders/${captureId}/capture`);
    if (cap.status !== 201) fail(`Capture: HTTP ${cap.status} ${JSON.stringify(cap.json)}`);
    const units = cap.json.purchase_units as { payments: { captures: { id: string }[] } }[];
    console.log(`Captured order ${captureId}: ${String(cap.json.status)}`);
    console.log(`   Capture id: ${units[0]?.payments.captures[0]?.id}`);
    console.log('Now open a dispute for this payment as the buyer at sandbox.paypal.com.');
    return;
  }

  // 2. Order
  const order = await call(token, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: 'USD', value: '49.00' }, description: 'Smoke test course' }],
    // Without a return_url PayPal shows "Continue to Review Order" and loops back to itself.
    // PAY_NOW + return_url: the buyer clicks Pay Now and lands on example.com (blank is fine).
    payment_source: {
      paypal: {
        experience_context: {
          user_action: 'PAY_NOW',
          return_url: 'https://example.com/approved',
          cancel_url: 'https://example.com/cancelled',
        },
      },
    },
  });
  // 200 + PAYER_ACTION_REQUIRED when payment_source is given, 201 otherwise.
  if (order.status !== 200 && order.status !== 201) fail(`Create order: HTTP ${order.status} ${JSON.stringify(order.json)}`);
  const links = order.json.links as { rel: string; href: string }[];
  console.log(`2. Order OK: ${String(order.json.id)}`);
  const approve = links.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  console.log(`   Approve as sandbox buyer: ${approve}`);
  console.log(`   Then capture it: pnpm smoke ${String(order.json.id)}`);

  // 3. Disputes
  const list = await call(token, 'GET', '/v1/customer/disputes?page_size=10');
  if (list.status === 403) fail('Disputes list: 403. Enable Disputes in the sandbox app features.');
  if (list.status !== 200) fail(`Disputes list: HTTP ${list.status} ${JSON.stringify(list.json)}`);
  const items = (list.json.items ?? []) as { dispute_id: string; reason: string; status: string }[];
  console.log(`3. Disputes list OK: ${items.length} dispute(s)`);
  for (const d of items) console.log(`   ${d.dispute_id}  ${d.status}  ${d.reason}`);

  if (items[0]) {
    const one = await call(token, 'GET', `/v1/customer/disputes/${items[0].dispute_id}`);
    if (one.status !== 200) fail(`Dispute details: HTTP ${one.status} ${JSON.stringify(one.json)}`);
    console.log('   First dispute details:');
    console.log(JSON.stringify(one.json, null, 2));
    console.log('\nPASS: sandbox orders and disputes both work.');
  } else {
    console.log('\nPARTIAL: API works, but no disputes yet. Pay the order above as the buyer,');
    console.log('open a dispute from the buyer account, then run pnpm smoke again.');
  }
}

void main();
