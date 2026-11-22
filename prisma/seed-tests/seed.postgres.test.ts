import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient, Role, Serviceability } from '@prisma/client';
import { hash, verify } from 'argon2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../seed';

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/unsafe');
if (process.env.SYS01_TEST_DATABASE !== 'true' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.searchParams.has('host') ||
    !/^\/borrowbase_sys01_seed_[a-z0-9_]+$/.test(url.pathname)) {
  throw new Error('Seed tests require an empty, dedicated local borrowbase_sys01_seed_* database and SYS01_TEST_DATABASE=true');
}
const db = new PrismaClient();
const config = {
  DATABASE_URL: process.env.DATABASE_URL,
  SEED_BORROWER_PASSWORD: randomBytes(24).toString('hex'),
  SEED_CUSTODIAN_PASSWORD: randomBytes(24).toString('hex'),
};
let ownsFixtures = false;
async function snapshot() {
  return Promise.all([
    db.user.findMany({ orderBy: { id: 'asc' } }),
    db.equipmentModel.findMany({ orderBy: { id: 'asc' } }),
    db.asset.findMany({ orderBy: { id: 'asc' } }),
    db.borrowRequest.findMany({ orderBy: { id: 'asc' } }),
    db.loan.findMany({ orderBy: { id: 'asc' } }),
    db.session.findMany({ orderBy: { id: 'asc' } }),
  ]);
}
async function clearOwnedFixtures() {
  if (!ownsFixtures) return;
  await db.loan.deleteMany();
  await db.borrowRequest.deleteMany();
  await db.session.deleteMany();
  await db.asset.deleteMany();
  await db.equipmentModel.deleteMany();
  await db.user.deleteMany();
}

