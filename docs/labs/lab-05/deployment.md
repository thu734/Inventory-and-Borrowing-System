# BorrowBase Lab 5 deployment draft

Status: **First-deployment repair under review; successful live deployment remains unverified**. Updated 14 November 2026. Execution gates and issue backlog are in [implementation plan](implementation-plan.md). The official handout, Student Guide, starter kit, Group Work Specification and Deliverable 1 were reconciled for this draft.

This document distinguishes user-reported cloud state from locally verified code and historical CI evidence; no successful live deployment is asserted. The L5-04 local Docker procedure and C-03 evidence are maintained in [docker.md](docker.md). `lab5-staging` is the Lab 5 integration branch and `main` is the release branch.

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

Status: code repair and offline verification. The user reports an interrupted live attempt; the repair has been exercised locally in dry-run mode. No successful live migration, bootstrap or deployment is verified by this audit. The reference is the lecturer starter's `deploy/deploy.sh`, README and read-only smoke script; its TokTickIT paths, seed command and secret variables are not BorrowBase defaults.

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

- Enable required APIs, create missing registry/PostgreSQL 16 Enterprise `db-f1-micro` resources, and retain existing resources. New SQL uses 10 GB SSD, storage auto-increase off and a backup window; cost/availability must be reviewed before execution. Existing engine/region/edition/tier or storage-auto-increase policy mismatches and lookup errors stop the script for manual inspection; no automatic SQL patch is performed.
- Generate credentials privately and preserve existing enabled secret versions. Use Prisma's Unix-socket `host=/cloudsql/PROJECT:REGION:INSTANCE`, schema `public` and pool limit 3. Validate reused DB/CSRF secret contents without printing them. Never reset an existing DB user's password to reconstruct a missing secret.
- Grant Cloud SQL Client to dedicated runtime/maintenance accounts and secret access per secret. The public application receives only DB/CSRF secrets; seed credentials are restricted to maintenance. No WIF, deployer IAM or GitHub rules are configured here.
- `deploy/cloudbuild.yaml` builds the existing Dockerfile's `runtime` and `build` targets from one source SHA, then both images are resolved to immutable digests. `.gcloudignore` excludes local environment files, dependencies, credentials and artifacts from upload. Dockerfile, Compose and `.github/workflows/pr-ci.yml` are preserved.
- Run a single-task migration-only job with `npm run db:migrate`; failure prevents service deployment. Bootstrap is off by default. An explicitly approved `--bootstrap-demo` creates a separate job running `npm run db:seed`, with retries disabled. If that job already exists, stop for manual inspection rather than automatically re-executing it. This protects one-time bootstrap but requires separate recovery review after a failed bootstrap.
- A new service is initially private with an unusable `.invalid` browser origin while its assigned URL is obtained. Only then deploy publicly with the exact HTTPS Cloud Run origin, production cookies, port 3000, 1 CPU, 512 MiB, minimum 0 / maximum 1 instance and concurrency 20. Existing services retain their canonical origin. Origin/CSRF/RBAC code is unchanged. Traffic is directed to the latest ready revision and its image is checked against the selected digest.
- Read-only smoke uses GET `/api/health` (`status=ok`, server liveness without database access), `/api/ready` (`status=ready`, database connectivity), `/` (React HTML), `/api/v1/auth/me` (401) and an unknown API (JSON 404). Both probe responses use no-store. BorrowBase has no public categories endpoint. No smoke login, cookies or domain writes occur. Public Borrower/Custodian acceptance remains a later manual step.

Local checks: `bash -n deploy/deploy.sh`, `bash -n deploy/config.sh`, and `python3 -B -m unittest discover -s deploy/tests -p 'test_*.py' -v`. Offline tests replace every cloud invocation and HTTP request; they do not invoke the deployment entrypoint in dry-run mode. The earlier Step 5.0 checks passed; current repair checks are reported below. Historical results do not validate later edits. ShellCheck is not installed. Actual Cloud SDK acceptance, IAM propagation, builds, secret injection and public HTTPS behavior are unverified.

