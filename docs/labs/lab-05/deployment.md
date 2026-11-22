# BorrowBase Deployment Runbook

## 1. Overview and Technology Stack

Browser → one HTTPS Cloud Run service serving React/Vite assets and the Express API → Prisma → Cloud SQL PostgreSQL. The runtime uses Node 24.14+ within 24.x, Prisma 6.19 and Argon2. Artifact Registry stores images; Secret Manager supplies credentials; GitHub Actions authenticates through Workload Identity Federation (WIF).

The infrastructure follows Student Guide V1.1. BorrowBase-specific adaptations are npm workspaces, separate application (`runtime`) and maintenance (`build`) images, Borrower/Custodian roles instead of an administrator, and a GET-only smoke test with no login/session writes. There is no registration or attachment feature; `TZ` is not an application setting. Local container instructions and historical build results are in [docker.md](docker.md).

**Canonical URL:** https://borrowbase-fniy3qjctq-as.a.run.app

Cloud Run `status.url` and deployed `APP_ORIGIN` are confirmed to match this origin exactly, with no path or trailing slash. The [frontend](../../../frontend/src/lib/api-client.ts) uses relative `/api/v1` requests and same-origin cookies. The [backend](../../../backend/src/app.ts) rejects login when `Origin` differs from `APP_ORIGIN`; an alternate hostname for the same service is a different origin. Preserve exact Origin/CSRF checks and production Secure, HttpOnly, SameSite=Lax cookies.

Manual verification on Release B confirmed Borrower login, duplicate pending-request rejection, request status `FULFILLED`, asset availability `Unavailable` and an active Loan for Demo Borrower. These observations establish the displayed checkout outcome; they do not alone show the actual Custodian action or establish additional automated/security tests. Use **Refresh Equipment** if the catalog remains stale after checkout.

<a id="architecture-and-resource-inventory"></a>

## 2. GCP Resource Configuration

| Resource | Configuration |
|---|---|
| Project / region | `cpe334-borrowbase` / `asia-southeast1` |
| Cloud Run service | `borrowbase` |
| Observed Cloud Run scaling | Maximum **3 instances**, confirmed by the team in Cloud Run Console |
| Cloud SQL instance / database / user | `borrowbase-pg` / `borrowbase` / `borrowbase`; confirmed PostgreSQL **16.15** |
| Artifact Registry repository / images | `borrowbase` / `borrowbase`, `borrowbase-maintenance` |
| Runtime / maintenance / deployment identities | `borrowbase-runtime` / `borrowbase-maintenance` / `borrowbase-deployer` |
| Migration / bootstrap jobs | `borrowbase-migrate` / `borrowbase-bootstrap` |
| Runtime secrets | `borrowbase-database-url`, `borrowbase-csrf-secret` |
| Bootstrap-only secrets | `borrowbase-seed-borrower-password`, `borrowbase-seed-custodian-password` |
| WIF pool / provider | `github-actions` / `github-main` |
| GitHub deployment environment | `demo`, restricted to `main` |

[deploy/config.sh](../../../deploy/config.sh) defines resource names. [Initial provisioning](../../../deploy/deploy.sh) requests PostgreSQL 16 Enterprise `db-f1-micro`, 10 GB SSD with auto-increase off; Cloud Run port 3000, 1 CPU, 512 MiB, minimum 0 / maximum 1 instance and concurrency 20. These are script settings: the live maximum is **3**, while the script still specifies `--max-instances=1`. Review this difference before provisioning recovery. The database connection uses the Cloud SQL Unix socket `/cloudsql/cpe334-borrowbase:asia-southeast1:borrowbase-pg`, schema `public` and pool limit 3. Inspect live metadata before changing resources.

Use separate runtime, maintenance and deployment identities with limited SQL, registry, Run and per-secret permissions. WIF should restrict the repository/owner, main ref, deployment workflow and `demo` environment. Deployment uses short-lived credentials, never a service-account JSON key; effective IAM and WIF restrictions require metadata inspection.

## 3. Environment Variables and Secrets

### Runtime

These are all settings read by [runtime validation](../../../backend/src/config/env.ts); Prisma also reads `DATABASE_URL`.

