# Decision pack — 3 Oct 2026

> **Not ranked.** This pack decides nothing. It lists questions for the product owner. Any PRD or policy change is logged in [decisions.md](../decisions.md) first (`DEC-036` onward), then the document is edited. See [README.md](../README.md).

**How to answer.** For each item write A, B or "other". Items marked *tidy* can be approved together with one word. Placeholders `DEC-NEW-n` are renumbered when logged. Findings come from [alignment-sweep.md](alignment-sweep.md); the codes C-xx and N-xx are defined there.

**Rule for every option.** No option invents a value, rate, date or approver. Where a number is needed it stays OPEN with its named owner.

## A. Approvals and access

Nine items sit here. Each one is about who may approve, who owns a problem, or who may log in. Nothing below is decided. The PRD and policy text are yours. I only propose. Where an option needs a number or a name, it stays OPEN with the owner named.

### N-03 Does a smaller transfer need approving again?

**Clash.** `PRD-TRF-010` says changing items, *increasing* quantity or changing destination needs renewed approval. `POL-02.12` says material changes include any change to quantity. So a cut to an approved transfer is "no new approval" in one place and "new approval" in the other. `PRD-ACS-007` only says "material changes" and does not settle it.

**Option A.** The PRD wins as written. Narrow `POL-02.12` for transfers only: an increase is material, a reduction is not (`PRD-TRF-010`). Other actions keep "any quantity change". The owner confirms how a reduction is recorded against `PRD-ACS-007`, which binds approval to the quantity. A smaller dispatch already leaves the rest reserved.

**Option B.** Change the PRD instead. A reduction before dispatch also needs renewed approval. Edit `PRD-TRF-010`. `POL-02.12` then stays as it is.

**My pick.** A. It fixes the lower document to match the higher one and touches no PRD rule.

**If approved.**
- Log `DEC-NEW-1`: "Transfers: only an increase in quantity is a material change."
- Changes: `POL-02.12` (A) or `PRD-TRF-010` (B). Keep all IDs.
- Check `POL-05.03`, which has the same wording, so the two stay in step.
- Lower docs: any transfer design text that repeats the trigger. I found none in `docs/design` that names it.

**Owner / blocks.** Product owner decides. Blocks stage 1 (approval rules). Transfers go live in stage 3.

### N-04 Who owns a problem ("exception")?

**Clash.** `POL-02.16` routes stock to Operations, money to Accounts and supplier matters to Booking. `POL-03.05` adds Warehouse. `POL-16.05` adds Store Manager (with Accounts for money). `PRD-REC-010` names only Accounts and Booking for the nightly invoice, GRN and PT differences. The PRD's policy 2 row says policy 2 owns exception owner, due time and escalation.

**Option A.** Keep `POL-02.16` as the one routing home (set by `DEC-017`). Reword `POL-03.05` and `POL-16.05` to "owner as routed under `POL-02.16`". Leave `PRD-REC-010` alone. It is already a subset of `POL-03.05`. Warehouse and Store Manager get no owner role until the owner says so.

**Option B.** Add Warehouse and Store Manager to `POL-02.16` as valid routing targets. Say whether Warehouse is the same as Operations. Then reword `POL-03.05` and `POL-16.05` to point at it.

**My pick.** A. One home is simpler, and it invents no new owner role. The owner should also confirm that quantity differences in `PRD-REC-010` still go to Accounts and Booking, not Operations.

**If approved.**
- Log `DEC-NEW-2`.
- Changes: `POL-03.05`, `POL-16.05` (A). `POL-02.16` also changes under B. `PRD-REC-010` is unchanged. Keep IDs.
- Lower docs: `docs/questions-for-kdps.md` KDPS Owner item 3 (V-03) stays as the place for real owners and due times.
- Names and due times stay OPEN, KDPS Owner.

**Owner / blocks.** Product owner decides the routing. KDPS Owner supplies names and due times. Blocks stage 1 (exception routing) and stage 2 (source conflicts).

### N-47 Day-close cash gap approvers have no decision entry

**Clash.** `DEC-008` created `POL-02.13` as "tolerance and approvers: unconfigured". The text now says the Store Manager approves within a limit and Accounts above it. `DEC-026` says "No DEC added it". `DEC-020` lists `POL-02.13` as changed without saying how. `PRD-CSH-011` is role-neutral: "the approver set for that tolerance", then "a higher approver".

**Option A.** Reword `POL-02.13` to follow `PRD-CSH-011`: within tolerance goes to the approver set for it, above goes to a higher approver. Limits and named approvers stay unconfigured. Fix the `DEC-026` wording that calls Accounts "a KDPS value already in `POL-02.13`".

**Option B.** Keep `POL-02.13` as written. Log one new DEC that records the Store Manager and Accounts split and where it came from. `DEC-029` says `DEC-017` to `DEC-022` were agreed with a KDPS representative, and `DEC-020` lists `POL-02.13`. Do not say KDPS agreed unless you confirm it. Do not edit `DEC-020` back in time.

**My pick.** B, if you confirm the source. The split is already in the policy, `PRD-CSH-011` already expects a higher tier, and Owner question 25 already asks for the Accounts approver. If you cannot confirm the source, use A.

**If approved.**
- Log `DEC-NEW-3`.
- Changes: B changes no PRD or policy text. A changes `POL-02.13`.
- Lower docs: the `DEC-026` wording is corrected by pointing at the new entry.
- The cash limit and the named Accounts approver stay OPEN, KDPS Owner (`docs/questions-for-kdps.md` item 25, V-38).

**Owner / blocks.** Product owner decides. KDPS Owner supplies the values. Blocks stage 4 (store day, day close).

### N-55 What is the "bill value" of a return with no bill?

**Clash.** `PRD-ACS-015` says the limit basis for "discounts, refunds and no-bill returns" is bill value. A no-bill return has no bill. `POL-07.06` says use documented, evidenced valuation, not MRP. `PRD-RET-017` keeps no-bill returns off until valuation is set. `PRD-ACS-016` says unknown value is never zero.

**Option A.** Amend `PRD-ACS-015`: bill value for discounts and bill-backed refunds. For no-bill returns, the documented valuation under the no-bill policy. If no valuation is accepted, the value is unknown and `PRD-ACS-016` applies. This partly supersedes `DEC-009`.

**Option B.** Take no-bill returns out of the "bill value" wording. Limit them by quantity, which `PRD-ACS-015` already allows "where configured". Valuation is still needed for store credit under `POL-07.06`.

**My pick.** A. A valuation is needed anyway to price the store credit or exchange, so the limit can use it.

**If approved.**
- Log `DEC-NEW-4`, which partly supersedes `DEC-009`.
- Changes: `PRD-ACS-015`. Optional one-line cross-reference in `POL-07.06` and `POL-07.08`. Keep IDs.
- Lower docs: none found that name "bill value" for no-bill returns in `docs/design`.
- The valuation method and the limit amount stay OPEN, KDPS Owner (V-02).

**Owner / blocks.** Product owner decides. Blocks stage 4 (returns).

### N-57 Phone and WhatsApp approvals have no policy 2 home

**Clash.** `PRD-ACS-012` says approval links are bound to the exact record version, and a plain "yes" is not approval. But no `POL-02` bullet or PRD policy-2 row lists which action types may use them. `POL-02.14` is only the daily summary. Alignment report B-8 and Owner question 31 (V-60) both ask the question. B-8 gives "2" as the policy, but policy 2 has no bullet for it. (The finding said question 31 had no V number. It does: V-60.)

**Option A.** Add a new bullet `POL-02.22` in the style of `POL-02.19`. Links are used only for explicitly allowlisted action types. The action types are OPEN. Add "phone/WhatsApp approval action types" to the PRD policy-2 row. Point question 31 at `POL-02.22`.

**Option B.** Add no bullet. Keep question 31 and V-60 as the only home, and change B-8 to say there is no policy bullet yet.

**My pick.** A. Nothing is on by default (`PRD-SEC-017`), and a policy-dependent action needs a signed home before it goes live.

**If approved.**
- Log `DEC-NEW-5`.
- Changes: new `POL-02.22` (the next free number, never reused). PRD policy-2 row in "Required policy configuration". No existing ID changes.
- Lower docs: `docs/questions-for-kdps.md` item 31, `docs/reports/alignment-report.md` B-8.
- The allowed action types stay OPEN, KDPS Owner.

**Owner / blocks.** Product owner decides the home. KDPS Owner decides the types. Blocks stage 5 (phone and WhatsApp approvals are in stage 5 of `docs/phases.md`).

### N-09 Where does staff self-service access come from?

**Clash.** `docs/design/access/personas.md` section 4 says self-service "comes with an employee record". `PRD-ACS-002` and `PRD-ACS-003` say only role assignments grant access. `PRD-HRM-012` shows staff their "authorised" target and incentive information. `PRD-UXP-004` gives Store users staff self-service.

**Option A.** Self-service is a permission carried by a role assignment, limited to the person's own records. Fix the design text. Which template or assignment carries it stays OPEN.

**Option B.** Add an employee-record baseline to the PRD. Every employee gets own-record self-service without a role assignment.

**My pick.** A. The PRD already says it, so only the lower document changes.

**If approved.**
- A: log `DEC-NEW-6` only if you want it on record. No PRD or policy change.
- B: log `DEC-NEW-6`, and amend `PRD-ACS-002`/`PRD-ACS-003` or `PRD-HRM-012`, plus `POL-02.01` (the template map).
- Lower docs: `docs/design/access/personas.md` (section 4, "Every employee", and the C-EMP row), `docs/design/ui/ui-blueprint.html` ("Self-service for everyone ... No persona is needed" and the self-service entries). Leave `docs/design/ui/design-language.md` 6C, since it does not claim role-less access.
- Which template carries it is OPEN, product owner.

**Owner / blocks.** Product owner decides. Blocks stage 1 (access) and stage 6 (HRMS self-service).

### N-79 Partner users and service identities are drawn as settled

**Clash.** `docs/design/access/personas.md` section 4 and `docs/design/ui/design-language.md` 6C say partner staff hold Store personas (P-STM, P-CSH, P-SLS) on their own Stores and that service identities exist. `PRD-FRN-001` only limits partner access to authorised Stores. `PRD-ACS-002` lists 14 personas, none a partner. `PRD-SEC-007` and `PRD-INT-007` do not mention service identities. A business decision cannot be settled in design (`AGENTS.md`).

**Option A.** Confirm the design reading in the PRD. Partner staff are users who hold Store personas on their own Stores. Service identities are a named PRD concept. Neither adds a persona.

**Option B.** Keep both rows provisional and OPEN in the design. No PRD change now. Decide partner users before stage 5 and service identities before stage 1 closes.

**My pick.** A. The reading already fits `PRD-ACS-002` (personas set home screens, roles grant access), and stage 1 needs service identities for integrations and audit.

**If approved.**
- Log `DEC-NEW-7`.
- Changes: new bullets in the PRD Franchise section (partner users) and the PRD Security section (service identities), each taking the next free number. No existing ID changes.
- Lower docs: `docs/design/access/personas.md` (section 4; the X-SVC entry), `docs/design/ui/design-language.md` (6C Partner), `docs/design/ui/ui-blueprint.html` (X-SVC). Under B, add OPEN rows to personas.md section 6 and design-language.md section 12 instead.
- Partner statement and ledger visibility stays OPEN, KDPS (policies 2 and 12).

**Owner / blocks.** Product owner decides. Blocks stage 5 (franchise) and stage 1 (service identities).

### N-80 "Phone" and "phone scan" in personas.md

**Clash.** `docs/design/access/personas.md` shows "phone" and "phone scan" screens (for example P-WHS). `docs/phases.md` says the phone client is not placed in any stage. The PRD Hardware row lists only keyboard-input scanners, and the PRD says nothing about camera scanning. `docs/design/ui/design-language.md` 6D draws a camera viewfinder.

