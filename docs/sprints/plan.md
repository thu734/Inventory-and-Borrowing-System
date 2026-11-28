# BorrowBase Three-Sprint Plan

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
## 1. Planning basis and Sprint 1 scope

BorrowBase is developed across three sprints for CPE 334 Project Deliverable 1. This plan follows the SRS, feature inventory, and traceability matrix. Sprint work describes planned outcomes, not completed implementation.

Sprint 1 includes SYS-01 and F-01 through F-04. SYS-01 provides PostgreSQL persistence, migrations, seed data and integrity rules. F-01 provides identity and authorization; F-02 provides Asset availability; F-03 provides Borrower request and own-record operations; and F-04 provides Custodian checkout and active Loans. Together these dependencies produce a working borrowing workflow: a seeded user authenticates, an eligible Asset is selected, a request is persisted for the session-derived Borrower, and a Custodian can atomically check out the request and create the Loan. A `PENDING` request does not reserve an Asset.

## 2. Sprint allocation and outcomes

| Sprint and checkpoint | Goal | Allocated work | Expected working outcome |
| --- | --- | --- | --- |
| **Sprint 1**<br> Checkpoint: **November 8, 2026** | Establish the secure, persistent borrowing workflow | **SYS-01** Database Foundation<br> **F-01** Authentication and Authorization<br> **F-02** Equipment Catalog and Availability<br> **F-03** Borrowing Requests and Own Records<br> **F-04** Custodian Queue, Checkout and Active Loans<br> SYS-02 local verification and delivery practices | A seeded Borrower or Custodian can sign in. Authenticated users can view eligible Assets. A Borrower can create and retrieve only their own request and active Loans. A Custodian can inspect requests and atomically fulfill an eligible request, creating one active Loan and making the Asset unavailable. |
| **Sprint 2**<br> Checkpoint: **November 29, 2026** | Complete the operational loan lifecycle and maintainable catalog | **F-05** Equipment Return<br> **F-06** Due Dates and Overdue Behavior<br> **F-07** Inventory Administration<br> **F-08** Catalog Search and Filtering<br> SYS-01 schema/migration evolution<br> SYS-02 Lab 5 deployment and quality work | A Custodian can return an active Loan once, with availability recomputed from serviceability. Due-date and overdue behavior is enabled under Q-03 after the required Sprint 1 loan backfill. Custodians can maintain models/Assets without damaging historical references, and users can search/filter the catalog. |
| **Sprint 3**<br> Checkpoint: **December 13, 2026** | Deliver accountable history, reporting and release hardening | **F-09** Borrowing History<br> **F-10** Inventory Reporting<br> SYS-01/SYS-02 regression, performance, usability, security and deployment hardening | Borrowers can view only their completed history, Custodians can view department history and reports, and inventory/loan/overdue summaries reconcile with persisted data. The complete system is regression-tested and prepared for the final delivery review. |

## 3. Dependencies and key decisions

- F-02 supplies the selected physical Asset identity and availability used by F-03. F-03 persists `PENDING` requests and own-record retrieval; it does not create Loans. F-04 consumes a `PENDING` request and atomically creates the Loan retrieved by F-03.
- F-05 depends on F-04 active Loans and return fields. F-06 depends on checkout timestamps and the agreed Q-03 due-date/backfill policy. F-07 depends on catalog projections, loan state and historical-reference constraints. F-08 depends on catalog queries and inventory data. F-09 depends on returned and due/overdue Loans. F-10 depends on return, due/overdue and inventory state.
- The implemented and tested F-03 contract applies Q-01: reject a duplicate `PENDING` request for the same Borrower/Asset pair, including concurrent duplicates, while allowing a later request after fulfillment.
- Q-02 was confirmed by Member 2 on November 12, 2026 (`e78dc65`): after one request is fulfilled and a Loan is created, competing requests remain `PENDING`; they are not automatically fulfilled or cancelled. The active Loan makes the Asset unavailable, and any later checkout must revalidate eligibility. This is the adopted Sprint 1 policy.
- Q-03 governs Sprint 2 due dates, overdue behavior and backfill of Sprint 1 Loans. Q-03 and the selected Q-04 inventory/query/reporting-scope policies were confirmed in PR #73; the NFR-05 local measurement contract is selected on 28 November 2026 for normal PR review.
- SYS-02 provides local verification and delivery practices in Sprint 1, Lab 5 deployment and quality work in Sprint 2, and final regression/hardening in Sprint 3.

## 4. Completion criteria

