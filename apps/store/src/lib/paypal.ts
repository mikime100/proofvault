// PayPal JS SDK (v5) checkout, unchanged in behaviour from the first store: our api creates the
// order row and the PayPal order server-side, the SDK renders PayPal's own buttons, and on approval
// our api captures the payment and answers with the buyer's private access token.
import { useEffect, useRef, useState } from 'react';
import { CaptureOrderResponse } from '@proofvault/shared';

// Minimal types for the Buttons API we use. The SDK is loaded from the CDN and ships no types here.
interface PayPalButtonOptions {
  style?: { layout?: 'vertical' | 'horizontal'; shape?: 'rect' | 'pill'; label?: string; height?: number };
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError: (err: unknown) => void;
}
interface PayPalSDK {
  Buttons(options: PayPalButtonOptions): { render(target: HTMLElement): Promise<void> };
}

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
const paypal = () => (window as { paypal?: PayPalSDK }).paypal;

type SdkState = 'loading' | 'ready' | 'failed';

/** Loads the SDK once per page. */
function usePayPalSdk(): SdkState {
  const [state, setState] = useState<SdkState>(() => (paypal() ? 'ready' : 'loading'));
  useEffect(() => {
    if (paypal()) return setState('ready');
    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    if (!clientId) return setState('failed');
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = () => setState(paypal() ? 'ready' : 'failed');
    script.onerror = () => setState('failed');
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);
  return state;
}

/**
 * Renders PayPal's buttons into the returned ref. `onPaid` gets the private access token after a
 * successful capture. `error` is a plain sentence for the buyer, or null.
 */
export function usePayPalCheckout(onPaid: (accessToken: string) => void) {
  const sdk = usePayPalSdk();
  const container = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const paid = useRef(onPaid);
  paid.current = onPaid;

  useEffect(() => {
    if (sdk !== 'ready' || rendered.current || !container.current) return;
    rendered.current = true;
    paypal()!
      .Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'pay', height: 44 },
        createOrder: async () => {
          setError(null);
          const res = await fetch(`${API_URL}/store/orders`, { method: 'POST' });
          if (!res.ok) throw new Error('Could not start the order');
          const { paypalOrderId } = (await res.json()) as { paypalOrderId?: string };
          if (!paypalOrderId) throw new Error('Order creation returned no id');
          return paypalOrderId;
        },
        onApprove: async (data) => {
          setCapturing(true);
          try {
            const res = await fetch(`${API_URL}/store/orders/${data.orderID}/capture`, { method: 'POST' });
            if (!res.ok) throw new Error('capture');
            paid.current(CaptureOrderResponse.parse(await res.json()).accessToken);
          } catch {
            setError('PayPal approved the payment but we could not confirm it. Please try again.');
          } finally {
            setCapturing(false);
          }
        },
        onError: () => setError('PayPal checkout did not complete. Please try again.'),
      })
      .render(container.current)
      .catch(() => setError('PayPal checkout is unavailable right now.'));
  }, [sdk]);

  return {
    container,
    sdk,
    capturing,
    error: sdk === 'failed' ? 'PayPal checkout is unavailable right now.' : error,
  };
}