**Option A.** Camera scanning stays unapproved. Mark "phone scan" and the 6D camera viewfinder as proposed and OPEN. Staff scan with a handheld or Bluetooth scanner, which the PRD allows. No PRD change now.

**Option B.** Add camera scanning to the PRD (the Hardware row or the phone client rule) with a stage. The design then stays as drawn.

**My pick.** A. Camera scanning is a new hardware ask, and the owner has not yet chosen it.

**If approved.**
- A: no DEC needed beyond a note. B: log `DEC-NEW-8` and amend the PRD Hardware row (`PRD-PRO-009` is the phone client line).
- Lower docs: `docs/design/access/personas.md` (a note under the section 2 table), `docs/design/ui/design-language.md` (6D camera line).
- Whether and when camera scanning is built stays OPEN, product owner.

**Owner / blocks.** Product owner decides. Does not block a stage by itself. It blocks any stage that builds phone scanning, and the phone client has no stage yet.

### C-07 Who counts as "higher authority" for transfers?

**Clash.** `PRD-TRF-005` says "independent higher-authority approval". `POL-02.07` lists transfers among actions needing "an authorised person other than the preparer". `PRD-ACS-006` also says only "a different authorised person". Nothing defines "higher". The higher document wins, so the word has to mean something. `PRD-STK-012` and `PRD-CSH-011` use "higher approver" for approval above a tolerance.

**Option A.** "Higher" means the approver's authority covers the transfer on its cost basis (`PRD-ACS-015`), and the approver is a different person. It uses the approval limits per role and action (`POL-02.09`), so no new ranking is made. Add "Higher authority" to the PRD "Words used" table first.

**Option B.** "Higher" means a set rank above the preparer's role. The rank order is a KDPS choice. It stays OPEN, KDPS Owner.

**My pick.** A. It reuses the limit ladder that already exists and needs no ranking invented.

**If approved.**
- Log `DEC-NEW-9`.
- Changes: PRD "Words used" (new term row). `PRD-TRF-005` keeps its ID and wording. Add a transfer clause to `POL-02.07` pointing at it. Under B, the rank order goes in policy 2.
- Lower docs: `docs/design/ui/ui-blueprint.html` ("a higher authority" wording), `docs/design/access/personas.md` (P-OPS and P-WHS approval notes), `docs/reports/alignment-report.md` E-8.
- Actual limits and approvers stay OPEN, KDPS Owner (V-02).

**Owner / blocks.** Product owner decides the meaning. KDPS Owner supplies values. Blocks stage 1 (live approvals) and the stage 3 transfer flow.

### Not a clash after re-reading

- **N-80, meaning of "phone".** `docs/design/ui/design-language.md` 6D already says phone means responsive web, with the separate phone client parked. So that part needs only a one-line note in personas.md. Only camera scanning is a real open question, and it is kept above.
- **N-57, "B-8 says policy 2 has the text" and "no V number".** B-8 only names policy 2 as the home, and question 31 does carry V-60. The missing policy bullet is still a real gap, and it is kept above.

## B. Stages and gating

Plain rule used throughout: the PRD ranks first, then the policies, then design, then phases. I propose. You decide. Where an option needs a number, a name or a date, it stays OPEN with the named owner. I invent nothing.

DEC numbers below are placeholders (DEC-NEW-1 to DEC-NEW-15). Renumber from DEC-036.

### N-01 Do all stages record stock and money "from the start"?

**Clash.** PRD-STG-002 says each stage records its stock and money effects "from the start". phases.md line 11 and AGENTS.md (Delivery) say "from its first live/enabled operation". The phases headings say "from day one" on stage 1 ("None are live") and on stage 5 ("No new kinds"). Two checkers disagreed. One read the PRD stage table (stage 1 delivers "stock/money recording rules") and saw no real clash, only loose phases headings.
**Option A.** Reword PRD-STG-002 to "Each live operational stage records its stock and money effects from its first enabled operation; stage 5 extends those records into full accounting."
**Option B.** Leave the PRD as it is. Read it as: stage 1 fixes the rules, later stages record from their first live operation. Reword the phases headings and AGENTS.md to match the PRD.
**My pick.** Option B. The PRD already works when read with its stage table, and AGENTS.md says to fix the lower document.
**If approved.**
- DEC-NEW-1: "PRD-STG-002 is read as: stage 1 fixes the recording rules; each later stage records from its first live operation." No PRD or policy text changes under B. Under A, PRD-STG-002 changes (ID kept).
- Lower docs: phases.md (line 11 and the "from day one" headings on stages 1 to 6); AGENTS.md Delivery sentence.

**Owner / blocks.** Product owner. Blocks nothing in practice. Best settled before the stage 1 exit checks are written.

### N-10 "Needed by stage" for policies 2, 4 and 9 is earlier than the per-value stages

**Clash.** The PRD "Required policy configuration" table and the policy table in kdps-policies.md say policies 2, 4 and 9 are "needed by 1". The alignment report (V-06, V-10, V-11, V-21, V-38, V-39), the questions and the blueprint put some of their values at stages 2, 3 and 4 (for example petty cash at 4, count cost limits at 3, extra piece categories at 2). The PRD already splits stages per value for policies 7, 9 (P&L allocation), 10 and 17. It does not do so for these values.
**Option A.** Add one sentence to the PRD table note, and the matching note in kdps-policies.md: "Needed by stage" is the earliest stage at which any value of that policy is needed. Each value's own stage stays in the report's section 5.
**Option B.** Split the PRD and policy rows per value for policies 2, 4 and 9. Take each stage from the existing V-items only. Add no new value.
**My pick.** Option A. It is a small wording fix. The report already holds the per-value stages and Option B would copy them into the PRD, where they could drift.
**If approved.**
- DEC-NEW-2: "'Needed by stage' means the earliest stage at which any value of the policy is needed." AGENTS.md says any PRD or policy edit is logged first, even a wording one.
- PRD changes: the note under "Required policy configuration" (no ID; it is a table note). Policy change: the matching note above the kdps-policies.md table. Under B, the rows for policies 2, 4 and 9 change in both.
- Lower docs: optionally a pointer in the report's "Blocks" note and in questions-for-kdps.md "How to use this list". Their stage numbers stay as they are.

**Owner / blocks.** Product owner. Affects the stage 1 to 4 policy checklists.

### N-12 Statutory applicability row gives no stage for invoice-number format or movement documents

**Clash.** The PRD row and kdps-policies.md table row 10 read "2; e-invoice by 4, TDS by 5, payroll by 6". So everything else, including invoice-number format and movement documents, reads as stage 2. phases.md puts statutory movement documents in stage 3 (and e-way creation in stage 5). The report (V-40), CA question 4 and design-language section 12 put the bill-number format at stage 4.
**Option A.** Amend the PRD row and the policy row to name the stage for each part. The stages come from the existing documents: movement documents (phases stage 3), bill-number format (stage 4), e-way creation (stage 5). You confirm each.
**Option B.** Keep the PRD at "2" for these parts. Change the lower documents (questions Q4, V-40, design-language section 12, phases) to say stage 2.
**My pick.** Option A. The bill-number format is only used when a bill is issued, in stage 4. Asking the CA for it at stage 2 adds no safety.
**If approved.**
- DEC-NEW-3: "Statutory applicability: stages named per part." If you want a different stage for any part, that stage is OPEN (owner: product owner) until you name it.
- PRD changes: the "Required policy configuration" Statutory applicability row. Policy changes: kdps-policies.md table row 10 (same edit, same time). POL-10.07 text stays.
- Lower docs: questions-for-kdps.md Q4, phases.md (stage 3 and stage 4 policy lists), design-language.md section 12 only if the stage moves.

**Owner / blocks.** Product owner decides the stages. Accounts and the CA give the values. Blocks stage 2 (policy list) and stage 4 (bill format).

### N-23 Stage 6 lets incentives use the old-POS import

**Clash.** phases.md stage 6 says incentives need sales evidence "from the parallel-run import or from stage 4". PRD-LIF-014 says parallel-run imports are evidence for "checking and reports only". PRD-LIF-010 limits historical sales to reports. PRD-HRM-011 names only POS and approved EBO evidence. Paying incentives is a money effect, not a check or a report.
**Option A.** Fix phases.md: "Incentives need sales evidence from stage 4 bills or approved EBO imports (PRD-HRM-011)."
**Option B.** Allow old-POS data to feed incentives. That needs a PRD change to PRD-LIF-014, PRD-LIF-010 and PRD-HRM-011, with a policy home for it.
**My pick.** Option A. It follows the PRD and invents nothing.
**If approved.**
- DEC-NEW-4: "Old-POS imports are not incentive evidence." This is a record only. No PRD or policy text changes under A. Under B, PRD-LIF-014, PRD-LIF-010 and PRD-HRM-011 change.
- Lower docs: phases.md stage 6 "Order inside the stage".

**Owner / blocks.** Product owner. Blocks stage 6 incentives.

### N-42 "First month of the test run" writes a duration into the PRD

**Clash.** The PRD "Business measures" intro says the present value of each measure is recorded "during the first month of the test run". The run length is OPEN (phases.md go/no-go table, owner: KDPS Owner; questions-for-kdps.md KDPS Owner 29). AGENTS.md says never to invent a value.
**Option A.** Reword to "during the side-by-side test". No duration.
**Option B.** Keep a measuring window, but say its length is set by the KDPS Owner and stays OPEN.
**My pick.** Option A. It is shorter and cannot go wrong if the run is shorter.
**If approved.**
- DEC-NEW-5: "Business measures are recorded during the side-by-side test; no duration is set in the PRD."
- PRD change: the "Business measures" intro sentence (table note, no ID). No policy change.
- Lower docs: none. Run length stays OPEN (phases.md table, V-45, question 29).

**Owner / blocks.** Product owner for the wording. KDPS Owner for the run length. Blocks the stage 2 test run only for the length.

### N-43 Go/no-go pass marks live only in phases.md, but POL-14.01 depends on them

**Clash.** POL-14.01 says to switch "after the side-by-side test's go/no-go checks pass". Only phases.md defines those checks, and phases.md sets delivery order only. It shows "no unexplained difference", "all staff trained" and "no serious exception" as set. The PRD defines Exception with no severity scale, so "serious" has no meaning. The "way back" plan and whether the old POS accepts the KDPS PT layout "must be confirmed", with no owner or stage.
**Option A.** Give the checks a policy home. Add a new bullet in policy 14 (the next free number). It states the three checks and marks the rest OPEN. phases.md then cites POL-14.
**Option B.** Keep the checks in phases.md. Add only a policy 14 note that the pass marks are KDPS's to set and sign before the first switch, and stay OPEN until then.
**My pick.** Option A. A business gate belongs in a signed policy, not in a delivery plan.
**If approved.**
- DEC-NEW-6: "Go/no-go checks move into policy 14."
- New policy bullet in policy 14 (next free number). The text names the three checks. OPEN items: run length (KDPS Owner, before the test run); material-difference threshold per Store (KDPS Owner and Accounts, before the first switch); meaning of "serious exception" (KDPS Owner and Operations, blocks stage 4). Add no values. Existing POL-14.05 and POL-14.07 already cover the way back.
- PRD change: optional, only if you want a severity word in the Exception definition.
- Lower docs: phases.md cites the new bullet and keeps the delivery notes; questions-for-kdps.md gets one question on "serious exception" and one on whether the old POS accepts the KDPS PT layout; the report's V-45 gets a cross-reference.

**Owner / blocks.** Product owner for the policy home. KDPS Owner, Accounts and Operations for the values. Run length blocks stage 2 testing. The rest blocks stage 4 (first switch).

### N-44 Two business-measure targets carry no "proposed" marker

