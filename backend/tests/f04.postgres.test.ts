
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp, finishApp } from '../src/app.ts';
import { PrismaAuthStore } from '../src/modules/auth/auth.store.ts';
import { hashPassword } from '../src/modules/auth/credentials.ts';
import { mountBorrowingRoutes } from '../src/modules/borrowing/borrowing.routes.ts';
import { PrismaBorrowingStore } from '../src/modules/borrowing/borrowing.store.ts';
import { mountCatalogRoutes } from '../src/modules/catalog/catalog.routes.ts';
import { PrismaCatalogStore } from '../src/modules/catalog/prisma-catalog.store.ts';
import { mountCustodianRoutes } from '../src/modules/custodian/custodian.routes.ts';
import { PrismaCustodianStore } from '../src/modules/custodian/custodian.store.ts';

const databaseUrl = process.env.DATABASE_URL;

if (
  !databaseUrl ||
  process.env.SYS01_TEST_DATABASE !== 'true' ||
  new URL(databaseUrl).pathname !== '/borrowbase_sys01_f02_test'
) {
  throw new Error(
    'F-04 tests require the existing disposable borrowbase_sys01_f02_test database.'
  );
}

const db = new PrismaClient();
const store = new PrismaCustodianStore(db);

const origin = 'http://localhost:5173';
const password = 'synthetic-f04-postgres-password';
const suffix = randomUUID();

type Person = 'borrower-a' | 'borrower-b' | 'custodian';
type Serviceability = 'SERVICEABLE' | 'MAINTENANCE' | 'RETIRED';

const userIds: string[] = [];
const assetIds: string[] = [];

const ids = {
  borrowerA: '',
  borrowerB: '',
  custodian: ''
};

let modelId = '';

const auth = createApp({
  store: new PrismaAuthStore(db),
  origin,
  csrfSecret: 'f04-postgres-test-secret-with-at-least-32-bytes',
  secureCookies: false
});

mountBorrowingRoutes(auth, new PrismaBorrowingStore(db));
mountCatalogRoutes(auth, new PrismaCatalogStore(db));
mountCustodianRoutes(auth, store);

const app = finishApp(auth.app);

function email(person: Person) {
  return `${person}-${suffix}@example.test`;
}

async function login(person: Person) {
  const agent = request.agent(app);

  const response = await agent
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({
      email: email(person),
      password
    });

  expect(response.status).toBe(200);

  return {
    agent,
    csrf: response.body.data.csrfToken as string
  };
}

function checkout(
  agent: ReturnType<typeof request.agent>,
  csrf: string,
  requestId: string
) {
  return agent
    .post(`/api/v1/custodian/borrow-requests/${requestId}/checkout`)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send({});
}

async function createAsset(
  label: string,
  serviceability: Serviceability = 'SERVICEABLE'
) {
  const asset = await db.asset.create({
    data: {
      assetCode: `F04-${suffix}-${label}`,
      equipmentModelId: modelId,
      serviceability
    }
  });

  assetIds.push(asset.id);
  return asset;
}

async function createRequest(
  assetId: string,
  borrowerId = ids.borrowerA
) {
  return db.borrowRequest.create({
    data: {
      assetId,
      borrowerId,
      status: 'PENDING'
    }
  });
}

async function createExistingLoan(
  assetId: string,
  borrowerId = ids.borrowerA
) {
  const checkedOutAt = new Date('2026-11-12T08:00:00.000Z');

  const borrowRequest = await db.borrowRequest.create({
    data: {
      assetId,
      borrowerId,
      status: 'FULFILLED',
      fulfilledAt: checkedOutAt
    }
  });

  return db.loan.create({
    data: {
      borrowRequestId: borrowRequest.id,
      assetId,
      borrowerId,
      checkedOutById: ids.custodian,
      checkedOutAt
    }
  });
}

