# F-02 — Equipment Catalog and Availability

Status: **Sprint 1 engineering contract; planned implementation**

## Traceability and scope

Requirements: FR-02, BR-01, BR-02; NFR-01, NFR-05, NFR-06, NFR-08, NFR-09.

Dependencies: SYS-01 `EquipmentModel`/`Asset` schema and synthetic seed data; F-01 authentication, sessions and server-side role guards. F-03 consumes the selected physical `assetId` supplied by this feature. Search and catalog editing belong to F-08 and F-07.

F-02 provides authenticated Borrower and Custodian list/detail views for physical Assets, their equipment model, serviceability and computed borrowing availability. It does not create requests, reserve Assets, create Loans, edit inventory or provide search refinements.

## Project design decisions

- An `EquipmentModel` describes a type; an `Asset` identifies one physical unit by unique `assetCode`.
- Availability is computed as `serviceability = SERVICEABLE` and no active `Loan` exists (`returnedAt IS NULL`).
- A `PENDING` `BorrowRequest` does not reserve an Asset.
- F-02 passes the selected physical `assetId` to F-03. Display metadata is informational; the server revalidates availability when a request is submitted.
- Q-01 rejects duplicate `PENDING` requests for the same Borrower/Asset pair, including concurrent submissions. F-03 owns enforcement of that request rule.
- Q-02 keeps competing requests `PENDING` after one request is fulfilled. F-04 owns checkout and request-state transitions.
- Authentication, role and ownership decisions are enforced server-side.

## UI specification

### Catalog list

The authenticated catalog displays each physical Asset with:

- model name and category;
- unique asset code;
- serviceability;
- computed availability;
- an accessible action to open the Asset detail.

The list has explicit loading, empty and failed-request states. It must not display an Asset as available when serviceability is not `SERVICEABLE` or an active Loan exists.

### Asset detail and F-03 handoff

The detail view shows the same authoritative fields and exposes a request action only to an authenticated Borrower when the current response reports the Asset as available. The action passes `assetId` to the F-03 selected-Asset request flow. It may include `assetCode` and model name for display, but those values cannot authorize a request.

Custodians may view the catalog but do not receive a Borrower request action. Controls require labels, visible keyboard focus and responsive layouts without horizontal overflow.

## API specification

The feature uses the `/api/v1` JSON convention and the shared F-01 authentication and error handling contract:

| Method/path | Required access | Required result |
|---|---|---|
| `GET /api/v1/assets` | Authenticated Borrower or Custodian; no query parameters | `200 {data:{items:AssetDTO[]}}`, ordered by `assetCode` ascending; an empty catalog returns `items:[]` |
| `GET /api/v1/assets/:id` | Authenticated Borrower or Custodian | `200 {data:AssetDTO}`; an unknown ID returns `404 NOT_FOUND` |

For Sprint 1's small synthetic dataset, the list is not paginated and has no total-count field. The response projection must not expose passwords, session values or unrelated User fields. Unknown query parameters, malformed identifiers and unsupported bodies return safe 4xx responses. Database failures return a safe server error without SQL, stack traces or secrets.

Availability must be derived from current database state. F-02 must not accept client-supplied availability, borrower identity or role as authoritative. The F-03 handoff must carry the physical UUID `assetId`, not only an asset code or model identifier.

`AssetDTO` is:

```text
{
  id: string,              // UUID
  assetCode: string,
  modelName: string,
  category: string,
  serviceability: "SERVICEABLE" | "MAINTENANCE" | "RETIRED",
  available: boolean
}
```

`available` is true exactly when `serviceability` is `SERVICEABLE` and no `Loan` for the Asset has `returnedAt IS NULL`. Times are not returned by F-02.

## Data specification

F-02 reads `EquipmentModel` and `Asset` and derives active-loan state from `Loan.returnedAt IS NULL`. It does not mutate an Asset or create a request. The schema constraints remain authoritative:

- `Asset.assetCode` is unique and nonblank.
- `Asset.equipmentModelId` references `EquipmentModel`.
- PostgreSQL `Loan_one_active_per_asset` permits at most one active Loan per Asset.
- Referenced equipment is retained for request and loan history.

The catalog response is a read projection. F-03 repeats the availability check in its transaction, so a stale catalog response cannot create an invalid request.

## Acceptance criteria and Software Test Specification

| AC ID | Observable outcome | Test ID and expected outcome |
|---|---|---|
| AC-F02-01 | An authenticated Borrower or Custodian retrieves `AssetDTO` values with the specified fields and types; list order is ascending `assetCode`. | TEST-F02-01: API/real PostgreSQL projection and deterministic ordering match persisted fixtures. |
| AC-F02-02 | `available` is true only for SERVICEABLE Assets without an active Loan; maintenance, retired and actively loaned Assets are unavailable. | TEST-F02-02: State matrix returns the expected boolean and serviceability for each fixture. |
| AC-F02-03 | Unauthenticated access is rejected and protected responses do not disclose private fields. | TEST-F02-03: API authentication and response-schema checks pass. |
| AC-F02-04 | A selected physical Asset supplies its `assetId` to the F-03 request seam; display metadata cannot substitute for identity. | TEST-F02-04: UI interaction sends the selected UUID in the request payload. |
| AC-F02-05 | Unknown IDs, unsupported query parameters and database failure produce safe errors without false success; empty lists return `items:[]`. | TEST-F02-05: API validation, empty-list and failure checks return the specified shape and no unintended mutation. |
| AC-F02-06 | Loading, empty, failed, keyboard and responsive states are usable without horizontal overflow. | TEST-F02-06: UI state, keyboard and responsive checks pass. |

Tests use isolated disposable PostgreSQL databases for persistence fixtures. No test writes to shared or production data.

## Product Definition of Done

- Requirements and project design decisions are reflected in implementation and tests.
- API and UI behavior is integrated with F-01 and the F-03 selected-Asset seam.
- Availability is computed from persisted serviceability and active Loan state.
- Role guards, validation, safe errors and response projections are verified.
- Unit/API/UI and real-PostgreSQL tests, typecheck, build and whitespace checks pass.
- Only executed evidence is marked complete in the contract and traceability records.

## Revision history

| Revision | Change |
|---|---|
| 1.0 | Initial Sprint 1 engineering contract; records project-approved Q-01/Q-02 decisions. |
