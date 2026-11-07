# F-04 — Custodian Queue, Checkout and Active Loans

Status: **Sprint 1 engineering contract; planned implementation**

## Traceability and scope

Requirements: FR-04 (Loan creation consumed by F-03), FR-05, FR-06; BR-02, BR-03, BR-04, BR-05, BR-06, BR-10; NFR-01, NFR-03, NFR-04, NFR-05, NFR-06, NFR-08, NFR-09.

Dependencies: SYS-01 `User`, `Asset`, `BorrowRequest` and `Loan` schema; F-01 authentication and Custodian role guard; F-02 Asset identity and availability; F-03 request creation. F-05 later consumes active Loans for returns.

F-04 lets a Custodian inspect department requests and active Loans and check out an eligible `PENDING` request. It does not implement returns, due dates, inventory administration, search, history or reporting.

## Project design decisions

- Only an authenticated active `CUSTODIAN` may inspect department checkout records or perform checkout. Backend authorization is authoritative.
- The selected `BorrowRequest` supplies the Borrower and physical Asset; clients cannot override either identity.
- Availability is `SERVICEABLE` plus no active Loan (`returnedAt IS NULL`).
- Checkout uses one database transaction and locks the Asset first with `FOR UPDATE`, then revalidates the request and Asset state.
- The transaction atomically changes the selected request from `PENDING` to `FULFILLED`, records `fulfilledAt` and creates exactly one active `Loan`.
- PostgreSQL `Loan_one_active_per_asset` enforces at most one active Loan per Asset. A conflict commits no partial checkout state.
- Q-02 is project-approved: competing requests remain `PENDING` after one request is fulfilled. They are not automatically fulfilled, cancelled or expired. After return, eligibility is rechecked; no automatic checkout occurs.
- Q-01 is enforced by F-03 when requests are created: duplicate `PENDING` requests for the same Borrower/Asset pair, including concurrent duplicates, are rejected. F-04 does not add a different duplicate policy.

## UI specification

### Custodian queue

The Custodian workspace lists department `PENDING` requests and active Loans with:

- request status and creation time;
- Borrower display identity needed for checkout;
- Asset code, model/category and serviceability;
- current availability or conflict state;
- an explicit checkout action for eligible `PENDING` requests.

The workspace provides loading, empty, validation/conflict, success and failed-request states. A successful checkout identifies the selected request and resulting active Loan. An uncertain or failed mutation must not be presented as successful or automatically retried.

Borrowers must not see Custodian queue or checkout controls. UI hiding is supplementary; server authorization remains mandatory. Controls require labels, visible keyboard focus and responsive layouts without horizontal overflow.

## API specification

All routes use `/api/v1`, JSON and the shared F-01 session, Origin/CSRF and safe-error conventions:

| Method/path | Required access | Required result |
|---|---|---|
| `GET /api/v1/custodian/borrow-requests` | Authenticated Custodian; optional `status=PENDING|FULFILLED` only | `200 {data:{items:BorrowRequestDTO[]}}`, ordered by `createdAt` descending then `id` descending; no filter returns all statuses and no matches return `items:[]` |
| `GET /api/v1/custodian/borrow-requests/:id` | Authenticated Custodian | `200 {data:BorrowRequestDTO}` for any status; missing ID returns `404 NOT_FOUND` |
| `GET /api/v1/custodian/loans` | Authenticated Custodian; no query parameters | `200 {data:{items:ActiveLoanDTO[]}}`, ordered by `checkedOutAt` descending then `id` descending; no active loans return `items:[]` |
| `POST /api/v1/custodian/borrow-requests/:id/checkout` | Authenticated Custodian with valid Origin/CSRF | `201 {data:{request:BorrowRequestDTO,loan:ActiveLoanDTO}}`; the selected request is `FULFILLED` and the Loan is active |

`BorrowRequestDTO` is:

```text
{
  id: string,              // UUID
  borrower: { id: string, displayName: string },
  status: "PENDING" | "FULFILLED",
  createdAt: string,      // UTC ISO 8601
  fulfilledAt: string | null,
  asset: AssetDTO
}
```

`ActiveLoanDTO` is:

```text
{
  id: string,              // UUID
  borrowRequestId: string,
  borrower: { id: string, displayName: string },
  asset: AssetDTO,
  checkedOutAt: string     // UTC ISO 8601
}
```

Within F-04, `AssetDTO` contains `id`, `assetCode`, `modelName`, `category`, `serviceability` and `available`; `available` is computed as specified by F-02. F-04 list and detail responses include all required department identity fields, but never password/session values.