For Step 5.2 plan review: `DRY_RUN=1 bash deploy/deploy.sh`; include `--bootstrap-demo` only when reviewing an explicitly approved initial bootstrap. The preview prints conditional create operations and placeholders, not a verified resource inventory. It performs no cloud calls, credential generation or provisioning. A local repair dry run has completed; Cloud Shell must repeat it from the accepted repaired main release.

Future `release.sh`/workflow must source the same names, build both artifacts for the accepted main SHA, update the migration job with the **maintenance** digest and service with the **application** digest, and never invoke bootstrap on releases or rollback. Rollback skips migrations and seed. The existing PR CI is not a reusable deployment workflow; WIF/merge gates remain Member 2's L5-07 work, and main-only automatic deployment is L5-08. No release script or deployment workflow is asserted to exist yet.

## Episode 5 Step 5.1 — prepare Cloud Shell (manual, not executed)

Release prerequisite: the accepted GitHub `main` release must contain the Docker files, PR CI and the reviewed deployment repair. The repair worktree is based on main release `2e7b386a54a9e4dcc4040b6a49a9ddb9e41fce8f`, which includes L5-06; the current uncommitted repair still needs teammate review, CI and the staging-to-main release process. Verify current GitHub main rather than relying on this recorded base SHA.

Sign in to the project-owning Google account, select the project in Console, and open Cloud Shell. Verify the active CLI account matches that account:

```bash
gcloud auth list --filter=status:ACTIVE --format='value(account)'
export PROJECT_ID=cpe334-borrowbase
export REGION=asia-southeast1
gcloud config set project "$PROJECT_ID"
gcloud config get-value project
```

For a new Cloud Shell checkout:

```bash
git clone --branch main --single-branch https://github.com/thu734/Inventory-and-Borrowing-System.git
cd Inventory-and-Borrowing-System
```

For an existing checkout, inspect `git status --short` and `git branch --show-current` first. Stop if dirty or on another branch; do not reset, stash or overwrite it. On a clean `main`, update using `git pull --ff-only origin main`.

Verify the full source commit against GitHub main immediately before proceeding:

```bash
git rev-parse HEAD
git ls-remote origin refs/heads/main
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=all)"
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
git ls-files Dockerfile .dockerignore compose.yaml .github/workflows/pr-ci.yml .gcloudignore deploy docs/labs/lab-05/deployment.md
```

Every check must succeed and the listed files must be present in the accepted release. Compare the SHA with GitHub's main commit and retain non-secret evidence. A stale/mismatched checkout is a stop condition. Step 5.1 prepares Cloud Shell only; it creates no infrastructure and requires no additional repository configuration file.

## Episode 5 Step 5.2 — plan review (locally verified; repeat in Cloud Shell)

After Step 5.1 succeeds, run this in that repository folder:

```bash
DRY_RUN=1 PROJECT_ID="$PROJECT_ID" REGION="$REGION" bash deploy/deploy.sh
```

Read the planned operations in order: APIs → Artifact Registry → SQL instance/database → dedicated service accounts and Cloud SQL Client → DB user/secrets and per-secret access → Cloud Build for runtime/maintenance images → migration job → Cloud Run service. The URL, digests and revision in the preview are placeholders. Printed commands and the summary are simulation only, not deployment evidence. Repeat this plan review after every script change; the local dry run does not establish successful Cloud Shell preparation or cloud deployment. Optional initial bootstrap needs separate authorization and is never part of routine release.

## Episode 5 Steps 5.3–5.8 — authorized live verification and evidence

These are instructions for a later authorized operator, not operations executed by this audit. Last user-observed state: `borrowbase-pg` RUNNABLE, PostgreSQL 16, `db-f1-micro`, storage auto-increase disabled; registry `borrowbase` exists; database `borrowbase`, BorrowBase identities/secrets, images and Cloud Run resources were absent. State can change; verify it before execution. Preserve existing SQL/registry resources. The corrected explicit HTTP 404 classification permits missing-resource creation; 403, network and ambiguous failures stop. An existing DB user without its secret, an empty/disabled secret version, or an existing bootstrap job requires manual reconciliation without credential rotation, deletion or automatic reseeding.

### 5.3 First deployment and failure recovery

