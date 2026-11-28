import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, finishApp } from '../src/app.ts';
import { hashPassword } from '../src/modules/auth/credentials.ts';
import { PrismaAuthStore } from '../src/modules/auth/auth.store.ts';
import { mountBorrowingRoutes } from '../src/modules/borrowing/borrowing.routes.ts';
import { PrismaBorrowingStore } from '../src/modules/borrowing/borrowing.store.ts';
import { mountCatalogRoutes } from '../src/modules/catalog/catalog.routes.ts';
import { PrismaCatalogStore } from '../src/modules/catalog/prisma-catalog.store.ts';
import { mountCustodianRoutes } from '../src/modules/custodian/custodian.routes.ts';
import { PrismaCustodianStore } from '../src/modules/custodian/custodian.store.ts';

// Deliberately reject every shared/default/cloud database, even if marked as test.
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/unsafe');
if (process.env.SYS01_TEST_DATABASE !== 'true' || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || !/^\/borrowbase_sys01_f05_/.test(url.pathname)) {
  throw new Error('F-05 requires an explicitly guarded disposable local borrowbase_sys01_f05_* database.');
}
const db = new PrismaClient();
const origin = 'http://localhost:5173';
const password = 'f05-disposable-synthetic-password';
const suffix = randomUUID();
const users = { borrower: '', other: '', custodian: '', receiver: '' };
const assetIds: string[] = [];
let modelId = '';
function build(client = db) {
  const auth = createApp({ store: new PrismaAuthStore(client), origin,
    csrfSecret: 'f05-test-only-csrf-secret-over-thirty-two-bytes', secureCookies: false });
  mountBorrowingRoutes(auth, new PrismaBorrowingStore(client));
  mountCatalogRoutes(auth, new PrismaCatalogStore(client));
  mountCustodianRoutes(auth, new PrismaCustodianStore(client));
  return finishApp(auth.app);
}
const app = build();
async function login(person = 'custodian', application = app) {
  const agent = request.agent(application);
  const response = await agent.post('/api/v1/auth/login').set('Origin', origin)
    .send({ email: `${person}-${suffix}@example.test`, password });
  expect(response.status, 'existing authentication fixture must work').toBe(200);
  return { agent, csrf: response.body.data.csrfToken as string };
}
type Auth = Awaited<ReturnType<typeof login>>;
const ret = (auth: Auth, id: string, body: object = {}) => auth.agent
  .post(`/api/v1/custodian/loans/${id}/return`).set('Origin', origin).set('X-CSRF-Token', auth.csrf).send(body);
const checkout = (auth: Auth, id: string) => auth.agent
  .post(`/api/v1/custodian/borrow-requests/${id}/checkout`).set('Origin', origin).set('X-CSRF-Token', auth.csrf).send({});
