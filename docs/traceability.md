# BorrowBase — Requirements Traceability

This matrix maps every requirement in the [SRS](srs.md) to the [feature inventory](features.md), planned increment and verification approach. **Planned** means allocated, not executed. **Proposed** identifies a policy/target awaiting agreement. V-01–V-32 are verification references; detailed acceptance criteria and test cases belong in feature contracts and the Software Test Specification.

| Requirement | Feature / responsibility | Sprint | Verification approach / reference | Status |
|---|---|---|---|---|
| FR-01 | F-01; SYS-01 support | S1 | V-01: valid/invalid/inactive login; identity; expiry/logout replay; invalid access denied (Unit, real API/DB, selected UI/E2E) | Planned |
| FR-02 | F-02; SYS-01 support | S1 | V-02: seeded detail/list matches model/unit and derived availability; visible states (Real API/DB, UI) | Planned |
| FR-03 | F-03; SYS-01 support | S1 | V-03: available unit saves authenticated owner/id/status; unavailable/forged input fails with zero write (Unit, real API/DB, UI) | Planned; Q-01 |
| FR-04 | F-03 Borrower retrieval; F-04 Loan creation; SYS-01 support | S1 | V-04: saved request/active Loan retrievable after reconnect; foreign list/detail/count withheld (Real API/DB, integrated E2E) | Planned; Member 6 owns retrieval; Member 2 supplies checkout-created Loan |
| FR-05 | F-04 | S1 | V-05: Custodian sees department request/loan/borrower/asset; Borrower denied (Real API/DB, UI) | Planned |
| FR-06 | F-04; SYS-01 support | S1 | V-06: selected request fulfilled + Loan + unavailable asset; invalid/repeated checkout rejected atomically (Real API/DB, integrated E2E) | Planned; Q-02 |
| FR-07 | F-05 | S2 | V-07: recorded return/time/receiver, correct serviceability-dependent availability; repeat rejected (Unit, real API/DB, UI) | Planned |
| FR-08 | F-06 | S2 only | V-08: S2 migration/backfill of S1 loans preserves original records; then due display and pre/equal/post boundary, returned Loan not overdue (Unit clock, real API/DB/migration, UI) | Planned; Q-03 before S2 upgrade |
| FR-09 | F-07 | S2 | V-09: model/unit create/update and serviceability persist; duplicate code/reference damage/unauthorized edit rejected (Real API/DB, UI) | Planned; D-09 details |
| FR-10 | F-08 | S2 | V-10: query combinations, matching/empty result and invalid input behave as agreed (API/DB, UI) | Planned; query refinement Q-04 |
| FR-11 | F-09 | S3 | V-11: completed fields and responsible actors correct; owner/Custodian scopes enforced (Real API/DB, UI) | Planned; distinct from S1 FR-04 |
| FR-12 | F-10 | S3 | V-12: counts match persisted mixed-state fixture at consistent snapshot; unauthorized report rejected (Real API/DB) | Planned; report projection Q-04 |
| BR-01 | F-02, F-07, SYS-01 | S1 identity; S2 edit | V-13: duplicate/blank code rejected; agreed normalization/immutability preserved (DB constraint, API) | Planned; refinement D-09 |
| BR-02 | F-02, F-03, F-04, F-05, F-07 | S1; S2 return/admin | V-14: state matrix; request/checkout refuse unsuitable/loaned unit; return recomputes correctly (Unit, real API/DB) | Planned; state names D-09 |
| BR-03 | F-03, F-04 | S1 | V-15: different Borrowers both PENDING/no reservation; if Q-01 approved, repeat/concurrent same-Borrower request is rejected without extra row (Real API/DB; concurrency for proposed duplicate safeguard) | Planned; duplicate restriction proposed (Q-01) |
| BR-04 | F-04, SYS-01 | S1 | V-16: independent checkouts produce one active Loan; loser/injected failure commits no partial state; direct DB safeguard (Real DB concurrency/rollback) | Planned |
| BR-05 | F-04, SYS-01 | S1 | V-17: PENDING→FULFILLED once; server takes asset/borrower from request; repeat/forgery rejected (Unit, real API/DB) | Planned |
| BR-06 | F-01, F-03, F-04, F-05, F-07, F-09, F-10 | S1; extend S2/S3 | V-18: active identity/session required; lists/counts/details/mutations respect complete role/owner matrix (Unit, real API/DB, selected E2E) | Planned; technical realization Q-04 |
| BR-07 | F-05, SYS-01 | S2 | V-19: double/concurrent return rejected, return time not before checkout, serviceability unchanged (Unit, real API/DB) | Planned |
| BR-08 | F-06 | S2 | V-20: active past-due loans are overdue; returned loans are not. Verify duration/boundary/display and S1-loan backfill against the agreed Q-03 policy (Unit clock, real DB migration) | Planned outcome; policy details proposed (Q-03) |
| BR-09 | F-05, F-07, SYS-01 | S1 references; S2 edit | V-21: referenced deletes rejected per agreed policy; retire while loaned then return stays unavailable (DB constraint, API) | Planned; realization D-09 |
| BR-10 | F-04 | S1; S2 return regression | V-22: selected request fulfilled and further checkout rejected while unavailable; if Q-02 approved, competitors stay PENDING and are rechecked after return without automatic fulfillment (Real API/DB/rollback) | Planned checkout constraints; competitor policy proposed (Q-02) |
| BR-11 | F-10 | S3 | V-23: unsuitable-but-loaned fixture avoids false partition; overdue subset of active (Unit aggregation, real API/DB) | Proposed; Q-04 |
| NFR-01 | F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-09, F-10 | S1; extend S2/S3 | V-24: every introduced protected operation checked for anonymous/role/owner leakage and expected status (Real API/DB matrix) | Planned; status realization Q-04 |
| NFR-02 | F-01 | S1; S3 regression | V-25: verify credential storage, identity, expiry/logout replay and response/log secrecy against the approved session mechanism (Contract review, unit, real API/DB, security inspection) | Planned; mechanism subject to F-01 approval |
| NFR-03 | F-03, F-04, SYS-01 | S1; repeat changed setup S2/S3 | V-26: fresh migrate/seed twice; saved request/Loan after restart/reconnect; transactions preserved (Real DB/setup/restart) | Planned; SYS-01 dependency explicit |
| NFR-04 | F-04, SYS-01 | S1 | V-27: two authorized independent competing transactions, one success/conflict; no partial failed writes (Real PostgreSQL concurrency/fault injection) | Planned; exact setup/response in F-04 contract |
| NFR-05 | F-02, F-04, SYS-02 | S3 | V-28: documented local hardware, 100 assets/500 loans, two readers and timing/error output versus NFR-05's provisional target; no unexpected errors (Repeatable local load verification) | Proposed; Q-04 |
| NFR-06 | F-01, F-02, F-03, F-04, SYS-02 | S1 critical journey; S3 all screens via SYS-02 | V-29: 360/1280 widths, keyboard labels/focus, no overflow/clipped actions, named UI states (Selected Playwright + manual) | Proposed targets; Q-04 |
| NFR-07 | SYS-02 | S1 design; Lab 5 during S2; S3 regression | V-30: design review, clean image, failed required check blocks, accepted-main deployment retains data (SDS review; later CI/container/GCP) | Planned; cloud instructions pending |
| NFR-08 | F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-09, F-10, SYS-02 | S1; extend S2/S3 | V-31: validation/unavailable/backend fault → safe failure, no leak/false success/partial writes; uncertain POST not automatically retried (API/DB fault injection, component/E2E) | Planned target; exact UX/errors in contracts |
| NFR-09 | F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-09, F-10, SYS-01, SYS-02 | S1; every increment S2/S3 | V-32: reproduce documented install/build/tests from a fresh checkout; inspect independently testable domain/access-control logic and regression coverage for valid/invalid/unauthorized outcomes (Setup reproduction, test inspection) | Planned |

## Coverage and open items

All **12 FRs, 11 BRs and 9 NFRs** are allocated: **32 requirements, 32 verification references, no unmapped IDs**. Each of F-01–F-10 has requirements, dependencies and a sprint. SYS-01/02 cover cross-cutting foundations and delivery quality. NFR-01/08/09 span features; the explicit links above define that coverage.

Q-01–Q-04 remain open policy/target decisions in the SRS. Q-05 concerns deployment prerequisites. Resolve the relevant question before its dependent contract or verification. No executed tests or completed acceptance criteria are asserted here.

S1 feature contracts will elaborate AC-to-test mappings before implementation. S2/S3 verification details are intentionally deferred to their contracts; Lab 5 deployment verification remains scheduled during S2. These are planned allocations, not uncovered requirements.
