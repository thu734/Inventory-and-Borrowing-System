# F-08 — Catalog Search and Filtering

- Contract version: 0.2
- STS version: 0.2
- Revision date: 2026-11-24
- Author: Thu Thu Wai - 3486
- Reviewer: pending teammate review
Approval status: draft; selected Q-04 query proposal pending formal teammate confirmation; not implemented or verified

## Traceability and layer impact

Requirements: FR-10; BR-02, BR-06; NFR-01, NFR-06, NFR-08, NFR-09. Dependencies: F-01, F-02, F-05 and F-07. No new schema fields, saved searches, pagination, advanced syntax, analytics or frontend dependency.

| Layer | Classification | Reason |
|---|---|---|
| UI | Required change | Add labeled search/category/availability controls, clear/reset, loading/empty/error/retry and committed-state refresh. |
| API | Required modification | Extend existing authenticated `GET /api/v1/assets`, which currently rejects query parameters; preserve no-query behavior. |
| Data | No change required | Use existing model/Asset fields and derived availability; no search-specific schema. |

## API and UI contract

`GET /api/v1/assets` keeps its current no-query `200 {data:{items:[...]}}` response and deterministic `assetCode ASC` ordering. Accepted parameters: `q` (trimmed text, maximum 120 characters, case-insensitive substring against Asset code OR EquipmentModel name), `category` (exact value, maximum 80 characters), and `available` (lowercase `true` or `false`). Empty/whitespace `q` is absent. Parameters combine with AND semantics. Unknown keys, malformed booleans, overlong values and invalid encoding return `400 INVALID_INPUT`; no mutation occurs. Order is `assetCode ASC`, then `id ASC`.

The existing authenticated `GET /api/v1/assets/:id` detail route remains unchanged and continues rejecting query parameters. Borrowers and Custodians retain the same catalog permission; anonymous is 401. Results use the existing Asset DTO and server-derived availability.

UI clear/reset returns to no-query results. Valid no-match queries return 200 with an empty collection and explicit empty message. After committed checkout, return or inventory mutation, the catalog refetches. Uncertain mutations do not claim success or auto-repeat. Controls are labeled, keyboard-operable, visibly focused and responsive.

## Acceptance criteria and STS

| AC | Observable result | STS |
|---|---|---|
| AC-F08-01 | `q` performs case-insensitive substring match on code or model name. | TEST-F08-01 |
| AC-F08-02 | Exact category and availability filters return correct derived results. | TEST-F08-02 |
| AC-F08-03 | Combined filters use AND semantics. | TEST-F08-03 |
| AC-F08-04 | No-match query succeeds with empty collection and clear UI state. | TEST-F08-04 |
| AC-F08-05 | Unknown/malformed/overlong inputs return 400 `INVALID_INPUT`. | TEST-F08-05 |
| AC-F08-06 | Results reflect current checkout, return and serviceability changes. | TEST-F08-06 |
| AC-F08-07 | Existing no-query list/detail behavior and deterministic ordering remain compatible. | TEST-F08-07 |
| AC-F08-08 | UI supports loading, reset, errors, keyboard use and committed refresh. | TEST-F08-08 |
| AC-F08-09 | F-01–F-07 regression remains passing. | TEST-F08-09 |

| Test ID | Level | Inputs | Expected outcome |
|---|---|---|---|
| TEST-F08-01 | API/PostgreSQL | Mixed-case code/model, substring and nonmatch | Correct OR match, case-insensitive. |
| TEST-F08-02 | API/PostgreSQL | Exact category and true/false availability | Every row satisfies exact predicates. |
| TEST-F08-03 | API/PostgreSQL | q + category + available | Every result satisfies all filters. |
| TEST-F08-04 | API/UI | Valid no-match query | 200 empty list and explicit empty state. |
| TEST-F08-05 | API | Unknown key, `available=yes`, 121-char q | 400 safe error; no write. |
| TEST-F08-06 | Integration/PostgreSQL | Checkout/return/serviceability then same query | Current committed availability is returned. |
| TEST-F08-07 | API | No-query list, detail with query, equal-code fixtures | No-query compatibility, detail rejection, assetCode/id order. |
| TEST-F08-08 | UI | Loading/no-match/reset/outage/narrow keyboard view | Accessible recovery and refresh. |
| TEST-F08-09 | Regression | F-01–F-07 suites | Existing behavior passes. |

## Definition of Done

Q-04 query decisions formally confirmed; versioned contract/STS reviewed; existing catalog endpoint/UI extended without schema change; API/PostgreSQL/UI/regression tests, typecheck, build and CI pass; teammate review, sprint-staging integration and release smoke/persistence evidence are recorded. No implementation or execution evidence is claimed now.
