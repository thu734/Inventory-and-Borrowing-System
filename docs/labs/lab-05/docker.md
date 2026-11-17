# L5-04 Docker local run and C-03 evidence

This procedure builds the application for `linux/amd64` and runs it against an isolated PostgreSQL 16 container. It uses only L5-04 container, network and volume names; it does not stop or remove other Docker resources.

## Configuration and local security

Copy `.env.docker.example` to `.env.docker` and replace the example values before use. The example contains no real credentials. `.env.docker` is ignored by Git and excluded from Docker build contexts. Keep the database password and `CSRF_SECRET` private. Use a URL-safe `POSTGRES_PASSWORD` with this local template because Compose embeds it in Prisma's `DATABASE_URL`.

The local Compose app uses `NODE_ENV=development` and `APP_ORIGIN=http://localhost:13004` so the existing exact-origin check accepts the local HTTP URL. The production image defaults to `NODE_ENV=production`; production requires an exact HTTPS `APP_ORIGIN` and keeps Secure, HttpOnly, SameSite=Lax session cookies. Do not change those checks for deployment. On local HTTP the session cookie is not Secure, and traffic is unencrypted; this setup is for loopback development only and does not demonstrate production HTTPS cookie behavior.

Local URLs:

- BorrowBase UI: `http://localhost:13004/`
- Readiness (PostgreSQL probe): `http://localhost:13004/api/ready`
- The dedicated PostgreSQL service has no host-published port.

## Build and first-time startup

Prerequisites for a clean checkout: Git and Docker with Compose v2/Buildx, enough disk space and `linux/amd64` support (emulation on ARM). The Dockerfile installs Node 24.14.0 and locked npm dependencies inside the build; host Node/npm are needed only for source builds/tests (Node >=24.14.0 <25). Use the root build context with `package-lock.json`, backend/frontend sources and committed Prisma migrations. `.dockerignore` excludes local env files, Git metadata, host dependencies, built output, documentation and artifacts; explicit Dockerfile COPY steps determine packaged content.

Run these commands from a new clean checkout’s repository root in PowerShell. Copy the env example only if `.env.docker` does not already exist; preserve existing configuration:

```powershell
if (-not (Test-Path .env.docker)) { Copy-Item .env.docker.example .env.docker }
# Edit .env.docker; do not use the example credentials outside local development.
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker build app migrate
```

For a new local database, start PostgreSQL and apply the checked-in migrations before starting the application:

```powershell
docker compose --env-file .env.docker up -d postgres
docker compose --env-file .env.docker run --rm migrate db:migrate
```

Demo account and equipment seeding is optional. Only run it if the local demo accounts and fixtures are needed; it creates missing approved users, models and tagged assets using upserts with empty updates. Existing passwords, roles, active flags, model descriptions, asset associations/serviceability, requests, Loans and sessions are preserved:

```powershell
# Optional; omit this command if demo data is not needed.
docker compose --env-file .env.docker run --rm migrate db:seed
```

The seed validates both passwords (at least 12 characters each) and the PostgreSQL URL before writes. It is retryable but not one transaction; failure can leave newly created records. It is not a password reset or data-repair tool.

The two `SEED_*_PASSWORD` values are read only by that explicit command; they are not passed to the application service. Replace the sample values before seeding. Never point these commands at a shared or production database.

Start the app after the migration (and optional seed) steps:

```powershell
docker compose --env-file .env.docker up -d app
docker compose --env-file .env.docker ps
```

Compose waits for PostgreSQL's `pg_isready` health check before starting the app. The app command does not run migrations or seed data. On routine startup against an already-initialized database, use `docker compose --env-file .env.docker up -d app`; migrations and seed remain deliberate, separate operations. `/api/ready` checks database connectivity, not migration state.

Useful checks and safe lifecycle commands:

```powershell
docker compose --env-file .env.docker logs app postgres
Invoke-WebRequest http://localhost:13004/
Invoke-WebRequest http://localhost:13004/api/ready
docker compose --env-file .env.docker restart app
docker compose --env-file .env.docker restart postgres
```

Do not use `docker compose down -v` as routine cleanup: it removes the named database volume and its records. If stopping these services is needed, stop only this Compose project and retain its volume.

## Historical npm audit findings and runtime pruning

At the recorded L5-04 verification, `npm audit --omit=dev --json` reported three high-severity findings (zero critical) associated with GHSA-ggr8-5vv4-36mx. The dependency chain is `@prisma/client@6.19.3`'s optional `prisma` peer, plus root development tooling; `prisma@6.19.3` brings in `@prisma/config@6.19.3`, which brings in `deepmerge-ts@7.1.5`. Consequently, `npm ci --omit=dev` retains the optional peer and its toolchain. Testing `--omit=peer` did not remove these packages.

The application runtime does not need the Prisma CLI/config packages: generation occurs in the build stage, which remains the maintenance image with Prisma CLI available for explicit migrations and seed commands. The production-dependencies stage now removes only `node_modules/prisma`, `node_modules/@prisma/config`, and `node_modules/deepmerge-ts` after `npm ci --omit=dev`. Prisma remains at 6.19.3; no package manifest or lockfile was changed.

The install audit precedes filesystem pruning, so build output and the unchanged source dependency graph retain those findings. The mitigation removes unused tooling from the application image; the maintenance image retains Prisma CLI for migrations and seed. No comprehensive final-image vulnerability scan was performed, so the image is not established to be vulnerability-free. Recheck pruning after npm/Prisma packaging changes; no forced audit fix or Prisma upgrade was applied.

