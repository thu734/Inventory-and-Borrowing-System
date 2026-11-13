
import { describe, expect, it } from 'vitest';
import { calculateAvailability } from '../../src/modules/catalog/catalog.store.ts';

describe('F-02 Asset availability rule', () => {
  it('TEST-F02-02: serviceable asset without loan is available', () => {
    expect(calculateAvailability('SERVICEABLE', 0)).toBe(true);
  });

  it('TEST-F02-02: active loan makes asset unavailable', () => {
    expect(calculateAvailability('SERVICEABLE', 1)).toBe(false);
  });

  it('TEST-F02-02: maintenance asset is unavailable', () => {
    expect(calculateAvailability('MAINTENANCE', 0)).toBe(false);
  });

  it('TEST-F02-02: retired asset is unavailable', () => {
    expect(calculateAvailability('RETIRED', 0)).toBe(false);
  });

  it('TEST-F02-02: multiple active loans never mean available', () => {
    expect(calculateAvailability('SERVICEABLE', 2)).toBe(false);
  });
});
