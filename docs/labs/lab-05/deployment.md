# BorrowBase Lab 5 deployment draft

Status: **planned, not deployed or verified**. Updated 14 November 2026. Execution gates and issue backlog are in [implementation plan](implementation-plan.md). The official handout, Student Guide, starter kit, Group Work Specification and Deliverable 1 were reconciled for this draft.

No cloud resource, deployment, Docker build or CI run is asserted to exist by this document. `lab5-staging` is the Lab 5 integration branch and `main` is the release branch.

## Architecture and resource inventory

Browser → one HTTPS Cloud Run service (compiled Express + built React) → Prisma → Cloud SQL PostgreSQL. Artifact Registry stores versioned images; Secret Manager supplies secrets; GitHub Actions authenticates through restricted WIF. Runtime identity and deployment identity are separate and least-privilege. Main is release; lab5-staging is integration. Node 24.14+ within 24.x, shared npm workspace lockfile, Prisma 6.19 and Argon2 require compatible native Linux artifacts.

| Resource | Proposal | Actual / evidence |
|---|---|---|
| Project ID | `cpe334-borrowbase` | Verified by the team; resource inventory still pending |
| Region | `asia-southeast1`, subject to quota and cost review | Preferred; quota evidence pending |
| Cloud Run | `borrowbase` | Pending |
| Artifact Registry repository | `borrowbase`, image `borrowbase` | Pending |
| Cloud SQL instance / database | `borrowbase-pg` / `borrowbase` | Pending sizing/version/connection policy |
| Secret resources | `borrowbase-database-url`, `borrowbase-csrf-secret` | Pending; never record values |
| Runtime / deploy identities | `borrowbase-runtime` / `borrowbase-deployer` | Pending permissions review |
| WIF pool / provider | `borrowbase-github` / `github` | Pending trust configuration |
| Canonical HTTPS origin | Actual stable Cloud Run service URL, no path/trailing slash | Pending |
| Latest main SHA / digest / revision | To be filled after deployment | None verified |

Prefer managed Cloud SQL connection through an approved supported connector/socket path and runtime Cloud SQL access; verify exact Prisma PostgreSQL URL and host/socket behavior against starter/current official guidance before implementation. Do not invent a URL or enable broad database network access to solve connectivity. Bound Prisma pool/Cloud Run instance counts against SQL capacity; start with the smallest supported configuration meeting the handout and observed load. Final size, max instances, connection limit and cost estimate require confirmation; no arbitrary settings asserted.

## Environment and secrets

| Name | Purpose / proposed source | Present source behavior |
|---|---|---|
| NODE_ENV | `production`, service configuration | Validated; selects Secure cookies |
| PORT | Cloud Run injected value; listen on accessible interface | Validated integer, defaults 3000; unspecified listener host is compatible |
| APP_ORIGIN | Exact canonical HTTPS origin, non-secret configuration | Exact origin validation; production requires HTTPS |
| DATABASE_URL | Secret Manager reference; least-privilege app DB access | Required; Prisma reads it; do not print URL |
| CSRF_SECRET | Secret Manager; strong random value, stable across revisions | Min length validated, placeholder rejected; rotation invalidates existing CSRF derivation |
| RELEASE_SHA | Proposed image build/release metadata | Not currently implemented; bind to built commit, not an unrelated deploy-time value |
| SEED_BORROWER_PASSWORD / SEED_CUSTODIAN_PASSWORD | Controlled one-time synthetic bootstrap only, minimum 12 characters | Never routine runtime or public log data |
| SYS01_TEST_DATABASE | Isolated test processes only | Must be true for protected PG test suites; never production configuration |

Root environment examples serve CLI/seed; backend examples serve development. Existing example DB names differ: align local URLs explicitly. Never commit env files, service account JSON keys, credentials, tokens, cookies, full secret-bearing URLs or unredacted console output. Frontend Vite variables are public; no secrets there. Keep same-origin relative `/api/v1` requests; no permissive CORS workaround. A public demo still requires Borrower/Custodian application authentication; share grading credentials using the approved private channel after lecturer requirements are known.