Only after the reviewed repaired main release is accepted, Step 5.1 matches that exact clean main SHA, Step 5.2 has been reviewed, and billing/budget/quota/operator prerequisites are confirmed, the authorized operator uses `PROJECT_ID="$PROJECT_ID" REGION="$REGION" bash deploy/deploy.sh`. Expect a lengthy SQL/build operation; do not interrupt it. Default behavior migrates but never creates synthetic accounts. Initial synthetic bootstrap is a separately approved `--bootstrap-demo` operation; plan that approval before the first login acceptance test.

Stop on any failure. The preceding command is redacted; Cloud Build failures point to the build history, and job failures print a read-only execution-list command. Inspect the exact failed execution and its logs privately in Console before retrying. Never publish raw logs or secret values. The script does not reset failed migrations, overwrite secret versions, change existing passwords, delete resources or automatically rerun an existing bootstrap job. A failed seed may have partially created records: inspect and authorize recovery separately. A failed smoke test is a failed release, even if a revision already receives traffic; automatic rollback is not implemented.

### 5.4 Verify storage policy

New SQL creation disables auto-increase. Reused SQL must already have it disabled, the reviewed edition/tier and engine/region, otherwise the script stops rather than patching. Verify `borrowbase-pg` in Cloud SQL Console: PostgreSQL 16, Enterprise, `db-f1-micro`, database `borrowbase`, storage auto-increase off. This meets the guide's desired state without redundantly patching the already-correct instance. Any needed policy change requires separate authorization. Cloud SQL remains billable while the app is idle; Cloud Run's maximum 1 is per revision and is not a strict service-wide cost cap during rollout.

### 5.5 Public URL, probes, smoke and browser workflow

For a later authorized verification session, retrieve the assigned URL with explicit project/region:

```bash
SERVICE_URL=$(gcloud run services describe borrowbase --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')
printf '%s\n' "$SERVICE_URL"
curl --fail --show-error "$SERVICE_URL/api/health"
curl --fail --show-error "$SERVICE_URL/api/ready"
python3 deploy/smoke_test.py "$SERVICE_URL"
```

Require HTTPS and the exact assigned origin. Health must return HTTP 200 with `{"status":"ok"}`; it is public, read-only and makes no database call. Readiness must return HTTP 200 with `{"status":"ready"}` and `Cache-Control: no-store` when connected; unavailable DB returns 503. Startup itself still requires the initial DB connection. Smoke checks only GET health, readiness, HTML, anonymous identity (401) and an unknown API (JSON 404). Neither a printed URL nor a completion banner proves these responses.

Open the public URL in a fresh browser without localhost or Google IAM sign-in. Verify the login page and same-origin API calls. Use separate private browser sessions for Borrower and Custodian: Borrower requests a SERVICEABLE available asset; Custodian checks out that pending request; Borrower sees the resulting active Loan. Verify a rule rejection (for example a duplicate pending request) and a role restriction. If the catalog is stale after checkout, explicitly Refresh Equipment and record that known UI limitation. Check Secure/HttpOnly/SameSite=Lax cookie flags, exact HTTPS Origin acceptance, bad-Origin and missing/bad-CSRF rejection privately; never capture cookie/token values or login request bodies.

### 5.6 BorrowBase initial access — private, not TokTickIT administrator access

BorrowBase has only Borrower and Custodian roles. It has no administrator role, public user-creation flow, or forced first-login password-change feature. Do not create or require a TokTickIT administrator. Approved synthetic identities are defined by the seed; generated passwords belong only in the bootstrap job's Secret Manager references and the team's approved private credential channel.

After an explicitly approved successful bootstrap execution, inspect the job's secret-reference metadata and record the **numeric versions actually used**, without viewing values in evidence mode. Only the authorized operator may privately retrieve the corresponding `borrowbase-seed-borrower-password` and `borrowbase-seed-custodian-password` versions for login. For example, after setting `BORROWER_SEED_VERSION` from that verified reference, `gcloud secrets versions access "$BORROWER_SEED_VERSION" --secret=borrowbase-seed-borrower-password --project="$PROJECT_ID"` is a private credential-reading operation, not an evidence command. Handle the Custodian reference the same way. Do not assume `latest` matches an existing account's password: seed preserves existing accounts, including previously changed credentials. Failed login requires private reconciliation, never reseeding or automatic password reset.