async function fixture() {
  const asset = await db.asset.create({ data: { assetCode: `F05-${randomUUID()}`, equipmentModelId: modelId } });
  assetIds.push(asset.id);
  // Both requests precede checkout: valid retained, non-reserving competitors.
  const selected = await db.borrowRequest.create({ data: { assetId: asset.id, borrowerId: users.borrower } });
  const competitor = await db.borrowRequest.create({ data: { assetId: asset.id, borrowerId: users.other } });
  const auth = await login();
  const response = await checkout(auth, selected.id);
  expect(response.status, 'existing checkout fixture must work').toBe(201);
  const loan = await db.loan.findUniqueOrThrow({ where: { id: response.body.data.loan.id } });
  return { asset, selected, competitor, loan, auth };
}
async function state(assetId: string) {
  return { asset: await db.asset.findUniqueOrThrow({ where: { id: assetId } }),
    requests: await db.borrowRequest.findMany({ where: { assetId }, orderBy: { id: 'asc' } }),
    loans: await db.loan.findMany({ where: { assetId }, orderBy: { id: 'asc' } }) };
}
beforeAll(async () => {
  await db.$connect();
  const identity = await db.$queryRaw<{ name: string; host: string }[]>`SELECT current_database() AS name, host(inet_server_addr()) AS host`;
  expect(identity[0]!.name).toMatch(/^borrowbase_sys01_f05_/);
  expect(identity[0]!.host).toBe('127.0.0.1');
  const passwordHash = await hashPassword(password);
  for (const person of ['borrower', 'other', 'custodian', 'receiver'] as const) {
    const user = await db.user.create({ data: { normalizedEmail: `${person}-${suffix}@example.test`,
      displayName: `F05 ${person}`, role: ['custodian', 'receiver'].includes(person) ? 'CUSTODIAN' : 'BORROWER', passwordHash } });
    users[person] = user.id;
  }
  modelId = (await db.equipmentModel.create({ data: { name: `F05 ${suffix}`, category: 'Synthetic F05' } })).id;
});
afterAll(async () => {
  try {
    await db.loan.deleteMany({ where: { assetId: { in: assetIds } } });
    await db.borrowRequest.deleteMany({ where: { assetId: { in: assetIds } } });
    await db.asset.deleteMany({ where: { id: { in: assetIds } } });
    await db.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
    await db.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    if (modelId) await db.equipmentModel.delete({ where: { id: modelId } });
  } finally { await db.$disconnect(); }
});