## Episode 2 production procedure to implement and verify

Proposed build from repository root: `npm ci`, `npm run db:generate`, `npm run build`. Proposed compiled start: `node backend/dist/server.js`; production script and static serving are currently absent. Runtime must include generated Prisma client/native engine, Argon2-compatible dependencies, backend output and frontend output. It must work without Vite development server and without development env files.

Mount real API routes first, built frontend next and guarded browser SPA fallback before final error handler. Unknown API URLs must remain safe JSON 404; missing static files must not become HTML responses. Keep production static path independent of shell working directory. Express 5 fallback syntax must be tested.

Required probe: `/api/ready` must return success when PostgreSQL is reachable and HTTP 503 when it is not, without exposing SQL errors or secrets. It does not exist yet and is an Episode 2 deployment blocker. Existing startup connects DB before listening, handles SIGTERM/SIGINT and disconnects after server close; verify bounded shutdown and connection cleanup in future tests. Avoid unnecessary proxy trust; assess IP-based limiter behavior behind Cloud Run before any change.

Production security verification must show Secure, HttpOnly, SameSite=Lax cookies under actual HTTPS, exact Origin acceptance, bad Origin/CSRF rejection, Borrower/Custodian role boundaries and no sensitive response/log leakage. Local HTTP results cannot establish deployed cookie behavior. Session records and CSRF secret must persist across revisions; login limiter remains process-local and is not distributed protection.

## Docker and local PostgreSQL procedure — planned, not executed

Expected files: root Dockerfile, .dockerignore and compose.yaml, subject to starter conventions. Use workspace-root build context, lockfile install, matching Linux build/runtime base and Prisma generation before packaging. Exclude env/git/test secrets and unnecessary artifacts. Prefer a multi-stage Debian-based Node image to simplify native compatibility; pin a reviewed version within current engine range. Do not copy host node_modules into Linux image.

Later workflow:

1. Inspect rendered compose config without exposing substituted secrets (`docker compose config --quiet`). Build images with `docker compose build`.
2. Start dedicated local DB with named volume and readiness; inject local synthetic configuration. Actual service names/commands must be filled after compose exists.
3. On that explicitly identified disposable development database, run committed migration deploy and deliberate initial synthetic seed. Never use cloud/shared DB for tests.
4. Start app, exercise login/catalog/request/checkout/active Loan and rejection cases; record SHA/image/platform and actual outputs.
5. Restart app, then DB with volume retained; verify same record IDs and eligible session. `docker compose down -v` is excluded from normal procedure.

