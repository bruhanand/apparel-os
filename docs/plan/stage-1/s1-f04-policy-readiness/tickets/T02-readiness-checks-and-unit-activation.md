# S1-F04-T02 — Readiness checks and unit activation

Status: done
Blocked by: S1-F04-T01, S1-F02-T02, S1-F03-T02
Feature: [S1-F04 Policy readiness and Site activation](../../spec.md)

## Build

The stage 1 part of `site-lifecycle` ([module-map.md](../../../../design/architecture/module-map.md) 4.16; [domain-model.md](../../../../design/architecture/domain-model.md) 3.6, section 5, section 6 "Granting an activity", invariant 7; `PRD-LIF-001` to `PRD-LIF-003`).

- **Run readiness checks** for a Site and for a business unit (`PRD-LIF-002`): ask each module's check and keep a readiness record of what was verified, when and by whom. The checks are as the product owner answered RR-016 on 6 Oct 2026 (DEC-116), with no replenishment threshold and no new business prerequisite:
  - **Mappings and locations**, from `organisation`: mappings in force and verified, and locations existing ([structure-and-masters.md](../../../../design/masters/structure-and-masters.md) 3.7, 3.8; `POL-10.08`).
  - **Users and access**, from `access`: every permission the activity needs is held by someone with an active assignment covering the unit, and every independently approved action of the activity has two different people able to prepare and approve it (`PRD-ACS-006`).
  - **Required policies**, from `configuration`: the Available check of S1-F04-T01 passes for each policy the activity's operations need.
  - **Stock plan** (`PRD-LIF-003`): an approved opening plan for the unit, which need not have been posted yet, or an explicit zero declaration, which states that the unit genuinely holds no stock. A non-stock office needs none.
  - **Devices**: as GC-8 section 11, added by S1-F12-T02.
  - **Brand coverage**, from `merchandise`: a brand-counter unit has one brand in force; while it is set up it may cover none, and activating it is refused while it has none ([structure-and-masters.md](../../../../design/masters/structure-and-masters.md) 3.3 as built; `PRD-ORG-006`; product owner, 10 Oct 2026). `merchandise` already refuses more than one.
- **Approve an activity**: receiving, movement or selling for a business unit, combining the shared Site readiness with the unit's own approval (`PRD-LIF-001`). Refused while a check fails, naming it. Approved through `access` by a different person from the one who ran the checks (MM-8, `DEC-105`). The decision, the readiness record, the activity grant written into `configuration`, and the audit record commit together; emits `configuration.activity-changed`.
- After a grant, Check availability answers available for that activity at that unit only. The Site and unit show Active ([design-language.md](../../../../design/ui/design-language.md) section 7; structure-and-masters 3.7).
- **Screens**: Site opening and closure › Readiness (ui-blueprint): each check with its state and what is missing, and the request to activate; the approval from My work. Unavailable actions name what is missing (`PRD-UXP-003`).

The stock-plan check reads an approved, unpublished opening-data batch for the unit, checking its approval and scope on their own, independently of activation, or an explicit zero declaration meaning the unit genuinely holds no stock (domain-model 3.6; `DEC-117`). This ticket proves the zero-declaration and not-ready paths; the approved-batch path is proved in S1-F13-T01.

## Expected outputs

`site-lifecycle` module with its `index.ts` and migration; the check answers in `organisation`, `access` and `configuration`; schemas and routes; the Readiness screen; tests

## Done when

- Stage 1 exit check 6 ([README](../../README.md) 7.1): an activity stays unavailable for a Site or unit until its checks pass and a different person approves it, and the refusal names the failing check
- Activation approved by the person who ran the checks is refused; an activity granted at one unit leaves the other units at the Site unavailable
- A unit whose mapping is not verified fails the mappings check; a unit with no location fails the locations check
- The users-and-access check fails, naming what is missing, when a permission the activity needs is held by nobody with an active assignment covering the unit, or when an independently approved action has fewer than two people able to prepare and approve it
- The required-policies check fails, naming the policy, while the Available check fails for a policy the activity needs
- The stock-plan check passes with an approved opening plan that is not yet posted, or with an explicit zero declaration, and fails with neither
- Readiness records and grants of one synthetic Organisation are invisible to the other
- Browser journey: an Operations user runs the checks for a synthetic unit, sees a failing check and its reason, fixes it and runs them again; a different authorised person approves receiving from My work; the unit's receiving action becomes available

