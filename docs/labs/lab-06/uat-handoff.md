# BorrowBase — Lab 6 Part A: Independent UAT Handoff

## A.1 Product and handoff identification

| Item | Information |
|---|---|
| Course / section | CPE334 Software Engineering / 31 |
| Product team | MT |
| Project | BorrowBase — Equipment Inventory and Borrowing System (Theme 2) |
| Members | Moe Htet Aung — 67070503482; Thu Thu Wai — 67070503486 |
| Independent UAT team / two testers | [Partner team and names] |
| Handoff date / testing window | [Agreed date/time, Asia/Bangkok] |

Team MT provides the product, accounts, fixtures and expected behavior. The partner independently executes the cases and records actual results. This package covers Part A; include its complete cases and applicable acceptance criteria in the team's final self-contained Lab 6 PDF. Official submission deadline: 22 November 2026, 23:59 Bangkok.

## A.2 Application version, URL and Sprint 1 scope

- Application: https://borrowbase-fniy3qjctq-as.a.run.app
- Repository: https://github.com/thu734/Inventory-and-Borrowing-System
- Established source baseline: 6a0e29154c2b2165c486b0bc8d18e3fd2475b2fc.
- Last owner-confirmed serving revision: borrowbase-00007-jck, 100% traffic.
- Public access checked on 19 November 2026, approximately 17:40 Bangkok: home, health and readiness returned 200; anonymous /api/v1/auth/me returned 401. This does not verify account login.

Team MT confirms the release used for the session before testing; testers record it in A.7. The source baseline and revision above come from separate source/deployment observations; this document does not assert a newly verified image-to-commit association. Notify the partner before changing the tested release.

| Delivered feature | Requirements / acceptance scope |
|---|---|
| F-01 Authentication and Authorization | FR-01: login, authenticated identity, logout and access restrictions |
| F-02 Equipment Catalog | FR-02: physical assets, details, serviceability and computed availability |
| F-03 Borrowing Requests and Own Records | FR-03–04: eligible pending requests, duplicate prevention, own requests and active Loans |
| F-04 Custodian Checkout | FR-05–06: request queue, eligible checkout, fulfilled request and active Loan |

Key rules: availability requires SERVICEABLE and no active Loan (BR-02); PENDING requests do not reserve equipment, but duplicate pending requests by the same Borrower/asset are rejected (BR-03); checkout is Custodian-only and creates at most one active Loan per asset (BR-04–06); another Borrower's competing request remains PENDING (BR-10). Protected records are owner-scoped (BR-06/NFR-01); protected POSTs use authenticated cookies, exact Origin and CSRF (NFR-02); saved records persist (NFR-03); rejected operations leave no partial state (NFR-08).

Returns, due dates/overdue processing, inventory editing, search/filtering, completed-loan history and reporting are outside Sprint 1 acceptance.

