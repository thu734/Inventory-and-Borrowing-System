#!/usr/bin/env bash
# Adapted from the lecturer's TokTickIT deploy/deploy.sh, Episode 5 Step 5.0.
# Future manual use: DRY_RUN=1 bash deploy/deploy.sh [--bootstrap-demo]
# Real execution is restricted to a clean checkout of the current remote main.
# Never enable xtrace: generated secrets and secret-access output stay private.
{ set +x; } 2>/dev/null
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=config.sh
source "$SCRIPT_DIR/config.sh"
DRY_RUN="${DRY_RUN:-0}"
BOOTSTRAP=false

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

# No secret values in command logs, cloud errors or process tracing.
run_cmd() {
  local arg
  printf '+ ' >&2
  for arg in "$@"; do
    case "$arg" in
      --password=*) printf '%s ' '--password=<REDACTED>' >&2 ;;
      *) printf '%q ' "$arg" >&2 ;;
    esac
  done
  printf '\n' >&2
  if [[ "$DRY_RUN" == 0 ]]; then
    "$@" >/dev/null 2>/dev/null || fail 'Operation failed; stop and inspect sanitized diagnostics before retrying.'
  fi
}

read_cloud() {
  gcloud "$@" --project="$PROJECT_ID" 2>/dev/null || fail 'Cloud lookup failed; no values or raw errors are logged.'
}

# Distinguish absence from permission/network/API errors; never recreate blindly.
exists() {
  local detail
  if detail=$(gcloud "$@" --project="$PROJECT_ID" 2>&1); then return 0; fi
  case "$detail" in
    *NOT_FOUND*|*'does not exist'*) return 1 ;;
    *) fail 'Resource lookup failed; stop rather than assuming the resource is absent.' ;;
  esac
}

