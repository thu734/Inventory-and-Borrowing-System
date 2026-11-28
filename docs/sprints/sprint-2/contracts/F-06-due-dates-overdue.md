# F-06 — Due Dates and Overdue

- Contract version: 0.2
- STS version: 0.2
- Revision date: 2026-11-24
- Author: Thu Thu Wai - 3486
- Reviewer: MoeD3482; approved baseline `b54f722` in [PR #73](https://github.com/thu734/Inventory-and-Borrowing-System/pull/73), 26 November 2026 (Asia/Bangkok)
Approval status: baseline contract/STS approved in PR #73; not implemented; tests not executed. Current clarifications are the selected implementation baseline, subject to normal PR review.

## Traceability and layer impact

Requirements: FR-08; BR-06, BR-08; NFR-01, NFR-03, NFR-06, NFR-08, NFR-09. Dependencies: F-04 checkout, F-05 returns, SYS-01 migration, F-09 history and F-10 reporting. F-06 supplies data; it does not add the Sprint 3 history workflow.

| Layer | Classification | Reason |
|---|---|---|
| UI | Required change | Existing authorized active-loan views show checkout, due and active/overdue states with accessible loading/error states. No completed-loan history screen is introduced. |
| API | Required modification | F-04 checkout and active-loan projections add server `dueAt` and derived status; no client due-date route. |
| Data | Required change | Add `Loan.dueAt`; migrate/backfill safely before relying on non-null values. |

## Reviewed Q-03 policy and SDS

Fixed `7 × 24` hours from successful checkout. Server persists `dueAt = checkedOutAt + 7 days`; clients cannot select, renew or override duration. Store UTC instants and display Asia/Bangkok. Active overdue is strictly `serverNow > dueAt`; equality is not overdue. Returned Loans are not currently overdue; `returnedLate = returnedAt > dueAt` is historical derived data. This policy was confirmed in PR #73.

Migration: add nullable `dueAt`; backfill only rows where it is null from original `checkedOutAt`; verify zero missing values and unchanged owner, Asset, request, checkout, return and Custodian fields; then apply any final non-null constraint. Empty DB succeeds, partial runs resume missing rows, repeats are no-ops, and failure rolls back the current transaction/batch. A backfilled date is policy-derived and does not prove a historical policy violation.

Checkout response and authorized Borrower/Custodian active-loan projections include UTC ISO `checkedOutAt` and `dueAt`, plus derived `overdue`. Sprint 2 displays that data only in existing active-loan views. `returnedLate` remains available as derived data for the Sprint 3 F-09 completed-loan history projection; it does not introduce a Sprint 2 history UI. Checkout retains its strict empty-object body: duration/due/renewal fields return `400 INVALID_INPUT` with no request or Loan mutation; no client value is authoritative. 401/403/404 and safe 500/503 conventions remain unchanged.

Existing read access is unchanged; TEST-F06-08 executes this matrix using two Borrowers with active and returned Loans:

| Caller and existing GET route | Required result |
|---|---|
| BORROWER: `/api/v1/me/loans` | 200 collection of own active Loans only, with dueAt/overdue; exclude foreign and returned Loans before projection, including any counts |
| BORROWER: `/api/v1/me/loans/:id`, own active Loan | 200 own projection with dueAt/overdue |
| BORROWER: same detail route, foreign, missing or returned Loan | Same 404 `NOT_FOUND`; no private fields or distinguishing response |
| CUSTODIAN: `/api/v1/custodian/loans` | 200 active-Loan collection across the shared department, with dueAt/overdue; returned Loans excluded |
| BORROWER on Custodian collection; CUSTODIAN on Borrower collection/detail | 403 `FORBIDDEN`; no protected data |
| Anonymous/invalid/inactive session on any listed route | 401 `UNAUTHENTICATED`; no protected data |

No Custodian Loan-detail or completed-history endpoint is introduced by F-06. Collection success remains 200 with `items:[]` when no permitted active Loans exist; it is not a foreign-detail 404.

Example: `2026-11-24T03:00:00Z` gives `2026-12-01T03:00:00Z`, displayed Bangkok as `2026-12-01 10:00`; exactly due is not overdue, one millisecond after is overdue.

## Acceptance criteria and STS

| AC | Observable result | STS |
|---|---|---|
| AC-F06-01 | Checkout persists server dueAt exactly 168 hours after checkedOutAt. | TEST-F06-01 |
| AC-F06-02 | Client duration/due/renewal fields are rejected with 400 and no mutation. | TEST-F06-02 |
| AC-F06-03 | UTC storage and Bangkok display represent one instant. | TEST-F06-03 |
| AC-F06-04 | Only active Loans after the strict boundary are overdue. | TEST-F06-04 |
| AC-F06-05 | Returned Loans are not currently overdue; returned-late uses strict comparison. | TEST-F06-05 |
| AC-F06-06 | Existing active/returned Loans backfill without historical changes. | TEST-F06-06 |
| AC-F06-07 | Zero-row, partial, repeated and failed backfills are safe. | TEST-F06-07 |
| AC-F06-08 | Own Borrower and department Custodian reads succeed; collections exclude unauthorized/returned rows; foreign/missing/returned Borrower details are concealed as 404; anonymous/inactive and wrong-role access are 401/403. | TEST-F06-08 |
| AC-F06-09 | Existing active-loan views show due and active/overdue states; returnedLate remains derived data for F-09 without adding history. | TEST-F06-09 |
| AC-F06-10 | F-01–F-05 regression remains passing. | TEST-F06-10 |

| Test ID | Level | Inputs | Expected outcome |
|---|---|---|---|
| TEST-F06-01 | API/PostgreSQL | Fixed checkout instant | dueAt exactly +168 hours in DB and response. |
| TEST-F06-02 | API/security | Forged duration/due/renewal payload | 400 `INVALID_INPUT`; request and Loan rows unchanged. Valid `{}` checkout derives the server value (TEST-F06-01). |
| TEST-F06-03 | PostgreSQL/UI | `2026-11-24T03:00:00Z` | Exact UTC persistence and Bangkok rendering. |
| TEST-F06-04 | Unit/PostgreSQL | Before/equal/1ms after dueAt | Only after is overdue. |
| TEST-F06-05 | Integration | On-time/late returned Loans | Neither currently overdue; only late has returnedLate. |
| TEST-F06-06 | Migration/PostgreSQL | Active and returned historical Loans | Missing dueAt populated; all original fields unchanged. |
| TEST-F06-07 | Migration/PostgreSQL | Empty, partial, repeat, injected failure | Correct no-op/resume/rollback behavior. |
| TEST-F06-08 | API/PostgreSQL | Execute the read-access matrix above with two Borrowers’ active/returned Loans, unknown UUID, Custodian and anonymous/invalid/inactive sessions | Exact matrix statuses/envelopes; authorized 200 projections include correct dueAt/overdue; own collection excludes foreign rows/counts and returned Loans; detail 404s disclose nothing; denied calls expose no protected data or writes. |
| TEST-F06-09 | UI/API | Active/boundary/overdue/empty views and returned Loan projection | Active views have correct labels, format and recovery states; returnedLate is available for F-09 without a Sprint 2 history screen. |
| TEST-F06-10 | Regression | F-01–F-05 suites | Existing behavior passes. |

## Definition of Done

Q-03 formally confirmed; migration/backfill and versioned contract/STS reviewed; checkout/return and existing active-loan views implemented without a completed-history screen; PostgreSQL migration, boundary, authorization and rollback tests pass; UI/API/database integration, regression, typecheck, build and CI pass; teammate review, sprint-staging integration and release smoke/persistence evidence are recorded. No implementation or execution evidence is claimed now.