| Name | Purpose / requirement or default | Sensitive? | Value source |
|---|---|---|---|
| NODE_ENV | Selects production Secure cookies; default `development`; cloud uses `production` | No | Service configuration; Docker production default |
| PORT | Listener port, integer 1–65535; default 3000 | No | Cloud Run injects configured port 3000; backend example locally |
| APP_ORIGIN | Exact origin with no path/trailing slash; default `http://localhost:5173`; production requires HTTPS | No | Team-confirmed deployed value: `https://borrowbase-fniy3qjctq-as.a.run.app`; source development uses port 5173, Compose uses port 13004 |
| DATABASE_URL | Required PostgreSQL connection setting | Yes | `borrowbase-database-url` numeric Secret Manager version; ignored local env file |
| CSRF_SECRET | Required, minimum 32 characters; `REPLACE_` placeholders rejected; keep stable across revisions | Yes | `borrowbase-csrf-secret` numeric version; generated local value |

### Bootstrap and local database

| Name | Purpose / requirement | Sensitive? | Value source |
|---|---|---|---|
| SEED_BORROWER_PASSWORD / SEED_CUSTODIAN_PASSWORD | Required only for explicit seed; at least 12 characters each | Yes | Bootstrap-only Secret Manager references; local synthetic values for development |
| POSTGRES_USER / POSTGRES_DB | Required Compose database user/name; used to construct local DATABASE_URL | No | `.env.docker`, copied from `.env.docker.example` |
| POSTGRES_PASSWORD | Required Compose database credential; use a URL-safe local value | Yes | Ignored `.env.docker`; never a cloud credential |

### Tests

| Name | Purpose / requirement | Sensitive? | Value source |
|---|---|---|---|
| SYS01_TEST_DATABASE | Must equal `true` for guarded database suites | No | Explicit isolated test process or CI step |
| DATABASE_URL / SEED_*_PASSWORD | Suite-specific disposable DB; seed passwords only where seed is invoked | Yes | CI disposable configuration or private local test environment |
| CI_PG_USER / PGUSER | Disposable PostgreSQL setup user | No | PR CI job configuration |
| CI_PG_PASSWORD / PGPASSWORD | Disposable PostgreSQL setup credential | Yes | PR CI derives it for each run/attempt; never a production credential |

### Pipeline

| Name | Purpose / requirement | Sensitive? | Value source |
|---|---|---|---|
| GCP_PROJECT_ID / GCP_REGION | Required deployment target | No | GitHub environment `demo`: `cpe334-borrowbase` / `asia-southeast1` |
| WIF_PROVIDER | Required OIDC provider | No | `demo`: `projects/785698287490/locations/global/workloadIdentityPools/github-actions/providers/github-main` |
| WIF_SERVICE_ACCOUNT | Required deploy identity | No | `demo`: `borrowbase-deployer@cpe334-borrowbase.iam.gserviceaccount.com` |
| PROJECT_ID / REGION | Script target; accept GCP_* aliases, default to BorrowBase project/region | No | Workflow maps the GitHub variables; operator shell for first provisioning |
| RELEASE_SHA | Selected application commit; full lowercase 40-character SHA | No | Workflow derives from GITHUB_SHA or manual `release_sha`; not read by the app |
| DRY_RUN | `deploy.sh` defaults to 0; `release.sh` defaults to 1 | No | Operator explicitly uses 1 for preview; deployment workflow sets 0 |

### Build and workflow-generated settings

| Name | Purpose | Sensitive? | Value source |
|---|---|---|---|
| PRISMA_SKIP_POSTINSTALL_GENERATE | Skip Prisma postinstall generation in the production-dependencies stage | No | Dockerfile sets `true`; generated client is copied from the build stage |
| REQUESTED_SHA | Optional application version to restore | No | Workflow input `release_sha` |
| RELEASE_MODE / APP_IMAGE / MAINT_IMAGE | Release/recovery mode and SHA-tagged image paths | No | Deploy workflow derives them from the target and selected SHA |
| JOB_RESULT / SMOKE_OUTCOME | Final deployment and smoke outcomes | No | GitHub job/step contexts |
| BUILD_RESULT / UNIT_API_UI_RESULT / POSTGRES_RESULT / DOCKER_RESULT | Required CI job outcomes | No | Reusable CI `needs` results |
| PR_HEAD_SHA | Source version recorded by CI | No | Pull-request head SHA, or workflow commit for a main release |
| GITHUB_SHA / GITHUB_REF | Workflow commit and branch; main is required for deployment | No | GitHub Actions runner |
| GITHUB_ENV / GITHUB_STEP_SUMMARY | Files used for derived variables and release/CI summaries | No | GitHub Actions runner |
| GITHUB_SERVER_URL / GITHUB_REPOSITORY / GITHUB_RUN_ID | Workflow-run links in summaries | No | GitHub Actions runner |

