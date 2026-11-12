# F-04 — Custodian Queue, Checkout and Active Loans

> **Q-02 Final Decision — 12 November 2026**
>
> Confirmed by Member 2, the F-04 feature owner.
> When a Custodian fulfills one BorrowRequest, competing PENDING
> requests for the same Asset remain PENDING. They are not
> automatically cancelled or fulfilled.
>
> The Asset is unavailable while an active Loan exists.
> Any later checkout must revalidate Asset eligibility.
>
> This is the adopted Sprint 1 implementation policy.
> Its behavior is verified by TEST-F04-07 using PostgreSQL.
> This decision supersedes earlier draft references describing
> Q-02 as awaiting Member 2 confirmation.
>
Status: **implemented and integrated for Sprint 1; acceptance incomplete**. See [integrated verification](../evidence/Sprint-1-integration-verification.md) at `3710af0`; the confirmed Q-02 policy and remaining UI/verification limitations are distinguished below.

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
- Q-02 implemented behavior retains competing requests `PENDING`, without automatic fulfillment, cancellation or expiry. After return, eligibility must be rechecked (S2 regression remains planned). Member 2 confirmed Q-02 on November 12, 2026 in `e78dc65`: competing requests remain PENDING after checkout, the active Loan makes the Asset unavailable, and any later checkout must revalidate eligibility. This supersedes the earlier pending-acknowledgement wording; it does not approve unrelated security/API decisions or full release acceptance.
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
| `GET /api/v1/custodian/borrow-requests` | Authenticated Custodian; optional `status=PENDING\|FULFILLED` only | `200 {data:{items:BorrowRequestDTO[]}}`, ordered by `createdAt` descending then `id` descending; no filter returns all statuses and no matches return `items:[]` |
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

1. Authenticate and authorize the active Custodian before entering the checkout service.
2. Read the selected BorrowRequest to identify its assetId without modifying its state.
3. Lock the associated Asset row using SELECT ... FOR UPDATE.
4. Re-read and lock the BorrowRequest row. Verify that its status is PENDING and its assetId matches the locked Asset.
5. Verify that the Asset is SERVICEABLE and no active Loan exists.
6. Update the BorrowRequest to FULFILLED and record fulfilledAt.
7. Insert exactly one active Loan with borrowRequestId, assetId, borrowerId, checkedOutById and checkedOutAt.
8. Commit if all operations succeed. Otherwise, roll back the entire transaction.

The schema and migrations provide:

- composite Loan-to-request foreign-key consistency for request, Borrower and Asset;
- unique `Loan.borrowRequestId`, preventing a request from producing multiple Loans;
- partial unique `Loan_one_active_per_asset` on `assetId` where `returnedAt IS NULL`;
- request status/`fulfilledAt` consistency;
- restrictive historical foreign keys.

The Asset-first lock ordering is implemented by F-03 request creation and F-04 checkout and must also be preserved by future writers. Different Borrowers may have `PENDING` requests for the same Asset, but only one checkout can succeed while the Asset is active-loaned. Competing requests remain `PENDING` in implementation; Member 2 confirmed this Q-02 policy on November 12, 2026 (`e78dc65`).

Within one PostgreSQL transaction, checkout must:

1. Authenticate the active Custodian and enforce server-side authorization before entering the checkout service.
2. Read the selected BorrowRequest to identify its associated physical assetId.
3. Lock the associated Asset row with SELECT ... FOR UPDATE. Asset locking must happen before request-state mutation.
4. Re-read and lock the BorrowRequest row, verifying that it still belongs to the selected Asset and has status PENDING.
5. Verify that the Asset is SERVICEABLE and that no active Loan exists with returnedAt IS NULL.
6. Update the selected BorrowRequest to FULFILLED and record fulfilledAt.
7. Insert exactly one active Loan with borrowRequestId, assetId, borrowerId, checkedOutById and checkedOutAt.
8. Commit only if every validation and database operation succeeds. Otherwise, roll back the entire transaction.

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

### Detailed Software Test Specification (STS)

The following cases specify F-04 verification; executed results and remaining coverage limits are distinguished below. Integration tests use an isolated PostgreSQL database with synthetic Borrowers, Custodians, Assets, BorrowRequests and Loans.

