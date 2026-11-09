import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { CANCELLED, describeError, plainDetail } from './errors';

describe('describeError', () => {
  it('stays quiet when the passcode dialog was cancelled', () => {
    expect(describeError(new Error(CANCELLED), 'escalate')).toBeNull();
  });

  it('explains a wrong passcode', () => {
    expect(describeError(new ApiError('BAD_PASSCODE', 'Demo passcode required'), 'escalate')?.title).toBe(
      'Wrong passcode',
    );
  });

  it('turns our 409 into a plain "not allowed right now"', () => {
    const f = describeError(new ApiError('ACTION_NOT_ALLOWED_NOW', 'x'), 'escalate');
    expect(f?.title).toMatch(/does not allow "escalate" right now/);
  });

  it('rewrites PayPal state refusals in plain words', () => {
    const f = describeError(
      new ApiError('PAYPAL_ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE', 'semantically incorrect'),
      'escalate',
    );
    expect(f?.title).toBe('PayPal refused "escalate"');
    expect(f?.description).toMatch(/current stage/);
  });
});

describe('plainDetail', () => {
  it('rewrites a logged PayPal state refusal', () => {
    expect(plainDetail('PayPal refused escalate: ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE')).toMatch(/did not allow/);
    expect(plainDetail('Evidence submitted')).toBe('Evidence submitted');
  });
});
