# F-01 — Sprint 1 End-to-End Integration Verification

**Project:** BorrowBase — Inventory and Borrowing System

**Issue:** #15 — Integrate and Verify End-to-End Borrowing Workflow

**Integration branch:** `sprint1-staging`

**Evidence branch:** `docs/sprint1-integration-evidence`

**Tested commit:** `3710af0`

**Verification date:** November 12, 2026

## 1. Objective

Verify that the Sprint 1 features work together as an integrated Inventory and Borrowing System.

The expected workflow begins with Borrower authentication and equipment selection, continues through borrowing request creation and Custodian checkout, and ends with an active Loan visible to the Borrower.

## 2. Integrated Features

| Feature | Function |
|---|---|
| F-01 Authentication | Login, logout, sessions, and role-based access |
| F-02 Equipment Catalog | Equipment listing, details, and availability |
| F-03 Borrowing Requests | Request creation and Borrower request history |
| F-04 Custodian Checkout | Pending request queue, checkout, and active Loans |
| SYS-01 Database | PostgreSQL and Prisma persistence |

F-02 and F-04 are present in the merged staging branch through PR #20 and PR #21, respectively.

## 3. Automated Verification Results

| Verification | Result |
|---|---|
| Backend unit and API tests, excluding PostgreSQL suites | 61 passed, 0 failed |
| Frontend component tests | 37 passed, 0 failed |
| F-04 real PostgreSQL integration tests | 11 passed, 0 failed |
| Backend TypeScript check | Passed |
| Frontend TypeScript check | Passed |
| Backend production build | Passed |
| Frontend production build | Passed |
| Git whitespace check | Passed |
| Working tree before evidence changes | Clean |

**Total executed and passing tests across the three successful test runs: 109.**

The categories above are separate test runs. PostgreSQL-specific suites for F-01, F-02 and F-03 were not individually rerun during this integration verification.

### Commands executed

```powershell
npm run typecheck
npm run build
npm run test -w frontend
npm run test -w backend -- --exclude "**/*.postgres.test.ts"
npm run test -w backend -- tests/f04.postgres.test.ts
git diff --check
git rev-parse --short HEAD
git status --short --branch
```

## 4. PostgreSQL Integration Verification

The F-04 PostgreSQL tests used the existing disposable database:

`borrowbase_sys01_f02_test`

Before execution, the following conditions were confirmed:

- `DATABASE_URL` selected the disposable test database.
- `SYS01_TEST_DATABASE=true` was set for the test process.
- Prisma reported that the database schema was up to date.
- No destructive reset was performed against the development database.

### Verified database scenarios

| Test ID | Result |
|---|---|
| TEST-F04-01 — Request listing, filtering and detail | Passed |
| TEST-F04-02 — Authentication and authorization | Passed |
| TEST-F04-03 — Borrower request to Custodian checkout | Passed |
| TEST-F04-04 — Maintenance, retired, and active Loan conflicts | Passed |
| TEST-F04-05 — Repeated checkout rejected | Passed |
| TEST-F04-06 — Concurrent checkout protection | Passed |
| TEST-F04-07 — Competing request remains PENDING | Passed |
| TEST-F04-08 — Invalid input, CSRF and rollback | Passed |

These tests verify that successful checkout creates one active Loan, updates the selected request and makes equipment unavailable.

They also verify that rejected checkout operations do not leave partially fulfilled requests or extra Loans.

### Safety-guard behavior

After the successful 11-test run, the temporary database environment variables were removed.

A subsequent accidental rerun was rejected during test initialization because no explicitly authorized disposable database was selected.

That command executed zero tests. The rejection demonstrates the database safety guard working as intended; it is not an application checkout failure.

## 5. Browser Workflow Verification

The integrated workflow was previously verified manually on the F-04 feature implementation before its merge into staging.

Observed behavior:

1. Demo Borrower submitted a request for `BB-LAP-001`.
2. Demo Custodian viewed the PENDING request.
3. Custodian confirmed checkout.
4. The request was fulfilled and an active Loan was created.
5. The equipment catalog displayed `BB-LAP-001` as unavailable.
6. The Custodian dashboard displayed the new active Loan.
7. Demo Borrower signed in and saw `BB-LAP-001` under My Active Loans.

The implementation used for this demonstration was subsequently merged into `sprint1-staging`.

## 6. Final Integration Evidence Status

The F-04 browser workflow was successfully verified before its
implementation was merged into sprint1-staging.

The integrated staging implementation was subsequently verified
using automated backend, frontend and PostgreSQL tests.

Verification results:
- Backend non-PostgreSQL tests: 61 passed.
- Frontend tests: 37 passed.
- F-04 PostgreSQL integration tests: 11 passed.
- Total: 109 passed across separate successful runs.
- TypeScript checks and production builds: PASS.

The recorded automated verification used commit 3710af0.
A separate post-merge staging browser rerun is not claimed
by these results.

Q-02 behavior was verified by TEST-F04-07:
competing requests remain PENDING after another request is fulfilled.

The original browser demonstration and automated verification
are retained as separate forms of evidence.