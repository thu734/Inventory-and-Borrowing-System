# BorrowBase - Lab 6 Parts C-D: Defects, Correction and Retest

Original independent UAT and the subsequent lecturer-authorized controlled exercises are separate phases. The [BorrowBase handoff/results](uat-handoff.md) and [MT's CampusBite results](campusbite-uat-results.md) preserve each product's original 12 PASS, 0 FAIL, 0 BLOCKED closure and acceptance. No genuine findings were reported during that original phase; intentional defects below do not change those results.

## 1. Controlled findings and triage

| Finding / requirement | Independent report and reproduction | Expected / actual behavior | Classification, owner and disposition |
|---|---|---|---|
| [BorrowBase #66](https://github.com/thu734/Inventory-and-Borrowing-System/issues/66); F-01, FR-01, required-field UI contract / AC-F01-09 | Duo L members 3481/3484; 23 November 2026 ICT. Signed out on Lab 6 staging: 1. Leave Email empty. 2. Enter a nonempty dummy Password. 3. Select Sign in and inspect Fetch/XHR. 4. Compare with a populated Email and empty Password. | Expected: browser blocks either missing required field, with no login POST. Actual: empty Email sent POST /api/v1/auth/login, returned 400 and "Enter a valid email and password." Empty Password was blocked locally. | Accepted **Minor**: inconsistent frontend validation; backend authentication protection remained effective. Team MT owns the finding; Moe Htet Aung authored the correction. Issue CLOSED after corrected staging retest and Duo L acceptance. |
| [CampusBite #45](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/issues/45); F-03, FR-03, BR-01/06, AC-11 / TEST-11 | Team MT; 23 November 2026 ICT. Signed in as Customer A on isolated staging: submit POST /api/v1/orders with `{"items":[]}` and inspect response/history. Individual reporter and exact time not recorded. | Expected: 400 INVALID_ORDER, no order. Actual: 201 created PENDING order `50e75c5c-aa5a-48bf-a6a4-a061c14ff2d8` with empty items and total 0. | Accepted **Major** by Duo L: invalid orders were persisted, violating a required business rule. Duo L owns the correction; issue CLOSED after MT's staging retest/acceptance and the product team's later release verification. |

Issue comments preserve notification, product-team acknowledgment and disposition. These are defects against existing requirements, not enhancements. BorrowBase's independent report was transcribed into GitHub by Team MT; no exact test time or original screenshot attachment is inferred from the issue creation time.

## 2. Version and correction traceability

| Product / stage | Commit / deployed revision | Evidence |
|---|---|---|
| BorrowBase original accepted baseline | `6a0e29154c2b2165c486b0bc8d18e3fd2475b2fc` / `borrowbase-00007-jck` | Owner-reported original identifiers; Duo L did not establish their image/session association. |
| BorrowBase healthy integration | `53a0505168eb67fa88eef911abf74bd305555026` | [PR #64](https://github.com/thu734/Inventory-and-Borrowing-System/pull/64): integrated Sprint 1/Lab 5/Lab 6 baseline and Sprint-targeted CI. |
| BorrowBase controlled introduction | Feature `eab39f59ae6246d6ba470d4e350cf025b4aabc85`; Sprint merge `fd08f9293fd13e35d375836fad7c5eae3ec4d50e` / `borrowbase-lab6-uat-00002-bq2` | [PR #65](https://github.com/thu734/Inventory-and-Borrowing-System/pull/65) removed only Email's HTML required attribute. |
| BorrowBase correction / corrected staging | Fix/test `49822cce568903ea03eb2e1a548be6ab09db2c28`; Sprint merge `4e42d1a2428668e6638019f9deaa9a25c8b9f83a` / `borrowbase-lab6-uat-00003-g8g` | [PR #67](https://github.com/thu734/Inventory-and-Borrowing-System/pull/67) restored required Email and added its regression test. The fix's parent is the defective Sprint merge; the feature and integration SHAs legitimately differ. |
| CampusBite controlled introduction | `9ee35c08c989e962ec00a9dae9a8a8b99db91e76` / `campusbite-staging-00002-pwq` | [PR #44](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/pull/44), reported in Issue #45 |
| CampusBite corrected staging | `488731a85d3348935c272896c1352d5afa331d32` / `campusbite-staging-00003-rss` | [PR #46](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/pull/46) restored the empty-items guard in `backend/src/routes/orderRoutes.ts`; existing tests were unchanged. |
| CampusBite subsequent production release | Main merge `ad1b922b49464187cc235e68f5baade37a354b3c`; product-team-reported revision `campusbite-00008-7bk` | [PR #47](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/pull/47) was approved and merged with passing CI. The [release record](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/issues/45#issuecomment-7105216935) reports successful deployment and health/readiness; MT's independent retest covered staging only. |

### BorrowBase RED/GREEN, review and regression

The committed test is **requires an email before submitting the login form**, under `TEST-F01-09: auth UI states`, in [auth.ui.test.tsx](https://github.com/thu734/Inventory-and-Borrowing-System/blob/49822cce568903ea03eb2e1a548be6ab09db2c28/frontend/src/features/auth/auth.ui.test.tsx#L42). After anonymous bootstrap it asserts both Email and Password `toBeRequired()`. It detects the missing attribute; independent browser/network evidence below verifies submission behavior.

| Verification | Supported record |
|---|---|
| RED | PR #67 reports 6 PASS / 1 expected FAIL against the defective implementation with the new assertion. Original local command, test-only working-tree identity and failing console output were not supplied; no separate RED commit is verified. |
| Targeted GREEN | PR #67 reports 7/7 authentication UI tests PASS. Original local command/output not attached. |
| Full frontend regression | CI command `npm run test:ui`: 4 files / 38 tests PASS. |
| Backend regression | CI command `npm test -- --exclude '**/*.postgres.test.ts'` in `backend`: 12 files / 74 tests PASS. |
| Typecheck/build and CI | Actual CI ran `npm run typecheck`, `npm run build -w backend` and `npm run build -w frontend`. [Run 45194753260](https://github.com/thu734/Inventory-and-Borrowing-System/actions/runs/45194753260): typecheck/build, unit/API/UI, PostgreSQL integration, Docker build and evidence summary all SUCCESS. |
| Review | Thu Thu Wai [approved PR #67](https://github.com/thu734/Inventory-and-Borrowing-System/pull/67#pullrequestreview-6023477821) on 23 November 2026, 21:34 ICT. The approval body is empty and no inline comments were retrieved; detailed technical review evidence is not recorded. |

Only `LoginPage.tsx` and `auth.ui.test.tsx` changed in PR #67. Existing backend validation, authorization and borrowing integrity code were unchanged.

Duo L's CampusBite PR #46 reports RED (expected 400, observed 201), GREEN and 51/51 tests PASS. Its [substantive review](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/pull/46) and [passing CI](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/actions/runs/45186948679) are recorded on GitHub. These are partner developer results, not automated tests independently run by Team MT.

### BorrowBase corrected staging deployment

| Item | Recorded value / provenance |
|---|---|
| Project / region / service | `cpe334-borrowbase` / `asia-southeast1` / `borrowbase-lab6-uat` |
| URL | https://borrowbase-lab6-uat-785698287490.asia-southeast1.run.app |
| Source / revision | Corrected Sprint merge `4e42d1a` / `borrowbase-lab6-uat-00003-g8g` |
| Cloud Build | Team MT supplies build `4f60b9d1-e34d-433c-a0d8-e7276d56cf2c`, status SUCCESS. |
| Image / traffic | Team MT supplies digest `sha256:1ec69d15e2eee4da0a31fd70b240411862e1f15f1586196321a8ae112716bcc6` and 100% traffic to the corrected revision; original cloud output is not linked in this record. |
| Developer smoke | Recorded GET /api/ready at 21:59:14 ICT on 23 November 2026: 200, `{"status":"ready"}`. Developer browser validation was not verified in that smoke check; independent browser results are recorded below. |

This deployment and Duo L's acceptance concern the dedicated Lab 6 service, not a new production release. The accepted Lab 5 production baseline remains separate. PR #67 is integrated into `sprint1-staging`; integration into the intended Lab 6 branch, `lab6-staging`, is pending review. Whether this isolated exercise satisfies the handout's release-to-main wording requires lecturer/TA confirmation.

## 3. Independent retest and acceptance

Retests occurred on **23 November 2026 ICT**; exact execution times were not recorded. CI and developer smoke checks do not constitute independent acceptance.

| Product / independent tester | Tested corrected version | Actual observed / decision | Evidence |
|---|---|---|---|
| BorrowBase / Duo L member 3484, Naing Zay Linn | `4e42d1a` / `borrowbase-lab6-uat-00003-g8g` | Empty Email: "Please fill out this field", no authentication request. Empty Password: browser blocked submission, no authentication request. Valid Borrower login: HTTP 200 and correct workspace. All three PASS; **ACCEPTED for corrected staging**. | [Independent results/decision transcribed by MT](https://github.com/thu734/Inventory-and-Borrowing-System/issues/66#issuecomment-7105431545); D-BB-06-E01–E03 |
| CampusBite / Team MT — Moe Htet Aung | `488731a` / `campusbite-staging-00003-rss` | Empty-item request: HTTP 400 INVALID_ORDER; Customer A history contained 3 orders before and the same 3 afterward. No new order. PASS; **ACCEPTED for corrected staging**, not an independent production retest. | [MT retest record](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/issues/45#issuecomment-7104784685); D-CB-02-E01–E03 |

## 4. Evidence references

These IDs identify existing artifacts, not new test runs. Original case evidence IDs remain in the two UAT result records.

| ID | Existing artifact / supported result |
|---|---|
| D-BB-01 | [PR #65](https://github.com/thu734/Inventory-and-Borrowing-System/pull/65): intentional introduction, ending at `fd08f92` |
| D-BB-02 | [Issue #66](https://github.com/thu734/Inventory-and-Borrowing-System/issues/66): independent report on `00002-bq2`, Minor triage and closure; two described original defect screenshots were not attached to the retrieved report |
| D-BB-03 | [PR #67](https://github.com/thu734/Inventory-and-Borrowing-System/pull/67): test/fix diff, reported RED/GREEN and approval; source `49822cc` to merge `4e42d1a` |
| D-BB-04 | [CI run 45194753260](https://github.com/thu734/Inventory-and-Borrowing-System/actions/runs/45194753260): five successful checks, frontend 38 PASS and non-PostgreSQL backend 74 PASS |
| D-BB-05 | Team MT's build/deployment and developer smoke record summarized above: reported corrected revision/digest/traffic and observed readiness 200 |
| D-BB-06-E01–E03 | Duo L corrected-staging screenshots: [E01 missing Email](https://github.com/user-attachments/assets/6b9679b8-a792-4fef-ac47-6a4372481a61), [E02 missing Password](https://github.com/user-attachments/assets/17ee9f81-8841-4f6e-8fcf-fc53ddb87243), [E03 valid login](https://github.com/user-attachments/assets/b037f48f-2457-4479-bbec-240f6f28145d) |
| D-CB-01 | [Issue #45](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/issues/45): invalid empty order on `9ee35c0` / `00002-pwq`, triage, correction and closure |
| D-CB-02-E01–E03 | MT corrected-staging screenshots: [E01 three orders before](https://github.com/user-attachments/assets/d858af67-9fd5-443c-a732-c7ec375af972), [E02 400 INVALID_ORDER](https://github.com/user-attachments/assets/364bf5c9-5ad9-437a-8887-761df271acdd), [E03 same three orders after](https://github.com/user-attachments/assets/62cd4e9c-6f5a-4c6c-a6ff-463656ffd48d) |
| D-CB-03 | [Release PR #47](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/pull/47) and [product-team release verification](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/issues/45#issuecomment-7105216935): reviewed main merge `ad1b922`, reported production deployment; MT acceptance remains staging-scoped |