**Clash.** The PRD "Business measures" intro says targets marked "(proposed)" await KDPS agreement. Seven are marked. "Tally import rejection: Less than 2%" and "Monthly brand-by-store profit: Fifth working day" are not. No DEC, answer or question records who set them. The fifth-working-day target also depends on allocation bases that POL-09.20 leaves unset.
**Option A.** Mark both "(proposed)".
**Option B.** Keep them unmarked and log who agreed each one. The name and date stay OPEN with the product owner until you give them.
**My pick.** Option A. I found no record of agreement, so "proposed" is the honest label.
**If approved.**
- DEC-NEW-7: "Both targets are proposed until KDPS agrees."
- PRD change: the two rows in "Business measures". No policy change. No value changes.
- Lower docs: questions-for-kdps.md gets an Accounts question on the Tally rejection target and one on the fifth-working-day target (tied to POL-09.20, blocks stage 5).

**Owner / blocks.** Product owner decides the label. Accounts answers the questions. Blocks stage 5.

### N-63 "Offline counter, enabled after online billing is proven" adds a gate

**Clash.** phases.md stage 4 says the offline counter is "enabled after online billing is proven". PRD-OFF-001 to PRD-OFF-019, POL-16.01 and AGENTS.md Delivery gate offline only on the signed Offline operation policy. "Proven" has no pass mark, length or approver. The stage 4 offline exit check does not mention it.
**Option A.** Reword phases.md to use the gates that exist: "enabled only under the signed Offline operation policy and after the offline exit check below". Delete "proven".
**Option B.** Keep an online-billing-first gate. Then define it: the check, the owner and the stage. Any number stays OPEN.
**My pick.** Option A. The policy and the exit check already do the job.
**If approved.**
- DEC-NEW-8: "Offline enabling follows policy 16 and the stage 4 offline exit check only." This is a record only. Under B, PRD-OFF or POL-16 changes, with the gate named.
- Lower docs: phases.md stage 4 "In scope" line.

**Owner / blocks.** Product owner. Blocks stage 4 offline enabling.

### N-65 Real-data side-by-side test: are signed policies needed?

**Clash.** This is a gap, not a clash. phases.md allows pre-signature testing "with synthetic data". The side-by-side test runs on kdps-test with real KDPS data (DEC-028). phases.md does not say whether that real-data test needs signed policies or configured real values. It also does not list KDPS's agreement to hold real data (KDPS Owner question 37; deployment.md D-4) as a "Before the test" step. Until that is answered, imports keep no customer name or phone number (PRD-SEC-009, PRD-SEC-010).
**Option A.** State that the side-by-side test is not a live operation (the old POS stays the system of record), so it needs no signed policies. It does need the question 37 agreement first.
**Option B.** State that real-data testing needs signed policies and configured real values first.
**My pick.** Option A. Test bills issue no tax invoice and bill no real customer (PRD-LIF-026). Still your call.
**If approved.**
- DEC-NEW-9: "The side-by-side test on real data needs the D-4 agreement, [and no signed policies / and signed policies]." No PRD or policy text changes under A. B is a gating change that may touch the policy preamble.
- Lower docs: phases.md (the "Before the test" row and the gating bullet on line 15); deployment.md only if you want a cross-check.

**Owner / blocks.** Product owner for the gating. KDPS Owner for question 37. Blocks stage 2 testing with real data.

### N-71 Test data is "not official", but the approved PT is exported from it

**Clash.** This is a gap. deployment.md section 4 says "the current POS is the system of record, so losing test data loses nothing official". phases.md "Testing and switch-over" says Apparel OS exports the approved PT in the KDPS layout so the current POS can load it (PRD-PTW-008). It says this depends on the old POS accepting the file. If the file comes from kdps-test, test output feeds the system of record. stock-ledger.md section 9 says nothing moves from the test setup to production. deployment.md section 7 does not mention this outbound file.
**Option A.** Yes, PT export is used during the test. List it in deployment.md section 7 as a file a person loads into the old POS, with no automatic link. Reword the backup sentence to say an exported PT already loaded into the old POS is an official-system record.
**Option B.** No, not during the test. Say in phases.md that PT entry into the old POS stays manual until you decide otherwise.
**My pick.** Option A. It matches phases.md, which already assumes the export. Whether the old POS accepts the file stays OPEN.
**If approved.**
- DEC-NEW-10: "PT export from kdps-test: [used / not used] during the side-by-side test." No PRD or policy text changes.
- Lower docs: deployment.md (section 4 backup sentence, section 7, optionally section 10); phases.md Rules line on the PT export.

**Owner / blocks.** Product owner. KDPS Owner confirms the old POS file. Blocks the stage 2 test.

### C-12 No rule for moving a stocked category from quantity-tracked to piece-tracked

**Clash.** This is a gap. PRD-MER-014 sets tracking per profile. POL-04.09 says other categories need explicit selection (V-06, stage 2). PRD-MER-017 and PRD-LIF-025 start piece rules and labelling only at a Store's switch count. Nothing says what happens to stock already held as quantity when a profile is changed to piece-tracked later. stock-ledger.md section 5 covers only the switch and EBO cases.
**Option A.** Allow the change only through a labelling count. Count, label and verify every piece of that profile at each Site (the same idea as PRD-LIF-025). Piece rules start from that count.
**Option B.** Do not allow a profile with stock to change. The change applies only to goods received after it, and old quantity stock is sold down as quantity. The date and any limit stay OPEN with the product owner.
**My pick.** Option A. It reuses a rule you already have and leaves no mixed stock.
**If approved.**
- DEC-NEW-11: "Changing a profile to piece-tracked starts piece rules at a labelling count."
- PRD changes: new bullet in the Merchandise and identifiers section, next free number after PRD-MER-017 (PRD-MER-018 if still free). PRD-MER-014, PRD-MER-017 and PRD-LIF-025 keep their IDs. Policy change: POL-04.09 adds a pointer.
- Lower docs: stock-ledger.md section 5; phases.md stage 2 labels line; blueprint only if a screen shows the change.

**Owner / blocks.** Product owner. Booking and Operations answer V-06 (stage 2). Blocks stage 2 if any extra category is chosen.

### C-13 Location moves: stage 2 or stage 3?

**Clash.** stock-ledger.md section 2.3 lists "Location move" as stage 2. phases.md stage 3 lists "within-Site moves" under stock and warehouse control. phases.md stage 2 includes "putaway at the selling Site". PRD-STK-005 defines within-Site moves. PRD-REC-022 covers putaway.
**Please confirm this reading.** Stage 2 putaway uses the location-move movement. General within-Site move screens (floor, backstore, rack, bin) arrive in stage 3.
**Option A.** Confirm the reading. Edit the ledger stage column to "2 (putaway); 3 (general within-Site move screens)".
**Option B.** Move general within-Site moves into stage 2. Edit phases.md stage 2 and stage 3 scope.
**My pick.** Option A. It keeps stage 2 small and needs no scope change.
**If approved.**
- DEC-NEW-12: "Putaway (stage 2) uses the location-move movement; general within-Site move screens are stage 3." No PRD or policy change.
- Lower docs: stock-ledger.md section 2.3 stage column; phases.md only under B.

**Owner / blocks.** Product owner to confirm. Blocks the stage 2 and stage 3 scope wording only.

### C-10 PRD-UXP-004 Store area names against the blueprint menus

**Clash.** PRD-UXP-004 gives Store users "Billing, Bills, Till & Sync, Receive Goods, Transfers, Stock, Offers, Money, Reports and staff self-service". The blueprint and personas.md use working menu labels: Sell, Receive Goods, Transfer, Stock Count, Damage & supplier returns, External sales and others. Both documents already mark this OPEN (product owner; stage 1 screens). design-system.html repeats it (finding N-40).
**Option A.** Change the PRD wording via a DEC. Say UXP-004 lists the areas a Store user can reach, not menu labels, and add Stock Count, Damage and External sales.
**Option B.** Rename the design menus to the PRD names in personas.md, ui-blueprint.html and design-system.html. Add any missing areas as extra menus.
**My pick.** Option B. The PRD ranks higher, and AGENTS.md says to fix the lower document. Option A is fine if you prefer the shorter labels.
**If approved.**
- DEC-NEW-13: "Store menus use the PRD-UXP-004 area names" (or, under A, "PRD-UXP-004 lists areas, not labels").
- PRD change: none under B; PRD-UXP-004 changes under A (ID kept). No policy change.
- Lower docs: personas.md, ui-blueprint.html (note and gap G27), design-system.html (navItems, mNav, comboMenu). Under A, only the "OPEN" notes in those three change.

**Owner / blocks.** Product owner. Blocks stage 1 screens.

### X-05 PRD-TAX-004 (tax-document correction) is in no stage

**Clash.** PRD-TAX-004 says to keep tax-document issue, cancellation/correction and operational reversals distinct. phases.md stage 4 delivers returns, exchanges and refunds against tax invoices, plus IRN evidence (PRD-POS-019). Stage 5 lists "GST registers, GSTR-2B matching, e-way bills through a GSP, TDS, statutory calendar, fixed assets". PRD-TAX-004 is in neither. design-language.md section 7 mentions a tax-invoice cancellation state that its own state table does not contain. POL-10 has no answer on the tax-document treatment of a customer return.
**Option A.** Place it in stage 4, with returns. Add it to the stage 4 scope and exit checks.
**Option B.** Place it in stage 5, with an explicit interim rule for stage 4 returns. The interim rule stays OPEN (product owner and CA).
**My pick.** Option A. Stage 4 creates the returns that need it.
**If approved.**
- DEC-NEW-14: "Tax-document cancellation and correction (PRD-TAX-004) is delivered in stage [4/5]." PRD-TAX-004 keeps its text. The PRD stage table needs no change.
- Policy change: new POL-10 bullet (next free number) that the credit-note and cancellation treatment of customer returns is "to be confirmed by the CA" (OPEN, CA, blocks stage 4). Add no values.
- Lower docs: phases.md (stage 4 or 5 scope and exit checks); design-language.md section 7 (add the tax-document states, names to be set by design and the CA); questions-for-kdps.md (CA question).

**Owner / blocks.** Product owner for the stage. CA for the treatment. Blocks stage 4.

### X-08 No stage plans Hindi for stage 6 screens

**Clash.** PRD-PRO-009 requires English and Hindi interfaces, with no stage. phases.md, AGENTS.md, ui/README.md and design-language.md say the Hindi interface arrives in stage 5 "for the screens already built". Stage 6 screens (check-in, targets, incentives, payslips, self-service, planning) come after that. No stage or note covers them.
**Option A.** Hindi follows each stage's screens. Stage 6 gets its own Hindi step after its screens are built.
**Option B.** Keep one Hindi step in stage 5. Name a later single step for all screens built after it, with its timing OPEN with the product owner.
**My pick.** Option A. Staff payslips and targets are the screens that most need Hindi.
**If approved.**
- DEC-NEW-15: "Hindi for stage 6 screens: [own step in stage 6 / one later step]." The stage is a business choice, so I suggest logging it. No PRD or policy text changes, because PRD-PRO-009 names no stage.
- Lower docs: phases.md (stage 5 and stage 6 scope); AGENTS.md Delivery sentence; ui/README.md; design-language.md section 12 (its "Hindi text and a Devanagari font check" row).

**Owner / blocks.** Product owner. Blocks stage 6 screen scope. The stage 4 half of the critic's note is not a gap (see below).

### Not a clash after re-reading

- **X-08, stage 4 half.** The critic said stage 4 Store day screens run English-only until stage 5. phases.md says stage 5 Hindi covers "the screens already built". That includes stage 4. The only effect is that the pilot Store runs English until stage 5. This is a plan choice, not a clash, so I left it out of the item above.
- **Three items that read as clashes but are really gaps or wording (kept because each needs a ruling).** N-43 is mostly a "wrong home" problem (criteria in phases.md). N-65 and N-71 are gaps, not contradictions, because nothing in the text forbids what phases.md says.

## C. Ledger, accounting and test setup

Note for the owner. I re-read the real text of each item. The stock-ledger file has been edited since the review, so three items no longer clash (listed at the end). Nothing below sets a value. Where a number is needed, it stays OPEN with a named owner.

### N-20 Returns with no sale in the app (after a switch)

