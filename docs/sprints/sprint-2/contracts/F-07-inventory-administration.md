# F-07 — Inventory Administration

- Contract version: 0.2
- STS version: 0.2
- Revision date: 2026-11-24
- Author: Thu Thu Wai - 3486
- Reviewer: MoeD3482; approved baseline `b54f722` in [PR #73](https://github.com/thu734/Inventory-and-Borrowing-System/pull/73), 26 November 2026 (Asia/Bangkok)
Approval status: baseline contract/STS approved in PR #73; not implemented; tests not executed. Additional input, response and serialization details below are selected on 28 November 2026 for normal PR review, not attributed to PR #73.

## Traceability and layer impact

Requirements: FR-09; BR-01, BR-02, BR-06, BR-09; NFR-01, NFR-06, NFR-08, NFR-09. Dependencies: F-01, F-02, F-04, F-05 and SYS-01. No delete endpoints, bulk editing, scanning, uploads or reporting.

| Layer | Classification | Reason |
|---|---|---|
| UI | Required change | Add Inventory to the existing Custodian workspace with distinct model/Asset forms, validation, confirmation, refresh and recovery states. |
| API | Required change | Add model/Asset list/create/update routes; use existing auth, Origin and CSRF middleware; expose no delete routes. |
| Data | Required change | Reuse EquipmentModel/Asset and foreign keys; add only compatible constraints/indexes after existing records are inspected; no destructive migration. |

## Reviewed Q-04 policy and contract

EquipmentModel describes a type; Asset identifies one physical unit. Asset codes are nonblank and unique. Trim surrounding whitespace when creating a new code, but never rewrite existing codes or perform an unsafe case-changing migration. The code is immutable after creation and is never reused, preserving historical references. `PATCH /api/v1/assets/:id` must not accept or modify `assetCode`. An Asset cannot be reassigned to another EquipmentModel after any BorrowRequest or Loan history. Only CUSTODIANs mutate inventory. Serviceability is SERVICEABLE/MAINTENANCE/RETIRED; retirement during an active Loan is rejected. Availability remains derived. These policies were confirmed in PR #73.

Routes: `GET/POST /api/v1/equipment-models`, `PATCH /api/v1/equipment-models/:id`, `GET/POST /api/v1/assets`, `PATCH /api/v1/assets/:id`. Model POST requires `name` and `category`, with optional `description` (omitted means null). Model PATCH is a strict partial object accepting only `name`, `category` and `description`; at least one must be supplied, and omitted fields retain their values. Supplied descriptions must be nonblank strings; null/empty values are invalid, so no description-clearing operation is introduced. Asset creation uses `{equipmentModelId, assetCode, serviceability?}`, and Asset PATCH accepts only `equipmentModelId` and/or `serviceability` when supplied. An Asset PATCH containing `assetCode` is `400 INVALID_INPUT` with no write. Names/categories/codes and supplied descriptions are nonblank strings; description is optional. Selected write bounds (28 November 2026): model name 1–120, category 1–80, assetCode 1–128 and supplied description 1–1,000 UTF-16 code units (`String.length`), after trimming surrounding whitespace; retain case. Category reuses F-08’s 80-character bound; the other new bounds provide compact names/codes and a short description within the existing 16 KiB JSON limit. Use existing Zod strict-object, UUID and enum validation; reject unknown keys, enforce the 16 KiB body limit and require at least one permitted field in PATCH. These are API write constraints, not a schema migration: validate supplied fields, preserve existing identifiers/records and do not rewrite historical values; invalid UUID/enum/body is `400 INVALID_INPUT`; model uniqueness uses the existing `(name, category)` key; duplicate model/code is `409 DUPLICATE_EQUIPMENT_MODEL`/`DUPLICATE_ASSET_CODE`; historical model reassignment is `409 ASSET_MODEL_IMMUTABLE`; active-loan retirement is `409 ACTIVE_LOAN_RESTRICTION`; missing records are 404; DB failure is safe 500/503. Anonymous is 401. Borrower is 403 for privileged administration operations; the existing shared catalog `GET /api/v1/assets` and `GET /api/v1/assets/:id` remain available to both authenticated roles. Model/code uniqueness is checked on the final merged values, backed by existing database unique constraints; valid UUIDs referencing missing Models/Assets return `404 NOT_FOUND`. Asset creation defaults omitted serviceability to SERVICEABLE. No client availability is accepted.

Responses use these exact projections, with all IDs UUID strings:

```text
ModelDTO = { id: string, name: string, category: string, description: string | null }
AssetDTO = { id: string, assetCode: string, modelName: string, category: string,
             serviceability: "SERVICEABLE" | "MAINTENANCE" | "RETIRED",
             available: boolean }
```

`AssetDTO` is the unchanged [F-02 catalog projection](../../sprint-1/contracts/F-02-equipment-catalog.md); availability is server-derived. Model POST/Asset POST return `201 {data: ModelDTO}` / `201 {data: AssetDTO}`; PATCH returns the corresponding `200 {data: ...}`. `GET /api/v1/equipment-models` is Custodian-only, rejects query parameters and returns `200 {data:{items:ModelDTO[]}}`, ordered by name, category, then id ascending (empty is `items:[]`). Shared Asset GET list/detail retain F-02 envelopes and permissions; F-08 alone defines list-query extensions. All projections omit credentials/session fields.

Asset PATCH runs in one PostgreSQL transaction: lock the target Asset with `FOR UPDATE` before reading dependent request/Loan state, then re-read its current model/serviceability and revalidate every supplied change. Model reassignment checks any BorrowRequest (including CANCELLED) or Loan history; retirement checks for an active Loan. Apply all permitted changes atomically or roll back the whole PATCH. Request creation, cancellation, checkout and return retain the same Asset-first ordering; administration never rewrites their rows. Asset creation validates its Model in the transaction and relies on unique/FK constraints; Model PATCH changes metadata only and relies on `(name, category)` uniqueness, without acquiring an Asset lock after a Model lock.

Concurrent outcomes are serialized: retirement before checkout makes checkout fail with `409 ASSET_UNAVAILABLE`; checkout before retirement makes retirement fail with `409 ACTIVE_LOAN_RESTRICTION`. A first request created before reassignment causes `409 ASSET_MODEL_IMMUTABLE`; reassignment committed first allows a subsequent eligible request against the same Asset with its new model. An existing checkout request already counts as history, so reassignment cannot succeed before that checkout. MAINTENANCE remains permitted during an active Loan; it prevents a later checkout, while existing Loans remain unchanged. Retirement versus return is rejected while the Loan is active, or may succeed after the return commits.

Models may be edited while Assets exist without breaking references. No model/Asset deletion or bulk operation is exposed. Asset serviceability changes never edit Loans; failed mutations leave all rows unchanged. Concurrent duplicate creation yields one success and one conflict. UI provides labeled keyboard-accessible forms, visible focus, inline validation, loading/empty/success/conflict/failure/retry states, and refreshes Inventory/catalog only after server confirmation.

## Acceptance criteria and STS

| AC | Observable result | STS |
|---|---|---|
| AC-F07-01 | Lists distinguish EquipmentModel and physical Asset identity. | TEST-F07-01 |
| AC-F07-02 | Valid model POST and partial PATCH persist exactly the defined ModelDTO, preserving omitted fields and Asset references. | TEST-F07-02 |
| AC-F07-03 | Valid Asset creation/permitted PATCH return the defined AssetDTO; model, trimmed code and serviceability persist; updates cannot modify the code. | TEST-F07-03 |
| AC-F07-04 | Invalid/blank/over-limit fields return 400 with no write; exact selected limits are accepted. | TEST-F07-04 |
| AC-F07-05 | New codes trim whitespace, are unique and never reused; existing codes are neither rewritten nor mutable. | TEST-F07-05, TEST-F07-06 |
| AC-F07-06 | Anonymous/Borrower/wrong Origin/CSRF mutation is denied. | TEST-F07-07 |
| AC-F07-07 | Serviceability changes derive availability without changing Loans. | TEST-F07-08 |
| AC-F07-08 | Reassignment after any request/Loan history and retirement during an active Loan are rejected; concurrent borrowing/administration follows the specified serialized outcomes without partial writes. | TEST-F07-09 |
| AC-F07-09 | References are preserved and no delete operation is available. | TEST-F07-10 |
| AC-F07-10 | Concurrent duplicate creation is one success plus one conflict. | TEST-F07-11 |
| AC-F07-11 | Injected failure rolls back all mutation. | TEST-F07-12 |
| AC-F07-12 | UI validation/loading/empty/success/conflict/failure/refresh states work. | TEST-F07-13, TEST-F07-14 |
| AC-F07-13 | Catalog reflects committed inventory changes. | TEST-F07-15 |
| AC-F07-14 | F-01–F-05 regression remains passing. | TEST-F07-16 |

| Test ID | Level | Inputs | Expected outcome |
|---|---|---|---|
| TEST-F07-01 | API/UI | Two models and multiple Assets | Distinct complete identity. |
| TEST-F07-02 | API/PostgreSQL | Required Model POST and each allowed Model PATCH field with Assets | Exact 201/200 ModelDTO; omitted fields unchanged; duplicate final `(name, category)` is 409 with no write; existing Asset references preserved. |
| TEST-F07-03 | API/PostgreSQL | Asset creation (including omitted serviceability) and permitted PATCH | Exact 201/200 AssetDTO; SERVICEABLE default, trimmed immutable created code and derived availability match persistence. |
| TEST-F07-04 | API | Missing required Model POST fields; blank/null/malformed/invalid enum/unknown key/empty PATCH; lengths at name 120/121, category 80/81, code 128/129, description 1,000/1,001 after trimming | Exact limits accepted for otherwise valid input; over-limit or invalid input returns 400 with no write. Optional description may be omitted; existing long records remain readable. |
| TEST-F07-05 | API/PostgreSQL | Whitespace code, PATCH assetCode and historical code | New value trims; PATCH rejects code modification; existing identifiers unchanged and not reused. |
| TEST-F07-06 | PostgreSQL | Duplicate assetCode or identical model `(name, category)` concurrent requests | One row/success; one 409. |
| TEST-F07-07 | API/security | Anonymous/Borrower/wrong Origin/CSRF | 401/403; no write. |
| TEST-F07-08 | PostgreSQL | All serviceability transitions without active Loan | Availability correct; Loans unchanged. |
| TEST-F07-09 | PostgreSQL | Historical reassignment/active-loan retirement; synchronized independent retirement-vs-checkout, first-request-vs-reassignment, MAINTENANCE-vs-checkout and retirement-vs-return transactions | Force each ordering and assert the specified success/conflict outcomes, preserved winning state, no administration writes to Loan/history rows and at most one active Loan; rejected PATCH writes nothing. |
| TEST-F07-10 | API/PostgreSQL | Referenced records and attempted deletion | References preserved; no delete route. |
| TEST-F07-11 | PostgreSQL | Independent duplicate creates | Exactly one success and one conflict. |
| TEST-F07-12 | PostgreSQL | Failure before commit | No partial mutation. |
| TEST-F07-13 | UI | Valid/invalid forms | Labels, inline errors, disabled pending submit, keyboard operation. |
| TEST-F07-14 | UI | Loading/empty/success/conflict/failure | Accessible recovery and refresh. |
| TEST-F07-15 | Integration | Mutation then catalog read | Committed state visible. |
| TEST-F07-16 | Regression | F-01–F-05 suites | Existing behavior passes. |

## Definition of Done

Q-04 inventory decisions formally confirmed; versioned contract/STS reviewed; API/UI/persistence integration implemented; authorization, validation, references, serviceability, retirement, concurrency and rollback PostgreSQL tests pass; regression, typecheck, build and CI pass; teammate review, sprint-staging integration and release smoke/persistence evidence are recorded. No implementation or execution evidence is claimed now.
