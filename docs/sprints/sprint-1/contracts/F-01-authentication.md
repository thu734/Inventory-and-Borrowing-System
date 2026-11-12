# F-01 — Authentication and server-side access

Status: **implemented and integrated for Sprint 1; local verification recorded**. Recovery branch/commit references below are historical. Current cross-feature evidence is in [integrated verification](../evidence/Sprint-1-integration-verification.md) at `3710af0`; acceptance and approval limitations remain explicit.

## Traceability and boundary

Requirements: FR-01, BR-06, NFR-01, NFR-02; supports F-03 and F-04. Dependencies: Member 2's SYS-01 User/Session migration and seed; shared API/session agreement. Member 6 owns authentication backend/frontend, access middleware and tests. Member 2 consumes the middleware for catalog/checkout. No registration, password reset, role editing, SSO, refresh tokens or account administration UI.

## Design and tradeoffs

Use database-backed opaque sessions, not browser-stored bearer tokens. Immediate logout/revocation and persistent sessions across app restarts are straightforward; the cost is a session lookup per protected request. Load current User role/isActive from DB so revoked access is not cached in a cookie. Argon2id parameters are specified in `backend/src/modules/auth/credentials.ts`; hashing slows guessing but adds CPU cost, so bound login attempts and measure login separately from read latency.

Eight-hour absolute lifetime and same-origin HttpOnly cookie are implemented and described in the System-Level SDS and local SRS D-11. This corrects implementation status; formal security/API approval records still require reconciliation and are not granted by this audit. PostgreSQL Session is a support entity, not a sixth domain feature. Browser navigation/hidden controls improve usability but do not authorize access.

## Workflow and data interface

1. Browser opens login; backend checks exact configured Origin on login mutations.
2. Validate JSON, normalize email with trim/lowercase, verify password without trimming it. Unknown/inactive account and wrong password return the same invalid-credentials response; perform dummy hash verification for nonexistent users.
3. Generate 32 cryptographically random bytes encoded base64url. Store SHA-256 token hash, userId, createdAt, expiresAt, revokedAt=null in Session. Revoke an existing valid presented session as part of login success.
4. Set `cpe_session` cookie: HttpOnly, SameSite=Lax, Path=/, no Domain, Secure under deployed HTTPS, expiry matching server absolute expiry. Never include session token in JSON, localStorage or logs.
5. Authentication hashes the cookie token, resolves an unexpired/unrevoked Session and active User. Expiry is `now >= expiresAt`. Populate request context `{userId, role, sessionId}` only from backend data.
6. Logout revokes only the current session, clears cookie with matching attributes and returns 204. Replaying the old token returns 401. Other sessions remain valid. Database errors return safe 500/503, never successful authentication.

SYS-01 owns actual migrations. Required fields: User id, normalizedEmail UNIQUE, displayName, passwordHash, role, isActive; Session id, tokenHash UNIQUE, userId FK, createdAt, expiresAt, revokedAt?. Session expiry must exceed creation. Test helpers inject time without production-only bypass routes. Dependency versions are recorded in the shared lockfile and the Node runtime requirement in `package.json`.

Implemented CSRF mechanism: bind a CSRF value to session via HMAC-SHA256 of tokenHash using backend-only `CSRF_SECRET` (at least 32 random bytes). Return CSRF value in authenticated session JSON, retain in browser memory, send as `X-CSRF-Token` on protected mutations. Check constant-time equality and exact allowed Origin. This adds one secret and header handling but avoids an extra session column. Login requires Origin + JSON; no CSRF required before a session exists. Reject missing/invalid Origin or CSRF with 403 and zero mutation. No wildcard credentialed CORS. F-04 checkout uses these shared guards. The SDS now documents this bootstrap; formal review caveats remain subject to team reconciliation.

## API contract

All paths start `/api/v1`; responses never expose passwordHash, tokenHash or session token. Identity shape: `{id, displayName, role}`. Error shape: `{error:{code,message,fieldErrors?,requestId}}`.

| Method/path | Input / permission | Success | Failure |
|---|---|---|---|
| POST `/auth/login` | Public; `{email,password}`, exact Origin, JSON | 200 `{data:{user:{id,displayName,role},csrfToken}}` + cookie | 400 invalid body; 401 INVALID_CREDENTIALS; 403 ORIGIN_FORBIDDEN; 429 TOO_MANY_ATTEMPTS |
| GET `/auth/me` | Valid session | 200 same JSON as login, no new session | 401 UNAUTHENTICATED |
| POST `/auth/logout` | Valid session + Origin/CSRF; empty JSON object | 204, cookie cleared, session revoked | 401 invalid session; 403 invalid Origin/CSRF; 400 unexpected body fields |

