// #6: buildTimeline and checkClaims (contract decisions 5 and 11).
import type { Claim, Draft } from '@proofvault/shared';
import { SCENARIOS } from '@proofvault/shared/fixtures';
import { describe, expect, it } from 'vitest';
import { buildTimeline, checkClaims } from '../../src/pipeline';

const ctx = (id: string) => SCENARIOS.find((s) => s.id === id)!.context;
const draft = (...claims: Claim[]): Draft => ({ recommendation: 'fight', claims });
const verdict = (claim: Claim, id = 'S1') => {
  const r = checkClaims(draft(claim), buildTimeline(ctx(id)));
  return r.accepted.length ? 'accepted' : r.rejected[0]!.reason;
};
const S1_LESSONS = ['evt_s1_2', 'evt_s1_3', 'evt_s1_5', 'evt_s1_6'];

describe('buildTimeline', () => {
  it('S1: purchase, every access event and the dispute, oldest first, each keeping its record id', () => {
    const t = buildTimeline(ctx('S1'));
    expect(t.disputeId).toBe('dsp_s1');
    expect(t.orderId).toBe('ord_s1');
    expect(t.entries.map((e) => e.recordId)).toEqual([
      'ord_s1', 'evt_s1_1', 'evt_s1_2', 'evt_s1_3', 'evt_s1_4', 'evt_s1_5', 'evt_s1_6', 'dsp_s1',
    ]);
    expect(t.entries[0]).toMatchObject({ source: 'order', type: 'purchase', ip: '196.188.12.7' });
    expect(t.entries[2]).toMatchObject({ type: 'lesson_view', summary: 'Viewed lesson 1' });
    expect(t.entries[4]).toMatchObject({ type: 'download', summary: 'Downloaded bonus.pdf' });
  });

  it('S4: no order, no events, no crash: only the dispute itself', () => {
    const t = buildTimeline(ctx('S4'));
    expect(t.orderId).toBeNull();
    expect(t.entries.map((e) => e.source)).toEqual(['dispute']);
  });

  it("collapses repeated identical events within 5 seconds into one (double-click guard)", () => {
    const s1 = ctx("S1");
    const dupes = [
      { id: "evt_dup1", orderId: s1.order!.id, type: "download" as const, ip: s1.order!.checkoutIp, device: s1.order!.checkoutDevice, userAgent: "UA", at: "2026-11-02T08:30:01Z", meta: { file: "bonus.pdf" } },
      { id: "evt_dup2", orderId: s1.order!.id, type: "download" as const, ip: s1.order!.checkoutIp, device: s1.order!.checkoutDevice, userAgent: "UA", at: "2026-11-02T08:30:02Z", meta: { file: "bonus.pdf" } },
      { id: "evt_dup3", orderId: s1.order!.id, type: "download" as const, ip: s1.order!.checkoutIp, device: s1.order!.checkoutDevice, userAgent: "UA", at: "2026-11-02T08:30:03Z", meta: { file: "bonus.pdf" } },
    ];
    const t = buildTimeline({ ...s1, events: [...s1.events, ...dupes] });
    const downloads = t.entries.filter((e) => e.type === "download");
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.recordId).toBe("evt_s1_4");
  });

  it("keeps identical events that are more than 5 seconds apart", () => {
    const s1 = ctx("S1");
    const later = [
      { id: "evt_later", orderId: s1.order!.id, type: "download" as const, ip: s1.order!.checkoutIp, device: s1.order!.checkoutDevice, userAgent: "UA", at: "2026-11-02T08:31:00Z", meta: { file: "bonus.pdf" } },
    ];
    const t = buildTimeline({ ...s1, events: [...s1.events, ...later] });
    const downloads = t.entries.filter((e) => e.type === "download");
    expect(downloads).toHaveLength(2);
  });
});

describe('checkClaims', () => {
  it('accepts claims whose citations, dates and counts all match', () => {
    expect(verdict({ text: 'The buyer viewed all 4 lessons between 2026-11-01 and 2026-11-03.', recordIds: S1_LESSONS })).toBe('accepted');
    expect(verdict({ text: 'The buyer studied over 3 days.', recordIds: S1_LESSONS })).toBe('accepted');
    expect(verdict({ text: 'The buyer viewed 3 of 4 lessons.', recordIds: S1_LESSONS.slice(0, 3) })).toBe('accepted');
    expect(verdict({ text: 'The buyer paid 49.00 USD with PayPal.', recordIds: ['ord_s1'] })).toBe('accepted');
  });

  it('rejects a claim with no citations', () => {
    expect(verdict({ text: 'The buyer used the course.', recordIds: [] })).toBe('Cites no records');
  });

  it('rejects a citation from another dispute', () => {
    expect(verdict({ text: 'The buyer logged in.', recordIds: ['evt_s2_1'] })).toBe(
      'Cites evt_s2_1, which is not a record of this dispute',
    );
  });

  it('S4: a claim about an order we do not have is rejected', () => {
    expect(verdict({ text: 'The buyer paid on 2026-11-01.', recordIds: ['ord_s4'] }, 'S4')).toBe(
      'Cites ord_s4, which is not a record of this dispute',
    );
  });

  it('rejects a date that matches none of the cited records', () => {
    expect(verdict({ text: 'The buyer downloaded the PDF on 2026-11-05.', recordIds: ['evt_s1_4'] })).toBe(
      'Says 2026-11-05, but no cited record is from that day',
    );
  });

  it('rejects dates not written as YYYY-MM-DD', () => {
    expect(verdict({ text: 'Downloaded on 02/11/2026.', recordIds: ['evt_s1_4'] })).toBe(
      'Writes a date as "02/11/2026"; dates must be YYYY-MM-DD',
    );
    expect(verdict({ text: 'Logged in last Tuesday.', recordIds: ['evt_s1_1'] })).toBe(
      'Writes a date as "Tuesday"; dates must be YYYY-MM-DD',
    );
  });

  it('rejects counts that do not match the cited records', () => {
    expect(verdict({ text: 'The buyer viewed four lessons.', recordIds: S1_LESSONS.slice(0, 2) })).toBe(
      'Says 4 lessons, but the cited records show 2',
    );
    expect(verdict({ text: 'The buyer studied over 2 days.', recordIds: S1_LESSONS })).toBe(
      'Says 2 days, but the cited records show 3',
    );
  });

  it('keeps accepted claims in their original order', () => {
    const r = checkClaims(
      draft(
        { text: 'First.', recordIds: ['evt_s1_1'] },
        { text: 'Bad.', recordIds: [] },
        { text: 'Third.', recordIds: ['evt_s1_4'] },
      ),
      buildTimeline(ctx('S1')),
    );
    expect(r.accepted.map((c) => c.text)).toEqual(['First.', 'Third.']);
  });
});
