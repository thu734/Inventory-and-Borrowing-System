# BorrowBase Three-Sprint Plan

## 1. Planning basis and Sprint 1 scope

BorrowBase is developed across three sprints for CPE 334 Project Deliverable 1. This plan follows the SRS, feature inventory and traceability matrix. Sprint work describes planned outcomes, not completed implementation.

Sprint 1 includes SYS-01 and F-01 through F-04. SYS-01 provides PostgreSQL persistence, migrations, seed data and integrity rules. F-01 provides identity and authorization; F-02 provides Asset availability; F-03 provides Borrower request and own-record operations; and F-04 provides Custodian checkout and active Loans. Together these dependencies produce a working borrowing workflow: a seeded user authenticates, an eligible Asset is selected, a request is persisted for the session-derived Borrower, and a Custodian can atomically check out the request and create the Loan. A PENDING request does not reserve an Asset.

## 2. Sprint allocation and outcomes

| Sprint and checkpoint | Goal | Allocated work | Expected working outcome |
|---|---|---|---|
| **Sprint 1**<br>Checkpoint: **November 8, 2026** | Establish the secure, persistent borrowing workflow | **SYS-01** Database Foundation; **F-01** Authentication and Authorization; **F-02** Equipment Catalog and Availability; **F-03** Borrowing Requests and Own Records; **F-04** Custodian Queue, Checkout and Active Loans; SYS-02 local verification and delivery practices | A seeded Borrower or Custodian can sign in. Authenticated users can view eligible Assets. A Borrower can create and retrieve only their own request and active Loans. A Custodian can inspect requests and atomically fulfill an eligible request, creating one active Loan and making the Asset unavailable. |
| **Sprint 2**<br>Checkpoint: **November 29, 2026** | Complete the operational loan lifecycle and maintainable catalog | **F-05** Equipment Return; **F-06** Due Dates and Overdue Behavior; **F-07** Inventory Administration; **F-08** Catalog Search and Filtering; SYS-01 schema/migration evolution; SYS-02 Lab 5 deployment and quality work | A Custodian can return an active Loan once, with availability recomputed from serviceability. Due-date and overdue behavior is enabled under Q-03 after the required Sprint 1 loan backfill. Custodians can maintain models/Assets without damaging historical references, and users can search/filter the catalog. |
| **Sprint 3**<br>Checkpoint: **December 13, 2026** | Deliver accountable history, reporting and release hardening | **F-09** Borrowing History; **F-10** Inventory Reporting; SYS-01/SYS-02 regression, performance, usability, security and deployment hardening | Borrowers can view only their completed history, Custodians can view department history and reports, and inventory/loan/overdue summaries reconcile with persisted data. The complete system is regression-tested and prepared for the final delivery review. |

## 3. Dependencies and key decisions

- F-02 supplies the selected physical Asset identity and availability used by F-03. F-03 persists `PENDING` requests and own-record retrieval; it does not create Loans. F-04 consumes a PENDING request and atomically creates the Loan retrieved by F-03.
- F-05 depends on F-04 active Loans and return fields. F-06 depends on checkout timestamps and the agreed Q-03 due-date/backfill policy. F-07 depends on catalog projections, loan state and historical-reference constraints. F-08 depends on catalog queries and inventory data. F-09 depends on returned and due/overdue Loans. F-10 depends on return, due/overdue and inventory state.
- The implemented and tested F-03 contract applies Q-01: reject a duplicate `PENDING` request for the same Borrower/Asset pair, including concurrent duplicates, while allowing a later request after fulfillment.
- Q-02 remains pending Member 2 acknowledgement: after one request is fulfilled and a Loan is created, competing requests remain `PENDING`; they are not automatically fulfilled or cancelled, and the active Loan makes the Asset unavailable until return.
- Q-03 governs Sprint 2 due dates, overdue behavior and backfill of Sprint 1 Loans. Q-04 remains an open refinement for catalog queries, reporting semantics and related targets.
- SYS-02 provides local verification and delivery practices in Sprint 1, Lab 5 deployment and quality work in Sprint 2, and final regression/hardening in Sprint 3.

## 4. Completion criteria

Every sprint preserves the SRS-to-feature-to-verification traceability. Completion requires the relevant feature behavior, integration checks and regression evidence without writes to shared or production data.

### Sprint 1

- Fresh PostgreSQL migration and synthetic seed setup is reproducible.
- The integrated journey passes: login → eligible Asset → PENDING BorrowRequest → Custodian checkout → active Loan → unavailable Asset.
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
