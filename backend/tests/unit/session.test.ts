import { describe, expect, it } from 'vitest';
import { isSessionActive } from '../../src/modules/auth/session-policy.ts';

describe('AC-F01-03 / TEST-F01-03: absolute session expiry', () => {
  const expiry = new Date('2026-11-06T12:00:00Z');
  it('accepts an unrevoked session strictly before expiry', () => {
    expect(isSessionActive({ expiresAt: expiry, revokedAt: null }, new Date(expiry.getTime() - 1))).toBe(true);
  });
  it('rejects exactly at the expiry boundary', () => {
    expect(isSessionActive({ expiresAt: expiry, revokedAt: null }, expiry)).toBe(false);
  });
  it('rejects after expiry', () => {
    expect(isSessionActive({ expiresAt: expiry, revokedAt: null }, new Date(expiry.getTime() + 1))).toBe(false);
  });
  it('rejects revoked sessions even before expiry', () => {
    expect(isSessionActive({ expiresAt: expiry, revokedAt: new Date(0) }, new Date(1))).toBe(false);
  });
});
