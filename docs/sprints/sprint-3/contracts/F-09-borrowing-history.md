# F-09 — Borrowing History

Status: **Planning contract; not implemented or verified.**

## Traceability and scope

Requirements: FR-11; BR-06, BR-09; NFR-01, NFR-06, NFR-08, NFR-09.

Dependencies: F-05 returned Loans, F-06 due dates, SYS-01 references and existing F-01 ownership/role guards.

## Feature SDS and contract

F-09 exposes completed Loans separately from F-04 active Loans. Borrowers retrieve only their own returned Loans. Custodians retrieve returned Loans within the approved department scope. Records include Asset, checkout, due, return, derived `returnedLate` (`returnedAt > dueAt`) and responsible-Custodian fields. F-06 supplies the due/returnedLate data but introduces no Sprint 2 completed-loan history screen. No history mutation is provided.

Proposed read routes: `GET /api/v1/borrower/loans/history` and `GET /api/v1/custodian/loans/history`, following existing route and response conventions. The UI provides a history section with identity, timestamps, clear empty state and safe error/retry behavior.

## Acceptance criteria and STS

| AC | Expected result | STS |
|---|---|---|
| AC-F09-01 | Borrower sees only own completed Loans | TEST-F09-01 |
| AC-F09-02 | Custodian sees only authorized department history | TEST-F09-02 |
| AC-F09-03 | History fields match persisted data | TEST-F09-03 |
| AC-F09-04 | Active Loans are excluded | TEST-F09-04 |
| AC-F09-05 | Foreign/unauthorized history is concealed | TEST-F09-05 |
| AC-F09-06 | History persists and has usable empty/error states | TEST-F09-06 |

| Test ID | Level | Inputs | Expected outcome |
|---|---|---|---|
| TEST-F09-01 | API/PostgreSQL | Two Borrowers with returned Loans | Each sees only own history |
| TEST-F09-02 | API/PostgreSQL | Department records | Only authorized scope returns |
| TEST-F09-03 | Integration | Returned Loan with due/return data | Projection matches persistence |
| TEST-F09-04 | API | Active and returned Loans | Active Loan excluded |
| TEST-F09-05 | API/security | Foreign ID/wrong role | Existing 404/403 conventions apply |
| TEST-F09-06 | UI/integration | Empty/error/restart | State is understandable and persistent |

## Deliverable 2 checkpoint slice

Implement and test: after F-05 return, a Borrower no longer sees the Loan under active Loans and sees it in completed history; the Custodian sees it within permitted scope. This is meaningful progress, not complete F-09 acceptance.

## Definition of Done

Contract/SDS/STS reviewed; ownership/scope tests pass; the bounded returned-Loan workflow is implemented and evidenced; F-01–F-08 regression passes. Full history scope and presentation remain separately tracked.