Do not screen-record, screenshot, tee, paste, log or attach the private retrieval output, login forms, passwords, session cookies, CSRF tokens or connection strings. Do not send credentials to an Issue or chat. Share only through the approved private channel. If bootstrap was not requested, completion means no synthetic accounts were established by that invocation; login acceptance remains outstanding.

### 5.7 Console inspection and safe evidence index

Collect sanitized evidence only after the app works. In Secret Manager evidence views, show names and permissions; never click View secret value. Record actual evidence links/timestamps and the tested source SHA in the Issue or this document; leave unavailable observations marked pending.

| Evidence | Verify / capture without secrets |
|---|---|
| APIs | Enabled Cloud Run, SQL Admin, Artifact Registry, Cloud Build, Secret Manager and IAM APIs |
| SQL | `borrowbase-pg`, engine/edition/tier/region, `borrowbase` database and auto-increase disabled |
| Identities | `borrowbase-runtime` and `borrowbase-maintenance`; project-level Cloud SQL Client only for these application identities; inspect inherited roles too |
| Secret permissions | Runtime: DB/CSRF; maintenance: DB plus approved bootstrap password secrets; Secret Accessor per secret, never project-wide; no values |
| Runtime configuration | NODE_ENV=production, exact HTTPS APP_ORIGIN, PORT=3000; DB/CSRF secret references with numeric versions; no seed-password injection into the app |
| Scaling/public access | Minimum 0, maximum 1 per revision, concurrency 20, public demo access with application authentication retained |
| Build/images | Successful build record; both registry images tagged with the full accepted source SHA and their immutable digests |
| Migration | `borrowbase-migrate` successful execution before service release, maintenance digest and identity; sanitized execution ID/result |
| Revision/traffic | Ready `borrowbase` revision, application digest matching the image evidence and current traffic at 100% |
| Public application | Actual HTTPS URL, health/readiness responses, read-only smoke PASS output, credential-free login page and authenticated role/workflow screenshots |
| Release trace | Reviewed release PR and CI → full source SHA → image digests → ready revision → public URL; record actual values, not simulation placeholders |

TZ is not an application setting in BorrowBase: it stores database timestamps and formats dates in the browser. Document this deliberate difference from the Kit rather than adding unused environment configuration. The guide's maximum 3 is adapted to the stricter reviewed maximum 1.

### 5.8 Completion gate

Do not close the first-deployment Issue based on offline tests or the banner. First verify public HTTPS login, DB readiness, both application roles and the core workflow; verify SQL/database, identities, limited secret permissions, images and storage policy. Post the public service URL and sanitized 5.5/5.7 evidence with the exact tested SHA and migration result to the team's Episode 5 Issue. Move it to Done only after review confirms those observations and no secrets appear in evidence. No such live completion is claimed here.

## Episode 6–8 compatibility contract (future work, not implemented here)

Retain the names in `deploy/config.sh`: project `cpe334-borrowbase`, region `asia-southeast1`, service `borrowbase`, migration job `borrowbase-migrate`, runtime `borrowbase-runtime`, maintenance `borrowbase-maintenance`, registry `borrowbase`, images `borrowbase` and `borrowbase-maintenance`. Both tags must be the same full source SHA. Later releases update the migration job with the maintenance digest and the service with the application digest. Never point the job at the runtime image, which intentionally lacks Prisma CLI/migrations/seed tooling.