validate_release() {
  RELEASE_SHA=$(git -C "$ROOT" rev-parse HEAD)
  [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'Invalid source commit.'
  if [[ "$DRY_RUN" == 0 ]]; then
    [[ $(git -C "$ROOT" branch --show-current) == main ]] || fail 'Real deployment requires the reviewed main branch.'
    [[ -z $(git -C "$ROOT" status --porcelain --untracked-files=all) ]] || fail 'Real deployment requires a clean source checkout.'
    local remote
    remote=$(git -C "$ROOT" ls-remote origin refs/heads/main) || fail 'Cannot verify remote main.'
    [[ "${remote%%[[:space:]]*}" == "$RELEASE_SHA" ]] || fail 'Checkout must match current origin/main; refresh and review it first.'
  fi
}

# Resolve enabled numeric versions so this revision cannot silently change secrets.
secret_version() {
  if [[ "$DRY_RUN" == 1 ]]; then printf 'latest'; return; fi
  local name state
  name=$(read_cloud secrets versions describe latest --secret="$1" --format='value(name)')
  state=$(read_cloud secrets versions describe latest --secret="$1" --format='value(state)')
  [[ "$state" == ENABLED && "${name##*/}" =~ ^[0-9]+$ ]] || fail 'Secret has no enabled latest version; inspect it manually.'
  printf '%s' "${name##*/}"
}

ensure_secret() {
  local secret=$1 value
  if [[ "$DRY_RUN" == 0 ]] && exists secrets describe "$secret"; then
    secret_version "$secret" >/dev/null
    return
  fi
  [[ "$DRY_RUN" == 0 ]] || printf 'PLAN: create %s only if absent; preserve existing versions.\n' "$secret"
  run_cmd gcloud secrets create "$secret" --replication-policy=automatic --project="$PROJECT_ID"
  if [[ "$DRY_RUN" == 0 ]]; then
    value=$(openssl rand -hex 32) || fail 'Secret generation failed.'
    printf '%s' "$value" | run_cmd gcloud secrets versions add "$secret" --data-file=- --project="$PROJECT_ID"
  else
    run_cmd gcloud secrets versions add "$secret" --data-file=- --project="$PROJECT_ID"
  fi
}

ensure_database_secret() {
  local password value users
  if [[ "$DRY_RUN" == 0 ]] && exists secrets describe "$SECRET_DB_URL"; then
    secret_version "$SECRET_DB_URL" >/dev/null
    return
  fi
  if [[ "$DRY_RUN" == 0 ]]; then
    users=$(read_cloud sql users list --instance="$SQL_INSTANCE" --filter="name=$DB_USER" --format='value(name)')
    [[ -z "$users" ]] || fail 'DB user exists without its secret. Refusing to rotate or overwrite credentials; reconcile manually.'
    password=$(openssl rand -hex 24) || fail 'Database credential generation failed.'
  else
    password='<GENERATED_HEX_PASSWORD>'
    printf 'PLAN: preserve existing database credentials; stop on an existing-user/missing-secret conflict.\n'
  fi
  run_cmd gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$password" --project="$PROJECT_ID"
  run_cmd gcloud secrets create "$SECRET_DB_URL" --replication-policy=automatic --project="$PROJECT_ID"
  if [[ "$DRY_RUN" == 0 ]]; then
    value="postgresql://${DB_USER}:${password}@localhost/${DB_NAME}?host=/cloudsql/${SQL_CONN_NAME}&schema=public&connection_limit=3"
    printf '%s' "$value" | run_cmd gcloud secrets versions add "$SECRET_DB_URL" --data-file=- --project="$PROJECT_ID"
  else
    run_cmd gcloud secrets versions add "$SECRET_DB_URL" --data-file=- --project="$PROJECT_ID"
  fi
}

# Validate reused secret contents privately; never print a URL or secret on failure.
validate_secrets() {
  [[ "$DRY_RUN" == 0 ]] || return 0
  local value
  value=$(read_cloud secrets versions access "$DB_VERSION" --secret="$SECRET_DB_URL")
  printf '%s' "$value" | python3 -c '
import sys,urllib.parse
u=urllib.parse.urlsplit(sys.stdin.read()); q=urllib.parse.parse_qs(u.query)
ok=u.scheme in ("postgres","postgresql") and u.hostname=="localhost" and u.username==sys.argv[1] and bool(u.password) and u.path=="/"+sys.argv[2] and q.get("host")==["/cloudsql/"+sys.argv[3]] and q.get("schema")==["public"] and q.get("connection_limit")==["3"]
sys.exit(0 if ok else 1)' "$DB_USER" "$DB_NAME" "$SQL_CONN_NAME" || fail 'Database secret does not match the selected BorrowBase target.'
  value=$(read_cloud secrets versions access "$CSRF_VERSION" --secret="$SECRET_CSRF")
  printf '%s' "$value" | python3 -c 'import sys; s=sys.stdin.read(); sys.exit(0 if len(s)>=32 and not s.startswith("REPLACE_") else 1)' || fail 'Invalid CSRF secret.'
}

grant_secret() {
  run_cmd gcloud secrets add-iam-policy-binding "$1" --member="serviceAccount:$2" --role=roles/secretmanager.secretAccessor --project="$PROJECT_ID" --quiet
}

resolve_image() {
  if [[ "$DRY_RUN" == 1 ]]; then printf '%s@sha256:<resolved-digest>' "${1%:*}"; return; fi
  local image
  image=$(read_cloud artifacts docker images describe "$1" --format='value(image_summary.fully_qualified_digest)')
  [[ "$image" =~ ^${IMAGE_PREFIX}/[a-z-]+@sha256:[0-9a-f]{64}$ ]] || fail 'Unable to resolve a valid immutable image digest.'
  [[ "${image%@*}" == "${1%:*}" ]] || fail 'Resolved image repository mismatch.'
  printf '%s' "$image"
}

job() {
  local action=$1 name=$2 task=$3 secrets=$4
  run_cmd gcloud run jobs "$action" "$name" --image="$MAINTENANCE_DIGEST" --region="$REGION" \
    --service-account="$MAINTENANCE_EMAIL" --set-cloudsql-instances="$SQL_CONN_NAME" \
    --set-secrets="$secrets" --set-env-vars=NODE_ENV=production --command=npm --args="run,$task" \
    --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=300s --cpu=1 --memory=512Mi --project="$PROJECT_ID"
  run_cmd gcloud run jobs execute "$name" --region="$REGION" --wait --project="$PROJECT_ID"
}

deploy_service() {
  local access=$1 origin=$2
  run_cmd gcloud run deploy "$SERVICE_NAME" --image="$APP_DIGEST" --region="$REGION" \
    --service-account="$SA_EMAIL" --set-cloudsql-instances="$SQL_CONN_NAME" \
    --set-secrets="DATABASE_URL=$SECRET_DB_URL:$DB_VERSION,CSRF_SECRET=$SECRET_CSRF:$CSRF_VERSION" \
    --set-env-vars="NODE_ENV=production,APP_ORIGIN=$origin" --port=3000 --cpu=1 --memory=512Mi \
    --min-instances=0 --max-instances=1 --concurrency=20 "$access" --project="$PROJECT_ID"
}

verify_service() { python3 "$SCRIPT_DIR/smoke_test.py" "$SERVICE_URL"; }

main() {
  for arg in "$@"; do
    case "$arg" in
      --bootstrap-demo) BOOTSTRAP=true ;;
      --help) printf 'Usage: DRY_RUN=0|1 bash deploy/deploy.sh [--bootstrap-demo]\n'; return ;;
      *) fail 'Unknown argument; use --bootstrap-demo only for separately approved initial synthetic bootstrap.' ;;
    esac
  done
  [[ "$DRY_RUN" == 0 || "$DRY_RUN" == 1 ]] || fail 'DRY_RUN must be 0 or 1.'
  [[ "$PROJECT_ID" == cpe334-borrowbase && "$REGION" == asia-southeast1 ]] || fail 'Project/region differs from the reviewed BorrowBase configuration.'
  validate_release
  SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
  MAINTENANCE_EMAIL="$MAINTENANCE_SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
  SQL_CONN_NAME="$PROJECT_ID:$REGION:$SQL_INSTANCE"
  IMAGE_PREFIX="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME"
  APP_IMAGE="$IMAGE_PREFIX/$SERVICE_NAME:$RELEASE_SHA"
  MAINTENANCE_IMAGE="$IMAGE_PREFIX/$SERVICE_NAME-maintenance:$RELEASE_SHA"

  run_cmd gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com iam.googleapis.com --project="$PROJECT_ID"
  if [[ "$BOOTSTRAP" == true && "$DRY_RUN" == 0 ]] && exists run jobs describe "$BOOTSTRAP_JOB_NAME" --region="$REGION"; then
    fail 'Bootstrap job already exists. Inspect its previous execution; no automatic re-execution or cleanup is allowed.'
  fi
  if [[ "$DRY_RUN" == 1 ]] || ! exists artifacts repositories describe "$REPO_NAME" --location="$REGION"; then
    run_cmd gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location="$REGION" --project="$PROJECT_ID"
  fi
  if [[ "$DRY_RUN" == 1 ]] || ! exists sql instances describe "$SQL_INSTANCE"; then
    run_cmd gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 --edition=enterprise \
      --tier=db-f1-micro --region="$REGION" --storage-size=10GB --storage-type=SSD --no-storage-auto-increase --backup-start-time=03:00 --project="$PROJECT_ID"
  fi
  if [[ "$DRY_RUN" == 0 ]]; then
    local instance
    instance=$(read_cloud sql instances describe "$SQL_INSTANCE" --format=json)
    printf '%s' "$instance" | python3 -c '
