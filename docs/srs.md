# BorrowBase — Software Requirements Specification

## 1. Introduction and System Context

BorrowBase is the CPE Equipment Inventory and Borrowing Management System for a hypothetical KMUTT Computer Engineering Department lending service. This specification defines the whole product across three sprints for development, design review and verification.

Scenario assumption: disconnected lending records make it difficult to identify available units, current holders, pending requests and overdue loans. This is not a finding about actual KMUTT operations. BorrowBase provides a persistent, access-controlled record of equipment and lending. Examples include lab laptops, ESP32/Arduino boards, Raspberry Pi kits, FPGA boards and oscilloscopes. Accounts and inventory data are synthetic.

The system boundary is browser UI → backend/application layer → persistent database. The backend controls identity, permissions and domain transitions. Product goals are reliable equipment discovery, exclusive checkout, traceable returns/history and accurate inventory summaries. Success is demonstrated by retrieving saved outcomes and rejecting invalid, conflicting or unauthorized operations without partial updates or private-data disclosure.

## 2. Stakeholders and Actors

The application has two actors: Borrower and Custodian.

| Actor | Responsibilities | Access boundary |
|---|---|---|
| BORROWER | Authenticate, discover equipment, request a unit, inspect own requests/active loans; later inspect completed history and return status | Own protected records only; cannot perform checkout, record return, maintain inventory or read department reports |
| CUSTODIAN | Authenticate, inspect department requests/loans, authorize checkout, later record return, maintain inventory and inspect summaries | All inventory/loans in the single hypothetical department; no multiple-department assignment model |

The department is a stakeholder seeking accurate availability, equipment accountability and inventory/overdue summaries. It is not an additional application role.

An **EquipmentModel** describes equipment and may have many **Assets**. An Asset is one physical unit with a unique code. A **BorrowRequest** records intent without reservation; a **Loan** records actual checkout. An active Loan has not been returned. A **User** has one of the two application roles.

Serviceability values are **SERVICEABLE**, **MAINTENANCE** and **RETIRED**. **AVAILABLE/UNAVAILABLE** are computed borrowing availability, not serviceability or request states. Request lifecycle states are **PENDING/FULFILLED**. Checkout fulfills only the selected request; competing requests remain PENDING (D-05).

## 3. System Scope

| Sprint | Included functionality |
|---|---|
| S1 | Authentication/authorization; seeded catalog and physical availability; Borrower requests and own active records; Custodian queue and atomic checkout. |
| S2 | Returns; due dates/overdue and existing-loan backfill; inventory maintenance; catalog search/filtering. |
| S3 | Completed-loan history and inventory summaries; remaining integration, regression, usability, security and hardening. |

### Explicitly Excluded Functionality

- Real KMUTT account/inventory integrations, external SSO, public registration, email recovery and account-administration UI.
- Payments, deposits, fines and financial billing.
- Multi-department tenancy.
- Procurement and supplier management.
- Advance reservations, separate/multistage approvals and renewals.
- Scanning hardware, automated notifications, bulk import/export and complex analytics/external service integrations.

### Planned after Sprint 1

Returns, due/overdue behavior, inventory editing/search, completed history and reporting are included in S2/S3, not excluded from the product. Custodians record returns; Borrowers view their own resulting loan state/history. Containerization, CI/CD quality gates and durable GCP deployment are established through Lab 5 and retained in subsequent releases.

## 4. Functional Requirements

S1–S3 indicate planned increments. Query/policy refinements identified as proposed remain subject to the decisions in Section 8.

