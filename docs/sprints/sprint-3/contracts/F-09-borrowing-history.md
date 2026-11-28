# F-09 — Borrowing History

Status: **Selected implementation baseline, 28 November 2026, subject to normal PR review. PR #73 reviewed the F-06/F-09 scope boundary; the concrete interface below is a new selection. Not implemented; tests not executed.**

## Traceability and scope

Requirements: FR-11; BR-06, BR-09; NFR-01, NFR-06, NFR-08, NFR-09.

Dependencies: F-05 returned Loans, F-06 due dates, SYS-01 references and existing F-01 ownership/role guards.

## Feature SDS and contract

F-09 exposes completed Loans separately from F-04 active Loans. Borrowers retrieve only their own returned Loans. Custodians retrieve returned Loans within the approved department scope. Records include Asset, checkout, due, return, derived `returnedLate` (`returnedAt > dueAt`) and responsible-Custodian fields. F-06 supplies the due/returnedLate data but introduces no Sprint 2 completed-loan history screen. Cancelled BorrowRequests remain in F-03 request history and are not completed Loans. No history mutation is provided.

Read routes: `GET /api/v1/me/loan-history` (BORROWER, session-derived owner) and `GET /api/v1/custodian/loan-history` (CUSTODIAN, department scope). These dedicated collection paths avoid the existing `/me/loans/:id` UUID route; no history detail endpoint is added. Both reject query parameters with `400 INVALID_INPUT` and return `200 {data:{items:[...]}}`, including an empty collection when appropriate. Query only Loans with `returnedAt IS NOT NULL`; order by `returnedAt DESC`, then `id DESC`. Each item contains `id`, `borrowRequestId`, `asset` (`id`, `assetCode`, `modelName`, `category`), UTC ISO `checkedOutAt`, `dueAt`, `returnedAt`, derived boolean `returnedLate`, and `checkedOutBy`/`returnedBy` (`id`, `displayName`). Custodian items additionally include `borrower` (`id`, `displayName`); Borrower items disclose no foreign Borrower identity. Reuse F-01 authentication/role guards: anonymous/inactive sessions are 401, wrong role is 403, and persistence failures use sanitized 500/503 responses. The existing active-Loan endpoints remain unchanged. The UI uses a read-only history table with these fields, an empty state and safe error/retry behavior.

## Acceptance criteria and STS

| AC | Expected result | STS |
|---|---|---|
| AC-F09-01 | BORROWER receives only own returned Loans from `/me/loan-history` in the defined collection envelope | TEST-F09-01 |
| AC-F09-02 | Custodian sees only authorized department history | TEST-F09-02 |
| AC-F09-03 | History projection and returnedAt/id descending order match persisted data | TEST-F09-03 |
| AC-F09-04 | Active Loans and cancelled BorrowRequests are excluded; active-Loan routes remain unchanged | TEST-F09-04 |
| AC-F09-05 | Foreign/unauthorized history is concealed | TEST-F09-05 |
| AC-F09-06 | History persists and has usable empty/error states | TEST-F09-06 |

| Test ID | Level | Inputs | Expected outcome |
|---|---|---|---|
| TEST-F09-01 | API/PostgreSQL | Two Borrowers with returned Loans | Each sees only own history |
| TEST-F09-02 | API/PostgreSQL | Department records | Only authorized scope returns |
| TEST-F09-03 | Integration | Returned Loan with due/return data | Defined identity/timestamp/Custodian projection, strict returnedLate and deterministic ordering match persistence |
| TEST-F09-04 | API | Active/returned Loans and cancelled BorrowRequests; requests to dedicated history and existing active-Loan routes | History returns only returned Loans; history path is not parsed as a UUID; existing active routes retain their behavior |
| TEST-F09-05 | API/security | Two Borrowers with returned Loans each request their own collection; anonymous caller; Borrower requests Custodian collection | Own collections return 200 without foreign rows or counts; anonymous receives 401; Borrower receives 403 on Custodian history. No detail endpoint is assumed |
| TEST-F09-06 | UI/integration | Empty/error/restart | 200 empty items; no-query validation returns 400; errors are safe/retryable; records persist after restart |

## Deliverable 2 checkpoint slice

Implement and test: after F-05 return, a Borrower no longer sees the Loan under active Loans and sees it in completed history; the Custodian sees it within permitted scope. This is meaningful progress, not complete F-09 acceptance.

## Definition of Done

Contract/SDS/STS reviewed; ownership/scope tests pass; the bounded returned-Loan workflow is implemented and evidenced; F-01–F-08 regression passes. The selected collection interfaces and read-only table above define the implementation scope; no implementation or passing execution is claimed.