**Clash.** SL-10 (stock-ledger section 12) says an EBO return not linked to its imported sale, and a return of an earlier-POS bill after the switch, "stay unavailable". PRD-EBO-005 says apply approved EBO returns to stock once. POL-06.02 gives a 15-day return window. So for 15 days after each Store switches, a customer with an old-POS bill cannot return in the app. The no-bill part is not a clash: PRD-RET-017 and POL-07.08 already keep no-bill returns unavailable until configured. phases.md Stage 4 never mentions SL-10.

**Option A.** Allow these returns in the app. Each one takes a documented cost source. The cost source is OPEN (owner: product owner, with the CA for another legal entity). This also needs a change to PRD-LIF-010, which imports old sales for reports only.

**Option B.** Keep them unavailable in the app for now. Record this as a named exception to POL-06.02 for the window after each switch. How the customer is served meanwhile is OPEN (owner: product owner).

**My pick.** Option B. It needs no cost source and does not change PRD-LIF-010. Option A can follow in the later data-import plan.

**If approved.**
- Log DEC-NEW-1: "Earlier-POS-bill and unlinked EBO returns: interim handling after a switch."
- PRD/policy IDs: POL-06.02 gets the exception noted. PRD-EBO-005 is noted as unmet for these returns until the later plan. No ID is renumbered. Under A, PRD-LIF-010 and PRD-LIF-015 change instead.
- Lower docs: docs/phases.md Stage 4 (add SL-10 as an open dependency, and a switch-over rule that this is decided before the first switch); docs/design/stock/stock-ledger.md (SL-10 wording); docs/reports/alignment-report.md (open item); docs/questions-for-kdps.md (ask the question only).

**Owner / blocks.** Product owner decides. CA for another legal entity. Stage 4 waits, and in particular the first Store switch.

### N-21 How the local helper and Tally gateway reach the server

**Clash.** deployment.md section 6 says the server never connects into a Store. It also says the helper "has no link to the server (Stack: Hardware)". It names a "Tally connector" that fetches vouchers over HTTPS. DEC-027 and alignment report 4.15 still say this is OPEN for the product owner. The PRD Hardware row only says "via local helper". It does not say "no server link". PRD-INT-009 says "XML/local gateway with file-export fallback". Section 6 uses a different term and omits the fallback. Section 10 (D-1 to D-5) has no entry for it.

**Option A.** Accept section 6 as the answer. Log a DEC. Fix the wording to "local gateway", add the file-export fallback and drop the "(Stack: Hardware)" citation.

**Option B.** Mark section 6 as a proposal. Add D-6 to section 10: "How the local helper and the Tally local gateway reach the server". Owner: product owner. Needed by: stage 4 for the helper, stage 5 for Tally.

**My pick.** Option B. The PRD does not back the "no server link" claim, so it should not read as settled until you say so. Option A stays open if you want to settle it now.

**If approved.**
- Option B: no DEC needed; it is only a design edit. Option A: log DEC-NEW-2, then change the "Still OPEN" line in DEC-027 and alignment-report 4.15.
- PRD/policy IDs: none change. PRD-INT-009 is cited, not edited.
- Lower docs: docs/design/platform/deployment.md (sections 6 and 10). Under A also docs/decisions.md and docs/reports/alignment-report.md. docs/reports/gaps-before-code.md does not mention it, so it does not change.

**Owner / blocks.** Product owner. Stage 4 (counter helper) and stage 5 (Tally gateway) wait.

### N-24 PRD-LED-011 still names Tally as the official book

**Clash.** PRD "Words used" (as changed by DEC-010) says whether Tally is the official book "is set by the Official book policy". PRD-LED-011 says "Tally remains the official book until an authorised accounting-book transition". The Official book row in the policy table says "moving the official book from Tally". POL-11.01 is where Tally is named as KDPS's book.

**Option A.** Reword PRD-LED-011 and the policy row so they follow the Official book policy. Suggested: "The official book is the one the Official book policy names, until an authorised accounting-book transition."

**Option B.** Keep PRD-LED-011 as it is. Change "Words used" so the PRD says plainly that Tally is the official book in the product.

**My pick.** Option A. It finishes what DEC-010 started: no KDPS values in the PRD.

**If approved.**
- Log DEC-NEW-3: "PRD-LED-011 and the Official book row follow DEC-010."
- PRD IDs: PRD-LED-011 and the Official book row of "Required policy configuration" are reworded. POL-11.01 to POL-11.03 stay as they are. PRD-LED-012 and PRD-INT-008 stay as they are.
- Lower docs: docs/reports/alignment-report.md (the note that A-4 said "no open clash remains" was early). Nothing else.

**Owner / blocks.** Product owner. The policy row is needed by stage 5, so stage 5 is the latest it can wait.

### N-27 "Stock-count accuracy" measure treats tolerance as a match

**Clash.** The PRD Business measures row counts pieces "matching the system... within the configured tolerance". PRD-STK-012 and DEC-008 say a tolerance "only selects the approver". No difference counts as fine by itself.

**Option A.** Reword the measure: pieces equal to the system quantity, divided by pieces counted. Differences are listed by approver tier.

**Option B.** Keep the measure. Log that a tolerance may define "matching" for reporting only, never for approval.

**My pick.** Option A. It keeps tolerance with one job, as DEC-008 says.

**If approved.**
- Log DEC-NEW-4: "Stock-count accuracy follows DEC-008."
- PRD IDs: the Business measures row is reworded. PRD-STK-012 is unchanged.
- The "98% (proposed)" target stays proposed. Operations re-confirms it under the new wording. I add no new target.
- Lower docs: none. I found no other doc that quotes the measure.

**Owner / blocks.** Product owner, then Operations for the target. No build stage waits.

### N-37 Offline till: F7 Manager approval and a missing "working set expired" state

**Clash.** PRD-OFF-016 and POL-16.03 say actions "needing fresh approval require online authority". The till design greys F6 Return offline but keeps F7 Manager approval live. PRD-OFF-004 says to block finalisation on an expired working set. The design has a state for expired authority only. The review split this in two.

**Option A.** Treat an above-limit discount or price approval as "needing fresh approval". F7 is greyed "online only" offline. A bill needing that approval cannot be finalised offline.

**Option B.** Allow it offline. The way a manager is checked offline is OPEN (owner: product owner), and PRD-OFF-016 or POL-16.03 would then need a carve-out.

**My pick.** Option A. It follows the rule as written and invents no new mechanism.

**If approved.**
- Log DEC-NEW-5: "Offline manager approval is online-only." Under B, the PRD and policy IDs would change after the DEC. Under A the PRD and policy text stay as written.
- Separate from the decision, and needing none: add a "Working set expired" blocked state, matching "Authority expired". It cites PRD-OFF-004. Its duration is OPEN (see N-54).
- Lower docs: docs/design/ui/design-language.md (section 6B and the state table); docs/design/ui/design-system.html (till function keys and state list). Device-trouble wording stays unless the offline design says which troubles block billing.

**Owner / blocks.** Design owner for the new state. Product owner for F7. Stage 4 waits, since offline is enabled after online billing is proven.

### N-53 Gift-voucher tax has no home in policy 10

**Clash.** PRD-RET-020 and DEC-006 say voucher tax "follows the Statutory applicability policy" (policy 10). No POL-10 bullet mentions vouchers. The tax question sits under POL-07.10, which does not list tax. CA question 6 and V-30 both point to POL-07.10.

**Option A.** Add a new bullet POL-10.10: "Gift-voucher tax on issue and redemption remains to be confirmed by the CA". Re-point the CA question and V-30 to it. The PRD is not edited.

**Option B.** Leave tax under policy 7 and reword PRD-RET-020 to point at policy 7.

**My pick.** Option A. It keeps DEC-006's "tax via policy 10" and changes only lower documents.

**If approved.**
- Log DEC-NEW-6, only to record that POL-10.10 carries out DEC-006. Add no tax value.
- IDs: new POL-10.10. POL-07.10 cross-refers to it. PRD-RET-020 is unchanged.
- Lower docs: docs/kdps-policies.md; docs/questions-for-kdps.md (CA question 6, Owner question 20); docs/reports/alignment-report.md (V-30, B-7, 4.10).

**Owner / blocks.** Product owner for the home. CA for the tax treatment (OPEN). Stage 4 waits.

### N-54 Offline working-set validity time has no home

**Clash.** PRD-OFF-004 needs a "defined validity time" for the cached working set. Only the 24-hour authority renewal (PRD-OFF-003, POL-16.01) is defined. The "Offline operation" row of the PRD policy table, POL-16.01 to POL-16.06 and the open values list do not mention it.

**Option A.** Add "working-set validity time" to the Offline operation row. Add a new bullet POL-16.07, marked OPEN. Add a matching question beside Owner question 24 and a new V-number.

**Option B.** Do not make it a separate setting. State in PRD-OFF-004 that the working set lasts as long as the device authority. This changes what PRD-OFF-004 means.

**My pick.** Option A. It gives the missing value a home without choosing it.

**If approved.**
- Log DEC-NEW-7: "Offline working-set validity time becomes a policy setting."
- IDs: PRD policy table row Offline operation (text added). New POL-16.07. No renumbering.
- The value stays OPEN. Owner: KDPS Owner and Operations.
- Lower docs: docs/kdps-policies.md; docs/questions-for-kdps.md; docs/reports/alignment-report.md; docs/design/ui/design-language.md (the N-37 state shows no duration).

**Owner / blocks.** Product owner decides the home. KDPS Owner and Operations give the value. Stage 4 waits.

### N-56 Store-credit and loyalty settings sit in two policy rows

**Clash.** PRD row "Customer returns" (policy 6) lists "Store-credit and loyalty settings", decided by Owner and Operations. The row "Refunds and no-bill returns" (policy 7) covers store credit and vouchers, decided by Owner and Accounts. The answers live only in POL-07.09, POL-07.11 and POL-07.13. Policy 6 has no bullet on either. Policy 6 only covers store credit as a remedy (POL-06.06).

**Option A.** Add one pointer bullet POL-06.08. It says these settings are answered in policy 7, and Operations confirms them there. No values. The PRD row stays.

**Option B.** Change the PRD instead. Take "Store-credit and loyalty settings" out of the policy 6 row and add loyalty to the policy 7 row.

**My pick.** Option A. It edits lower documents only, and it keeps loyalty in the PRD table.

**If approved.**
- Log DEC-NEW-8: "Store-credit and loyalty settings are answered in policy 7; Operations confirms there."
- IDs: new POL-06.08. PRD rows unchanged under A. Under B, both PRD rows change.
- Loyalty stays OPEN (owner: KDPS Owner and Accounts, as in B-6).
- Lower docs: docs/kdps-policies.md; docs/reports/alignment-report.md (B-6).

**Owner / blocks.** Product owner. Stage 4 waits.

### N-70 Which login the kdps-test setup uses

**Clash.** POL-02.17 requires authenticator-app TOTP in production. Any easier test path is "development-only". PRD-ACS-017 keeps development test access apart from production login. PRD-SEC-001 has no environment carve-out. deployment.md section 3 says only "production requires TOTP". But kdps-test holds real KDPS data on the internet and is neither development nor production.

**Option A.** Say kdps-test follows PRD-SEC-001 and POL-02.17 as written: password plus TOTP, no easier path. Add PRD-ACS-017 to the header. Add D-6 to section 10: whether dev may use an easier path, and what it is (OPEN: product owner, Admin validates, V-04).

**Option B.** Treat kdps-test as non-production for login. This is a policy change to POL-02.17, so it needs a DEC first. The easier path stays OPEN.

**My pick.** Option A. Real data should not sit behind a weaker login.

**If approved.**
- Option A needs no new rule, only a clearer design. Log DEC-NEW-9 only if you want the reading recorded. Under B a DEC is required, and POL-02.17 changes first.
- IDs: none change under A.
- Lower docs: docs/design/platform/deployment.md (header, section 3, new D-6).

**Owner / blocks.** Product owner. Admin validates. The side-by-side test waits.

