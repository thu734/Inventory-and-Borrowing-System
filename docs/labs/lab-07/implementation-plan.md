# BorrowBase — Lab 7 Part A: Approved Change Impact and Contract Revision

Status: **contract preparation complete; pending teammate review before implementation**. No code, schema, migration or executable test was changed or run.

## A. Change reference and baseline

- **Issue:** [#71](https://github.com/thu734/Inventory-and-Borrowing-System/issues/71); TA approval: **P’ Tik**, **November 25, 2026**. The original email is not attached or independently inspected here.
- **Accepted Sprint 1 / Lab 6 baseline:** `6a0e29154c2b2165c486b0bc8d18e3fd2475b2fc`.
- **Actual pre-change implementation:** verified pre-change main `e042f06f5666744d58166be340b4a451bc889e98`. The later `3710af0913d1638a9f185cfe4f8e91e4e2a5e3ed` reference is retained only as a later Sprint 1 test/evidence commit; `21ad3e3`/`9bab834` are later documentation synchronization references. Git ancestry/current remote state was not independently verified.
- **Old:** owners create/view `PENDING`/`FULFILLED` requests; only Custodians can checkout eligible pending requests; no cancellation exists.
- **New:** the owner may cancel an own `PENDING` request; it remains persisted as `CANCELLED`, visible to its owner, and cannot be checked out. Ownership, history, Loan, availability and authorization rules remain in force.

## B. Change-impact matrix

| Requirement | Feature | Affected SRS | Affected Feature/System SDS | Acceptance / STS | Existing modules | Nature of change |
|---|---|---|---|---|---|---|
| FR-03/04; BR-03/06/09 | F-03 | Functional requirements, business rules, UC-03/04, NFR-01/03/08 | F-03 workflow/API/UI; request lifecycle, integrity and Borrower navigation | AC-F03-10–16 / TEST-F03-10–16 | F-02 selected-Asset caller → borrowing routes/store → BorrowerWorkspace; F-01 auth/role/CSRF dependency | Add owner-only `PENDING → CANCELLED`, owner-visible status, safe errors; no deletion, reservation or Loan mutation. |
| FR-05/06; BR-04/05/10 | F-04 | Functional requirements, business rules, UC-05, NFR-04/08 | F-04 checkout transaction/state validation | AC-F04-10–13 / TEST-F04-10–13 | CustodianWorkspace → custodian routes/store/rules; F-03 request state and SYS-01 Asset/Loan dependency | Reject cancelled requests and revalidate state under existing locks. |
| BR-06; NFR-01/02 | F-03/F-04 | Authorization/API conventions | Shared auth/RBAC and safe error envelope | AC-F03-11–13; AC-F04-12 | F-01 guards plus F-03/F-04 routes | Preserve authentication, role and ownership checks; Borrower cannot checkout, Custodian cannot cancel. |
| FR-04; NFR-06/08 | F-03 | UI workflow/error requirements | F-03 Borrower navigation/state model | AC-F03-14 / TEST-F03-14 | BorrowerWorkspace/API client | Add Cancel only for own pending rows, confirmation, loading, status and recoverable errors. |
| BR-09; NFR-03 | F-03/SYS-01 | Persistence/history | System SDS data architecture/integrity | AC-F03-10/15 / TEST-F03-10/15 | BorrowRequest persistence/DTOs | Schema/migration is required to represent CANCELLED; preserve rows and relationships. |
| BR-02/04/05; NFR-04/08 | F-04/SYS-01 | Concurrency/transactions | System SDS locking strategy | AC-F04-10/11/13; AC-F03-16 / TEST-F04-10/11/13; TEST-F03-16 | Existing Asset-first transaction; future cancel transaction | Reuse Asset-first locking and lock/recheck the request so cancellation and checkout cannot both commit. |
| FR-01/02; NFR-09 | F-01/F-02 regression | No change | **No change required:** auth/catalog do not own cancellation | REG-F01-F04 / TEST-REG-01 | Existing auth/catalog modules | Cancellation consumes existing identity/Asset data; F-01–F-04 regression remains required. |
| F-05–F-10 | Later features | No change | **No change required** | Out of scope | None | This is an F-03/F-04 lifecycle revision, not a Sprint 2 feature. |

## C. Contract-first implementation sequence

1. Revise specifications, AC and STS.
2. Obtain teammate review of the revised contracts.
3. Establish versioned documentation history before implementation.
4. Execute RED tests against the old behavior.
5. Implement the approved change.
6. Execute GREEN and Sprint 1 regression tests.
7. Obtain implementation PR review and passing CI.
8. Integrate through Lab 7 staging and release to main.
9. Verify the deployed changed workflow and preserved workflows.

Steps after contract revision are future gates.