No Docker/local-DB result is verified yet. Database test jobs require different guarded DB names; see [plan §7](implementation-plan.md#7-episode-2-actionable-checklist).

## Migrations and seed policy

Committed Prisma migrations are the authority. `npm run db:migrate` currently invokes `prisma migrate deploy`; no production `migrate dev`, reset or schema push. Generate client at build time. Choose a controlled migration runner with DB connectivity (proposed dedicated Cloud Run job from the same image, pending guide/cost review). Run migration once before updating service traffic; stop release on failure. No per-instance startup migrations.

Bootstrap synthetic accounts/equipment once with authorized secret inputs and recorded result; do not routinely rerun seed, which rewrites passwords and equipment serviceability. No production seed in Docker build/CD startup. Do not add schema changes merely to deploy. If a later migration is necessary, review backward compatibility and backup/recovery before release; traffic rollback cannot undo schema changes.

## CI, release and identity — planned

PRs from small branches target lab5-staging; reviewed release PR targets main. Teammate approval and stable CI gates must precede merge. CI should reproducibly install/generate/typecheck/build, build the Docker image, and run explicit unit, all API, UI and guarded PostgreSQL suites. Root test:api currently runs authentication only; blanket npm test cannot satisfy incompatible database guards.

WIF trust must restrict repository and permitted main deployment context; no long-lived JSON keys. Fork/feature PR CI must not receive cloud credentials. Keep runtime access limited to its required secrets/SQL; deployer receives only necessary registry, rollout and controlled migration permissions, not general owner privileges.

Only successful accepted main CI for the exact release SHA may deploy; serialize releases. Build/publish SHA-tagged image, record immutable digest, run approved migration, deploy digest, then smoke test. No deployments from lab5-staging. Manual first deployment must also use an accepted main commit. Rollout fails visibly if smoke fails; do not record green acceptance from mere service creation.

Required release evidence chain: main commit → release PR/review → CI run → image tag and digest → Cloud Run revision/traffic → HTTPS URL and reported RELEASE_SHA → smoke timestamp/result. Record actual fields here or link issue evidence after execution; none currently populated. Preserve known-good image/revision for rollback and grading.

## Persistence and rollback — planned

Use approved synthetic fixtures: Borrower logs in and requests eligible asset, Custodian checks out, Borrower retrieves active Loan. Record non-secret IDs/status and eligible session behavior. Replace/restart application revision without reseeding; verify same user/session/request/Loan and derived unavailability. Separate browser refresh, re-login, app replacement and database restart evidence; they prove different properties.

Before rollback, select previous healthy digest/revision and verify DB schema plus secrets compatibility. Authorized traffic rollback command template:

```bash
gcloud run services update-traffic SERVICE --to-revisions PREVIOUS=100 --region REGION --project PROJECT_ID
```

Replace every placeholder from verified inventory before use. Confirm traffic and release SHA, then rerun health/readiness, HTTPS auth/CSRF and persistence smoke. Record forward recovery to approved release. Never reset/seed the DB to make rollback pass. No rollback executed or proven yet.

## Troubleshooting and cost precautions

| Symptom | Next diagnostic / safe action |
|---|---|
| Container will not start | Inspect redacted logs, injected PORT, compiled entrypoint, asset paths and native engine compatibility; do not print env |
| Ready fails / Prisma cannot connect | Check project/region, SQL connection target, runtime IAM, secret version, network/socket and pool limits; do not broaden public DB access blindly |
| UI works but login fails | Check exact HTTPS APP_ORIGIN, same-origin API path, cookie attributes and Origin/CSRF headers; do not disable guards |
| API miss returns HTML | Correct SPA fallback order/path tests; preserve JSON error handling |
| Cookie lost after revision | Check stable secret/DB and session expiry, distinguish new login from persisted session |
| CD unauthorized | Inspect WIF repository/main claim and least-privilege bindings; never replace with JSON key workaround |
| Migration/smoke fails | Stop rollout, inspect sanitized result; previous traffic only if compatible; preserve records |
| Catalog still says Available after checkout | Known Sprint 1 UI freshness defect; explicit Refresh Equipment shows DB/API state. Record limitation, propose narrow fix if mandatory check requires it |

The planning brief reports an Active Free Trial/remaining credit and alerts-only **THB 1,800**, with actual-cost thresholds **10%, 25%, 50%, 90%** (THB 180, 450, 900, 1,620). Keep these values; project billing, budget scope/recipients and configuration screenshots remain pending. **Budget alerts do not stop spending.** Do not substitute the guide's USD example.

Before provisioning, confirm project, quotas, region, smallest adequate SQL configuration and estimated costs. Limit scaling to DB capacity; monitor SQL, storage/backups, registry and any network charges even when Cloud Run is idle. Do not infer all services are free from trial status. Preserve service/grader access through lecturer-confirmed grading date (pending). Record monitoring contact and cadence when both members agree; later cleanup requires explicit approval and a retained-data decision, followed by billing verification.

## Actual verification and handover record

No new tests, cloud resource inspection, deployment, persistence or rollback executed in this planning task. Historical Sprint 1 results and limits are in [integration evidence](../../sprints/sprint-1/evidence/Sprint-1-integration-verification.md). Known Prisma audit findings, process-local limiter and incomplete accessibility/race/clean-checkout evidence remain disclosed.

For each future operation, record episode/issue, owner/reviewer, branch/PR/tested SHA, files, exact commands and actual results, sanitized evidence, variable names, blockers and next safe action using the [handoff format](implementation-plan.md#8-kanban-and-handoff). Reviewer approval and permanent task ownership remain pending.
