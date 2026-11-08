# PayPal sandbox: what we have actually seen

Facts from real sandbox calls, not from docs. Add to this whenever PayPal surprises us.

## Nov 5: first dispute (smoke test)
- Case `PP-R-WQU-10196685`, opened by the sandbox buyer on a captured $49 order.
- `GET /v1/customer/disputes/{id}` works straight away (HTTP 200, full details).
- **`GET /v1/customer/disputes` (the list) returned 0 items for the first few minutes**, even
  filtered by `disputed_transaction_id` or `start_time`. Then it caught up. So the list lags a new
  case by minutes. **Do not rely on the list to find new disputes fast.** Use the webhook's
  dispute id first, the poll as a backstop, and a "fetch by case id" control for the demo.
- `disputed_transactions[0].seller_transaction_id` = our **capture id**. Matching on capture id works.
  `buyer_transaction_id` is a different id (what the buyer sees). Ignore it.
- Right after opening: `status: UNDER_REVIEW`, `dispute_state: UNDER_PAYPAL_REVIEW`,
  `dispute_life_cycle_stage: INQUIRY`. **A few minutes later it moved by itself to
  `WAITING_FOR_SELLER_RESPONSE`** (still stage `INQUIRY`). Auto-actions (decision 9) wait for that
  status, so expect a few minutes between "dispute opened" and "agent acts". Plan the video around it.
- `items[0].item_type: DIGITAL_DOWNLOAD`, `seller_protection_eligible: false`.
- The buyer's message and attachment come back in `messages[]` and in `evidences[]` with
  `source: SUBMITTED_BY_BUYER`.

## Nov 6: intake
- The **list** gives `update_time` rounded to whole seconds (`19:45:54.000Z`); the **full case** keeps
  milliseconds (`19:45:54.083Z`). Compare them to the second, or every poll reloads every case.
- The full case has `seller_response_due_date` (20 days after opening for this inquiry).
- A list item does not carry `seller_transaction_id`, only `buyer_transaction_id`. Always fetch the
  full case before matching it to an order.

## Nov 6 to 7: actions on a dispute (live tests on the throwaway case PP-R-WQU-10196685)
- **The case's `links` list is PayPal's own list of what you may do right now** (`accept_claim`,
  `provide_evidence`, `send_message`, `escalate`, ...). Anything not listed is refused with
  `ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE`. Check the links before acting.
- `send-message` works in the inquiry stage. After it, the case waits on the buyer (`WAITING_FOR_BUYER_RESPONSE`).
- `provide-evidence` was **refused** while the case was `WAITING_FOR_SELLER_RESPONSE` in the INQUIRY stage.
- `POST .../escalate` with a `note` works (seller side). The case goes to `UNDER_REVIEW` with no actions
  allowed; **a minute or two later** `provide_evidence` appears in its links.
- `provide-evidence` then **works**: multipart with a JSON part `input` and the file part. The case shows
  `PROOF_OF_FULFILLMENT / SUBMITTED_BY_SELLER` with our PDF attached.
- Sandbox `require-evidence` and `adjudicate` were **refused** (`ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE`)
  both before and right after escalating, while the stage was still INQUIRY. Still to find out: which
  stage (CLAIM?) and how long after escalating they become allowed.
- About **30 minutes after escalating**, the case became a claim: `WAITING_FOR_SELLER_RESPONSE`, stage
  `CHARGEBACK`, links `accept_claim, provide_evidence`. Evidence submitted then moves it to `UNDER_REVIEW`
  (links `self, provide_supporting_info`; that is a different endpoint we do not use).
- Sandbox `adjudicate` was still refused right after that. Retry later; every step so far needed PayPal to settle.
- **For the demo (timings matter):** buyer opens dispute (a few minutes to WAITING_FOR_SELLER_RESPONSE),
  seller escalates (about 30 minutes to the claim stage), submit evidence, adjudicate when PayPal allows it.
  So **pre-create the demo disputes the day before** (#27) and record each step when it is ready.

## Nov 7: first full run on Render (case PP-R-OQT-10197028, the live-store purchase)
- 18:34 buyer opened it. 18:37 our poll found it (about 3 minutes, list lag), matched it to our order by
  capture id, DeepSeek scored it 90, decision submit. PayPal status UNDER_REVIEW, no actions allowed, agent waited.
- 18:38 PayPal briefly set WAITING_FOR_SELLER_RESPONSE (still INQUIRY) with `provide_evidence` allowed.
  The poll saw the change, re-analysis ran, and **the agent submitted the evidence one second later; PayPal
  accepted it** (PROOF_OF_FULFILLMENT, our PDF attached, claims as notes).
- **So evidence IS accepted in the inquiry stage** while PayPal waits on the seller. The Nov 6 refusal on the
  smoke case happened after we had sent a message first. The seller window can be short (about a minute here),
  which is a reason to keep the poll at 60 seconds and to register the webhook.
- After the seller's evidence, the case moves to `WAITING_FOR_BUYER_RESPONSE` (the buyer may answer), with
  links `accept_claim, send_message, escalate`. No seller due date in that state (`seller_response_due_date` missing).

## Nov 8: first case won (PP-R-HUT-10197163, live store purchase)
- Same start as Nov 7: poll found it in about 3 minutes, agent submitted evidence in the short seller window.
- Escalating reached the claim stage (`CHARGEBACK`, links `provide_evidence, accept_claim`) in **4 minutes**, not 30.
- After the claim-stage evidence the case sat at `UNDER_REVIEW` / `UNDER_PAYPAL_REVIEW` with links
  `self, provide_supporting_info`. Adjudicate was refused then.
- About **30 minutes after that evidence**, PayPal added `adjudicate, accept_claim, require_evidence` to the links.
  **Adjudicate only works once its link is there.** Our `allowedActions` drops unknown links, so check `raw->'links'`.
- Adjudicate `SELLER_FAVOR` was then accepted; about 3 minutes later the case was `RESOLVED`, outcome code
  `RESOLVED_SELLER_FAVOUR`, and our Outcome row said `won`.

## Checkout quirks
- Creating an order without `payment_source.paypal.experience_context.return_url` makes the
  buyer page loop on "Continue to Review Order". Always set `user_action: PAY_NOW` and a `return_url`.
- With `payment_source` set, create order answers **HTTP 200** and status `PAYER_ACTION_REQUIRED`,
  and the buyer link is `rel: payer-action` (not `approve`).
- Approving moves no money. The order must be **captured** (`POST /v2/checkout/orders/{id}/capture`).

## Opening a dispute by hand
- Log in at sandbox.paypal.com as the **buyer** (`@personal.example.com`). The seller account
  ("Test Store") crashes the Resolution Center form, because sellers cannot dispute payments they received.
- Each payment can be disputed once. Make one order per demo dispute.
