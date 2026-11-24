# F-06 — Due Dates and Overdue

- Contract version: 0.2
- STS version: 0.2
- Revision date: 2026-11-24
- Author: Thu Thu Wai - 3486
- Reviewer: pending teammate review
Approval status: draft; selected Q-03 proposal pending formal teammate confirmation; not implemented or verified

## Traceability and layer impact

Requirements: FR-08; BR-06, BR-08; NFR-01, NFR-03, NFR-06, NFR-08, NFR-09. Dependencies: F-04 checkout, F-05 returns, SYS-01 migration, F-09 history and F-10 reporting. F-06 supplies data; it does not add the Sprint 3 history workflow.

| Layer | Classification | Reason |
|---|---|---|
| UI | Required change | Existing authorized loan views show checkout, due, active/overdue/returned-late states and accessible loading/error states. No history screen. |
| API | Required modification | F-04 checkout and active-loan projections add server `dueAt` and derived status; no client due-date route. |
| Data | Required change | Add `Loan.dueAt`; migrate/backfill safely before relying on non-null values. |

## Selected Q-03 proposal and SDS

Fixed `7 × 24` hours from successful checkout. Server persists `dueAt = checkedOutAt + 7 days`; clients cannot select, renew or override duration. Store UTC instants and display Asia/Bangkok. Active overdue is strictly `serverNow > dueAt`; equality is not overdue. Returned Loans are not currently overdue; `returnedLate = returnedAt > dueAt` is historical derived data. This remains proposed pending formal confirmation.

Migration: add nullable `dueAt`; backfill only rows where it is null from original `checkedOutAt`; verify zero missing values and unchanged owner, Asset, request, checkout, return and Custodian fields; then apply any final non-null constraint. Empty DB succeeds, partial runs resume missing rows, repeats are no-ops, and failure rolls back the current transaction/batch. A backfilled date is policy-derived and does not prove a historical policy violation.

Checkout response and authorized Borrower/Custodian active-loan projections include UTC ISO `checkedOutAt` and `dueAt`, plus derived `overdue`; returned history data may include `returnedLate` for F-09. Unknown duration/due/renewal fields are rejected or ignored only as defined by the existing strict body contract; no client value is authoritative. 401/403/404 and safe 500/503 conventions remain unchanged.

Example: `2026-11-24T03:00:00Z` gives `2026-12-01T03:00:00Z`, displayed Bangkok as `2026-12-01 10:00`; exactly due is not overdue, one millisecond after is overdue.

## Acceptance criteria and STS

| AC | Observable result | STS |
|---|---|---|
| AC-F06-01 | Checkout persists server dueAt exactly 168 hours after checkedOutAt. | TEST-F06-01 |
| AC-F06-02 | Client duration/due/renewal values cannot override the server value. | TEST-F06-02 |
| AC-F06-03 | UTC storage and Bangkok display represent one instant. | TEST-F06-03 |
| AC-F06-04 | Only active Loans after the strict boundary are overdue. | TEST-F06-04 |
| AC-F06-05 | Returned Loans are not currently overdue; returned-late uses strict comparison. | TEST-F06-05 |
| AC-F06-06 | Existing active/returned Loans backfill without historical changes. | TEST-F06-06 |
| AC-F06-07 | Zero-row, partial, repeated and failed backfills are safe. | TEST-F06-07 |
| AC-F06-08 | Only authorized existing loan views expose due data. | TEST-F06-08 |
| AC-F06-09 | Existing views show active/overdue/returned-late states without adding history. | TEST-F06-09 |
| AC-F06-10 | F-01–F-05 regression remains passing. | TEST-F06-10 |

| Test ID | Level | Inputs | Expected outcome |
|---|---|---|---|
| TEST-F06-01 | API/PostgreSQL | Fixed checkout instant | dueAt exactly +168 hours in DB and response. |
| TEST-F06-02 | API/security | Forged duration/due/renewal payload | Safe rejection/ignore; server value persists. |
| TEST-F06-03 | PostgreSQL/UI | `2026-11-24T03:00:00Z` | Exact UTC persistence and Bangkok rendering. |
| TEST-F06-04 | Unit/PostgreSQL | Before/equal/1ms after dueAt | Only after is overdue. |
| TEST-F06-05 | Integration | On-time/late returned Loans | Neither currently overdue; only late has returnedLate. |
| TEST-F06-06 | Migration/PostgreSQL | Active and returned historical Loans | Missing dueAt populated; all original fields unchanged. |
| TEST-F06-07 | Migration/PostgreSQL | Empty, partial, repeat, injected failure | Correct no-op/resume/rollback behavior. |
| TEST-F06-08 | API | Anonymous, Borrower own/foreign, Custodian | 401/404/403 scope holds. |
| TEST-F06-09 | UI | Active/boundary/overdue/returned-late/empty | Correct labels, format and recovery states. |
| TEST-F06-10 | Regression | F-01–F-05 suites | Existing behavior passes. |

## Definition of Done

Q-03 formally confirmed; migration/backfill and versioned contract/STS reviewed; checkout/return/views implemented; PostgreSQL migration, boundary, authorization and rollback tests pass; UI/API/database integration, regression, typecheck, build and CI pass; teammate review, sprint-staging integration and release smoke/persistence evidence are recorded. No implementation or execution evidence is claimed now.
