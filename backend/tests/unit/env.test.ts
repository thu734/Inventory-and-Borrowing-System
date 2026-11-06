import { expect, it } from 'vitest';
import { readEnv } from '../../src/config/env.ts';
const input = { DATABASE_URL: 'postgresql://test-only', CSRF_SECRET: 'x'.repeat(32) };
it('accepts explicit local configuration and rejects placeholder secrets', () => {
  expect(readEnv(input).PORT).toBe(3000);
  expect(() => readEnv({ ...input, CSRF_SECRET: 'REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_BYTES' })).toThrow('CSRF_SECRET');
});
it('requires HTTPS for production and rejects an Origin with a path', () => {
  expect(() => readEnv({ ...input, NODE_ENV: 'production' })).toThrow('HTTPS');
  expect(() => readEnv({ ...input, APP_ORIGIN: 'http://localhost:5173/path' })).toThrow('exact origin');
});
