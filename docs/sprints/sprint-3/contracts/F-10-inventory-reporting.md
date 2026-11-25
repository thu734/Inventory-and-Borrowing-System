# F-10 — Inventory Reporting

Status: **Planning contract; not implemented or verified.**

## Traceability and scope

Requirements: FR-12; BR-02, BR-06, BR-08, BR-11; NFR-01, NFR-05, NFR-06, NFR-08, NFR-09.

Dependencies: F-05 returns, F-06 due/overdue, F-07 inventory, SYS-01 persistence and Q-04 summary semantics.

## Feature SDS and contract

A Custodian retrieves read-only inventory summaries from one consistent persisted-data snapshot. The report includes totals by category and serviceability, available Assets, active Loans and overdue active Loans. Proposed Q-04 semantics are that serviceability partitions inventory, available and active-loan counts may overlap because unsuitable Assets may be loaned, and overdue is a subset of active Loans. Reporting preserves the immutable, non-reused Asset-code identity recorded by F-07; it does not rewrite historical codes. These semantics require approval.

Proposed route: `GET /api/v1/custodian/reports/inventory`. The server derives Custodian scope. A compact summary table is sufficient; a dashboard is not required.

## Acceptance criteria and STS

| AC | Expected result | STS |
|---|---|---|
| AC-F10-01 | Authorized Custodian receives category/serviceability totals | TEST-F10-01 |
| AC-F10-02 | Available, active and overdue counts reconcile | TEST-F10-02 |
| AC-F10-03 | Unauthorized users cannot access reports | TEST-F10-03 |
| AC-F10-04 | Report is internally consistent at one snapshot | TEST-F10-04 |
| AC-F10-05 | Read-only UI has loading, empty and failure states | TEST-F10-05 |
| AC-F10-06 | Approved performance target is met if Q-04 includes one | TEST-F10-06 |

| Test ID | Level | Inputs | Expected outcome |
|---|---|---|---|
| TEST-F10-01 | API/PostgreSQL | Categorized Assets/serviceability | Totals match persistence |
| TEST-F10-02 | PostgreSQL | Active/returned/overdue Loans | Counts reconcile; overdue is active subset |
| TEST-F10-03 | API/security | Borrower/anonymous/Custodian | Only authorized Custodian succeeds |
| TEST-F10-04 | PostgreSQL | Concurrent state changes | One internally consistent snapshot |
| TEST-F10-05 | UI | Loading/empty/database failure | Clear recoverable states |
| TEST-F10-06 | Performance | Approved dataset/target | Result includes environment and failures |

## Definition of Done

Q-04 summary/performance semantics approved; contract/SDS/STS reviewed; report scope and snapshot behavior implemented; authorization/reconciliation tests pass; F-01–F-09 regression and release evidence are complete. This contract does not claim current implementation.