The request list rejects unknown query parameters and invalid `status` values with `400 INVALID_INPUT`. Checkout failures use the shared safe error envelope: `401 UNAUTHENTICATED`, `403 FORBIDDEN`/`ORIGIN_FORBIDDEN`/`CSRF_FORBIDDEN`, `400 INVALID_INPUT`, `404 NOT_FOUND`, `409 ASSET_UNAVAILABLE` or `REQUEST_NOT_PENDING`, and `500 INTERNAL_ERROR`. Empty lists use `items:[]`. No failure exposes SQL, stack traces, credentials or unrelated private data. A Borrower or client-supplied borrower/asset field never authorizes checkout.

## Transaction and data specification

Within one PostgreSQL transaction, checkout must:

1. Authenticate the Custodian before entering the service.
2. Lock the selected Asset row first with `SELECT ... FOR UPDATE`.
3. Re-read the request and verify it is `PENDING`.
4. Verify the request's Asset is the locked Asset and its Borrower/Asset relationship is intact.
5. Recheck `serviceability = SERVICEABLE` and absence of an active Loan.
6. Update the request to `FULFILLED` with `fulfilledAt`.
7. Insert one `Loan` with `borrowRequestId`, `assetId`, `borrowerId`, `checkedOutById` and `checkedOutAt`.
8. Commit only if every step succeeds.

The schema and migrations provide:

- composite Loan-to-request foreign-key consistency for request, Borrower and Asset;
- unique `Loan.borrowRequestId`, preventing a request from producing multiple Loans;
- partial unique `Loan_one_active_per_asset` on `assetId` where `returnedAt IS NULL`;
- request status/`fulfilledAt` consistency;
- restrictive historical foreign keys.

The Asset-first lock ordering is the shared convention for F-03 request creation and future checkout mutations. Different Borrowers may have `PENDING` requests for the same Asset, but only one checkout can succeed while the Asset is active-loaned. Competing requests remain `PENDING` under Q-02.

## Acceptance criteria and Software Test Specification

| AC ID | Observable outcome | Test ID and expected outcome |
|---|---|---|
| AC-F04-01 | A valid active Custodian lists and retrieves department requests of any status; the optional `status=PENDING` filter returns only the checkout queue, with deterministic order and `items:[]` when empty. | TEST-F04-01: Real API/PostgreSQL role, DTO, ordering, all-status and filter checks pass. |
| AC-F04-02 | Borrower, unauthenticated and inactive/revoked sessions cannot access Custodian operations. | TEST-F04-02: Authorization matrix returns the contract status and no private data. |
| AC-F04-03 | A valid eligible `PENDING` request returns `201` with the specified fulfilled `BorrowRequestDTO` and matching active `ActiveLoanDTO`. | TEST-F04-03: PostgreSQL checkout assertions match response DTOs, request, Borrower and Asset. |
| AC-F04-04 | Checkout rejects maintenance, retired or already-loaned Assets without partial request/Loan changes. | TEST-F04-04: State matrix and rollback assertions pass. |
| AC-F04-05 | Repeated checkout of a fulfilled request is rejected and creates no second Loan. | TEST-F04-05: Repeat mutation leaves persisted state unchanged. |
| AC-F04-06 | Concurrent checkout attempts for one Asset result in at most one active Loan; the loser has no partial state. | TEST-F04-06: Synchronized PostgreSQL concurrency check passes. |
| AC-F04-07 | After one request is fulfilled, another Borrower's competing request remains `PENDING` and is not automatically fulfilled or cancelled. | TEST-F04-07: Q-02 integration state check passes. |
| AC-F04-08 | Invalid IDs, missing input, Origin/CSRF failures and database errors return safe responses. | TEST-F04-08: Validation, security and failure checks pass without leakage. |
| AC-F04-09 | Queue and checkout UI has loading, empty, conflict, success and failure states and is keyboard/responsive accessible. | TEST-F04-09: UI state, keyboard and responsive checks pass. |

Tests use isolated disposable PostgreSQL databases and assert persisted request, Loan and Asset state after success and failure. No shared or production database may be used.

## Product Definition of Done

- F-01 guards and F-02/F-03 interfaces are integrated without client-controlled identity or role bypass.
- Checkout uses Asset-first locking, availability revalidation, atomic request fulfillment and Loan creation.
- Q-01/Q-02 behavior and PostgreSQL active-Loan protection are covered by real database tests.
- Authorization, validation, safe errors, rollback and UI recovery states are verified.
- Unit/API/UI and real-PostgreSQL tests, typecheck, build and whitespace checks pass.
- Only executed evidence is marked complete in the contract and traceability records.

## Revision history

| Revision | Change |
|---|---|
| 1.0 | Initial Sprint 1 engineering contract; records project-approved Q-01/Q-02 decisions. |
