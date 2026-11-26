# Lab 7 — Release Safety and Rollback Plan

- **Project:** BorrowBase — Inventory and Borrowing System
- **Release PR:** [#79](https://github.com/thu734/Inventory-and-Borrowing-System/pull/79)
- **Release Branch:** `lab7-staging`
- **Target Branch:** `main`
- **Reviewed PR Commit:** `f81c1f1`
- **Current Main Baseline:** `e042f06`
- **Verification Date:** 26–27 November 2026
**Release Status:** HOLD — Not approved for production deployment

## 1. Purpose

This document records the release safety verification for Lab 7 request cancellation (F-03/F-04).

Lab 7 introduces the `CANCELLED` request status and the `cancelledAt` database field. The release must preserve existing BorrowRequests, Loans, Assets, and related records.

The purpose of this verification is to confirm database readiness, backup availability, migration configuration, rollback restrictions, and recovery procedures before merging PR #79 into `main`.

## 2. Prisma Migration Review

**Migration:** `20261126090000_lab7_request_cancellation`

The migration introduces:

- A new `CANCELLED` value in the `BorrowRequestStatus` enum.
- A nullable `cancelledAt` column in `BorrowRequest`.
- An updated database check constraint for `PENDING`, `FULFILLED`, and `CANCELLED` requests.

The migration is additive and does not explicitly delete or rewrite existing BorrowRequest or Loan records.

### 2.1 Existing Production Database Verification

The production Cloud SQL database was inspected using read-only SQL queries.

| Verification | Actual Result | Status |
|---|---|---|
| PostgreSQL version | PostgreSQL 16 | PASS |
| PENDING requests | 4 | PASS |
| FULFILLED requests | 3 | PASS |
| Existing request constraint | `BorrowRequest_fulfilledAt_consistent` | PASS |
| Existing enum values | `PENDING`, `FULFILLED` | PASS |
| `cancelledAt` column | Not present before migration | EXPECTED |
| Invalid existing records | 0 | PASS |

The existing database matches the expected pre-Lab-7 request schema.

However, a successful migration against a populated database has not yet been demonstrated in an isolated test environment.

**Migration status:** Preflight verification passed; production Lab 7 migration has not been executed.

## 3. Cloud SQL Backup Verification

- **GCP Project:** `cpe334-borrowbase`
- **Cloud SQL Instance:** `borrowbase-pg`
- **Region:** `asia-southeast1`
- **Database Version:** PostgreSQL 16
**Instance Status:** RUNNABLE

### 3.1 Automated Backup Configuration

| Setting | Verified Value |
|---|---|
| Automated backups | Enabled |
| Configured backup start time | 03:00 UTC |
| Backup retention | 7 backups |
| Backup tier | STANDARD |
| Successful backups observed | 7 |

### 3.2 Verified Backup Evidence

**Latest observed backup ID:** `1795662000000`

- Type: AUTOMATED
- Status: SUCCESSFUL
- Start: 2026-11-26 05:24:18 UTC
- Completion: 2026-11-26 05:25:39 UTC

Six additional successful automated backups were also observed.

This confirms that successful Cloud SQL backups exist.

However, backup existence does not prove successful restoration.

### 3.3 Remaining Backup Requirements

Before production deployment:

- [ ] Create or verify a fresh successful pre-release backup.
- [ ] Record the backup ID and completion timestamp.
- [ ] Verify restoration using a separate non-production instance or an approved restore procedure.
- [ ] Record the restore-test result.
- [ ] Obtain release approval from the responsible team member.

Do not restore a backup directly over the production database as part of testing.

**Backup status:** Successful backups verified; fresh release backup and restore testing pending.

## 4. Cloud Run Migration Job Verification

- **Job:** `borrowbase-migrate`
- **Region:** `asia-southeast1`

| Configuration | Verified Result |
|---|---|
| Job exists | PASS |
| Job Ready status | PASS |
| Execution environment | Gen2 |
| Cloud SQL attachment | `cpe334-borrowbase:asia-southeast1:borrowbase-pg` |
| Maintenance service account | `borrowbase-maintenance@cpe334-borrowbase.iam.gserviceaccount.com` |
| Database secret | `borrowbase-database-url` |
| Referenced secret version | 1 — ENABLED |
| Cloud SQL Client permission | PASS |
| Secret Manager access | PASS |
| Latest observed job execution | SUCCESSFUL, 23 November 2026 |

The migration job uses `npm run db:migrate` with the database secret supplied through Secret Manager.

The job configuration, Cloud SQL attachment, service account, secret reference, and required IAM bindings were verified.

The successful historical execution does not prove that the new Lab 7 migration has run.

**Migration job status:** Configuration verified; Lab 7 production execution pending.

## 5. Rollback Compatibility Risk

### 5.1 Identified Risk

The application version before Lab 7 supports only:

- `PENDING`
- `FULFILLED`

Lab 7 introduces:

- `CANCELLED`

The previous Prisma schema, backend request types, and frontend request types do not include the new status.

After the Lab 7 migration, the database can contain `CANCELLED` records that the previous application version was not designed to handle.

Therefore, rollback compatibility after cancellations occur has not been demonstrated.

### 5.2 Rollback Decision

**Do not roll back to a pre-Lab-7 application revision when `CANCELLED` records exist.**

Before considering any rollback to a previous revision:

1. Inspect the current database migration state.
2. Check whether any cancelled requests exist.
3. Confirm the target application's compatibility with the migrated database schema.
4. Confirm that the historical Cloud Run revision is healthy and available.
5. Verify the required environment variables, secrets, and application origin.
6. Obtain approval before switching production traffic.

Use this read-only SQL query to inspect cancellation records:

```sql
SELECT COUNT(*) AS cancelled_count
FROM "BorrowRequest"
WHERE "status" = 'CANCELLED';
```

A result of zero does not automatically prove rollback safety. The previous application must still be tested against the migrated schema.

If cancelled records exist, use a Lab-7-compatible roll-forward release instead of reverting to an incompatible application.

### 5.3 Database Protection Rules

During recovery:

- Do not delete or rewrite cancellation history to make rollback possible.
- Do not reset or reseed the production database.
- Do not reverse the production migration without an independently reviewed recovery plan.
- Preserve existing BorrowRequests, Loans, Assets, and sessions.
- Do not assume an older application is compatible solely because its Cloud Run revision is Ready.

## 6. Roll-Forward Recovery Procedure

If a Lab 7 deployment fails:

1. Stop further release activity and identify the failed stage.
2. Inspect the migration job execution result and sanitized logs.
3. Check Cloud Run revision readiness and the actual traffic allocation.
4. Determine whether the database migration already succeeded.
5. Check whether `CANCELLED` records exist.
6. If the previous application is incompatible, prepare a corrected Lab-7-compatible application release.
7. Run the required CI and regression tests for the corrected release.
8. Deploy the corrected application without deleting or rewriting production data.
9. Verify readiness, smoke tests, request history, cancellation, and checkout behavior.
10. Record the final application SHA, image digest, serving revision, and deployment result.

The deployment workflow performs database migration before creating and promoting the new application revision.

A smoke-test failure may occur after production traffic has already switched. Operators must inspect actual Cloud Run traffic before attempting recovery.

Historical Lab 5 rollback evidence does not establish compatibility with the Lab 7 schema.

## 7. Required Pre-Release Tests

The following checks must be completed before approving production deployment.

| Test | Current Status |
|---|---|
| Git diff validation | PASS |
| Prisma schema and migration review | PASS — structure |
| Existing production schema preflight | PASS |
| Existing data consistency check | PASS |
| Cloud SQL backup existence | PASS |
| Migration job configuration | PASS |
| IAM and secret configuration | PASS |
| Fresh pre-release backup | PENDING |
| Backup restore verification | PENDING |
| Populated-database migration test | PENDING |
| Old-version compatibility with `CANCELLED` | NOT VERIFIED |
| Roll-forward recovery validation | PENDING |
| Final PR review and approval | PENDING |
| Production deployment and smoke tests | NOT EXECUTED |

Any unresolved blocking check must be reviewed and explicitly resolved before release authorization.

## 8. Production Deployment Evidence

After authorized deployment, record the following:

| Evidence | Value |
|---|---|
| Main release commit SHA | PENDING |
| Migration execution result | PENDING |
| Maintenance image digest | PENDING |
| Application image digest | PENDING |
| Cloud Run revision | PENDING |
| Traffic allocation | PENDING |
| Health and readiness checks | PENDING |
| Application smoke tests | PENDING |
| Borrower cancellation test | PENDING |
| Custodian checkout regression | PENDING |
| Existing request and loan preservation | PENDING |

Do not mark these results as complete until actual deployment evidence has been collected.

## 9. Final Release Decision

**Current decision: HOLD PR #79 deployment.**

The following items have been verified:

- The Lab 7 migration is additive in structure.
- The production database matches the expected pre-migration schema.
- Seven existing BorrowRequests have no detected consistency violations.
- Successful automated Cloud SQL backups exist.
- The migration job configuration and required IAM bindings are correct.

The following items remain unresolved:

- Fresh pre-release backup and restore verification.
- Populated-database migration preservation testing.
- Demonstrated rollback compatibility or an approved restriction and roll-forward recovery plan.
- Final release review and deployment authorization.

PR #79 must remain unmerged until the responsible team members approve the remaining release safety requirements.

## 10. References

- [PR #79 — Lab 7 Release](https://github.com/thu734/Inventory-and-Borrowing-System/pull/79)
- [Lab 7 Implementation Plan](implementation-plan.md)
- [Lab 5 Deployment Runbook](../lab-05/deployment.md)
- [Prisma Migration](../../../prisma/migrations/20261126090000_lab7_request_cancellation/migration.sql)
- [Issue #77 — Release Execution](https://github.com/thu734/Inventory-and-Borrowing-System/issues/77)
- [Issue #78 — Lab 7 Submission Evidence](https://github.com/thu734/Inventory-and-Borrowing-System/issues/78)
