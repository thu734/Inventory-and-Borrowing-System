
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/config.sh"

DRY_RUN="${DRY_RUN:-1}"

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

[[ $# -eq 1 ]] || fail "Usage: bash deploy/release.sh FULL_COMMIT_SHA"
[[ "$DRY_RUN" == 0 || "$DRY_RUN" == 1 ]] || fail "Invalid DRY_RUN value"

RELEASE_SHA="$1"

[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "Invalid commit SHA"

[[ "$PROJECT_ID" == "cpe334-borrowbase" ]] || fail "Unexpected project"
[[ "$REGION" == "asia-southeast1" ]] || fail "Unexpected region"

CURRENT_SHA="$(git -C "$ROOT" rev-parse HEAD)"
[[ "$CURRENT_SHA" == "$RELEASE_SHA" ]] || fail "Commit SHA does not match checkout"

IMAGE_PREFIX="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME"
APP_TAG="$IMAGE_PREFIX/$SERVICE_NAME:$RELEASE_SHA"
MAINTENANCE_TAG="$IMAGE_PREFIX/$SERVICE_NAME-maintenance:$RELEASE_SHA"

if [[ "$DRY_RUN" == 1 ]]; then
  echo "DRY RUN - No GCP operations"
  echo "Project: $PROJECT_ID"
  echo "Region: $REGION"
  echo "Application image: $APP_TAG"
  echo "Maintenance image: $MAINTENANCE_TAG"
  echo "Migration job: $MIGRATE_JOB_NAME"
  echo "Cloud Run service: $SERVICE_NAME"
  exit 0
fi

command -v gcloud >/dev/null || fail "gcloud CLI not found"

gcloud run jobs describe "$MIGRATE_JOB_NAME" \
  --region="$REGION" --project="$PROJECT_ID" >/dev/null \
  || fail "Migration job is missing or inaccessible"

gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" >/dev/null \
  || fail "Cloud Run service is missing or inaccessible"

resolve_digest() {
  local tag="$1"
  local digest

  digest="$(gcloud artifacts docker images describe "$tag" \
    --project="$PROJECT_ID" \
    --format='value(image_summary.fully_qualified_digest)')" \
    || fail "Cannot resolve image digest"

  [[ "$digest" =~ @sha256:[0-9a-f]{64}$ ]] \
    || fail "Invalid image digest"

  [[ "${digest%@*}" == "${tag%:*}" ]] \
    || fail "Image repository mismatch"

  printf '%s' "$digest"
}

APP_DIGEST="$(resolve_digest "$APP_TAG")"
MAINTENANCE_DIGEST="$(resolve_digest "$MAINTENANCE_TAG")"

echo "Updating migration job..."

gcloud run jobs update "$MIGRATE_JOB_NAME" \
  --image="$MAINTENANCE_DIGEST" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --quiet

echo "Running database migrations..."

gcloud run jobs execute "$MIGRATE_JOB_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --wait \
  --quiet

echo "Updating Cloud Run service..."

gcloud run services update "$SERVICE_NAME" \
  --image="$APP_DIGEST" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --quiet

gcloud run services update-traffic "$SERVICE_NAME" \
  --to-latest \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --quiet

REVISION="$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='value(status.latestReadyRevisionName)')"

[[ -n "$REVISION" ]] || fail "No ready revision"

RUNNING_IMAGE="$(gcloud run revisions describe "$REVISION" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='value(spec.containers[0].image)')"

[[ "$RUNNING_IMAGE" == "$APP_DIGEST" ]] \
  || fail "Deployed image digest mismatch"

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format='value(status.url)')"

[[ "$SERVICE_URL" == https://*.run.app ]] \
  || fail "Invalid Cloud Run URL"

echo "Release completed"
echo "Commit SHA: $RELEASE_SHA"
echo "Application digest: $APP_DIGEST"
echo "Maintenance digest: $MAINTENANCE_DIGEST"
echo "Revision: $REVISION"
echo "Service URL: $SERVICE_URL"
