# BorrowBase — Feature Inventory

The inventory covers the whole product defined in the [SRS](srs.md). All entries are planned allocations, not implementation status. “Both” means Borrower and Custodian. SYS-01 and SYS-02 are supporting engineering responsibilities. Later-sprint ownership is proposed.

| ID | Feature and description | Primary actor | Related requirements | Sprint | Major dependencies | Owner |
|---|---|---|---|---|---|---|
| F-01 | Authentication and Authorization — login, logout, identity and backend guards. | Both | FR-01; BR-06; NFR-01, NFR-02, NFR-06, NFR-08, NFR-09 | S1 | SYS-01; agreed identity/session interface. | Member 6 |
| F-02 | Equipment Catalog and Availability — list/detail of physical units and computed availability. | Both | FR-02; BR-01, BR-02; NFR-01, NFR-05, NFR-06, NFR-08, NFR-09 | S1 | F-01, SYS-01; model/unit projection. | Member 2 |
| F-03 | Borrowing Requests and Own Records — request a unit; retrieve own requests/active loans. | Borrower | FR-03, FR-04; BR-02, BR-03, BR-06; NFR-01, NFR-03, NFR-06, NFR-08, NFR-09 | S1 | F-01, F-02, SYS-01; Q-01. F-04 supplies the real checked-out Loans later retrieved here. | Member 6 |
| F-04 | Custodian Queue, Checkout and Active Loans — inspect requests, perform exclusive checkout and retrieve department active loans. | Custodian | FR-04 (creates the Loan data consumed by F-03 retrieval), FR-05, FR-06; BR-02, BR-03, BR-04, BR-05, BR-06, BR-10; NFR-01, NFR-03, NFR-04, NFR-05, NFR-06, NFR-08, NFR-09 | S1 | F-01, F-02, F-03 request creation, SYS-01; Q-02 and shared mutation rules. | Member 2 |
| F-05 | Equipment Return — record return and recompute availability. | Custodian | FR-07; BR-02, BR-06, BR-07, BR-09; NFR-01, NFR-08, NFR-09 | S2 | F-04, SYS-01; return/serviceability policy. | Member 2 (proposed) |
| F-06 | Due Dates and Overdue Behavior — loan timing and S1-loan upgrade under the agreed policy. | Both | FR-08; BR-08; NFR-01, NFR-08, NFR-09 | S2 | F-04, SYS-01; Q-03 and S2 due-date migration. | Member 6; Member 2 data support (proposed) |
| F-07 | Inventory Administration — maintain models, assets, serviceability and historical references. | Custodian | FR-09; BR-01, BR-02, BR-06, BR-09; NFR-01, NFR-08, NFR-09 | S2 | F-01, F-02, F-04 state, SYS-01; D-09. | Member 2 (proposed) |
| F-08 | Catalog Search and Filtering — find units by code/model/category/availability. | Both | FR-10; NFR-01, NFR-08, NFR-09 | S2 | F-01, F-02; query agreement. F-07 edited data supports regression. | Member 6 (proposed) |
| F-09 | Borrowing History — authorized completed-loan history. | Both | FR-11; BR-06; NFR-01, NFR-08, NFR-09 | S3 | F-05, F-06, SYS-01. | Member 6 (proposed) |
| F-10 | Inventory Reporting — reconciled inventory, active-loan and overdue summaries. | Custodian | FR-12; BR-06, BR-11; NFR-01, NFR-08, NFR-09 | S3 | F-05, F-06, F-07, SYS-01; summary projection agreement. | Member 2 (proposed) |
| SYS-01 | Database Foundation — schema, integrity, migrations, seed and test isolation. | System support | Supports FR-01, FR-02, FR-03, FR-04, FR-06; BR-01, BR-04, BR-05, BR-07, BR-09; NFR-03, NFR-04, NFR-09 | S1; evolve S2/S3 | Requirements, system data design and isolated PostgreSQL. | Member 2 |
| SYS-02 | Verification and Delivery — reproducible builds/tests, quality checks, deployment and regression. | Engineering support | All feature regression; NFR-05, NFR-06, NFR-07, NFR-08, NFR-09 | S1 local/design; Lab 5 during S2; S3 hardening | Features as introduced; Lab 5 deployment resources. | Shared |

Member 6 implements F-03 Borrower operations; Member 2 implements the Custodian queue and checkout under F-04. Shared models and interfaces are dependencies, not shared endpoint ownership. Member 2 also owns the system SDS, sprint plan, schema, migrations and seed.

F-03 request creation does not require completed checkout; its real loan-retrieval journey does. Search requires catalog behavior, not completed inventory editing. Q-01/Q-02 govern pending-request policy; Q-03 governs S2 due/backfill behavior. Future UI/API and detailed test specifications are refined in the respective feature contracts.

See [traceability](traceability.md) for requirement-level verification allocation.
