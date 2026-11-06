# CPE Equipment Borrowing and Inventory Management System

A full-stack CPE 334 course project for a hypothetical equipment lending service in the **KMUTT Computer Engineering Department**. The system tracks individual physical equipment units using synthetic accounts and equipment data.

| Item | Details |
|---|---|
| Theme | Theme 2: Inventory and Borrowing System |
| Team | Member 6 (requesting student) and Member 2; names, student IDs and GitHub handles pending |
| Assessment | Project Deliverable 1: Engineering Baseline and Working Sprint 1 |
| Deadline | 8 November 2026, 23:59 Thailand time (Asia/Bangkok) |
| Repository | [Inventory-and-Borrowing-System](https://github.com/thu734/Inventory-and-Borrowing-System) |
| Current status | F-01 independent implementation and tests exist; real database integration and teammate review pending |
| Submitted release | None yet |

## Project overview

The department lends laptops, ESP32/Arduino boards, Raspberry Pi kits and other laboratory equipment. Every physical unit has a unique asset code.

- **Borrowers** browse equipment, submit requests and view their own requests and loans.
- **Custodians** inspect requests, record checkout and return, maintain inventory and view department summaries.

Pending requests do not reserve equipment. Custodian checkout creates an active loan and makes the unit unavailable. Backend permissions and database constraints must prevent unauthorized operations and concurrent duplicate loans. Equipment serviceability is tracked separately from borrowing availability.

## Deliverable 1 status

| Part | Required content | Current state |
|---|---|---|
| A | Whole-product SRS | Draft prepared; review pending |
| B | Feature inventory and requirements traceability | Draft prepared; review pending |
| C | System-level SDS | Draft prepared; review pending |
| D | Three-sprint plan | Draft prepared; review pending |
| E | Sprint 1 contracts, acceptance criteria, Software Test Specification and Product Definition of Done | F-01/F-03 and shared STS/DoD recorded before implementation; teammate review and Member 2 contracts pending |
| F | Working Sprint 1, verification and reviewed integration evidence | F-01 code/build/unit/API-behavior/UI checks exist; PostgreSQL and whole-product verification pending |

**This is not a completed Sprint 1 application or submission.** The auth frontend runs and both workspaces build. Authentication has an Express implementation and Prisma adapter, but API startup requires Member 2's generated client, User/Session schema and migrated database. No production fallback/demo store is used. Current API tests use a test-only store, not PostgreSQL. Proposed policies and integration dependencies are recorded in the [SRS](docs/srs.md), [contracts](docs/sprints/sprint-1/contracts/F-01-authentication.md) and [results](docs/evidence/sprint-1/test-results.md).

## Engineering documents

| Document | Purpose |
|---|---|
| [Software Requirements Specification](docs/srs.md) | Context, actors, scope, FR/BR/NFR, assumptions and decisions |
| [Feature inventory](docs/features.md) | Stable feature IDs, requirements, dependencies and sprint allocation |
| [Requirements traceability](docs/traceability.md) | Requirement-to-feature-to-sprint mapping and planned verification responsibilities |
| [System-level SDS](docs/system-sds.md) | Architecture, data model, permissions, UI/API conventions and delivery design |
| [Three-sprint plan](docs/sprints/plan.md) | Sprint goals, dependencies, outcomes and assessment milestones |
| [Proposed Issues and review register](docs/issues.md) | Suggested ownership split, open decisions and actual contribution status |
| [Member 6 handoff](docs/sprints/sprint-1/member-6-handoff.md) | Owned contracts, interface dependencies, tradeoffs and implementation review gate |
| [F-01 authentication contract](docs/sprints/sprint-1/contracts/F-01-authentication.md) | Session/API/UI/security behavior and acceptance criteria |
| [F-03 Borrower contract](docs/sprints/sprint-1/contracts/F-03-borrowing-requests.md) | Requests, owner-scoped retrieval and Borrower active loans |
| [Member 6 test specification](docs/sprints/sprint-1/test-specification.md) | Planned test inputs, actions, expected results and AC mapping |
| [Proposed Product Definition of Done](docs/sprints/sprint-1/definition-of-done.md) | Shared completion and evidence criteria for review |

These documents distinguish **lecturer requirements**, **confirmed design decisions** and **recommendations awaiting agreement**. Source handout details and version limitations appear in the [SRS](docs/srs.md).

## Planned technology stack

| Area | Technology |
|---|---|
| Frontend | React, TypeScript and Vite |
| Backend | Node.js, Express and TypeScript |
| Database | PostgreSQL and Prisma |
| Testing | Vitest, Supertest and Playwright |
| Architecture | Modular monolith: UI → API/application layer → persistent database |
| Later deployment | Docker and GCP through Lab 5 |

Runtime and dependency versions will be pinned during reviewed implementation. The [SDS](docs/system-sds.md) explains the technology choices and component responsibilities.

## Repository organization

Baseline files (Member 6 contract additions are linked above):

```text
.
├── README.md
└── docs/
    ├── srs.md
    ├── features.md
    ├── traceability.md
    ├── system-sds.md
    ├── issues.md
    └── sprints/
        └── plan.md
```

The target Sprint 1 structure is defined in the [SDS](docs/system-sds.md#sprint-1-repository-structure). Application code, contracts, migrations, tests and evidence files will be added as their work proceeds. Later-sprint implementation and Lab 5 deployment files are deferred.

## Local setup and testing

Use Node.js 24.14 or later in the 24.x line (tested: 24.14.0), with npm (tested: 11.9.0). npm workspaces share a committed lockfile.

```bash
npm ci
npm run typecheck
npm run build
npm test
```

Focused checks: `npm run test:unit`, `npm run test:api` (Express behavior with a test-only store), and `npm run test:ui`. No PostgreSQL integration or full E2E run is claimed. Tests do not access a live database.

To view the frontend:

```bash
npm run dev -w frontend
```

Open `http://localhost:5173`. Vite proxies `/api` to port 3000. Until the API is configured, the UI correctly shows service unavailable, not fake login success.

To run the real API after Member 2's database work is available: copy [backend environment example](backend/.env.example) to an ignored local environment file; configure DATABASE_URL and a randomly generated CSRF_SECRET of at least 32 bytes; retain APP_ORIGIN exactly matching the browser origin. Member 2 must supply Prisma generation/migration/seed commands and safe synthetic accounts. Then `npm run dev -w backend`, or `npm run dev` for both processes. No migration/reset/seed happens automatically. This startup path is not yet verified against PostgreSQL; there are no valid bundled demo credentials.

Member 2 must generate a Prisma 6-compatible client with `user` and `session` delegates matching [F-01](docs/sprints/sprint-1/contracts/F-01-authentication.md); if choosing a different client version/output, review the adapter/startup together. Do not change database ownership or create parallel migrations in this feature branch.

Keep real credentials, tokens and local environment files out of Git. Test evidence records commands, actual test names, tested commit and passing/failing/skipped counts in [results](docs/evidence/sprint-1/test-results.md).

## Planned sprint scope

| Sprint | Outcome |
|---|---|
| 1 | Authentication, seeded catalog, pending requests, checkout, active-loan retrieval, authorization and tests |
| 2 | Returns, due dates/overdue rules, inventory administration and catalog search |
| 3 | Loan history, inventory reporting, integration, regression, usability and final hardening |

Parts A–D cover the complete intended product. Deliverable 1 requires a working Sprint 1 increment. See the [sprint plan](docs/sprints/plan.md) for dependencies and later lab obligations.

## Contribution and Git workflow

Follow the specification-first sequence:

**SRS → Feature Inventory → Requirements Traceability → System-Level SDS → Three-Sprint Plan → Feature Engineering Contracts → Implementation → Testing → PR Review → Integration → Release.**

For each bounded feature or fix:

1. Create a GitHub Issue linked to the requirements, feature and contract.
2. Review and version its contract, acceptance criteria and test specification before implementation.
3. Create a short-lived branch from `sprint1-staging`, such as `feature/F-01-authentication` or `fix/checkout-conflict`.
4. Implement and test the change; retain meaningful TDD failing/passing evidence.
5. Open a PR into `sprint1-staging`; the other student provides a substantive review. Authors do not approve their own work.
6. Integrate and verify the increment, then use a reviewed release PR from `sprint1-staging` to `main`.
7. Record the accepted release tag/commit and evidence against that version.

`main` holds accepted releases. `sprint1-staging` is the Sprint 1 integration branch. GitHub Issues and a project board track work; the [current Issue list](docs/issues.md) contains proposals, not created or completed GitHub Issues.

Both students participate in design, implementation, testing and review, and later deployment and maintenance. Record actual contributions through Issues, commits, PRs and a short contribution table. Do not invent reviews or contributions.

For AI-assisted work, pushes, PR creation, merges and changes to `main` require the requesting student's approval.

## Submission and evidence

Deliverable 1 ultimately requires a self-contained PDF containing Parts A–E and selected Part F execution/process evidence, with navigation and the submitted release tag/commit. Repository links supplement the PDF; they do not replace its required content. **The final submission PDF has not been prepared.**

Retain normal workflow, persisted retrieval, business-rule rejection and authorization demonstrations; build/test results; meaningful test excerpts; reviewed Issue/PR and integration history; actual contributions; and known limitations. Docker, completed CI/CD and GCP deployment are assessed in Lab 5 rather than Deliverable 1.

## AI assistance

Codex assisted with reading the supplied handouts, inspecting the repository and drafting the baseline documentation and this README. Both students remain responsible for validating decisions and understanding the final work. No teammate approval or implementation completion is implied.
