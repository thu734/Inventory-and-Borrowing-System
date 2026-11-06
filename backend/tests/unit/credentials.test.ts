import { expect, it } from 'vitest';
import { csrfFor, hashPassword, newToken, tokenHash, validCsrf, verifyPassword } from '../../src/modules/auth/credentials.ts';
it('TEST-F01-06 uses Argon2id and verifies without storing the password', async () => {
  const encoded = await hashPassword('test-password');
  expect(encoded).toContain('$argon2id$'); expect(encoded).toContain('m=19456,t=2,p=1');
  expect(await verifyPassword(encoded, 'test-password')).toBe(true);
  expect(await verifyPassword(encoded, 'wrong')).toBe(false);
});
it('generates independent 256-bit session credentials and binds CSRF to session', () => {
  const a = newToken(); const b = newToken();
  expect(Buffer.from(a, 'base64url').length).toBe(32); expect(a).not.toBe(b);
  expect(tokenHash(a)).not.toContain(a);
  const csrf = csrfFor(tokenHash(a), 'test-secret');
  expect(validCsrf(csrf, csrf)).toBe(true); expect(validCsrf('x', csrf)).toBe(false);
  expect(validCsrf(undefined, csrf)).toBe(false); expect(csrfFor(tokenHash(b), 'test-secret')).not.toBe(csrf);
});