// Separate from foundation.test.ts: these tests exclusively own an initially empty DB.
describe('non-destructive demo seed (dedicated PostgreSQL)', () => {
  beforeAll(async () => {
    const rows = await snapshot();
    if (rows.some(table => table.length !== 0)) throw new Error('Seed test database must initially contain no application records');
    ownsFixtures = true;
  });
  beforeEach(clearOwnedFixtures);
  afterAll(async () => {
    try { await clearOwnedFixtures(); } finally { await db.$disconnect(); }
  });

  it('creates only approved accounts, models and assets with hashed passwords', async () => {
    await runSeed(db, config);
    expect((await snapshot()).map(table => table.length)).toEqual([2, 2, 2, 0, 0, 0]);
    const users = await db.user.findMany({ orderBy: { normalizedEmail: 'asc' } });
    expect(users.map(u => [u.normalizedEmail, u.displayName, u.role, u.isActive])).toEqual([
      ['borrower@example.test', 'Demo Borrower', 'BORROWER', true],
      ['custodian@example.test', 'Demo Custodian', 'CUSTODIAN', true],
    ]);
    expect(await verify(users[0]!.passwordHash, config.SEED_BORROWER_PASSWORD)).toBe(true);
    expect(await verify(users[1]!.passwordHash, config.SEED_CUSTODIAN_PASSWORD)).toBe(true);
    const assets = await db.asset.findMany({ include: { equipmentModel: true }, orderBy: { assetCode: 'asc' } });
    expect(assets.map(a => [a.assetCode, a.serviceability, a.equipmentModel.name])).toEqual([
      ['BB-LAP-001', 'SERVICEABLE', 'ThinkPad Laptop'],
      ['BB-RPI-001', 'MAINTENANCE', 'Raspberry Pi Kit'],
    ]);
  });

  it('preserves credentials, roles, disabled accounts, associations and all domain records across reruns', async () => {
    await runSeed(db, config);
    const borrower = await db.user.findUniqueOrThrow({ where: { normalizedEmail: 'borrower@example.test' } });
    const custodian = await db.user.findUniqueOrThrow({ where: { normalizedEmail: 'custodian@example.test' } });
    const laptop = await db.asset.findUniqueOrThrow({ where: { assetCode: 'BB-LAP-001' } });
    const board = await db.asset.findUniqueOrThrow({ where: { assetCode: 'BB-RPI-001' } });
    const model = await db.equipmentModel.create({ data: { name: 'Unrelated existing model', category: 'Test' } });
    await db.asset.create({ data: { assetCode: 'UNRELATED-SEED-TEST', equipmentModelId: model.id } });
    const request = await db.borrowRequest.create({ data: { borrowerId: borrower.id, assetId: laptop.id, status: 'FULFILLED', fulfilledAt: new Date() } });
    await db.loan.create({ data: { borrowRequestId: request.id, borrowerId: borrower.id, assetId: laptop.id, checkedOutById: custodian.id } });
    await db.borrowRequest.create({ data: { borrowerId: borrower.id, assetId: board.id } });
    await db.session.create({ data: { userId: borrower.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const changedHash = await hash(randomBytes(24).toString('hex'));
    await db.user.update({ where: { id: borrower.id }, data: { displayName: 'Preserved identity', passwordHash: changedHash, role: Role.CUSTODIAN, isActive: false } });
    await db.user.update({ where: { id: custodian.id }, data: { role: Role.BORROWER, isActive: false } });
    await db.asset.update({ where: { id: laptop.id }, data: { equipmentModelId: model.id, serviceability: Serviceability.RETIRED } });
    await db.asset.update({ where: { id: board.id }, data: { serviceability: Serviceability.SERVICEABLE } });
    await db.equipmentModel.updateMany({ where: { id: { in: [laptop.equipmentModelId, board.equipmentModelId] } }, data: { description: 'Preserve edited description' } });
    const before = JSON.stringify(await snapshot());
    const changedConfig = { ...config, SEED_BORROWER_PASSWORD: randomBytes(24).toString('hex'), SEED_CUSTODIAN_PASSWORD: randomBytes(24).toString('hex') };
    await runSeed(db, changedConfig);
    await runSeed(db, changedConfig);
    // Compare booleans so a failed assertion cannot print password hashes or tokens.
    expect(JSON.stringify(await snapshot()) === before).toBe(true);
  });

  it('creates a missing approved asset without changing any existing records', async () => {
    await runSeed(db, config);
    await db.asset.delete({ where: { assetCode: 'BB-RPI-001' } });
    const before = await snapshot();
    await runSeed(db, config);
    const after = await snapshot();
    expect(after[2]!.length).toBe(2);
    expect(before.every((table, index) => table.every(row =>
      after[index]!.some(candidate => JSON.stringify(candidate) === JSON.stringify(row))))).toBe(true);
  });

  it.each([
    ['SEED_BORROWER_PASSWORD', undefined], ['SEED_BORROWER_PASSWORD', 'short'],
    ['SEED_CUSTODIAN_PASSWORD', undefined], ['SEED_CUSTODIAN_PASSWORD', 'short'],
    ['DATABASE_URL', undefined], ['DATABASE_URL', 'invalid'],
    ['DATABASE_URL', 'https://example.invalid/database'], ['DATABASE_URL', 'postgresql://localhost/'],
  ])('rejects invalid %s before any records are written (%#)', async (name, value) => {
    await expect(runSeed(db, { ...config, [name!]: value })).rejects.toThrow();
    expect((await snapshot()).every(table => table.length === 0)).toBe(true);
  });

  it('reports a real CLI database failure without leaking credentials or internal errors', () => {
    const missingSchema = new URL(config.DATABASE_URL!);
    missingSchema.searchParams.set('schema', 'seed_test_missing_schema');
    const result = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'prisma/seed.ts'], {
      cwd: process.cwd(), env: { ...process.env, ...config, DATABASE_URL: missingSchema.href }, encoding: 'utf8', timeout: 10000,
    });
    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Demo seed failed.');
    for (const secret of [config.SEED_BORROWER_PASSWORD, config.SEED_CUSTODIAN_PASSWORD, missingSchema.href]) {
      expect(output.includes(secret)).toBe(false);
    }
    expect(/PrismaClient|stack|seed_test_missing_schema/.test(output)).toBe(false);
  });
});
