# F-04 — Custodian Checkout Verification

**Project:** BorrowBase — Inventory and Borrowing System
**Feature:** F-04 Custodian Queue, Checkout and Active Loans
**Branch:** `feature/f04-custodian-checkout`
**Tested code commit:** `ca2fc51`
**Verification date:** November 12, 2026

## 1. Implementation Summary

F-04 implements the Custodian borrowing request queue, checkout operation and active Loan display.

The backend uses authenticated Custodian access, Origin/CSRF checks, PostgreSQL transactions, Asset row locking, availability validation and active Loan uniqueness protection.

The frontend provides a Custodian Workspace with pending requests, status filtering, checkout confirmation, success/error messages and active Loans.

## 2. Automated Test Results

| Test category | Test file | Result |
|---|---|---|
| F-04 unit tests | `backend/tests/unit/f04.checkout-rules.test.ts` | 5 passed |
| F-04 API tests | `backend/tests/f04.api.test.ts` | 15 passed |
| F-04 PostgreSQL tests | `backend/tests/f04.postgres.test.ts` | 11 passed |
| F-04 UI tests | `frontend/src/features/custodian/custodian.ui.test.tsx` | 9 passed |
| Complete frontend suite | Frontend Vitest suite | 37 passed |

**Total F-04 tests: 40 passed, 0 failed, 0 skipped in successful targeted runs.**

### Commands executed

```powershell
npm run test -w backend -- tests/unit/f04.checkout-rules.test.ts
npm run test -w backend -- tests/f04.api.test.ts
npm run test -w backend -- tests/f04.postgres.test.ts
npm run test -w frontend -- src/features/custodian/custodian.ui.test.tsx
npm run test -w frontend
npm run typecheck
npm run build
git diff --check
```

The PostgreSQL tests used the existing disposable `borrowbase_sys01_f02_test` database with `SYS01_TEST_DATABASE=true` and an explicitly selected test `DATABASE_URL`.

The development database `borrowbase_sys01_local` was not used for automated checkout integration testing.

The unrestricted backend test command also executed 61 passing non-database tests, but three PostgreSQL suites were blocked by their database safety guards. Those suites require separate configured test databases.

## 3. PostgreSQL Checkout Verification

The real database tests verified:

- Successful checkout updates a request from PENDING to FULFILLED.
- Exactly one active Loan is created with the correct Borrower, Asset and Custodian.
- MAINTENANCE and RETIRED Assets cannot be checked out.
- Assets with an active Loan cannot be checked out again.
- Repeated checkout of a fulfilled request is rejected.
- Concurrent checkout attempts for one Asset produce only one successful checkout.
- Competing requests remain PENDING under the proposed Q-02 policy.
- Failed Loan insertion rolls back request fulfillment.
- F-02 availability and F-03 Borrower active Loan retrieval reflect the checkout.

## 4. Manual Browser Verification

**Result: Passed**

The following workflow was manually verified:

1. Demo Borrower submits a borrowing request.
2. Demo Custodian signs in and views the pending request.
3. Custodian confirms checkout.
4. The system displays a successful checkout message.
5. The request disappears from the Pending queue.
6. The new Loan appears in the Custodian Active Loans section.
7. The Equipment Catalog shows BB-LAP-001 as Unavailable.
8. Demo Borrower signs in and sees BB-LAP-001 under My Active Loans.

**Verified equipment:** BB-LAP-001 — ThinkPad Laptop.

## 5. TDD Evidence

The F-04 checkout-rule test was run against a temporary unimplemented function.

**RED:** 5 tests failed as expected.

After implementing the checkout eligibility rules:

**GREEN:** 5 tests passed.

The final rule implementation rejects fulfilled requests, unserviceable equipment and Assets with existing active Loans.

## 6. Remaining Review Items

- Teammate approval of the proposed Q-02 policy is still required.
- Automated unit/API/PostgreSQL tests and the observed browser workflow have passed; a full automated browser end-to-end suite has not been established.
- Responsive and keyboard-accessibility checks should be recorded separately.
- Feature PR review and merge into `sprint1-staging` are pending.
- Final Sprint 1 release verification and promotion to `main` are separate deliverable tasks.

## 7. Verification Conclusion

F-04 has passed its targeted unit, API, PostgreSQL and frontend component tests. The integrated Borrower-to-Custodian checkout workflow was also verified manually in the browser.

The feature is ready for teammate review, subject to the remaining documentation, policy approval and release checks.