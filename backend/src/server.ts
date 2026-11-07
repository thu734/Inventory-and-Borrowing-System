import { createApp, finishApp } from './app.ts';
import { readEnv } from './config/env.ts';
import { PrismaAuthStore, type PrismaAuthDatabase } from './modules/auth/auth.store.ts';
import type { PrismaClient as GeneratedPrismaClient } from '@prisma/client';
import { PrismaBorrowingStore } from './modules/borrowing/borrowing.store.ts';
import { mountBorrowingRoutes } from './modules/borrowing/borrowing.routes.ts';

async function main() {
  const env = readEnv();
  // Member 2 owns schema.prisma and prisma generate. A variable import keeps
  // the independent auth build possible before that generated client exists.
  const prismaPackage = '@prisma/client';
  const { PrismaClient } = await import(prismaPackage);
  const prisma = new PrismaClient();
  const db = prisma as PrismaAuthDatabase & { $connect(): Promise<void>; $disconnect(): Promise<void> };
  await db.$connect();
  const auth = createApp({ store: new PrismaAuthStore(db), origin: env.APP_ORIGIN,
    csrfSecret: env.CSRF_SECRET, secureCookies: env.NODE_ENV === 'production' });
  mountBorrowingRoutes(auth, new PrismaBorrowingStore(prisma as GeneratedPrismaClient));
  const server = finishApp(auth.app).listen(env.PORT, () => console.info(`API listening on port ${env.PORT}`));
  const stop = () => server.close(() => { void db.$disconnect().finally(() => process.exit(0)); });
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
main().catch(() => {
  console.error('API startup failed. Check local configuration and Member 2\'s generated Prisma client, migrations and database connectivity. No fallback accounts or database are used.');
  process.exitCode = 1;
});