## Final C-03 Clean Checkout and Hardened Image Verification

Historical verification: **14 November 2026**, branch `feature/l5-04-docker`, initial implementation commit `00f7d1b`; Docker 29.5.2, Compose 5.1.3, Docker Desktop `linux/amd64`. The preliminary build used a 94-file tracked-source context plus the new Docker files, followed by a committed clean-checkout build and separate runtime-pruned candidate. The results below consolidate those stages; they were not rerun for this documentation change.

| Check / stage | Recorded result |
|---|---|
| Clean checkout / no-cache build | Clean status; `borrowbase-l5-04-clean:verify` built from committed files, 27/27 steps; no host dependencies, ignored env files or untracked application files required |
| Compose validation / maintenance image | Configuration and app/maintenance builds passed; maintenance retained Prisma CLI/config and migration/seed tooling |
| Runtime / image identity | `linux/amd64`, Node `v24.14.0`, user `node` / UID 1000; initial local image `sha256:9093384ea1befbc87a8900c1a341ee1e5e0bbf498a194d06adb66756d7f55869` (167,049,903 bytes); pruned candidate `sha256:edca93491dcdf1c73ece7b679069a1bf8ed2a0ee205b42071f3ab06228a54483` (149,283,685 bytes) |
| UI / API / database | Compose port 13004 and candidate port 13007: HTML 200, readiness 200, unknown API JSON 404 (`NOT_FOUND`); Prisma connection/query and Argon2 hash/verify passed |
| Runtime pruning | `prisma`, `@prisma/config`, `deepmerge-ts` directories absent; Prisma Client 6.19.3, generated client/native engine, Argon2 0.44.0, Express 5.3.0, cookie-parser 1.4.7 and Zod 4.6.7 retained |
| Migration / explicit seed | Two committed migrations applied; optional seed passed once manually; neither ran at app startup |
| App / PostgreSQL restart persistence | Asset `BB-LAP-001` retained ID `fb8deab2-58c2-493a-a65b-070a17a00a11`; named volume `borrowbase-l5-04-postgres-data` retained; no existing project volume deleted |
| Database reconnection | One readiness 503 after PostgreSQL restart, then five consecutive 200 responses without manually restarting the app; app and PostgreSQL became healthy |
| Source validation | Typecheck/build passed; backend non-PostgreSQL subset: 12 files / 71 tests; UI: 4 files / 37 tests. Unfiltered `npm test` did not pass because four guarded PostgreSQL suites lacked dedicated test-database setup; they were not run against the demo database |
| Local origin guard | Production-default candidate with HTTP origin correctly failed HTTPS validation; development configuration succeeded without weakening Origin/CSRF, session or RBAC checks |

Image inputs were Node base `sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8` and PostgreSQL `sha256:63e83b5a3dc36a917dccb76fe1bd2ac51f1ec9c1deb47ff20d4f04233bf6eae9`. Local PostgreSQL reported **16.16**, separate from Cloud SQL **16.15** in [deployment.md](deployment.md#architecture-and-resource-inventory).

The clean-checkout build commands were:

```powershell
git clone --no-local --branch feature/l5-04-docker . $cleanDir
git -C $cleanDir status --porcelain
docker buildx build --platform linux/amd64 --no-cache --load -t borrowbase-l5-04-clean:verify $cleanDir
```

`$cleanDir` is a new temporary checkout directory. From that checkout, use the build/start procedure above to run the app and maintenance image against the dedicated local database. Keep the named volume when restarting or stopping services.

The historical separate-candidate build/run commands were:

```powershell
docker buildx build --platform linux/amd64 --load -t borrowbase-l5-04-pruned:local .
$envValues = @{}
Get-Content .env.docker | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { $envValues[$matches[1]] = $matches[2] }
}
$dbUrl = 'postgresql://{0}:{1}@borrowbase-l5-04-postgres:5432/{2}?schema=public' -f `
  $envValues['POSTGRES_USER'], $envValues['POSTGRES_PASSWORD'], $envValues['POSTGRES_DB']
docker run -d --name borrowbase-l5-04-pruned-local `
  --network borrowbase-l5-04_default --env-file .env.docker `
  -e NODE_ENV=development -e PORT=3000 -e DATABASE_URL=$dbUrl `
  -p 127.0.0.1:13007:3000 borrowbase-l5-04-pruned:local
```

These candidate names/ports are historical; inspect existing containers before reusing them. Do not print `$envValues` or `$dbUrl`. To inspect pruning without database credentials:

```powershell
docker run --rm --entrypoint node borrowbase-l5-04-clean:verify -e "const fs=require('fs'); for(const p of ['prisma','@prisma/config','deepmerge-ts']) console.log(p,fs.existsSync('/app/node_modules/'+p))"
```

The restart-persistence query selected only the synthetic asset ID/code:

```powershell
$query = 'SELECT id::text || chr(124) || "assetCode" FROM "Asset" WHERE "assetCode" = $$BB-LAP-001$$;'
$query | docker exec -i borrowbase-l5-04-postgres psql -U borrowbase_local -d borrowbase_l5_04 -At
```

Source validation commands (run from the repository root after dependency/client setup):

```powershell
npm run typecheck
npm run build
npm test -w backend -- --exclude '**/*.postgres.test.ts'
npm run test:ui
```

This evidence establishes local packaging, HTTP behavior, runtime-pruning checks and restart persistence. It does not establish production Cloud Run operation, HTTPS cookie/security verification or a full authenticated borrow/checkout workflow. Current container state and current vulnerability findings were not rechecked; cloud verification is documented separately in [deployment.md](deployment.md).