Every sprint preserves the SRS-to-feature-to-verification traceability. Completion requires the relevant feature behavior, integration checks and regression evidence without writes to shared or production data.

### Sprint 1

- Fresh PostgreSQL migration and synthetic seed setup is reproducible.
- The integrated journey passes: login → eligible Asset → `PENDING` BorrowRequest → Custodian checkout → active Loan → unavailable Asset.
- Authentication, role/ownership enforcement, persistence, request duplication, transactional checkout and active-Loan integrity are verified.
- Relevant unit, API, UI and real-PostgreSQL integration checks, typechecks, builds and whitespace checks pass.
- Feature branches are reviewed and integrated into `sprint1-staging`; the checkpoint release is accepted after review and the reviewed release is promoted to `main`.

### Sprint 2

- Returns, due-date/backfill, inventory administration and catalog search work with Sprint 1 regression preserved.
- Return and inventory operations preserve serviceability, physical identity and historical references.
- Lab 5 deployment and quality work is reproducible where the required environment is available.

### Sprint 3

- Borrowing history and inventory reporting enforce the required scopes and reconcile with persisted state.
- Full regression, accessibility, security, performance and safe-error checks are recorded.
- The final deliverable is reproducible from a clean checkout and ready for final review.

## 5. Sprint 2 implementation plan

Status: F-05–F-08 contract/STS baseline and selected Q-03/Q-04 policies were approved by MoeD3482 in [PR #73](https://github.com/thu734/Inventory-and-Borrowing-System/pull/73) at `b54f722` on 26 November 2026 (Asia/Bangkok). Features remain unimplemented and tests unexecuted. Implementation ownership and implementation reviewers remain unassigned. F-07 input bounds and F-09/F-10 interfaces/performance are selected on 28 November 2026, subject to normal PR review; these are not historical PR #73 approvals.

| Feature | Scope | Dependencies | Readiness |
|---|---|---|---|
| F-05 | One-time Custodian returns and availability recomputation | F-04, SYS-01 | Baseline contract approved; implementation ownership and execution pending |
| F-06 | Fixed due dates, overdue state and S1 Loan backfill | F-04, F-05 lifecycle, Q-03, SYS-01 | Q-03 confirmed; implementation ownership and execution pending |
| F-07 | Custodian model/Asset administration | F-01, F-02, F-04, Q-04 | Q-04 inventory policy confirmed; implementation ownership and execution pending |
| F-08 | Asset/model search and category/availability filters | F-01, F-02, Q-04 | Baseline contract approved; implementation ownership and execution pending |

F-05 and F-07 may proceed in parallel after contract review. F-06 contract and migration design may proceed in parallel with F-05, but Loan schema changes must be coordinated. F-08 can extend the existing catalog query independently and must be regression-tested after F-07 changes inventory data.

### Contract-first workflow and gates

1. Q-03 and selected Q-04 policies approved in PR #73; the NFR-05 local measurement contract is selected on 28 November 2026 for normal PR review.
2. F-05–F-08 baseline contracts/STS reviewed in PR #73; review subsequent clarifications before implementation.
3. Agree implementation ownership when each feature is ready; ownership is not part of this baseline.
4. Create one Issue and feature branch per feature when implementation begins.
5. Follow the reviewed contract: write meaningful new tests and demonstrate their expected failures against the previous behavior before implementing the feature, then implement and obtain GREEN plus regression. Preserve actual RED/GREEN commands, tested commits (and any test-only/uncommitted diff needed to identify the tested tree), relevant setup/assertions and execution output including failed/skipped counts. These are future obligations; no Sprint 2 RED/GREEN execution is claimed here.
6. Add UI validation, status feedback and committed-state refresh.
7. Require linked PR, substantive teammate review and passing CI.
8. Integrate into `sprint2-staging` only after F-01–F-04 regression.
9. Promote the reviewed release to `main` after migration, smoke, persistence and release-readiness checks.

Sprint 2 completion requires executed acceptance evidence, unit/API/UI/PostgreSQL regression, typecheck, build, CI, review and release traceability. Lab 7 request cancellation is a separate change: Issue #71 received TA approval and contract PR #74 was reviewed and merged into `lab7-staging` at baseline commit `ac00bae`. Implementation PR #76 and release PR #79 are merged; accepted main release `7daa6a9` is included in this baseline. Sprint 2 preserves owner-only PENDING → CANCELLED, CANCELLED checkout rejection and cancellation/checkout mutual exclusion; return does not reopen a terminal request. This does not establish completion of F-05–F-10.