### N-85 Stock-ledger gaps: unit moves, custody list, approval value recheck

**Clash.** Three parts.
1. Stock-ledger 7.1 calls a business-unit move a "location move". Section 2.3 and PRD-STK-005 limit a location move to floor, backstore, rack and bin. PRD-ORG-005 lets units at one Site map differently. PRD-TRF-023 ties statutory documents to registration. No movement kind covers this move.
2. The Custody row in section 3 omits sale issue, supplier-return departure and failed-delivery return. It lists "return" under counts and uses "handover" loosely.
3. Section 8.2 and 10.4 recheck cost under lock at posting. Nothing says whether a changed cost needs renewed approval (PRD-ACS-007, POL-02.12).

**Option A.** Add a new "business-unit change" movement kind.

**Option B.** Allow a unit change as a location move only when book, legal entity and registration are all unchanged. Everything else uses the transfer or pool-move route. A registration-only change is raised against PRD-TRF-023 and stays OPEN (owner: product owner).

**My pick.** Option B. It adds no new movement kind.

**If approved.**
- Log DEC-NEW-10: "Business-unit moves within a Site, and the approval-value recheck."
- Parts 2 and 3 are not choices. Rewrite the Custody row from the section 2.3 kinds. State that if cost under lock crosses the approver's limit or the approved amount, posting is refused and the record returns for renewed approval (PRD-ACS-007, POL-02.12). Any tolerance for small cost drift stays OPEN (owner: product owner or KDPS Owner). No number is written.
- PRD/policy IDs: none change. PRD-TRF-023 is only raised.
- Lower docs: docs/design/stock/stock-ledger.md (2.3, 3, 7.1, 8.2, 10.4).

**Owner / blocks.** Product owner for part 1. KDPS Owner for any tolerance. The review names no stage. Please name the stage that waits.

### Not a clash after re-reading

- **N-45 (billed-retained value and opening stock).** Stock-ledger section 9 step 4 now says whether such items carry pool value, or count as opening stock under PRD-LIF-027, is OPEN under SL-17 (CA; product owner for the opening-stock part). It also says a carve-out needs a decision record first. Section 6.1 is conditional too. No clash remains. SL-17 already tracks it.
- **N-48 (EBO piece handling).** Section 5 now cites PRD-EBO-011 and DEC-023 only. The invented stop-tracking and restart rules are gone. It says PRD-MER-003 and PRD-MER-016 apply as written until SL-18 is settled. SL-18 is OPEN with the product owner for stage 4. No clash remains.
- **N-49 (customer return of a supplier-owned unit).** Section 7.2 now says these follow the brand agreement (POL-01.05, POL-01.13) and the CA decides the accounting (POL-09.03). It states no default that ownership reverts. The effect is OPEN under SL-4. No clash remains.

These three fixes are uncommitted edits in the working tree (docs/design/stock/stock-ledger.md shows as modified). If you revert those edits, the three items come back.

## D. Words used and design values

How to read this section. Each item has two options at most. I propose. You decide. A DEC-NEW number is a placeholder, and I renumber later from DEC-036. No option below adds a value, rate, date, approver or limit. Where a number is needed, it stays OPEN with a named owner.

### N-88 Test-phase words are not defined and are used interchangeably

**Clash.** `PRD-LIF-012`, `-013`, `-014` and `-016` say "parallel run". `PRD-LIF-026`, `POL-14.01` and `phases.md` (Testing and switch-over) say "side-by-side test". The Business measures intro says "test run". `AGENTS.md` (Delivery) says "test run". The PRD's Words used has none of these words. "Pilot" means the first Store to switch in `POL-14.07` and `phases.md`. It means the first offline Store in `POL-16.02`. "Switch" and "switch count" (`PRD-LIF-025`, `-027`, `PRD-MER-017`) are undefined. The old system is called the earlier, old, current and existing POS. DEC-023, DEC-024, DEC-027, DEC-030 and the alignment report still say "parallel run".

**Option A.** Use one phrase, "side-by-side test", and add Words used entries for it. Add Switch, Switch count, Pilot Store and Earlier POS too. Retire "parallel run" and "test run" in the live rule text. `POL-16.02` then needs a different phrase for its offline Store (for example "first offline Store").
Wording for each entry is proposed only; you confirm it. Old DEC entries stay as written, with a follow-up note.

**Option B.** Keep "parallel run" as the PRD's word. Define it as "the earlier POS stays the selling system for a Store, on any hosting". Define "side-by-side test" as "a parallel run on test hosting under `PRD-LIF-026`". Add Switch, Switch count, Pilot Store and Earlier POS as in A. This changes fewer PRD bullets. It keeps two words for two things.

**My pick.** A. DEC-028 and DEC-030 already moved the documents to "side-by-side test", so one word is simpler.

**If approved.**
- DEC-NEW-1, decided by the product owner. It records the new Words used rows and the retired phrases.
- Question inside the DEC, with no default from me: may the earlier POS keep selling at a Store on production hosting before its switch? The PRD is silent.
- PRD changes: "Words used" (new rows). The wording of `PRD-LIF-012`, `-013`, `-014`, `-016`, and the Business measures intro. Keep all IDs.
- Policy changes: `POL-14.06`, `POL-14.07` and `POL-16.02` wording only. Keep IDs.
- Lower docs then change: `docs/phases.md` (stage 2 and the switch section; "current POS" becomes "Earlier POS"), `AGENTS.md` (Delivery), `docs/questions-for-kdps.md`, `docs/reports/alignment-report.md`, `docs/design/stock/stock-ledger.md` and `docs/design/ui/ui-blueprint.html` ("old POS" wording). Add follow-up notes to DEC-023, DEC-024, DEC-027 and DEC-030.

**Owner / blocks.** Product owner. Stage 2 waits.

### N-89 "Billed-retained" is not in Words used

**Clash.** `PRD-POS-018` and `PRD-STK-002` use "billed-retained". Policy 8 is titled "Billed-retained". The PRD's Required policy configuration table lists it. `POL-08.02` says the pieces are linked to a bill and "unavailable for sale or allocation". The stock ledger (6.1) says "Billed-retained is not a hold. It is a way goods are held". Words used has no row for it. `AGENTS.md` and `docs/README.md` say a term goes into Words used first.

**Option A.** Add a Billed-retained row to Words used. Proposed wording, drawn from `PRD-POS-018` and `POL-08.02`: "Goods paid for but still held in the Store until handover to the customer, for collection or alteration. Not a hold. Not available for sale or allocation." You confirm the wording. The ledger then copies the PRD wording.

**Option B.** Add no row. Treat `PRD-POS-018` as the definition. The ledger drops its own phrase and only cites `PRD-POS-018` and `POL-08.02`. This breaks the rule that a term is defined first in Words used.

**My pick.** A. It follows the document rule and costs one table row.

**If approved.**
- DEC-NEW-2, decided by the product owner. It adds one Words used row.
- PRD changes: "Words used" only. No bullet changes.
- No policy change.
- Lower docs then change: `docs/design/stock/stock-ledger.md` 6.1 (align the wording).

**Owner / blocks.** Product owner. Stage 4 waits (policy 8 is needed by stage 4).

### N-91 The stock ledger coins words and a value-only exception to the count freeze

**Clash.** `PRD-STK-009` says "Freeze counted items and locations from sale and movement while the count is open". Words used says Movement includes a change of value. Ledger 8.1 says "The freeze blocks every movement". Two lines later it says "Value-only movements, such as a late cost change, may post during a count". Those two lines contradict each other. The PRD's Required policy configuration lists "movement during counts" as a policy 2 item (`POL-02.21`). It does not say who decides the carve-out.
Separately, the ledger uses book pool, Site pool, Count freeze, Inspection hold and Held-goods reservation. DEC-033 added only Cost layer, Cost pool, Movement and Receipt origin. `PRD-LED-015` already uses "Site pool".

**Option A.** Keep the carve-out and add the words. Add the five words to Words used (book pool and Site pool as forms of Cost pool). Add a sentence to `PRD-STK-009` saying a change of value only does not break the freeze.

**Option B.** Take the carve-out out and add no new words.
- Ledger 8.1 says the freeze blocks every movement. Delete the value-only line. A late cost change waits until the count closes.
- Ledger 6.1 labels Count freeze, Inspection hold and Held-goods reservation as kinds of the already-defined Hold and Reservation.
- It says "whole-book pool" and "Site pool", citing `PRD-LED-015`.
- If you later want the carve-out, put it under the policy 2 item "movement during counts".

**My pick.** B. It adds no new business rule and matches the PRD as written.

**If approved.**
- DEC-NEW-3, decided by the product owner. It records the freeze rule and the decision on words.
- PRD changes: none under B. Under A, "Words used" and `PRD-STK-009`.
- No policy change under B.
- Lower docs then change: `docs/design/stock/stock-ledger.md` (6.1, 7.1, 8.1).

**Owner / blocks.** Product owner. The words block no stage. The freeze rule must be settled before stage 3 (counts; blueprint G4).

### N-94 Undefined or mixed nouns: receipt lot, Crore, series owner, capitalisation

**Clash.**
- `PRD-OFR-008` says "receipt lot". Words used defines "Receipt origin". The blueprint (Damage and supplier returns) also says "receipt lot". The ledger already says receipt origin.
- `PRD-OFR-002` says "brand/company cost shares". `POL-19.02` says Organisation and brand cost shares. `PRD-ORG-010` and `PRD-ORG-015` use "company-owned" and "company".
- Design-language §8 uses "Cr" and "L". Words used has only Lakh. "Crore" is not defined.
- `PRD-POS-020` gives the bill series to each "billing device". DEC-005, design-language §8 and blueprint G20 say "till" or "counter". Words used defines Till as one billing session.
- Capitalisation varies in the policies: "Store Manager" (`POL-02.13`, `POL-02.21`), "store credit" (`POL-06.06`, `POL-07.03`, `POL-07.06`), against the persona label "Store manager".

**Option A.** One DEC covers all of it.
- `PRD-OFR-008`: "receipt lot" becomes "receipt origin".
- Add Crore (100 Lakh) to Words used, with L and Cr named as display shortcuts for Lakh and Crore.
- Choose "billing device" as the series owner. Add one Words used line for it.
- `PRD-OFR-002`: you decide whether "company" becomes Organisation. Leave "company-owned" in `PRD-ORG-010` and `PRD-ORG-015` as the ownership contrast, unless you say otherwise.
- Policy capitalisation made consistent.
- Lower docs follow without further DECs.

**Option B.** Define the loose words instead of changing the bullets. Add "receipt lot" as a named synonym of Receipt origin. Add Crore. Leave `PRD-POS-020` as it is, and make the lower documents say "billing device". Leave capitalisation alone. This is smaller, but it keeps two words for one thing.

**My pick.** A. One word per thing is the rule in `docs/README.md`.

**If approved.**
- DEC-NEW-4, decided by the product owner.
- PRD changes: `PRD-OFR-008`, perhaps `PRD-OFR-002`, and "Words used" (Crore, series owner). Keep IDs.
- Policy changes: capitalisation in `POL-02.13`, `POL-02.21`, `POL-06.06`, `POL-07.03`, `POL-07.06`. No value changes.
- Lower docs then change: `docs/design/ui/ui-blueprint.html` (receipt lot row, G20 "counter series"), `docs/design/ui/design-language.md` §8, and a follow-up note on DEC-005 ("till" means billing device). `phases.md` and the ledger need no change for receipt lot.

**Owner / blocks.** Product owner. Series-owner wording blocks stage 4. The other parts block no stage.

### N-51 A WCAG 2.2 AA target that no PRD or policy sets

**Clash.** Design-language §2 and §9 say "All pairs are checked against WCAG 2.2 AA" and name §9 "Accessibility (WCAG 2.2 AA)". The PRD, the policies and `phases.md` contain no accessibility or contrast requirement. The only operator-experience rules are `PRD-UXP-001` to `-010`. `AGENTS.md` says a business decision is never settled in design.