| ID | Required behavior | Sprint |
|---|---|---|
| FR-01 | Authenticate an active seeded User with valid credentials, reject invalid/inactive credentials, return current authenticated identity/role and invalidate the current session on logout. | S1 |
| FR-02 | Let authenticated users list/retrieve assets with model name/category, unique asset code, serviceability and current borrowing availability. | S1 |
| FR-03 | Let a BORROWER request one currently available asset; persist a PENDING BorrowRequest with server-derived borrower/asset association and return its ID/status. | S1 |
| FR-04 | Let a BORROWER list/retrieve only their own saved requests and **active** loans; each loan identifies its asset and checkout time. Completed history is FR-11. | S1 |
| FR-05 | Let a CUSTODIAN list/retrieve department requests and active loans with borrower and asset identity needed to perform checkout. | S1 |
| FR-06 | Let a CUSTODIAN check out an eligible PENDING request; atomically fulfill it, create an active Loan and reflect the unit as unavailable; reject ineligible/conflicting checkout without partial writes. | S1 |
| FR-07 | Let a CUSTODIAN return an active Loan once, recording return time/receiving Custodian and recomputing availability from serviceability. | S2 |
| FR-08 | Starting in Sprint 2, record a due date at checkout, show it on authorized loan views and identify active overdue loans according to Q-03. Before enabling this behavior, migrate/backfill loans created in Sprint 1 under the agreed policy, preserving their owners, assets and original timestamps. Sprint 1 does not require due-date display or overdue calculation. | S2 |
| FR-09 | Let a CUSTODIAN create/update EquipmentModels and Assets and change serviceability while preserving unique asset identity and historical references. | S2 |
| FR-10 | Let authenticated users search the catalog by asset code/model name and filter by category/availability. Proposed query details: case-insensitive matching and empty-result feedback (Q-04). | S2 |
| FR-11 | Let BORROWERs retrieve only their own completed-loan history and CUSTODIANs retrieve department history with asset, checkout/due/return times and responsible Custodians. | S3 |
| FR-12 | Let a CUSTODIAN retrieve inventory totals by category/serviceability and available, active-loan and overdue counts, computed from persisted data at a consistent snapshot. | S3 |

## 5. Business Rules

| ID | Rule | Sprint |
|---|---|---|
| BR-01 | An Asset represents exactly one physical unit and has a nonblank unique code. Proposed refinements: trim/uppercase normalization, immutable codes and no reuse (D-09). | S1 identity; S2 editing |
| BR-02 | Available iff serviceability is SERVICEABLE and no active Loan exists. A Loan is active iff not returned. Request creation and checkout must recheck this rule; unsuitable or loaned assets are ineligible. Serviceability values are SERVICEABLE/MAINTENANCE/RETIRED. | S1; S2 return/admin |
| BR-03 | PENDING requests do not reserve assets. Different Borrowers may request the same unit; requests do not guarantee priority. Reject another PENDING request for the same Borrower/Asset pair, including concurrent submissions, with 409 DUPLICATE_PENDING_REQUEST. A fulfilled request does not prevent a later request when the Asset becomes available again (D-04; resolved Q-01). | S1 |
| BR-04 | At most one active Loan exists per Asset, including competing attempts. Checkout must be atomic and protected by database integrity safeguards. A losing transaction commits no Loan or request-state changes of its own; it does not undo changes committed by the winner. | S1 |
| BR-05 | Only a CUSTODIAN may check out an eligible PENDING request. Borrower/asset come from that request; one request creates at most one Loan and transitions PENDING → FULFILLED with checkout. No approval state; a fulfilled request cannot be checked out again. | S1 |
| BR-06 | Protected operations require a valid current identity for an active User. Backend-derived role and ownership govern access. BORROWERs cannot read another Borrower's requests/loans or mutate inventory/checkout/return; CUSTODIANs act only within the shared single-department scope. Invalid/expired/logged-out access is rejected. | S1; extend S2/S3 |
| BR-07 | Return applies to an active Loan once, with return time not before checkout. Return does not silently change serviceability; an unsuitable returned asset remains unavailable. | S2 |
| BR-08 | From S2, active loans exceeding their agreed due date are overdue; returned loans are not overdue. Proposed policy (Q-03): dueAt = checkedOutAt + 7×24 hours; overdue when server now > dueAt (equality not overdue), using UTC instants and Asia/Bangkok display. Proposed S1-loan backfill uses checkout + 7 days. Duration, boundary, display and backfill details await team agreement; no due/overdue logic is required in S1. | S2 |
| BR-09 | Preserve referenced equipment, request and loan history. Proposed policy (D-09): forbid hard deletion of referenced records; retire assets instead, including while loaned, preventing availability after return. | S1 references; S2 editing |
| BR-10 | Checkout fulfills the selected request; any further checkout is rejected while the Asset is unavailable (BR-02/BR-05). Other requests remain PENDING; they are not automatically cancelled, expired or fulfilled. After return, eligibility is rechecked before any subsequent checkout; no request is automatically fulfilled (D-05; resolved Q-02). | S1 policy/checkout; S2 return regression |
| BR-11 | Proposed summary semantics (Q-04): serviceability categories partition inventory totals. Available and active-loan counts need not partition total assets because unsuitable assets can still be loaned. Overdue is a subset of active loans. | S3 |

