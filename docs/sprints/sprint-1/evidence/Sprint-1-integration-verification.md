# Sprint 1 integrated verification — November 12, 2026

Tested branch: `sprint1-staging`. Tested commit: `3710af0913d1638a9f185cfe4f8e91e4e2a5e3ed`.

**Outcome:** Automated checks and the real Borrower → Custodian → PostgreSQL workflow passed. Release acceptance remains incomplete: the catalog retains stale availability immediately after checkout, policy approval is unresolved, and release documentation needs reconciliation. No application, schema, migration or test source was changed.

## Safe Git and environment verification

- `git fetch origin` succeeded with authorized access after the sandbox initially denied writing `FETCH_HEAD`. Local HEAD and fetched `origin/sprint1-staging` both equal the tested commit. Incoming path changes: none; no update or collision handling was necessary.
- Merge history contains PR #18 (`3eb5945`, Three-Sprint Plan), #20 (`c86a21f`, F-02), and #21 (`3710af0`, F-04). Integrated implementations are mounted by `backend/src/server.ts`; frontend contains catalog, Borrower and Custodian workspaces.
- Existing modified `F-03-verification.md` and prior untracked evidence were preserved. Other worktrees were only listed. No commit, push, reset, rebase, forced checkout, deletion, main merge or PR action occurred.
- Node `24.14.0`, npm `11.9.0`. Root and backend configuration target the same local PostgreSQL `borrowbase_sys01_local` on localhost:5432. Seeded Borrower/Custodian are active and both original Assets exist. All three environment files match the SHA-256 fingerprints taken before verification; no configuration or credentials were printed or changed.
- Both committed migrations (`20261107043000_init`, `20261107070000_f03_pending_request_uniqueness`) were already applied. `npx --no-install prisma migrate status` confirms the development database is current. No development migrations or seeding were necessary. Final SQL evidence confirms both partial unique indexes.
- No app server was running initially. Started `npm run dev`, then gracefully stopped only that run's backend PID with SIGTERM and started `npm run dev -w backend`. Frontend remains at `http://localhost:5173`, backend at `http://localhost:3000`.

## Automated execution

Logs: [`artifacts/verification/sprint-1/local-20261112/`](../../../../artifacts/verification/sprint-1/local-20261112/).

| Exact command | Result | Log |
|---|---|---|
| `npm run test:unit` | 20 passed | `unit.log` |
| `npm run test -w backend -- tests/auth.api.test.ts tests/f02.api.test.ts tests/f03.contract.red.test.ts tests/f04.api.test.ts` | 41 passed on authorized rerun | `api-approved.log` |
| `npm run test:ui` | 37 passed | `ui.log` |
| `npm run test -w backend -- tests/auth.postgres.test.ts` | 5 passed | `f01-postgres.log` |
| `npm run test:db` | 5 passed | `foundation.log` |
| `npm run test -w backend -- tests/f03.postgres.test.ts` | 31 passed | `f03-postgres.log` |
| `npm run test -w backend -- tests/f02.postgres.test.ts tests/f04.postgres.test.ts` | 20 passed: F-02 9, F-04 11 | `f02-f04-postgres.log` |
| `npm run typecheck` | Backend/frontend passed | `typecheck.log` |
| `npm run build` | Backend/frontend passed | `build.log` |
| `git diff --check` | Passed | Final tool output |

Successful suite totals: **159 unique tests passed, 0 failed, 0 skipped**. All commands in the table exited 0. This total excludes temporary browser verification and does not double-count tests. `npm test` was not used because the PostgreSQL suites enforce incompatible database-name guards.

The initial sandboxed API invocation failed (35 failed, 6 skipped) because Supertest could not bind `127.0.0.1` (`listen EPERM`); retained in `api.log`. Its authorized rerun passed all 41. Initial sandboxed PostgreSQL connectivity was also denied; authorized connectivity succeeded. Initial browser launch could not find Playwright's matching bundled executable; the successful run used installed Google Chrome in headless mode. A final read-only evidence query initially used an invalid Prisma one-to-one relation projection; the corrected query succeeded. These setup/tooling failures are not omitted or counted as successful tests.

