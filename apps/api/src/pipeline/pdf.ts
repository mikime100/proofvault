import PDFDocument from 'pdfkit';
import { maskIp } from '@proofvault/shared';
import type { DisputeReason, PipelineResult, TimelineEntry } from '@proofvault/shared';

/**
 * Extra context that the PDF benefits from but that lives outside PipelineResult.
 * All fields are optional — the PDF degrades gracefully if they are not supplied.
 */
export interface EvidenceMeta {
  /** PayPal's own case id, e.g. PP-R-HUT-10197163. */
  paypalDisputeId?: string;
  /** Human-readable product name, e.g. "Figma to Code: Mini Course". */
  productName?: string;
  /** PayPal reason enum — rendered as plain English in the PDF. */
  reason?: DisputeReason;
}

/**
 * Map PayPal's reason enum to plain English for PayPal's dispute reviewer.
 * The raw enum string (MERCHANDISE_OR_SERVICE_NOT_RECEIVED) must never appear
 * in a document sent to a human.
 */
const REASON_LABELS: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'Item not received',
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'Item not as described',
  UNAUTHORISED: 'Unauthorised transaction',
  CREDIT_NOT_PROCESSED: 'Credit not processed',
  DUPLICATE_TRANSACTION: 'Duplicate transaction',
  INCORRECT_AMOUNT: 'Incorrect amount',
  PAYMENT_BY_OTHER_MEANS: 'Payment by other means',
  CANCELED_RECURRING_BILLING: 'Cancelled recurring billing',
  PROBLEM_WITH_REMITTANCE: 'Problem with remittance',
  OTHER: 'Other',
};

/** "2026-11-03T09:00:00Z" → "2026-11-03 09:00 UTC" */
function fmtDate(iso: string): string {
  return iso.replace('T', ' ').replace(/:\d{2}(\.\d+)?Z$/, ' UTC').replace(/Z$/, ' UTC');
}

/**
 * Render the evidence package as a PDF buffer for PayPal's provide-evidence upload.
 *
 * This document goes directly to PayPal's dispute reviewer. It contains ONLY evidence:
 * the timeline of what happened and when, and the response built from accepted claims.
 * It does NOT contain our internal win score, LLM reasons, recommendation, or decision.
 *
 * If there are no accepted claims the response section is omitted entirely — we do not
 * tell PayPal "no evidence-backed claims were produced", which would hurt the seller.
 *
 * The timeline keeps IPs full until here; we mask them before writing to the PDF.
 * Output stays well under PayPal's 5 MB upload limit.
 */
export async function renderEvidencePdf(
  result: PipelineResult,
  meta: EvidenceMeta = {},
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, compress: false });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Header
  doc.font('Helvetica-Bold').fontSize(18).text('Evidence Package');
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(11);
  if (meta.paypalDisputeId) doc.text(`Case: ${meta.paypalDisputeId}`);
  if (meta.productName)     doc.text(`Product: ${meta.productName}`);
  if (meta.reason)          doc.text(`Dispute reason: ${REASON_LABELS[meta.reason] ?? meta.reason}`);
  doc.moveDown(0.5);

  // Access history (exclude the dispute-opened entry — that's our metadata, not access)
  doc.font('Helvetica-Bold').fontSize(14).text('Access history');
  doc.font('Helvetica').fontSize(10);
  const accessEntries = result.timeline.entries.filter((e) => e.source !== 'dispute');
  if (accessEntries.length === 0) {
    doc.text('No access events were recorded for this order.');
  } else {
    for (const e of accessEntries) {
      const parts: string[] = [fmtDate(e.at), e.summary];
      if (e.ip) parts.push(`IP ${maskEntry(e)}`);
      if (e.device) parts.push(e.device);
      doc.text(parts.join('   |   '));
    }
  }
  doc.moveDown(0.5);

  // Seller response — only when there are accepted claims.
  // If there are none, omit the section. Never tell PayPal "no evidence was produced".
  if (result.accepted.length > 0) {
    doc.font('Helvetica-Bold').fontSize(14).text('Seller response');
    doc.font('Helvetica').fontSize(11);
    for (const c of result.accepted) {
      doc.text(`- ${c.text}`);
    }
  }

  doc.end();
  return finished;
}

function maskEntry(e: TimelineEntry): string {
  return e.ip ? maskIp(e.ip) : '';
}
