# F-07 — Inventory Administration

- Contract version: 0.2
- STS version: 0.2
- Revision date: 2026-11-24
- Author: Thu Thu Wai - 3486
- Reviewer: pending teammate review
Approval status: draft; selected Q-04 proposal pending formal teammate confirmation; not implemented or verified

## Traceability and layer impact

Requirements: FR-09; BR-01, BR-02, BR-06, BR-09; NFR-01, NFR-06, NFR-08, NFR-09. Dependencies: F-01, F-02, F-04, F-05 and SYS-01. No delete endpoints, bulk editing, scanning, uploads or reporting.

| Layer | Classification | Reason |
|---|---|---|
| UI | Required change | Add Inventory to the existing Custodian workspace with distinct model/Asset forms, validation, confirmation, refresh and recovery states. |
| API | Required change | Add model/Asset list/create/update routes; use existing auth, Origin and CSRF middleware; expose no delete routes. |
| Data | Required change | Reuse EquipmentModel/Asset and foreign keys; add only compatible constraints/indexes after existing records are inspected; no destructive migration. |

## Selected Q-04 proposal and contract

EquipmentModel describes a type; Asset identifies one physical unit. Codes are nonblank, unique and stable; preserve existing codes and historical records. The smallest compatible normalization is trim surrounding whitespace on new input only; do not rewrite existing identifiers or perform an unsafe case-changing migration. An Asset cannot be reassigned to another EquipmentModel after any BorrowRequest or Loan history. Only CUSTODIANs mutate inventory. Serviceability is SERVICEABLE/MAINTENANCE/RETIRED; retirement during an active Loan is rejected. Availability remains derived. These are selected proposals pending formal confirmation.

Routes: `GET/POST /api/v1/equipment-models`, `PATCH /api/v1/equipment-models/:id`, `GET/POST /api/v1/assets`, `PATCH /api/v1/assets/:id`. Model bodies use `{name, category, description?}`; Asset bodies use `{equipmentModelId, assetCode, serviceability?}`. PATCH accepts only supplied fields. Names/categories/descriptions/codes are nonblank bounded strings; invalid UUID/enum/body is `400 INVALID_INPUT`; duplicate model/code is `409 DUPLICATE_EQUIPMENT_MODEL`/`DUPLICATE_ASSET_CODE`; historical model reassignment is `409 ASSET_MODEL_IMMUTABLE`; active-loan retirement is `409 ACTIVE_LOAN_RESTRICTION`; missing records are 404; DB failure is safe 500/503. Anonymous is 401 and Borrower is 403. Success returns committed server projection including derived availability. No client availability is accepted.

Models may be edited while Assets exist without breaking references. No model/Asset deletion or bulk operation is exposed. Asset serviceability changes never edit Loans; failed mutations leave all rows unchanged. Concurrent duplicate creation yields one success and one conflict. UI provides labeled keyboard-accessible forms, visible focus, inline validation, loading/empty/success/conflict/failure/retry states, and refreshes Inventory/catalog only after server confirmation.

## Acceptance criteria and STS

| AC | Observable result | STS |
|---|---|---|
| AC-F07-01 | Lists distinguish EquipmentModel and physical Asset identity. | TEST-F07-01 |
| AC-F07-02 | Valid model create/update persists and preserves Asset references. | TEST-F07-02 |
| AC-F07-03 | Valid Asset create/update persists model, code and serviceability. | TEST-F07-03 |
| AC-F07-04 | Invalid/blank/oversized fields return 400 with no write. | TEST-F07-04 |
| AC-F07-05 | New codes trim whitespace, remain unique/stable, and existing codes are not rewritten. | TEST-F07-05, TEST-F07-06 |
| AC-F07-06 | Anonymous/Borrower/wrong Origin/CSRF mutation is denied. | TEST-F07-07 |
| AC-F07-07 | Serviceability changes derive availability without changing Loans. | TEST-F07-08 |
| AC-F07-08 | Historical reassignment and active-loan retirement are rejected unchanged. | TEST-F07-09 |
| AC-F07-09 | References are preserved and no delete operation is available. | TEST-F07-10 |
| AC-F07-10 | Concurrent duplicate creation is one success plus one conflict. | TEST-F07-11 |
| AC-F07-11 | Injected failure rolls back all mutation. | TEST-F07-12 |
| AC-F07-12 | UI validation/loading/empty/success/conflict/failure/refresh states work. | TEST-F07-13, TEST-F07-14 |
| AC-F07-13 | Catalog reflects committed inventory changes. | TEST-F07-15 |
| AC-F07-14 | F-01–F-05 regression remains passing. | TEST-F07-16 |

| Test ID | Level | Inputs | Expected outcome |
|---|---|---|---|
| TEST-F07-01 | API/UI | Two models and multiple Assets | Distinct complete identity. |
| TEST-F07-02 | API/PostgreSQL | Model create/description update with Assets | 201/200; values persist; references unchanged. |
| TEST-F07-03 | API/PostgreSQL | Asset create/update | 201/200; projection has derived availability. |
| TEST-F07-04 | API | Blank/oversized/malformed/invalid enum | 400; no write. |
| TEST-F07-05 | API/PostgreSQL | Whitespace code and existing code | New value trims; existing identifiers unchanged. |
| TEST-F07-06 | PostgreSQL | Duplicate code/model concurrent requests | One row/success; one 409. |
| TEST-F07-07 | API/security | Anonymous/Borrower/wrong Origin/CSRF | 401/403; no write. |
| TEST-F07-08 | PostgreSQL | All serviceability transitions without active Loan | Availability correct; Loans unchanged. |
| TEST-F07-09 | PostgreSQL | Historical reassignment and active-loan retirement | Exact 409; records unchanged. |
| TEST-F07-10 | API/PostgreSQL | Referenced records and attempted deletion | References preserved; no delete route. |
| TEST-F07-11 | PostgreSQL | Independent duplicate creates | Exactly one success and one conflict. |
| TEST-F07-12 | PostgreSQL | Failure before commit | No partial mutation. |
| TEST-F07-13 | UI | Valid/invalid forms | Labels, inline errors, disabled pending submit, keyboard operation. |
| TEST-F07-14 | UI | Loading/empty/success/conflict/failure | Accessible recovery and refresh. |
| TEST-F07-15 | Integration | Mutation then catalog read | Committed state visible. |
| TEST-F07-16 | Regression | F-01–F-05 suites | Existing behavior passes. |

## Definition of Done

Q-04 inventory decisions formally confirmed; versioned contract/STS reviewed; API/UI/persistence integration implemented; authorization, validation, references, serviceability, retirement, concurrency and rollback PostgreSQL tests pass; regression, typecheck, build and CI pass; teammate review, sprint-staging integration and release smoke/persistence evidence are recorded. No implementation or execution evidence is claimed now.
