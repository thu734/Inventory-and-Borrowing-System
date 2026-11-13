import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  CSRF_SECRET: z.string().min(32).refine(x => !x.startsWith('REPLACE_')),
});
export function readEnv(input: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(`Invalid environment fields: ${result.error.issues.map(x => x.path.join('.')).join(', ')}`);
  const env = result.data;
  const origin = new URL(env.APP_ORIGIN);
  if (origin.origin !== env.APP_ORIGIN || (env.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
    throw new Error('APP_ORIGIN must be an exact origin; production requires HTTPS');
  }
  return env;
}
