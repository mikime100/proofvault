import { useState, useEffect, useCallback, useRef } from 'react';
import { ProofVault } from '@proofvault/sdk';
import { CaptureOrderResponse } from '@proofvault/shared';
import { DEMO_PRODUCT } from '@proofvault/shared/fixtures';
import { ShieldCheck, Play, Download } from 'lucide-react';

type View = 'course' | 'paying' | 'lessons';

// Minimal types for the PayPal JS SDK (v5) Buttons API we use. The SDK is loaded
// from the CDN and does not ship types with this setup.
interface PayPalOrderActions {
  order: {
    create(options: {
      purchase_units: { amount: { value: string; currency_code: string } }[];
    }): Promise<string>;
  };
}
interface PayPalButtonOptions {
  createOrder: (_data: unknown, actions: PayPalOrderActions) => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError: (err: unknown) => void;
}
interface PayPalSDK {
  Buttons(options: PayPalButtonOptions): { render(selector: string): Promise<void> };
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
const TOKEN_KEY = 'pv_access_token';
const LOGIN_KEY = 'pv_login_fired';
const paypal = () => (window as { paypal?: PayPalSDK }).paypal;

function tokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('t');
}

export function App() {
  const [view, setView] = useState<View>(() =>
    tokenFromUrl() || localStorage.getItem(TOKEN_KEY) ? 'lessons' : 'course',
  );
  const [accessToken, setAccessToken] = useState<string | null>(
    () => tokenFromUrl() ?? localStorage.getItem(TOKEN_KEY),
  );
  const [error, setError] = useState<string | null>(null);
  const [paypalSdkLoaded, setPaypalSdkLoaded] = useState(false);
  const [paypalSdkFailed, setPaypalSdkFailed] = useState(false);
  const buttonsRendered = useRef(false);
  const paypalContainer = useRef<HTMLDivElement>(null);

  // A ?t=<token> link is the buyer's private access link: keep it and remember it.
  useEffect(() => {
    const t = tokenFromUrl();
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      setAccessToken(t);
      setView('lessons');
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    ProofVault.init({ apiUrl: API_URL, accessToken });
    // login fires once per browser session, not once per page view.
    if (!sessionStorage.getItem(LOGIN_KEY)) {
      sessionStorage.setItem(LOGIN_KEY, '1');
      void ProofVault.track('login');
    }
  }, [accessToken]);

  const track = useCallback(
    (type: 'login' | 'lesson_view' | 'download' | 'activation', meta?: Record<string, string>) => {
      void ProofVault.track(type, meta);
    },
    [],
  );

  // Load PayPal JS SDK (v5) from CDN.
  useEffect(() => {
    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    if (!clientId || paypal()) {
      setPaypalSdkLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = () => setPaypalSdkLoaded(true);
    script.onerror = () => {
      setPaypalSdkLoaded(true);
      setPaypalSdkFailed(true);
    };
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
    if (!paypalSdkLoaded) return;
    if (paypalSdkFailed || !paypal()) {
      setError('PayPal checkout is unavailable right now');
      setView('course');
      return;
    }
    if (buttonsRendered.current || !paypalContainer.current) return;

    paypal()!.Buttons({
      // Our api creates the order row AND the PayPal order server-side and
      // returns the PayPal order id; the SDK just needs that id to render checkout.
      createOrder: async () => {
        const res = await fetch(`${API_URL}/store/orders`, { method: 'POST' });
        if (!res.ok) throw new Error('Could not create order');
        const { paypalOrderId } = (await res.json()) as { paypalOrderId?: string };
        if (!paypalOrderId) throw new Error('Order creation returned no id');
        return paypalOrderId;
      },
      onApprove: async (data) => {
        try {
          const res = await fetch(`${API_URL}/store/orders/${data.orderID}/capture`, {
            method: 'POST',
          });
          if (!res.ok) throw new Error('Failed to capture order');
          const captureData = CaptureOrderResponse.parse(await res.json());
          const token = captureData.accessToken;
          localStorage.setItem(TOKEN_KEY, token);
          window.history.replaceState(null, '', `?t=${token}`);
          setAccessToken(token);
          setView('lessons');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Capture failed');
          setView('course');
        }
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'PayPal checkout failed');
        setView('course');
      },
    }).render('#paypal-button-container').catch(() => {
      setError('PayPal checkout is unavailable right now');
      setView('course');
    });

    buttonsRendered.current = true;
  }, [view, paypalSdkLoaded, paypalSdkFailed]);

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
            className="w-full py-3 px-4 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
          >
            Pay with PayPal
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

      <div className="mb-6 rounded border border-green-200 bg-green-50 p-4">
        <h2 className="text-sm font-semibold text-green-900">Your private course link</h2>
        <p className="mt-1 break-all font-mono text-xs text-green-800">
          {window.location.origin}
          {window.location.pathname}?t={accessToken}
        </p>
        <p className="mt-1 text-xs text-green-800">
          Bookmark it — anyone with this link can open your course.
        </p>
      </div>

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
