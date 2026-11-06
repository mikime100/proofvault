# Demo click path (owner: Moges)

Mike runs this on staging at every checkpoint. Each step: what to do, what you should see.
Local run: `pnpm dev`, dashboard on http://localhost:5173 with `VITE_USE_FIXTURES=true` in `apps/web/.env`.

## Dispute list and detail (fixtures)

1. Open http://localhost:5173. You should see 5 disputes (S1–S5) with reason, amount, status, deadline, score and a decision badge.
2. The S1 row (`PP-D-S1`, $49) shows an "Auto-submit" badge and score 88. Open it.
3. Detail page: order card with masked IP (`196.188.x.x`), AI analysis with score 88 and reasons, two accepted claims, and the evidence timeline where cited records are highlighted amber with "cited as evidence".
4. Go back and open `PP-D-S5`. You should see the "Removed by guardrail" box with two rejected claims and their reasons (invented record, inflated count).
5. Open `PP-D-S4`. No order card — instead a "No matching order" notice and the `no_matching_order` flag banner.
6. Open `PP-D-S3`. Score 12, "Accept claim" decision, `no_access_events` flag.

## Approval, rules, sandbox controls

7. On any dispute in `WAITING_FOR_SELLER_RESPONSE` (e.g. S2), click **Submit evidence**. A passcode dialog appears once — enter any value (locally `DEMO_PASSCODE` is empty). You get a success toast and a new row in the Activity log.
8. Try **Make offer** and **Accept claim** the same way.
9. Click **Require evidence** / **Adjudicate** under Sandbox controls — sandbox-only PayPal stage calls, also logged.
10. On the list page, type `PP-D-S2` in the case ID box and click **Fetch case** — it loads that dispute (fixtures map case IDs to seed disputes).
11. Click **Sync now** — runs the manual dispute poll.
12. Open **Rules** in the nav. Change e.g. `autoSubmitMinScore` or `offerPercent` and click **Save rules** — passcode asked once (already stored), toast confirms.

## Store (buyer side)

13. Open http://localhost:5174. Course page shows "Figma to Code: Mini Course", $49.00, PayPal button, and the "access is logged" line.
14. With a real `VITE_PAYPAL_CLIENT_ID`, the PayPal button renders sandbox buttons. Approving payment calls `/store/orders/:id/capture` (needs Mike's endpoints, #3/#4).
15. Open http://localhost:5174/?t=test123 — lands directly on the unlocked lessons page with the private link box. `login` fires once per session; lesson views and the bonus PDF download fire tracking events.