**Option A.** Make it a PRD requirement. Add `PRD-UXP-011` naming an accessibility target. The level is yours to name. The design's current claim is WCAG 2.2 AA. Design-language then cites `PRD-UXP-011`.

**Option B.** Keep it as a design goal only. Reword §2 and §9 and the matching design-system.html text to "design target, not a PRD requirement". Mark the formal target OPEN, owner product owner. The PRD can add it later.

**My pick.** B. The PRD is silent, and a conformance target is a product commitment you have not made yet.

**If approved.**
- Under B, no DEC is needed. Under A, DEC-NEW-5 adds `PRD-UXP-011`.
- No policy change.
- Lower docs then change: `docs/design/ui/design-language.md` §2 and §9, `docs/design/ui/design-system.html` (matching text). Under A, `docs/decisions.md` and `docs/prd.md`.
- Also label the toast time, the paging thresholds and the 30% text growth as "design defaults", and say the toast Undo defines no business undo window. See "Not a clash" below.

**Owner / blocks.** Product owner. Stage 1 screens are the first to use it.

### N-52 "Seen" and "Acknowledged" states and an acknowledge-by deadline in My work

**Clash.** Design-language §10.5 says "Seen, Acknowledged and Resolved are tracked separately inside My work". The same idea is in design-system.html (drawer row "Acknowledge by", an "Acknowledge" button) and in the blueprint (Home notes and actions). `PRD-ACS-009` gives one inbox ordered by due time and exposure. `PRD-ACS-010` gives approve/reject, delegation and escalation. `PRD-EXC-001` gives one due date and a status. Words used defines My work as "assigned tasks, approvals and exceptions". Neither Seen nor Acknowledged is a PRD word, and no PRD rule sets a second deadline.

**Option A.** Take them out of the design. Delete the sentence in §10.5. Take the Seen/Acknowledged wording and the Acknowledge action out of the blueprint. Take the "Acknowledge by" row and the Acknowledge button out of the design-system drawer. Keep the single "Resolve by" date from `PRD-EXC-001`.

**Option B.** You want the feature. Add a PRD bullet in People, access and approvals (next free `PRD-ACS` number) and Words used rows for Seen and Acknowledged. The acknowledge-by time stays OPEN. Owner: Owner and Admin, through policy 2 (exception due times). No default value.

**My pick.** A. The PRD has no such rule, and the design may not add one.

**If approved.**
- Under A, no PRD or policy text changes, so no DEC is required. I suggest you note the choice in the pack.
- Under B, DEC-NEW-6 adds the new bullet and the two words.
- Lower docs then change under A: `docs/design/ui/design-language.md` §10.5, `docs/design/ui/ui-blueprint.html` (Home notes and actions), `docs/design/ui/design-system.html` (drawer).

**Owner / blocks.** Product owner. Not stage-bound under A. Under B, stage 1 waits (the inbox and exceptions are stage 1).

### N-81 The policy gate says "Test data", but the side-by-side test uses real data

**Clash.** Design-language §10.17 says "With synthetic test data the action works, and every screen shows a 'Test data' chip". `deployment.md` §1 says `kdps-test` holds real KDPS data for the side-by-side test. `PRD-LIF-026` says the test keeps the earlier POS as the system of record and bills no real customer. The PRD's Required policy configuration says a policy-dependent operation stays unavailable until its policy is signed. It exempts only "design, development or synthetic-data tests". So there is no rule for a gated action on real data with an unsigned policy. A "Test data" chip would mislabel real data. `phases.md` plans "goods-in, transfers and test bills" in the test.

**Option A.** The gate holds on `kdps-test`. Gated actions stay disabled there until their policy is signed. Real data is used for the imports and checks that need no gated action. Add an environment banner. Design then defines which chip shows for synthetic and for real data.
The cost: test bills and other gated actions on `kdps-test` wait for their policy signatures.

**Option B.** Allow gated actions to run on `kdps-test` with real data before signature, as test use. This needs PRD wording that defines such use as not "live", with a banner reading as a test environment and not the system of record.

**My pick.** A. It needs no PRD change and never lets an unsigned policy act on real KDPS data.

**If approved.**
- DEC-NEW-7, decided by the product owner. It records the rule for gated actions on `kdps-test`.
- PRD changes: none under A. Under B, `PRD-LIF-026` and the Required policy configuration intro.
- Lower docs then change: `docs/design/ui/design-language.md` §10.17, `docs/design/ui/design-system.html` (shells 4A to 4D), the "Policy gate" row in `docs/design/ui/ui-blueprint.html`, and `docs/design/platform/deployment.md` §1. KDPS Owner question 37 (`docs/questions-for-kdps.md`) is only affected if the answer changes how real data is used.
- The banner wording and chip family are chosen by design after your answer. I do not pick them.

**Owner / blocks.** Product owner. Stage 2 waits (the side-by-side test with real data).

### N-82 Design-language formats are INR-only, though the PRD allows other currencies

Only one part of this item needs your decision. The rest is a design fix (see "Not a clash" below).

**Clash.** Design-language §8 hard-codes "₹", 2 decimals, whole-number quantities and "pcs". `PRD-MOD-014` says other enabled currencies use their own minor units. `PRD-ORG-011` lets each Organisation configure currencies. `PRD-MER-010` and `POL-04.03` allow pieces, pairs and packs. Whether non-INR display is in scope, and when, is not stated.

**Option A.** Design says the formats are for INR, and units come from the product's stock unit (`POL-04.03`). Non-INR formats are marked OPEN. Owner: product owner. No PRD change.

**Option B.** You scope the first release to INR only. The PRD wording on other currencies is narrowed or marked later, so the design can stop mentioning them.

**My pick.** A. It changes no PRD text and leaves your scope question open.

**If approved.**
- Under A, no DEC is needed. Under B, DEC-NEW-8 changes `PRD-MOD-014` and `PRD-ORG-011` wording (IDs kept).
- No policy change.
- Lower docs then change: `docs/design/ui/design-language.md` §8, `docs/design/ui/design-system.html` (formats).

**Owner / blocks.** Product owner. The stage is not named in the PRD. You name the stage when you rule.

### N-83 Design-language §12 open items: owners and stages, and where the reason list lives

Most of this item is a design fix (see "Not a clash" below). One question needs you.

**Clash.** `AGENTS.md` says to mark each unknown OPEN with a named owner and the stage it blocks. Design-language §12 lists "Reason list (Setup › Reason codes)" with owner "KDPS" and stage 2. `PRD-ACS-010` requires approve/reject with reasons. Approvals are stage 1 (policy 2). No PRD or policy rule says where the reason list is configured. Blueprint G18 repeats the stage 2 timing.

**Option A.** Give it a home in policy 2. A DEC adds the reason list to the Permissions and approvals row. Needed-by stage is 1, which matches `PRD-ACS-010`. The reasons themselves stay OPEN. Owner: Owner and Admin (policy 2).

**Option B.** Leave it as an OPEN design item. Owner: KDPS Owner, with you deciding where it lives. No PRD or policy change now. Add the question to `docs/questions-for-kdps.md`. The stage cell stays unchanged until you rule.

**My pick.** A. Reasons are needed for stage 1 approvals, and policy 2 already sits at stage 1.

**If approved.**
- DEC-NEW-9, decided by the product owner. It adds the reason list to policy 2.
- PRD change: the "Permissions and approvals" row in Required policy configuration. Keep IDs.
- Policy change: a new `POL-02` bullet (next free number).
- Lower docs then change: `docs/design/ui/design-language.md` §12, and blueprint G18, G19, G20, G22 and G23. Give the reason list its own entry apart from the sample delivery. `docs/questions-for-kdps.md` gets the matching question.

**Owner / blocks.** Product owner decides the home. Policy 2 is needed by stage 1.

### N-40 Menu names differ from the PRD's Store areas (C-10)

**Clash.** `PRD-UXP-004` gives Store users "Billing, Bills, Till & Sync, Receive Goods, Transfers, Stock, Offers, Money, Reports and staff self-service". The blueprint, `personas.md` and the design-system's `navItems`, `mNav` and `comboMenu` use Home, Sell, Receive Goods, Transfer, Stock Count, Damage & supplier returns, Stock, External sales, Money, Offers & price, Reports. Sell holds Billing, Bills and the till session. Stock Count, Damage and External sales are not in the PRD Store list. `personas.md` already says "Whether the menus are renamed to match, or the PRD wording changes, is OPEN (product owner; blocks stage 1 screens)".

**Option A.** Rename the design menus to the PRD names. The Store menu then has no Stock Count, Damage or External sales entry. You say where those go.

**Option B.** A DEC says `PRD-UXP-004` lists capabilities, not menu labels. Sell groups Billing, Bills and Till & Sync. You decide the PRD wording for Stock Count, Damage and supplier returns, and External sales.

**My pick.** B. Counts and damage must stay reachable for Store users, and the design groups them sensibly.

**If approved.**
- DEC-NEW-10, decided by the product owner.
- PRD change: `PRD-UXP-004` wording (and `PRD-UXP-005` if warehouse menus are affected). Keep IDs.
- No policy change.
- Lower docs then change: `docs/design/access/personas.md` (remove the OPEN note), `docs/design/ui/ui-blueprint.html` (menus and access grid), `docs/design/ui/design-system.html` (`navItems`, `mNav`, `comboMenu`). Do not rename anything in design until you rule. This closes C-10 once for all three design documents.

**Owner / blocks.** Product owner, then design. Stage 1 screens wait.

### Not a clash after re-reading

These parts of the items above need no decision from you. They are lower-document fixes for the design owner.
- **N-51, toast time, paging thresholds and 30% text growth.** These are design choices, not business rules. Label them "design defaults, to validate against PRD-PRF". State that the toast Undo defines no business undo window.
- **N-82, payment states.** `PRD-POS-010` already separates manual card/UPI records, provider confirmation and settlement. Design-language §7 row 19 "Confirmed" must be narrowed. Add "Recorded manually", "Provider-confirmed" and "Settled", inside the existing state families.
- **N-82, approval panel for an unknown value.** `PRD-ACS-016` already says unknown value is never zero and Approve stays unavailable unless the approver's authority covers it. Design-language §10.14 must add that case and make the scale unit-aware (`PRD-ACS-015`).
- **N-83, owner names and stage wording.** Replace bare "KDPS", "Design" and "KDPS and CA" with the PRD's named deciders. Mark each row OPEN with its blocked stage. Change "Pilot switch" to "Stage 4, before the pilot switch". This follows `phases.md` and policy 14.
- **N-94, "company" in `PRD-ORG-010`.** "Company-owned" names a store ownership format, not a loose word for the owning party. Leave it unless you say otherwise.

## E. PRD and policy tidy-ups and critic extras

**One word approves the whole group.** Say "approve E" and every **My pick** below goes ahead, with the exact edits listed under each item. No item adds a number, rate, date or approver. Any value an edit touches stays OPEN with its named owner. The PRD and policy text are yours, so these are proposals until you approve.

Numbering note: the critic findings had no IDs in `res.json`. I numbered them X-01 to X-10 in file order, which matches `docs/reports/alignment-sweep.md`. DEC numbers below are placeholders, as asked.

---

### N-28 PRD-NAV-016 still says the net-profit steps govern the Store P&L

**Clash.** `PRD-NAV-016` says the net-profit steps (`PRD-NAV-014`) govern "the monthly Store net-asset-value snapshots and the Store P&L". `PRD-NAV-017` (from DEC-011) says the Store P&L stops at profit before tax. DEC-011 never amended `PRD-NAV-016`.

**Option A.** Reword `PRD-NAV-016` to: "These definitions govern the monthly Store net-asset-value snapshots; the Store P&L follows `PRD-NAV-017`." Leave `PRD-NAV-014` alone, because it still applies to a legal entity.

**Option B.** Leave the PRD as it is and add a note to DEC-011 that `PRD-NAV-017` wins. The PRD would still contradict itself on the page.