`release_sha` is a workflow input, not an application setting. Image prefixes and `SERVICE_URL` in command examples are derived shell variables. Resource names are constants in `deploy/config.sh`.

Root [.env.example](../../../.env.example) serves Prisma CLI/seed; [backend/.env.example](../../../backend/.env.example) serves source development; [.env.docker.example](../../../.env.docker.example) serves Compose. Root/backend examples name different databases: align the ignored local files with the intended development database. The backend dev script loads `backend/.env`; production startup requires injected variables. Compose explicitly receives `.env.docker` and uses development HTTP at `http://localhost:13004`.

Cloud secrets use numeric Secret Manager versions. Keep DB/CSRF references compatible across revisions; CSRF rotation changes derived tokens. Bootstrap passwords are injected only into the separate bootstrap job. Never publish env values, connection strings, passwords, cookies or tokens. Resolve demo credentials privately from the versions actually used; seed preserves existing passwords, so `latest` is not proof of an account's password.

## 4. Build, Test and Local Run

Run from the repository root with Node >=24.14.0 <25 and npm. Create a dedicated development database and configure the ignored root/backend env files before database operations. Docker requires Compose/Buildx and `linux/amd64` support; use [docker.md](docker.md) for container build/run, maintenance commands and volume preservation.

```bash
npm ci
npm run db:generate
npm run typecheck
npm run build
npm test -w backend -- --exclude '**/*.postgres.test.ts'
npm run test:ui
bash -n deploy/config.sh
bash -n deploy/deploy.sh
bash -n deploy/release.sh
python3 -B -m unittest discover -s deploy/tests -p 'test_*.py' -v
```

After migration and optional initial seed (Section 5), `npm run dev` starts the API and Vite UI at `http://localhost:5173`. Production startup, with runtime variables injected and both workspaces built:

```bash
node backend/dist/server.js
```

[PR CI](../../../.github/workflows/pr-ci.yml) runs F-01–F-04 PostgreSQL suites in separate disposable databases with suite-specific guards. Follow its setup for integration testing; never target the development/demo/cloud database. `test:api` covers authentication only, and unfiltered `npm test` needs guarded database setup. CI currently omits `prisma/tests/foundation.test.ts` and `prisma/seed-tests/seed.postgres.test.ts`; a passing run does not establish execution of those suites.

## 5. Database Migrations and Seeding

The committed [Prisma migrations](../../../prisma/migrations/) are authoritative. With the intended database privately configured:

```bash
npm run db:migrate
# Optional initial synthetic data; configure both SEED_*_PASSWORD values first:
npm run db:seed
```

`db:migrate` runs `prisma migrate deploy`. Cloud releases use the maintenance image containing Prisma CLI, migrations and seed tooling; the final application image excludes them. `release.sh` updates `borrowbase-migrate` to the selected maintenance digest and executes it with `--wait` before updating the service. Startup runs neither migrations nor seed. Never use database reset, schema push or production `migrate dev`.

[Seed](../../../prisma/seed.ts) creates missing approved users/models/assets with empty-update upserts. Existing passwords, roles, serviceability, requests, Loans and sessions are preserved. Both passwords must contain at least 12 characters; all configuration is checked before writes. Seed is retryable but not one transaction, so failure can leave new records. It is not a password-reset or data-repair tool. Cloud bootstrap is a separate authorized operation, never part of routine release/recovery; do not import local fixtures into cloud SQL.

## 6. Initial Cloud Deployment

Use [deploy/deploy.sh](../../../deploy/deploy.sh) only for initial provisioning or reviewed provisioning recovery; routine releases use Section 7. In Cloud Shell, use an authorized account with Git, gcloud, Python 3 and curl. Confirm billing, quotas, costs and existing resources. From a new clean accepted main checkout:

