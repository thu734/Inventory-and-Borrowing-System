# SYS-01 — Shared Database Foundation

## Scope

SYS-01 provides the shared PostgreSQL/Prisma foundation for F-01 through F-04. It defines persistence and integrity only; it does not implement catalog, borrowing-request, or checkout endpoints.

The schema contains `User`, `Session`, `EquipmentModel`, `Asset`, `BorrowRequest`, and `Loan`. Availability is derived from `Asset.serviceability` and the absence of an active Loan. An active Loan has `returnedAt IS NULL`.

## Setup

Requirements: Node 24, npm, and an isolated PostgreSQL database.

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
export SEED_BORROWER_PASSWORD='local-borrower-password'
export SEED_CUSTODIAN_PASSWORD='local-custodian-password'
npm run db:seed
```

Set `DATABASE_URL` to the isolated database before running these commands. Put it and both seed passwords in the ignored local `.env` file, or export them in the shell. The seed is idempotent and uses synthetic accounts:

- `borrower@example.test` / `SEED_BORROWER_PASSWORD`
- `custodian@example.test` / `SEED_CUSTODIAN_PASSWORD`

These credentials are for local synthetic data only. Do not commit `.env`.

## Verification

```bash
SYS01_TEST_DATABASE=true npm run test:db
```

The database test suite requires `DATABASE_URL` and `SYS01_TEST_DATABASE=true`. It refuses database names that do not begin with `borrowbase_sys01`, applies against a database that has already received the committed migration, and cleans up only its own generated fixtures. It verifies relationship persistence, composite Loan/request consistency, repeated-seed preservation, and exclusive active Loans.

## Shared interfaces

F-01 consumes `User.normalizedEmail`, `User.displayName`, `User.passwordHash`, `User.role`, `User.isActive`, and all `Session` fields through its `PrismaAuthStore` adapter. F-02 reads `EquipmentModel` and `Asset`; F-04 uses `BorrowRequest` and `Loan`. Feature branches must use this schema and migration rather than duplicate models or migrations.

The partial unique index `Loan_one_active_per_asset` enforces at most one active Loan per Asset. The composite Loan foreign key also requires the Loan borrower and asset to match its BorrowRequest. Checkout must still perform an atomic domain transaction and translate a uniqueness conflict into its approved safe conflict response.

## Dependency audit

The current Prisma 6.19.3 dependency tree has three high-severity audit findings: `prisma` directly depends on `@prisma/config`, which depends on `deepmerge-ts`. The advisory concerns stack exhaustion on recursive object graphs. npm proposes Prisma 7.10.1, a major upgrade; no automatic or breaking upgrade is applied here. Reassess this dependency separately with Prisma compatibility testing.
