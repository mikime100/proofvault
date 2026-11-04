import { useState, useEffect, useCallback, useRef } from 'react';
import { ProofVault } from '@proofvault/sdk';
import { DEMO_PRODUCT } from '@proofvault/shared/fixtures';
import { ShieldCheck, Play, Download } from 'lucide-react';

type View = 'course' | 'paying' | 'lessons';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

export function App() {
  const [view, setView] = useState<View>('course');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paypalSdkLoaded, setPaypalSdkLoaded] = useState(false);
  const buttonsRendered = useRef(false);
  const paypalContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize the ProofVault tracking SDK once we have the order's access token.
    if (accessToken) {
      ProofVault.init({
        apiUrl: API_URL,
        accessToken,
      });
    }
  }, [accessToken, API_URL]);

  const track = useCallback(
    (type: 'login' | 'lesson_view' | 'download' | 'activation', meta?: Record<string, string>) => {
      void ProofVault.track(type, meta);
    },
    [],
  );

  // Load PayPal JS SDK v6 from CDN.
  useEffect(() => {
    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    if (!clientId || (window as any).paypal) {
      setPaypalSdkLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = () => setPaypalSdkLoaded(true);
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const createOrder = () => {
    setError(null);
    buttonsRendered.current = false;
    setView('paying');
  };

  // Render PayPal buttons when entering the paying view.
  useEffect(() => {
    if (view !== 'paying') {
      buttonsRendered.current = false;
      return;
    }
    if (
      buttonsRendered.current ||
      !paypalContainer.current ||
      !paypalSdkLoaded ||
      !(window as any).paypal
    )
      return;

    (window as any).paypal.Buttons({
      createOrder: (_data: unknown, actions: any) => {
        return actions.order.create({
          purchase_units: [
            {
              amount: {
                value: DEMO_PRODUCT.price.value,
                currency_code: DEMO_PRODUCT.price.currency,
              },
            },
          ],
        });
      },
      onApprove: async (data: any) => {
        try {
          const res = await fetch(`${API_URL}/store/orders/${data.orderID}/capture`, {
            method: 'POST',
          });
          if (!res.ok) throw new Error('Failed to capture order');
          const captureData = await res.json();
          setAccessToken(captureData.accessToken ?? data.orderID);
          setView('lessons');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Capture failed');
          setView('course');
        }
      },
      onError: (err: any) => {
        setError(err?.message ?? 'PayPal checkout failed');
        setView('course');
      },
    }).render('#paypal-button-container');

    buttonsRendered.current = true;
  }, [view, paypalSdkLoaded, API_URL, DEMO_PRODUCT, createOrder, setView, setError]);

  if (view === 'course') {
    return (
      <main className="mx-auto max-w-xl p-8 font-sans">
        <div className="mb-8">
          <ShieldCheck className="size-6 text-blue-600" />
          <h1 className="text-2xl font-semibold">{DEMO_PRODUCT.name}</h1>
          <p className="mt-2 text-lg">${DEMO_PRODUCT.price.value}</p>
        </div>

        <div className="rounded border border-dashed p-6 text-center">
          <p className="text-sm text-neutral-500 mb-4">
            Secure checkout via PayPal sandbox. Your access will be logged to protect against payment fraud.
          </p>
          <button
            onClick={createOrder}
            disabled={error !== null}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {error ? 'Checkout failed - try again' : 'Pay with PayPal'}
          </button>
          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          Access to this course is logged (time, IP, device) to protect against payment fraud.
        </p>
      </main>
    );
  }

  if (view === 'paying') {
    return (
      <main className="mx-auto max-w-xl p-8 font-sans">
        <h1 className="text-2xl font-semibold">Processing payment…</h1>
        <p className="mt-2 text-sm text-neutral-500">Complete the PayPal checkout to unlock your lessons.</p>
        <div id="paypal-button-container" ref={paypalContainer} className="mt-6" />
        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}
      </main>
    );
  }

  // Lessons view - after successful payment
  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="size-5 text-green-600" />
        <h1 className="text-2xl font-semibold">Course unlocked</h1>
      </div>
      <p className="mb-6 text-sm text-neutral-500">
        Your access is being tracked (time, IP, device) as proof of purchase.
      </p>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold border-b pb-2">Lessons</h2>
        {[1, 2, 3, 4].map((lesson) => (
          <div key={lesson} className="flex justify-between items-center p-4 rounded border bg-white">
            <div>
              <h3 className="font-medium">Lesson {lesson}</h3>
              <p className="text-sm text-neutral-500">Video lesson {lesson} of 4</p>
            </div>
            <button
              onClick={() => track('lesson_view', { lesson: String(lesson) })}
              className="flex items-center gap-2 py-2 px-3 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              <Play size={16} /> View lesson {lesson}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 rounded border bg-amber-50">
        <div className="flex items-center gap-3 mb-3">
          <Download size={20} className="text-amber-600" />
          <h3 className="font-medium">Bonus PDF</h3>
        </div>
        <button
          onClick={() => track('download', { file: 'bonus.pdf' })}
          className="w-full py-3 px-4 bg-amber-600 text-white rounded font-medium hover:bg-amber-700"
        >
          Download bonus.pdf
        </button>
      </div>
    </main>
  );
}