The selected request transitions PENDING → FULFILLED on checkout. A return updates the Loan, not the fulfilled request back to PENDING. Under the agreed Q-02 policy, competing requests remain PENDING; no cancellation, editing or automatic expiry workflow is included.

## 6. Non-Functional Requirements

Sprint 1 security and API conventions are settled in D-11. Provisional performance targets and later-sprint refinements still require agreement under Q-04.

| ID | Target | Verification | Sprint |
|---|---|---|---|
| NFR-01 | All protected operations reject unauthenticated access without private data; enforce role/owner checks on backend. Use 401 for a missing/invalid session, 403 for a forbidden role and the same 404 response for absent or foreign-owner detail (D-11). | API role/owner matrix including lists, counts, details and mutations | S1; repeat new endpoints S2/S3 |
| NFR-02 | Passwords use salted adaptive one-way hashes, never plaintext or reversible storage. Sessions enforce authenticated identity, expiry and logout invalidation. Passwords and credential hashes are absent from responses/logs; session secrets are delivered only through the approved protected channel and never logged. Cookie sessions use HttpOnly and Secure under deployed HTTPS. Use Argon2id password hashing and database-backed opaque sessions in HttpOnly, SameSite=Lax cookies, with an eight-hour absolute lifetime. Validate exact Origin and session-bound CSRF tokens on protected mutations; detailed parameters are maintained in the F-01 contract (D-11). | Credential-storage inspection; login/expiry/logout replay tests; response, cookie and log inspection against the approved F-01 contract | S1; regression S3 |
| NFR-03 | Saved request/Loan survives app restart/DB reconnect. Empty isolated DB applies committed migrations/seed without manual SQL; repeated seed creates no duplicate fixtures and preserves existing transactions. | Fresh DB setup, seed twice, save/restart/retrieve integration checks | S1; repeat changed setup S2/S3 |
| NFR-04 | Given two authorized valid competing pending requests for one serviceable unloaned Asset, synchronized independent DB transactions yield exactly one checkout success, one conflict and one active Loan. Injected mid-transaction failure leaves no partial writes. Checkout conflicts return 409 (D-11). | Real PostgreSQL race and rollback tests; direct exclusivity constraint check | S1 |
| NFR-05 | Proposed local smoke target: 100 assets/500 historical loans, two concurrent authenticated readers, 100 measured requests per catalog/active-loan endpoint after 10 warm-ups; p95 ≤1,000 ms excluding login, with zero unexpected errors. Record hardware, data, timings and every failure. Target pending Q-04; no production SLA implied. | Repeatable local load run with recorded environment and results | S3 |
| NFR-06 | Critical journey at 360px and 1280px: controls operable by keyboard with labels/visible focus, no horizontal page overflow/clipped primary actions, explicit loading/empty/validation/error states. Evaluate all later screens at final hardening. | Selected Playwright journeys and manual responsive/keyboard checklist | S1 critical journey; S3 all screens |
| NFR-07 | The system supports Docker packaging and durable GCP storage. Required failed build/test checks block release; repeatable accepted-release deployment preserves saved data across redeployment. Images contain no embedded secrets. | SDS review; later CI failed-check, clean-build and GCP persistence evidence | S1 design; Lab 5 during S2 delivery; S3 regression |
| NFR-08 | Invalid input/unavailable resources/backend failure produce a documented safe error, never raw SQL/stack traces/credentials or a false success; denied/failed mutations leave no partial state. UI gives a recovery path and does not auto-repeat uncertain borrowing writes. | API invalid-input/failure injection plus UI recovery checks; DB state assertions | S1; repeat new workflows S2/S3 |
| NFR-09 | A fresh checkout can install pinned dependencies and run the documented build and automated tests without undocumented setup. Domain rules and access-control decisions can be tested independently of the browser UI; regression tests cover implemented requirement outcomes, including invalid and unauthorized operations. | Independent clean-checkout setup/build/test run; inspect rule/access-control tests and requirement coverage | S1; each increment S2/S3 |

## 7. Main System Workflows