```bash
set -euo pipefail
git clone --branch main --single-branch https://github.com/thu734/Inventory-and-Borrowing-System.git
cd Inventory-and-Borrowing-System
export PROJECT_ID=cpe334-borrowbase
export REGION=asia-southeast1
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=all)"
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/main | cut -f1)"
DRY_RUN=1 bash deploy/deploy.sh
```

Inspect an existing checkout before updating it; stop if dirty or on another branch. After reviewing the preview, authorized execution is `DRY_RUN=0 bash deploy/deploy.sh`. The script creates missing resources, builds both images through Cloud Build, resolves digests, migrates, deploys and smoke-tests. A new service starts private until its exact URL is known. SQL-policy mismatches, ambiguous lookup failures and credential inconsistencies stop provisioning rather than silently changing existing data/settings.

Default provisioning does not seed. For separately approved initial demo bootstrap, preview with `DRY_RUN=1 bash deploy/deploy.sh --bootstrap-demo`, then execute `DRY_RUN=0 bash deploy/deploy.sh --bootstrap-demo`. This creates `borrowbase-bootstrap` running `npm run db:seed`. If that job already exists, inspect its execution; automatic re-execution is refused. Reconcile partial failures and missing/disabled secret versions privately, without automatic rotation or reseeding.

Verify the public service from the repository root:

```bash
SERVICE_URL=$(gcloud run services describe borrowbase --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')
test -n "$SERVICE_URL"
curl --fail --show-error "$SERVICE_URL/api/health"
curl --fail --show-error "$SERVICE_URL/api/ready"
python3 deploy/smoke_test.py "$SERVICE_URL"
```

Use the actual assigned HTTPS origin returned by `status.url` and ensure deployed `APP_ORIGIN` matches it exactly; the canonical URL above records the current deployment. [Smoke](../../../deploy/smoke_test.py) requires health 200, readiness 200, home HTML 200, anonymous `/api/v1/auth/me` 401 and unknown-API JSON 404. Readiness probes PostgreSQL; it does not verify migration state. Startup requires an initial DB connection; database reconnection may temporarily return 503. Smoke is GET-only and does not verify login, checkout or production cookie/security behavior. Manually verify the application workflow separately and keep credentials private.

## 7. CI/CD Release Procedure

1. Synchronize `lab5-staging` with `main`, then branch for the linked Lab 5 Issue. Open a feature/fix PR into staging with teammate review and passing CI. Use a reviewed staging → main release PR, apply Lab 5 labels and preserve history. Resume the environment before merging.
2. Every push to `main` starts [Deploy demo](../../../.github/workflows/deploy.yml). It reruns reusable CI for that main commit, then deploys through environment `demo`. Deployments are serialized with `cancel-in-progress: false`; only the deploy job has `id-token: write`, while PR CI has `contents: read`.
3. Build `borrowbase` from `runtime` and `borrowbase-maintenance` from `build` for `linux/amd64`, tagging both with the full source SHA. Authenticate through WIF, push, and resolve immutable digests. [release.sh](../../../deploy/release.sh) executes migrations, creates a revision without traffic, verifies its image and Ready condition, then switches and verifies 100% traffic.
4. Require deployment and smoke success. Record the source SHA, application/maintenance digests, serving revision, URL and run link. A release-script `DEPLOYED` summary still means smoke is pending. Bootstrap and first provisioning are not invoked.

