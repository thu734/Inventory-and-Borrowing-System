#!/usr/bin/env bash
set -Eeuo pipefail
{ set +x; } 2>/dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

MODE="${1:-}"
RELEASE_SHA="${2:-}"
DRY_RUN="${DRY_RUN:-1}"
PHASE="validation"

APP_DIGEST=""
MAINT_DIGEST=""
TARGET_REVISION=""
SERVICE_URL=""

write_summary() {
  local status="$1"
  local message="$2"

  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
      echo "## BorrowBase release"
      echo
      echo "- Status: $status"
      echo "- Mode: $MODE"
      echo "- Source SHA: $RELEASE_SHA"
      echo "- Phase: $PHASE"
      echo "- Detail: $message"

      if [[ -n "$APP_DIGEST" ]]; then
        echo "- Application digest: $APP_DIGEST"
      fi

      if [[ -n "$MAINT_DIGEST" ]]; then
        echo "- Maintenance digest: $MAINT_DIGEST"
      fi

      if [[ -n "$TARGET_REVISION" ]]; then
        echo "- Cloud Run revision: $TARGET_REVISION"
      fi

      if [[ -n "$SERVICE_URL" ]]; then
        echo "- Service URL: $SERVICE_URL"
      fi
    } >> "$GITHUB_STEP_SUMMARY"
  fi
}

fail() {
  printf 'ERROR [%s]: %s\n' "$PHASE" "$1" >&2
  write_summary "FAILED" "$1"
  exit 1
}

trap 'fail "Unexpected command failure"' ERR

