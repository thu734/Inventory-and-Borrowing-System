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

Run these commands from the repository root in PowerShell:

```powershell
Copy-Item .env.docker.example .env.docker
# Edit .env.docker; do not use the example credentials outside local development.
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker build app migrate
```

For a new local database, start PostgreSQL and apply the checked-in migrations before starting the application:

```powershell
docker compose --env-file .env.docker up -d postgres
docker compose --env-file .env.docker run --rm migrate db:migrate
```

Demo account and equipment seeding is optional. Only run it if the local demo accounts and fixtures are needed; it updates demo account passwords and equipment serviceability:

```powershell
# Optional; omit this command if demo data is not needed.
docker compose --env-file .env.docker run --rm migrate db:seed
```

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

## npm audit findings and runtime pruning

`npm audit --omit=dev --json` reports three high-severity findings (zero critical) associated with GHSA-ggr8-5vv4-36mx. The dependency chain is `@prisma/client@6.19.3`'s optional `prisma` peer, plus root development tooling; `prisma@6.19.3` brings in `@prisma/config@6.19.3`, which brings in `deepmerge-ts@7.1.5`. Consequently, `npm ci --omit=dev` retains the optional peer and its toolchain. Testing `--omit=peer` did not remove these packages.

The application runtime does not need the Prisma CLI/config packages: generation occurs in the build stage, which remains the maintenance image with Prisma CLI available for explicit migrations and seed commands. The production-dependencies stage now removes only `node_modules/prisma`, `node_modules/@prisma/config`, and `node_modules/deepmerge-ts` after `npm ci --omit=dev`. Prisma remains at 6.19.3; no package manifest or lockfile was changed.

| Package/path | Before pruning | Verified candidate runtime |
|---|---|---|
| `prisma` 6.19.3 / CLI entrypoint | Present | Absent |
| `@prisma/config` 6.19.3 | Present | Absent |
| `deepmerge-ts` 7.1.5 | Present | Absent |
| `@prisma/client` | 6.19.3 | 6.19.3, present |
| Generated Prisma client and native query engine | Present | Present |
| `argon2` | Present | 0.44.0, present; hash/verify passed |
| `express`, `cookie-parser`, `zod` | Present | 5.3.0, 1.4.7, 4.6.7; present |

The npm install audit runs before the Dockerfile cleanup, so the build output still reports those findings. The source lock/dependency graph also remains unchanged, and no separate vulnerability scan of the final image was run. Filesystem pruning was verified against application startup, a Prisma database query, and Argon2 operation; recheck it if npm's optional-peer resolution or Prisma packaging changes. Package presence or an audit advisory alone does not establish exploitability. No `npm audit fix --force` or Prisma upgrade was run.

## Runtime-pruned candidate verification

Built and tested as a separate image/container so the original L5-04 app and PostgreSQL services were not replaced:

```powershell
docker buildx build --platform linux/amd64 --load -t borrowbase-l5-04-pruned:local .
```

Candidate image: `sha256:edca93491dcdf1c73ece7b679069a1bf8ed2a0ee205b42071f3ab06228a54483`, `linux/amd64`, 149,283,685 bytes, configured user `node`; `id -u` inside the running app returned `1000`. The separate `borrowbase-l5-04-maintenance:local` image still physically contains `node_modules/prisma/build/index.js` and `node_modules/@prisma/config/package.json`.

The successful candidate used the existing local `.env.docker` values, the L5-04 Docker network, and Compose's local `NODE_ENV=development` setting:

```powershell
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

| Check | Command / observation | Result |
|---|---|---|
| UI | `curl.exe -sS -o NUL -w "%{http_code} %{content_type}" http://127.0.0.1:13007/` | `200 text/html` |
| Readiness | `curl.exe -sS -o NUL -w "%{http_code}" http://127.0.0.1:13007/api/ready` | `200`; PostgreSQL reachable |
| API miss | `curl.exe -sS -w "\nHTTP=%{http_code} TYPE=%{content_type}" -H "Accept: text/html" http://127.0.0.1:13007/api/v1/l5-04-unknown` | `404 application/json`, code `NOT_FOUND` |
| Prisma runtime | Candidate image with Prisma CLI/config/deepmerge paths absent; `$connect()` and `$queryRaw SELECT 1` | Passed |
| Runtime packages | Package filesystem checks in the candidate | Three toolchain packages absent; `@prisma/client` 6.19.3, generated client, Debian OpenSSL 3 query engine and Argon2 present |
| Argon2 | Hash and verify a local synthetic probe using the candidate runtime | Passed |
| App restart persistence | Query `BB-LAP-001`, `docker restart borrowbase-l5-04-pruned-local`, then query again | Same ID before and after: `fb8deab2-58c2-493a-a65b-070a17a00a11` |

The first candidate launch used the production image default (`NODE_ENV=production`) with the local HTTP origin and correctly failed the existing HTTPS-origin validation. Retesting with the documented local development setting succeeded; no origin, cookie, CSRF, session, or RBAC checks were weakened. The failed test container `borrowbase-l5-04-pruned` is exited and was left in place; the verified candidate `borrowbase-l5-04-pruned-local` remains running.

The source checks were rerun:

```powershell
npm run typecheck
npm run build
Set-Location backend
npm test -- --exclude '**/*.postgres.test.ts'
Set-Location ..
npm run test:ui
```

All passed: typecheck and build; backend 12 files / 71 tests; UI 4 files / 37 tests. The PostgreSQL integration suites were not run against the shared L5-04 demo database.

## C-03 build/run and persistence evidence

