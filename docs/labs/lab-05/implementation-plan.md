# Lab 5 implementation plan

Status: **source-reconciled planning baseline; Episode 2 implementation not started**. Inspected 14 November 2026 (Asia/Bangkok). Deadline: **15 November 2026, 23:59 Asia/Bangkok**. No cloud configuration, migration, seed, test execution or deployment is claimed by this document.

## 1. Scope and source gates

Deploy the accepted Sprint 1 Borrower login → catalog → request → Custodian checkout → active Loan workflow, retaining authorization and conflict rejection. Returns, inventory administration, new UI design and other later-sprint features are excluded.

Authority order: official `01_SE_Lab_5_updated.pdf` overrides conflicting Student Guide V1.1 and lecturer starter examples; then Group Work Specification and accepted BorrowBase contracts. The submitted Deliverable 1 is historical project evidence and the starter kit is an implementation reference, not a BorrowBase specification.

**Sources reconciled:** `01_SE_Lab_5_updated.pdf`, Student Guide GCP Deployment and CI/CD V1.1, the TokTickIT Lab 5 starter kit, the Group Work Specification and Deliverable 1 were available for this revision. The prior Lab 5 Markdown documents and accepted BorrowBase contracts were also reviewed. No source requirement is marked verified until its implementation evidence exists.

Read local [README](../../../README.md), [SRS](../../srs.md), [SDS](../../system-sds.md), [features](../../features.md), [traceability](../../traceability.md), [database guide](../../sys01-database.md), feature contracts and [integration evidence](../../sprints/sprint-1/evidence/Sprint-1-integration-verification.md). Current source and test files were inspected; historical successful runs are not new verification.

## 2. Verified baseline and preservation