[[ $# -eq 2 ]] || fail "Usage: release.sh release|rollback FULL_SHA"
[[ "$MODE" == release || "$MODE" == rollback ]] || fail "Invalid release mode"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "Invalid SHA"
[[ "$DRY_RUN" == 0 || "$DRY_RUN" == 1 ]] || fail "Invalid DRY_RUN"

[[ "$PROJECT_ID" == cpe334-borrowbase ]] || fail "Unexpected project"
[[ "$REGION" == asia-southeast1 ]] || fail "Unexpected region"

IMAGE_PREFIX="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME"
APP_TAG="$IMAGE_PREFIX/$SERVICE_NAME:$RELEASE_SHA"
MAINT_TAG="$IMAGE_PREFIX/$SERVICE_NAME-maintenance:$RELEASE_SHA"

if [[ "$DRY_RUN" == 1 ]]; then
  echo "DRY RUN - No cloud operations"
  echo "Mode: $MODE"
  echo "SHA: $RELEASE_SHA"
  echo "Application image: $APP_TAG"

  if [[ "$MODE" == release ]]; then
    echo "Plan: verify images, migrate, deploy without traffic, verify, switch traffic"
  else
    echo "Plan: find existing image and revision, verify, switch traffic"
    echo "Rollback performs no build, migration, seed or bootstrap"
  fi

  exit 0
fi

command -v gcloud >/dev/null || fail "gcloud CLI missing"
command -v python3 >/dev/null || fail "Python 3 missing"

resolve_digest() {
  local tag="$1"
  local digest

  digest=$(gcloud artifacts docker images describe "$tag" \
    --project="$PROJECT_ID" \
    --format='value(image_summary.fully_qualified_digest)' \
    2>/dev/null) || return 1

  [[ "$digest" =~ @sha256:[0-9a-f]{64}$ ]] || return 1
  [[ "${digest%@*}" == "${tag%:*}" ]] || return 1

  printf '%s' "$digest"
}

PHASE="preflight"

gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" >/dev/null 2>&1 \
  || fail "Cloud Run service unavailable"

if [[ "$MODE" == release ]]; then
  gcloud run jobs describe "$MIGRATE_JOB_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" >/dev/null 2>&1 \
    || fail "Migration job unavailable"
fi

PHASE="image-verification"

APP_DIGEST=$(resolve_digest "$APP_TAG") \
  || fail "Application image missing or digest invalid"

if [[ "$MODE" == release ]]; then
  MAINT_DIGEST=$(resolve_digest "$MAINT_TAG") \
    || fail "Maintenance image missing or digest invalid"

  PHASE="migration"

  gcloud run jobs update "$MIGRATE_JOB_NAME" \
    --image="$MAINT_DIGEST" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --quiet >/dev/null 2>&1 \
    || fail "Migration job update failed"

  gcloud run jobs execute "$MIGRATE_JOB_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --wait --quiet >/dev/null 2>&1 \
    || fail "Migration execution failed"

  PHASE="deployment"

  gcloud run services update "$SERVICE_NAME" \
    --image="$APP_DIGEST" \
    --no-traffic \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --quiet >/dev/null 2>&1 \
    || fail "No-traffic deployment failed"

  PHASE="revision-verification"

  TARGET_REVISION=$(gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format='value(status.latestReadyRevisionName)' \
    2>/dev/null) \
    || fail "Cannot read ready revision"

  [[ -n "$TARGET_REVISION" ]] || fail "No ready revision found"

else
  PHASE="historical-revision-lookup"

  REVISIONS=$(gcloud run revisions list \
    --service="$SERVICE_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format='value(metadata.name)' \
    2>/dev/null) \
    || fail "Cannot list existing revisions"

  [[ -n "$REVISIONS" ]] || fail "No revisions available"

  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue

    candidate_image=$(gcloud run revisions describe "$candidate" \
      --region="$REGION" \
      --project="$PROJECT_ID" \
      --format='value(spec.containers[0].image)' \
      2>/dev/null) \
      || fail "Cannot inspect existing revision"

    if [[ "$candidate_image" == "$APP_DIGEST" ]]; then
      TARGET_REVISION="$candidate"
      break
    fi
  done <<< "$REVISIONS"

  [[ -n "$TARGET_REVISION" ]] \
    || fail "No existing revision matches the requested image digest"
fi

PHASE="pretraffic-verification"

[[ "$TARGET_REVISION" == "$SERVICE_NAME"-* ]] \
  || fail "Unexpected revision name"

VERIFIED_IMAGE=$(gcloud run revisions describe "$TARGET_REVISION" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(spec.containers[0].image)' \
  2>/dev/null) \
  || fail "Cannot verify selected revision"

[[ "$VERIFIED_IMAGE" == "$APP_DIGEST" ]] \
  || fail "Selected revision image digest mismatch"

PHASE="traffic-switch"

gcloud run services update-traffic "$SERVICE_NAME" \
  --to-revisions="$TARGET_REVISION=100" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --quiet >/dev/null 2>&1 \
  || fail "Traffic switch failed"

PHASE="traffic-verification"

TRAFFIC_JSON=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format=json \
  2>/dev/null) \
  || fail "Cannot verify production traffic"

printf '%s' "$TRAFFIC_JSON" | python3 -c '
import json,sys
data=json.load(sys.stdin)
traffic=data.get("status",{}).get("traffic",[])
target=sys.argv[1]
valid=(len(traffic)==1 and
       traffic[0].get("revisionName")==target and
       int(traffic[0].get("percent",0))==100)
sys.exit(0 if valid else 1)
' "$TARGET_REVISION" \
  || fail "Production traffic does not match selected revision"

PHASE="completion"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)' \
  2>/dev/null) \
  || fail "Cannot read service URL"

[[ "$SERVICE_URL" == https://*.run.app ]] \
  || fail "Invalid service URL"

echo "Deployment verified; smoke test pending"
echo "Mode: $MODE"
echo "SHA: $RELEASE_SHA"
echo "Digest: $APP_DIGEST"
echo "Revision: $TARGET_REVISION"
echo "URL: $SERVICE_URL"

write_summary "DEPLOYED" "Verified revision serving 100 percent of traffic; smoke test pending"
