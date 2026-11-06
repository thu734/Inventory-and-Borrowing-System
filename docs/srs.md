# BorrowBase — Software Requirements Specification

## 1. Introduction and System Context

BorrowBase is the CPE Equipment Inventory and Borrowing Management System for a hypothetical KMUTT Computer Engineering Department lending service. This specification defines the whole product across three sprints for development, design review and verification.

Scenario assumption: disconnected lending records make it difficult to identify available units, current holders, pending requests and overdue loans. This is not a finding about actual KMUTT operations. BorrowBase provides a persistent, access-controlled record of equipment and lending. Examples include lab laptops, ESP32/Arduino boards, Raspberry Pi kits, FPGA boards and oscilloscopes. Accounts and inventory data are synthetic.

The system boundary is browser UI → backend/application layer → persistent database. The backend controls identity, permissions and domain transitions. Product goals are reliable equipment discovery, exclusive checkout, traceable returns/history and accurate inventory summaries. Success is demonstrated by retrieving saved outcomes and rejecting invalid, conflicting or unauthorized operations without partial updates or private-data disclosure.

### References

- CPE 334 Group Work Specification, supplied `group_work_specs_v1.pdf`, §§5–8 and Theme 2, page 5.
- CPE 334 Project Deliverable 1, supplied `project_deliverable_1_v1.pdf`, §§3.1–3.2.
- BorrowBase project and implementation plan: scope, stack and responsibilities.

## 2. Stakeholders and Actors

The application has two actors: Borrower and Custodian.

| Actor | Responsibilities | Access boundary |
|---|---|---|
| BORROWER | Authenticate, discover equipment, request a unit, inspect own requests/active loans; later inspect completed history and return status | Own protected records only; cannot perform checkout, record return, maintain inventory or read department reports |
| CUSTODIAN | Authenticate, inspect department requests/loans, authorize checkout, later record return, maintain inventory and inspect summaries | All inventory/loans in the single hypothetical department; no multiple-department assignment model |

The department is a stakeholder seeking accurate availability, equipment accountability and inventory/overdue summaries. It is not an additional application role.

An **EquipmentModel** describes equipment and may have many **Assets**. An Asset is one physical unit with a unique code. A **BorrowRequest** records intent without reservation; a **Loan** records actual checkout. An active Loan has not been returned. A **User** has one of the two application roles.

Proposed serviceability values are **SERVICEABLE**, **MAINTENANCE** and **RETIRED**. **AVAILABLE/UNAVAILABLE** are computed borrowing availability, not serviceability or request states. Request lifecycle states are **PENDING/FULFILLED**; proposed competitor behavior remains Q-02.

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
| BR-02 | Available iff serviceability is SERVICEABLE and no active Loan exists. A Loan is active iff not returned. Request creation and checkout must recheck this rule; unsuitable or loaned assets are ineligible. Proposed serviceability values: SERVICEABLE/MAINTENANCE/RETIRED. | S1; S2 return/admin |
| BR-03 | PENDING requests do not reserve assets. Different Borrowers may request the same unit; requests do not guarantee priority. Proposed Q-01: reject another PENDING request for the same Borrower/Asset pair, including concurrent submissions; team agreement pending. | S1 |
| BR-04 | At most one active Loan exists per Asset, including competing attempts. Checkout must be atomic and protected by database integrity safeguards. A losing transaction commits no Loan or request-state changes of its own; it does not undo changes committed by the winner. | S1 |
| BR-05 | Only a CUSTODIAN may check out an eligible PENDING request. Borrower/asset come from that request; one request creates at most one Loan and transitions PENDING → FULFILLED with checkout. No approval state; a fulfilled request cannot be checked out again. | S1 |
| BR-06 | Protected operations require a valid current identity for an active User. Backend-derived role and ownership govern access. BORROWERs cannot read another Borrower's requests/loans or mutate inventory/checkout/return; CUSTODIANs act only within the shared single-department scope. Invalid/expired/logged-out access is rejected. | S1; extend S2/S3 |
| BR-07 | Return applies to an active Loan once, with return time not before checkout. Return does not silently change serviceability; an unsuitable returned asset remains unavailable. | S2 |
| BR-08 | From S2, active loans exceeding their agreed due date are overdue; returned loans are not overdue. Proposed policy (Q-03): dueAt = checkedOutAt + 7×24 hours; overdue when server now > dueAt (equality not overdue), using UTC instants and Asia/Bangkok display. Proposed S1-loan backfill uses checkout + 7 days. Duration, boundary, display and backfill details await team agreement; no due/overdue logic is required in S1. | S2 |
| BR-09 | Preserve referenced equipment, request and loan history. Proposed policy (D-09): forbid hard deletion of referenced records; retire assets instead, including while loaned, preventing availability after return. | S1 references; S2 editing |
| BR-10 | Checkout fulfills the selected request; any further checkout is rejected while the Asset is unavailable (BR-02/BR-05). Proposed competitor policy (Q-02): other requests remain PENDING; after return, eligibility is rechecked and no request is automatically fulfilled. Retaining competitors PENDING awaits team agreement. | S1 policy/checkout; S2 return regression |
| BR-11 | Proposed summary semantics (Q-04): serviceability categories partition inventory totals. Available and active-loan counts need not partition total assets because unsuitable assets can still be loaned. Overdue is a subset of active loans. | S3 |