Three newly created disposable databases were confirmed absent before creation; no existing test database was reused, reset or dropped:

| Database | Preparation and suites |
|---|---|
| `borrowbase_sys01_verify_20261112` | `npm run db:migrate`, `npm run db:seed`, F-01 PostgreSQL and foundation suites, sequentially |
| `borrowbase_sys01_f03_verify_20261112` | `npm run db:migrate`, F-03 PostgreSQL |
| `borrowbase_sys01_f02_test` | `npm run db:migrate`, F-02 and F-04 PostgreSQL |

Each child test process received its explicit localhost test URL and `SYS01_TEST_DATABASE=true`; no URL was printed. Synthetic seed credentials required by F-01 were set only in that disposable child environment. Existing `.env.test` and its database were preserved. Migration/seed logs are saved beside suite logs. Tests perform their existing fixture cleanup only in these isolated databases; no reset/drop operation was run. The three databases remain present.

## Real browser and database acceptance

Actual Chrome pages used the running Vite/Express application and real development PostgreSQL, without mocked responses. Separate browser contexts represented two Borrowers and the seeded Custodian. Browser API probes used same-origin `fetch`, session cookies and bootstrapped CSRF tokens; security/conflict probes below are API operations from real browser sessions, not UI buttons exposed to forbidden roles.

New retained synthetic fixtures: Asset `S1-VERIFY-80035c90`, model and second Borrower (identifiers in `fixture-ids.json`). No existing domain record was reset or deleted. The original F-03 request `20deb6fc-57c7-4f6c-b7c7-d40b439340b0` remains PENDING with no Loan; original BB-LAP-001 remains unloaned.

| Requested check | Status and observed evidence |
|---|---|
| 1. Borrower login/current identity | PASS — seeded Borrower UI login; `/auth/me` returns correct identity/role. |
| 2. Real Asset catalog | PASS — both original Assets and new synthetic Asset displayed; API agrees. |
| 3. Asset details/availability | PASS — selected Asset UUID, model/category, SERVICEABLE and available agree with PostgreSQL. |
| 4. Create F-03 request | PASS — catalog selection opens request form; UI submission returns 201/PENDING. |
| 5. PENDING after refresh | PASS — saved detail survives real page reload and PostgreSQL inspection. |
| 6. Pending does not reserve | PASS — Asset remains available, zero Loans; second Borrower can create a competing request. |
| 7. Custodian sees pending request | PASS — seeded Custodian UI login; selected request visible in real queue. |
| 8. Checkout | PASS — Checkout → Confirm checkout returns 201 and success panel. |
| 9. FULFILLED | PASS — persisted selected request has status FULFILLED and fulfilledAt. |
| 10. One active Loan | PASS — one matching Loan, correct Borrower/Asset/request/Custodian, returnedAt null. |
| 11. Asset unavailable | PASS for persisted/API state and catalog after explicit Refresh Equipment. FAIL for immediate catalog freshness: checkout leaves the existing catalog card displaying Available. |
| 12. Borrower active Loan | PASS — My Active Loans displays the newly checked-out equipment. |
| 13. Duplicate/unavailable checkout | PASS — browser API probes return 409 REQUEST_NOT_PENDING and ASSET_UNAVAILABLE; before/after request rows identical and total Loan count remains one. |
| 14. Borrower Custodian operation denial | PASS — real queue GET and checkout POST return 403. |
| 15. Cross Borrower isolation | PASS — second Borrower receives 404 NOT_FOUND for first Borrower's request and Loan detail. |
| 16. Backend restart persistence | PASS — graceful backend stop/start; browser sessions restore; fulfilled request, competing PENDING request and exactly one active Loan persist. |
| 17. Loading/empty/error/responsive | PASS for sampled checks: real second Borrower empty requests, actual catalog API request delayed 1500ms showing loading, real backend outage showing safe error, explicit refresh recovery; Borrower/Custodian widths 360/390/768/1280 all without horizontal overflow. Focus/Enter on My Requests opens its view. Full keyboard/accessibility review NOT RUN. |

