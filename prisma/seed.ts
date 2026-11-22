import { PrismaClient, Role, Serviceability } from '@prisma/client';
import { hash } from 'argon2';

export function requiredSeedPassword(name: string, env: NodeJS.ProcessEnv = process.env) {
  const value = env[name];

  if (!value || value.length < 12) {
    throw new Error(`${name} must be set and contain at least 12 characters`);
  }

  return value;
}

// Validate every input before constructing the CLI client or writing any records.
export function readSeedConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const borrowerPassword = requiredSeedPassword('SEED_BORROWER_PASSWORD', env);
  const custodianPassword = requiredSeedPassword('SEED_CUSTODIAN_PASSWORD', env);
  try {
    const url = new URL(env.DATABASE_URL ?? '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
      throw new Error();
    }
  } catch {
    throw new Error('DATABASE_URL must identify a PostgreSQL database');
  }
  return { borrowerPassword, custodianPassword };
}

async function upsertUser(
  prisma: PrismaClient,
  email: string,
  displayName: string,
  role: Role,
  password: string
) {
  return prisma.user.upsert({
    where: { normalizedEmail: email },
    // Existing identities, including disabled or changed accounts, are authoritative.
    update: {},
    create: {
      normalizedEmail: email,
      displayName,
      role,
      passwordHash: await hash(password)
    }
  });
}

export async function runSeed(prisma: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  const { borrowerPassword, custodianPassword } = readSeedConfiguration(env);
  await upsertUser(
    prisma,
    'borrower@example.test',
    'Demo Borrower',
    Role.BORROWER,
    borrowerPassword
  );

  await upsertUser(
    prisma,
    'custodian@example.test',
    'Demo Custodian',
    Role.CUSTODIAN,
    custodianPassword
  );

  const laptopModel = await prisma.equipmentModel.upsert({
    where: {
      name_category: {
        name: 'ThinkPad Laptop',
        category: 'Computers'
      }
    },
    update: {},
    create: {
      name: 'ThinkPad Laptop',
      category: 'Computers',
      description: 'Synthetic department laptop fixture'
    }
  });

  const boardModel = await prisma.equipmentModel.upsert({
    where: {
      name_category: {
        name: 'Raspberry Pi Kit',
        category: 'Embedded'
      }
    },
    update: {},
    create: {
      name: 'Raspberry Pi Kit',
      category: 'Embedded',
      description: 'Synthetic embedded-systems fixture'
    }
  });

  await prisma.asset.upsert({
    where: {
      assetCode: 'BB-LAP-001'
    },
    update: {},
    create: {
      assetCode: 'BB-LAP-001',
      equipmentModelId: laptopModel.id,
      serviceability: Serviceability.SERVICEABLE
    }
  });

  await prisma.asset.upsert({
    where: {
      assetCode: 'BB-RPI-001'
    },
    update: {},
    create: {
      assetCode: 'BB-RPI-001',
      equipmentModelId: boardModel.id,
      serviceability: Serviceability.MAINTENANCE
    }
  });
}

async function main() {
  readSeedConfiguration();
  const prisma = new PrismaClient();

  try {
    await runSeed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const scriptPath = process.argv[1]?.replaceAll('\\', '/');

if (
  scriptPath === 'prisma/seed.ts' ||
  scriptPath?.endsWith('/prisma/seed.ts')
) {
  main().catch(() => {
    console.error('Demo seed failed. Check seed configuration, database connectivity and migrations. No credentials or database error details are logged.');
    process.exitCode = 1;
  });
}