| Workflow | Actor / increment | Outcome and exception |
|---|---|---|
| UC-01 Authenticate | Both / S1 | Valid seeded User signs in, retrieves identity, signs out; invalid/inactive credentials or invalid session rejected |
| UC-02 Discover equipment | Both / S1 | Read persisted model/unit and availability; no browser-only stock or reservation implied |
| UC-03 Submit request | BORROWER / S1 | Submit available asset; saved PENDING request linked to authenticated owner; unavailable/forged-owner input rejected |
| UC-04 Retrieve own requests | BORROWER / S1 | Reopen saved request after refresh/reconnect; foreign records and counts withheld |
| UC-05 Checkout | CUSTODIAN / S1 | Select eligible request, atomically fulfill/create active Loan; unavailable/repeated/concurrent losing attempt rejected |
| UC-06 Retrieve active loans | BORROWER (own), CUSTODIAN (department) / S1 | Retrieve real saved checkout result; Borrower cannot perform checkout or read foreign Loan |
| UC-07 Return and overdue | CUSTODIAN records; BORROWER views own state / S2 | Return once, availability respects serviceability; show agreed due/overdue result; invalid repeat return rejected |
| UC-08 Maintain and search inventory | CUSTODIAN edits; both search / S2 | Persist model/unit changes and search results; duplicate code/unauthorized edit rejected |
| UC-09 History and reporting | BORROWER own history; CUSTODIAN department history/summaries / S3 | Accurate saved history and reconciled snapshot counts; unauthorized reports/history withheld |

## 8. Assumptions and Design Decisions

This section separates scenario assumptions from agreed product decisions and refinements deferred to later sprints. Sprint 1 decisions below define the required behavior; successful implementation or testing is evidence of conformance, not a substitute for release acceptance.

### Assumptions

These assumptions define the course-project scenario and the conditions under which the system is used. They are not findings about actual KMUTT operations or claims that every operational condition has been tested. The technical and business choices made in response are recorded separately as design decisions below.

| ID | Assumption | Effect on scope or verification |
|---|---|---|
| A-01 | The hypothetical department needs a shared record of equipment availability, current holders and lending transactions. The scenario assumes disconnected records can make these tasks difficult. | Motivates the catalog and lending workflow; does not assert a measured problem in the real department. |
| A-02 | Synthetic users, equipment and transactions are sufficient to demonstrate the course requirements. | Verification uses synthetic fixtures; no real student information, university accounts or inventory integration is required. |
| A-03 | Accounts and their Borrower or Custodian roles are provisioned before use. Seeded accounts are sufficient for the demonstration. | Public registration, password recovery, role-management screens and external identity verification are outside scope. Authorization must still be checked on every protected operation. |
| A-04 | The service represents one department, and its Custodians are authorized to manage the same inventory and lending records. | No department assignment, tenant isolation or separate Custodian approval hierarchy is required. Borrower ownership restrictions still apply. |
| A-05 | Each recorded Asset corresponds to one identifiable physical unit. Custodians enter checkout and, from S2, return and serviceability information to reflect actual equipment handling. | The application validates recorded transitions but cannot independently confirm physical possession or condition; scanning hardware and automated physical tracking are outside scope. |
| A-06 | Users have a supported browser and a connection to the application, and the configured PostgreSQL service is available for successful operations. | The workflow requires online API/database access; offline lending and later synchronization are outside scope. Connection failures must produce an explicit error or uncertain outcome rather than a false success. |
| A-07 | The application server's clock is correctly configured. | Server-generated timestamps are authoritative for sessions and lending events; clients cannot choose them. The S2 due-date and timezone policy still requires the Q-03 decision. |

### Agreed design decisions

