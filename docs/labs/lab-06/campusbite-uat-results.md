# CampusBite - Lab 6 Part B: Independent UAT Results

## A. Test information

| Item | Recorded information |
|---|---|
| Product / Product Team | CampusBite (Theme 4) / Duo L |
| Independent UAT Team | Team MT: Moe Htet Aung; Thu Thu Wai |
| Application | https://campusbite-kpxq63g5va-as.a.run.app |
| R1 - reported tested release | Commit `1400faa683cff2350169a86f30a25fd46a74a117`; Cloud Run revision `campusbite-00007-jwv`. Deployment association not independently confirmed in this record. |
| Execution dates | Original cases: 21 November 2026; additional cases: 22 November 2026 (tester-confirmed dates). Exact execution times were not recorded. ICT = UTC+07:00. |
| Accounts / roles | Customer A and Customer B: CUSTOMER; Operator: OPERATOR; anonymous context for access checks |
| O1 - saved order | `56401c7b-3652-44e6-836c-4d5c4b5940f7`, owned by Customer A; two Iced Lattes and one Chicken Sandwich; total ฿215 |
| Evidence source | `lab6_partb.pdf`; evidence IDs below identify the recorded screenshots |

## B. Original UAT execution results

R1 applies to every row as the reported release. Evidence ranges include all numbered IDs between their endpoints.

| Case ID | Requirement / AC | Tester / Team | Date / Time (ICT) | Tested Version | Inputs | Actual Result | Outcome | Evidence IDs |
|---|---|---|---|---|---|---|---|---|
| UAT-CB-01 | FR-01; AC-01/02/03/05 | Moe Htet Aung / Team MT | 21 Nov 2026 | R1 | Customer A, Operator; incorrect password | Both accounts logged in with correct identities/roles. Logout denied protected identity access; incorrect password was rejected. | PASS | CB-01-E01-E04 |
| UAT-CB-02 | FR-02; AC-06/07 | Moe Htet Aung / Team MT | 21 Nov 2026 | R1 | Latte, Sandwich, Croissant; inactive Matcha | Prices were ฿65/฿85/฿45; stock was 9/2/0 respectively. Croissant was sold out and unselectable; inactive Matcha was absent. Menu API matched the product data. | PASS | CB-02-E01-E03 |
| UAT-CB-03 | FR-03; BR-03/04/05/06; AC-09/10 | Moe Htet Aung / Team MT | 21 Nov 2026 | R1 | Customer A; Latte ×2, Sandwich ×1 | O1 was saved with correct lines, ฿215 total, PENDING and UNPAID. Latte stock changed 9 to 7; Sandwich 2 to 1; Croissant stayed 0. | PASS | CB-03-E01-E03 |
| UAT-CB-04 | FR-03; BR-02/03/04/06; AC-10/11 | Moe Htet Aung / Team MT | 21 Nov 2026 | R1 | Quantity 0; `totalSatang: 1`; Latte ×1 plus sold-out Croissant ×1 | Zero quantity: HTTP 400 INVALID_ORDER (confirmed). Forged total: HTTP 400 (confirmed); exact error code not visible in the screenshot. Mixed order: HTTP 409 OUT_OF_STOCK (confirmed). Order count stayed 4; stock stayed 7/1/0. | PASS (forged-total HTTP rejection only) | CB-04-E01-E07 |
| UAT-CB-05 | FR-04; AC-13 (reload/re-login) | Thu Thu Wai / Team MT | 21 Nov 2026 | R1 | Customer A; O1 | Same order, items, ฿215 total, PENDING and UNPAID remained accessible after reload and a new login session. | PASS | CB-05-E01-E03 |
| UAT-CB-06 | FR-04; BR-07; AC-03/14 | Thu Thu Wai / Team MT | 21 Nov 2026 | R1 | Customer A, Customer B, anonymous; O1 | B received 404 ORDER_NOT_FOUND; anonymous access received 401 UNAUTHORIZED. No private order information was disclosed; A's order remained unchanged. | PASS | CB-06-E01-E03 |
| UAT-CB-07 | BR-08; AC-04/18 | Thu Thu Wai / Team MT | 21 Nov 2026 | R1 | Customer A; O1 initially PENDING | Operator page denied access; operator list and acceptance APIs returned 403. O1 remained PENDING with unchanged items, total and payment state. | PASS | CB-07-E01-E04 |
| UAT-CB-08 | FR-05; BR-08; AC-15/16/17/19 | Thu Thu Wai / Team MT | 21 Nov 2026 | R1 | Operator, Customer A; O1 initially PENDING | Operator accepted O1 once; ACCEPTED persisted after refresh. Repeat acceptance returned 409. A saw ACCEPTED with unchanged items, ฿215 total and UNPAID. | PASS | CB-08-E01-E04 |