beforeAll(async () => {
  await db.$connect();

  const passwordHash = await hashPassword(password);

  async function createUser(person: Person) {
    const user = await db.user.create({
      data: {
        normalizedEmail: email(person),
        displayName: `F04 ${person}`,
        passwordHash,
        role: person === 'custodian' ? 'CUSTODIAN' : 'BORROWER'
      }
    });

    userIds.push(user.id);
    return user.id;
  }

  ids.borrowerA = await createUser('borrower-a');
  ids.borrowerB = await createUser('borrower-b');
  ids.custodian = await createUser('custodian');

  const model = await db.equipmentModel.create({
    data: {
      name: `F04 Test Model ${suffix}`,
      category: 'F04 Testing'
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

describe('F-04 real PostgreSQL checkout integration', () => {
  it('TEST-F04-01 lists, filters and retrieves requests', async () => {
    const firstAsset = await createAsset('LIST-A');
    const secondAsset = await createAsset('LIST-B');

    const first = await createRequest(firstAsset.id, ids.borrowerA);
    const second = await createRequest(secondAsset.id, ids.borrowerB);

    const { agent } = await login('custodian');

    const all = await agent.get('/api/v1/custodian/borrow-requests');
    expect(all.status).toBe(200);

    const items = all.body.data.items as Array<{
      id: string;
      createdAt: string;
      borrower: { id: string; displayName: string };
      asset: { available: boolean; serviceability: string };
    }>;

    expect(items.some(item => item.id === first.id)).toBe(true);
    expect(items.some(item => item.id === second.id)).toBe(true);

    const sorted = [...items].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id)
    );

    expect(items.map(item => item.id))
      .toEqual(sorted.map(item => item.id));

    const pending = await agent.get(
      '/api/v1/custodian/borrow-requests?status=PENDING'
    );

    expect(pending.status).toBe(200);
    expect(pending.body.data.items.every(
      (item: { status: string }) => item.status === 'PENDING'
    )).toBe(true);

    const detail = await agent.get(
      `/api/v1/custodian/borrow-requests/${first.id}`
    );

    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      id: first.id,
      borrower: { id: ids.borrowerA },
      asset: {
        id: firstAsset.id,
        serviceability: 'SERVICEABLE',
        available: true
      }
    });
  });

  it('TEST-F04-02 enforces authentication and roles', async () => {
    const asset = await createAsset('AUTH');
    const pending = await createRequest(asset.id);

    const anonymous = await request(app).get(
      '/api/v1/custodian/borrow-requests'
    );

    expect(anonymous.status).toBe(401);

    const borrower = await login('borrower-a');

    const forbiddenList = await borrower.agent.get(
      '/api/v1/custodian/borrow-requests'
    );

    const forbiddenCheckout = await checkout(
      borrower.agent,
      borrower.csrf,
      pending.id
    );

    expect(forbiddenList.status).toBe(403);
    expect(forbiddenCheckout.status).toBe(403);

    expect(await db.loan.count({
      where: { borrowRequestId: pending.id }
    })).toBe(0);

    const custodian = await login('custodian');

    await db.user.update({
      where: { id: ids.custodian },
      data: { isActive: false }
    });

    try {
      const inactive = await custodian.agent.get(
        '/api/v1/custodian/borrow-requests'
      );

      expect(inactive.status).toBe(401);
    } finally {
      await db.user.update({
        where: { id: ids.custodian },
        data: { isActive: true }
      });
    }
  });

  it('TEST-F04-03 completes Borrower request to Custodian checkout', async () => {
    const asset = await createAsset('SUCCESS');

    const borrower = await login('borrower-a');

    const creation = await borrower.agent
      .post('/api/v1/borrow-requests')
      .set('Origin', origin)
      .set('X-CSRF-Token', borrower.csrf)
      .send({ assetId: asset.id });

    expect(creation.status).toBe(201);
    expect(creation.body.data.status).toBe('PENDING');

    const requestId = creation.body.data.id as string;
    const custodian = await login('custodian');

    const response = await checkout(
      custodian.agent,
      custodian.csrf,
      requestId
    );

    expect(response.status).toBe(201);
    expect(response.body.data.request).toMatchObject({
      id: requestId,
      status: 'FULFILLED',
      borrower: { id: ids.borrowerA },
      asset: { id: asset.id, available: false }
    });

    const savedRequest = await db.borrowRequest.findUniqueOrThrow({
      where: { id: requestId }
    });

    const loans = await db.loan.findMany({
      where: { borrowRequestId: requestId }
    });

    expect(savedRequest.status).toBe('FULFILLED');
    expect(savedRequest.fulfilledAt).not.toBeNull();

    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({
      borrowerId: ids.borrowerA,
      checkedOutById: ids.custodian,
      assetId: asset.id,
      returnedAt: null
    });

    expect(response.body.data.loan.id).toBe(loans[0]!.id);

    const activeLoans = await custodian.agent.get(
      '/api/v1/custodian/loans'
    );

    expect(activeLoans.status).toBe(200);
    expect(activeLoans.body.data.items.some(
      (item: { id: string }) => item.id === loans[0]!.id
    )).toBe(true);

    const borrowerLoans = await borrower.agent.get(
      '/api/v1/me/loans'
    );

    expect(borrowerLoans.status).toBe(200);
    expect(borrowerLoans.body.data.items.some(
      (item: { id: string }) => item.id === loans[0]!.id
    )).toBe(true);

    const catalog = await borrower.agent.get(
      `/api/v1/assets/${asset.id}`
    );

    expect(catalog.status).toBe(200);
    expect(catalog.body.data.available).toBe(false);
  });

  it.each(['MAINTENANCE', 'RETIRED'] as const)(
    'TEST-F04-04 rejects %s equipment without changes',
    async serviceability => {
      const asset = await createAsset(
        `BLOCK-${serviceability}`,
        serviceability
      );

      const pending = await createRequest(asset.id);
      const custodian = await login('custodian');

      const response = await checkout(
        custodian.agent,
        custodian.csrf,
        pending.id
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ASSET_UNAVAILABLE');

      const saved = await db.borrowRequest.findUniqueOrThrow({
        where: { id: pending.id }
      });

      expect(saved.status).toBe('PENDING');
      expect(saved.fulfilledAt).toBeNull();

      expect(await db.loan.count({
        where: { assetId: asset.id }
      })).toBe(0);
    }
  );

  it('TEST-F04-04 rejects an asset with an active Loan', async () => {
    const asset = await createAsset('ALREADY-LOANED');

    await createExistingLoan(asset.id, ids.borrowerA);
    const competing = await createRequest(asset.id, ids.borrowerB);

    const custodian = await login('custodian');
    const response = await checkout(
      custodian.agent,
      custodian.csrf,
      competing.id
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ASSET_UNAVAILABLE');

    const saved = await db.borrowRequest.findUniqueOrThrow({
      where: { id: competing.id }
    });

    expect(saved.status).toBe('PENDING');
    expect(saved.fulfilledAt).toBeNull();

    expect(await db.loan.count({
      where: { assetId: asset.id, returnedAt: null }
    })).toBe(1);
  });

  it('TEST-F04-05 rejects checkout of an already fulfilled request', async () => {
    const asset = await createAsset('REPEAT');
    const pending = await createRequest(asset.id);

    const custodian = await login('custodian');

    const first = await checkout(
      custodian.agent,
      custodian.csrf,
      pending.id
    );

    const second = await checkout(
      custodian.agent,
      custodian.csrf,
      pending.id
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('REQUEST_NOT_PENDING');

    expect(await db.loan.count({
      where: { borrowRequestId: pending.id }
    })).toBe(1);
  });

  it('TEST-F04-06 allows only one concurrent checkout', async () => {
    const asset = await createAsset('CONCURRENT');

    const firstRequest = await createRequest(
      asset.id,
      ids.borrowerA
    );

    const secondRequest = await createRequest(
      asset.id,
      ids.borrowerB
    );

    const firstCustodian = await login('custodian');
    const secondCustodian = await login('custodian');

    const [first, second] = await Promise.all([
      checkout(
        firstCustodian.agent,
        firstCustodian.csrf,
        firstRequest.id
      ),
      checkout(
        secondCustodian.agent,
        secondCustodian.csrf,
        secondRequest.id
      )
    ]);

    expect([first.status, second.status].sort())
      .toEqual([201, 409]);

    const requests = await db.borrowRequest.findMany({
      where: {
        id: { in: [firstRequest.id, secondRequest.id] }
      }
    });

    expect(requests.filter(r => r.status === 'FULFILLED'))
      .toHaveLength(1);

    expect(requests.filter(r => r.status === 'PENDING'))
      .toHaveLength(1);

    const activeLoans = await db.loan.findMany({
      where: {
        assetId: asset.id,
        returnedAt: null
      }
    });

    expect(activeLoans).toHaveLength(1);
    expect(activeLoans[0]!.borrowRequestId).toBe(
      requests.find(r => r.status === 'FULFILLED')!.id
    );
  });

  it('TEST-F04-07 leaves a competing request PENDING', async () => {
    const asset = await createAsset('COMPETING');

    const selected = await createRequest(
      asset.id,
      ids.borrowerA
    );

    const competing = await createRequest(
      asset.id,
      ids.borrowerB
    );

    const custodian = await login('custodian');

    const result = await checkout(
      custodian.agent,
      custodian.csrf,
      selected.id
    );

    expect(result.status).toBe(201);

    const other = await db.borrowRequest.findUniqueOrThrow({
      where: { id: competing.id }
    });

    expect(other.status).toBe('PENDING');
    expect(other.fulfilledAt).toBeNull();

    expect(await db.loan.count({
      where: { borrowRequestId: competing.id }
    })).toBe(0);
  });

  it('TEST-F04-08 rejects invalid IDs and CSRF', async () => {
    const custodian = await login('custodian');

    const invalid = await custodian.agent.get(
      '/api/v1/custodian/borrow-requests/not-a-uuid'
    );

    const missing = await custodian.agent.get(
      `/api/v1/custodian/borrow-requests/${randomUUID()}`
    );

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);

    const asset = await createAsset('CSRF');
    const pending = await createRequest(asset.id);

    const noCsrf = await custodian.agent
      .post(
        `/api/v1/custodian/borrow-requests/${pending.id}/checkout`
      )
      .set('Origin', origin)
      .send({});

    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF_FORBIDDEN');

    expect(await db.loan.count({
      where: { borrowRequestId: pending.id }
    })).toBe(0);
  });

  it('TEST-F04-08 rolls back if Loan insertion fails', async () => {
    const asset = await createAsset('ROLLBACK');
    const pending = await createRequest(asset.id);

    // An invalid Custodian FK makes Loan insertion fail after
    // the request update. Both changes must roll back.
    await expect(
      store.checkout(pending.id, randomUUID())
    ).rejects.toThrow();

    const saved = await db.borrowRequest.findUniqueOrThrow({
      where: { id: pending.id }
    });

    expect(saved.status).toBe('PENDING');
    expect(saved.fulfilledAt).toBeNull();

    expect(await db.loan.count({
      where: { borrowRequestId: pending.id }
    })).toBe(0);
  });
});