The selected request transitions PENDING → FULFILLED on checkout. A return updates the Loan, not the fulfilled request back to PENDING. Under proposed Q-02, competing requests remain PENDING; no cancellation, editing or automatic expiry workflow is included.

## 6. Non-Functional Requirements

Proposed numerical targets and implementation mechanisms require agreement under Q-04.

| ID | Target | Verification | Sprint |
|---|---|---|---|
| NFR-01 | All protected operations reject unauthenticated access without private data; enforce role/owner checks on backend. Proposed status convention (Q-04): 401 missing/invalid session, 403 wrong role, 404 absent/foreign owner detail. | API role/owner matrix including lists, counts, details and mutations | S1; repeat new endpoints S2/S3 |
| NFR-02 | Passwords use salted adaptive one-way hashes, never plaintext or reversible storage. Sessions enforce authenticated identity, expiry and logout invalidation. Passwords and credential hashes are absent from responses/logs; session secrets are delivered only through the approved protected channel and never logged. Cookie sessions use HttpOnly and Secure under deployed HTTPS. Algorithm/cost, session mechanism and applicable CSRF protection remain for F-01 contract approval (Q-04). | Credential-storage inspection; login/expiry/logout replay tests; response, cookie and log inspection against the approved F-01 contract | S1; regression S3 |
| NFR-03 | Saved request/Loan survives app restart/DB reconnect. Empty isolated DB applies committed migrations/seed without manual SQL; repeated seed creates no duplicate fixtures and preserves existing transactions. | Fresh DB setup, seed twice, save/restart/retrieve integration checks | S1; repeat changed setup S2/S3 |
| NFR-04 | Given two authorized valid competing pending requests for one serviceable unloaned Asset, synchronized independent DB transactions yield exactly one checkout success, one conflict and one active Loan. Injected mid-transaction failure leaves no partial writes. Proposed conflict status: 409 (Q-04). | Real PostgreSQL race and rollback tests; direct exclusivity constraint check | S1 |
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

## 8. Assumptions, Decisions and Open Questions

Seeded synthetic accounts are sufficient. All Custodians share authority over one department. Server identity/time are authoritative. Proposed details below require team agreement; no Member 2 approval is implied.

### Decisions

| ID | Decision | Rationale / impact | Status |
|---|---|---|---|
| D-01 | Hypothetical single-department service with synthetic data; all Custodians share inventory | Bounded authorization scope; no real KMUTT integration | Agreed |
| D-02 | EquipmentModel → many individual Assets with unique codes | Physical-unit accountability; no stock quantity field | Agreed |
| D-03 | BORROWER/CUSTODIAN; backend role and owner enforcement | Protect private records and privileged mutations | Agreed |
| D-04 | PENDING does not reserve; multiple Borrowers may request one Asset | Checkout is the authoritative exclusive transition | Agreed; duplicate policy Q-01 open |
| D-05 | Custodian checkout authorizes borrowing; no separate approval. Prefer retaining competitors PENDING (Q-02). | Small exclusive-lending workflow; retained requests can be temporarily ineligible. | Checkout agreed; competitor outcome proposed (Q-02) |
| D-06 | Modular monolith; React/TypeScript/Vite, Express/TypeScript, PostgreSQL/Prisma; Vitest/Supertest/Playwright; npm workspaces | Consistent full-stack development and verification; detailed design belongs in SDS. | Agreed |
| D-07 | BorrowBase; Indigo #4F46E5, Sky Blue #87CEFA, Slate #475569, Off-White #F8FAFC | Visual direction; later UI choices must still meet accessibility checks. | Agreed design direction |
| D-08 | F-01–F-10 cover the product; SYS-01/02 support database and delivery quality | Stable allocation across requirements, features and traceability. | Existing allocation retained |
| D-09 | Normalized immutable codes; serviceability names; retirement/history protection; simple queries/report projection | Make rules testable without adding workflows; cost is editing/report policy constraints | Proposed; affected contracts require agreement |
| D-10 | Seven-day due policy/backfill and proportional numerical NFR targets; detailed session/hashing/HTTP mechanisms reserved for approved contracts | Concrete verification targets without prematurely fixing implementation mechanisms. | Proposed; Q-03/Q-04 open |

### Open questions

| ID | Question / recommendation | Resolution point |
|---|---|---|
| Q-01 | Reject repeat/concurrent PENDING requests for the same Borrower/Asset? Recommended to reduce accidental duplicates while permitting other Borrowers. | Both students before F-03; Member 2 agrees any DB safeguard. |
| Q-02 | Keep competing requests PENDING after checkout? Recommended for the simpler state model; pending does not imply eligibility and can remain indefinitely. Closing as UNAVAILABLE adds a state and re-request behavior. | Both students before F-03/F-04; team agreement pending. |
| Q-03 | Confirm the proposed seven-day due policy, timezone/boundary rules and S2 backfill of S1 loans. | Both students before F-06/S2 migration; not a prerequisite for unrelated S1 behavior. |
| Q-04 | Agree D-09 refinements, security/HTTP mechanisms and provisional quality targets; align with the SDS and feature contracts. | Both students before the affected contract; performance target before S3 verification. |
| Q-05 | Confirm deployment constraints and resource access supplied through Lab 5. | Team with lecturer/TA before finalizing deployment configuration. |

Related documents: [feature inventory](features.md) and [requirements traceability](traceability.md).