- Episode 6: first finish live Episode 5 evidence. Enable IAM Credentials and STS APIs when authorized. Establish actual repository/owner IDs, project number and OIDC subject format; create a separate `borrowbase-deployer`, registry-scoped Artifact Registry Writer, Cloud Run Developer and Service Account User **on both runtime and maintenance identities**. Do not give the deployer secret-value access, SQL admin or general IAM management. Configure keyless WIF restricted to repository/owner IDs, main ref, exact deployment workflow_ref and exact environment subject. Keep pool/provider names consistent (the inventory names are proposals). GitHub environment `demo`, WIF subject and workflow environment must agree. Required variable names are `GCP_PROJECT_ID`, `GCP_REGION`, `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`; values require actual verified IDs. Configure active main rules, empty bypass, teammate review, up-to-date branches and the existing four required CI checks; prove a deliberately failing PR is blocked. No JSON service-account keys.
- Episode 7: add adapted `deploy/release.sh`, `.github/workflows/deploy.yml` and focused offline release tests through review. Existing PR CI has no `workflow_call` trigger and uses pull-request-specific context: either safely refactor it into reusable jobs while preserving existing PR behavior, or run equivalent tests in the deploy workflow. Do not call the Kit's reusable CI path unchanged. Gate production on passing checks for the exact main SHA, serialize releases (`cancel-in-progress: false`), use id-token permission only for deployment, build/push both images, resolve digests, migrate then update service/traffic, run the read-only smoke and publish SHA/digest/revision/URL evidence. Prove two automatic releases. Do not run first-provisioning or bootstrap from the release workflow.
- Optional Episode 7 login smoke is intentionally unsupported by the current GET-only checker. The app can authenticate a low-privilege Borrower with exact Origin, JSON, a cookie jar, CSRF and logout, but login/logout write session records. There is no self-service account creation, no dedicated smoke account, and the guide prohibits reusing a demo account for this check. Deliberately skip optional login for now; do not set `SMOKE_EMAIL`/`SMOKE_PASSWORD` expecting the current checker to use them. Later opt-in work would require an independently approved dedicated account and a separately reviewed session-writing test with sanitized errors and reliable logout. Keep the default release smoke read-only.
- Episode 8: retain successful releases A and B with immutable images and evidence. Create BorrowBase Request/Loan data before restart/redeploy and record non-secret IDs/state; verify the same data and eligible session survive. Sessions are in SQL and require the same DB/CSRF references; an expired/revoked session is not a persistence failure. Review additive migration compatibility before rolling back. Rollback and SHA-based roll-forward must skip tests/build/migration/seed, update only the app image and traffic, then smoke-test. Never reverse migrations or reset the database. BorrowBase has no attachment feature, so checksum evidence is not applicable. The existing manual traffic-rollback template is not the Episode 8 pipeline implementation.

## CI, release and identity

PR CI is implemented in [`.github/workflows/pr-ci.yml`](../../../.github/workflows/pr-ci.yml). It runs on pull requests targeting `lab5-staging` and `main`, with stable checks named `Typecheck and build`, `Unit, API and UI tests`, `PostgreSQL integration tests`, and `Docker build`. The workflow reproducibly installs from the npm workspace lockfile, generates Prisma Client, runs the checks, and builds (but does not publish or deploy) the production image for `linux/amd64`. PostgreSQL integration tests use four separate guarded databases; only F-01 is seeded. See the [C-01 record](implementation-plan.md) for the database mapping and current evidence status.

The 14 November 2026 audit verified that PR #43 at head `a422d39cce237fefbfd7e573354cd90930fc7bce` had all four stable checks and the evidence summary passing in [Actions run 43584086269](https://github.com/thu734/Inventory-and-Borrowing-System/actions/runs/43584086269). These results predate the uncommitted audit corrections and do not validate them. Deliberate failing-PR evidence is not revalidated by this audit. No repository rules or branch protection settings were changed.

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

Local repair tests and the guarded dry-run entrypoint are executed during the final audit; their actual results are reported with the review. No cloud resource inspection, live deployment, persistence or rollback is performed by that audit. Historical Sprint 1 results and limits are in [integration evidence](../../sprints/sprint-1/evidence/Sprint-1-integration-verification.md). Known Prisma audit findings, process-local limiter and incomplete accessibility/race/clean-checkout evidence remain disclosed.

For each future operation, record episode/issue, owner/reviewer, branch/PR/tested SHA, files, exact commands and actual results, sanitized evidence, variable names, blockers and next safe action using the [handoff format](implementation-plan.md#8-kanban-and-handoff). Reviewer approval and permanent task ownership remain pending.