import json,sys
v=json.load(sys.stdin); s=v.get("settings", {})
ok=(v.get("databaseVersion")=="POSTGRES_16" and v.get("region")==sys.argv[1]
    and s.get("edition")=="ENTERPRISE" and s.get("tier")=="db-f1-micro"
    and s.get("storageAutoResize") is False)
sys.exit(0 if ok else 1)' "$REGION" || fail 'Existing SQL instance differs from the reviewed engine, region, edition, tier or storage auto-increase policy; inspect manually.'
  fi
  if [[ "$DRY_RUN" == 1 ]] || ! exists sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE"; then
    run_cmd gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID"
  fi
  for account in "$SA_NAME" "$MAINTENANCE_SA_NAME"; do
    if [[ "$DRY_RUN" == 1 ]] || ! exists iam service-accounts describe "$account@$PROJECT_ID.iam.gserviceaccount.com"; then
      run_cmd gcloud iam service-accounts create "$account" --project="$PROJECT_ID"
    fi
    run_cmd gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$account@$PROJECT_ID.iam.gserviceaccount.com" --role=roles/cloudsql.client --condition=None --quiet
  done
  ensure_database_secret
  ensure_secret "$SECRET_CSRF"
  DB_VERSION=$(secret_version "$SECRET_DB_URL")
  CSRF_VERSION=$(secret_version "$SECRET_CSRF")
  validate_secrets
  grant_secret "$SECRET_DB_URL" "$SA_EMAIL"
  grant_secret "$SECRET_CSRF" "$SA_EMAIL"
  grant_secret "$SECRET_DB_URL" "$MAINTENANCE_EMAIL"

  run_cmd gcloud builds submit "$ROOT" --config="$SCRIPT_DIR/cloudbuild.yaml" \
    --substitutions="_APP_IMAGE=$APP_IMAGE,_MAINTENANCE_IMAGE=$MAINTENANCE_IMAGE" --project="$PROJECT_ID"
  APP_DIGEST=$(resolve_image "$APP_IMAGE")
  MAINTENANCE_DIGEST=$(resolve_image "$MAINTENANCE_IMAGE")
  job deploy "$MIGRATE_JOB_NAME" db:migrate "DATABASE_URL=$SECRET_DB_URL:$DB_VERSION"
  if [[ "$BOOTSTRAP" == true ]]; then
    ensure_secret "$SECRET_BORROWER"
    ensure_secret "$SECRET_CUSTODIAN"
    BORROWER_VERSION=$(secret_version "$SECRET_BORROWER")
    CUSTODIAN_VERSION=$(secret_version "$SECRET_CUSTODIAN")
    grant_secret "$SECRET_BORROWER" "$MAINTENANCE_EMAIL"
    grant_secret "$SECRET_CUSTODIAN" "$MAINTENANCE_EMAIL"
    job create "$BOOTSTRAP_JOB_NAME" db:seed "DATABASE_URL=$SECRET_DB_URL:$DB_VERSION,SEED_BORROWER_PASSWORD=$SECRET_BORROWER:$BORROWER_VERSION,SEED_CUSTODIAN_PASSWORD=$SECRET_CUSTODIAN:$CUSTODIAN_VERSION"
  fi

  # New service: obtain its assigned URL behind Cloud Run IAM first. The temporary
  # .invalid origin cannot authorize a real browser login. Never expose it publicly.
  if [[ "$DRY_RUN" == 1 ]] || ! exists run services describe "$SERVICE_NAME" --region="$REGION"; then
    deploy_service --no-allow-unauthenticated https://bootstrap.invalid
  fi
  if [[ "$DRY_RUN" == 1 ]]; then
    SERVICE_URL=https://assigned-service-url.invalid
  else
    SERVICE_URL=$(read_cloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')
    python3 -c 'import sys,urllib.parse; u=urllib.parse.urlsplit(sys.argv[1]); sys.exit(0 if u.scheme=="https" and u.hostname and u.hostname.endswith(".run.app") and u.netloc==u.hostname and not u.path and not u.query and not u.fragment else 1)' "$SERVICE_URL" || fail 'Cloud Run did not return an exact HTTPS service origin.'
  fi
  deploy_service --allow-unauthenticated "$SERVICE_URL"
  run_cmd gcloud run services update-traffic "$SERVICE_NAME" --to-latest --region="$REGION" --project="$PROJECT_ID"
  if [[ "$DRY_RUN" == 1 ]]; then
    REVISION='<ready-revision>'
  else
    REVISION=$(read_cloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.latestReadyRevisionName)')
    [[ -n "$REVISION" ]] || fail 'No ready revision reported.'
    local running_image
    running_image=$(read_cloud run revisions describe "$REVISION" --region="$REGION" --format='value(spec.containers[0].image)')
    [[ "$running_image" == "$APP_DIGEST" ]] || fail 'Ready revision image differs from the reviewed application digest.'
  fi
  if [[ "$DRY_RUN" == 0 ]]; then verify_service; fi
  printf 'Source SHA: %s\nApplication image: %s\nMaintenance image: %s\nService origin: %s\nReady revision: %s\n' "$RELEASE_SHA" "$APP_DIGEST" "$MAINTENANCE_DIGEST" "$SERVICE_URL" "$REVISION"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
