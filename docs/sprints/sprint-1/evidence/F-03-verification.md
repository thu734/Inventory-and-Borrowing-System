# F-03 Verification Evidence

Verification date: 7 November 2026.

## Scope and worktree

F-03 changes are limited to the borrowing routes/store, Borrower workspace and UI tests, F-03 PostgreSQL migration, F-03 contract/evidence, and the two application mounting points. No historical SYS-01 migration, Prisma schema, dependency manifest or F-01 source was modified. `git diff --check` passed.

No official lecturer handout or System-Level SDS was available in the checkout.

## Verification commands

| Command | Result |
|---|---|
| `npm run test:unit -w backend` | PASS — 4 files, 10 tests |
| `npm run test:api -w backend` | PASS — 1 file, 20 tests |
| `npm run test -w backend -- tests/f03.contract.red.test.ts` | PASS — 1 file, 3 tests |
| `npm run test -w backend -- tests/f03.postgres.test.ts` | PASS — 1 file, 31 tests |
| `npm run test -w backend -- tests/auth.postgres.test.ts` | PASS — 1 file, 5 tests |
| `npm run test:db` | PASS — 1 file, 5 tests |
| `npm run test:ui` | PASS — 2 files, 20 tests |
| `npm run typecheck` | PASS — backend and frontend |
| `npm run build` | PASS — backend and frontend |
| `npx prisma validate` | PASS with disposable `DATABASE_URL` |
| `npm run db:generate` | PASS with disposable `DATABASE_URL` |
| `git diff --check` | PASS |

The final successful automated total is **94 passed, 0 failed, 0 skipped**, without double-counting suites.

One earlier F-01 PostgreSQL attempt was intentionally excluded from the total because the fresh database had not been seeded with the fixture accounts. After `npm run db:seed`, the F-01 suite passed all 5 tests.

## PostgreSQL isolation and findings

Destructive database tests used temporary databases whose names began with:

- `borrowbase_sys01_f03_`
- `borrowbase_sys01_regression_`
- `borrowbase_sys01_audit_`

Each database was created solely for the test run and dropped afterward. No development, shared or production database was reset or modified.

`npm run db:migrate` applied both the historical SYS-01 migration and:

```text
prisma/migrations/20261107070000_f03_pending_request_uniqueness/migration.sql
```

Direct PostgreSQL inspection confirmed:

```text
BorrowRequest_one_pending_per_borrower_asset
CREATE UNIQUE INDEX ... ("borrowerId", "assetId")
WHERE (status = 'PENDING'::"BorrowRequestStatus")
```

The 31-test F-03 PostgreSQL suite verified persistence, no automatic Loan/reservation write, serviceability and active-Loan checks, owner scoping, 404 concealment, CSRF/Origin/RBAC, transaction rollback, Asset-lock recheck behavior, concurrent duplicate requests, independent database writers, different Borrowers, fulfilled-request reuse, returned-loan exclusion and safe errors.

## Acceptance results

| Criterion | Result | Evidence |
|---|---|---|
| AC-F03-01 | PASS | PG-01 |
| AC-F03-02 | PASS | PG-02 and invalid-body cases |
| AC-F03-03 | PASS | PG-03 |
| AC-F03-04 | PASS | PG-03 |
| AC-F03-05 | PASS | PG-04 and original contract tests |
| AC-F03-06 | PASS automated; browser refresh NOT VERIFIED | PG-05, UI-03 |
| AC-F03-07 | PASS | PG-06, including partial-index concurrency checks |
| AC-F03-08 | PARTIAL — component tests pass; browser keyboard/viewport NOT VERIFIED | UI-01/UI-02/UI-03 |
| AC-F03-09 | PASS | PG-07 and UI-02 |

Test files:

- [backend/tests/f03.postgres.test.ts](../../../backend/tests/f03.postgres.test.ts)
- [backend/tests/f03.contract.red.test.ts](../../../backend/tests/f03.contract.red.test.ts)
- [frontend/src/features/auth/f03.ui.test.tsx](../../../frontend/src/features/auth/f03.ui.test.tsx)

## Browser verification

The existing shared pages were inspected without submitting writes. They showed:

- Authenticated Borrower workspace.
- Selected-Asset request panel.
- My Requests/My Active Loans navigation.
- Existing request and active-loan detail rendering.
- Custodian view without Borrower request controls.

The full real browser journey is **NOT VERIFIED**. The running backend/frontend processes use the normal ports, but their database could not be confirmed as the disposable audit database. The Vite proxy is configured for backend port 3000, so no writes were submitted to an unverified database.

Not verified in a real browser:

1. Borrower login against the disposable database.
2. Real request submission and 201 response.
3. PostgreSQL owner/Asset/PENDING query after browser submission.
4. Browser refresh persistence.
5. Browser duplicate 409 and no-second-row check.
6. Cross-Borrower browser isolation.
7. Keyboard-only interaction at 360, 390, 768 and 1280 pixels.

The selected-Asset interface remains the documented F-02 seam; no catalog was added.

## Integration dependency

Q-01 is approved, implemented and tested: duplicate PENDING requests for the same Borrower/Asset pair are rejected with 409 and protected by the PostgreSQL partial unique index.

Q-02 is the chosen Sprint 1 policy: when F-04 fulfills one request and creates the Loan, competing BorrowRequests remain `PENDING`; a PENDING request is not an Asset reservation. This requires Member 2 acknowledgement during F-04 integration. F-03 does not implement checkout or claim end-to-end F-04 integration.

F-03 is ready for review with the browser limitations above disclosed.