The [main ruleset](https://github.com/thu734/Inventory-and-Borrowing-System/rules/27307986) requires one approval and five up-to-date checks: `Typecheck and build`, `Unit, API and UI tests`, `PostgreSQL integration tests`, `Docker build`, `CI evidence summary`; no bypass actors are configured. PR CI also runs on staging, but no effective staging rules were returned by the inspected API.

Release B followed [feature PR #55](https://github.com/thu734/Inventory-and-Borrowing-System/pull/55) → [release PR #56](https://github.com/thu734/Inventory-and-Borrowing-System/pull/56). Both have approvals, passing checks and review comments: [#55 review comment](https://github.com/thu734/Inventory-and-Borrowing-System/pull/55#issuecomment-6946728096), [#56 review comment](https://github.com/thu734/Inventory-and-Borrowing-System/pull/56#issuecomment-6946722399). [Episode 7 Issue #35](https://github.com/thu734/Inventory-and-Borrowing-System/issues/35) remains open with no follow-up comment or PR cross-reference; its timeline records project-board activity. Its labels and both PRs' labels remain empty.

| Release | Main commit | Recorded revision / outcome | Deployment run |
|---|---|---|---|
| Original A, [PR #53](https://github.com/thu734/Inventory-and-Borrowing-System/pull/53), from [feature PR #50](https://github.com/thu734/Inventory-and-Borrowing-System/pull/50) | `a436ed18c00f93ed264ee11bb9c53318554f7aaa` | Failed pretraffic image-digest verification; smoke skipped | [43741440983](https://github.com/thu734/Inventory-and-Borrowing-System/actions/runs/43741440983) |
| Repaired A, [PR #54](https://github.com/thu734/Inventory-and-Borrowing-System/pull/54), direct fix into main | `df1dec5093c515d769203bfc409624c3cbaaf4ab` | `borrowbase-00005-x52`; deployment/smoke passed; Episode 8 rollback target | [43750011019](https://github.com/thu734/Inventory-and-Borrowing-System/actions/runs/43750011019) |
| **B**, PR #56 | `2f4380539c3aca470f41e93d843144cb6ee3b8a3` | `borrowbase-00006-dd2`; deployment/smoke passed; primary release | [43751546535](https://github.com/thu734/Inventory-and-Borrowing-System/actions/runs/43751546535) |

Manual dispatch from `main` with empty `release_sha` performs a normal CI/build/migrate/deploy of the workflow commit; it does not reuse an existing image. A nonempty input selects recovery as described in Section 9. There is no automatic rollback after smoke failure; inspect actual traffic before recovery.

## 8. Identify the Running Commit

Use an account with read access to service/revision/registry metadata. Inspect **all** traffic entries; `latestCreatedRevisionName` or `latestReadyRevisionName` can differ from the serving revision after rollback.

```bash
export PROJECT_ID=cpe334-borrowbase
export REGION=asia-southeast1
gcloud run services describe borrowbase --region="$REGION" --project="$PROJECT_ID" \
  --format='yaml(status.url,status.traffic)'
# Replace with the actual traffic destination and expected release SHA if different:
REVISION=borrowbase-00006-dd2
EXPECTED_SHA=2f4380539c3aca470f41e93d843144cb6ee3b8a3
gcloud run revisions describe "$REVISION" --region="$REGION" --project="$PROJECT_ID" \
  --format='yaml(metadata.name,status.conditions,spec.containers[0].image,status.imageDigest)'
APP_IMAGE=asia-southeast1-docker.pkg.dev/cpe334-borrowbase/borrowbase/borrowbase
EXPECTED_IMAGE=$(gcloud artifacts docker images describe "$APP_IMAGE:$EXPECTED_SHA" \
  --project="$PROJECT_ID" --format='value(image_summary.fully_qualified_digest)')
printf '%s\n' "$EXPECTED_IMAGE"
gh run view 43751546535 --repo thu734/Inventory-and-Borrowing-System \
  --json headSha,event,conclusion,url,jobs
```

Require the intended 100% traffic destination, `Ready=True`, and the selected SHA's resolved image matching the revision. Record any traffic split. Release B's application OCI index digest is `sha256:924a83a64cb06f8a58c0015365ba373ee45899454101036df09faf32d883e3ee`; repaired A's is `sha256:60390a655d6fa3f2452c3a26bffc3c71333d5749e61c58358ca2a58f069eaa38`.

An OCI index digest may differ from its platform child. With Buildx and registry authentication, `docker buildx imagetools inspect "$EXPECTED_IMAGE"` must show that the revision digest belongs to the index's `linux/amd64` entry; `release.sh` checks this relationship. Trace SHA tag → immutable image/index or child → traffic-serving revision → successful run. The Release B indicator is only a visual cross-check; `RELEASE_SHA` is not an app endpoint/runtime setting. For recovery runs, GitHub `head_sha` identifies workflow code; the release step's requested application SHA, digest and revision identify the restored release.

## 9. Persistence and Recovery

SQL stores application records and sessions; preserve its database and compatible DB/CSRF secret references. [Episode 8's execution record](https://github.com/thu734/Inventory-and-Borrowing-System/issues/36#issuecomment-6917483159) confirms a Cloud SQL restart and existing-revision rollback/roll-forward retained the same pending request and authenticated Borrower session. [Rollback run 43871680728](https://github.com/thu734/Inventory-and-Borrowing-System/actions/runs/43871680728) selected repaired A; [roll-forward run 43872719800](https://github.com/thu734/Inventory-and-Borrowing-System/actions/runs/43872719800) restored B. Both passed smoke and skipped CI/builds. This demonstrates revision reuse, not creation of a new application revision or a separately observed application-process restart. Local app/container restart results are in [docker.md](docker.md).

### Rollback and roll-forward

Before recovery, confirm the target was healthy and its schema, origin and secret references remain compatible. The image and matching Ready historical revision must still exist; recovery does not recreate deleted revisions or reverse migrations.

1. Open Actions → **Deploy demo** → **Run workflow**, select **main**, and set `release_sha` to repaired A's full SHA from Section 7. Only lowercase 40-character SHAs reachable from main are accepted.
2. Require `Verify release`, image builds and pushes skipped; deployment and smoke must pass. Recovery reuses the existing image/revision and switches application traffic only: no migration-job update/execution, seed, bootstrap or database restore.
3. Use Section 8 to verify A's SHA/image/revision and 100% traffic; check the B indicator is absent and the same retained records/session are usable.
4. Roll forward identically with B's full SHA. This uses the same internal `rollback` mode, skips CI/build/migration again, and restores B's revision/indicator. Recheck records and eligible sessions; expired/revoked sessions need not remain authenticated.

On migration, image, readiness or traffic failure, stop and inspect sanitized logs. On smoke failure, traffic may already have changed. Never reset/reseed SQL, reverse migrations or rotate credentials merely to make recovery pass. Check DB connectivity, secret-reference versions, exact `APP_ORIGIN` and session expiry before changing access or data.

### Pause and resume

Keep the service available during grading, demos and active pipelines. Coordinate an authorized pause; do not merge into main or dispatch releases while paused. Budget alerts do not cap spending; stopped SQL still incurs storage/backup costs.

Set `PROJECT_ID` and `REGION` as in Section 8. Close public access before stopping SQL:

```bash
SERVICE_URL=https://borrowbase-fniy3qjctq-as.a.run.app
gcloud run services remove-iam-policy-binding borrowbase \
  --member=allUsers --role=roles/run.invoker --region="$REGION" --project="$PROJECT_ID"
gcloud run services update borrowbase --invoker-iam-check --region="$REGION" --project="$PROJECT_ID"
curl --silent --output /dev/null --write-out '%{http_code}\n' "$SERVICE_URL/"
# Require anonymous HTTP 403; stop on unexpected errors or inherited public access.
gcloud sql instances patch borrowbase-pg --activation-policy=NEVER --project="$PROJECT_ID"
gcloud sql instances describe borrowbase-pg --project="$PROJECT_ID" --format='value(settings.activationPolicy)'
```

Require `NEVER`; if the public binding was already absent, inspect that condition rather than ignoring unrelated failures. Invoker-check updates can change revision metadata; recheck traffic/image identity. To resume, retain the target variables and start SQL before restoring access:

```bash
gcloud sql instances patch borrowbase-pg --activation-policy=ALWAYS --project="$PROJECT_ID"
gcloud sql instances describe borrowbase-pg --project="$PROJECT_ID" --format='yaml(state,settings.activationPolicy)'
# Wait for RUNNABLE / ALWAYS before restoring public access:
gcloud run services add-iam-policy-binding borrowbase \
  --member=allUsers --role=roles/run.invoker --region="$REGION" --project="$PROJECT_ID"
curl --fail --show-error "$SERVICE_URL/api/ready"
python3 deploy/smoke_test.py "$SERVICE_URL"
```

Require readiness 200, then verify login and retained data before resuming releases. If pausing caused a failed run, review its commit/mode before retrying. Teardown requires separate authorization after grading: retain required data/evidence, disable deployment, inventory exact resources and verify residual billing. No BorrowBase teardown script exists; do not run an unadapted starter script.