## C. Additional independent UAT results

These four cases supplement the supplied cases with ownership isolation, UI quantity boundaries, menu error recovery and duplicate-item validation.

| Case ID | Requirement / AC | Tester / Team | Date / Time (ICT) | Tested Version | Inputs | Actual Result | Outcome | Evidence IDs |
|---|---|---|---|---|---|---|---|---|
| MT-IUAT-01 - Customer Order History Ownership Isolation | FR-04; BR-07; AC-13 (history ownership) | Thu Thu Wai / Team MT | 22 Nov 2026 | R1 (reported) | Customer B; A's O1 | B's history displayed no orders; API returned `{"data":[]}`. A's order was absent and no private order information was disclosed. | PASS | MT-IUAT-01-E01-E02 |
| MT-IUAT-02 - Order Quantity Boundary Validation | FR-02/03; BR-02/03; AC-07 (UI only) | Thu Thu Wai / Team MT | 22 Nov 2026 | R1 (reported) | Customer B; quantities 0 and 7; sold-out Croissant | Quantity remained 0 with decrease disabled; Latte increase disabled at available stock 7; Croissant was unselectable. No order was submitted. | PASS (UI boundaries) | MT-IUAT-02-E01-E02 |
| MT-IUAT-03 - Menu Error Handling and Recovery | FR-02; AC-08 (error/recovery) | Thu Thu Wai / Team MT | 22 Nov 2026 | R1 (reported) | Customer B; browser-local menu API blocking, then unblock/retry | Menu displayed "We couldn't load the menu" and Try again. Unblocking and retrying restored products, prices and availability. | PASS | MT-IUAT-03-E01-E02 |
| MT-IUAT-04 - Duplicate Menu Item Rejection | FR-03; BR-01/06; AC-11 | Thu Thu Wai / Team MT | 22 Nov 2026 | R1 (reported) | Customer B; duplicate Iced Latte IDs | Request returned 400 INVALID_ORDER; B's history remained empty. Stock remained unchanged based on manual verification. | PASS | MT-IUAT-04-E01 |

**Evidence:** Original-case screenshots are in `lab6_partb.pdf`, referenced by the case evidence IDs. Embed the selected readable evidence in the final Lab 6 report PDF.

## D. Separate controlled-exercise retest

The original 12 cases above remain **12 PASS, 0 FAIL, 0 BLOCKED**, with no genuine defect reported during that phase. Team MT's original Sprint 1 ACCEPTED decision was communicated on 23 November 2026, as recorded in the [partner's original UAT register](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/blob/ad1b922b49464187cc235e68f5baade37a354b3c/docs/labs/lab-06/defect-register.md). The following result belongs only to the later lecturer-authorized exercise.

| Item | Independent record |
|---|---|
| Finding / requirement | [CampusBite Issue #45](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/issues/45); FR-03, BR-01/06, AC-11 / TEST-11 |
| Original failure | On defective commit `9ee35c08c989e962ec00a9dae9a8a8b99db91e76`, revision `campusbite-staging-00002-pwq`, authenticated `POST /api/v1/orders` with `{"items":[]}` returned 201 and created a PENDING order with no items and total 0; expected 400 INVALID_ORDER. |
| Corrected version / URL | `488731a85d3348935c272896c1352d5afa331d32`; `campusbite-staging-00003-rss`; https://campusbite-staging-141479751875.asia-southeast1.run.app |
| Retester / date | Moe Htet Aung / Team MT; 23 November 2026 ICT. Exact execution time was not recorded. |
| Actions and observations | Counted Customer A's saved orders (3); submitted the empty-item request once; observed HTTP 400 with INVALID_ORDER; refreshed history and counted the same 3 orders. No new order was created. |
| Outcome / decision | PASS; Team MT recorded ACCEPTED for the corrected staging version. This does not claim Team MT retested production. |
| Evidence | [Independent retest record and three screenshots](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/issues/45#issuecomment-7104784685); D-CB-02-E01–E03 in [defect-register.md](defect-register.md). |

Duo L's [correction PR #46](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/pull/46) reports RED/GREEN and 51/51 tests passing; these are partner developer results, not tests executed by Team MT. Its subsequent reviewed [release PR #47](https://github.com/LaeLaeKaungNyunt/cpe334-campusbite/pull/47) does not expand MT's staging acceptance to production. Correction, review, CI and release references are consolidated in [defect-register.md](defect-register.md).