| Test ID / AC | Test Level | Preconditions | Action | Expected Result |
|---|---|---|---|---|
| TEST-F04-01 / AC-F04-01 | API and PostgreSQL integration | Active Custodian session; multiple department requests in PENDING and FULFILLED states | Call GET /api/v1/custodian/borrow-requests with and without status=PENDING, then retrieve one request by ID | Return correct DTOs, deterministic ordering and only matching records when filtered. An empty result returns items=[]. |
| TEST-F04-02 / AC-F04-02 | API security integration | Active Borrower, valid Custodian, missing session and inactive/revoked session | Attempt Custodian GET and POST operations using each session | Only active Custodian is authorized. Unauthenticated requests return 401; Borrower requests return 403. No private checkout data is exposed. |
| TEST-F04-03 / AC-F04-03 | API and PostgreSQL integration | Serviceable Asset with no active Loan; valid PENDING request; active Custodian | POST /api/v1/custodian/borrow-requests/:id/checkout | Return 201 with fulfilled request and active Loan. Persist status=FULFILLED, fulfilledAt and matching borrowerId, assetId, borrowRequestId and checkedOutById. |
| TEST-F04-04 / AC-F04-04 | Unit and PostgreSQL integration | PENDING requests for MAINTENANCE, RETIRED and already-loaned Assets | Attempt checkout for each unavailable Asset | Reject checkout with 409 ASSET_UNAVAILABLE. Request remains PENDING, and no new Loan or partial changes are committed. |
| TEST-F04-05 / AC-F04-05 | API and PostgreSQL integration | Request already FULFILLED with an existing Loan | Attempt checkout of the same request again | Return 409 REQUEST_NOT_PENDING. No duplicate Loan is inserted and existing records remain unchanged. |
| TEST-F04-06 / AC-F04-06 | PostgreSQL concurrency integration | One SERVICEABLE Asset with no active Loan; two different Borrowers have PENDING requests for that Asset | Execute two concurrent Custodian checkout transactions for the same Asset | Exactly one checkout succeeds. The other returns a conflict. Exactly one active Loan exists, and the losing request remains PENDING without partial changes. |
| TEST-F04-07 / AC-F04-07 | PostgreSQL integration | Two different Borrowers have PENDING requests for the same available Asset | Fulfill one request, then retrieve both requests | The fulfilled request becomes FULFILLED and produces one active Loan. The competing request remains PENDING and is not automatically fulfilled or cancelled. This verifies implemented Q-02 behavior; Member 2's separate confirmation is recorded above. |
| TEST-F04-08 / AC-F04-08 | API validation and security integration | Malformed request ID, unknown request ID, invalid query parameters, invalid Origin/CSRF and simulated database failure | Submit invalid API requests and checkout operations | Return safe 400, 403, 404 or 500 responses as appropriate. No SQL, stack traces, session values or sensitive data are disclosed. No failed checkout leaves partial changes. |
| TEST-F04-09 / AC-F04-09 | UI component and end-to-end | Custodian is logged in; seeded PENDING requests; loading, empty and conflict conditions available | Open the Custodian workspace, inspect the queue, perform checkout and test keyboard and narrow-screen navigation | Correct loading, empty, success, conflict and failure states appear. Successful checkout updates the displayed request and Loan. Controls are keyboard-accessible and responsive. |

### Test execution and evidence

[Integrated verification](../evidence/Sprint-1-integration-verification.md) records 5 checkout-rule, 15 API, 11 PostgreSQL and 9 UI tests passing for F-04 at `3710af0`, plus real UI checkout/Loan retrieval and browser API rejection checks. The 40 targeted tests overlap the report's 159-test total; do not add them again. No new run occurred in this editorial audit.

AC-F04-06/NFR-04 remains partial for the synchronized-race criterion: the real PostgreSQL test uses parallel `Promise.all` calls without a barrier-controlled race. AC-F04-09 has component-state and sampled responsive/browser evidence, but full keyboard/accessibility and every browser fault state remain incomplete. Immediate catalog availability remains stale after checkout until Refresh Equipment; persisted/API state is correct. This does not relax FR-02/FR-06 or imply complete release acceptance. Q-02 is confirmed; unrelated security/API approvals and release acceptance are not established by these test results.

All planned tests must be executed against the implemented feature.

The final verification evidence must record:

- Actual test file names and test IDs.
- Commands used to run the tests.
- The tested Git commit ID.
- Passed, failed and skipped test counts.
- PostgreSQL assertions for successful and rejected checkouts.
- Backend authorization evidence for restricted operations.
- Selected UI screenshots and acceptance-test results.
- TDD evidence where meaningful rule tests fail before implementation and pass after correction.

No test is considered passed until it has actually been executed. Failed and skipped tests must be disclosed.

## Product Definition of Done

- F-01 guards and F-02/F-03 interfaces are integrated without client-controlled identity or role bypass.
- Checkout uses Asset-first locking, availability revalidation, atomic request fulfillment and Loan creation.
- Q-01/Q-02 behavior and PostgreSQL active-Loan protection are covered by real database tests.
- Authorization, validation, safe errors, rollback and UI recovery states are verified.
- Unit/API/UI and real-PostgreSQL tests, typecheck, build and whitespace checks pass.
- Only executed evidence is marked complete in the contract and traceability records.
- Teammate review, integration into `sprint1-staging`, reviewed promotion to `main`, and reproducible README/setup instructions are required before completion.
- Record executed test commands, test files, pass/fail/skip counts, tested commit IDs and acceptance evidence. Disclose incomplete work and known limitations.

## Revision history

| Revision | Change |
|---|---|
| 1.0 | Initial Sprint 1 engineering contract. |
| 1.1 | Clarified proposed Q-02 policy, expanded STS, refined checkout transaction sequence and strengthened Definition of Done. |
