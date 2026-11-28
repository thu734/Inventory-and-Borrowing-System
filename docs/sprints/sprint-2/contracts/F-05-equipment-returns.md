# F-05 — Equipment Returns

- Contract version: 0.2
- STS version: 0.2
- Revision date: 2026-11-24
- Author: Thu Thu Wai - 3486
- Reviewer: MoeD3482; approved baseline `b54f722` in [PR #73](https://github.com/thu734/Inventory-and-Borrowing-System/pull/73), 26 November 2026 (Asia/Bangkok)
Approval status: baseline contract/STS approved in PR #73; not implemented; tests not executed. Current clarifications are the selected implementation baseline, subject to normal PR review.

## Traceability and layer impact

Requirements: FR-07; BR-02, BR-06, BR-07, BR-09, BR-10; NFR-01, NFR-03, NFR-06, NFR-08, NFR-09. Dependencies: F-01, F-02, F-04, SYS-01. F-06 consumes the Loan lifecycle; F-09 later exposes completed history.

| Layer | Classification | Reason |
|---|---|---|
| UI | Required change | Custodian return confirmation/action, active-Loan and catalog refresh, and loading/success/conflict/failure states. |
| API | Required change | Add `POST /api/v1/custodian/loans/:loanId/return` using existing auth, Origin and CSRF middleware. |
| Data | No schema change required | Reuse `Loan.returnedAt` and `Loan.returnedById`; preserve relationships and prohibit deletion. |

## SDS, workflow and API

An active CUSTODIAN submits `{}` for an active Loan. The server derives `returnedById` from the session and `returnedAt` from the server clock. Within one PostgreSQL transaction, read the Loan only to identify its Asset, lock the Asset first using F-04’s ordering, then re-read the Loan and update only when `returnedAt IS NULL`. A second return is `409 LOAN_ALREADY_RETURNED`; missing/inaccessible Loan is `404 NOT_FOUND`; malformed ID/body is `400 INVALID_INPUT`; anonymous is 401; wrong role is 403; database failure is sanitized 500/503. The transaction commits exactly one return or rolls back all writes.

State is `active (returnedAt NULL) -> returned (returnedAt, returnedById set)`. Return does not change serviceability. Availability is derived from SERVICEABLE plus no active Loan. Competing PENDING requests remain unchanged. Concurrent return/checkout is serialized by Asset-first locking and the active-Loan constraint; no duplicate active Loan or partial request transition is allowed. Return-before-checkout is rejected with `409 INVALID_LOAN_STATE`.

Success is `200 {data: LoanProjection}`. `LoanProjection` reuses the [F-04 ActiveLoanDTO and AssetDTO](../../sprint-1/contracts/F-04-custodian-checkout.md#api-specification) and adds return fields:

```text
{
  id: string,                 // Loan UUID
  borrowRequestId: string,    // BorrowRequest UUID
  borrower: { id: string, displayName: string },
  asset: { id: string, assetCode: string, modelName: string, category: string,
           serviceability: "SERVICEABLE" | "MAINTENANCE" | "RETIRED",
           available: boolean },
  checkedOutAt: string,       // UTC ISO 8601
  returnedAt: string,         // non-null server UTC ISO 8601
  returnedBy: { id: string, displayName: string } // session Custodian
}
```

All identity `id` fields are UUIDs. The projection is built from the successful return transaction; `asset.available` is derived after its Loan becomes returned. It contains no credentials/session fields. F-06 defines due-data additions to checkout/active-Loan projections; this return response does not add completed-history retrieval.

Client borrower, Asset, receiver and timestamp fields are not accepted. The Custodian UI shows Return only for active Loans, confirms borrower/model/code/checkout time, disables while pending, shows success only after 200, then refetches active Loans and catalog availability. Uncertain or failed outcomes retain last confirmed state and provide recovery. Labels, keyboard operation, visible focus and accessible status/error text are required. Borrowers see returned Loans removed from active retrieval; no history screen is added.

## Acceptance criteria and STS

| AC | Observable result | STS |
|---|---|---|
| AC-F05-01 | Authorized Custodian returns one active Loan and receives 200 with persisted server fields. | TEST-F05-01, TEST-F05-02 |
| AC-F05-02 | Anonymous, Borrower, inactive or wrong-origin/CSRF caller receives 401/403 and no write. | TEST-F05-03 |
| AC-F05-03 | Repeated or simultaneous returns produce exactly one successful transition; losing attempts receive 409 `LOAN_ALREADY_RETURNED` without further mutation. | TEST-F05-04 |
| AC-F05-04 | Serviceability is preserved and derived availability is correct for SERVICEABLE, MAINTENANCE and RETIRED. | TEST-F05-05, TEST-F05-06 |
| AC-F05-05 | Competing PENDING requests remain PENDING; none is auto-selected. | TEST-F05-07 |
| AC-F05-06 | Return/checkout concurrency yields a valid serialized result with at most one active Loan. | TEST-F05-08 |
| AC-F05-07 | Injected failure leaves Loan, Asset and request rows unchanged. | TEST-F05-09 |
| AC-F05-08 | Invalid ID, missing Loan and return-before-checkout are safe 400/404/409 outcomes with no write. | TEST-F05-10 |
| AC-F05-09 | Returned state survives restart and is excluded from active-Loan retrieval. | TEST-F05-11 |
| AC-F05-10 | UI prevents duplicate submission and refreshes committed Loan/catalog state with recovery states. | TEST-F05-12, TEST-F05-13 |
| AC-F05-11 | Sprint 1 regression remains passing. | TEST-F05-14 |

| Test ID | Level | Inputs | Expected outcome |
|---|---|---|---|
| TEST-F05-01 | API/PostgreSQL | Active Loan, authenticated Custodian, `{}` | 200; exactly one persisted return. |
| TEST-F05-02 | PostgreSQL | Before/after Loan and session Custodian | `returnedAt >= checkedOutAt`; `returnedById` equals session user; client values cannot replace either. |
| TEST-F05-03 | API | Anonymous/Borrower/inactive/wrong Origin/CSRF | Exact 401/403; no mutation. |
| TEST-F05-04 | API/PostgreSQL | Sequential repeat and two synchronized independent Custodian return transactions for one active Loan | Exactly one 200; competitor/repeat is 409 `LOAN_ALREADY_RETURNED`. The winner’s returnedAt/returnedBy remain unchanged; no duplicate transition, Loan creation or Asset/serviceability mutation; derived availability is consistent. |
| TEST-F05-05 | PostgreSQL | SERVICEABLE Asset, no other active Loan | Available true; serviceability unchanged. |
| TEST-F05-06 | PostgreSQL | MAINTENANCE or RETIRED Asset with its sole active Loan, then return | Available false after return; serviceability and unrelated rows unchanged. A later checkout is covered by TEST-F05-08. |
| TEST-F05-07 | PostgreSQL | Two PENDING requests | Both remain PENDING. |
| TEST-F05-08 | PostgreSQL | Independent return and checkout transactions | One valid serialized result; no duplicate active Loan or partial request state. |
| TEST-F05-09 | PostgreSQL | Failure before commit | Full transaction rollback. |
| TEST-F05-10 | API/PostgreSQL | Bad UUID, unknown ID, invalid state | Safe 400/404/409; no write. |
| TEST-F05-11 | Integration | Return, restart, retrieve | Returned state persists and is absent from active list. |
| TEST-F05-12 | UI | Active Loan, confirm, double click | One request; disabled pending action; success only after 200. |
| TEST-F05-13 | UI | Loading/empty/409/outage/uncertain | Accessible actionable recovery. |
| TEST-F05-14 | Regression | Accepted F-01–F-04 suites including Lab 7 cancellation | Existing behavior passes. |

## Definition of Done

Versioned contract/STS reviewed; implementation and API/UI/database integration complete; authorization, rollback, timestamp, state, concurrency and PostgreSQL tests pass; Sprint 1 regression, typecheck, build and CI pass; teammate review, sprint-staging integration and release smoke/persistence evidence are recorded. Current status is documentation-ready only; no implementation or execution evidence is claimed.
