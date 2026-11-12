
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp, finishApp } from '../src/app.ts';
import { PrismaAuthStore } from '../src/modules/auth/auth.store.ts';
import { hashPassword } from '../src/modules/auth/credentials.ts';
import { mountCatalogRoutes } from '../src/modules/catalog/catalog.routes.ts';
import { PrismaCatalogStore } from '../src/modules/catalog/prisma-catalog.store.ts';

const databaseUrl = new URL(
  process.env.DATABASE_URL ?? 'postgresql://localhost/unsafe'
);

if (
  process.env.SYS01_TEST_DATABASE !== 'true' ||
  !/^\/borrowbase_sys01_f02_/.test(databaseUrl.pathname)
) {
  throw new Error('F-02 requires an explicitly selected disposable test database.');
}

const db = new PrismaClient();
const catalog = new PrismaCatalogStore(db);

const origin = 'http://localhost:5173';
const password = 'synthetic-f02-test-password';
const suffix = randomUUID();

const userIds: string[] = [];
const assetIds: string[] = [];

let borrowerId: string;
let custodianId: string;
let modelId: string;

const auth = createApp({
  store: new PrismaAuthStore(db),
  origin,
  csrfSecret: 'f02-test-only-secret-with-at-least-32-bytes',
  secureCookies: false
});

mountCatalogRoutes(auth, catalog);
const app = finishApp(auth.app);

async function login(role: 'BORROWER' | 'CUSTODIAN') {
  const agent = request.agent(app);

  const result = await agent
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({
      email: `${role.toLowerCase()}-${suffix}@example.test`,
      password
    });

  expect(result.status).toBe(200);

  return agent;
}

async function createAsset(
  code: string,
  serviceability: 'SERVICEABLE' | 'MAINTENANCE' | 'RETIRED' = 'SERVICEABLE'
) {
  const asset = await db.asset.create({
    data: {
      assetCode: `F02-${suffix}-${code}`,
      equipmentModelId: modelId,
      serviceability
    }
  });

  assetIds.push(asset.id);
  return asset;
}

beforeAll(async () => {
  const passwordHash = await hashPassword(password);

  for (const role of ['BORROWER', 'CUSTODIAN'] as const) {
    const user = await db.user.create({
      data: {
        normalizedEmail: `${role.toLowerCase()}-${suffix}@example.test`,
        displayName: `F02 ${role}`,
        role,
        passwordHash
      }
    });

    userIds.push(user.id);

    if (role === 'BORROWER') borrowerId = user.id;
    else custodianId = user.id;
  }

  const model = await db.equipmentModel.create({
    data: {
      name: `F02 Model ${suffix}`,
      category: 'F02 Testing'
    }
  });

  modelId = model.id;
});

afterAll(async () => {
  try {
    await db.loan.deleteMany({
      where: { assetId: { in: assetIds } }
    });

    await db.borrowRequest.deleteMany({
      where: { assetId: { in: assetIds } }
    });

    await db.asset.deleteMany({
      where: { id: { in: assetIds } }
    });

    await db.session.deleteMany({
      where: { userId: { in: userIds } }
    });

    await db.user.deleteMany({
      where: { id: { in: userIds } }
    });

    if (modelId) {
      await db.equipmentModel.delete({
        where: { id: modelId }
      });
    }
  } finally {
    await db.$disconnect();
  }
});

describe('F-02 real PostgreSQL integration', () => {
  it('PG-01 lists assets sorted by assetCode', async () => {
    const second = await createAsset('B');
    const first = await createAsset('A');

    const agent = await login('BORROWER');
    const response = await agent.get('/api/v1/assets');

    expect(response.status).toBe(200);

    const items = response.body.data.items.filter(
      (item: { id: string }) =>
        [first.id, second.id].includes(item.id)
    );

    expect(items.map((item: { assetCode: string }) => item.assetCode))
      .toEqual([first.assetCode, second.assetCode]);

    expect(items[0]).toMatchObject({
      id: first.id,
      assetCode: first.assetCode,
      category: 'F02 Testing',
      serviceability: 'SERVICEABLE',
      available: true
    });
  });

  it.each([
    ['SERVICEABLE', true],
    ['MAINTENANCE', false],
    ['RETIRED', false]
  ] as const)(
    'PG-02 %s equipment has availability %s',
    async (state, expected) => {
      const asset = await createAsset(state, state);

      const result = await catalog.detail(asset.id);

      expect(result).toMatchObject({
        id: asset.id,
        serviceability: state,
        available: expected
      });
    }
  );

  it('PG-03 active loans make equipment unavailable', async () => {
    const asset = await createAsset('ACTIVE-LOAN');

    expect((await catalog.detail(asset.id))?.available).toBe(true);

    const borrowRequest = await db.borrowRequest.create({
      data: {
        borrowerId,
        assetId: asset.id
      }
    });

    const checkoutTime = new Date('2026-11-01T00:00:00Z');

    await db.borrowRequest.update({
      where: { id: borrowRequest.id },
      data: {
        status: 'FULFILLED',
        fulfilledAt: checkoutTime
      }
    });

    const loan = await db.loan.create({
      data: {
        borrowRequestId: borrowRequest.id,
        borrowerId,
        assetId: asset.id,
        checkedOutById: custodianId,
        checkedOutAt: checkoutTime
      }
    });

    expect((await catalog.detail(asset.id))?.available).toBe(false);

    await db.loan.update({
      where: { id: loan.id },
      data: {
        returnedAt: new Date('2026-11-02T00:00:00Z'),
        returnedById: custodianId
      }
    });

    expect((await catalog.detail(asset.id))?.available).toBe(true);
  });

  it('PG-04 retrieves equipment details', async () => {
    const asset = await createAsset('DETAIL');
    const agent = await login('CUSTODIAN');

    const response = await agent.get(`/api/v1/assets/${asset.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: asset.id,
      assetCode: asset.assetCode,
      category: 'F02 Testing',
      serviceability: 'SERVICEABLE',
      available: true
    });
  });

  it('PG-05 handles unknown and invalid IDs', async () => {
    const agent = await login('BORROWER');

    const missing = await agent.get(`/api/v1/assets/${randomUUID()}`);
    expect(missing.status).toBe(404);

    const invalid = await agent.get('/api/v1/assets/not-a-uuid');
    expect(invalid.status).toBe(400);

    expect(await catalog.detail(randomUUID())).toBeNull();
  });

  it('PG-06 blocks anonymous requests', async () => {
    const asset = await createAsset('AUTH');

    const list = await request(app).get('/api/v1/assets');
    expect(list.status).toBe(401);

    const detail = await request(app).get(`/api/v1/assets/${asset.id}`);
    expect(detail.status).toBe(401);
  });

  it('PG-07 allows authenticated borrowers and custodians', async () => {
    for (const role of ['BORROWER', 'CUSTODIAN'] as const) {
      const agent = await login(role);
      const response = await agent.get('/api/v1/assets');

      expect(response.status).toBe(200);
    }
  });
});
