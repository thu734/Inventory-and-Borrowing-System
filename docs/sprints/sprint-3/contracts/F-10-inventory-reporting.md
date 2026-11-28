# F-10 — Inventory Reporting

Status: **Selected implementation baseline, 28 November 2026, subject to normal PR review. PR #73 confirmed reporting scope; the concrete interface and performance target below are new selections. Not implemented; tests not executed.**

## Traceability and scope

Requirements: FR-12; BR-02, BR-06, BR-08, BR-11; NFR-01, NFR-05, NFR-06, NFR-08, NFR-09.

Dependencies: F-05 returns, F-06 due/overdue, F-07 inventory, SYS-01 persistence and Q-04 summary semantics.

## Feature SDS and contract

A Custodian retrieves read-only inventory summaries from one consistent persisted-data snapshot. The report includes totals by category and serviceability, available Assets, active Loans and overdue active Loans. Confirmed Q-04 reporting scope uses serviceability categories that partition inventory. Available Assets and Assets with active Loans are disjoint, but need not cover total inventory; overdue Loans are a subset of active Loans. Reporting preserves the immutable, non-reused Asset-code identity recorded by F-07; it does not rewrite historical codes. NFR-05’s local performance contract is selected below on 28 November 2026; PR #73 is not claimed to have approved its numerical target.

Route: `GET /api/v1/custodian/reports/inventory`. Reuse F-01 authentication and CUSTODIAN guard; anonymous is 401, Borrower is 403, unknown query parameters are `400 INVALID_INPUT`, and persistence failures are sanitized 500/503. Return `200 {data:{totalAssets, byCategory, byServiceability, availableAssets, activeLoans, overdueLoans}}`; category entries are `{category, count}` ordered by category ascending, `byServiceability` is an object with integer counts under `SERVICEABLE`, `MAINTENANCE` and `RETIRED`, including zeros; all totals/counts are nonnegative integers. Empty inventory returns zero totals and an empty category collection. Derive all counts from one PostgreSQL repeatable-read transaction snapshot and one captured server time for the strict overdue boundary. The UI is a read-only summary table; no reporting store or dashboard is added.

Performance contract (new selection, 28 November 2026): use SRS NFR-05’s isolated local PostgreSQL fixture of 100 Assets and 500 Loans, including all serviceability states, 20 active Loans on distinct Assets (10 overdue) and 480 returned Loans. Measure authenticated `GET /api/v1/custodian/reports/inventory` with two concurrent readers, 10 warm-up requests followed by 100 measured requests total. Time each complete HTTP request through JSON-body receipt, excluding login/setup; sorted observation 95 of 100 (nearest-rank p95) must be ≤1,000 ms with zero unexpected errors and correct counts. Record hardware, runtime/database versions, fixture, individual timings and all failures. Existing Node HTTP timing, Vitest/Supertest and disposable PostgreSQL infrastructure can support a future harness; no performance harness or result is claimed here. This is a local course-project target, not a production SLA.

## Acceptance criteria and STS

| AC | Expected result | STS |
|---|---|---|
| AC-F10-01 | Authorized Custodian receives category/serviceability totals | TEST-F10-01 |
| AC-F10-02 | Available, active and overdue counts reconcile | TEST-F10-02 |
| AC-F10-03 | Unauthorized users cannot access reports | TEST-F10-03 |
| AC-F10-04 | Report is internally consistent at one snapshot | TEST-F10-04 |
| AC-F10-05 | Read-only UI has loading, empty and failure states | TEST-F10-05 |
| AC-F10-06 | NFR-05 reporting operation meets p95 ≤1,000 ms with zero unexpected errors and correct counts on the specified local fixture | TEST-F10-06 |

| Test ID | Level | Inputs | Expected outcome |
|---|---|---|---|
| TEST-F10-01 | API/PostgreSQL | Categorized Assets/serviceability and empty inventory | Defined response shape, category ordering and zero serviceability/totals match persistence |
| TEST-F10-02 | PostgreSQL | Active/returned/overdue Loans | Counts reconcile; overdue is active subset |
| TEST-F10-03 | API/security | Borrower/anonymous/Custodian and query-bearing request | 403/401/200 respectively; query parameters return 400; no writes |
| TEST-F10-04 | PostgreSQL | Concurrent state changes | One internally consistent snapshot |
| TEST-F10-05 | UI | Loading/empty/database failure | Clear recoverable states |
| TEST-F10-06 | Performance | 100 Assets/500 Loans, 20 active/10 overdue, two readers, 10 warm-ups, 100 measured HTTP requests | Nearest-rank p95 ≤1,000 ms; zero unexpected errors; counts correct; record environment, timings and failures. NOT EXECUTED |

## Definition of Done

Q-04 reporting scope confirmed; selected interface/performance baseline reviewed; contract/SDS/STS reviewed; report scope and snapshot behavior implemented; authorization/reconciliation tests pass; F-01–F-09 regression and release evidence are complete. This contract does not claim current implementation.
