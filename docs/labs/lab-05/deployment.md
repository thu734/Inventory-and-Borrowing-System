# BorrowBase Lab 5 deployment draft

Status: **Docker implementation available; cloud deployment remains planned**. Updated 14 November 2026. Execution gates and issue backlog are in [implementation plan](implementation-plan.md). The official handout, Student Guide, starter kit, Group Work Specification and Deliverable 1 were reconciled for this draft.

No cloud resource, deployment or CI run is asserted to exist by this document. The L5-04 local Docker procedure and C-03 evidence are maintained in [docker.md](docker.md). `lab5-staging` is the Lab 5 integration branch and `main` is the release branch.

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

## Existing production runtime contract

The Docker build installs from the shared workspace lockfile, generates Prisma Client, builds backend and frontend, and runs `node backend/dist/server.js` with the production dependencies and built static assets. Local build/run and C-03 evidence are tracked in [docker.md](docker.md).

The existing server mounts real API routes before the built frontend and guarded browser SPA fallback. Production-runtime tests cover static delivery and JSON 404 behavior for unknown APIs and missing assets. The static path is resolved from the server module, not the process working directory.

Required probe: `/api/ready` returns success when PostgreSQL is reachable and HTTP 503 when it is not, without exposing SQL errors or secrets. Existing startup connects DB before listening, handles SIGTERM/SIGINT and disconnects after server close. Avoid unnecessary proxy trust; assess IP-based limiter behavior behind Cloud Run before any change.

Production security verification must show Secure, HttpOnly, SameSite=Lax cookies under actual HTTPS, exact Origin acceptance, bad Origin/CSRF rejection, Borrower/Custodian role boundaries and no sensitive response/log leakage. Local HTTP results cannot establish deployed cookie behavior. Session records and CSRF secret must persist across revisions; login limiter remains process-local and is not distributed protection.

## Docker and local PostgreSQL