| ID | Decision | Rationale / consequence | Scope / status |
|---|---|---|---|
| D-01 | Use a single-department service with synthetic data and shared Custodian authority. | Keeps the course scenario bounded without real university integrations or tenant administration. | Agreed; all sprints |
| D-02 | Model an EquipmentModel separately from its individual physical Assets; each Asset has a unique code. | Requests and Loans identify an accountable physical unit rather than a model quantity. | Agreed; S1 foundation |
| D-03 | Use BORROWER and CUSTODIAN roles, enforced by the backend together with record ownership. | Borrowers see only their own protected records; Custodians perform department checkout and later privileged operations. Hidden UI controls do not grant or enforce permission. | Agreed; S1, extended in S2/S3 |
| D-04 | PENDING requests do not reserve equipment or establish priority. Different Borrowers may request the same available Asset. Reject a second PENDING request for the same Borrower/Asset pair, including concurrent submissions. | Prevents accidental duplicates while preserving non-reserving requests. Enforce the pending-pair rule transactionally and with a partial unique database index. A later request is permitted after fulfillment if the Asset is available again. | Agreed; Q-01 resolved; S1 |
| D-05 | Custodian checkout is the borrowing authorization step; there is no separate approval state. Fulfill only the selected request and leave competing requests PENDING. | Checkout atomically creates one active Loan and makes the Asset unavailable. Competitors gain no priority and are not automatically cancelled, expired or fulfilled. After return, eligibility must be checked again. | Agreed; Q-02 resolved; S1 policy, S2 return regression |
| D-06 | Use a modular monolith with React/TypeScript/Vite, Express/TypeScript, PostgreSQL/Prisma and npm workspaces. Use Vitest, Supertest and Testing Library for automated checks, plus Playwright-driven browser verification. | Supports one integrated UI → API → database workflow with independently testable modules. Browser verification does not imply a repository-native E2E suite. Detailed architecture belongs in the SDS. | Agreed architecture and verification approach |
| D-07 | Use the BorrowBase identity and Indigo #4F46E5, Sky Blue #87CEFA, Slate #475569 and Off-White #F8FAFC palette. | Provides consistent visual direction; labels, contrast, keyboard operation and responsive behavior still require verification. | Agreed design direction |
| D-08 | Retain F-01–F-10 as the product feature allocation, with SYS-01/02 supporting database and delivery quality. | Preserves traceability across requirements, engineering contracts and the three-sprint plan. | Agreed; existing allocation retained |
| D-09 | Use SERVICEABLE, MAINTENANCE and RETIRED serviceability states. Compute availability as SERVICEABLE with no active Loan; preserve referenced request, Asset and Loan relationships. | Availability is derived, not a separately editable status or stock counter. Database constraints protect historical references. Asset-code editing and retirement refinements remain listed under Q-04. | Agreed S1 foundation; S2 refinements deferred |
| D-10 | Introduce returns and due/overdue behavior in S2, followed by completed history and summaries in S3. | S1 checkout creates real Loans without speculative due dates. The S2 policy and safe backfill must be agreed before enabling due-date behavior for existing Loans. | Agreed sprint boundary; Q-03 policy remains open |
| D-11 | Use Argon2id password hashes, database-backed opaque sessions, an eight-hour absolute session lifetime and HttpOnly/SameSite=Lax cookies, with Secure under deployed HTTPS. Enforce exact Origin and session-bound CSRF checks on protected mutations. Use 401 for invalid authentication, 403 for forbidden access, 404 for missing/foreign-owner detail and 409 for domain conflicts. | Gives F-01–F-04 consistent security and error behavior without revealing private records. Parameter values and response schemas belong in the feature contracts. | Agreed S1 security/API conventions; this part of Q-04 is resolved |
| D-12 | Serialize request creation and checkout on the physical Asset row. Checkout rechecks eligibility and atomically fulfills the request and creates exactly one active Loan. | Shared Asset-first locking and database uniqueness safeguards prevent competing checkouts; failures leave no partial writes. | Agreed; S1 |

### Resolved questions and deferred refinements

Q-01 and Q-02 are retained as identifiers for existing cross-references, not as outstanding Sprint 1 approval gates. Q-04 is partially resolved: the Sprint 1 serviceability, security and HTTP conventions above are settled; the remaining items concern later-sprint behavior and targets.

| ID | Resolution or remaining decision | Status / resolution point |
|---|---|---|
| Q-01 | Reject repeat/concurrent PENDING requests for the same Borrower/Asset pair; allow different Borrowers to request the same available Asset. See D-04 and BR-03. | Resolved for S1 |
| Q-02 | Keep competing requests PENDING after checkout, without automatic fulfillment, cancellation, expiry or priority. Recheck eligibility before a later checkout. See D-05 and BR-10. | Resolved for S1; retain in S2 return regression |
| Q-03 | Confirm the proposed seven-day due period, overdue boundary, display timezone and backfill of S1 Loans. | Open; agree before F-06/S2 migration. No due/overdue behavior is required in S1. |
| Q-04 | Confirm asset-code normalization/immutability/reuse rules, retirement while loaned, search matching, summary semantics and numerical performance targets. S1 serviceability, security and HTTP conventions are settled in D-09/D-11. | Partially resolved; agree remaining items before their S2/S3 contracts and verification. |
| Q-05 | Confirm deployment constraints and resource access supplied through Lab 5. | Deferred to the team and lecturer/TA before finalizing deployment configuration; does not reopen settled S1 domain policies. |

Related documents: [feature inventory](features.md) and [requirements traceability](traceability.md).
