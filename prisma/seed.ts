import { PrismaClient, Role, Serviceability } from '@prisma/client';
import { hash } from 'argon2';

export function requiredSeedPassword(name: string) {
  const value = process.env[name];
  if (!value || value.length < 12) {
    throw new Error(`${name} must be set and contain at least 12 characters`);
  }
  return value;
}

async function upsertUser(prisma: PrismaClient, email: string, displayName: string, role: Role, password: string) {
  return prisma.user.upsert({
    where: { normalizedEmail: email },
    update: { displayName, role, isActive: true, passwordHash: await hash(password) },
    create: { normalizedEmail: email, displayName, role, passwordHash: await hash(password) },
  });
}

export async function runSeed(prisma: PrismaClient) {
  await upsertUser(prisma, 'borrower@example.test', 'Demo Borrower', Role.BORROWER, requiredSeedPassword('SEED_BORROWER_PASSWORD'));
  await upsertUser(prisma, 'custodian@example.test', 'Demo Custodian', Role.CUSTODIAN, requiredSeedPassword('SEED_CUSTODIAN_PASSWORD'));

  const laptopModel = await prisma.equipmentModel.upsert({
    where: { name_category: { name: 'ThinkPad Laptop', category: 'Computers' } },
    update: { description: 'Synthetic department laptop fixture' },
    create: { name: 'ThinkPad Laptop', category: 'Computers', description: 'Synthetic department laptop fixture' },
  });
  const boardModel = await prisma.equipmentModel.upsert({
    where: { name_category: { name: 'Raspberry Pi Kit', category: 'Embedded' } },
    update: { description: 'Synthetic embedded-systems fixture' },
    create: { name: 'Raspberry Pi Kit', category: 'Embedded', description: 'Synthetic embedded-systems fixture' },
  });

  await prisma.asset.upsert({
    where: { assetCode: 'BB-LAP-001' },
    update: { equipmentModelId: laptopModel.id, serviceability: Serviceability.SERVICEABLE },
    create: { assetCode: 'BB-LAP-001', equipmentModelId: laptopModel.id, serviceability: Serviceability.SERVICEABLE },
  });
  await prisma.asset.upsert({
    where: { assetCode: 'BB-RPI-001' },
    update: { equipmentModelId: boardModel.id, serviceability: Serviceability.MAINTENANCE },
    create: { assetCode: 'BB-RPI-001', equipmentModelId: boardModel.id, serviceability: Serviceability.MAINTENANCE },
  });
}

async function main() {
  const prisma = new PrismaClient();
  await runSeed(prisma).finally(() => prisma.$disconnect());
}

if (process.argv[1]?.endsWith('/prisma/seed.ts')) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
