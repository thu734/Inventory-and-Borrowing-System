# BorrowBase

BorrowBase is a hypothetical KMUTT Computer Engineering equipment lending system built for CPE 334. It uses synthetic accounts and equipment data, not real university integrations.

## Features

The Sprint 1 increment implements the core equipment borrowing workflow.

### Implemented in Sprint 1

- **SYS-01 — Database Foundation:** PostgreSQL database, Prisma schema and migrations, synthetic seed data, and data integrity constraints.
- **F-01 — Authentication and Role-Based Access Control:** Borrower and Custodian login, logout, database-backed sessions, authentication guards, role authorization, and Origin/CSRF protection.
- **F-02 — Equipment Catalog and Availability:** Browse equipment, view Asset details, and check availability based on serviceability and active Loans.
- **F-03 — Borrowing Request Management:** Borrowers can submit equipment requests and view their borrowing records.
- **F-04 — Custodian Checkout and Loan Creation:** Custodians can review pending requests, check out eligible Assets, and create active Loan records using a database transaction.

### Sprint 1 Borrowing Workflow

1. The Borrower signs in.
2. The Borrower browses the Equipment Catalog.
3. The Borrower selects available equipment and submits a borrowing request.
4. The request is stored with PENDING status.
5. The Custodian signs in and reviews pending requests.
6. The Custodian checks out eligible equipment.
7. The request changes to FULFILLED and an active Loan is created.
8. The equipment becomes unavailable while the Loan is active.
9. The Borrower can view the active Loan in the application.

### Planned for Future Sprints

The following capabilities are planned for later development:

- Equipment returns and Loan completion.
- Inventory maintenance and administration.
- Reporting and additional management features.

The system currently uses synthetic accounts and equipment data for local development and testing. It is not connected to real university services.

## Technology stack

- Frontend: React, TypeScript and Vite.
- Backend: Node.js, Express, TypeScript and Argon2id password hashing.
- Database: PostgreSQL and Prisma.
- Tests: Vitest, Supertest and Testing Library; frontend tests use jsdom and mocked API calls.
- Package management: npm workspaces with a shared lockfile.

## Prerequisites

- Node.js **24.14 or later in the 24.x line** and npm (verified locally with npm 11.9).
- A running PostgreSQL server and a local role permitted to create/use development databases.
- PostgreSQL command-line tools for the `createdb` examples below. Alternatively, create the databases using your database administration tool.

Run all commands from the repository root unless noted otherwise.

## Local setup

After cloning the repository and entering its directory:

```bash
npm ci
cp .env.example .env
cp backend/.env.example backend/.env
```

Configure the two local environment files before migrating or starting the application. Do not overwrite existing local configuration when repeating setup.

## Environment configuration

The root [environment example](.env.example) configures Prisma setup and synthetic seeding. Set these values in your ignored root `.env`:

- `DATABASE_URL`: connection URL for your local development database, including local authentication details if required.
- `SEED_BORROWER_PASSWORD` and `SEED_CUSTODIAN_PASSWORD`: your own local synthetic passwords, each at least 12 characters. Replace both example placeholders.

The backend [environment example](backend/.env.example) configures the API. Set these values in `backend/.env`:

| Variable | Local configuration |
|---|---|
| `DATABASE_URL` | Use the same development database URL as the root configuration; the examples initially name different databases. |
| `NODE_ENV` | `development` |
| `PORT` | `3000` |
| `APP_ORIGIN` | `http://localhost:5173`, exactly matching the browser origin |
| `CSRF_SECRET` | Replace the placeholder with a randomly generated secret of at least 32 bytes. |

Generate a CSRF secret locally, then copy the output into `backend/.env`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Prisma CLI commands load the root `.env`; the backend development script loads `backend/.env`. Exported shell variables take precedence, so avoid retaining test database settings in your application shell. Never commit local environment files, passwords or session secrets.

## PostgreSQL migrations and synthetic seed

For a new local database using the root example's database name:

```bash
createdb borrowbase_sys01_local
npm run db:generate
npm run db:migrate
npm run db:seed
```

Adjust the database name and connection URL for your local PostgreSQL role/server. These commands generate Prisma Client, apply committed migrations and seed synthetic records; no database reset is required.