describe('F-05 real PostgreSQL return contract', () => {
  it('TEST-F05-01/14: actual Borrower request to checkout to return preserves the persisted lifecycle', async () => {
    const asset = await db.asset.create({ data: { assetCode: `F05-JOURNEY-${randomUUID()}`, equipmentModelId: modelId } });
    assetIds.push(asset.id);
    const borrower = await login('borrower'); const custodian = await login();
    const created = await borrower.agent.post('/api/v1/borrow-requests').set('Origin', origin)
      .set('X-CSRF-Token', borrower.csrf).send({ assetId: asset.id });
    expect(created.status).toBe(201);
    const checked = await checkout(custodian, created.body.data.id);
    expect(checked.status).toBe(201);
    const loanId = checked.body.data.loan.id;
    const returned = await ret(custodian, loanId);
    expect(returned.status).toBe(200);
    expect((await db.loan.findUniqueOrThrow({ where: { id: loanId } })).returnedById).toBe(users.custodian);
    expect((await borrower.agent.get(`/api/v1/me/borrow-requests/${created.body.data.id}`)).body.data.status).toBe('FULFILLED');
    expect((await borrower.agent.get('/api/v1/me/loans')).body.data.items.map((row: { id: string }) => row.id)).not.toContain(loanId);
    expect((await borrower.agent.get(`/api/v1/assets/${asset.id}`)).body.data.available).toBe(true);
  });

  it('CONTROL / TEST-F05-14: checkout persists one active Loan; database rejects a second active Loan', async () => {
    const f = await fixture();
    const second = await db.borrowRequest.create({ data: { assetId: f.asset.id, borrowerId: users.other,
      status: 'FULFILLED', fulfilledAt: f.loan.checkedOutAt } });
    await expect(db.loan.create({ data: { borrowRequestId: second.id, assetId: f.asset.id,
      borrowerId: users.other, checkedOutById: users.custodian, checkedOutAt: f.loan.checkedOutAt } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.loan.count({ where: { assetId: f.asset.id, returnedAt: null } })).toBe(1);
  });
  it('TEST-F05-01/02/05: exact authoritative return projection and preserved checkout identity', async () => {
    const f = await fixture(); const receiver = await login('receiver'); const before = await state(f.asset.id);
    const start = Date.now(); const response = await ret(receiver, f.loan.id);
    expect(response.status).toBe(200);
    const saved = await db.loan.findUniqueOrThrow({ where: { id: f.loan.id } });
    expect(saved).toEqual({ ...f.loan, returnedAt: expect.any(Date), returnedById: users.receiver });
    expect(saved.returnedAt!.getTime()).toBeGreaterThanOrEqual(Math.max(start, f.loan.checkedOutAt.getTime()));
    expect(saved.returnedAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(response.body).toEqual({ data: { id: f.loan.id, borrowRequestId: f.selected.id,
      borrower: { id: users.borrower, displayName: 'F05 borrower' },
      asset: { id: f.asset.id, assetCode: f.asset.assetCode, modelName: `F05 ${suffix}`, category: 'Synthetic F05', serviceability: 'SERVICEABLE', available: true },
      checkedOutAt: f.loan.checkedOutAt.toISOString(), returnedAt: saved.returnedAt!.toISOString(),
      returnedBy: { id: users.receiver, displayName: 'F05 receiver' } } });
    const after = await state(f.asset.id);
    expect(after.asset).toEqual(before.asset); expect(after.requests).toEqual(before.requests);
    expect((await f.auth.agent.get(`/api/v1/assets/${f.asset.id}`)).body.data.available).toBe(true);
  });
  it('TEST-F05-04: sequential repeat is 409 and cannot replace the recorded return', async () => {
    const f = await fixture(); expect((await ret(f.auth, f.loan.id)).status).toBe(200);
    const before = await state(f.asset.id);
    const repeat = await ret(await login('receiver'), f.loan.id);
    expect(repeat.status).toBe(409); expect(repeat.body.error.code).toBe('LOAN_ALREADY_RETURNED');
    expect(await state(f.asset.id)).toEqual(before);
  });
  it.each(['MAINTENANCE', 'RETIRED'] as const)('TEST-F05-06: %s remains unavailable after return', async serviceability => {
    const f = await fixture();
    // Synthetic legacy-state setup, not an F-07 administration operation.
    await db.asset.update({ where: { id: f.asset.id }, data: { serviceability } });
    const before = await state(f.asset.id);
    expect((await ret(f.auth, f.loan.id)).status).toBe(200);
    expect((await state(f.asset.id)).asset).toEqual(before.asset);
    expect((await f.auth.agent.get(`/api/v1/assets/${f.asset.id}`)).body.data).toMatchObject({ serviceability, available: false });
  });
  it('TEST-F05-07/14: return preserves PENDING/FULFILLED/CANCELLED history and permits a later checkout', async () => {
    const f = await fixture();
    const cancelled = await db.borrowRequest.create({ data: { assetId: f.asset.id, borrowerId: users.borrower,
      status: 'CANCELLED', cancelledAt: new Date() } });
    const before = await state(f.asset.id);
    expect((await ret(f.auth, f.loan.id)).status).toBe(200);
    expect((await state(f.asset.id)).requests).toEqual(before.requests);
    expect((await checkout(f.auth, cancelled.id)).status).toBe(409);
    expect((await checkout(f.auth, f.competitor.id)).status).toBe(201);
    expect(await db.loan.count({ where: { assetId: f.asset.id, returnedAt: null } })).toBe(1);
    const borrower = await login();
    expect((await checkout(borrower, f.selected.id)).status).toBe(409);
  });
  it('TEST-F05-11: fresh app/client retains return and both active collections exclude it', async () => {
    const f = await fixture(); expect((await ret(f.auth, f.loan.id)).status).toBe(200);
    const client = new PrismaClient();
    try {
      const fresh = build(client); const custodian = await login('custodian', fresh); const borrower = await login('borrower', fresh);
      for (const [auth, path] of [[custodian, '/api/v1/custodian/loans'], [borrower, '/api/v1/me/loans']] as const) {
        const response = await auth.agent.get(path); expect(response.status).toBe(200);
        expect(response.body.data.items.map((l: { id: string }) => l.id)).not.toContain(f.loan.id);
      }
      expect((await borrower.agent.get(`/api/v1/me/borrow-requests/${f.selected.id}`)).body.data.status).toBe('FULFILLED');
      expect((await client.loan.findUniqueOrThrow({ where: { id: f.loan.id } })).returnedById).toBe(users.custodian);
    } finally { await client.$disconnect(); }
  });
  it.each(['anonymous', 'borrower', 'inactive', 'revoked', 'origin', 'csrf'] as const)('TEST-F05-03: %s denied with zero writes', async mode => {
    const f = await fixture(); const before = await state(f.asset.id);
    const auth = await login(mode === 'borrower' ? 'borrower' : 'receiver');
    if (mode === 'inactive') await db.user.update({ where: { id: users.receiver }, data: { isActive: false } });
    if (mode === 'revoked') expect((await auth.agent.post('/api/v1/auth/logout').set('Origin', origin).set('X-CSRF-Token', auth.csrf).send({})).status).toBe(204);
    try {
      const call = mode === 'anonymous' ? request(app).post(`/api/v1/custodian/loans/${f.loan.id}/return`)
        : auth.agent.post(`/api/v1/custodian/loans/${f.loan.id}/return`);
      const response = await call.set('Origin', mode === 'origin' ? 'https://invalid.example.test' : origin)
        .set('X-CSRF-Token', mode === 'csrf' ? 'invalid' : auth.csrf).send({});
      expect(response.status).toBe(['anonymous', 'inactive', 'revoked'].includes(mode) ? 401 : 403);
      expect(await state(f.asset.id)).toEqual(before);
    } finally { if (mode === 'inactive') await db.user.update({ where: { id: users.receiver }, data: { isActive: true } }); }
  });
  it.each(['bad-id', 'missing-id', 'forged-fields'] as const)('TEST-F05-10/02: %s rejected safely without mutation', async mode => {
    const f = await fixture(); const before = await state(f.asset.id);
    const id = mode === 'bad-id' ? 'not-a-uuid' : mode === 'missing-id' ? randomUUID() : f.loan.id;
    const response = await ret(f.auth, id, mode === 'forged-fields' ? { returnedById: users.other, returnedAt: '2000-01-01T00:00:00Z' } : {});
    expect(response.status).toBe(mode === 'missing-id' ? 404 : 400);
    expect(response.body.error.code).toBe(mode === 'missing-id' ? 'NOT_FOUND' : 'INVALID_INPUT');
    expect(await state(f.asset.id)).toEqual(before);
  });
  it('TEST-F05-10: server clock before checkout rejects return without a partial write', async () => {
    const f = await fixture(); const future = new Date(Date.now() + 86_400_000);
    await db.loan.update({ where: { id: f.loan.id }, data: { checkedOutAt: future } });
    const before = await state(f.asset.id); const response = await ret(f.auth, f.loan.id);
    expect(response.status).toBe(409); expect(response.body.error.code).toBe('INVALID_LOAN_STATE');
    expect(await state(f.asset.id)).toEqual(before);
  });
  it('TEST-F05-09: database failure after update rolls back and is sanitized', async () => {
    const f = await fixture(); const before = await state(f.asset.id);
    await db.$executeRawUnsafe(`CREATE FUNCTION f05_fail_return() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'f05 injected private database detail'; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER f05_return_failure AFTER UPDATE ON "Loan" FOR EACH ROW WHEN (NEW."id" = '${f.loan.id}' AND NEW."returnedAt" IS NOT NULL) EXECUTE FUNCTION f05_fail_return()`);
      // Prove the injection is active independently of the missing return endpoint.
      await expect(db.loan.update({ where: { id: f.loan.id }, data: { returnedAt: new Date(), returnedById: users.custodian } })).rejects.toThrow('f05 injected');
      expect(await state(f.asset.id)).toEqual(before);
      const response = await ret(f.auth, f.loan.id);
      expect([500, 503]).toContain(response.status);
      expect(JSON.stringify(response.body)).not.toMatch(/f05 injected|SQL|stack|passwordHash/);
      expect(await state(f.asset.id)).toEqual(before);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS f05_return_failure ON "Loan"');
      await db.$executeRawUnsafe('DROP FUNCTION f05_fail_return()');
    }
  });

  // Queue real independent operations behind a holder, observing PostgreSQL lock waits.
  // Missing endpoint responses fail as 404-versus-expected, not misleading timeouts.
  async function ordered(f: Awaited<ReturnType<typeof fixture>>, firstReturn: boolean, doubleReturn = false) {
    const receiver = await login('receiver');
    let release!: () => void; let ready!: () => void;
    const gate = new Promise<void>(r => { release = r; }); const locked = new Promise<void>(r => { ready = r; });
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Asset" WHERE "id" = ${f.asset.id} FOR UPDATE`;
      ready(); await gate;
    }, { timeout: 15_000 });
    const operations: Promise<request.Response>[] = [];
    let failure: unknown;
    const enqueue = async (isReturn: boolean, expectedWaiters: number, second = false) => {
      let result: request.Response | undefined;
      const promise = (isReturn ? ret(second ? receiver : f.auth, f.loan.id) : checkout(f.auth, f.competitor.id)).then(r => { result = r; return r; });
      operations.push(promise);
      for (let i = 0; i < 120; i++) {
        if (result) {
          expect(result.status, 'operation must reach the Asset lock; endpoint is missing if 404').toBe(isReturn ? 200 : 201);
          throw new Error('Operation completed while Asset was locked; serialization contract was bypassed');
        }
        const rows = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Asset"%' AND pid <> pg_backend_pid()`;
        if (Number(rows[0]!.count) >= expectedWaiters) return;
        await new Promise(r => setTimeout(r, 20));
      }
      throw new Error('Expected operation did not reach the Asset lock');
    };
    try { await locked; await enqueue(firstReturn, 1); await enqueue(doubleReturn || !firstReturn, 2, true); }
    catch (error) { failure = error; }
    finally { release(); await holder; }
    const result = await Promise.all(operations);
    if (failure) throw failure;
    expect(result).toHaveLength(2);
    return [result[0]!, result[1]!] as const;
  }
  it('TEST-F05-04: two synchronized returns persist exactly one winner', async () => {
    const f = await fixture(); const before = await state(f.asset.id);
    const [won, lost] = await ordered(f, true, true);
    expect(won.status).toBe(200); expect(lost.status).toBe(409); expect(lost.body.error.code).toBe('LOAN_ALREADY_RETURNED');
    const saved = await db.loan.findUniqueOrThrow({ where: { id: f.loan.id } });
    expect(saved.returnedById).toBe(users.custodian); expect(saved.returnedAt!.toISOString()).toBe(won.body.data.returnedAt);
    expect((await state(f.asset.id)).requests).toEqual(before.requests);
    expect((await state(f.asset.id)).asset).toEqual(before.asset);
    expect(await db.loan.count({ where: { assetId: f.asset.id } })).toBe(1);
  }, 20_000);
  it.each([true, false])('TEST-F05-08: forced serialized order return-first=%s', async firstReturn => {
    const f = await fixture(); const [first, second] = await ordered(f, firstReturn);
    expect(first.status).toBe(firstReturn ? 200 : 409);
    expect(second.status).toBe(firstReturn ? 201 : 200);
    if (!firstReturn) {
      expect(first.body.error.code).toBe('ASSET_UNAVAILABLE');
      expect((await db.borrowRequest.findUniqueOrThrow({ where: { id: f.competitor.id } })).status).toBe('PENDING');
    }
    expect(await db.loan.count({ where: { assetId: f.asset.id, returnedAt: null } })).toBe(firstReturn ? 1 : 0);
    expect((await db.borrowRequest.findUniqueOrThrow({ where: { id: f.selected.id } })).status).toBe('FULFILLED');
  }, 20_000);
});
