#!/usr/bin/env bash
# Shared naming contract for first deployment and the future release.sh/workflow.
PROJECT_ID="${PROJECT_ID:-${GCP_PROJECT_ID:-cpe334-borrowbase}}"
REGION="${REGION:-${GCP_REGION:-asia-southeast1}}"
REPO_NAME=borrowbase
SERVICE_NAME=borrowbase
SQL_INSTANCE=borrowbase-pg
DB_NAME=borrowbase
DB_USER=borrowbase
MIGRATE_JOB_NAME=borrowbase-migrate
BOOTSTRAP_JOB_NAME=borrowbase-bootstrap
SA_NAME=borrowbase-runtime
MAINTENANCE_SA_NAME=borrowbase-maintenance
SECRET_DB_URL=borrowbase-database-url
SECRET_CSRF=borrowbase-csrf-secret
SECRET_BORROWER=borrowbase-seed-borrower-password
SECRET_CUSTODIAN=borrowbase-seed-custodian-password
