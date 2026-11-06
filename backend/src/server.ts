import { createApp, finishApp } from './app.ts';
import { readEnv } from './config/env.ts';
import { PrismaAuthStore, type PrismaAuthDatabase } from './modules/auth/auth.store.ts';

async function main() {
  const env = readEnv();
  // Member 2 owns schema.prisma and prisma generate. A variable import keeps
  // the independent auth build possible before that generated client exists.
  const prismaPackage = '@prisma/client';
  const { PrismaClient } = await import(prismaPackage);
  const db = new PrismaClient() as PrismaAuthDatabase & { $connect(): Promise<void>; $disconnect(): Promise<void> };
  await db.$connect();
  const { app } = createApp({ store: new PrismaAuthStore(db), origin: env.APP_ORIGIN,
    csrfSecret: env.CSRF_SECRET, secureCookies: env.NODE_ENV === 'production' });
  const server = finishApp(app).listen(env.PORT, () => console.info(`API listening on port ${env.PORT}`));
  const stop = () => server.close(() => { void db.$disconnect().finally(() => process.exit(0)); });
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
main().catch(() => {
  console.error('API startup failed. Check local configuration and Member 2\'s generated Prisma client, migrations and database connectivity. No fallback accounts or database are used.');
  process.exitCode = 1;
});
