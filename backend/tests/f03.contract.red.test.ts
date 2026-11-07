import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, finishApp } from '../src/app.ts';
import { hashPassword } from '../src/modules/auth/credentials.ts';
import { MemoryAuthStore } from './helpers/memory-auth-store.ts';
import { mountBorrowingRoutes } from '../src/modules/borrowing/borrowing.routes.ts';
import type { BorrowingStore } from '../src/modules/borrowing/borrowing.store.ts';

// Original red-phase assertions retained; now wired to real feature routes.
// The empty query store is a test double, not PostgreSQL evidence.
describe('F-03 initial contract regression (original red assertions)', () => {
  const origin = 'http://localhost:5173';
  const store = new MemoryAuthStore();
  const auth = createApp({ store, origin,
    csrfSecret: 'draft-test-only-csrf-secret-at-least-32-bytes', secureCookies: false });
  const queries: BorrowingStore = { create: async () => { throw new Error('Not used'); }, requests: async () => [],
    request: async () => null, loans: async () => [], loan: async () => null };
  mountBorrowingRoutes(auth, queries);
  const app = finishApp(auth.app);
  const agent = request.agent(app);

  beforeAll(async () => {
    store.users.set('borrower-f03', { id: 'borrower-f03', normalizedEmail: 'f03@example.test',
      displayName: 'F-03 contract fixture', role: 'BORROWER', isActive: true,
      passwordHash: await hashPassword('draft-only-synthetic-password') });
    const login = await agent.post('/api/v1/auth/login').set('Origin', origin)
      .send({ email: 'f03@example.test', password: 'draft-only-synthetic-password' });
    expect(login.status).toBe(200);
  });

  it('TEST-F03-05: anonymous request creation is rejected before domain lookup', async () => {
    const response = await request(app).post('/api/v1/borrow-requests')
      .set('Origin', origin).send({ assetId: '31f81203-9156-4be0-8488-e72fdc734301' });
    expect(response.status).toBe(401);
  });

  it('TEST-F03-03: authenticated Borrower can list own requests', async () => {
    const response = await agent.get('/api/v1/me/borrow-requests');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.items)).toBe(true);
  });

  it('TEST-F03-03: authenticated Borrower can list own active Loans', async () => {
    const response = await agent.get('/api/v1/me/loans');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.items)).toBe(true);
  });
});
