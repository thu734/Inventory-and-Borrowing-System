import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

export const hashPassword = (password: string) => hash(password, {
  type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
});
export const verifyPassword = (encoded: string, password: string) => verify(encoded, password);
export const newToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const csrfFor = (hash: string, secret: string) => createHmac('sha256', secret).update(hash).digest('base64url');
export function validCsrf(value: unknown, expected: string): boolean {
  if (typeof value !== 'string') return false;
  const actual = Buffer.from(value); const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}