**My pick.** A. DEC-011 already decided the substance, so this only fixes the sentence.

**If approved.**
- Log DEC-NEW-1, "Consistency fix after DEC-011". It decides no new rule.
- Change `PRD-NAV-016` only; keep its ID.
- No lower document changes. The `PRD-NAV-016` mentions in `stock-ledger.md` and `questions-for-kdps.md` are about Store value and NAV snapshots, so they stay true.

**Owner / blocks.** Product owner. Stage 5 waits.

---

### N-30 The daily-summary channel is both "set" and "unconfigured"

**Clash.** `POL-02.14` (DEC-021) sets the 9 PM summary by WhatsApp, with only recipients unconfigured. `POL-02.11` still lists "daily-summary recipients and channel" as unconfigured. `personas.md` section 3 says "through which channel" is a policy 2 value. The PRD "Permissions and approvals" row now reads "daily summary time and recipients". DEC-010 said that row would contain "channels", and no entry logs its removal.

**Option A.** Log that the PRD row dropped "channels" because `PRD-EXC-012` and `POL-02.14` fix the channel as WhatsApp. Then:
- Remove "and channel" from `POL-02.11`.
- Reword `personas.md` section 3 to "Recipients are a policy 2 value; channel and time are set (`POL-02.14`)".
- Leave the PRD unchanged.

**Option B.** Put "channels" back into the PRD row, as DEC-010 said. Leave `POL-02.11` as it is. This keeps channel as a "configured" item even though WhatsApp is already decided.

**My pick.** A. The channel is decided, and only the recipients are open.

**If approved.**
- Log DEC-NEW-2.
- Change `POL-02.11` and `personas.md` section 3. The PRD row stays as it is; DEC-NEW-2 records its earlier edit.
- Recipient names stay OPEN with the KDPS Owner (V-51).

**Owner / blocks.** Product owner. No stage waits. Recipient names block stage 5.

---

### N-41 POL-18.03 says "quarterly" restore drills with no decision behind it

**Clash.** `POL-18.03` says the Admin runs a restore drill "before go-live, quarterly thereafter". No DEC lists `POL-18.03`. `PRD-SEC-012` sets no frequency. The Policy 18 question still asks "How often is a backup restore tested, and by whom?", and V-63 only asks for the operator and the pre-launch date. The Admin line in `questions-for-kdps.md` points at "KDPS Owner 4 and 5", which are the Logins and Bulk-approval questions. The recovery question is Owner 6.

**Option A.** Word the cadence in `POL-18.03` as "proposed, awaiting KDPS Owner and Admin sign-off", the way `POL-18.01` is worded. Add an explicit question on how often and by whom. Fix the Admin pointer to Owner 6.

**Option B.** Log a DEC that names who at KDPS agreed "quarterly". Use this only if that agreement really happened. I cannot name anyone.

**My pick.** A. It invents no agreement.

**If approved.**
- Log DEC-NEW-3.
- Change `POL-18.03` and `questions-for-kdps.md` (new question and the pointer fix). No PRD change.
- Restore-test frequency stays OPEN (KDPS Owner and Admin).

**Owner / blocks.** Product owner to word it; KDPS Owner and Admin to answer. Stage 1 waits.

---

### N-58 Contra is a Tally voucher, but PRD-LED-012 does not list it

**Clash.** The PRD "Words used" defines Contra as a Tally voucher between accounts of the same legal entity, and `POL-09.25` (DEC-021) maps it. `PRD-LED-012` lists sales, purchases, payments, receipts, journals and credit/debit vouchers, and no contra.

**Option A.** Add "contra" to `PRD-LED-012`: "...payments, receipts, contra, journals and credit/debit vouchers through Tally XML."

**Option B.** Leave the list as it is and add words saying it is not exhaustive. This is vaguer for tests and Tally acknowledgment tracking.

**My pick.** A. The PRD already defines Contra, so it is the plain fix.

**If approved.**
- Log DEC-NEW-4: the Tally XML export includes contra vouchers for same-entity cash and bank transfers, consistent with DEC-021.
- Change `PRD-LED-012`; keep its ID.
- `POL-09.25` already agrees, so no lower document changes.

**Owner / blocks.** Product owner. Stage 5 waits.

---

### N-62 PRD-OFF-002 was not updated when DEC-005 changed the series rule

**Clash.** `PRD-POS-020` (DEC-005) gives each device its own bill series per tax registration and financial year, online or offline. `PRD-OFF-002` still says "a device-specific financial-year bill series" and never mentions the registration. DEC-005 changed only `PRD-POS-020`.

**Option A.** Reword `PRD-OFF-002` to "a device-specific bill series for each tax registration and financial year; devices cannot share a live series". The intent does not change.

**Option B.** Leave it and log that `PRD-POS-020` governs where the two differ. The PRD would still read two ways.

**My pick.** A. A till serving two registrations holds two series, and the offline rule should say so.

**If approved.**
- Log DEC-NEW-5, listing `PRD-OFF-002` as reworded.
- Change `PRD-OFF-002`; keep its ID.
- No lower document changes.

**Owner / blocks.** Product owner. Stage 4 waits.

---

### N-92 Policy 2 wording: "limit" vs "tolerance", "business", "default"

**Clash.**
- **Tolerance.** `PRD-STK-012` and `PRD-CSH-011` say the configured tolerance only selects the approver, and above it there is a higher approver and an owned exception. `POL-02.13` says "limit" and leaves out the owned exception. `POL-02.21` says "cost limits".
- **Movement during counts.** The Policy 2 question asks about the movement rule while a count is open. No answer bullet covers it, though `PRD-STK-009` freezes counted items.
- **"Business".** `POL-02.02` and `POL-02.09` scope roles by "business". `PRD-ACS-001` says "entity, Site, brand". "Business" is not a defined PRD word.
- **"Default".** `POL-02.15`, DEC-017 and Owner Q2 say "default approval limits". The PRD says suggested values are never active defaults.

**Option A.** One DEC and five wording edits, leaving DEC-008 and DEC-017 as written:
- (a) `POL-02.13`: within the configured cash-variance tolerance a Store Manager approves; above it Accounts approves and the difference becomes an owned exception (`PRD-CSH-011`). No cost basis is added.
- (b) `POL-02.21` and Owner Q13: "count tolerance, stated as a cost difference (`PRD-ACS-015`)".
- (c) Add an answer bullet citing `PRD-STK-009`. Keep "who may move frozen items, if anyone" open.
- (d) Replace "business" in `POL-02.02` and `POL-02.09` with the PRD's own words "entity, Site and brand" (`PRD-ACS-001`). You confirm that is what you meant.
- (e) Replace "default approval limits" with "role-level approval limits" in `POL-02.15` and Owner Q2. DEC-017 stays as written, and the new DEC notes the change.

**Option B.** Do only (a), (b), (c) and (e). Leave "business" as it is until the Policy 2 sign-off.

**My pick.** A. The "business" word is the only one that needs your yes.

**If approved.**
- Log DEC-NEW-6.
- Change `POL-02.02`, `POL-02.09`, `POL-02.13`, `POL-02.15` and `POL-02.21`, plus a new `POL-02.22` for the count-movement answer. Change `questions-for-kdps.md` Q2 and Q13. No PRD change.
- Actual tolerances, approvers and the movement rule stay OPEN (KDPS Owner and Admin).

**Owner / blocks.** Product owner for the words; KDPS Owner and Admin for the values. Stage 1 waits (policy 2). The count movement rule matters at stage 3.

---

### N-99 The Policy 6 question still asks for a defective-item return window

**Clash.** The Policy 6 question asks "How many days does a customer have for an ordinary return, and for a defective item?" `POL-06.05` (DEC-020) and DEC-025 say a defective item is assessed, with no hard cutoff. The question asks for a number the policy says not to invent.

**Option A.** Reword the question: "How many days does a customer have for an ordinary return? How is a defective item assessed?" This asks for no defective-item day count.

**Option B.** Leave the question. A reader could still give a day count for defects.

**My pick.** A. It is wording only.

**If approved.**
- Log DEC-NEW-7, a follow-on to DEC-025.
- Change the Policy 6 question bullet 1 in `kdps-policies.md`. Question bullets have no ID.
- The ordinary-return days and the defect assessment process stay OPEN (KDPS Owner and Operations).

**Owner / blocks.** Product owner for the wording; KDPS Owner and Operations for the answers. Stage 4 waits for the answers, and the wording fix itself blocks nothing.

---

### N-100 The PRD IDs banner says numbers run "in order", but several sections are out of order

**Clash.** The `prd.md` IDs banner says "The number counts bullets in that section, in order." Sections such as ACS, STK, RET, CSH and LED have bullets out of numeric order (for example `PRD-STK-012` sits before `PRD-STK-011`). AGENTS.md says a new bullet takes the next free number and IDs are never renumbered.

**Option A.** Reword the banner: "The number is the next free number in that section when the bullet was added. Bullets are never renumbered, so the order on the page need not follow the numbers."

**Option B.** Leave the banner and rely on AGENTS.md. The PRD would keep saying something that is not true.

**My pick.** A. It is wording only and invents no ID.

**If approved.**
- Log DEC-NEW-8.
- Change the `prd.md` IDs banner. No ID changes.
- No lower document changes.

**Owner / blocks.** Product owner. No stage waits.

---

### N-101 DEC-018 and DEC-021 both claim POL-09.25

**Clash.** The DEC-018 "Changed" line lists `POL-09.21` to `POL-09.25`. The DEC-021 "Changed" line lists `POL-09.25`, and `POL-09.25` (Contra) is DEC-021's rule. DEC-018's choice text covers only `POL-09.21` to `POL-09.24`.

**Option A.** Add a short correcting entry, as DEC-016 and DEC-029 did: DEC-018's "Changed" list should read `POL-09.21` to `POL-09.24`, and `POL-09.25` was set by DEC-021. Leave DEC-018's text as written.

**Option B.** Edit DEC-018's "Changed" line in place and cite the correcting note on that line.

**My pick.** A. It follows the existing precedent and leaves the old entries intact.

**If approved.**
- Log DEC-NEW-9.
- Change `decisions.md` only. No PRD or policy IDs change.
- No lower document changes.

**Owner / blocks.** Product owner. No stage waits.

---

### X-01 The offline "online only" list leaves out gift vouchers, Customer credit and loyalty redemption

**Clash.** `PRD-RET-020` says a gift-voucher balance is checked and consumed online at redemption. `PRD-OFF-016` and `POL-16.03` name store-credit redemption as online-only, but not gift-voucher redemption, Customer credit sales (`PRD-POS-022`, limit and due date) or loyalty redemption (`PRD-RET-019`). `PRD-OFF-017` allows offline "cash/manual-tender recording" without saying which tenders that covers. `POL-16.02` says the pilot is cash-first. `POL-07.13` keeps loyalty off.

**Option A.** Add gift-voucher redemption, Customer credit sales and loyalty redemption to the online-only list in `PRD-OFF-016` and `POL-16.03`.

**Option B.** Say in `PRD-OFF-017` that offline tender recording means cash only until a signed offline procedure says otherwise. This is shorter but names nothing.

**My pick.** A. A tender whose balance or limit lives only online is then named, so tests are clear.

**If approved.**
- Log DEC-NEW-10.
- Change `PRD-OFF-016` and `POL-16.03`; keep both IDs.
- `design-language.md` line 184 already says the offline pilot starts with Cash. Recheck it once, and expect no change.
- Which tenders may be recorded offline, and the evidence for them, stay OPEN (KDPS Owner and Operations).

**Owner / blocks.** Product owner. Stage 4 (offline counter) waits.

---

### X-02 Configured rules in the PRD with no policy to switch them on

**Clash.** These PRD rules depend on something "configured", and no policy has a home for them:
- `PRD-RET-008`: cheaper replacement, with refund-difference, credit-difference or refusal.
- `PRD-RET-009`: replacement-SKU restrictions.
- `PRD-RET-015`: evidence for refused attempts.
- `PRD-EXC-013`: large-discount and overdue-transit alerts.
- `PRD-PAY-013`: Owner authority for onward commission.