Request: `a09b8ba0-a729-4bc3-ba8f-71da97391952`. Active Loan: `e0d262b4-bd6a-4234-8171-e9d48a4fc50c`. Competing request: `713ebab6-cc3c-45b5-a686-5f9d517326cd`.

Sanitized raw evidence: `browser-results.json`, `browser-states.json`, `database.json`, `environment-preservation.json`, and browser execution logs. Screenshots: [`artifacts/screenshots/sprint-1/integration/local-20261112/`](../../../../artifacts/screenshots/sprint-1/integration/local-20261112/). `05-checkout-success.png` captures the stale catalog alongside successful checkout; `07-custodian-360.png` shows unavailable state after Refresh Equipment. Selected desktop/mobile screenshots were visually inspected. No browser page errors were recorded during the main workflow. Evidence text files were checked for exact configured connection strings/passwords/secrets: zero matches. No cookies, CSRF tokens, storage-state dumps or credential screenshots were saved.

## Contract/STS review and remaining release work

- **F-01:** integrated login/current-user, persisted sessions, logout, RBAC, invalid/inactive/expired/revoked sessions, Origin/CSRF, hashing and limiter assertions passed across existing unit/API/PostgreSQL suites. Real business endpoint denial and cross-Borrower checks close the earlier integration gaps. Comprehensive production log secrecy and deployed Secure-cookie behavior are NOT RUN and are not established by local HTTP evidence.
- **F-02:** existing assertions exercise DTO/order, authentication, availability state matrix, unknown/invalid IDs, safe errors and catalog UI navigation into F-03. Real Asset detail/request seam passed. Immediate post-checkout catalog freshness is a concrete UI issue: `CustodianWorkspace` refreshes its own records while `EquipmentCatalog` retains its independent loaded state. The API and persisted exclusivity rules remain correct. A code fix and focused re-verification require a separate implementation pass.
- **F-03:** 31 real PostgreSQL tests plus contract/UI checks exercise ownership lists/details, role/session/Origin/CSRF matrix, unsuitable/forged input, duplicate requests/concurrency, rollback and restart semantics. Real saved request refresh and eventual active Loan display passed. Earlier F-03 evidence was not rewritten.
- **F-04:** 5 unit, 15 API, 11 PostgreSQL and 9 UI tests passed (these overlap the category totals above). Source/actual assertions verify Asset-first locks, transactional fulfillment/Loan creation, repeat/unavailable rejection, rollback on failed Loan insertion, concurrency with one successful checkout and competing PENDING policy. Its concurrency test uses parallel Promise.all calls; it does not establish a barrier-controlled lock race or sustained load test. Component tests cover loading, empty, conflict, uncertain mutation and recovery; those mocked UI checks are not claimed as real browser fault coverage for every workspace.
- **BLOCKED policy acceptance:** Q-02 still awaits team approval in the plan/SRS/contracts. Q-01 is implemented/treated as approved by F-03 but remains proposed/open in the SRS and traceability. Resolve the authoritative policy records before release; verification cannot grant approval.
- **Release documentation gap:** README still states F-02/F-03/F-04 are planned and the workflow incomplete; traceability and older contract/evidence completion notes are stale. Reconcile these before reproducible release review. This verification adds evidence only.
- **NOT RUN:** comprehensive keyboard/focus and accessibility review for the complete checkout flow; real-browser empty catalog/empty Custodian queue and every error variant; barrier-controlled concurrency/load; official Deliverable 1 rubric comparison because the official handout is not present. Existing component/API tests cover several of these states but do not replace complete browser acceptance.
- **Release decision pending:** resolve the stale catalog display, confirm Q-02/Q-01 records, reconcile release documentation, and complete the missing acceptance review before approving staging-to-main. No backend/data-integrity failure was observed. Existing dependency-audit disclosures remain documented and were not re-audited or changed in this pass.

Work stayed within Deliverable 1 Sprint 1 verification. No Lab 5, Docker, CI/CD or GCP work was performed. No promotion to main was attempted.