The seed creates `borrower@example.test` and `custodian@example.test`. Sign in with the corresponding password you configured locally. Re-running the seed updates those accounts, their password hashes and the synthetic equipment fixtures; use it only against a development or disposable test database.

## Start the backend and frontend

Start both development servers:

```bash
npm run dev
```

Or start them in separate terminals:

```bash
npm run dev -w backend
npm run dev -w frontend
```

Open **http://localhost:5173**. The API defaults to port **3000**, with authentication routes under `/api/v1/auth`. Vite proxies `/api` to `http://localhost:3000`; keep that port for the documented local setup. If Vite selects another port because 5173 is occupied, free port 5173 or update `APP_ORIGIN` to match before signing in.

Startup does not migrate or seed the database. The backend uses `PrismaAuthStore`, with no in-memory fallback accounts.

## Tests, typechecks and builds

These focused checks do not require a live database:

```bash
npm run test:unit
npm run test:api
npm run test:ui
npm run typecheck
npm run build
```

### Isolated PostgreSQL tests

Database tests are separate from ordinary application startup. Use a dedicated disposable database, never the running application's database or shared data. Both database suites require `SYS01_TEST_DATABASE=true` and a database name equal to `borrowbase_sys01` or beginning with `borrowbase_sys01_`.

Create a dedicated test database:

```bash
createdb borrowbase_sys01_test
cp .env.example .env.test
```

Edit the ignored `.env.test` file: point `DATABASE_URL` to that disposable database, add `SYS01_TEST_DATABASE=true`, and configure the two synthetic seed passwords. The existing F-01 PostgreSQL suite expects the fixture passwords specified in [auth.postgres.test.ts](backend/tests/auth.postgres.test.ts); use those values only in this isolated test configuration. Keep values shell-compatible, quoting them where necessary.

In a separate test terminal, load that configuration and prepare the database:

```bash
set -a
. ./.env.test
set +a
npm run db:generate
npm run db:migrate
npm run db:seed
```

Then run the relevant checks:

```bash
# Real PostgreSQL F-01 authentication tests only
npm run test -w backend -- tests/auth.postgres.test.ts

# SYS-01 database-foundation tests
npm run test:db

# All backend and frontend tests (includes F-01 PostgreSQL tests, not SYS-01 tests)
npm test
```

The database suites mutate test data. In particular, the F-01 suite removes sessions for its seeded users during cleanup. Close the test terminal when finished to avoid reusing its database environment for ordinary startup.

## Project Structure

```text
.
├── backend/
│   ├── src/                         Express API, authentication and configuration
│   └── tests/                       Unit, API and PostgreSQL authentication tests
├── frontend/
│   └── src/                         React UI, API client, styles and UI tests
├── prisma/
│   ├── schema.prisma                Shared database models
│   ├── migrations/                  Committed PostgreSQL migrations
│   ├── seed.ts                      Synthetic accounts and equipment fixtures
│   └── tests/                       Database-foundation regression tests
├── docs/                            SRS, features, traceability and database guide
│   └── sprints/sprint-1/contracts/   F-01 engineering contract and verification
├── artifacts/screenshots/sprint-1/f01/  Five browser QA screenshots
├── .env.example                     Local database and seed configuration template
└── package.json                     Workspace configuration and shared commands
```

This tree shows the current implementation only; planned architecture is not presented as existing code.

## Documentation

- [Software Requirements Specification](docs/srs.md)
- [Feature inventory](docs/features.md)
- [Requirements traceability](docs/traceability.md)
- [F-01 authentication contract and verification evidence](docs/sprints/sprint-1/contracts/F-01-authentication.md)
- [SYS-01 database setup and integrity documentation](docs/sys01-database.md)

## Limitations

- Selected genuine browser QA exists, but there is no repository-native Playwright E2E suite. Detailed acceptance evidence belongs in the F-01 contract.
- Local HTTP verification does not establish deployed HTTPS/Secure-cookie behavior or comprehensive production log secrecy. Production configuration requires an HTTPS origin.
- Login limiting is process-local, not distributed.
- Three known high-severity Prisma dependency audit findings remain unresolved; see the [dependency disclosure](docs/sys01-database.md#dependency-audit). No automatic Prisma upgrade is applied.
