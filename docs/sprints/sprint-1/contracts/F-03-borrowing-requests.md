# F-03 — Borrowing Requests and Own Records

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
Status: **IMPLEMENTED — verification complete**. GitHub issue: [#4](https://github.com/thu734/Inventory-and-Borrowing-System/issues/4). F-01 authentication and SYS-01 database foundations are dependencies.

## 1. Sources, scope and dependencies

Sources: [SRS](../../../srs.md), [features](../../../features.md), [traceability](../../../traceability.md), [SYS-01](../../../sys01-database.md), [F-01 contract](F-01-authentication.md) and existing Prisma schema. No official lecturer handout or System-Level SDS was available for review.

Member 6 owns request creation and Borrower-only request/active-loan retrieval. Related requirements: FR-03/04, BR-02/03/06, NFR-01/03/06/08/09; traceability V-03/04/14/15/18/24/26/29/31/32. BR-04/05/10 are integration boundaries owned by F-04, not checkout implementation here.

Dependencies: F-01 session/role/Origin/CSRF guards; SYS-01 User, Asset, EquipmentModel, BorrowRequest and Loan; Member 2's F-02 selected-Asset interface and F-04 checkout-created records. Database fixtures can verify retrieval independently, but do not establish the end-to-end checkout journey.

Included: authenticated Borrower creates a PENDING request for an eligible physical Asset; lists/retrieves only own requests and active Loans; UI loading, empty, validation, failure and successful saved states; and the minimal F-03 partial-unique-index migration. Excluded: catalog list/search, Custodian queue/checkout, request editing/cancellation/expiry, approval states, Loan creation, returns, due dates, overdue/history, authentication replacement, and seed changes.

## 2. Decisions and integration policy

The API/UI choices below define the implemented F-03 contract. Q-02 remains an integration dependency requiring Member 2 acknowledgement.

| Question | Minimum proposed interpretation | Gate |
|---|---|---|
| SRS Q-01: same Borrower/Asset PENDING duplicates | **Approved:** reject with 409 DUPLICATE_PENDING_REQUEST, including concurrent attempts. Existing schema has no unique pending-pair safeguard, so F-03 adds a partial PostgreSQL unique index and serializes on the Asset row inside a transaction before checking duplicates. | Implemented and covered by the API and PostgreSQL suites. |
| SRS Q-02: competitors after checkout | **Chosen Sprint 1 policy; Member 2 acknowledgement pending:** F-03 never changes another request or creates a Loan; competing requests remain PENDING. | Member 2 must confirm this for F-04 integrated checkout. |
| SRS Q-04: API/validation/UI details | Adopt the status/projection/ordering and accessibility proposals below, consistent with F-01. | Contract approval. |
| Request racing checkout/serviceability updates | Eligibility is checked under an Asset row lock within the request transaction. Future F-04/F-07 writers must coordinate on the same row. Request can succeed before a later checkout; it is not a reservation. | Member 2 reviews shared locking protocol; do not claim global race protection without cooperating writers. |

Q-03 due-date policy is irrelevant to Sprint 1 F-03 and remains untouched. Q-01 is approved, implemented and tested. Q-02 is the chosen Sprint 1 integration policy but still requires Member 2 acknowledgement for F-04; tests do not substitute for that acknowledgement.

## 3. Borrower workflow and Feature-Level SDS

1. Existing authentication bootstrap resolves the active Borrower; no protected UI before identity is known.
2. F-02 invokes a proposed F-03 request panel with selected Asset identity and safe display metadata.
3. Borrower reviews the selected unit and submits once. Backend re-reads eligibility, derives owner from session and persists PENDING with server timestamp.
4. Show saved ID/status and link to My Requests. State explicitly: a request does not reserve equipment or guarantee checkout.
5. My Requests and My Active Loans retrieve server data on entry/refresh; owner-scoped details are reopenable. No F-04 writes are performed.

Proposed layers: route module → request service (eligibility/duplicate transaction) → existing Prisma client; separate owner-scoped query functions; React request panel and own-record views → existing API client. Mount routes between createApp() and finishApp() in normal startup. Never add pretend domain endpoints to the auth module.

Reuse createApp().authenticate, requireRole('BORROWER'), requireOrigin and requireCsrf. The actual context is res.locals.auth.user.id, not a client userId or a presumed flat auth.userId. Read helpers can type a local view of that existing context without altering F-01 infrastructure. The JSON checker/parser is not exported: implement feature-local JSON validation using Express/Zod after guards, retaining the 16 KiB limit and safe error handler. No concrete F-01/schema incompatibility has been found.

POST order: authentication → Borrower role → exact Origin → CSRF → JSON content type/parser → strict body validation → transaction. GET order: authentication → Borrower role → parameter/query validation → owner-scoped query. Authentication, parsing and persistence errors use the existing requestId/error envelope and no-store cache policy.

### Data behavior

- Reuse existing models and generated Prisma client. BorrowRequest writes only assetId, authenticated borrowerId, PENDING, createdAt and fulfilledAt=null; id is server-generated. No Asset availability field or quantity counter is introduced.
- Eligibility: serviceability=SERVICEABLE AND no Loan with returnedAt=null. PENDING requests do not affect eligibility; another Borrower's request is not a rejection reason.
- One transaction: lock selected existing Asset with a parameterized query, recheck eligibility and approved duplicate rule, create request, commit. Lock SQL must use bound parameters, not string interpolation. Rollback on injected/persistence failure; no partial request.
- All request reads use borrowerId=session.user.id in the database predicate. All Loan reads additionally require returnedAt=null. Filter before list/count/projection, never fetch a foreign record then redact it in the UI.
- Return only explicit DTO fields. Exclude passwords/hashes, session/CSRF secrets, other Borrower identity and department totals. F-03 never modifies Loan, Session, User, EquipmentModel or Asset rows (row locking is not an inventory update).

## 4. Proposed API specification

Prefix /api/v1. Every endpoint below is BORROWER-only, including reads; Custodian department views belong to F-04. Auth errors retain F-01 conventions.

| Method/path | Input | Success |
|---|---|---|
| POST /borrow-requests | Strict JSON {assetId:string}; Origin and X-CSRF-Token required | 201 {data: RequestDTO}; Location points to own request detail |
| GET /me/borrow-requests | No query fields in this increment | 200 {data:{items:RequestDTO[]}} |
| GET /me/borrow-requests/:id | Request ID | 200 {data:RequestDTO} |
| GET /me/loans | No query fields; active only | 200 {data:{items:ActiveLoanDTO[]}} |
| GET /me/loans/:id | Active Loan ID | 200 {data:ActiveLoanDTO} |

RequestDTO = {id,status,createdAt,asset:{id,assetCode,modelName,category}}. ActiveLoanDTO = {id,borrowRequestId,checkedOutAt,asset:{id,assetCode,modelName,category}}. Times are UTC ISO strings. Requests include the caller's PENDING/FULFILLED records; Loans exclude returned records. No due date or completed history. Deterministic descending createdAt/checkedOutAt, then descending id for ties. Empty lists return items:[], not 404. No pagination or total counts in this bounded synthetic-data increment; revisit separately if scale requires it.

Proposed IDs: nonblank UUID strings matching server-generated SYS-01 IDs, no client-selected owner. Reject unknown body/query fields (including borrowerId, role, status, timestamps, quantity), arrays/null, malformed JSON, and invalid identifiers before DB work. No free-text notes or duration fields.

| Failure | Expected response/state |
|---|---|
| Missing/invalid/expired/revoked session or inactive account | 401, no private data/write |
| Custodian role | 403 before record lookup |
| Missing/foreign Origin or missing/wrong CSRF on POST | 403, zero writes |
| Invalid body/ID/query or malformed JSON | Safe 400; non-JSON 415; over 16 KiB 413 |
| Unknown Asset | 404 ASSET_NOT_FOUND, zero writes |
| MAINTENANCE/RETIRED or active Loan | 409 ASSET_UNAVAILABLE, zero writes |
| Missing or foreign request; missing/foreign/returned Loan detail | Same safe 404 NOT_FOUND, no ownership disclosure |
| Same-owner pending duplicate | Conditional 409 only if Q-01 restriction is approved |
| Database exception | Existing safe 500 INTERNAL_ERROR; no SQL/stack/secret, no false success |

## 5. UI and F-02 handoff

Proposed components: RequestAssetPanel, MyRequests, MyActiveLoans and an owner-record detail view. Reuse BorrowBase tokens, labels, visible focus and existing auth context/API client; no redesign. Borrower navigation adds only own-record views. No catalog data provider or fake local inventory is added.

F-02 handoff: onRequestAsset({assetId, assetCode, modelName, category}) opens RequestAssetPanel for the authenticated Borrower. Labels are presentation-only; POST sends only assetId. F-02 owns selection and availability display; F-03 revalidates in PostgreSQL. With no selection, show an instructional state; a developer test fixture can supply selection without shipping a substitute catalog/manual-ID workflow. Final F-02 wiring awaits Member 2's interface agreement.

Submission states: ready → pending (disabled, Enter/click cannot duplicate while pending) → saved or explicit error. On uncertain network outcome, do not auto-retry POST; direct user to refresh My Requests before deciding whether to resubmit. GET retry is explicit and safe. 401 clears stale identity via the existing auth provider retry/bootstrap seam; no auth rewrite. 403 shows access denied. Conflict returns to selection/review without claiming saved success.

Lists/details have loading, empty and recoverable error states. Verify labels, keyboard order/focus and no overflow at 360/768/1280px. Request status does not imply reservation, priority or approval. Active Loans display real checkout time and Asset identity, not speculative due dates.

## 6. Acceptance criteria and mapping

The acceptance statuses below reflect the current implementation and executed evidence. The original red-phase run remains historical evidence of the missing routes before implementation; it is not being presented as a final release result.

| AC | Observable expected behavior | Test IDs | Status |
|---|---|---|---|
| AC-F03-01 | Eligible Asset request returns 201 and persists exactly one PENDING request with session owner/server identity; no Loan/reservation write. | TEST-F03-01, PG-01 | PASS |
| AC-F03-02 | Missing/invalid/unavailable Asset and malformed/forged inputs are rejected safely with zero partial writes. | TEST-F03-02, PG-02 | PASS |
| AC-F03-03 | Lists include only own requests and active Loans, with no foreign records or aggregate leakage. | TEST-F03-03, PG-03 | PASS |
| AC-F03-04 | Own details succeed; foreign/missing details are indistinguishable 404; returned Loans are withheld. | TEST-F03-04, PG-03 | PASS |
| AC-F03-05 | Anonymous/inactive/invalid-session and Custodian calls are rejected on every endpoint; Origin/CSRF protects POST. | TEST-F03-05, PG-04 | PASS |
| AC-F03-06 | Requests survive fresh Prisma/app instances and refresh; read data is persisted rather than browser-only. | PG-05, UI-03 | PASS automated; browser refresh NOT VERIFIED |
| AC-F03-07 | Different Borrowers may request one eligible Asset; approved same-owner duplicate/concurrency policy holds without reservation. | PG-06; TEST-F03-06 | PASS |
| AC-F03-08 | Selected-Asset handoff and submit/loading/empty/error/saved/own-record UI states are usable by keyboard and responsive. | UI-01/02/03, BROWSER-01 | PARTIAL component tests pass; browser keyboard/viewport NOT VERIFIED |
| AC-F03-09 | Persistence failure produces safe error/no partial write; uncertain POST is not automatically repeated; existing F-01 behavior remains intact. | TEST-F03-07, PG-07, UI-02, REG-01 | PASS |

## 7. Software Test Specification

Expected results are defined before implementation. Prefix abbreviated IDs below with TEST-F03- unless already fully qualified. Independent service tests and memory-backed API tests do not establish PostgreSQL persistence; mocked UI tests do not establish browser E2E.

| Test ID | Setup/action | Expected result |
|---|---|---|
| TEST-F03-01 | Active Borrower A, serviceable unloaned Asset X; POST assetId using real auth interface | 201, safe RequestDTO, PENDING, owner A, generated id/time; exactly one request; unchanged Loan/Asset state |
| TEST-F03-02 | Missing/null/array/forged body, invalid ID, unknown X, unsuitable X, loaned X | Documented 400/404/409/413/415 matrix; zero new rows and no raw exceptions |
| TEST-F03-03 | A/B each own mixed requests and active Loans; read lists as A | Only A's permitted records; no B IDs/display identity/counts; deterministic ordering and empty-state fixture |
| TEST-F03-04 | Read A/B/missing details as A; include returned own Loan | A request/active Loan 200; others same 404 envelope apart from requestId |
| TEST-F03-05 | All five endpoints × missing/malformed/expired/revoked/inactive/Borrower/Custodian; POST Origin/CSRF matrix | 401/403/allowed as specified; failures before service write; no data leakage |
| TEST-F03-06 | Conditional approved Q-01 duplicate cases | If rejection approved, second/concurrent same-pair call conflicts with exactly one pending row; otherwise revise expected behavior explicitly before coding |
| TEST-F03-07 | Inject repository exception, malformed JSON and DB detail in exception message | Safe status/envelope, no SQL/stack/secret; no false success |
| PG-01 | Fresh UUID A/B/Custodian, EquipmentModel and X in real PostgreSQL; authenticate A, create request, direct DB read | Response and committed row match owner/asset/status; no Loan and no availability mutation |
| PG-02 | Serviceability matrix and active vs returned Loan fixtures | Only SERVICEABLE without active Loan eligible; rejected submissions leave DB unchanged |
| PG-03 | Mixed-owner request/Loan fixtures; call lists/details | Owner predicates enforced against persisted records including empty lists, no foreign rows, active-only Loans |
| PG-04 | Real auth cookies, disable A after login; wrong role/CSRF/Origin requests | Guard matrix and no DB mutations on rejection |
| PG-05 | Create through API; disconnect client, build fresh Prisma/app and reauthenticate | Saved request reappears with unchanged identifiers/timestamps; no browser-memory dependency |
| PG-06 | Concurrent A/B request same available X; conditional same-A case | Both different-owner requests persist; no Loan; approved duplicate behavior proven with independent connections |
| PG-07 | Fail transaction after insertion before commit; coordinate request/eligibility state change on Asset row | Rolled-back request absent; shared-lock behavior measured, no unsupported F-04 implementation claim |
| UI-01 | Mock API selected X, pending response, saved response, empty/populated lists | Correct handoff, one submit, safe DTO rendering, loading/empty/saved feedback |
| UI-02 | 400/401/403/409/500/network responses | Validation/access/conflict/recovery states, stale auth cleared, no automatic POST retry |
| UI-03 | Remount own-record view with independent GET responses | Persisted server records requested again; active-only display; no local fake persistence |
| BROWSER-01 | Real API + disposable DB; selected-Asset integration fixture until F-02 supplied; 360/768/1280px and keyboard | Genuine request/save/refresh/own-record/error observations; clearly label fixture seam versus integrated F-02/F-04 journey |
| REG-01 | Existing F-01 tests, SYS-01 if data integration concern, all typechecks/builds | No regression; actual counts recorded, not inferred |

### Isolated PostgreSQL setup and evidence

F-03 PostgreSQL tests require `DATABASE_URL`, `SYS01_TEST_DATABASE=true` and a database name beginning `borrowbase_sys01_f03_`. Each run uses a new disposable database, applies the existing migrations, generates unique fixture IDs/emails/codes, authenticates through F-01, and cleans only owned fixture IDs in foreign-key order. Passwords and tokens remain out of output and tracked configuration.

Loan fixtures use existing constraints, including matching borrower/asset/request and FULFILLED request state; fixture construction is not checkout implementation. A real F-04-created Loan retrieval test remains a later integration gate.

### Initial red phase

The executable file `backend/tests/f03.contract.red.test.ts` preserves the three original baseline expectations (anonymous creation rejected before domain lookup, authenticated own request list and own active-Loan list). Its recorded red run is historical evidence from before the F-03 routes existed; after implementation the same assertions pass. The suite uses the test-only auth store and does not establish PostgreSQL persistence or all acceptance criteria.

## 8. Definition of Done and implementation order

Recorded red run: 7 November 2026, 13:48 Asia/Bangkok; command `npm run test -w backend -- tests/f03.contract.red.test.ts`. Result: **1 file failed, 3 tests failed, 0 passed**. Anonymous POST returned 404 instead of 401; authenticated request and Loan list GETs returned 404 instead of 200. F-01 login setup passed and no database was contacted. This historical run established the missing-route baseline before implementation.

1. Q-01 is approved and implemented with the partial unique index, transaction lock and conflict response. Q-02 is documented as the chosen Sprint 1 policy and requires F-04 confirmation.
2. The original three red-phase assertions are preserved and now pass; the expanded API and PostgreSQL specification is implemented and executed.
3. Prisma-backed creation, owner-scoped queries and guarded routes are mounted before `finishApp()`.
4. The Borrower request panel and own-record views use the documented F-02 selected-Asset seam; no catalog or checkout substitute was added.
5. Typechecks, builds, frontend UI tests, F-01 PostgreSQL tests and SYS-01 database tests were executed. Browser verification was limited to manual rendering; integrated F-02/F-04 journeys remain pending those features.
6. Completed verification results and remaining integration dependencies are recorded below.

Verification evidence (7 November 2026):

- `npm run typecheck`: PASS.
- `npm run test:unit -w backend`: PASS, 4 files / 10 tests.
- `npm run test:api -w backend`: PASS, 1 file / 20 tests.
- `npm run test -w backend -- tests/f03.contract.red.test.ts`: PASS, 1 file / 3 tests.
- `npm run test -w backend -- tests/f03.postgres.test.ts`: PASS, 1 file / 31 tests, isolated `borrowbase_sys01_f03_*` database.
- `npm run test -w backend -- tests/auth.postgres.test.ts`: PASS, 1 file / 5 tests, separately seeded disposable regression database.
- `npm run test:db`: PASS, 1 file / 5 tests, same disposable regression database.
- `npm run test:ui`: PASS, 2 files / 20 tests.
- `npm run build`: PASS for backend and frontend.
- `git diff --check`: PASS.
- Browser: PARTIAL manual rendering only. Existing shared pages showed the authenticated Borrower request panel, own-record navigation and Custodian control exclusion. Full submission, disposable-database persistence, refresh, duplicate conflict, cross-Borrower isolation, keyboard-only and viewport checks were NOT VERIFIED because the running app's database could not be confirmed as the disposable audit database.
