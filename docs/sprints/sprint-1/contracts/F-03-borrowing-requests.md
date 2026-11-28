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
Status: **implemented and integrated for Sprint 1; local verification recorded, acceptance incomplete**. GitHub issue: [#4](https://github.com/thu734/Inventory-and-Borrowing-System/issues/4). F-01 authentication and SYS-01 database foundations are dependencies.

## 1. Sources, scope and dependencies

Sources: [SRS](../../../srs.md), [features](../../../features.md), [traceability](../../../traceability.md), [SYS-01](../../../sys01-database.md), [F-01 contract](F-01-authentication.md) and existing Prisma schema. The System-Level SDS was unavailable at the original feature verification; the current [SDS](../../../system-sds.md) is now included in the consistency review. No official lecturer handout was available in this checkout.

Member 6 owns request creation and Borrower-only request/active-loan retrieval. Related requirements: FR-03/04, BR-02/03/06, NFR-01/03/06/08/09; traceability V-03/04/14/15/18/24/26/29/31/32. BR-04/05/10 are integration boundaries owned by F-04, not checkout implementation here.

Dependencies: F-01 session/role/Origin/CSRF guards; SYS-01 User, Asset, EquipmentModel, BorrowRequest and Loan; Member 2's F-02 selected-Asset interface and F-04 checkout-created records. Database fixtures can verify retrieval independently, but do not establish the end-to-end checkout journey.

Included: authenticated Borrower creates an eligible PENDING request, cancels an own PENDING request, and lists/retrieves only own requests and active Loans. Excluded: catalog list/search, Custodian queue/checkout implementation, request editing/expiry, approval states, Loan creation, returns, due dates, overdue/history, authentication replacement, and seed changes. Lab 7 cancellation is an additive lifecycle transition, not request editing or deletion.

## 2. Decisions and integration policy

The API/UI choices below define the implemented F-03 contract. Member 2 confirmed Q-02 on November 12, 2026 in `e78dc65`: competing requests remain PENDING after checkout, the active Loan makes the Asset unavailable, and any later checkout must revalidate eligibility. This supersedes the earlier pending-acknowledgement wording; it does not approve unrelated security/API decisions or full release acceptance.

| Question | Implemented interpretation / review status | Gate |
|---|---|---|
| SRS Q-01: same Borrower/Asset PENDING duplicates | **Approved:** reject with 409 DUPLICATE_PENDING_REQUEST, including concurrent attempts. The F-03 migration adds a partial PostgreSQL unique index and serializes on the Asset row inside a transaction before checking duplicates. | Implemented and covered by the API and PostgreSQL suites. |
| SRS Q-02: competitors after checkout | **Confirmed by Member 2, November 12, 2026 (`e78dc65`):** F-03 never changes another request or creates a Loan; F-04 leaves competing requests PENDING. | Q-02 acknowledgement is recorded; S2 return/eligibility regression remains planned. |
| SRS Q-04: API/validation/UI details | Status/projection/ordering are implemented below, consistent with F-01 and local SRS D-11; full accessibility verification remains incomplete. | Contract approval. |
| Request racing checkout/serviceability updates | Eligibility is checked under an Asset row lock within the request transaction. Integrated F-04 checkout uses the same Asset-first lock order; future F-07 writers must preserve it. Request can succeed before a later checkout; it is not a reservation. | Shared F-03/F-04 locks and parallel tests inspected; do not infer untested future writers or a barrier-controlled race. |

Q-03 due-date policy is irrelevant to Sprint 1 F-03 and remains untouched. Q-01 is approved, implemented and tested. Q-02 is implemented in F-04 and confirmed by Member 2 in `e78dc65`; tests establish behavior separately from that recorded approval.

## 3. Borrower workflow and Feature-Level SDS

1. Existing authentication bootstrap resolves the active Borrower; no protected UI before identity is known.
2. F-02 invokes the integrated F-03 request panel with selected Asset identity and safe display metadata.
3. Borrower reviews the selected unit and submits once. Backend re-reads eligibility, derives owner from session and persists PENDING with server timestamp.
4. Show saved ID/status and link to My Requests. State explicitly: a request does not reserve equipment or guarantee checkout.
5. My Requests and My Active Loans retrieve server data on entry/refresh; owner-scoped details are reopenable. No F-04 writes are performed.

Implemented layers: route module → PrismaBorrowingStore (eligibility/duplicate transaction and owner-scoped queries) → shared Prisma client; BorrowerWorkspace request/record views → existing API client. Mount routes between createApp() and finishApp() in normal startup. Never add pretend domain endpoints to the auth module.

Reuse createApp().authenticate, requireRole('BORROWER'), requireOrigin and requireCsrf. The actual context is res.locals.auth.user.id, not a client userId or a presumed flat auth.userId. Read helpers can type a local view of that existing context without altering F-01 infrastructure. The JSON checker/parser is not exported: implement feature-local JSON validation using Express/Zod after guards, retaining the 16 KiB limit and safe error handler. No concrete F-01/schema incompatibility has been found.

POST order: authentication → Borrower role → exact Origin → CSRF → JSON content type/parser → strict body validation → transaction. GET order: authentication → Borrower role → parameter/query validation → owner-scoped query. Authentication, parsing and persistence errors use the existing requestId/error envelope and no-store cache policy.

### Data behavior

- Reuse existing models and generated Prisma client. BorrowRequest writes server-derived borrowerId/assetId, status, createdAt, fulfilledAt and nullable cancelledAt; id and cancellation time are server-generated. `PENDING → CANCELLED` is the only cancellation transition; only a successful transition sets cancelledAt. No Asset availability field or quantity counter is introduced.
- Eligibility: serviceability=SERVICEABLE AND no Loan with returnedAt=null. PENDING requests do not affect eligibility; another Borrower's request is not a rejection reason.
- One transaction: lock selected existing Asset with a parameterized query, recheck eligibility and approved duplicate rule, create request, commit. Lock SQL must use bound parameters, not string interpolation. Rollback on injected/persistence failure; no partial request.
- All request reads use borrowerId=session.user.id in the database predicate. All Loan reads additionally require returnedAt=null. Filter before list/count/projection, never fetch a foreign record then redact it in the UI.
- Return only explicit DTO fields. Exclude passwords/hashes, session/CSRF secrets, other Borrower identity and department totals. F-03 never modifies Loan, Session, User, EquipmentModel or Asset rows (row locking is not an inventory update).

## 4. Implemented API specification

Prefix /api/v1. Every endpoint below is BORROWER-only, including reads; Custodian department views belong to F-04. Auth errors retain F-01 conventions.

| Method/path | Input | Success |
|---|---|---|
| POST /borrow-requests | Strict JSON {assetId:string}; Origin and X-CSRF-Token required | 201 {data: RequestDTO}; Location points to own request detail |
| GET /me/borrow-requests | No query fields in this increment | 200 {data:{items:RequestDTO[]}} |
| GET /me/borrow-requests/:id | Request ID | 200 {data:RequestDTO} |
| GET /me/loans | No query fields; active only | 200 {data:{items:ActiveLoanDTO[]}} |
| GET /me/loans/:id | Active Loan ID | 200 {data:ActiveLoanDTO} |

RequestDTO = {id,status,createdAt,cancelledAt,asset:{id,assetCode,modelName,category}}. ActiveLoanDTO = {id,borrowRequestId,checkedOutAt,asset:{id,assetCode,modelName,category}}. Times are UTC ISO strings; cancelledAt is null unless the server successfully performs cancellation. Requests include the caller's PENDING/FULFILLED/CANCELLED records; Loans exclude returned records. No due date or completed history. Deterministic descending createdAt/checkedOutAt, then descending id for ties. Empty lists return items:[], not 404. No pagination or total counts in this bounded synthetic-data increment; revisit separately if scale requires it.

Implemented IDs: nonblank UUID strings matching server-generated SYS-01 IDs, no client-selected owner. Reject unknown body/query fields (including borrowerId, role, status, timestamps, quantity), arrays/null, malformed JSON, and invalid identifiers before DB work. No free-text notes or duration fields.

| Failure | Expected response/state |
|---|---|
| Missing/invalid/expired/revoked session or inactive account | 401, no private data/write |
| Custodian role | 403 before record lookup |
| Missing/foreign Origin or missing/wrong CSRF on POST | 403, zero writes |
| Invalid body/ID/query or malformed JSON | Safe 400; non-JSON 415; over 16 KiB 413 |
| Unknown Asset | 404 ASSET_NOT_FOUND, zero writes |
| MAINTENANCE/RETIRED or active Loan | 409 ASSET_UNAVAILABLE, zero writes |
| Missing or foreign request; missing/foreign/returned Loan detail | Same safe 404 NOT_FOUND, no ownership disclosure |
| Same-owner pending duplicate | 409 DUPLICATE_PENDING_REQUEST under approved Q-01; no extra pending row |
| Database exception | Existing safe 500 INTERNAL_ERROR; no SQL/stack/secret, no false success |
| Cancellation | `POST /me/borrow-requests/:id/cancel`, authenticated Borrower owner only, valid Origin/CSRF, empty strict JSON body | 200 with CANCELLED RequestDTO and server cancelledAt; 400 malformed ID/body, 401 unauthenticated, 403 wrong role, 404 foreign/missing owner-scoped request, 409 REQUEST_NOT_PENDING for FULFILLED/CANCELLED or checkout race; no partial write |

## 5. UI and F-02 handoff

Implemented UI: BorrowerWorkspace provides the selected-Asset request panel, My Requests, My Active Loans and owner-record detail views. Reuse BorrowBase tokens, labels, visible focus and existing auth context/API client; no redesign. Borrower navigation adds only own-record views. No catalog data provider or fake local inventory is added.

F-02 handoff: openBorrowRequest({assetId, assetCode, modelName, category}) opens BorrowerWorkspace's request view for the authenticated Borrower. Labels are presentation-only; POST sends only assetId. F-02 owns selection and availability display; F-03 revalidates in PostgreSQL. With no valid selection, show an instructional state. Actual catalog wiring and real selected-Asset submission are recorded in the integrated verification; no substitute catalog/manual-ID workflow is claimed.

Submission states: ready → pending (disabled, Enter/click cannot duplicate while pending) → saved or explicit error. On uncertain network outcome, do not auto-retry POST; direct user to refresh My Requests before deciding whether to resubmit. GET retry is explicit and safe. 401 clears stale identity via the existing auth provider retry/bootstrap seam; no auth rewrite. 403 shows access denied. Conflict returns to selection/review without claiming saved success.

Lists/details have loading, empty and recoverable error states. Verify labels, keyboard order/focus and no overflow at 360/768/1280px. Request status does not imply reservation, priority or approval. Active Loans display real checkout time and Asset identity, not speculative due dates.

## 6. Acceptance criteria and mapping

The acceptance statuses below include the [November 12 integrated verification](../evidence/Sprint-1-integration-verification.md) at `3710af0`; the historical November 7 results later in this contract retain their original limits. No new test run occurred in this editorial audit. The original red-phase run remains historical evidence of the missing routes before implementation; it is not being presented as a final release result.

| AC | Observable expected behavior | Test IDs | Status |
|---|---|---|---|
| AC-F03-01 | Eligible Asset request returns 201 and persists exactly one PENDING request with session owner/server identity; no Loan/reservation write. | TEST-F03-01, PG-01 | PASS |
| AC-F03-02 | Missing/invalid/unavailable Asset and malformed/forged inputs are rejected safely with zero partial writes. | TEST-F03-02, PG-02 | PASS |
| AC-F03-03 | Lists include only own requests and active Loans, with no foreign records or aggregate leakage. | TEST-F03-03, PG-03 | PASS |
| AC-F03-04 | Own details succeed; foreign/missing details are indistinguishable 404; returned Loans are withheld. | TEST-F03-04, PG-03 | PASS |
| AC-F03-05 | Anonymous/inactive/invalid-session and Custodian calls are rejected on every endpoint; Origin/CSRF protects POST. | TEST-F03-05, PG-04 | PASS |
| AC-F03-06 | Requests survive fresh Prisma/app instances and refresh; read data is persisted rather than browser-only. | PG-05, UI-03 | PASS automated and real browser saved-detail refresh in integrated evidence |
| AC-F03-07 | Different Borrowers may request one eligible Asset; approved same-owner duplicate/concurrency policy holds without reservation. | PG-06; TEST-F03-06 | PASS |
| AC-F03-08 | Selected-Asset handoff and submit/loading/empty/error/saved/own-record UI states are usable by keyboard and responsive. | UI-01/02/03, BROWSER-01 | PARTIAL component and sampled browser keyboard/viewport checks pass; full accessibility and every browser state remain incomplete |
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
| TEST-F03-06 | Approved Q-01 duplicate cases | Second/concurrent same-pair call returns 409 DUPLICATE_PENDING_REQUEST with exactly one pending row |
| TEST-F03-07 | Inject repository exception, malformed JSON and DB detail in exception message | Safe status/envelope, no SQL/stack/secret; no false success |
| PG-01 | Fresh UUID A/B/Custodian, EquipmentModel and X in real PostgreSQL; authenticate A, create request, direct DB read | Response and committed row match owner/asset/status; no Loan and no availability mutation |
| PG-02 | Serviceability matrix and active vs returned Loan fixtures | Only SERVICEABLE without active Loan eligible; rejected submissions leave DB unchanged |
| PG-03 | Mixed-owner request/Loan fixtures; call lists/details | Owner predicates enforced against persisted records including empty lists, no foreign rows, active-only Loans |
| PG-04 | Real auth cookies, disable A after login; wrong role/CSRF/Origin requests | Guard matrix and no DB mutations on rejection |
| PG-05 | Create through API; disconnect client, build fresh Prisma/app and reauthenticate | Saved request reappears with unchanged identifiers/timestamps; no browser-memory dependency |
| PG-06 | Concurrent A/B request same available X; approved same-A duplicate case | Both different-owner requests persist; no Loan; approved duplicate behavior proven with independent connections |
| PG-07 | Fail transaction after insertion before commit; coordinate request/eligibility state change on Asset row | Rolled-back request absent; shared-lock behavior measured, no unsupported F-04 implementation claim |
| UI-01 | Mock API selected X, pending response, saved response, empty/populated lists | Correct handoff, one submit, safe DTO rendering, loading/empty/saved feedback |
| UI-02 | 400/401/403/409/500/network responses | Validation/access/conflict/recovery states, stale auth cleared, no automatic POST retry |
| UI-03 | Remount own-record view with independent GET responses | Persisted server records requested again; active-only display; no local fake persistence |
| BROWSER-01 | Real API + disposable DB; integrated F-02 selected-Asset flow and F-04 checkout; 360/768/1280px and keyboard | Genuine request/save/refresh/own-record/error observations; distinguish isolated fixture checks from the integrated F-02/F-04 journey |
| REG-01 | Existing F-01 tests, SYS-01 if data integration concern, all typechecks/builds | No regression; actual counts recorded, not inferred |

### Isolated PostgreSQL setup and evidence

F-03 PostgreSQL tests require `DATABASE_URL`, `SYS01_TEST_DATABASE=true` and a database name beginning `borrowbase_sys01_f03_`. Each run uses a new disposable database, applies the existing migrations, generates unique fixture IDs/emails/codes, authenticates through F-01, and cleans only owned fixture IDs in foreign-key order. Passwords and tokens remain out of output and tracked configuration.

Loan fixtures use existing constraints, including matching borrower/asset/request and FULFILLED request state; fixture construction is not checkout implementation. Real F-04-created Loan retrieval is covered by the November 12 integrated evidence; these isolated F-03 fixtures alone do not establish that journey.

### Initial red phase

The executable file `backend/tests/f03.contract.red.test.ts` preserves the three original baseline expectations (anonymous creation rejected before domain lookup, authenticated own request list and own active-Loan list). Its recorded Sprint 1 red run is historical evidence from before the F-03 routes existed; after implementation the same assertions pass. The suite uses the test-only auth store and does not establish PostgreSQL persistence or all acceptance criteria.

## 8. Historical implementation order and November 7 verification

The following checklist and results describe the feature-stage run before F-02/F-04 integration. Its pending integration/browser statements are historical, not current status. Current integrated coverage is referenced in Section 6. Full release acceptance is still incomplete: unrelated security/API approval records require reconciliation, full keyboard/accessibility and other recorded checks remain open, and the catalog has the separate immediate post-checkout freshness defect.

Recorded red run: 7 November 2026, 13:48 Asia/Bangkok; command `npm run test -w backend -- tests/f03.contract.red.test.ts`. Result: **1 file failed, 3 tests failed, 0 passed**. Anonymous POST returned 404 instead of 401; authenticated request and Loan list GETs returned 404 instead of 200. F-01 login setup passed and no database was contacted. This historical run established the missing-route baseline before implementation.

1. Q-01 is approved and implemented with the partial unique index, transaction lock and conflict response. At the original feature-stage run Q-02 required F-04 confirmation; Member 2 subsequently confirmed it on November 12, 2026 (`e78dc65`).
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

## Lab 7 contract revision — Issue #71 (revision 1.2, 25 November 2026)

TA approval: **P’ Tik**, **November 25, 2026**; the original email is not attached or independently inspected here. Current status: **contract approved in [PR #74](https://github.com/thu734/Inventory-and-Borrowing-System/pull/74); implementation approved and merged in [PR #76](https://github.com/thu734/Inventory-and-Borrowing-System/pull/76)**. [Lab 7 verification](../../../labs/lab-07/implementation-plan.md#d-current-verification-evidence--26-november-2026) records passing automated regression at staging `1c8029e`; release PR #79 and deployment remain pending. Approved transition: owner-only `PENDING → CANCELLED`, only while pending. Fulfilled/cancelled requests return `409 REQUEST_NOT_PENDING`, remain persisted and owner-visible, and do not delete history, create a Loan or alter Asset availability. `POST /api/v1/me/borrow-requests/:id/cancel` uses existing authentication, Borrower role, Origin and CSRF guards and an empty strict JSON body. UI requires confirmation, loading, server-authoritative status, explicit cancelledAt display/status and recoverable errors. Cancellation serializes with checkout using the existing Asset-first lock order and request recheck.

| AC | Expected behavior | STS |
|---|---|---|
| AC-F03-10 | Owner cancels own PENDING request; server sets cancelledAt once and returns CANCELLED. | TEST-F03-10 |
| AC-F03-11 | Anonymous, Custodian and another Borrower cannot cancel. | TEST-F03-11 |
| AC-F03-12 | Fulfilled/already-cancelled/missing/malformed requests are rejected unchanged. | TEST-F03-12 |
| AC-F03-13 | History persists; cancelledAt persists; no Loan/delete/Asset availability change. | TEST-F03-13 |
| AC-F03-14 | UI confirmation/loading/status/error states are correct. | TEST-F03-14 |
| AC-F03-15 | CANCELLED remains visible after refresh/fresh app. | TEST-F03-15 |
| AC-F03-16 | Concurrent cancel/checkout has exactly one winner and no partial loser state. | TEST-F03-16; TEST-F04-13 |

| Test ID / AC | Level | Preconditions | Input/action | Expected result and database assertions |
|---|---|---|---|---|
| TEST-F03-10 / AC-F03-10 | API/PostgreSQL | Active owner A; own PENDING R; valid Origin/CSRF | POST cancel with empty JSON | 200; R becomes CANCELLED; cancelledAt is one server timestamp and persists; no Loan/Asset change. |
| TEST-F03-11 / AC-F03-11 | API security | Anonymous, Custodian, Borrower B and owner A sessions | Attempt cancellation of A's R | 401/403/safe 404 as applicable; R unchanged; zero writes. |
| TEST-F03-12 / AC-F03-12 | API/PostgreSQL | FULFILLED R with Loan, CANCELLED R, missing/malformed IDs/body | Repeat/invalid cancellation | 400/404/409; no status/timestamp/Loan/Asset change. |
| TEST-F03-13 / AC-F03-13 | PostgreSQL | PENDING R and serviceable Asset; capture row/Loan/Asset | Cancel, reload owner request and inspect DB | Row remains with same id/owner/asset/createdAt, CANCELLED and cancelledAt; no Loan/delete/availability change. |
| TEST-F03-14 / AC-F03-14 | UI/E2E | Owner UI with PENDING row and success/conflict/failure responses | Select Cancel, confirm, observe pending and refresh | Action is owner/status-gated; confirmation and disabled pending state appear; server status/cancelledAt is shown; failures are recoverable and not false success. |
| TEST-F03-15 / AC-F03-15 | API/PostgreSQL | Cancelled R; fresh app/Prisma instance | Reauthenticate and retrieve list/detail | CANCELLED and cancelledAt remain persisted and owner-visible. |
| TEST-F03-16 / AC-F03-16 | Barrier-controlled PostgreSQL | Same PENDING R; valid owner cancellation and Custodian checkout | Execute both transactions concurrently | Exactly one wins: CANCELLED with cancelledAt/no Loan, or FULFILLED with fulfilledAt/one active Loan. Loser returns 409 and cannot alter winner state. |

| TEST-REG-01 | API/PostgreSQL/UI regression | Existing F-01 authentication/RBAC, F-02 catalog/availability, F-03 request/own-record and F-04 queue/checkout suites and fixtures | Run the existing Sprint 1 regression suite after implementation | F-01–F-04 behavior remains unchanged except the approved cancellation transition; ownership, duplicate prevention, checkout uniqueness, persistence and existing error conventions continue to pass. |

Historical Part A revision metadata (status at drafting, before PR #74 approval and PR #76 implementation): no preceding F-03 version label is recorded in the existing document; this is the first explicitly versioned Lab 7 revision, **1.2**, dated **November 25, 2026**. Reason: **Approved Lab 7 request-lifecycle change, Issue #71**; TA approval: **P’ Tik**; reviewer **Pending**; implementation **Not started**; review status **Pending teammate review**.