Verified 14 November 2026 with Docker 29.5.2 and Compose 5.1.3 on Docker Desktop `linux/amd64`. The clean build context contained 94 tracked-source files plus the new L5-04 Docker files; it did not include host `node_modules`, ignored local environment files or Git metadata. A generated, ignored `.env.docker` supplied local-only values and was never printed or committed. The services below are the dedicated L5-04 resources; no pre-existing containers or volumes were modified.

| Evidence | Command / observation | Result |
|---|---|---|
| Clean context | `docker buildx build --platform linux/amd64 --load -t borrowbase-l5-04-app:local $temp` where `$temp` was a temporary context assembled from tracked files and the new Docker files | Passed; `linux/amd64` image built and loaded |
| Compose config/build | `docker compose --env-file .env.docker.example config --quiet`; `docker compose --env-file .env.docker build app`; `docker compose --env-file .env.docker build migrate` | Passed |
| Image/platform/user | `docker image inspect borrowbase-l5-04-app:local` | `linux/amd64`, Node `v24.14.0`, configured user `node` (UID 1000), 167,049,903 bytes; local image ID/digest `sha256:9093384ea1befbc87a8900c1a341ee1e5e0bbf498a194d06adb66756d7f55869` |
| React UI | `GET http://127.0.0.1:13004/` | HTTP 200, `text/html` |
| JSON API miss | `GET /api/v1/l5-04-unknown` with `Accept: text/html` | HTTP 404, `application/json`, `NOT_FOUND` |
| PostgreSQL readiness | `GET http://127.0.0.1:13004/api/ready` | HTTP 200, `{"status":"ready"}` |
| PostgreSQL connectivity | `docker compose --env-file .env.docker run --rm migrate db:migrate`; PostgreSQL health and app readiness | Passed; two checked-in migrations applied, PostgreSQL 16.16 healthy |
| Explicit demo seed | `docker compose --env-file .env.docker run --rm migrate db:seed` | Passed once, manually; no routine startup seeding |
| Application restart | `docker compose --env-file .env.docker restart app`; queried seeded Asset `BB-LAP-001` | Same ID before/after: `fb8deab2-58c2-493a-a65b-070a17a00a11` |
| PostgreSQL restart | `docker compose --env-file .env.docker restart postgres`; named volume retained | Same Asset ID after restart; PostgreSQL and app returned healthy |
| Isolated resources | `docker compose ps`, `docker volume inspect borrowbase-l5-04-postgres-data` | `borrowbase-l5-04-app` and `borrowbase-l5-04-postgres` healthy; named volume `borrowbase-l5-04-postgres-data` |

Image inputs resolved during this build: `node:24.14.0-bookworm-slim` base `sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8`; PostgreSQL image `postgres:16` resolved to `postgres@sha256:63e83b5a3dc36a917dccb76fe1bd2ac51f1ec9c1deb47ff20d4f04233bf6eae9`. PostgreSQL reported `16.16 (Debian 16.16-1.pgdg13+1)`.

The persistence query used only the synthetic asset ID/code, not credentials or password hashes:

```powershell
$query = 'SELECT id::text || chr(124) || "assetCode" FROM "Asset" WHERE "assetCode" = $$BB-LAP-001$$;'
$query | docker exec -i borrowbase-l5-04-postgres psql -U borrowbase_local -d borrowbase_l5_04 -At
```

Exact Docker commands included:

```powershell
docker buildx build --platform linux/amd64 --load -t borrowbase-l5-04-app:local $temp
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker build app
docker compose --env-file .env.docker build migrate
docker compose --env-file .env.docker up -d --no-build postgres app
docker compose --env-file .env.docker run --rm migrate db:migrate
docker compose --env-file .env.docker run --rm migrate db:seed
docker compose --env-file .env.docker up -d --no-deps app
docker compose --env-file .env.docker restart app
docker compose --env-file .env.docker restart postgres
```

`$temp` was the temporary 94-file clean context described above. The clean-context image was run, then Compose rebuilt/recreated the app from the same Dockerfile; final HTTP and persistence checks passed on that Compose-built image.

Exact application validation commands:

```powershell
npm run typecheck
npm run build
Set-Location backend
npm test -- --exclude '**/*.postgres.test.ts'
Set-Location ..
npm run test:ui
npm test
```

`npm run typecheck`, `npm run build`, backend `npm test -- --exclude '**/*.postgres.test.ts'` (12 files / 71 tests), and `npm run test:ui` (4 files / 37 tests) passed. Unfiltered `npm test` did not pass: four backend PostgreSQL suites intentionally require explicitly selected disposable test databases (`DATABASE_URL` and `SYS01_TEST_DATABASE=true` with suite-specific database names); they were not run against the L5-04 demo database. The other 12 backend files and all 4 frontend test files passed.

This evidence establishes local packaging, HTTP behavior and PostgreSQL persistence only. It does not establish a cloud deployment, production HTTPS/Secure-cookie behavior, or a full authenticated borrow/checkout workflow. `npm ci --omit=dev` still reports three high-severity dependency audit findings before the Dockerfile removes the unused packages from the final runtime filesystem; see the runtime-pruning section above. Prisma 6.19 emitted its existing `package.json#prisma` deprecation warning.

### Final Database Recovery Verification

After restarting the PostgreSQL container, the existing asset `BB-LAP-001` retained its original database ID.

The first application readiness request returned HTTP 503 during database reconnection. Without manually restarting the application, five consecutive follow-up readiness requests returned HTTP 200 with `{"status":"ready"}`.

Both the application and PostgreSQL containers subsequently reported healthy status.

**Result: PASS — Data persistence and automatic readiness recovery verified.**

The hardened application image was also verified to run as UID 1000 without the unused `prisma`, `@prisma/config` and `deepmerge-ts` package directories. The npm dependency audit findings remain documented separately.