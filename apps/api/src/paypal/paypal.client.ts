import { Injectable } from '@nestjs/common';

// Thin PayPal REST client. Behaviour we rely on is written up in docs/paypal-sandbox-notes.md.

export class PaypalError extends Error {
  constructor(
    readonly status: number,
    /** PayPal's own issue code, e.g. ORDER_NOT_APPROVED. */
    readonly issue: string,
    message: string,
  ) {
    super(message);
  }
}

export interface CreatedOrder {
  id: string;
}

/** The parts of PayPal's dispute JSON we read. Field names are PayPal's own. */
export interface PaypalDispute {
  dispute_id: string;
  create_time: string;
  update_time?: string;
  reason: string;
  status: string;
  dispute_amount: { currency_code: string; value: string };
  seller_response_due_date?: string;
  disputed_transactions?: { seller_transaction_id?: string; custom?: string; invoice_number?: string }[];
}

export interface CapturedOrder {
  status: string;
  captureId: string | null;
  payerEmail: string | null;
}

@Injectable()
export class PaypalClient {
  private token: { value: string; expiresAt: number } | null = null;

  private get base() {
    return process.env.PAYPAL_ENV === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  /** OAuth token, cached until a minute before it expires. */
  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
    if (!id || !secret) throw new PaypalError(500, 'NOT_CONFIGURED', 'PayPal keys are not set');
    const res = await fetch(`${this.base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new PaypalError(res.status, 'AUTH_FAILED', `PayPal token: HTTP ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
    return json.access_token;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return this.readJson<T>(res);
  }

  /** PayPal's answer as JSON, or a PaypalError carrying PayPal's own issue code. */
  private async readJson<T>(res: Response): Promise<T> {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const details = json.details as { issue?: string; description?: string }[] | undefined;
      const issue = details?.[0]?.issue ?? String(json.name ?? 'PAYPAL_ERROR');
      throw new PaypalError(res.status, issue, details?.[0]?.description ?? String(json.message ?? ''));
    }
    return json as T;
  }

  /**
   * Creates a CAPTURE order. Our order id goes in custom_id, the second way to match a dispute
   * to an order (decision 1). Pay Now + return URLs stop the buyer page looping on "Continue to Review Order".
   */
  async createOrder(args: {
    amount: string;
    customId: string;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<CreatedOrder> {
    // PayPal answers 201, or 200 + PAYER_ACTION_REQUIRED when payment_source is set; both are fine.
    const json = await this.call<{ id: string }>('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'USD', value: args.amount },
          custom_id: args.customId,
          description: args.description,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            return_url: args.returnUrl,
            cancel_url: args.cancelUrl,
          },
        },
      },
    });
    return { id: json.id };
  }

  /** One dispute in full. Works straight away for a new case, unlike the list (sandbox notes). */
  getDispute(disputeId: string): Promise<PaypalDispute> {
    return this.call<PaypalDispute>('GET', `/v1/customer/disputes/${encodeURIComponent(disputeId)}`);
  }

  /** Recent disputes, newest first. Lags a new case by minutes, so it is only a backstop. */
  async listDisputes(): Promise<{ dispute_id: string; update_time?: string }[]> {
    const json = await this.call<{ items?: { dispute_id: string; update_time?: string }[] }>(
      'GET',
      '/v1/customer/disputes?page_size=50',
    );
    return json.items ?? [];
  }

  /** Asks PayPal whether a webhook really came from PayPal. */
  async verifyWebhook(headers: Record<string, string | undefined>, event: unknown, webhookId: string): Promise<boolean> {
    const json = await this.call<{ verification_status: string }>('POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: event,
    });
    return json.verification_status === 'SUCCESS';
  }

  /**
   * Sends the evidence package (decision 12): one evidence item, the response text as notes,
   * the PDF as its document. PayPal wants multipart: a JSON part named `input` plus the file.
   */
  async provideEvidence(
    disputeId: string,
    args: { evidenceType: string; notes: string; pdf: Buffer; filename: string },
  ): Promise<unknown> {
    const form = new FormData();
    const input = {
      evidences: [{ evidence_type: args.evidenceType, notes: args.notes, documents: [{ name: args.filename }] }],
    };
    form.append('input', new Blob([JSON.stringify(input)], { type: 'application/json' }));
    form.append('file1', new Blob([new Uint8Array(args.pdf)], { type: 'application/pdf' }), args.filename);
    const res = await fetch(`${this.base}/v1/customer/disputes/${encodeURIComponent(disputeId)}/provide-evidence`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
      body: form,
    });
    return this.readJson(res);
  }

  /** Offers the buyer a partial refund to settle (rule 4 of decide). */
  makeOffer(disputeId: string, args: { amount: string; note: string }): Promise<unknown> {
    return this.call('POST', `/v1/customer/disputes/${encodeURIComponent(disputeId)}/make-offer`, {
      note: args.note,
      offer_type: 'REFUND',
      offer_amount: { currency_code: 'USD', value: args.amount },
    });
  }

  /** Moves an inquiry to PayPal review. A minute or two later PayPal allows evidence (sandbox notes). */
  escalate(disputeId: string, args: { note: string }): Promise<unknown> {
    return this.call('POST', `/v1/customer/disputes/${encodeURIComponent(disputeId)}/escalate`, { note: args.note });
  }

  /** Gives the buyer the refund and closes the case (rule 3 of decide). Cannot be undone. */
  acceptClaim(disputeId: string, args: { note: string }): Promise<unknown> {
    return this.call('POST', `/v1/customer/disputes/${encodeURIComponent(disputeId)}/accept-claim`, { note: args.note });
  }

  /** A message to the buyer, shown in the case. */
  sendMessage(disputeId: string, args: { message: string }): Promise<unknown> {
    return this.call('POST', `/v1/customer/disputes/${encodeURIComponent(disputeId)}/send-message`, {
      message: args.message,
    });
  }

  /** Sandbox only: moves a case to the stage that waits for evidence. */
  requireEvidence(disputeId: string, action: 'SELLER_EVIDENCE' | 'BUYER_EVIDENCE'): Promise<unknown> {
    return this.call('POST', `/v1/customer/disputes/${encodeURIComponent(disputeId)}/require-evidence`, { action });
  }

  /** Sandbox only: decides a case, so the demo can show it resolved. */
  adjudicate(disputeId: string, outcome: 'BUYER_FAVOR' | 'SELLER_FAVOR'): Promise<unknown> {
    return this.call('POST', `/v1/customer/disputes/${encodeURIComponent(disputeId)}/adjudicate`, {
      adjudication_outcome: outcome,
    });
  }

  /** Takes the money for an order the buyer approved. Approving alone moves nothing. */
  async captureOrder(paypalOrderId: string): Promise<CapturedOrder> {
    const json = await this.call<{
      status: string;
      payer?: { email_address?: string };
      purchase_units?: { payments?: { captures?: { id: string }[] } }[];
    }>('POST', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`);
    return {
      status: json.status,
      captureId: json.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null,
      payerEmail: json.payer?.email_address ?? null,
    };
  }
}