| Item | Observation on 14 November |
|---|---|
| Live GitHub main / accepted release | `ffd1ab5a628f5c24ca1650cdf2db17ec43c4a8cd`; local main agrees |
| Live sprint1-staging | `ca88aa861bdbe8bd3bf9ec4644a418965656d40a`; GitHub compare reports behind main by 2 commits, no file differences |
| Local sprint1-staging | `21ad3e38ba6ab45db5a591b4de5225e0f2ca5abf`; stale, do not use as Lab 5 base |
| Current local checkout | `lab5-staging`, HEAD accepted release SHA |
| Existing modifications | README, backend auth API tests, frontend package and Vite configuration; preserved, not approved or absorbed as Lab 5 changes |
| New integration branch | `lab5-staging` exists locally at the accepted main SHA without committed changes; it is not present on `origin` |
| Other local Lab 5 branch | `lab5/setup` exists; inspect its diff before reusing anything |
| Existing planning work | [Issue #28](https://github.com/thu734/Inventory-and-Borrowing-System/issues/28) is open; [PR #27](https://github.com/thu734/Inventory-and-Borrowing-System/pull/27) is closed and its branch/commit remain retained |
| CI / protection | GitHub Actions workflows: 0. Rulesets: none returned. Live main and sprint1-staging protected=false; no required checks reported |
| Issues / labels | #28 is the only open issue returned; Sprint 1 issues closed. Existing labels include documentation, bug, enhancement, accessibility and standard defaults; no lab5 label |
| Projects | Repository projects are enabled, but board contents could not be read with the available token (`read:project` missing). Reuse the existing board after authorized inspection; do not create a duplicate |
| Deployment files | L5-04 Dockerfile, Compose, ignore rules and local/C-03 docs are implemented on this branch; CI and cloud deployment remain pending |
| Git diagnosis | Apple Git fails through missing Command Line Tools/xcrun. `/opt/homebrew/bin/git` works. No installation or system configuration changed |

Refresh live refs and status before later implementation; these are dated observations. Never reset, stash, overwrite, force-push or commit unrelated edits. Plan publication requires separate approval. Do not move current dirty work to another branch without a deliberate preservation checkpoint.

## 3. Decisions, proposals and pending confirmations

**Confirmed team instruction:** use `lab5-staging` for integration; release through main; episodes sequential; owner selected when work begins, with a specific teammate reviewer.

**Approved architecture:** one Cloud Run service/container serves compiled React and Express on one HTTPS origin; Artifact Registry stores commit-tagged images, deployments use an immutable digest; Cloud SQL PostgreSQL persists records and sessions; Secret Manager supplies runtime secrets; GitHub Actions uses restricted WIF without JSON keys; only accepted `main` commits deploy. Use the smallest suitable resource sizes in `asia-southeast1` after quota and cost verification. Do not add a separate frontend host, Redis, extra microservices or a new authentication system.

**Pending:** quota and cost evidence, Cloud SQL sizing/connection policy, board contents, grading availability period, controlled migration runner details and public-demo credential handoff. The verified GCP project is `cpe334-borrowbase`; no resource is claimed to exist.

**Episode 1 reported configuration:** alerts-only THB 1,800 budget with actual-cost alerts 10%/25%/50%/90% = THB 180/450/900/1,620. Preserve these settings; a budget alert is not a spending cap. Billing, credits, scope, recipients, region, quotas and IAM still require evidence before provisioning.

## 4. Workflow and review gates

Publish `lab5-staging` from accepted `origin/main` only after authorization. Keep historical `sprint1-staging` intact; never use it as the new Lab 5 base. Review `lab5/setup` and existing local modifications before implementation; reuse selectively through review, not blind copying.

Create each small `feature/l5-xx-*` or `fix/l5-xx-*` branch from current integrated `lab5-staging` when its dependencies are Done. PRs target `lab5-staging`; one reviewed release PR targets main. Changes to GitHub labels, board, rules, issues, commits, pushes and PRs remain outside this task.

Every PR includes linked issue, requirement/check IDs after extraction, files changed, tested SHA, actual commands/results, redacted evidence, known defects, environment-variable names and rollback/next action. Review checks scope, security, contracts, negative cases, test evidence and operating cost; AI review does not replace the specified teammate review.

Merge only after named CI checks pass, relevant acceptance evidence exists, reviewer approves, conversations resolve and base is current. Use the actual CI job name as the future required check; the starter kit uses `test-and-docker`, but this is not yet a repository check. A failing/blocked PR stays open with cause and next action; never bypass gates or force-push. Release requires all official checks, compatible migration, immutable image/revision identification, persistence/rollback evidence and submission readiness. Main-only CD must gate its own success on CI for the same SHA.

## 5. Episode execution cards and copy-ready backlog

These are proposed issue bodies; **only L5-01 has a real issue number (#28)**. The episode titles follow Student Guide Episodes 1–8; guide Issue #1–#8 are organizational references, not this repository's GitHub issue numbers. Proposed label: `lab5` (does not yet exist). Add `documentation` or `bug` only when useful. Leave assignees empty until episode start; record owner/reviewer then. Each card uses the official IDs in §6.

For all cards, Definition of Done = acceptance criteria met, actual evidence attached/indexed in the issue or deployment document, reviewed PR merged where code/docs change, dependencies updated, handoff recorded. No cloud-only task needs a dummy code commit. Every handoff uses §8. Verification commands below are future work, not authorized execution during this planning task.

### L5-01 — Confirm baseline, deployment contract and Lab 5 workflow

- Issue: reuse [#28](https://github.com/thu734/Inventory-and-Borrowing-System/issues/28); update proposal only after approval. Episode: planning gate before 2. Objective: establish source-backed plan and integration/release boundaries.
- Work/files: these two Markdown files; optional minimal README links after review. Branch suggestion `docs/l5-01-planning-baseline` from lab5-staging after preserving dirty work. No replacement PR created now.
- Dependencies/prerequisite: live Git/board audit and authorization for GitHub mutations. Can start independently: documentation reconciliation yes; board setup no.
- Acceptance/evidence: official IDs/checks/weights and guide titles are recorded; board reuse is decided after authorized inspection; verify with source comparison and documentation checks.
- Risk/recovery: contradictory old contract or accidental unrelated diff; retain original remote draft and separate local fixes before publication. Handoff: source locations, unresolved decisions, approved base SHA.

### L5-02 — Episode 1: GCP account and cost control

- Objective/work: reconcile the reported GCP setup against redacted console evidence. No resource changes during planning. Files: deployment document's actual-resource inventory, no secret values. Branch: `docs/l5-02-gcp-evidence` if documentation changes.
- Dependencies: L5-01; Episode 1 evidence collection. Independently start: evidence collection yes.
- Acceptance: billing-enabled correct project, free-trial/credit state, region/quotas, teammate IAM, budget scope/recipients and exact THB thresholds verified. Evidence: dated redacted screenshots, names/IDs safe for public review. Later read-only `gcloud config get-value project`, `gcloud projects describe PROJECT_ID`; console billing and quota inspection.
- Risk/recovery: wrong project or incomplete alerts; block provisioning until corrected with authorization. Do not mistake alerts for a cap. Handoff: actual project ID, region and budget evidence links.

### L5-03 — Episode 2: From local to cloud — what changes

- Objective/work/files: detailed checklist in §7; production start/static serving, API fallback, probes, release identity, configuration validation and shutdown. Likely backend package/server/app/env, environment examples, focused backend tests and deployment document; root package only if needed. Branch `feature/l5-03-cloud-readiness`.
- Dependencies: L5-01 approved, Episode 1 project/budget evidence, clean safe base. Independently start: yes after the baseline and source checks; teammate review is required before integration.
- Acceptance: one production Node process serves UI/API on injected PORT; API misses stay JSON 404; exact HTTPS origin/Secure cookie/CSRF retained; database failure and shutdown handled; focused regression checks pass; no startup seed/migration. Evidence: commands/results and local production smoke, clearly distinct from deployed HTTPS proof.
- Verify: `npm run db:generate`, `npm run typecheck`, `npm run build`, non-DB tests in §7; later `node backend/dist/server.js` with explicit isolated/local configuration. Risk/recovery: Express 5 wildcard syntax, compiled asset paths, accidental local env loading; revert branch change through reviewed fix, preserve DB. Handoff: build/start working directories and remaining cloud verification.

### L5-04 — Episode 3: Docker

- Objective/work/files: root `Dockerfile`, `.dockerignore`, `docker-compose.yml` if local database orchestration is used, deployment document. Build from shared lockfile/workspace root, generate Prisma, copy compiled frontend/backend and required runtime/native artifacts; named PostgreSQL volume and readiness. Branch `feature/l5-04-docker`.
- Dependencies: L5-03; reviewed Docker design. Independently start: no.
- Acceptance: clean image builds, non-secret configuration injection, real container DB connection, browser accepted workflow, records survive app/container restart; image excludes env/git/secrets; Node 24.14+ within 24.x; Argon2/Prisma native binaries work on chosen Linux runtime. Prefer Debian-based build/runtime compatibility.
- Verify later: `docker compose config --quiet`, `docker compose build`, `docker compose up -d`, controlled migration/one-time synthetic bootstrap, HTTP smoke; restart application and DB separately, verify retained records. Evidence: redacted build/run output, named volume and record IDs before/after. Risk/recovery: architecture/OpenSSL/native mismatch and volume loss; do not use `down -v`, reset or reseed as recovery. Handoff: exact platform, image and DB prep commands.

### L5-05 — Episode 4: CI on pull requests

- Objective/work/files: `.github/workflows/pr-ci.yml`, this evidence record and the deployment CI guidance. Branch `ci/l5-05-pr-checks`.
- Dependencies: L5-03 and L5-04 merged. Independently start: no.
- Acceptance: PRs to lab5-staging/main run `npm ci`, Prisma generation, typechecks/build, backend unit/API tests, UI tests, all four guarded PostgreSQL suites in separate migrated databases, and a non-publishing `linux/amd64` Docker build. Failed commands remain failing checks. CI uses synthetic database credentials only and has no deployment secrets.
- Verify: `npm ci`, `npm run db:generate`, `npm run typecheck`, `npm run build`, `npm run test:unit`, explicit four API files in §7, `npm run test:ui`; database jobs in §7. Evidence: successful and intentional controlled failing PR/check URLs, stable job names. Risk/recovery: `test:api` only covers auth; `npm test` mixes incompatible DB guards. Split jobs/databases, fix failure on feature branch. Handoff: exact names for Episode 6 rules.

> The original L5-05 verification checklist above is superseded by the implemented commands and database mapping in the C-01 evidence record below; hosted PR evidence remains pending.

### L5-06 — Episode 5: First deployment to GCP

- Objective/work/files: approved resource setup and first manual release; proposed `scripts/lab5/deploy-manual.sh` only if guide requires/repetition warrants it, deployment document mandatory. Branch `feature/l5-06-manual-deploy` for any scripts/docs.
- Dependencies: L5-02–05 and accepted main release via reviewed PR. Independently start: no.
- Acceptance: Artifact Registry, Cloud SQL, Secret Manager and least-privilege runtime identity verified; controlled migration and one-time demo bootstrap precede service; HTTPS URL serves accepted workflow using persistent DB and exact origin; digest/main SHA recorded. No unreviewed feature image deployed.
- Verify later: reviewed `gcloud artifacts repositories describe`, `gcloud sql instances describe`, `gcloud run services describe` and sanitized HTTPS smoke against confirmed resources. Evidence: redacted commands, revision/digest/URL/SHA, Secure-cookie and negative security checks. Risk/recovery: costs, IAM exposure, bad migration/origin; stop rollout and route prior revision only when schema-compatible; no database reset. Handoff: actual inventory, secret resource names/versions, no values.

### L5-07 — Episode 6: Connect GitHub to GCP and set the merge gate

- Objective/work/files: WIF trust limited to this repository/main and least-privilege deploy identity; proposed `.github/workflows/deploy.yml` authentication stage, deployment document. Branch `feature/l5-07-wif`.
- Dependencies: L5-06; restricted WIF design and actual project/resource identities. Independently start: no.
- Acceptance: short-lived OIDC works for accepted main context; unauthorized branch/repository denied; no JSON keys, secrets or broad roles in repository. GitHub environment controls if required by handout, otherwise optional practice.
- Verify later: authorized test workflow and trust-policy inspection with redacted results. Evidence: run URL, attribute restrictions and role purpose. Risk/recovery: broad issuer trust; disable offending workflow/binding through authorized change, never publish keys. Handoff: provider/identity names and allowed subject.

### L5-08 — Episode 6: Required merge checks and review

- Objective/work/files: configure approved protections for lab5-staging/main using real CI names; deployment document. Branch `docs/l5-08-merge-gates` if needed, no dummy code.
- Dependencies: L5-05, L5-07; two-member review capacity confirmed. Independently start: no.
- Acceptance: failed CI/unreviewed PR blocked; named teammate approval required; successful reviewed PR allowed; record bypass policy explicitly. Specific reviews state a check, question, finding or reason for approval.
- Verify later: read rules via `gh api`, screenshot blocked and eligible PR states without merging a deliberately broken PR. Evidence: exact check names/rules and review links. Risk/recovery: impossible status names lock team out; inspect real runs and adjust authorized rule only, no gate bypass. Handoff: reviewer and failure-resolution steps.

### L5-09 — Episode 7: Auto deploy and smoke test

- Objective/work/files: finish `.github/workflows/deploy.yml`, proposed `scripts/lab5/smoke.mjs` if automation needed, deployment document. Branch `feature/l5-09-main-cd`.
- Dependencies: L5-07–08 and accepted main release. Independently start: no.
- Acceptance: only same-SHA successful main CI can deploy; immutable image digest and commit SHA recorded; serialized deployment prevents racing migrations/releases; post-deploy health and accepted workflow verified. Migrations run once through controlled runner, never each container startup; no routine seed.
- Verify: merge approved release after review, inspect Actions run, service revision and smoke outcome. Evidence: PR/main SHA → CI run → image digest → revision → smoke chain. Risk/recovery: deployment ordering, wrong origin and rollout failure; halt queue, preserve previous digest/revision and investigate, no fake green on failed smoke. Handoff: running release and recovery action.

### L5-10 — Episode 8: Persistence and rollback

- Objective/work/files: exercise accepted workflow, keep Session/request/Loan identifiers through revision restart/redeploy; deployment document evidence index. Branch `test/l5-10-persistence` only if adding reusable checks.
- Dependencies: L5-09; compatible release and database evidence. Independently start: no.
- Acceptance: existing eligible session remains usable within expiry and same CSRF secret; request and Loan survive app replacement, availability/authorization remain correct; no claim that PostgreSQL data lives on Cloud Run disk.
- Verify: capture IDs and state, deploy same compatible image/new revision, reload existing browser and read records; distinguish new login from session survival. Evidence: redacted before/after revision, timestamps and IDs. Risk/recovery: limited fixtures exhausted by checkout; use approved synthetic fixture plan, never reset shared cloud DB. Handoff: surviving record IDs and any known UI freshness limitation.

### L5-11 — Episode 8: Persistence and rollback — rollback evidence

- Objective/work/files: prove traffic rollback to retained compatible revision/digest without losing data; deployment document. Branch `docs/l5-11-rollback` if needed.
- Dependencies: L5-10, at least two healthy revisions and compatibility assessment. Independently start: no.
- Acceptance: previous SHA visible after traffic change; HTTPS health, login/CSRF and persistent records pass; forward recovery documented. Schema rollback is not inferred from traffic rollback.
- Verify later: authorized `gcloud run services update-traffic SERVICE --to-revisions PREVIOUS=100 --region REGION --project PROJECT_ID`, then read service state and smoke; placeholders must first be replaced from verified inventory. Evidence: old/new revision/digest/SHA and surviving IDs. Risk/recovery: incompatible schema/secret rotation; block unsafe rollback, fix forward or use approved backup recovery separately. Handoff: known-good target and compatibility limits.

### L5-12 — Final evidence and submission

- Objective/work/files: complete these two docs, minimal README navigation, required report/artifacts only after handout extraction; reconcile Deliverable 1. Branch `docs/l5-12-submission`.
- Dependencies: all earlier gates; official submission and contribution rules. Independently start: evidence indexing yes, completion no.
- Acceptance: every R/C row has actual artifact/result/evidence, four rubric categories audited, both contributions/reviews truthful, public links usable, deployed main SHA identifiable, grader access instructions verified; submitted before deadline with receipt. No passwords/tokens/cookies in public logs/screenshots.
- Verify: link and secret review, final `git diff --check`, deploy URL smoke and required submission checklist. Evidence: release/PR/run links, sanitized screenshots, timestamps and receipt. Risk/recovery: missing evidence or review; report the blocker early and do not mark incomplete tests passed. Handoff: submitted version and grading-access obligation.

### L5-13 — Episode 9–10: Pause and teardown after grading

- Objective/work/files: retain accessible demo through confirmed grading window, monitor costs, then authorized teardown of chargeable resources; deployment document. No permanent owner yet.
- Dependencies: L5-12; lecturer availability window and teammate agreement. Independently start: cost monitoring yes; teardown no.
- Acceptance: monitoring contact/check cadence and grading end date recorded; budget remains THB configuration; resources retained until permission/date gate; later SQL/storage/images/backups/secrets/network charges assessed and cleanup verified. No automatic shutdown based on alerts or unapproved deletion.
- Verify: read-only billing/resource review, URL smoke during grading; after separately approved cleanup, inventory and billing follow-up. Evidence: availability and dated cost observations, cleanup approval/results. Risk/recovery: premature service removal or continuing SQL costs; retain backups as approved, notify team, inspect costs before any destructive action. Handoff: responsible contact and next check time.

## 6. Traceability and verification matrix

The following is the official traceability baseline. Status describes BorrowBase evidence at this planning checkpoint; planned work is not verified.

| ID | Official requirement/check | Episode / artifact | Verification and evidence | Status |
|---|---|---|---|---|
| R-01 | Clean-clone Docker build produces a working container | 3 / `Dockerfile`, `.dockerignore`, Compose if used | Clean build/run output; C-03 | Local Docker build/run verified |
| R-02 | All settings come from environment; document variables; commit no real secrets | 2–3 / `.env.docker.example`, `docker.md` | Variable inventory and clean-clone run; C-03 | Local configuration verified; cloud runtime pending |
| R-03 | Public GCP URL supports UI, API and database workflow | 5 / Cloud Run and smoke evidence | Public URL screenshots and C-04 | Not started |
| R-04 | Persistent database survives restart and redeploy | 2, 5, 8 / Cloud SQL and persistence evidence | Before/after record evidence; C-05 | Planned |
| R-05 | Relevant PRs run meaningful build and automated tests | 4 / CI workflow | Passing PR run and test summary; C-01 | Workflow implemented; hosted evidence pending |
| R-06 | Passing check is required; failing temporary PR cannot merge | 6 / ruleset and failing PR | Blocked merge evidence; C-02 | Not implemented |
| R-07 | Accepted releases deploy from `main` through review → CI → merge → deploy | 7 / deploy workflow and release PR | Release PR, pipeline and deployment evidence; C-06 | Planned |
| R-08 | Identify each release commit and document repeatable release procedure | 7 / `deployment.md`, SHA/digest evidence | Running revision matches SHA; C-06 | Planned |
| R-09 | Issues/project board, feature branches, staging PR review and release PR; no self-approval | 1–7 / Issues, board, PRs and reviews | Linked review history; C-06 | Partially planned |
| R-10 | Label Lab 5 Issues/PRs; preserve commits, contract revisions and CI history | 1–7 / `lab5` label and history | Label and immutable history evidence; C-06 | Label pending |
| R-11 | Both members participate in requirements, testing, AI supervision, implementation, review and deployment | 1–9 / Issues, commits, PR authorship/review | Contribution evidence in GitHub and submission | Not yet evidenced |
| R-12 | Repository remains public through grading; no secrets committed | 1–9 / repository settings and secret review | Public repository and clean history review | Repository public; ongoing |
| C-01 | Normal PR runs build and all automated tests and passes | 4 / CI run | CI link, tested SHA and summary | Workflow implemented; hosted evidence pending |
| C-02 | Temporary-branch PR with one failing test cannot merge | 6 / required check/ruleset | Failed check and blocked merge | Not run |
| C-03 | Fresh clone builds/runs using only safe `.env.docker.example` values filled in | 2–3 / clean checkout and container | Commands and output in `docker.md` | Passed for local Docker on 14 Nov 2026; cloud not in scope |
| C-04 | Public URL supports sign-in, main business action and one rejection/restriction | 5 / deployed BorrowBase | URL-visible screenshots | Not run |
| C-05 | Record created before restart/redeploy remains afterward | 8 / Cloud SQL evidence | Before/after screenshots | Not run |
| C-06 | Reviewed staging change reaches `main`, deploys, and running revision matches commit | 7 / PRs, CI, Cloud Run | PR links, pipeline run and revision | Not run |

### C-01 — Episode 4 PR CI evidence (L5-05)

Workflow: [`.github/workflows/pr-ci.yml`](../../../.github/workflows/pr-ci.yml). It uses `pull_request` for `lab5-staging` and `main`, Ubuntu-hosted runners, Node.js 24.14.0, and the root npm workspace lockfile. The only token permission is `contents: read`. CI does not use cloud credentials, deployment tokens, production database/CSRF secrets, or publish images.

Stable PR check names:

- `Typecheck and build`
- `Unit, API and UI tests`
- `PostgreSQL integration tests`
- `Docker build`

Commands and expected result:

```text
npm ci
npm run db:generate
npm run typecheck
npm run build -w backend
npm run build -w frontend
npm test -- --exclude '**/*.postgres.test.ts'   # from backend/
npm run test:ui
docker buildx build --platform linux/amd64 --load -t borrowbase-pr-ci:<tested-sha> .
```

The PostgreSQL job uses an isolated PostgreSQL 16 service and four separate disposable databases. Each receives `npm run db:migrate` before its selected test; only F-01 is explicitly seeded with its required synthetic borrower/custodian credentials.

| Suite | Database | Seed |
|---|---|---|
| `auth.postgres.test.ts` (F-01) | `borrowbase_sys01_auth_ci` | Required; seeded synthetic users use the exact fixture passwords expected by the test |
| `f02.postgres.test.ts` | `borrowbase_sys01_f02_ci` | None; suite creates and cleans its fixtures |
| `f03.postgres.test.ts` | `borrowbase_sys01_f03_ci` | None; suite creates and cleans its fixtures |
| `f04.postgres.test.ts` | `borrowbase_sys01_f02_test` | None; suite requires this exact database name and creates/cleans its fixtures |

The service password is unique to the Actions run and masked. Each test step sets `SYS01_TEST_DATABASE=true`; the suites' own database-name guards remain enabled. The databases are never shared with L5-04 or production.

The Actions summary records the tested PR merge SHA, PR head SHA, workflow run URL and four job results. Vitest test counts/assertion failures and migration/Docker details remain available in the corresponding job logs; no separate artifact upload is configured.

**Local verification only (not GitHub-hosted):** `actionlint .github/workflows/pr-ci.yml` passed with actionlint 1.7.12. `npm ci`, `npm run db:generate`, `npm run typecheck`, both workspace production builds, the backend non-PostgreSQL suite (12 files / 71 tests), the UI suite (4 files / 37 tests), and the four isolated PostgreSQL suites (5 + 9 + 31 + 11 tests) passed. F-01 alone was seeded. A temporary deliberately failing assertion caused the backend test command to exit 1 while the other 71 backend tests passed; the probe file was removed. The cached local command `docker buildx build --platform linux/amd64 --load -t borrowbase-pr-ci:local .` passed.

A separate cold `--no-cache` local Docker build did **not** complete: Docker Buildx returned an RPC/EOF error during the build. A read-only status check afterward showed the original L5-04 app and PostgreSQL containers still healthy; some candidate containers reported exit code 255. No existing container was manually restarted or removed. This is not a successful cold-build result and does not establish a GitHub-hosted Docker result.

**Hosted evidence is not yet available:** this workflow has not run on GitHub because no commit was pushed and no PR was opened. Successful PR run URL: pending. Tested SHA: pending. Hosted deliberate failing PR/check URL and blocked-merge evidence: pending for C-02; the local failure injection above is not a substitute.

Recommended branch protection/rulesets for **both** `lab5-staging` and `main`: require all four stable checks above before merge. Repository settings have not been changed; configure and verify the actual check names after the first Actions run.

Rubric: **CI and quality gate — 30 points; Docker and reproducible configuration — 20 points; GCP deployment and persistence — 35 points; repeatable release pipeline — 15 points.**

## 7. Episode 2 actionable checklist

The six checks below are the Student Guide Episode 2 checklist. They are readiness findings, not claims that the checks have passed.

| Episode 2 check / current behavior | Minimal proposed modification / files | Verification, expected result and deployment impact |
|---|---|---|
| 1. Uploaded files are not saved locally | BorrowBase has no upload feature or local file-storage path; retain this scope. No file change unless a later feature adds uploads. | Read-only source search and deployed scope review; no upload path exists. Non-blocking for current Sprint 1 workflow. |
| 2. Seed is production-safe | `prisma/seed.ts` already requires environment passwords and uses idempotent upserts, but it changes synthetic passwords/serviceability. Keep it as an explicit one-time bootstrap, never startup/CD seed. | Isolated seed review/test with synthetic values only; no shared database operation. Operational policy is a deployment prerequisite. |
| 3. No development shortcuts in production | No requester selector, default password or legacy identity header is present in inspected app code. Preserve authenticated Borrower/Custodian flow. | Production build review and negative login/access checks. Non-blocking finding; preserve as a release acceptance check. |
| 4. Sessions are database-backed | `PrismaAuthStore` reads/writes `session`; `server.ts` constructs it from Prisma. No production in-memory fallback exists. | Existing unit/API/isolated PostgreSQL tests, then C-05 deployed persistence. Current implementation is structurally ready; deployment evidence pending. |
| 5. Server reads `PORT` and does not bind only to localhost | `readEnv` validates `PORT`; `server.ts` listens on the injected port without a host. Keep this behavior. | Start with a non-default port and probe it; Docker/Cloud Run runtime test. Current source is ready; execution pending. |
| 6. `/api/ready` returns 503 when the database is unreachable | No readiness route exists; `server.ts` connects before listening and `finishApp` currently returns JSON 404 for unknown paths. Add `/api/ready` with a bounded Prisma connectivity query in `server.ts`/app wiring and focused tests. | 200/ready with DB; 503/not-ready without DB; no secret or SQL error leakage. **Deployment blocker until implemented and tested.** |

Additional cloud-readiness gap: the compiled frontend is not served by the backend, and there is no production start script. The Episode 2 branch must add static asset serving and guarded browser SPA fallback while preserving JSON responses for `/api/*` misses. Likely files are [server.ts](../../../backend/src/server.ts), [app.ts](../../../backend/src/app.ts), [backend/package.json](../../../backend/package.json), and focused API/UI tests. This is a **deployment blocker**.

Future non-DB regression commands from root:

```bash
npm run db:generate
npm run test:unit
npm run test -w backend -- tests/auth.api.test.ts tests/f02.api.test.ts tests/f03.contract.red.test.ts tests/f04.api.test.ts
npm run test:ui
npm run typecheck
npm run build
```

`npm ci` belongs in a clean reproducibility check/CI; don't overwrite this checkout's environment to manufacture a pass. Real DB checks require **separate disposable databases** and `SYS01_TEST_DATABASE=true`: F-01/foundation accept guarded `borrowbase_sys01_*`; F-03 requires `borrowbase_sys01_f03_*`; F-02 requires `borrowbase_sys01_f02_*`; F-04 specifically requires `borrowbase_sys01_f02_test`. Run suites sequentially where sharing fixtures; set child-process URLs explicitly, prepare with committed migrations, seed only fixtures needed by the relevant suite. Do not run blanket `npm test` against one database. Planned commands: `npm run test:db`; `npm run test -w backend -- tests/auth.postgres.test.ts`; separately F-03 and F-02/F-04 file commands using their correct disposable databases. Database creation/migration/seed remain outside this planning task.

Ready-to-start checklist:

- [x] Extract the six guide checks and all R/C/rubric rows; reconcile architecture/starter and Group Work requirements.
- [ ] Obtain teammate review of the plan and record unresolved decisions honestly.
- [ ] Preserve and review four unrelated local modifications and inspect lab5/setup; establish clean implementation base without reset/stash/overwrite.
- [ ] Approve plan publication and GitHub backlog/board changes; publish lab5-staging only when authorized.
- [ ] Record episode owner and specific reviewer, Issue/branch, baseline SHA and planned evidence.

Exclusions: Docker/CI implementation belongs to later episodes; no cloud provisioning, migrations/seeding, production secrets, public credentials, polling, WebSockets, new application features or UI redesign in Episode 2. The narrowly scoped catalog-availability freshness regression is planned for Episode 2, but is not implemented here.

## 8. Kanban and handoff

Inspect existing Projects with authorized read access (`read:project` or browser) first; reuse the suitable board. Proposed status semantics: Backlog = future/dependencies; Ready = prerequisites met; In Progress = one owner selected and active; In Review = evidence/PR ready with reviewer; Blocked = recorded blocker/next action; Done = verified/approved as applicable. Add statuses only after approval; do not rename existing fields blindly. L5-01 is Ready for review; L5-02 is pending evidence; all other implementation cards are Backlog. No issues/labels/project/rules were changed by this planning task.

Record this handoff in the relevant Issue or PR:

```text
Episode / L5 ID / actual issue URL:
Owner / reviewer / recipient:
Branch / PR / tested SHA / base SHA:
Files and commands/results:
Evidence links and blockers:
Environment-variable names (no values):
Next action and review request:
```

The selected episode owner may begin Episode 2 after gates clear and hand over after a build/test checkpoint or reviewed episode PR. Before switching owners, stop overlapping edits, record uncommitted work explicitly and use an approved commit/PR checkpoint; the recipient verifies branch/base and instructions before editing. Both members may perform requirements, implementation, tests, review, deployment and AI supervision.

| Stage | Episode owner (select at start) | Reviewer | Handoff checkpoint |
|---|---|---|---|
| Planning / Episode 1 evidence | Selected at handoff | Selected at handoff | Source-backed plan and actual cloud evidence |
| Episode 2 | Selected at episode start | Other team member | Production build + focused tests + PR |
| Episodes 3–8 | Unassigned | Other member, selected then | Each reviewed episode gate |
| Submission / grading / costs | Unassigned | Other member | Receipt, availability window, cleanup permission |

## 9. Risks, deadline and quality audit

Known accepted-source limitations: catalog remains Available immediately after checkout until explicit refresh; database/API state is correct. Complete accessibility, synchronized-race and clean-checkout checks remain incomplete in historical evidence; raw integrated logs are not all tracked. Secure-cookie/deployed HTTPS and comprehensive production log secrecy unverified; limiter process-local; three known high-severity Prisma findings disclosed. Do not silently resolve these through documentation. Record impact in smoke evidence; if a mandatory grading check fails, create a narrow reviewed fix proposal within accepted Sprint 1 behavior, without expanding scope. No automatic dependency upgrade.

Given deadline, execute sequential episodes with evidence captured as work completes. Episode 2 comes first; then container/CI/manual deployment, WIF/gates/CD, persistence/rollback and submission. Reserve a final review/submission buffer before 23:59 Bangkok on 15 November. Keep service accessible through the lecturer-confirmed grading window; later teardown is a separate authorized action.

Audit result: scope, architecture compatibility, local preservation, branch separation, issue reuse, ownership handoff, security/cost caveats, official R/C coverage, rubric weights, guide titles, contribution rules and six Episode 2 checks are reconciled. The project board contents, quotas, cloud resources, CI runs and teammate review evidence remain unverified. No invented resources, approval or successful tests.

**Decision: CONDITIONAL GO for bounded Episode 2 implementation.** Source reconciliation and the accepted Git baseline are complete. Before editing, isolate the unrelated dirty worktree changes, record the owner/reviewer and baseline SHA, and create `feature/l5-03-cloud-ready` from verified `lab5-staging`. Teammate review is required before the PR is merged; it is not a prerequisite for local implementation.
