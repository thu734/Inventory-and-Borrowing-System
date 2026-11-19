# BorrowBase — Lab 6 Defect Register

Use with the [UAT Handoff](uat-handoff.md). [GitHub Issues](https://github.com/thu734/Inventory-and-Borrowing-System/issues) are the authoritative detailed finding records. Include complete Part D correction, RED/GREEN, CI, release and acceptance evidence in the final Lab 6 PDF. All fields below are blank templates, not completed observations or decisions.

## 1. Finding Summary

Record every received finding. Record “None” only if actual testing found none, identifying the tested release and scope.

| Finding ID / Issue | UAT case / FR / AC | Severity | Classification | Owner | Status / disposition |
|---|---|---|---|---|---|
| | | | | | |

## 2. Defect Report

Completed by the independent tester; copy per finding or use these fields in its GitHub Issue.

| Field | Observation |
|---|---|
| Finding ID / title / Issue link | |
| Product Team / reporter / UAT Team | |
| Report date/time and timezone | |
| Tested source SHA / deployed revision | |
| UAT case / FR / AC | |
| Preconditions / synthetic account and fixture IDs | |
| Numbered reproduction steps and inputs | |
| Expected result | |
| Actual result | |
| Proposed severity / user impact | |
| Evidence IDs / links | |
| Partner notification / outcome | |

Include only observed behavior and sanitized evidence; exclude credentials, hashes, cookies, tokens and unrelated private data.

## 3. Product Team Triage

Completed by the Product Team, separately from the tester’s observations.

| Field | Decision |
|---|---|
| Finding ID / Issue link | |
| Classification: accepted defect, duplicate, not-defect or enhancement | |
| Reason tied to the Sprint 1 contract and evidence | |
| Original Issue link, if duplicate | |
| Confirmed severity / impact rationale | |
| Assigned owner | |
| Fix status / disposition / reason | |

Critical/major accepted defects require correction and independent retest before acceptance. Minor defects must be fixed or explicitly accepted by the UAT Team as documented limitations. Do not relabel a failing requirement as an enhancement.

## 4. Independent Retest (if applicable)

Completed by the independent UAT Team after a correction. A finding’s retest result is not the final release acceptance decision.

| Field | Independent observation |
|---|---|
| Finding ID / Issue link | |
| Retester / team / date/time and timezone | |
| Corrected source SHA / deployed revision | |
| Original reproduction steps / affected UAT cases re-executed | |
| Actual retest result / PASS, FAIL or BLOCKED | |
| Evidence IDs / links | |
| Closure or remaining action / reason | |

Keep detailed correction links and retest history in the Issue. Record the independent final acceptance decision and its tested release in the final Lab 6 PDF; do not infer acceptance from a fix or successful CI.