Acceptance baseline: [SRS](https://github.com/thu734/Inventory-and-Borrowing-System/blob/6a0e29154c2b2165c486b0bc8d18e3fd2475b2fc/docs/srs.md) and contracts [F-01](https://github.com/thu734/Inventory-and-Borrowing-System/blob/6a0e29154c2b2165c486b0bc8d18e3fd2475b2fc/docs/sprints/sprint-1/contracts/F-01-authentication.md), [F-02](https://github.com/thu734/Inventory-and-Borrowing-System/blob/6a0e29154c2b2165c486b0bc8d18e3fd2475b2fc/docs/sprints/sprint-1/contracts/F-02-equipment-catalog.md), [F-03](https://github.com/thu734/Inventory-and-Borrowing-System/blob/6a0e29154c2b2165c486b0bc8d18e3fd2475b2fc/docs/sprints/sprint-1/contracts/F-03-borrowing-requests.md) and [F-04](https://github.com/thu734/Inventory-and-Borrowing-System/blob/6a0e29154c2b2165c486b0bc8d18e3fd2475b2fc/docs/sprints/sprint-1/contracts/F-04-custodian-checkout.md).

## A.3 Accounts, roles and access instructions

| Label | Email | Role | Owner-confirmed User.id |
|---|---|---|---|
| UAT-USER-A / A | borrower@example.test | BORROWER | 7faabc67-d20e-4dfe-9473-59d8d2e60b45 |
| UAT-USER-B / B | uat-borrower-b@example.test | BORROWER | d83f13ef-1d40-4a9d-87e3-5b9a81c7b2d6 |
| UAT-CUSTODIAN / Custodian | custodian@example.test | CUSTODIAN | a20f99f1-db43-4fc3-8426-a228bbbb8d5d |

All three identities exist in the owner's database verification. Before exchange, confirm all three accounts can log in and deliver their credentials privately; successful current login and private delivery have not yet been confirmed in this handoff.

Open the application, enter Email and Password, and select Sign in. Borrowers see Equipment Catalog, My Requests and My Active Loans. Custodians see Equipment Catalog and Custodian Workspace, including Pending, All requests and Refresh records. These sections are on the same page; scroll to their headings.

Use separate browser profiles/contexts for A, B and Custodian; tabs in one profile share cookies. Confirm the displayed account name/role before each operation. Use Sign out when switching identities within one context. Never include credentials, password hashes, cookies, CSRF tokens or database connection details in reports or screenshots.

## A.4 Synthetic fixtures and setup/cleanup

The following identifiers and starting states are owner-confirmed from deployed Cloud SQL preparation and read-only verification. They are setup facts, not independent UAT results. Partners locate equipment by assetCode; API calls use Asset.id. Request.id and Loan.id are separate identifiers.

| Fixture | Actual assetCode | Asset.id | Initial state / use |
|---|---|---|---|
| ASSET-A | BB-LAP-UAT6-A-001 | a444f967-3720-41a4-b233-c26cfa4196a2 | SERVICEABLE; no active Loan or pending request; cases 02–04 |
| ASSET-B | BB-RPI-001 | 84fa77fb-cab4-4e4d-9fb9-28f96b3aab88 | MAINTENANCE; no active Loan; case 02 |
| ASSET-C | BB-LAP-001 | bf428b51-c9a3-4402-ac82-a45d0514189a | SERVICEABLE; existing active Loan owned by A; case 02 |
| ASSET-D | BB-LAP-UAT6-D-001 | ba4f60de-4e8f-401d-bc04-ccb6cbf79521 | SERVICEABLE; no active Loan; two pending requests D1/D2; case 08 |
| ASSET-E | BB-LAP-UAT6-E-001 | 21dac928-6bc4-4f7f-95c5-e76a6de94cff | SERVICEABLE; no active Loan; pending request E; cases 06–07 |

| Request | Owner / asset | Request.id | Initial state |
|---|---|---|---|
| REQ-A | A / ASSET-A | Created by independent testers in BB-UAT-03; record its UUID then | Absent before case 03; do not prepare it in advance |
| REQ-D1 | A / ASSET-D | a8f615c3-65cd-4715-9924-da4110c5731b | PENDING; fulfilledAt=NULL; no associated Loan |
| REQ-D2 | B / ASSET-D | 645e6f94-cf61-4ccd-99b6-1d9650163a6a | PENDING; fulfilledAt=NULL; no associated Loan |
| REQ-E | A / ASSET-E | 52b7588a-07a7-4e9a-bf22-8a665428caed | PENDING; fulfilledAt=NULL; no associated Loan |

ASSET-C's existing active Loan is 54fe8bf2-be90-4735-9f36-a08dab7405fb, owned by A. Preserve it unchanged. A/D/E reuse EquipmentModel 6f11b4eb-e438-4c32-ab2b-3e180f367872. No additional setup records are needed for the first run. The new E and D Loans are created only in cases 07 and 08.

Before execution, check the catalog and prepared requests against this manifest using the case instructions. If a starting state has changed, stop the affected case and contact Team MT. The partner does not need Cloud SQL access or direct database writes.

**During/after testing:** use only assigned fixtures; preserve generated requests, Loans and grading evidence. Do not reset/reseed the database, delete records, reverse fulfillment or alter existing Loans. For reruns, Team MT supplies replacement eligible synthetic fixtures and updates the manifest. Sprint 1 has no return UI for resetting checked-out equipment. Sign out after testing and retain sanitized evidence.

## A.5 Execution order

Run cases 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08. Stay signed in as A for cases 02–04; use the separate account contexts when instructed.

- Case 03 creates REQ-A; cases 04/05 use it. Do not check out ASSET-A.
- Case 06 must leave REQ-E unchanged; case 07 then checks out E.
- Case 08 uses the separate D1/D2 requests on ASSET-D.
- Record missing access/data as BLOCKED. Do not automatically repeat an uncertain submission; inspect saved records first. Stop dependent cases if a fixture changes unexpectedly.

Use the UI for the cases below. Case 05 uses a saved detail-page address to test ownership; case 06 includes the one browser request needed to test an action hidden from Borrowers. A hidden or disabled button alone is not proof of server authorization.

## A.6 Detailed eight UAT cases

Record actual results in A.7; the outcomes below are expectations only. References such as FR-03/04 mean FR-03 and FR-04.

### BB-UAT-01 — Borrower authentication and authorized access

**Role:** Borrower A. **Input:** UAT-USER-A and its privately supplied credential.
**Precondition:** account active; application available.
**References:** FR-01; BR-06; AC-F01-01/04.

1. Open the application in A's browser context. Enter Email and Password, then select Sign in.
2. Confirm the Borrower identity, Equipment Catalog, My Requests and My Active Loans. Custodian Workspace and Checkout must not appear.
3. Open the two own-record views. Expect records belonging to A or a clear empty state.
4. Select Sign out, then reload. The Sign in form must appear and protected records must not be displayed. Sign in as A again for the next cases.

**Expected:** A can access Borrower functions; logout removes authenticated access. No borrowing records change. Case 06 checks backend checkout denial separately.

### BB-UAT-02 — Equipment availability and serviceability

**Role:** Borrower A. **Inputs:** ASSET-A (BB-LAP-UAT6-A-001), ASSET-B (BB-RPI-001), ASSET-C (BB-LAP-001).
**Precondition:** fixture states match A.4.
**References:** FR-02/03; BR-01/02; AC-F02-01/02, AC-F03-02.

1. In Equipment Catalog select Refresh Equipment. Locate the three codes and select View Details for each.
2. Confirm A is SERVICEABLE/Available with Request BB-LAP-UAT6-A-001; B is MAINTENANCE/Unavailable; C is SERVICEABLE/Unavailable because it is already loaned. B/C must have no request button.
3. To test rejection beyond the missing buttons, open the existing [ASSET-B request screen](https://borrowbase-fniy3qjctq-as.a.run.app/#request?assetId=84fa77fb-cab4-4e4d-9fb9-28f96b3aab88&assetCode=BB-RPI-001) in A's context. Confirm the code, then select Submit request once. Expect “This asset is not available for a new request.”
4. Repeat using the [ASSET-C request screen](https://borrowbase-fniy3qjctq-as.a.run.app/#request?assetId=bf428b51-c9a3-4402-ac82-a45d0514189a&assetCode=BB-LAP-001). Expect the same rejection, not a saved request.
5. Open My Requests and My Active Loans. No B/C request or Loan is added; A's existing C Loan remains unchanged.

**Expected:** availability matches serviceability/Loan state, and unavailable equipment cannot acquire a new request. The direct links use the application's existing request screen; they do not change asset state.

### BB-UAT-03 — Borrower creates a pending request

**Role:** Borrower A. **Input:** ASSET-A, BB-LAP-UAT6-A-001.
**Preconditions:** SERVICEABLE, no active Loan, no existing A-owned pending request for this asset.
**References:** FR-03/04; BR-02/03/06; AC-F02-04, AC-F03-01/03/06.

1. In Equipment Catalog select Request BB-LAP-UAT6-A-001. Confirm Request selected Asset shows that code.
2. Select Submit request once. Expect Request saved — PENDING.
3. Select View saved request. Record the displayed Record UUID as REQ-A and note its requested timestamp.
4. Select My Requests, open the BB-LAP-UAT6-A-001 row and reload. Confirm the same request ID, PENDING status, asset and timestamp.
5. Check My Active Loans: no Loan for ASSET-A was created. Select Refresh Equipment: ASSET-A remains Available.

**Expected:** exactly one new pending request belongs to A; it survives reload without creating a Loan or reserving the equipment. Retain REQ-A for cases 04/05.

### BB-UAT-04 — Duplicate pending request rejected

**Role:** Borrower A. **Inputs:** ASSET-A and REQ-A from case 03.
**Preconditions:** REQ-A still PENDING; ASSET-A has no active Loan.
**References:** FR-03; BR-03; AC-F03-07; supporting TEST-F03-06.

1. From My Requests return to Equipment Catalog and select Request BB-LAP-UAT6-A-001 again.
2. Select Submit request once. Expect “You already have a pending request for this asset.” No saved-success message should appear.
3. Open My Requests again. Count requests for that asset: exactly one remains PENDING, with the original REQ-A ID and timestamp.

**Expected:** the duplicate is rejected; no extra request or Loan is created. Keep REQ-A pending for case 05.

### BB-UAT-05 — Borrower cannot access another Borrower's records

**Roles:** Borrower A and Borrower B. **Inputs:** REQ-A and B's own REQ-D2.
**Preconditions:** distinct signed-in contexts; case 03 completed; REQ-D2 prepared.
**References:** FR-04; BR-06; NFR-01; AC-F01-05, AC-F03-03/04.

1. As A, open My Requests and the BB-LAP-UAT6-A-001 request. Confirm REQ-A and copy this detail page's full browser address. Note the status and timestamp.
2. In B's context, confirm B's identity and open My Requests. REQ-A must not appear. Open B's BB-LAP-UAT6-D-001 request and confirm its Record ID is 645e6f94-cf61-4ccd-99b6-1d9650163a6a.
3. Paste A's copied detail-page address into B's address bar. Expect “Resource not found.” with no A-owned request details. B must remain signed in; a login screen or connection error does not prove ownership denial.
4. Return to A's context and reopen REQ-A. Confirm the original status, asset and timestamp are unchanged.

**Expected:** B can read B's own request but cannot retrieve A's protected request, including by direct navigation. This performs a protected-record request; it is not merely a hidden-navigation check. The contract response is 404 NOT_FOUND if inspected in browser Network.

### BB-UAT-06 — Borrower cannot perform Custodian checkout

**Role:** Borrower A, with Custodian used only to inspect before/after state.
**Input:** REQ-E, 52b7588a-07a7-4e9a-bf22-8a665428caed, for BB-LAP-UAT6-E-001.
**Preconditions:** REQ-E PENDING; E available; no E Loan.
**References:** FR-05/06 access boundary; BR-05/06; AC-F01-05, AC-F04-02.

1. In the Custodian context select Refresh records and Pending. Locate REQ-E by Request ID and confirm its borrower/asset. Check that Active Loans contains no E Loan.
2. Return to A's context and confirm Borrower identity. Custodian checkout controls must be absent.
3. Because the UI hides checkout from Borrowers, open DevTools → Console on the application page and run this single REQ-E denial attempt. It verifies A's identity and sends the session's CSRF token privately; it does not copy or display credentials.
   ~~~javascript
   await (async () => {
     if (location.origin !== 'https://borrowbase-fniy3qjctq-as.a.run.app')
       throw new Error('Open BorrowBase first.');
     const me = await fetch('/api/v1/auth/me', { credentials: 'same-origin' });
     if (!me.ok) throw new Error('Sign in as Borrower A.');
     const s = (await me.json()).data;
     if (s.user.id !== '7faabc67-d20e-4dfe-9473-59d8d2e60b45' || s.user.role !== 'BORROWER')
       throw new Error('Wrong account; stop.');
     const r = await fetch('/api/v1/custodian/borrow-requests/52b7588a-07a7-4e9a-bf22-8a665428caed/checkout', {
       method: 'POST', credentials: 'same-origin',
       headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrfToken },
       body: '{}'
     });
     return { status: r.status, error: (await r.json()).error };
   })();
   ~~~
   Expect 403 FORBIDDEN. A sign-in error, wrong-account warning or other rejection such as CSRF_FORBIDDEN does not establish role denial; resolve access or record BLOCKED. Do not capture authentication headers/tokens or automatically retry an uncertain response.
4. In the Custodian context select Refresh records. REQ-E must still be PENDING, E available, and no E Loan created.

**Expected:** A cannot perform checkout and no domain state changes. If it unexpectedly succeeds, record FAIL and stop case 07.

### BB-UAT-07 — Custodian checkout and persistence

**Roles:** Custodian, then Borrower A. **Input:** REQ-E on BB-LAP-UAT6-E-001.
**Preconditions:** REQ-E PENDING and owned by A; E SERVICEABLE with no active Loan; case 06 left it unchanged.
**References:** FR-02/04/05/06; BR-02/04/05; NFR-03; AC-F02-02, AC-F03-03/04/06, AC-F04-01/03.

1. In Custodian Workspace select Pending and locate REQ-E by its Request ID and asset code.
2. Select Checkout, then Confirm checkout. Expect Checkout successful. Record the shown request and Active Loan IDs.
3. Check E's catalog availability immediately, before Refresh Equipment. Expect Unavailable. If a refresh is needed, record the initial mismatch separately; a refreshed display does not erase it.
4. Select All requests and inspect Active Loans. Confirm REQ-E is FULFILLED and no longer offers Checkout; exactly one Loan for BB-LAP-UAT6-E-001 belongs to A, with the recorded Loan ID.
5. In A's context, sign in if needed. Open My Requests and My Active Loans, then E's records. Reload and confirm the fulfilled request, same active Loan ID/checkout time and unavailable equipment remain visible.

**Expected:** checkout fulfills the correct request and creates exactly one active Loan. Saved state remains consistent in the Borrower's separate session and after reload. Retain these records; no restart, redeployment or reset is required.

### BB-UAT-08 — Competing pending requests

**Roles:** Custodian, Borrower A and Borrower B.
**Inputs:** ASSET-D (BB-LAP-UAT6-D-001), REQ-D1 (a8f615c3-65cd-4715-9924-da4110c5731b, A), REQ-D2 (645e6f94-cf61-4ccd-99b6-1d9650163a6a, B).
**Preconditions:** both requests PENDING; D SERVICEABLE with no active Loan.
**References:** FR-03/04/05/06; BR-02/03/04/05/10; AC-F03-07, AC-F04-01/03/07.

1. In the Custodian context select Refresh records and Pending. Locate D1/D2 by Request ID and borrower; confirm both are PENDING. D remains Available despite the two requests.
2. Select Checkout then Confirm checkout on D1 only. Record the new Loan ID.
3. Select All requests: D1 must be FULFILLED. Under Pending, D2 must remain PENDING and show Unavailable/disabled Checkout unavailable. Active Loans must show exactly one D Loan, belonging to A.
4. In B's context open My Requests and D2: still PENDING. In A's context open My Active Loans: the recorded D Loan appears. Refresh Equipment and confirm D is Unavailable.

**Expected:** only D1 is fulfilled; D2 remains PENDING and unavailable for checkout while D is loaned. D2 is not automatically fulfilled or cancelled, and exactly one active D Loan exists.

## A.7 Blank results-recording template

Both partner students participate. All fields below are reserved for independent execution; no result is pre-filled.

| Case | Tester / team | Date/time + timezone | Tested SHA / revision | Inputs / generated IDs | PASS / FAIL / BLOCKED | Actual observed result | Evidence |
|---|---|---|---|---|---|---|---|
| BB-UAT-01 | | | | | | | |
| BB-UAT-02 | | | | | | | |
| BB-UAT-03 | | | | | | | |
| BB-UAT-04 | | | | | | | |
| BB-UAT-05 | | | | | | | |
| BB-UAT-06 | | | | | | | |
| BB-UAT-07 | | | | | | | |
| BB-UAT-08 | | | | | | | |

PASS means observed behavior matches the expected results; FAIL means it violates them; BLOCKED means missing access, data or another prerequisite prevents completion. Never copy expected text into Actual observed result or treat BLOCKED as PASS.

Use evidence labels A-UAT-01 through A-UAT-08, with before/after suffixes as needed. Include action, expected/actual result, time and tested revision. Capture readable normal-journey and negative-access observations, including rejection and unchanged state/no disclosure. Redact secrets and unrelated records.

## A.8 Defect reporting instructions

Report actual failures at https://github.com/thu734/Inventory-and-Borrowing-System/issues and notify Team MT through the agreed handoff channel. If Issue access is unavailable, send the same report privately to the product contact.

Use [defect-register.md](defect-register.md) as an optional structured reporting/triage template. GitHub Issues remain the authoritative finding and disposition record.

Include: reporter/team; tested SHA/revision; case and requirement/AC; fixture IDs/preconditions; numbered reproduction steps; expected and actual results; user impact; suggested critical/major/minor severity with reasons; sanitized evidence and report date.

A defect contradicts the agreed Sprint 1 behavior; an enhancement requests additional scope. Clarify setup misunderstandings before classifying findings. Team MT records every received finding's classification, reason, owner and disposition. Critical/major accepted defects require correction and independent retest; minor defects require correction or explicit partner acceptance as a limitation. Only the independent UAT Team records the final acceptance decision. If partner access cannot be arranged, notify the instructor/TA rather than substituting own-team testing.
