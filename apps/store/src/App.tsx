// Placeholder. Moges builds: course page with PayPal JS SDK v6 checkout, lessons, bonus download.
// Every lesson view and download calls ProofVault.track() from packages/sdk.
import { DEMO_PRODUCT } from '@proofvault/shared/fixtures';

export function App() {
  return (
    <main className="mx-auto max-w-xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">{DEMO_PRODUCT.name}</h1>
      <p className="mt-2 text-lg">${DEMO_PRODUCT.price.value}</p>
      <div className="mt-6 rounded border border-dashed p-6 text-center text-sm text-neutral-500">
        PayPal checkout (JS SDK v6) goes here
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        Access to this course is logged (time, IP, device) to protect against payment fraud.
      </p>
    </main>
  );
}
