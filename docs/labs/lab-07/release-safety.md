# Lab 7 — Release Safety and Recovery Plan

## 1. Release Scope and Status

- **Release:** [PR #79](https://github.com/thu734/Inventory-and-Borrowing-System/pull/79), `lab7-staging` → `main`.
- **Assessed candidate:** `4cf4ee1919568e81f8c5d51c35806fb99aacf443`; main baseline `e042f06`.
- **Review history:** documentation baseline `f81c1f1`; safety-plan PR #80 merged into the assessed candidate. Verification recorded 26–27 November 2026.
- **Approved change:** Issue #71; reviewed contracts in PR #74 and implementation/accessibility corrections in PR #76. Owner-only cancellation persists `CANCELLED` and `cancelledAt` without deleting request history or creating a Loan.
- **Status:** owner recovery-risk decisions are recorded below; independent release approval and final integration authorization remain pending. Lab 7 production migration, deployment and smoke tests have not occurred.

[CI run 45871608165](https://github.com/thu734/Inventory-and-Borrowing-System/actions/runs/45871608165) passed all five required checks at the assessed candidate. Any documentation-updated candidate requires current checks. The eventual main release SHA must be recorded after authorized merge.

## 2. Database and Migration Verification

The migration `20261126090000_lab7_request_cancellation` adds the enum value and nullable timestamp and replaces the request timestamp consistency constraint. It contains no data reset, deletion or seeding; valid existing PENDING/FULFILLED rows need no backfill.

PR #80 records read-only preflight of Cloud SQL PostgreSQL 16 (`cpe334-borrowbase:asia-southeast1:borrowbase-pg`, database `borrowbase`): four PENDING and three FULFILLED requests, the expected pre-change enum/constraint, no `cancelledAt` column and no detected invalid records. Supplied verification reported no unresolved Prisma migrations. These historical production checks were not repeated for this documentation update.

Historical local test logs and before/after snapshots were inspected for an isolated PostgreSQL 16.15 migration test using synthetic populated data. All pre-existing fields were preserved across three BorrowRequests, two Loans (active and returned) and related records; existing requests received NULL `cancelledAt`. The retained assessment identifies tested commit `fd3c8d3`; the tested migration bytes match the assessed release candidate. This was not a new test run or production migration verification. Include the relevant output and provenance in Part B of the Lab 7 PDF.

The supplied live read-only inspection confirms `borrowbase-migrate` explicitly executes:

```text
command: npm
args: run db:migrate
```

The repository maps `npm run db:migrate` to `prisma migrate deploy`. The observed pre-release maintenance image was:

```text
asia-southeast1-docker.pkg.dev/cpe334-borrowbase/borrowbase/borrowbase-maintenance@sha256:e5f5c79a1712d7db857fe6e5a29cc092ffc4bd04462bffdce4978af442be5bf0
```

PR #80 records the intended Cloud SQL attachment, maintenance service account `borrowbase-maintenance@cpe334-borrowbase.iam.gserviceaccount.com`, enabled database secret `borrowbase-database-url:1` and required IAM access. The release workflow builds the maintenance image from Docker's `build` stage; `release.sh` updates the job image, preserves its command/arguments and waits for migration success before application rollout. Command configuration is resolved. Neither the observed image nor the historical successful job execution on 23 November proves the Lab 7 migration has executed.

## 3. Backup and Recovery Limitations

Automated Cloud SQL backups are enabled. PR #80 recorded successful automated backups, including `1795662000000` completed on 26 November 2026 at 05:25:39 UTC. The newer on-demand backup **`1795715801361` is verified SUCCESSFUL by the supplied `gcloud sql backups describe` result**: type ON_DEMAND, start `2026-11-26T17:56:41.366Z`, completion `2026-11-26T17:58:02.545Z`. This is supplied direct GCP evidence, not a new cloud inspection by this review. Retain the sanitized output in Part B of the Lab 7 PDF; backup success does not prove restoration.

**PITR is disabled. Backup restoration has not been tested.** Backup existence does not establish recoverability. The GCP owner/release coordinator accepted this limitation for the course demo on 27 November 2026 (§5). This plan does not introduce a restore demonstration as an official Lab 7 requirement. Recovery may fail or take longer than expected, and restoring an older backup may lose later writes. Do not test restoration over the production database.

## 4. Rollback Restrictions and Recovery

**Do not roll back to an incompatible pre-Lab-7 application revision after CANCELLED records exist.** The older Prisma client and application types do not support that status. A Ready revision or zero cancellations alone does not establish compatibility with the migrated schema; any older target requires compatibility verification before traffic is changed.

Use a corrected, Lab-7-compatible roll-forward release:

1. Stop further release activity; inspect the failed stage, migration execution, sanitized logs, revision readiness and actual traffic.
2. Determine whether migration succeeded and whether CANCELLED records exist. Preserve requests, Loans, Assets and sessions. Do not delete cancellation history or reset/reseed production data. Any reverse migration requires a separately reviewed recovery plan.
3. Prepare and review a compatible correction, pass required CI/regression, and deploy it through the reviewed release workflow without rewriting existing records.
4. Verify readiness, traffic, cancellation/history, checkout and preserved records; record the final SHA, image digest, revision and result in Issue #77.

A smoke-test failure can occur after traffic has switched. Historical Lab 5 rollback evidence does not establish Lab 7 compatibility. **Compatible roll-forward recovery: NOT TESTED (not rehearsed).** Offline script tests do not prove live recovery. The GCP owner/release coordinator approved this documented procedure with its unrehearsed status on 27 November 2026 (§5). Recovery may require building a corrected release.

## 5. Release Decision and Remaining Gates

**Owner decision date: 27 November 2026.** The GCP owner/release coordinator explicitly accepted untested backup-restoration risk, approved the documented compatible roll-forward procedure with its unrehearsed status, and accepted the existing stale-catalog display defect as a known release limitation. Coordinator name/GitHub identity is intentionally left unentered at the owner's request. These decisions do not authorize integration or replace independent PR #79 approval.

| Decision | Status |
|---|---|
| Backup and migration preflight | Migration preflight and inspected local preservation evidence recorded in §2; on-demand backup verified by supplied GCP output (§3) |
| Untested restore / PITR limitation | ACCEPTED by owner for this course demo, 27 November 2026; restoration remains NOT TESTED |
| Incompatible old-version rollback | PROHIBITED; compatibility must not be assumed |
| Compatible roll-forward procedure | APPROVED by owner, 27 November 2026; unrehearsed status acknowledged; recovery remains NOT TESTED |
| Stale-catalog limitation | ACCEPTED by owner as an existing release limitation, 27 November 2026; not fixed |
| Independent PR #79 approval | PENDING; one eligible independent teammate approval and five current required checks |
| Production migration, deployment and smoke results | PENDING — NOT EXECUTED; collect after authorized merge |

Acceptance of the recovery risks does not make restoration or roll-forward recovery tested. Independent teammate approval remains separate; PR #80's approval does not approve PR #79.

The [catalog freshness limitation](../../features.md#current-catalog-freshness-status) remains present in the assessed source: checkout refreshes only Custodian records, leaving the mounted catalog unchanged until Refresh Equipment or remount. Server/database eligibility remains authoritative; no automatic-refresh regression test or fix was found. This source assessment does not claim a new browser reproduction. The owner accepts its stale-display impact as a known release limitation, not a fix or permission to invalidate approved cancellation behavior. New cancellation or integrity failures remain release blockers; this document does not waive acceptance criteria or expand remediation scope.

Integration and merge authorization remain pending. The teammate must independently approve PR #79 with all required checks passing on the updated candidate before the owner authorizes the release. Merging to main automatically triggers deployment.

## 6. Deployment Verification Requirements

After authorized merge, verify and record in [Issue #77](https://github.com/thu734/Inventory-and-Borrowing-System/issues/77) and the final Lab 7 PDF:

- Actual main SHA, migration execution outcome and maintenance/application image digests.
- Serving Cloud Run revision, traffic allocation, health/readiness and smoke results.
- Borrower cancellation/status/timestamp persistence, authorization, Custodian checkout regression and preservation of existing requests and Loans.

These outcomes remain pending until observed. Record actual results in the issue/report rather than requiring another main-branch documentation commit, which could trigger an unnecessary deployment.

## References

- [PR #79 — Lab 7 Release](https://github.com/thu734/Inventory-and-Borrowing-System/pull/79)
- [PR #80 — Release Safety Plan](https://github.com/thu734/Inventory-and-Borrowing-System/pull/80)
- [Lab 7 Implementation Plan](./implementation-plan.md)
- [Lab 5 Deployment Runbook](../lab-05/deployment.md)
- [Prisma Migration](../../../prisma/migrations/20261126090000_lab7_request_cancellation/migration.sql)
- [Known Feature Limitations](../../features.md)
- [Issue #78 — Lab 7 Submission Evidence](https://github.com/thu734/Inventory-and-Borrowing-System/issues/78)