Implemented validation: email string 3–254 characters, valid basic email format; password string 1–128 characters; reject unknown fields, arrays, null, non-JSON and malformed JSON with safe 4xx (415 for unsupported content type). No password complexity requirement at login. Request bodies limited to 16 KiB. Authentication responses use `Cache-Control: no-store`.

Implementation refinement: use a single bucket per normalized identifier plus client IP, 10 failed attempts in a fixed 15-minute window. Attempt 11 returns 429 with Retry-After until that window expires; successful login clears that bucket. This simple local-process limit resets on restart and does not prevent distributed credential attacks or provide an independent per-IP quota. Reconsider a shared limiter before cloud scaling; do not claim production-grade protection. Cap local buckets and expire stale entries so arbitrary identifiers cannot grow memory without bound. Missing/invalid bodies are rejected before credential attempts. Never log credential bodies.

Protected-route ordering: request ID → authentication → role → Origin/CSRF for mutations → body parsing/validation → service; errors reach the safe error handler. Thus anonymous protected calls return 401 before mutation Origin checks. Public login separately checks Origin and JSON before verifying credentials. Wrong role returns 403 before record lookup; inaccessible owner detail uses 404. Reject client identity/role fields. Owner filters belong in DB queries for lists/details, not just middleware.

## UI contract

The F-01 UI is BorrowBase-branded and uses shared tokens: Primary Indigo `#4F46E5`, Sky Blue `#87CEFA`, Slate `#475569`, and Off-White `#F8FAFC`. The header identifies BorrowBase and the KMUTT Computer Engineering demo context; F-02 catalog and F-03/F-04 role-specific workspaces are now integrated in the authenticated shell; their behavior belongs to their own contracts. Login has labeled email/password fields, password masked, submit pending state and inline required/format errors. Enter submits once; disable submission while pending. Server invalid-login message is generic; network failure offers retry without claiming success. Never persist password; clear on success. After `/auth/me` bootstrap, show the authenticated user's Borrower or Custodian identity without rendering protected content during bootstrap.

401 clears identity/CSRF and returns to login; never retry mutations automatically. 403 shows an access-denied state. Logout clears UI identity on confirmed success; network failure reports logout not confirmed with retry, and does not claim the server session is revoked. Login has explicit loading, invalid-credential, backend-error and authenticated states. The layout remains usable at 360px, tablet widths and 1280px without horizontal overflow; controls have visible focus, readable labels, keyboard operation, and contrast suitable for review. The green TokTickIT visual direction is not used.

## Acceptance criteria

| AC ID | Observable outcome | Planned tests |
|---|---|---|
| AC-F01-01 | Active seeded Borrower/Custodian can log in, obtain role/current identity, and use protected retrieval without exposing credentials. | TEST-F01-01; TEST-F01-PG-01 |
| AC-F01-02 | Wrong password, nonexistent email and inactive user return identical 401 error schema and create no valid Session. | TEST-F01-02; TEST-F01-PG-04 |
| AC-F01-03 | Missing, malformed, expired, revoked tokens and newly inactive User cannot access protected data; expiry equality rejects. | TEST-F01-03; TEST-F01-PG-05 |
| AC-F01-04 | Logout revokes the current session, clears cookie; token replay fails while a separate session remains valid. | TEST-F01-04; TEST-F01-PG-03 |
| AC-F01-05 | Backend role guard rejects Borrower Custodian operations; ownership queries do not expose another Borrower's records. | TEST-F01-05; TEST-F01-PG-02; TEST-F03-03/04 |
| AC-F01-06 | Stored hashes/parameters and cookie/cache settings meet the contract; responses/logs contain no secrets. | TEST-F01-06 |
| AC-F01-07 | Invalid body/Origin/CSRF cannot mutate state; valid session CSRF survives browser bootstrap and permits intended operation. | TEST-F01-07; TEST-F01-PG-05 |
| AC-F01-08 | Login limit rejects attempt 11 within window with 429; permitted use resumes after window; no fake successful login. | TEST-F01-08 |
| AC-F01-09 | BorrowBase login/bootstrap/logout/error states use the selected palette, remain understandable and usable by keyboard at 360px, tablet widths and 1280px without horizontal overflow. | TEST-F01-09; responsive/accessibility review |