## Notes

- RR-016 is answered (product owner, 6 Oct 2026, DEC-116): the checks are as Build says. Where the opening plan and the zero declaration are held, and how each is approved and recorded, is written into module-map 4.16 with the code; who approves them is KDPS's, and tests use labelled synthetic approvers. A business choice found there goes to the product owner.
- How Active is held for a Site or unit (a projection of its grants, or a status version under structure-and-masters 3.1) is not designed; write it into 3.7 with the code.
- Who approves readiness and each activity is OPEN (MM-8; KDPS Owner question 49; RR-057; live S1); tests use labelled synthetic approvers. RR-177 confirms the MM-8 pick.
- Withdrawing an activity at closure (`PRD-LIF-017`) is stage 5.
- Built (10 Oct 2026, branch `s1/f04-t02`): the `site-lifecycle` module (`SiteLifecycle`, `SITE_LIFECYCLE`, tier 5) with migration 0050 (`activation`, `readiness_record`, `zero_stock_declaration`, three `tables.json` entries) and record types `site_lifecycle.readiness_record` and `site_lifecycle.zero_stock_declaration`. Run readiness checks for a business unit and an activity, keeping the readiness record; declare zero opening stock; ask for an activity's approval; the approval rule `site_lifecycle.activity.grant` and its decision effect (`siteLifecycleApprovals`), which reruns the checks under the activation's lock and writes the grant. Check answers: `organisation`'s `unitReadiness`, `access`'s `permissionHolders`, `merchandise` · catalogue's `unitBrandsOn`, `configuration`'s `policyMissing`, `grantActivity` and `grantedActivities`, and `needs` on a declared operation; event `configuration.activity-changed`. Routes `readUnitReadiness`, `runReadinessChecks`, `requestActivation`, `declareZeroStock`. Screen: Setup › Site opening and closure (each activity's checks with their state and what is missing, the zero declaration, the request for approval; the unit and Site state); the approval from My work. Tests: `apps/server/test/site-readiness.int.test.ts` (every Done-when line but the browser journey), `site-lifecycle/domain/checks.test.ts` (the approved-plan pass among them), the journey `apps/web/e2e/site-readiness.spec.ts`.
- Design details settled, written into module-map 4.4 and 4.16 "As built", domain-model 3.6 and structure-and-masters 3.3 and 3.7: a run is per unit and activity, and the shared Site readiness is the part kept on each unit's record; the people an activity needs are declared on its operations; where the zero declaration is held and how it is approved (RR-483); an activity no operation declares is not ready (RR-482); a later run replaces an earlier one, whose request then refuses as stale; the checks run again under the decision's lock; Active is a projection of the grants (RR-484).
- Beyond the ticket: refusing to ask for or approve an activity a unit already holds (`site-lifecycle.activity-already-granted`); the `OpeningPlans` read left as an optional dependency for S1-F13-T01 (RR-485).
- Open: RR-482, RR-483 (product owner), RR-484, RR-485 (builders); who holds readiness and activity approval stays OPEN (MM-8; KDPS Owner question 49; RR-057).
- Review fixes (10 Oct 2026, branch `s1/f04-review-fixes`): shared Site readiness is its own run, per Site and activity, approved by a second person (`site_lifecycle.site_readiness.approve`); each unit's run needs its Site ready (the site-readiness check), rechecked under the unit decision's lock; the zero declaration is refused while the stock ledger holds stock at the unit, rechecked at every run, named on the run and shown on the approval panel (`readReadinessRecord`); the effect refuses the person who ran the checks again; the activation's time is the command's clock. The journey makes the Site ready first, then the unit. It still ends at "Active here", since no receiving operation exists yet (RR-481). RR-482 and RR-483 answered by the product owner and closed.
- Closed 10 Oct 2026 on `s1/f04-policy-readiness`, reviewed with `/code-review` with the feature's other ticket; review fixes `f25ea9d`; no blocking finding left.
- Beyond the ticket (logged at the product owner's request): the `site-lifecycle.activity-already-granted` refusal; an optional `OpeningPlans` dependency for S1-F13-T01; Site opening and closure in Operations' menu; review fixes: Site readiness per Site and activity (product owner, 10 Oct 2026), the `runSiteReadinessChecks` and `readReadinessRecord` routes, `organisation` queries `siteExists` and `unitLocationIds`, an `approval_decision_id` on activity grants.
