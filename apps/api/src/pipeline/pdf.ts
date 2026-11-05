import PDFDocument from 'pdfkit';
import { maskIp } from '@proofvault/shared';
import type { PipelineResult, TimelineEntry } from '@proofvault/shared';

/**
 * Render the evidence package as a PDF buffer for PayPal's provide-evidence upload.
 *
 * The timeline from runPipeline keeps IPs full (the api masks them at the HTTP boundary).
 * The PDF is sent directly to PayPal, so we mask every timeline IP here ourselves.
 * Output stays well under PayPal's 5 MB upload limit.
 */
export async function renderEvidencePdf(result: PipelineResult): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.font('Helvetica-Bold').fontSize(18).text('ProofVault Evidence Package');
  doc.moveDown(0.5);

  doc.font('Helvetica').fontSize(11);
  doc.text(`Dispute: ${result.timeline.disputeId}`);
  doc.text(`Win score: ${result.score.value} / 100`);
  if (result.score.reasons.length > 0) doc.text(`Reasons: ${result.score.reasons.join(' ')}`);
  doc.text(`Recommendation: ${result.recommendation}`);
  doc.text(`Decision: ${result.decision.action} — ${result.decision.reason}`);
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(14).text('Evidence timeline');
  doc.font('Helvetica').fontSize(10);
  for (const e of result.timeline.entries) {
    const parts = [e.at, e.type, e.summary];
    if (e.ip) parts.push(`IP ${maskEntry(e)}`);
    if (e.device) parts.push(`device ${e.device}`);
    doc.text(parts.join('   |   '));
  }
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(14).text('Submitted claims');
  doc.font('Helvetica').fontSize(10);
  if (result.accepted.length === 0) {
    doc.text('None.');
  } else {
    for (const c of result.accepted) {
      doc.text(`- ${c.text}  [records: ${c.recordIds.join(', ')}]`);
    }
  }

  if (result.rejected.length > 0) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(14).text('Removed by guardrail');
    doc.font('Helvetica').fontSize(10);
    for (const r of result.rejected) {
      doc.text(`- ${r.claim.text}  —  ${r.reason}`);
    }
  }

  doc.end();
  return finished;
}

function maskEntry(e: TimelineEntry): string {
  return e.ip ? maskIp(e.ip) : '';
}