Real PostgreSQL verification in `backend/tests/auth.postgres.test.ts` covers seeded login, persisted sessions, `/auth/me`, logout revocation, inactive credentials, expiry, revoked sessions, role enforcement, Origin, and CSRF. The existing API tests remain memory-backed and the UI tests remain mocked-API tests; neither establishes full browser E2E behavior.

### Executed verification and limitations

The following November 7 results are historical feature/recovery evidence. Later [integrated verification](../evidence/Sprint-1-integration-verification.md) records S1 business-endpoint role denial and cross-Borrower request/Loan isolation, closing the earlier cross-feature gap for the sampled checks. No test was rerun in this editorial audit.

Recovery verification on 7 November 2026 at implementation commit `3cfc16c` (tree-identical to original `9564bd9`): `npm ci`, Prisma validation/client generation, 35 backend tests (including five real PostgreSQL authentication tests), six mocked-API UI tests, both typechecks/builds and stacked-diff whitespace checks passed. PostgreSQL used isolated disposable `borrowbase_sys01_f01` with `SYS01_TEST_DATABASE=true`; no reset or shared schema changes. The original commits were transferred with `-x`: `d7a3ace` → `2641e73`, `939362f` → `9eb3cb8`, `9564bd9` → `3cfc16c`. Prior browser evidence below remains applicable because application code and screenshots are unchanged; it was not rerun during recovery. Historical commit references below describe the original runs, not the recovered branch's commit identities.

On 7 November 2026 at 12:27 Asia/Bangkok, the existing F-01 PostgreSQL suite was rerun against the isolated disposable `borrowbase_sys01_f01` database with `SYS01_TEST_DATABASE=true`: `npm run test -w backend -- tests/auth.postgres.test.ts` — **1 file, 5 tests passed, 0 failed** at implementation/evidence commit `939362f`, with documentation-only working-tree edits. The existing generated client worked; no schema, migration, seed or SYS-01 regression change was needed. A separate temporary-fixture PostgreSQL check confirmed that a Custodian can pass the role guard and that the same valid session returns 401 after its User becomes inactive; its temporary User/Session records were removed. This supplemental check is not an additional repository test.

The November 7 non-database rerun passed 10 backend unit tests, 20 memory-backed API tests and 6 mocked-API frontend tests, plus both typechecks and builds. Together with the five PostgreSQL authentication tests, these provide 35 backend and 6 frontend passing tests across the recorded runs. Earlier verification also passed Prisma validation/client generation. SYS-01's separate five-test regression previously passed and was not repeated for these documentation-only corrections.

Genuine prior browser QA verified Borrower/Custodian login, session restoration after refresh, logout, invalid-password feedback and backend-unavailable recovery. The five committed screenshots are in [F-01 browser evidence](../../../../artifacts/screenshots/sprint-1/f01/). Subsequent live layout measurements at 360, 390, 768 and 1280px found document scrollWidth equal to viewport width with no overflowing elements; keyboard Tab focus on the password input showed a visible 3px outline. Browser-assisted QA is distinct from the mocked UI tests; no repository-native Playwright E2E suite is claimed.

AC-F01-01–04 and AC-F01-07–09 have passing local test/browser evidence. For AC-F01-05, isolated F-01 guard checks are supplemented by the later integrated Borrower denial at real F-04 endpoints and foreign-owner 404 checks for F-03 requests/Loans. For AC-F01-06, credential hashing, session handling and local cookie/cache/response checks are verified, but deployed HTTPS/Secure-cookie behavior and comprehensive production log secrecy remain unverified. These limitations do not imply failed local tests or completed future domain authorization. Genuine red–green TDD history is not established by these passing results.

The three known high-severity Prisma dependency findings remain unresolved, as disclosed in [SYS-01](../../../sys01-database.md#dependency-audit); no Prisma upgrade is included. Login limiting remains process-local as described above. Existing team-design proposals still require review; local verification does not imply teammate approval.

## Definition of Done

- The F-01 backend uses the shared generated Prisma client and `PrismaAuthStore`; no production authentication path uses `MemoryAuthStore`.
- Seeded Borrower and Custodian authentication, session persistence/revocation, expiry, inactive-user rejection, role enforcement, Origin, and CSRF behavior pass against an isolated PostgreSQL database.
- Existing unit, memory-backed API, UI, typecheck, and build suites remain green.
- BorrowBase branding, responsive behavior, keyboard access, visible focus, labels, and error/loading states remain covered by the UI contract and tests.
- F-01 owns authentication only; integrated F-02/F-03/F-04 domain behavior remains owned by those feature modules.
- Original and recovery branch/commit references remain historical evidence. F-01 is now integrated in staging; local verification does not establish formal design approval or final release acceptance.
