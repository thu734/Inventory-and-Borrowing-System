import { PrismaClient, Role, Serviceability } from '@prisma/client';
import { runSeed } from '../seed';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('SYS-01 database tests require DATABASE_URL for an isolated test database');
}
if (process.env.SYS01_TEST_DATABASE !== 'true') {
  throw new Error('SYS-01 database tests require SYS01_TEST_DATABASE=true');
}
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (!/^borrowbase_sys01(?:_|$)/.test(databaseName)) {
  throw new Error(`Refusing database tests against unsafe database "${databaseName}"`);
}

describe('SYS-01 PostgreSQL foundation', () => {
  const prisma = new PrismaClient();
  let modelId: string;
  let borrowerId: string;
  let custodianId: string;
  let assetId: string;
  let requestId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    const borrower = await prisma.user.create({
      data: { normalizedEmail: `test-borrower-${suffix}@example.test`, displayName: 'Test Borrower', passwordHash: 'argon2id-test', role: Role.BORROWER },
    });
    const custodian = await prisma.user.create({
      data: { normalizedEmail: `test-custodian-${suffix}@example.test`, displayName: 'Test Custodian', passwordHash: 'argon2id-test', role: Role.CUSTODIAN },
    });
    const model = await prisma.equipmentModel.create({ data: { name: `Test Model ${suffix}`, category: 'Test' } });
    const asset = await prisma.asset.create({ data: { equipmentModelId: model.id, assetCode: `TEST-${suffix}` } });
    const request = await prisma.borrowRequest.create({ data: { borrowerId: borrower.id, assetId: asset.id } });
    borrowerId = borrower.id; custodianId = custodian.id; modelId = model.id; assetId = asset.id; requestId = request.id;
  });

  afterAll(async () => {
    await prisma.loan.deleteMany({ where: { assetId } });
    await prisma.borrowRequest.deleteMany({ where: { id: requestId } });
    await prisma.asset.deleteMany({ where: { id: assetId } });
    await prisma.equipmentModel.deleteMany({ where: { id: modelId } });
    await prisma.user.deleteMany({ where: { id: { in: [borrowerId, custodianId] } } });
    await prisma.$disconnect();
  });

  it('persists the shared authentication and lending relationships', async () => {
    const loan = await prisma.$transaction(async tx => {
      const fulfilledAt = new Date();
      await tx.borrowRequest.update({ where: { id: requestId }, data: { status: 'FULFILLED', fulfilledAt } });
      return tx.loan.create({
        data: { borrowRequestId: requestId, assetId, borrowerId, checkedOutById: custodianId },
      });
    });
    expect(loan.assetId).toBe(assetId);
    await expect(prisma.loan.create({
      data: { borrowRequestId: requestId, assetId, borrowerId, checkedOutById: custodianId },
    })).rejects.toThrow();
  });

  it('rejects a Loan whose borrower or asset differs from its request', async () => {
    const otherBorrower = await prisma.user.create({
      data: { normalizedEmail: `test-mismatch-${suffix}@example.test`, displayName: 'Mismatch Borrower', passwordHash: 'argon2id-test', role: Role.BORROWER },
    });
    const otherModel = await prisma.equipmentModel.create({ data: { name: `Mismatch Model ${suffix}`, category: 'Test' } });
    const otherAsset = await prisma.asset.create({ data: { equipmentModelId: otherModel.id, assetCode: `MISMATCH-${suffix}` } });
    try {
      await expect(prisma.loan.create({
        data: { borrowRequestId: requestId, assetId: otherAsset.id, borrowerId, checkedOutById: custodianId },
      })).rejects.toThrow();
      await expect(prisma.loan.create({
        data: { borrowRequestId: requestId, assetId, borrowerId: otherBorrower.id, checkedOutById: custodianId },
      })).rejects.toThrow();
    } finally {
      await prisma.asset.delete({ where: { id: otherAsset.id } });
      await prisma.equipmentModel.delete({ where: { id: otherModel.id } });
      await prisma.user.delete({ where: { id: otherBorrower.id } });
    }
  });

  it('preserves existing requests and loans across repeated seeding', async () => {
    const before = await prisma.loan.findUniqueOrThrow({ where: { borrowRequestId: requestId } });
    await runSeed(prisma);
    await runSeed(prisma);
    const after = await prisma.loan.findUniqueOrThrow({ where: { borrowRequestId: requestId } });
    const request = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(after).toEqual(before);
    expect(request.status).toBe('FULFILLED');
    expect(request.fulfilledAt).not.toBeNull();
  });

  it('rejects a second active loan for the same asset', async () => {
    const secondBorrower = await prisma.user.create({
      data: { normalizedEmail: `test-second-${suffix}@example.test`, displayName: 'Second Borrower', passwordHash: 'argon2id-test', role: Role.BORROWER },
    });
    try {
      const secondRequest = await prisma.borrowRequest.create({ data: { borrowerId: secondBorrower.id, assetId, status: 'PENDING' } });
      try {
        await expect(prisma.loan.create({
          data: { borrowRequestId: secondRequest.id, assetId, borrowerId: secondBorrower.id, checkedOutById: custodianId },
        })).rejects.toThrow();
      } finally {
        await prisma.borrowRequest.delete({ where: { id: secondRequest.id } });
      }
    } finally {
      await prisma.user.delete({ where: { id: secondBorrower.id } });
    }
  });

  it('derives serviceability independently from borrowing state', async () => {
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    expect(asset.serviceability).toBe(Serviceability.SERVICEABLE);
  });
});