The local application and isolated PostgreSQL Compose workflow, explicit migration/seed commands, HTTP-vs-HTTPS limitations and C-03 evidence are documented in [docker.md](docker.md). It is separate from cloud deployment and must not be used to infer production HTTPS-cookie behavior. Database test jobs require different guarded DB names; see [plan §7](implementation-plan.md#7-episode-2-actionable-checklist).

## Migrations and seed policy

Committed Prisma migrations are authoritative. `npm run db:migrate` invokes `prisma migrate deploy`; never use production reset, schema push or `migrate dev`. The L5-04 `build` target retains Prisma CLI, schema, migrations, seed and tsx; the final `runtime` target intentionally excludes maintenance tooling. Application startup performs neither migration nor seeding.

The reviewed seed creates missing approved accounts/models/assets without updating existing credentials, roles, active flags, descriptions, associations, requests, loans or sessions. It validates required configuration before writes and sanitizes CLI failures. It is retryable, not fully transactional; a failed run can leave newly created records. Bootstrap remains separately authorized, never automatic on routine deployment. Do not upload local database contents or Sprint 1 verification fixtures.

## Episode 5 Step 5.0 — local script adaptation

Status: code preparation only. No Step 5.1 Cloud Shell access, Step 5.2 deployment dry run, cloud resource verification, migration or bootstrap has been performed for this adaptation. The reference is the lecturer starter's `deploy/deploy.sh`, README and read-only smoke script; its TokTickIT paths, seed command and secret variables are not BorrowBase defaults.

`deploy/config.sh` is the naming contract for this script and future `release.sh`/deployment workflow:

| Item | Prepared value |
|---|---|
| Project / region | `cpe334-borrowbase` / `asia-southeast1` |
| Registry / application image | `borrowbase` / `borrowbase` |
| Maintenance image | `borrowbase-maintenance` |
| SQL instance / database / user | `borrowbase-pg` / `borrowbase` / `borrowbase` |
| Runtime / maintenance identities | `borrowbase-runtime` / `borrowbase-maintenance` |
| Migration / explicit bootstrap jobs | `borrowbase-migrate` / `borrowbase-bootstrap` |
| Runtime secrets | `borrowbase-database-url`, `borrowbase-csrf-secret` |
| Bootstrap-only secrets | `borrowbase-seed-borrower-password`, `borrowbase-seed-custodian-password` |

Names are planned, not verified resources. Future real execution requires a clean checkout matching current remote `main`; a feature branch can be previewed only. `PROJECT_ID`/`REGION` accept the future workflow's `GCP_PROJECT_ID`/`GCP_REGION` aliases and reject a different project/region. Reviewed release, current passing checks, L5-02 billing/budget evidence, quotas, existing-resource inventory and operator authorization remain prerequisites. THB 1,800 is alerts-only; this script does not create or change billing/budgets.

Prepared behavior:

- Enable required APIs, create missing registry/PostgreSQL 16 Enterprise `db-f1-micro` resources, and retain existing resources. New SQL uses 10 GB SSD, storage auto-increase off and a backup window; cost/availability must be reviewed before execution. Existing engine/region mismatches or lookup errors stop the script.
- Generate credentials privately and preserve existing enabled secret versions. Use Prisma's Unix-socket `host=/cloudsql/PROJECT:REGION:INSTANCE`, schema `public` and pool limit 3. Validate reused DB/CSRF secret contents without printing them. Never reset an existing DB user's password to reconstruct a missing secret.
- Grant Cloud SQL Client to dedicated runtime/maintenance accounts and secret access per secret. The public application receives only DB/CSRF secrets; seed credentials are restricted to maintenance. No WIF, deployer IAM or GitHub rules are configured here.
- `deploy/cloudbuild.yaml` builds the existing Dockerfile's `runtime` and `build` targets from one source SHA, then both images are resolved to immutable digests. `.gcloudignore` excludes local environment files, dependencies, credentials and artifacts from upload. Dockerfile, Compose and `.github/workflows/pr-ci.yml` are preserved.
- Run a single-task migration-only job with `npm run db:migrate`; failure prevents service deployment. Bootstrap is off by default. An explicitly approved `--bootstrap-demo` creates a separate job running `npm run db:seed`, with retries disabled. If that job already exists, stop for manual inspection rather than automatically re-executing it. This protects one-time bootstrap but requires separate recovery review after a failed bootstrap.
- A new service is initially private with an unusable `.invalid` browser origin while its assigned URL is obtained. Only then deploy publicly with the exact HTTPS Cloud Run origin, production cookies, port 3000, 1 CPU, 512 MiB, minimum 0 / maximum 1 instance and concurrency 20. Existing services retain their canonical origin. Origin/CSRF/RBAC code is unchanged. Traffic is directed to the latest ready revision and its image is checked against the selected digest.
- Read-only smoke uses GET `/api/ready` (`status=ready`, no-store), `/` (React HTML), `/api/v1/auth/me` (401) and an unknown API (JSON 404). BorrowBase has no `/api/health` or public categories endpoint. No smoke login, cookies or domain writes occur. Public Borrower/Custodian acceptance remains a later manual step.

Local checks: `bash -n deploy/deploy.sh`, `bash -n deploy/config.sh`, and `python3 -B -m unittest discover -s deploy/tests -p 'test_*.py' -v`. Offline tests replace every cloud invocation and HTTP request; they do not invoke the deployment entrypoint in dry-run mode. Executed Step 5.0 checks passed: both Bash syntax checks, Python syntax parsing, Cloud Build YAML parsing with Ruby/Psych, and 14 offline unit/stub tests. ShellCheck is not installed. Actual Cloud SDK acceptance, IAM propagation, builds, secret injection and public HTTPS behavior are unverified.

For the user's later Step 5.2 only: `DRY_RUN=1 bash deploy/deploy.sh`; include `--bootstrap-demo` only when reviewing an explicitly approved initial bootstrap. The preview prints conditional create operations and placeholders, not a verified resource inventory. It performs no cloud calls, credential generation or provisioning. This command has not been executed during Step 5.0.

Future `release.sh`/workflow must source the same names, build both artifacts for the accepted main SHA, update the migration job with the **maintenance** digest and service with the **application** digest, and never invoke bootstrap on releases or rollback. Rollback skips migrations and seed. The existing PR CI is not a reusable deployment workflow; WIF/merge gates remain Member 2's L5-07 work, and main-only automatic deployment is L5-08. No release script or deployment workflow is asserted to exist yet.

## CI, release and identity

PR CI is implemented in [`.github/workflows/pr-ci.yml`](../../../.github/workflows/pr-ci.yml). It runs on pull requests targeting `lab5-staging` and `main`, with stable checks named `Typecheck and build`, `Unit, API and UI tests`, `PostgreSQL integration tests`, and `Docker build`. The workflow reproducibly installs from the npm workspace lockfile, generates Prisma Client, runs the checks, and builds (but does not publish or deploy) the production image for `linux/amd64`. PostgreSQL integration tests use four separate guarded databases; only F-01 is seeded. See the [C-01 record](implementation-plan.md) for the database mapping and current evidence status.

The workflow has not yet run on GitHub; successful PR evidence, a tested hosted SHA/run URL and deliberate failing-PR evidence remain pending. The Actions summary and job logs will record these once a PR run occurs. No repository rules or branch protection settings were changed.

Recommended required checks for both `lab5-staging` and `main`: the four stable check names above. Configure the rules only after confirming the actual check names from the first Actions run. PR CI has only `contents: read` token permission and receives no cloud auth or production secrets. Root `test:api` alone currently runs only authentication; the CI backend test command excludes the separately guarded PostgreSQL suites, which have their own job and explicit database setup. Blanket `npm test` is not used.

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
