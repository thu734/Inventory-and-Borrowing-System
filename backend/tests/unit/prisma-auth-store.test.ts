import { expect, it, vi } from 'vitest';
import { PrismaAuthStore, type PrismaAuthDatabase, type SessionRecord } from '../../src/modules/auth/auth.store.ts';

it('passes only normalized identity and hashed session keys to Prisma delegates', async () => {
  const db: PrismaAuthDatabase = {
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    session: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), updateMany: vi.fn() },
    $transaction: async work => work({ session: db.session }),
  };
  const store = new PrismaAuthStore(db);
  await store.findUser('demo@example.test'); await store.findSession('hash');
  expect(db.user.findUnique).toHaveBeenCalledWith({ where: { normalizedEmail: 'demo@example.test' } });
  expect(db.session.findUnique).toHaveBeenCalledWith({ where: { tokenHash: 'hash' }, include: { user: true } });
});
it('uses transaction delegates for rotation, never the outside writer', async () => {
  const writer = { create: vi.fn(), updateMany: vi.fn() };
  const outside = { create: vi.fn(), updateMany: vi.fn() };
  const db: PrismaAuthDatabase = {
    user: { findUnique: vi.fn() }, session: { ...outside, findUnique: vi.fn() },
    $transaction: vi.fn(async work => work({ session: writer })),
  };
  const session: SessionRecord = { id: 'id', userId: 'user', tokenHash: 'new-hash',
    createdAt: new Date(0), expiresAt: new Date(1), revokedAt: null };
  await new PrismaAuthStore(db).rotateSession(session, 'old-hash');
  expect(db.$transaction).toHaveBeenCalledOnce();
  expect(writer.updateMany).toHaveBeenCalledWith({ where: { tokenHash: 'old-hash', revokedAt: null }, data: { revokedAt: session.createdAt } });
  expect(writer.create).toHaveBeenCalledWith({ data: session });
  expect(outside.create).not.toHaveBeenCalled(); expect(outside.updateMany).not.toHaveBeenCalled();
});
