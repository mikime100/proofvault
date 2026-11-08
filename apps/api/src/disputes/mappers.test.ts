import { describe, expect, it } from 'vitest';
import { allowedActionsOf } from './mappers';

// Link lists copied from the live sandbox case PP-R-WQU-10196685 (docs/paypal-sandbox-notes.md).
const links = (...rels: string[]) => ({ links: rels.map((rel) => ({ rel, href: 'https://x', method: 'POST' })) });

describe('allowedActionsOf (decision 16)', () => {
  it('inquiry waiting on the seller: accept, submit, message, escalate', () => {
    expect(allowedActionsOf(links('self', 'accept_claim', 'provide_evidence', 'send_message', 'escalate')).sort()).toEqual(
      ['accept', 'escalate', 'message', 'submit'],
    );
  });

  it('right after escalating: nothing allowed (only self)', () => {
    expect(allowedActionsOf(links('self'))).toEqual([]);
  });

  it('a minute later: evidence allowed again', () => {
    expect(allowedActionsOf(links('self', 'provide_evidence'))).toEqual(['submit']);
  });

  it('make_offer maps to offer; unknown rels are ignored', () => {
    expect(allowedActionsOf(links('make_offer', 'something_new'))).toEqual(['offer']);
  });

  it('never loaded from PayPal (seed data): every action listed', () => {
    expect(allowedActionsOf(null)).toEqual([
      'submit',
      'offer',
      'accept',
      'message',
      'escalate',
      'adjudicate',
      'require_evidence',
    ]);
  });

  it('#45: sandbox adjudicate and require_evidence come through when PayPal lists them', () => {
    const raw = { links: [{ rel: 'self' }, { rel: 'adjudicate' }, { rel: 'require_evidence' }, { rel: 'accept_claim' }] };
    expect(allowedActionsOf(raw)).toEqual(['adjudicate', 'require_evidence', 'accept']);
  });
});