`POL-06.06` only says "collect or refund any price difference". Alignment report section 3 (B-1 to B-14) does not list any of these.

**Option A.** You name the home for each rule. My suggestion:
- `PRD-RET-008`, `PRD-RET-009` and `PRD-RET-015` go to policy 6.
- `PRD-EXC-013` goes to policy 2.
- `PRD-PAY-013` goes to policy 12.

Then add answer bullets and wording in the PRD "Required policy configuration" rows, and new B and V rows in the alignment report.

**Option B.** Log the five as unplaced in the alignment report only, with owner "product owner to place", and place them when stage 4 starts.

**My pick.** A. `PRD-SEC-017` says nothing runs without a home, and stage 4 is the one that needs these.

**If approved.**
- Log DEC-NEW-11.
- Change the `prd.md` "Required policy configuration" rows for policies 2, 6 and 12 (wording only). Add new `POL-06.*`, `POL-02.*` and `POL-12.*` bullets at the next free numbers. Add B and V rows to `alignment-report.md` and questions to `questions-for-kdps.md`.
- Every threshold, rule and authority stays OPEN. KDPS Owner and Accounts supply the values.

**Owner / blocks.** Product owner for placement. Stage 4 waits for `PRD-RET-008`, `PRD-RET-009`, `PRD-RET-015` and `PRD-EXC-013`; stage 5 waits for `PRD-PAY-013`.

---

### X-06 Label printing has no hardware path

**Clash.** The PRD Stack, Hardware row says "ESC/POS printing and cash drawer via local helper; Tauri only for an unmet hardware requirement". "Words used" defines ESC/POS as "the command language used by receipt printers". `PRD-MER-015`, `PRD-REC-020` and `PRD-OFR-004` print piece-ID labels, price tickets and sale stickers in stage 2, at warehouses and receiving Stores. `deployment.md` section 6 says the helper "runs on the counter PC". No document says how labels print elsewhere, or which command language label printers use. The printer models are still an open Operations item.

**Option A.** The same local helper runs on any PC that has a label printer (counter, warehouse or office). The label command language stays OPEN until KDPS names its printer models.

**Option B.** Treat label printing as an unmet hardware need and use the Tauri exception. This adds a new tool before anyone knows the printer models.

**My pick.** A. It keeps the stack as it is, and Tauri can still be used later if a model needs it.

**If approved.**
- Log DEC-NEW-12.
- Change the PRD Stack Hardware row, and "Words used" ESC/POS only if label printers turn out to use another language.
- Then change the AGENTS.md Stack Hardware row, `deployment.md` section 6, and the Operations "Labels and printers" question in `questions-for-kdps.md`.
- Label printer models and command language stay OPEN (KDPS Operations).

**Owner / blocks.** Product owner for the route; KDPS Operations for the models. Stage 2 waits.

---

### X-10 DEC-029 leaves the KDPS representative's name OPEN with no stage and no list entry

**Clash.** DEC-029 says "The representative's name is OPEN until the product owner adds it." AGENTS.md says every OPEN names its owner and the stage it blocks. DEC-029 names the owner but no stage. V-01 to V-64 and `questions-for-kdps.md` have no row for it. This is the same point as sweep item N-77, which a sceptic parked. Skip it if you prefer.

**Option A.** You add the representative's name to DEC-029 yourself. I do not know it and will not guess.

**Option B.** Add V-65 to the alignment report: "KDPS representative who agreed DEC-017 to DEC-022", owner product owner, blocks the stage 1 policy 2 signature. Point DEC-029 at it.

**My pick.** B. It works now, and the name can be filled in whenever you have it.

**If approved.**
- Log DEC-NEW-13, or add a pointer line to DEC-029.
- Change `alignment-report.md` section 5 (new V-65) and `decisions.md`. No PRD or policy IDs change.

**Owner / blocks.** Product owner. Stage 1 (policy 2 signature) waits.

---

### Not a clash after re-reading

- **X-09, stale "2 Oct 2026" dates.** This is only a stale date, so it is not an item. It is also out of date itself. `ui-blueprint.html` now reads "Revision 5 · 3 Oct 2026" and `personas.md` now reads "Current, 3 Oct 2026".
- **X-03, outside my list.** `phases.md` already says "Stop billing on the current POS and take its last SOH ... Then run the full Store count". The critic's complaint does not match the current text.
- **N-77 and X-10.** These are the same point. I kept X-10 above because it is a real gap. N-77 itself was parked by a sceptic.

## F. Raised while fixing the lower docs

These came up when the lower documents were edited. The edit did not choose; the spot is marked OPEN in the lower document.

### N-64 (phases)

**Question.** The PRD stage table and the policies do not say which stage delivers inbound ownership records (PRD-ORG-017 to PRD-ORG-019, PRD-ACP-020). Confirm stage 2.

**Option A.** Stage 2 (goods-in): the receipt count closes the record, and the Commercial ownership policy is needed by stage 2. This is what I wrote.
**Option B.** Stage 1 builds the record type and stage 2 only exercises it. That adds a stage 1 scope bullet and leaves the stage 2 text as it is.
**My pick.** option_a

### N-33 / SL-21 (ledger)

**Question.** The ledger puts journals on the outbox after the movement commits (PRD-MOD-006, POL-09.12). PRD-MOD-013 says balanced journals per book at commit. How are the two met together? I marked this OPEN as SL-21 under GC-4 and chose no answer.

**Option A.** Journals are written inside the same transaction as the valued movement, so they balance at commit. This asks the financial posting design to own that.
**Option B.** Journals follow through the outbox and balance when they post. This needs a decision record clarifying PRD-MOD-013.
**My pick.** option_a

### N-48 / SL-18 (ledger)

**Question.** Can an EBO Store on brand software take piece-tracked goods in, send them out, or have them counted by quantity? The old text said arrival stops piece tracking. That is an exception to PRD-MER-003 and PRD-MER-016, so I deleted it and marked the question OPEN as SL-18. Also undefined: what event ends 'until it bills in Apparel OS'.

**Option A.** No exception. Piece IDs are kept and scanned as the PRD says, and EBO imports name no piece only for sales reporting.
**Option B.** Log a decision record allowing arrival or outbound by quantity at such a Store, then align section 5 and check 11.7.
**My pick.** option_a

### N-106 / SL-19, SL-20 (ledger)

**Question.** Two design rules have no PRD basis. One is the reconciliation queue for an EBO import that oversells (10.5). The other is undoing a mistaken damage confirmation by a reversal (2.3). I relabelled both as design rules and raised them as OPEN (SL-19, SL-20), citing the PRD rules that do exist. Should the PRD gain these rules?

**Option A.** Add PRD bullets through a decision record, then cite them in the ledger.
**Option B.** Drop both rules from the ledger and leave the cases to the generic exception route (PRD-EXC-001, PRD-ACS-014).
**My pick.** option_a

### N-45 / SL-17 (ledger)

**Question.** Billed-retained items carried across a switch (POL-14.04): do they carry cost-pool value, and do they count as opening stock? PRD-LIF-027 has no carve-out. I removed the old 'no pool value, never opening stock' and marked it OPEN under SL-17 (CA, product owner), blocking stage 4.

**Option A.** They are opening stock under PRD-LIF-027 like any counted item, with value from the CA's recognition timing.
**Option B.** A decision record adds a carve-out. They are counted apart and valued under the CA's rule.
**My pick.** option_b

### N-49 / SL-4 (ledger)

**Question.** Does a customer return of a consignment unit that the agreement passed at sale revert ownership to the supplier? I removed the 'still the supplier's' default and marked it OPEN under SL-4 (CA, product owner).

**Option A.** Follow the brand agreement per POL-01.05 and POL-01.13, set per agreement.
**Option B.** Set one default in a decision record.
**My pick.** option_a

### N-86-owner (reports)

**Question.** Who answers the four design items I added under 'KDPS (answerer not yet named)': partner statement visibility, reconciliation sample and reason list, label layout and printer models, logo? The blueprint says only 'KDPS' (and 'KDPS and design').

**Option A.** Name a person per item (for example KDPS Owner for partner statements and logo, Operations for labels and printers).
**Option B.** Leave the group as it is until the product owner assigns each item.
**My pick.** option_b: I did not invent owners.

### N-87-stage (reports)

**Question.** The 4.15 'how the in-store local helper and Tally local gateway reach the server' question has no stage in any document. Which stage does it block?

**Option A.** Stage 1 build, because the counter hardware path is designed in stage 1.
**Option B.** Before the first Store switch, with production hosting.
**My pick.** Leave unset until the product owner says. I listed it under 'No stage named yet'.

### C-10 (access-ui)

**Question.** The blueprint menus and PRD-UXP-004 use different Store area names (Sell, Transfer, Stock Count, Damage and others, against Billing, Bills, Till & Sync, Transfers, Stock, Offers). I labelled this as OPEN in both files and renamed nothing. Which side changes?

**Option A.** Rename the blueprint and persona menus to the PRD-UXP-004 names
**Option B.** Reword PRD-UXP-004 through a DEC to match the working menu names
**My pick.** Option a is the lower-risk default because the PRD wins, but the product owner decides.

### N-05/N-26 approvers (access-ui)

**Question.** Who holds the approve permissions for PT approval, damage confirmation, stock adjustments, write-offs and supplier-return steps? Does the Owner approve losses or only see them? Who approves transfers, given that the PRD-TRF-005 'higher authority' is undefined (C-07)? The Operations grid cells now read 'Approve (policy 2)' and 'Differences above Store limit (policy 2)'. They are marked OPEN, owner KDPS Owner, policy 2, stage 1 live approvals.

**Option A.** Name the approver roles in policy 2 through a DEC, then fill the grid
**Option B.** Leave them unassigned until KDPS configures them and keep the grid cells labelled 'policy 2'
**My pick.** Option b until the KDPS Owner answers. Add the question to questions-for-kdps.md under KDPS Owner.

### Owner grid cells (access-ui)

**Question.** The Owner's approve rungs on Booking, Offers & price and Partners, and the Owner's view on Damage and Stock Count, have no explicit PRD or policy basis beyond 'significant approvals'. I kept the grid and made the menus match it.

**Option A.** Keep the Owner as the proposed access default
**Option B.** Reduce the Owner's cells to the PRD-backed ones through a policy 2 answer
**My pick.** Option a until policy 2 decides.

### C-11 (lang-system)

**Question.** Design review needed for new state names. I listed them as 'Proposed states (for design review)' under design-language.md section 7 and kept them out of the settled table and out of design-system.html. Which names does the product owner want?

**Option A.** Signed (Done, policy readiness) and Revoked (Stopped, lost device or session), as proposed
**Option B.** Other names, or no badge: keep the 10.17 banner for policy status and treat a lost device as a Setup list outside the badge families
**My pick.** option_a

### N-84-transfer (lang-system)

**Question.** design-language.md section 7 had two near-identical Moving states for transfers (In transit, Dispatched) with no rule for when each shows. I wrote a rule: In transit is the transfer while any dispatch has not arrived (PRD-TRF-013). Dispatched is one dispatch, until its arrival is recorded (PRD-TRF-011). Does the design owner agree, given the blueprint uses 'In transit' for transfer lists?

**Option A.** Keep both states with the split rule above
**Option B.** Merge into one state, In transit, and drop Dispatched
**My pick.** option_a

### C-09 (lang-system)

**Question.** Bill number length limit and allowed characters are marked OPEN in design-language.md section 8 and section 12 (owner Accounts and the CA, POL-10.07, blocks stage 4). I removed 'at most 16 characters'. The sample B01C1/2627/04381 is labelled a synthetic layout. Nothing for me to choose; the CA confirms the limit.

**Option A.** Wait for the CA to confirm the length limit and allowed characters
**Option B.** n/a
**My pick.** option_a
