
import { describe, expect, it } from 'vitest';
import { assertCheckoutEligible } from '../../src/modules/custodian/custodian.rules.ts';

describe('F-04 checkout eligibility rules', () => {
  it('allows a pending request for a serviceable, unloaned asset', () => {
    expect(() =>
      assertCheckoutEligible('PENDING', 'SERVICEABLE', false)
    ).not.toThrow();
  });

  it('rejects a fulfilled request', () => {
    expect(() =>
      assertCheckoutEligible('FULFILLED', 'SERVICEABLE', false)
    ).toThrow('Request is no longer pending.');
  });

  it('rejects an asset under maintenance', () => {
    expect(() =>
      assertCheckoutEligible('PENDING', 'MAINTENANCE', false)
    ).toThrow('This asset is unavailable for checkout.');
  });

  it('rejects a retired asset', () => {
    expect(() =>
      assertCheckoutEligible('PENDING', 'RETIRED', false)
    ).toThrow('This asset is unavailable for checkout.');
  });

  it('rejects an asset with an active loan', () => {
    expect(() =>
      assertCheckoutEligible('PENDING', 'SERVICEABLE', true)
    ).toThrow('This asset is unavailable for checkout.');
  });
});
