
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

function buildApp(client: PrismaClient) {
const auth = createApp({
  store: new PrismaAuthStore(client),
  origin,
  csrfSecret: 'f04-postgres-test-secret-with-at-least-32-bytes',
  secureCookies: false
});

mountBorrowingRoutes(auth, new PrismaBorrowingStore(client));
mountCatalogRoutes(auth, new PrismaCatalogStore(client));
mountCustodianRoutes(auth, new PrismaCustodianStore(client));

return finishApp(auth.app);
}
const app = buildApp(db);

function email(person: Person) {
  return `${person}-${suffix}@example.test`;
}

async function login(person: Person, application = app) {
  const agent = request.agent(application);

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
  const cancel = (auth: Awaited<ReturnType<typeof login>>, id: string) =>
    auth.agent.post(`/api/v1/me/borrow-requests/${id}/cancel`)
      .set('Origin', origin).set('X-CSRF-Token', auth.csrf).send({});

  it('TEST-F03-10/13/15 persists owner cancellation and history without changing the Asset or creating a Loan', async () => {
    const asset = await createAsset('CANCEL-HISTORY');
    const pending = await createRequest(asset.id);
    const owner = await login('borrower-a');
    const response = await cancel(owner, pending.id);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: pending.id, status: 'CANCELLED', asset: { id: asset.id } });
    expect(Number.isNaN(Date.parse(response.body.data.cancelledAt))).toBe(false);
    const saved = await db.borrowRequest.findUniqueOrThrow({ where: { id: pending.id } });
    expect(saved).toMatchObject({ id: pending.id, borrowerId: ids.borrowerA, assetId: asset.id, createdAt: pending.createdAt, status: 'CANCELLED', fulfilledAt: null });
    expect(await db.asset.findUnique({ where: { id: asset.id } })).toEqual(asset);
    expect(await db.loan.count({ where: { borrowRequestId: pending.id } })).toBe(0);
    const freshDb = new PrismaClient();
    try {
      const fresh = await login('borrower-a', buildApp(freshDb));
      const detail = await fresh.agent.get(`/api/v1/me/borrow-requests/${pending.id}`);
      const list = await fresh.agent.get('/api/v1/me/borrow-requests');
      expect(detail.status).toBe(200);
      expect(list.status).toBe(200);
      expect(detail.body.data).toMatchObject({ id: pending.id, status: 'CANCELLED', cancelledAt: response.body.data.cancelledAt });
      expect(list.body.data.items).toContainEqual(expect.objectContaining({ id: pending.id, status: 'CANCELLED', cancelledAt: response.body.data.cancelledAt }));
    } finally { await freshDb.$disconnect(); }
    const repeat = await cancel(owner, pending.id);
    expect(repeat.status).toBe(409);
    expect(repeat.body.error.code).toBe('REQUEST_NOT_PENDING');
    const custodian = await login('custodian');
    const rejected = await checkout(custodian.agent, custodian.csrf, pending.id);
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe('REQUEST_NOT_PENDING');
    expect(await db.loan.count({ where: { borrowRequestId: pending.id } })).toBe(0);
    const custodianList = await custodian.agent.get('/api/v1/custodian/borrow-requests?status=CANCELLED');
    expect(custodianList.status).toBe(200);
    expect(custodianList.body.data.items).toContainEqual(expect.objectContaining({ id: pending.id, status: 'CANCELLED', cancelledAt: response.body.data.cancelledAt }));
    const again = await owner.agent.post('/api/v1/borrow-requests').set('Origin', origin).set('X-CSRF-Token', owner.csrf).send({assetId: asset.id});
    expect(again.status).toBe(201);
  });

  it('TEST-F03-11 rejects foreign Borrower cancellation without writes', async () => {
    const asset = await createAsset('CANCEL-AUTH');
    const pending = await createRequest(asset.id);
    expect((await cancel(await login('borrower-b'), pending.id)).status).toBe(404);
    expect(await db.borrowRequest.findUnique({ where: { id: pending.id } })).toEqual(pending);
  });

  it('TEST-F03-11 rejects Custodian cancellation without writes', async () => {
    const asset = await createAsset('CANCEL-CUSTODIAN');
    const pending = await createRequest(asset.id);
    expect((await cancel(await login('custodian'), pending.id)).status).toBe(403);
    expect(await db.borrowRequest.findUnique({ where: { id: pending.id } })).toEqual(pending);
  });
  it('validates cancellation input and mutation guards without writes', async () => {
    const asset = await createAsset('CANCEL-INVALID');
    const pending = await createRequest(asset.id);
    const owner = await login('borrower-a');
    const path = `/api/v1/me/borrow-requests/${pending.id}/cancel`;
    expect((await owner.agent.post(path).set('Origin', origin).send({})).status).toBe(403);
    expect((await owner.agent.post(path).set('Origin', 'https://foreign.test').set('X-CSRF-Token', owner.csrf).send({})).status).toBe(403);
    expect((await owner.agent.post(path).set('Origin', origin).set('X-CSRF-Token', owner.csrf).send({status:'CANCELLED'})).status).toBe(400);
    expect((await cancel(owner, 'invalid')).status).toBe(400);
    expect((await cancel(owner, randomUUID())).status).toBe(404);
    expect(await db.borrowRequest.findUnique({where:{id:pending.id}})).toEqual(pending);
  });

  it('TEST-F03-12 rejects cancellation after checkout without changing the request or Loan', async () => {
    const asset = await createAsset('CANCEL-FULFILLED');
    const pending = await createRequest(asset.id);
    const custodian = await login('custodian');
    expect((await checkout(custodian.agent, custodian.csrf, pending.id)).status).toBe(201);
    const before = await db.borrowRequest.findUnique({ where: { id: pending.id } });
    const loans = await db.loan.findMany({ where: { borrowRequestId: pending.id } });
    const response = await cancel(await login('borrower-a'), pending.id);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('REQUEST_NOT_PENDING');
    expect(await db.borrowRequest.findUnique({ where: { id: pending.id } })).toEqual(before);
    expect(await db.loan.findMany({ where: { borrowRequestId: pending.id } })).toEqual(loans);
  });

  it('TEST-F03-16/TEST-F04-13 allows exactly one concurrent transition', async () => {
    const asset = await createAsset('CANCEL-RACE');
    const pending = await createRequest(asset.id);
    const owner = await login('borrower-a');
    const custodian = await login('custodian');
    const [cancelled, checkedOut] = await Promise.all([
      cancel(owner, pending.id), checkout(custodian.agent, custodian.csrf, pending.id)
    ]);
    const saved = await db.borrowRequest.findUniqueOrThrow({ where: { id: pending.id } });
    const loans = await db.loan.findMany({ where: { borrowRequestId: pending.id } });
    if (cancelled.status === 200) {
      expect(checkedOut.status).toBe(409);
      expect(checkedOut.body.error.code).toBe('REQUEST_NOT_PENDING');
      expect(saved.status).toBe('CANCELLED');
      expect(saved.fulfilledAt).toBeNull();
      expect(loans).toHaveLength(0);
    } else {
      expect(checkedOut.status).toBe(201);
      expect(cancelled.status).toBe(409);
      expect(cancelled.body.error.code).toBe('REQUEST_NOT_PENDING');
      expect(saved.status).toBe('FULFILLED');
      expect(saved.fulfilledAt).not.toBeNull();
      expect(loans).toHaveLength(1);
    }
  });
  it.each(['cancel', 'checkout'] as const)('barrier race forces %s to win', async winner => {
    const asset = await createAsset(`BARRIER-${winner}`);
    const pending = await createRequest(asset.id);
    const owner = await login('borrower-a');
    const custodian = await login('custodian');
    let ready!: () => void;
    let release!: () => void;
    const locked = new Promise<void>(resolve => { ready = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Asset" WHERE "id" = ${asset.id} FOR UPDATE`;
      ready();
      await gate;
    }, { timeout: 15000 });
    const waiters = async (expected: number) => {
      for (let i = 0; i < 100; i++) {
        const rows = await db.$queryRaw<{ count: bigint }[]>`
          SELECT count(*) AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%FROM "Asset"%' AND pid <> pg_backend_pid()`;
        if (Number(rows[0]?.count) >= expected) return;
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error(`Timed out waiting for ${expected} Asset lock waiters`);
    };
    let first!: Promise<request.Response>;
    let second!: Promise<request.Response>;
    try {
      await locked;
      const runCancel = () => cancel(owner, pending.id).then(result => result);
      const runCheckout = () => checkout(custodian.agent, custodian.csrf, pending.id).then(result => result);
      first = winner === 'cancel' ? runCancel() : runCheckout();
      await waiters(1);
      second = winner === 'cancel' ? runCheckout() : runCancel();
      await waiters(2);
    } finally { release(); await holder; }
    const [won, lost] = await Promise.all([first, second]);
    expect(won.status).toBe(winner === 'cancel' ? 200 : 201);
    expect(lost.status).toBe(409);
    expect(lost.body.error.code).toBe('REQUEST_NOT_PENDING');
    const saved = await db.borrowRequest.findUniqueOrThrow({where:{id:pending.id}});
    const loans = await db.loan.findMany({where:{borrowRequestId:pending.id}});
    if (winner === 'cancel') {
      expect(saved.status).toBe('CANCELLED');
      expect(saved.cancelledAt).not.toBeNull();
      expect(saved.fulfilledAt).toBeNull();
      expect(loans).toHaveLength(0);
    } else {
      expect(saved.status).toBe('FULFILLED');
      expect(saved.fulfilledAt).not.toBeNull();
      expect(saved.cancelledAt).toBeNull();
      expect(loans).toHaveLength(1);
    }
  }, 20000);
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
