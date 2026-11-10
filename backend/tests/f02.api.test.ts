
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, finishApp } from '../src/app.ts';
import { hashPassword } from '../src/modules/auth/credentials.ts';
import { MemoryAuthStore } from './helpers/memory-auth-store.ts';
import { mountCatalogRoutes } from '../src/modules/catalog/catalog.routes.ts';
import type { CatalogStore } from '../src/modules/catalog/catalog.store.ts';

describe('F-02 Equipment Catalog API', () => {
  const origin = 'http://localhost:5173';
  const store = new MemoryAuthStore();
  const assetId = '31f81203-9156-4be0-8488-e72fdc734301';

  const assets = [{
    id: assetId,
    assetCode: 'BB-LAP-001',
    modelName: 'ThinkPad Laptop',
    category: 'Computers',
    serviceability: 'SERVICEABLE' as const,
    available: true
  }];

  const catalog: CatalogStore = {
    list: async () => assets,
    detail: async id =>
      assets.find(asset => asset.id === id) ?? null
  };

  const auth = createApp({
    store,
    origin,
    csrfSecret: 'f02-test-secret-at-least-32-characters',
    secureCookies: false
  });

  mountCatalogRoutes(auth, catalog);

  const app = finishApp(auth.app);
  const agent = request.agent(app);

  beforeAll(async () => {
    store.users.set('borrower-f02', {
      id: 'borrower-f02',
      normalizedEmail: 'f02@example.test',
      displayName: 'F-02 Test Borrower',
      role: 'BORROWER',
      isActive: true,
      passwordHash: await hashPassword('test-password-123')
    });

    const login = await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({
        email: 'f02@example.test',
        password: 'test-password-123'
      });

    expect(login.status).toBe(200);
  });

  it('TEST-F02-01: lists equipment assets', async () => {
    const response = await agent.get('/api/v1/assets');

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual(assets);
  });

  it('TEST-F02-01: retrieves asset detail', async () => {
    const response = await agent.get(
      `/api/v1/assets/${assetId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(assets[0]);
  });

  it('TEST-F02-03: rejects anonymous access', async () => {
    const response = await request(app).get('/api/v1/assets');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
