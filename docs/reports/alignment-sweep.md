# Alignment sweep — 3 Oct 2026

> **Not ranked.** This report decides nothing and changes nothing. Any PRD or policy change needs an entry in [decisions.md](../decisions.md) first. See [README.md](../README.md).

**What was checked.** Every document under `docs/` and `AGENTS.md`, by eleven reviewers (PRD against policies, ID and citation integrity, decisions applied, phases, stock ledger, personas and deployment, design language, blueprint, design system, agent guide and reports, vocabulary and numbers). Each finding was then checked by two sceptics, one on the evidence and one on rank and intent.

**Result.** 209 raw findings, merged to 109. 97 kept, 10 split (two sceptics disagreed), 2 refuted. The ten critic findings are at the end. The thirteen clashes C-01 to C-13, found earlier, are in section 1.

**How to read it.** The higher document wins; the lower one is fixed (`AGENTS.md`). `N-xx` is a finding of this sweep. Owner and stage say who decides and which delivery stage waits. Items that need a product-owner decision go to [decision-pack.md](decision-pack.md).

## 1. Earlier clashes (C-01 to C-13)

| # | Where | Clash | Fix |
| --- | --- | --- | --- |
| C-01 | `personas.md`, blueprint | Six templates, "No template yet" for five personas; `POL-02.01` has eleven | Edit personas.md and the blueprint |
| C-02 | Blueprint, returns | "Never paid in cash" vs `PRD-RET-010`, `POL-07.01` | Edit the blueprint |
| C-03 | Blueprint module 07 | "30, 15 and 7-day reminders" shown as set; `PRD-OFR-009` is an example | Edit the blueprint |
| C-04 | `design-system.html` | Unlabelled sample values | Label or remove |
| C-05 | `phases.md` stage 1 vs `stock-ledger.md` §11 | Golden posting scenarios need a financial-posting design that does not exist | Write `design/finance/financial-posting.md` (build plan, not this session) |
| C-06 | Stage 1 features | No design note for many stage 1 areas | Short notes in `design/<area>/` (build plan, not this session) |
| C-07 | `PRD-TRF-005` vs `POL-02.07` | "Higher authority" is not defined | Decision pack |
| C-08 | Blueprint module 11 | "Ledger and trial balance" beside "Tally is the sole official book" | Label as the internal ledger |
| C-09 | `design-language.md` §8, `design-system.html` | Bill number "at most 16 characters" as fact | Mark unconfirmed |
| C-10 | `PRD-UXP-004` vs blueprint menus | Store area names differ | Decision pack (PRD wording or blueprint) |
| C-11 | `design-language.md` §7 | No state names for policy signature status, lost device, "Ended" | Design review; list in the state families |
| C-12 | `PRD-MER-014`, `PRD-MER-017`, `PRD-LIF-025` | No rule for moving a stocked category from quantity- to piece-tracked | Decision pack |
| C-13 | `stock-ledger.md` §2.3 vs `phases.md` stage 3 | Location moves: stage 2 or 3 | Decision pack (confirm the reading) |

## 2. New findings kept

### N-03 · clash · POL-02.12 makes any quantity change material; PRD-TRF-010 limits renewed approval to an increase

- `docs/kdps-policies.md` (POL-02.12): "These include changes to amount, quantity, price, supplier or customer, destination, commercial terms, or payment details when relevant to the action."
- `docs/prd.md` (PRD-TRF-010): "Changing items, increasing quantity or changing destination requires renewed approval. A smaller dispatch leaves the remainder reserved."
- `docs/prd.md` (PRD-ACS-007): "Material changes require renewed approval."

- **What disagrees.** For transfers the PRD names an increase in quantity as the trigger; the policy lists any change to quantity. Whether reducing an approved transfer quantity before dispatch needs renewed approval is stated two ways.
- **Higher rule.** docs/prd.md PRD-TRF-010 and PRD-ACS-007
- **Fix.** Reword POL-02.12 to 'increases in quantity' for transfers (or 'beyond those in PRD-TRF-010'), or decide in the PRD that a reduction also needs renewed approval.
- **Files to edit.** `docs/kdps-policies.md`
- **Owner.** product owner. **Blocks.** 1. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the proposed fix. Add that choosing the PRD-side option would mean editing docs/prd.md PRD-TRF-010, not only docs/kdps-policies.md. Also note that PRD-ACS-007 is general and does not itself limit the trigger to increases. Only PRD-TRF-010 does. / Do not edit anything yet. Under AGENTS.md, first propose a decision entry (the next DEC number in docs/decisions.md) and get the product owner's approval. The question is whether reducing an approved transfer quantity before dispatch needs renewed approval. If it does not, edit the lower document, docs/kdps-policies.md, and narrow POL-02.12 only for transfers, for example by adding "except that for transfers an increase in quantity, not a reduction, is material (PRD-TRF-010)". Do not change quantity to "increases" for every action, because other actions are not covered by PRD-TRF-010. If the owner wants reductions to need renewed approval, the DEC must instead change the PRD wording of PRD-TRF-010 and PRD-ACS-007. In that case POL-02.12 stays as it is. Check POL-05.03 for the same wording either way.

### N-04 · clash · Exception owners are routed differently in policies 2, 3 and 16 and in the PRD

- `docs/kdps-policies.md` (POL-02.16): "Route exceptions by type and Site, including stock to Operations, money to Accounts and supplier Booking matters to Booking."
- `docs/kdps-policies.md` (POL-03.05): "Assign each exception to the responsible user or team in Booking, Accounts or Warehouse based on the issue."
- `docs/kdps-policies.md` (POL-16.05): "refused or conflicting bills create exceptions for the Store Manager, with Accounts handling monetary differences."
- `docs/prd.md` (PRD-REC-010): "Compare invoice, GRN and PT quantities, prices, taxes and charges nightly; assign differences to Accounts and Booking."
- `docs/prd.md` (Required policy configuration, row Permissions and approvals): "exception owner/due/escalation and alert recipients, including missing EBO daily reports"

- **What disagrees.** The PRD puts exception-owner choice in policy 2 and POL-02.16 routes stock to Operations. POL-03.05 adds Warehouse, POL-16.05 adds Store Manager, and PRD-REC-010 names only Accounts and Booking. The same exception types could have different owners.
- **Higher rule.** docs/prd.md Required policy configuration (policy 2 owns exception owner/due/escalation); PRD-REC-010
- **Fix.** Make POL-02.16 the single routing home. Reword POL-03.05 and POL-16.05 to 'owner as routed under POL-02.16' (or add Warehouse and Store Manager to POL-02.16 with a DEC). Align PRD-REC-010's named owners.
- **Files to edit.** `docs/kdps-policies.md`, `docs/prd.md`
- **Owner.** product owner. **Blocks.** 1 (exception routing); 2 (source conflicts). **Needs a product-owner decision.** yes.
- **Sceptic notes.** The proposed fix is sound. Optionally add that POL-02.16 or a DEC should state whether Warehouse is the same as Operations, and whether the Store Manager is a named owner for refused or conflicting bills. Without that, rewording POL-03.05 and POL-16.05 to point at POL-02.16 would leave those two roles undefined. / Do not edit docs/prd.md. PRD-REC-010 stays as is: it is consistent with POL-03.05's superset, and the PRD wins. Keep POL-02.16 as the single routing home, as DEC-017 set it. Reword POL-03.05 and POL-16.05 in docs/kdps-policies.md to say "owner as routed under POL-02.16". Keep the issue-type hints, such as Booking for supplier matters, Accounts for monetary differences, and Operations or Warehouse for stock, only if the product owner confirms that Warehouse and Store Manager are valid routing targets. If so, add them to POL-02.16 instead. Log either change as a new DEC first, with the IDs changed, and wait for approval because the policy text belongs to the user. Add no owner names or due times; those stay OPEN with the product owner and KDPS Owner, via questions-for-kdps.md item 3. Mark it as blocking stage 1 exception routing.

### N-05 · clash · Blueprint access grid approve rungs disagree with persona cards and POL-02.13 / POL-02.21

- `docs/design/ui/ui-blueprint.html` (rbac rows Store manager, Operations, Brand manager): "Store manager: 'O|Own Store' (Stock Count) … 'O|Day close' (Money); Operations: 'O|Supplier returns' (Damage), 'V|All' (Stock); Brand manager: 'O|Prices, offers'"
- `docs/design/access/personas.md` (persona cards P-STM, P-OPS, P-BRM): "P-STM: 'discounts and returns within the configured limit, and the Store's day close.' P-OPS: 'transfers, count differences, supplier-return steps, stock adjustments and write-offs.' P-BRM: 'offers and price changes for assigned brands.'"
- `docs/kdps-policies.md` (POL-02.13, POL-02.21): "A Store Manager may approve within a configured limit; Accounts approves above it. … A Store Manager may approve count differences only within configured cost limits."
- `docs/design/ui/ui-blueprint.html` (section 3a cards and module 06 actions): "The grid follows the PRD's "Work supported" column. … approve adjustments within limit (not the counter)"

- **What disagrees.** Personas and policies give the Store manager approval of day-close and count differences; the grid shows only 'operate' for those cells. No persona has an approve rung on Receive Goods (PT approval), Damage or Stock adjustments, though those modules list the approvals as actions. P-OWN 'losses' vs the Owner's 'View' on Damage and Stock Count (E-4 covers only the Owner row).
- **Higher rule.** POL-02.07, POL-02.13, POL-02.21; PRD persona table
- **Fix.** Make the grid and personas.md say the same: show 'approve (within limit)' for the Store manager on Stock Count and Money; decide which personas hold the approve rung for PT approval, damage confirmation, adjustments and write-offs; reconcile P-OWN 'losses'. Leave who approves and limits to policy 2.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`, `docs/design/access/personas.md`
- **Owner.** design (access and UI); KDPS Owner for Brand manager offer approval (POL-19.05). **Blocks.** 1. **Needs a product-owner decision.** yes.
- **Sceptic notes.** The proposed fix is sound but can be tightened. Show 'A' (approve within limit) for the Store manager on Money (day-close cash difference, POL-02.13) and on Stock Count (count differences, POL-02.21). Say in personas.md and the blueprint that PT approval, damage confirmation, stock adjustments and write-offs are approve permissions granted under policy 2. Either add an approve-rung note or footnote to the grid for those cells, or state that no persona holds them by default. Reconcile P-OWN 'losses' with the Owner's View on Damage and Stock Count. Leave the actual approvers and limits OPEN for KDPS. / Edit only the lower documents, docs/design/ui/ui-blueprint.html and docs/design/access/personas.md. Do not touch the PRD or policies.

1. Where the Store manager's authority is already stated in the policies, show it in the grid and the card. On the Store manager row of ui-blueprint.html, change Stock Count to an approve rung such as 'A|Differences within limit' (POL-02.21). Change Money to 'A|Day close within limit' (POL-02.13). Add "count differences within configured cost limits" to the P-STM "Approvals in this work" line in personas.md, citing POL-02.13 and POL-02.21. Use no numbers; limits stay unconfigured.

2. Do not assign approve rungs for PT approval, damage confirmation, stock adjustments, write-offs or supplier-return steps to any persona in design. Leave PT approval as a permission, as personas.md line 161 already says. Instead, add a short note under the grid, or reword the Operations and Owner card lines, to say those approvals are permissions assigned by policy 2.

3. Raise the open approver questions against policy 2 (POL-02.07), not in design. These are which persona or role approves damage confirmation, adjustments and write-offs, whether the Owner's "losses" means approval or only visibility, and Brand manager offer and price approval (POL-19.05). Add them to docs/questions-for-kdps.md under the Owner, marked OPEN with stage 1 as the stage they block.

4. Reconcile P-OWN "losses" by rewording the card to say that loss approval is routed to the Owner as next approver only where policy 2 names the Owner. Do not add Owner approve rungs to the grid until policy 2 does.

### N-06 · clash · Admin, Accounts and HR hold 'manage' (above approve) on areas they only prepare

- `docs/design/ui/ui-blueprint.html` (3a legend and rbac rows Admin, Accounts, HR): "on the ladder none < view < operate < approve < manage … Admin Setup 'M|Full'; Accounts Money 'M|Full'; HR People 'M|Full'"
- `docs/design/access/personas.md` (persona cards P-ADM, P-HRS): "P-ADM: 'prepares role, permission and approval-rule changes. Another authorised person approves them.' P-HRS: 'prepares payroll inputs and attendance regularisation. Payroll approval needs a different person.'"
- `docs/kdps-policies.md` (POL-02.03, POL-02.07): "Expand broad labels such as All, Full and Manage into explicit view, create, edit, approve, cancel, export and override permissions."

- **What disagrees.** On the blueprint's ladder 'manage' sits above 'approve' and POL-02.03 expands Full/Manage to include approve, so Admin, HR and Accounts appear able to approve what personas.md and POL-02.07 say they only prepare. The blueprint's rule 'The preparer can never approve' is not visible in the grid.
- **Higher rule.** POL-02.07, POL-02.08; PRD-ACS-006
- **Fix.** Redefine 'manage' so it does not include approving one's own preparation, or cap these cells at 'operate' plus a named per-record approve action. State what 'Full' means in the legend.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`
- **Owner.** design (UI). **Blocks.** 1. **Needs a product-owner decision.** no.
- **Sceptic notes.** Define "manage" in the 3a legend as configure and administer, explicitly excluding approving one's own preparation. Do not cap every cell at 'operate'. Admin Setup and HR People are prepare-only, so use 'O' or a defined prepare-level manage. Owner keeps 'A|Approve changes' for role, permission and approval-rule changes, and an approver other than HR holds payroll approval. Accounts Money genuinely holds approve for supplier payments, bank-detail changes and discrepancy settlements, so show it as approve with the preparer-differs rule, not as a blanket 'M|Full'. Replace the 'Full' label with an explicit scope, for example "Prepare; approval by another person". / Edit only docs/design/ui/ui-blueprint.html, in the rbac data and the 3a legend.
1. Admin, Setup: change 'M|Full' to 'O|' plus a short label such as 'Prepare role and rule changes'. Approval stays with the Owner row ('A|Approve changes'), matching personas.md P-ADM and POL-02.07.
2. HR, People: change 'M|Full' to 'O|' plus a label such as 'Prepare payroll inputs'. Payroll approval sits with a different person, per personas.md P-HRS and POL-13.13.
3. Accounts, Money: keep an approve-level cell, because personas.md gives Accounts supplier-payment, bank-detail and settlement approvals. Do not cap it at operate. Replace 'M|Full' with 'A|' plus a label such as 'Prepare and approve, never the same person'.
4. Legend: either remove the 'manage' rung or define it as administration of configuration. Do not let it imply approving one's own preparation.
5. Cite POL-02.03, POL-02.07 and PRD-ACS-006 next to the changed rule.
6. Do not edit the PRD or policies, and do not add a DEC.

### N-07 · clash · Persona menus (blueprint section 2) do not match the access grid (section 3a)

- `docs/design/ui/ui-blueprint.html` (menus vs rbac for P-OWN, P-ACC, P-BKG, P-OPS, P-WHS, P-SLS, P-STM, P-ADM): "P-WHS menu has no Reports but grid 'V|Own Site'; P-SLS menu has no Offers & price/Reports but grid 'V|Running', 'V|Own targets'; P-OPS menu has no Stock/Reports but grid 'V|All'; P-BKG menu has no Stock/Setup but grid 'V|View', 'O|Products'; P-STM menu has no People but grid 'V|Team attendance'; P-ACC menu omits Sell, Stock, External sales, People, Setup but grid grants them"
- `docs/design/access/personas.md` (section 3, bullet 2): "The sidebar is the union of the sections the user's role assignments grant."

- **What disagrees.** Both sections are said to derive from the PRD 'Work supported' column, yet the grid grants sections (including Owner's approve on Offers & price and Partners) that never appear in that persona's sidebar. A section cannot be granted and absent from the menu.
- **Higher rule.** PRD-ACS-002; personas.md section 3
- **Fix.** Generate menus and grid from one table: add the missing sections to menus or reduce the grid. Update persona cards to match.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`, `docs/design/access/personas.md`
- **Owner.** design (UI and access). **Blocks.** 1. **Needs a product-owner decision.** no.
- **Sceptic notes.** The proposed fix is sound, but it should name a direction. Pick the PRD "Work supported" column as the single source and regenerate both the `menus` and `rbac` consts and the personas.md persona cards from one table. Where a grid cell has no matching PRD work, drop it. For example, the Owner approve cells on Offers & price and Partners and the Operations 'V|All' on Stock and Reports need a PRD basis. Where the PRD does support the work, add the section to that persona's menu. Include P-ADM in the pass. / Do not reduce the grid. Treat it as the access default, since it follows the proposed (Open) template map in policy 2. Fix the persona menus and persona cards, which are lower-rank design copies. Either derive each persona's menu from the grid (every section with a non-'none' rung, with persona-specific tab text, "Lands on" and ordering kept), or add one sentence to blueprint section 2 and personas.md section 2 saying the card shows the persona's primary work-placement sections and the sidebar is the union of granted sections (PRD-ACS-002/003). Either way, update ui-blueprint.html (menus array) and the personas.md persona cards together. Name P-OWN, P-ACC and P-OPS explicitly. If any grid cell looks wrong against policy 2, raise it as a question for the policy owner rather than editing the grid. Cite PRD-ACS-002 and PRD-ACS-003 in the edit. No DEC is needed, because the PRD and policies are not touched.

### N-08 · clash · Suppliers, parties and commercial terms (stage 1 scope) sit only in stage 2 modules in the blueprint

- `docs/design/ui/ui-blueprint.html` (module 03 Booking; module 04 File intake; module 16 Setup): "stage: 'Stage 2' … L('Suppliers and agreements', 'Brands · Suppliers · Agents · Ordering and invoicing parties', 'Policy 1') … L('File intake', 'Uploads · Saved layouts · Outcomes')"
- `docs/phases.md` (Stage 1 In scope): "Merchandise and identifiers: brands, suppliers and other parties, SKUs, barcodes, units, product proposals. Effective-dated commercial terms for brands and suppliers. Source conversion and imports: file intake, saved mappings, staging, review, duplicate control."

- **What disagrees.** phases.md puts parties, effective-dated terms and file intake with saved mappings in stage 1; the blueprint's only screens for them are in Booking and Receive Goods (stage 2), and Setup (stage 1) has no party, agreement or import page. P-ADM ('masters') cannot open Booking. Related to C-06 but about stage tags.
- **Higher rule.** PRD stage table (stage 1 'parties'); PRD-MER-001; PRD-ORG-016; phases.md stage 1
- **Fix.** Move or copy 'Suppliers and agreements' and 'Agreement' to Setup or tag them stage 1; add a stage 1 file-intake and mapping page; keep Booking and Receive Goods links as stage 2 views.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`
- **Owner.** design (UI). **Blocks.** 1. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the proposed fix. Add a note that the stage 1 file-intake and mapping page in Setup should be reconciled with the existing Setup page "Opening and cutover" ('Sources · Mapping'). Either reuse it or link to it, so there are not two mapping surfaces. When a page is moved or copied, the Booking and Receive Goods links stay as stage 2 views.

### N-09 · clash · Employee self-service is said to come from the employee record, though only role assignments grant access

- `docs/design/access/personas.md` (section 4 'Every employee'): "Self-service (attendance check-in, own targets, own incentives, payslips) comes with an employee record"
- `docs/design/access/personas.md` (section 1 Rules): "A persona does not itself grant a transaction or approval. Only role assignments grant access."
- `docs/prd.md` (PRD-ACS-002; PRD-ACS-003): "only role assignments grant access."

- **What disagrees.** Section 4 creates a second access path (employee record, no role assignment) that the PRD does not describe; design-language 6C also lists Portal Self-service for all staff without a role.
- **Higher rule.** PRD-ACS-001 to PRD-ACS-004; PRD-HRM-012; PRD-UXP-004
- **Fix.** Say self-service is a permission granted by a role assignment (for example a baseline self-service role template), or ask the product owner to add an employee-record baseline to the PRD.
- **Files to edit.** `docs/design/access/personas.md`, `docs/design/ui/design-language.md`
- **Owner.** product owner. **Blocks.** 1 (access); 6 (HRMS self-service). **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the proposed fix: either state that self-service is a permission granted by a role assignment (for example a baseline self-service role template), or ask the product owner to add an employee-record baseline to the PRD. Change files_to_edit to docs/design/access/personas.md (section 4 and the C-EMP row at line 167) and docs/design/ui/ui-blueprint.html (line 185, and the persona and self-service entries around lines 266 and 357). Edit design-language.md 6C only if the chosen resolution requires a note. It does not currently assert that staff need no role. / Keep the finding as a clash, but edit only the design layer. In docs/design/access/personas.md section 4 row 'Every employee', replace "comes with an employee record" with wording such as: "Self-service (attendance check-in, own targets, own incentives, payslips) is a permission carried by a role assignment, limited to the person's own records (PRD-HRM-012, PRD-ACS-002). A person with no other role still needs an assignment that grants it. OPEN: which template or assignment carries it. Owner: product owner. Blocks stage 1 (access) and stage 6 (HRMS self-service)." Do not name or add a new template. Also soften docs/design/ui/ui-blueprint.html line 185 ("Self-service for everyone ... No persona is needed") to say the access comes from a role assignment. Leave design-language.md 6C as is, or make a light cross-reference only, since it does not claim role-less access. If the product owner wants an employee-record baseline or a new self-service template, log a DEC in docs/decisions.md first, then amend the PRD (PRD-ACS or PRD-HRM-012) and POL-02.01 and the policy 2 template map. Do not edit those before the DEC.

### N-10 · clash · 'Needed by stage' for policies 2, 4 and 9 is earlier in the PRD than the stages the report, questions and blueprint give

- `docs/prd.md` (Required policy configuration, Financial posting row): "rounding/invoice tolerances, petty-cash float/limits, ... | Accounts, CA | 1; Store P&L allocation, asset policy, vouchers and acknowledgments by 5"
- `docs/reports/alignment-report.md` (V-11, V-39, V-38, V-21, V-06): "V-11 | Rounding and invoice-matching tolerances | `POL-09.14` | Accounts | 2 ... V-39 | Petty-cash float and limits per Store | `POL-09.14` | Accounts | 4"
- `docs/questions-for-kdps.md` (Accounts 7): "Petty cash. Float and spending limit for each Store. · `POL-09.14` · V-39 · stage 4"

- **What disagrees.** The PRD and policy table need policies 2, 4 and 9 (bar named items) by stage 1. The report, questions and blueprint gap 4 place ledger accounts, tolerances, count limits, day-close variance and extra piece categories at stages 2, 3 and 4.
- **Higher rule.** docs/prd.md Required policy configuration 'Needed by stage'; kdps-policies.md table
- **Fix.** Log a DEC that splits 'Needed by stage' per value in the PRD row, or change report, questions and blueprint labels to the PRD stage and say 'first used in stage N'.
- **Files to edit.** `docs/prd.md`, `docs/kdps-policies.md`, `docs/reports/alignment-report.md`, `docs/questions-for-kdps.md`, `docs/design/ui/ui-blueprint.html`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** 1-4. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Make a wording-only change with no DEC. Add one sentence to the "Required policy configuration" intro in docs/prd.md and to the matching note in docs/kdps-policies.md. It should say that a policy's "Needed by stage" is the earliest stage at which any of its values is needed, and that individual values may first block a later stage, as listed in section 5 of the alignment report. The "How to read" note in alignment-report.md (the "Blocks" bullet) and the "How to use this list" bullet in questions-for-kdps.md may add "(per value; may be later than the policy's stage in the PRD)". Leave the stage numbers in the report, questions and blueprint as they are. docs/decisions.md and the blueprint need no edit. / Do not take the finding's second option, which relabels the report, questions and blueprint to the PRD stage. It would make the "Blocks" and "stage N" labels wrong: petty cash would appear to block stage 1 when its live use is in stage 4. It would also discard accurate per-value information. Use the first option, with the edits limited to the PRD and the policy table.

1. Log one DEC (product owner) that adds per-value stages to the PRD "Required policy configuration" rows for policies 2, 4 and 9. These would be the stage 1 core values, then count limits by 3, day-close variance by 4, extra piece-tracked categories by 2, ledger accounts and tolerances by 2, and petty cash by 4. Take the stage for each value from the existing V-items. Do not invent new stages or values.
2. Mirror the DEC in the kdps-policies.md table rows for policies 2, 4 and 9. Edit the PRD first, since it ranks higher.
3. Leave the alignment report, questions-for-kdps.md and ui-blueprint.html unchanged. Optionally add one sentence to the report's V-table note saying that "Blocks" is the stage of first live use of the value, and that the policy-level "Needed by" in the PRD is the earliest stage.

Do not touch phases.md unless the DEC changes its "Policies needed before live use" lists.

### N-12 · clash · Statutory applicability row gives no stage for invoice-number format or movement documents; other documents assign stages 3 and 4

- `docs/prd.md` (Required policy configuration, Statutory applicability row (and kdps-policies.md table row 10)): "Registration, goods/rate classification, invoice-number format, sale-or-return tax, e-invoice/e-way, TDS and payroll rules | Accounts, CA | 2; e-invoice by 4, TDS by 5, payroll by 6"
- `docs/reports/alignment-report.md` (5, V-40): "Bill number format within the GST limit | B-3 | CA | 4"
- `docs/phases.md` (Stage 3 'Policies needed before live use'): "Statutory applicability (movement documents)."

- **What disagrees.** By the PRD table everything unflagged in the row is needed by stage 2, including invoice-number format and movement documents. The report, CA question 4 and design-language section 12 say stage 4; phases says movement documents at stage 3 and e-way creation at stage 5.
- **Higher rule.** docs/prd.md Required policy configuration table
- **Fix.** Log a DEC and amend the row, for example '2; movement documents by 3, invoice-number format and e-invoice by 4, e-way creation and TDS by 5, payroll by 6' (or as decided). Align lower documents.
- **Files to edit.** `docs/prd.md`, `docs/kdps-policies.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** 2. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the owner as the product owner, and keep the DEC-first route. AGENTS.md says to fix the lower document to match the higher one. The default is therefore to leave the PRD at "2" and change the lower documents: questions-for-kdps.md Q4, alignment-report V-40, design-language section 12 and phases.md. Do this only if the product owner wants the PRD kept as it is. If the product owner wants stage 4 for invoice-number format, or stage 3 for movement documents, add a new DEC first, then amend the PRD row and the kdps-policies.md table row 10 to match. Do not write stage numbers into the PRD or policies until the owner chooses them. The example split in the proposed fix ("movement documents by 3, invoice-number format and e-invoice by 4, e-way creation and TDS by 5") is a proposal only, not a value to apply. Mark the stage for each sub-item OPEN with the product owner as owner, blocking stage 2. If a DEC amends the PRD row, update kdps-policies.md line 31 in the same edit. Do not edit docs/reports, which is a one-time report that decides nothing. Fix the live lower documents: questions-for-kdps.md, design-language.md and phases.md. The file list should also include those lower documents. It should not include docs/decisions.md as a document to be edited to fit, because decisions.md only gets the new entry.

### N-14 · clash · Blueprint tags 'Damage & supplier returns' Stage 3, but damage reporting and confirmation are stage 2

- `docs/design/ui/ui-blueprint.html` (module 07): "stage: 'Stage 3' … L('Damage reports', 'Awaiting confirmation · Confirmed · Rejected'), R('Damage report', null, D('Hold at once; a different person confirms or rejects'))"
- `docs/phases.md` (Stage 2 In scope): "Damage reported at or after receipt: immediate hold, independent confirmation or rejection."
- `docs/design/stock/stock-ledger.md` (section 2.3, Condition change): "Condition change … | 2 |"

- **What disagrees.** The whole module including damage reports and the Warehouse and Store 'Report damage' entries is Stage 3 in the blueprint, but phases and the ledger go live with damage holds in stage 2 (policy 17 also needed by stage 2).
- **Higher rule.** PRD-DMG-001, PRD-DMG-002; phases.md stage 2
- **Fix.** Tag the module 'Stages 2-3' or move the damage report pages to a stage 2 tag (returns, write-offs, disposals, claims stay stage 3).
- **Files to edit.** `docs/design/ui/ui-blueprint.html`
- **Owner.** design (UI). **Blocks.** 2. **Needs a product-owner decision.** no.
- **Sceptic notes.** Edit only docs/design/ui/ui-blueprint.html, module 07 (line 350). Change stage: 'Stage 3' to 'Stages 2–3', using the en dash that module 08 uses. Make the split explicit in the module's actions or page notes: damage reporting and confirm/reject are stage 2, and the return deadlines, return list, RTV, claims, write-offs and disposals are stage 3. Do not edit the PRD, phases or policies. Also check that the stage 2 'Report damage' entry points in the Receive Goods and Warehouse/Store views are not tagged stage 3. Gap G12 can stay 'Blocks: stage 3', because policy 17 write-off and disposal limits are a stage 3 need. Phases lists 'Held-goods outcomes' as a stage 2 policy need, so no gap change is required.

### N-15 · clash · Delivery step 07 puts piece-ID labels after PT approval and from the official PT; the PRD prints them from the receipt count

- `docs/design/ui/ui-blueprint.html` (script block, steps array, step 07): "{ no: '07', n: 'Labels', d: 'Print labels with piece IDs from the official PT; reprints are recorded' }"
- `docs/prd.md` (PRD-MER-015): "Print piece-ID labels from the receipt count. A piece-ID label printed before PT approval asserts no price or sale eligibility."
- `docs/prd.md` (PRD-REC-020): "Print merchandise/MRP labels from official frozen PT values and retain print/reprint jobs. A pre-approval custody label cannot assert an approved price or sale eligibility."
- `docs/design/ui/design-language.md` (§10.8 Anatomy): "8 steps (Arrival · Count · GRN · Problems · PT · Approval · Labels · Accept)"

- **What disagrees.** The fixed eight-step order says piece-ID labels follow approval; the PRD (and the stock ledger) allow them from the count, before approval. Only MRP labels need the official PT. 'Accept' also has no place for putaway or barcode verification (PRD-REC-021/022). design-language 10.8 and the design-system stepper repeat the order.
- **Higher rule.** PRD-MER-015, PRD-REC-003, PRD-REC-020 to PRD-REC-022; POL-04.06
- **Fix.** Say piece-ID label printing is available from the Count step and carries no price; MRP labels print only from the official frozen PT. Split step 07 or allow a label job before step 06; name putaway and barcode verification inside Accept. Update design-language 10.8 and design-system.html.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`, `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`
- **Owner.** design (UI). **Blocks.** 2. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the core fix. Qualify or split step 07 so it says piece-ID labels can print from the Count step and carry no price, and MRP/merchandise labels print only from the official frozen PT, with reprints recorded. Update design-language.md 10.8 and the design-system.html stepper to match. Drop the sub-claim that Accept has no place for putaway or barcode verification, because blueprint step 08 already names both. / Edit only the design documents: ui-blueprint.html, design-language.md 10.8 and design-system.html. Do not touch the PRD or policies. In blueprint step 07, drop 'from the official PT'. Say that piece-ID labels can be printed from the Count step onward and carry no price or sale eligibility (PRD-MER-015, POL-04.06). Say that MRP/merchandise labels print only from official frozen PT values, so only after Approval (PRD-REC-020). Say that print and reprint jobs are recorded. Keep the eight-step stepper, but make Labels a step that opens early for piece-ID labels and completes with the MRP labels. Alternatively, state that the Labels step is never a gate for Accept except for MRP labels. Leave step 08 in the blueprint as it is, because it already covers barcode verification and putaway (PRD-REC-021, PRD-REC-022). Add one clause to design-language 10.8 and the design-system.html stepper sub-labels: Accept covers barcode verification, acceptance at the selling Site and putaway. Cite the requirement IDs next to each changed rule, as AGENTS.md requires.

### N-16 · clash · Daily stock comparison against the old POS's SOH survives in blueprint, personas and the report after DEC-030 replaced it

- `docs/design/ui/ui-blueprint.html` (module 09 External sales pages; P-OPS menu; rbac Operations External sales cell): "W('Daily stock comparison', 'Matched · Differences · Exceptions') … { s: 'External sales', t: 'Daily comparison · EBO uploads' } … 'O|Comparison'"
- `docs/prd.md` (PRD-LIF-014, PRD-LIF-027): "Parallel-run imports are evidence for checking and reports only. They never create, reduce or move stock. … Reconcile the count with the earlier POS's last SOH and report every difference."
- `docs/decisions.md` (DEC-030 Choice): "At each Store's switch, its verified count is its opening stock. The count is reconciled with the old POS's last SOH, and every difference is reported."
- `docs/design/access/personas.md` (P-OPS card Menu): "External sales (daily comparison, EBO uploads)"
- `docs/reports/alignment-report.md` (4.14): "### 4.14 Parallel-run stock comparison ... **Blocks:** 2, the parallel-run comparison."

- **What disagrees.** DEC-030 replaced the daily shadow-stock comparison with a one-off reconciliation at each Store's switch. The blueprint page, the P-OPS menu, the Operations grid cell and report section 4.14 still describe or block on a daily comparison, whose purpose the blueprint's own 'Old POS during the test' rule leaves undefined.
- **Higher rule.** PRD-LIF-013, PRD-LIF-014, PRD-LIF-027; DEC-030
- **Fix.** Replace the page with a check of import outcomes and reports; move count-versus-SOH reconciliation to Setup > Opening and cutover (stage 4). Change the personas menu text, rename the grid cell, retitle 4.14 and drop 'Blocks: 2'. If a daily SOH check is wanted, define it in the PRD first.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`, `docs/design/access/personas.md`, `docs/reports/alignment-report.md`
- **Owner.** design (UI); product owner if a daily check is still wanted. **Blocks.** 2. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Edit only the lower documents, with no PRD, policy or DEC change.
1. docs/design/ui/ui-blueprint.html: remove the W('Daily stock comparison', ...) page from module 09, or fold it into 'Old POS daily import' (Sales · Returns · SOH, checking and reports only, never moves stock, PRD-LIF-014).
2. In the same file, rename the P-OPS menu entry 'Daily comparison · EBO uploads' and the Operations grid cell 'O|Comparison' to match whatever the page becomes (for example 'Old POS imports' and 'View').
3. In the same file, make sure the 'Reconcile' step on Setup > Opening and cutover states count versus the old POS's last SOH, citing PRD-LIF-027 and the stage 4 switch.
4. docs/design/access/personas.md line 84: change "daily comparison" to the same wording as the P-OPS menu entry.
5. docs/reports/alignment-report.md section 4.14: retitle it (for example "Old POS evidence and switch reconciliation") and drop "Blocks: 2, the parallel-run comparison". Optionally state that nothing remains OPEN there.
6. Do not specify what the page displays beyond the PRD wording. If a daily SOH check is wanted, record it as a product owner decision (DEC plus PRD) first.

### N-17 · clash · Blueprint Stock Count tab order puts 'Reconcile tills' before 'Stop billing'

- `docs/design/ui/ui-blueprint.html` (module 06, Full store count): "W('Full store count', 'Reconcile tills · Stop billing · Scope · Count · Differences · Approve · Resume', 'Policy 2')"
- `docs/prd.md` (PRD-STK-008): "For a full Store count, stop selling, reconcile tills, establish and freeze the count scope, count/scan, review differences and authorise adjustments before resuming selling."

- **What disagrees.** PRD and stock ledger put 'stop selling' first; the blueprint reverses the first two steps, so tills would be reconciled while billing is open.
- **Higher rule.** PRD-STK-008
- **Fix.** Reorder tabs to Stop billing, Reconcile tills, Scope, Count, Differences, Approve, Resume.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`
- **Owner.** design (UI). **Blocks.** 3. **Needs a product-owner decision.** no.
- **Sceptic notes.** Reorder tabs to Stop billing · Reconcile tills · Scope · Count · Differences · Approve · Resume (as proposed).

### N-20 · clash · SL-10 declares no-bill, unlinked EBO and earlier-POS-bill returns unavailable, clashing with PRD-RET-017, PRD-EBO-005 and POL-07.05 to 07.08; phases stage 4 does not carry it

- `docs/design/stock/stock-ledger.md` (section 12, SL-10): "A customer return with no sale in the app to take its cost from: an EBO return not linked to its imported sale, a return of an earlier-POS bill after the switch, a no-bill return (`PRD-RET-017`), and a return at a Store in another book or legal entity. ... Such returns stay unavailable until then"
- `docs/prd.md` (PRD-RET-017; PRD-EBO-005): "Keep no-bill returns unavailable without their explicit eligibility, valuation, permission and tender policy. / Apply approved sales/returns to the operational stock, cash, incentives and reporting records once"
- `docs/kdps-policies.md` (POL-07.08; POL-06.02): "Each Organisation may enable or disable ordinary no-bill exceptions. Keep them unavailable until eligibility, valuation and approval limits are configured. / KDPS’s ordinary apparel and footwear return window is 15 days from customer handover."
- `docs/phases.md` (Stage 4 Exit checks and Testing and switch-over): "Organisation return policy and authorised Store override apply correctly; original paid caps, current replacement price, refund state and physical disposition stay separate."

- **What disagrees.** PRD-RET-017 and POL-07.08 make no-bill returns available once configured; PRD-EBO-005 applies approved EBO returns to stock. SL-10 makes three types unavailable by design. For 15 days after each switch old-POS-bill returns would be blocked, yet phases stage 4 scope, exits, go/no-go and switch steps never mention it or its owner. The report lists SL-10 only as a plan/data question.
- **Higher rule.** PRD-RET-017, PRD-EBO-005, PRD-LIF-010, POL-06.02, POL-07.05 to POL-07.08
- **Fix.** Reword SL-10 to say these returns cannot take cost from an in-app sale until the product owner decides how, and that the cited PRD/policy rules are unmet until then. Add the clash to the report; add SL-10 to phases stage 4 as a named dependency with owner; decide how earlier-POS-bill returns are handled for 15 days after a switch.
- **Files to edit.** `docs/design/stock/stock-ledger.md`, `docs/reports/alignment-report.md`, `docs/phases.md`
- **Owner.** product owner. **Blocks.** 4. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the fix, with two changes. First, reword the severity and text so the real clashes are the unlinked-EBO and earlier-POS-bill returns, against PRD-EBO-005 and POL-06.02. Treat the no-bill return as a dependency: it stays unavailable under POL-07.08 until a cost source exists, which is consistent with the policy. Second, add SL-10 to phases.md Stage 4 and to the switch-over rules, with the product owner as owner. Tell the product owner to decide how earlier-POS-bill returns are handled for 15 days after each Store's switch. Possible options are a decision record allowing a return with a documented cost, or a stated exception to POL-06.02. Do not leave it as a silent block. Also add it to alignment-report.md as a clash or open item blocking stage 4. / Keep the edits to the lower documents only, and invent no values. (1) docs/phases.md stage 4: add SL-10 as a named open dependency, "OPEN, product owner, blocks stage 4". Cover EBO returns not linked to an imported sale, earlier-POS-bill returns after a switch, and returns at a Store in another book or legal entity. Add a go/no-go or switch-step line saying the handling of earlier-POS-bill returns during the return window after each switch must be decided before the first switch. Do not name the window length here. Cite POL-06.02 and PRD-LIF-015 for it. (2) docs/design/stock/stock-ledger.md SL-10: keep the entry as an OPEN item. Optionally add one sentence that until it is decided these returns are unavailable, and that the approved rules PRD-EBO-005 and POL-06.02 are not met for them. Leave the no-bill part tied to POL-07.08 and PRD-RET-017, since that part is already consistent. (3) docs/reports/alignment-report.md: add the post-switch earlier-POS-bill return gap as an open question and not as a PRD clash. The report decides nothing. (4) Do not decide how earlier-POS-bill returns are handled in any document. That is a product-owner decision. Any outcome that changes PRD-LIF-010 or PRD-LIF-015, or the policies, needs a DEC entry in docs/decisions.md first. The wording in docs/questions-for-kdps.md should only ask the question. The decision stays with the product owner.

### N-21 · clash · deployment.md section 6 settles how the local helper and Tally gateway reach the server; DEC-027 and the alignment report still call it OPEN

- `docs/decisions.md` (DEC-027 Choice): "Still OPEN for the product owner: hosting for the KDPS parallel run and production; file storage provider; how the in-store local helper and the Tally local gateway reach the server."
- `docs/reports/alignment-report.md` (4.15 Still OPEN): "how the in-store local helper (PRD stack, Hardware) and the Tally local gateway (`PRD-INT-009`) reach the server"
- `docs/design/platform/deployment.md` (section 6): "**The server never connects into a Store or office.** Everything there connects outwards, or stays on the local machine. ... Tally connector (stage 5). ... It fetches pending vouchers from the server over HTTPS."
- `docs/design/platform/deployment.md` (section 10): "D-1 ... D-5 (no entry for helper or Tally connector reachability)"

- **What disagrees.** The design states one topology as settled, citing '(Stack: Hardware)' for the helper claim, while the decision log and report list it as an open product-owner question. D-1 to D-5 omit it, no DEC records it, 'Tally connector' is not the PRD term ('local gateway'), and PRD-INT-009's file-export fallback is not mentioned. The report is stale if the design is accepted.
- **Higher rule.** AGENTS.md 'A business decision is never settled in design'; DEC-027; PRD-INT-009
- **Fix.** Either the product owner logs a DEC accepting section 6, then updates DEC-027 follow-up, report 4.15 and gaps-before-code; or section 6 is marked proposed and added as D-6 (owner product owner; stage 4 helper, stage 5 Tally). Use 'local gateway'; mention the file-export fallback; remove the '(Stack: Hardware)' citation.
- **Files to edit.** `docs/design/platform/deployment.md`, `docs/decisions.md`, `docs/reports/alignment-report.md`
- **Owner.** product owner. **Blocks.** 4 (counter helper); 5 (Tally connector). **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the finding, but trim the file list. docs/reports/gaps-before-code.md never mentions this question, so there is nothing to update there. Add no invented values. The fix has two paths. (a) If the product owner accepts the topology, they log a new DEC. After that, edit DEC-027's "Still OPEN" sentence and alignment-report 4.15 to say it is settled. Fix the "Stack: Hardware" citation in deployment.md section 6 to avoid implying the PRD says "no server link". Use the PRD's term "local gateway". Mention the PRD-INT-009 file-export fallback. (b) Until then, edit only deployment.md. Mark section 6 as a proposal pending the product owner's decision. Add D-6 to section 10 with the question "How the local helper and the Tally local gateway reach the server", the owner as the product owner, and the needed-by stage as 4 for the helper and 5 for Tally. Do not edit the PRD, the policies, DEC-027 or the report on this path.

### N-22 · clash · EBO brand-settlement statements are staged 2/4 in the blueprint but policy 12 puts settlement at stage 5; phases does not stage PRD-EBO-009

- `docs/design/ui/ui-blueprint.html` (module 09 'External sales'): "stage: 'Stages 2, 4' … L('Brand settlement statements')"
- `docs/prd.md` (Required policy configuration, Franchise/partner row): "including EBO brand commission and settlement basis | Owner, Accounts | 5"
- `docs/prd.md` (PRD-EBO-009): "Produce EBO brand-settlement statements and the configured commission/partner basis."
- `docs/reports/alignment-report.md` (3, B-5): "4 (report timing); 5 (settlement)"

- **What disagrees.** Phases stage 4 lists EBO imports only and stage 5 lists Franchise and partner accounts without EBO settlement, so PRD-EBO-009 has no stated stage; the blueprint implies stage 4 and shows no Policy 12 tag.
- **Higher rule.** PRD Required policy configuration (policy 12 by stage 5); POL-12.06
- **Fix.** Add 'EBO brand-settlement statements (PRD-EBO-009)' to phases stage 5; tag the blueprint page 'Stage 5' with 'Policy 12'; add the EBO settlement basis (V-56) to the open items.
- **Files to edit.** `docs/phases.md`, `docs/design/ui/ui-blueprint.html`
- **Owner.** product owner. **Blocks.** 5. **Needs a product-owner decision.** no.
- **Sceptic notes.** Add 'EBO brand-settlement statements (PRD-EBO-009)' to the phases.md stage 5 scope, and add 'EBO commission and settlement basis (policy 12)' to the stage 5 policies line. In ui-blueprint.html, change the page to L('Brand settlement statements', 'Statements · Basis · Differences', 'Policy 12') and add a stage-5 note on that page. Pages take one third-argument tag, so either use D('Stage 5') or extend the module stage to 'Stages 2, 4, 5'. Skip adding V-56 to the open items, since the alignment report and questions-for-kdps.md already carry it. / 1) docs/phases.md: add 'EBO brand-settlement statements and the configured commission/partner basis (PRD-EBO-009)' to the stage 5 in-scope list, next to 'Franchise and partner accounts'. Add Franchise/partner (policy 12) to stage 5's policies needed before live use, if that section lists them. Add a short note in stage 4 that EBO settlement statements wait for stage 5. 2) docs/design/ui/ui-blueprint.html: add the 'Policy 12' tag to the L('Brand settlement statements') page. Show that this page is stage 5, for example by setting module 09's stage to 'Stages 2, 4, 5' or marking the page. Keep the module's other pages at 2 and 4. Optionally add a blueprint G(...) gap entry, 'EBO commission and settlement basis', source 'KDPS · policy 12', 'Blocks: stage 5'. 3) Drop the proposed addition of V-56 to the open items. It already exists in the alignment report and the questions document. Do not edit the PRD or the policies.

### N-23 · clash · phases.md stage 6 lets incentives use the old-POS import, which PRD-LIF-014 limits to checking and reports

- `docs/phases.md` (Stage 6, 'Order inside the stage'): "Incentives need sales evidence, from the parallel-run import or from stage 4."
- `docs/prd.md` (PRD-LIF-014): "Parallel-run imports are evidence for checking and reports only. They never create, reduce or move stock."
- `docs/prd.md` (PRD-HRM-011): "Use both POS and approved EBO evidence; retain salesperson attribution, return reversals and calculation-policy versions."

- **What disagrees.** Paying incentives is a money effect, neither checking nor reporting. PRD-HRM-011 names only POS and approved EBO evidence, and PRD-LIF-010 limits historical sales to reports. Phases itself says 'checking and reports only' in stage 2.
- **Higher rule.** PRD-LIF-014, PRD-LIF-010, PRD-HRM-011
- **Fix.** Change the line to 'Incentives need sales evidence from stage 4 bills or approved EBO imports (PRD-HRM-011).' If the owner wants old-POS data to feed incentives, raise a PRD change through a DEC first.
- **Files to edit.** `docs/phases.md`
- **Owner.** product owner. **Blocks.** 6. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the proposed edit to docs/phases.md only: change line 201 to "Incentives need sales evidence from stage 4 bills or approved EBO imports (PRD-HRM-011)." Optionally cite PRD-LIF-014 ("the old-POS import is not incentive evidence"). Treat the owner decision as only needed if the owner wants old-POS data to feed incentives, and in that case log a DEC before any PRD edit. Otherwise no DEC is needed.

### N-24 · clash · PRD-LED-011 still hard-codes Tally as the official book after DEC-010 moved that choice to the Official book policy

- `docs/prd.md` (Words used, Tally): "TallyPrime, an external accounting book. Whether it is the official book is set by the Official book policy"
- `docs/prd.md` (PRD-LED-011): "Tally remains the official book until an authorised accounting-book transition. Keep the internal ledger and external book reconciled."
- `docs/prd.md` (Required policy configuration, row 'Official book'): "Authority and reconciliation evidence for moving the official book from Tally"
- `docs/decisions.md` (DEC-010 Changed): "`POL-11.01` already makes Tally KDPS's sole official book."

- **What disagrees.** The PRD contradicts its own Words used entry. DEC-010's aim of removing KDPS values from the PRD is only partly done. (Distinct from C-08, which is about the blueprint ledger page.)
- **Higher rule.** PRD internal consistency; DEC-010 customer-neutral layering; POL-11.01
- **Fix.** Product owner logs a decision and rewords PRD-LED-011 ('The official book is the one named by the Official book policy until an authorised transition...') and the policy row likewise.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the owner-decision route. Log a new DEC, for example "PRD-LED-011 and the Official book row follow DEC-010". Once approved, reword PRD-LED-011 to "The official book is the one the Official book policy names, until an authorised accounting-book transition. Keep the internal ledger and external book reconciled." Reword the policy row to "Authority and reconciliation evidence for moving the official book to another book". Leave POL-11.01 to POL-11.03 unchanged, and leave PRD-LED-012, PRD-INT-008 and the line-68 context untouched. Optionally note in the DEC that alignment-report A-4 ("no open clash remains") was premature.

### N-25 · clash · AGENTS.md says Railway hosts 'everything'; the PRD and DEC-028 list five items and file storage is still OPEN

- `AGENTS.md` (Stack table, Hosting row): "Test, including KDPS's side-by-side test: Railway for everything. Production chosen before the first Store switch"
- `docs/prd.md` (Technical platform > Stack, Hosting row): "Railway for the server, jobs, PostgreSQL, web app and counter PWA. Production hosting is chosen before the first Store switch"
- `docs/design/platform/deployment.md` (section 2 table; D-2): "| `forecast` | Python forecasting service. Added in stage 6 | ... File storage ... **OPEN:** provider ... A Railway bucket fits DEC-028"

- **What disagrees.** AGENTS.md widens the PRD's five items to 'everything' (file storage, forecast service, local Store/office parts). deployment.md lists a Railway forecast service and says a bucket 'fits DEC-028' though neither is in the PRD or DEC-028, and D-2 leaves the provider open. Report 4.15 repeats 'Everything runs on Railway'.
- **Higher rule.** PRD Stack > Hosting row; DEC-027; DEC-028
- **Fix.** Copy the PRD wording into the AGENTS.md Hosting row and note file storage provider OPEN (deployment.md D-2). Mark the forecast service as proposed (stage 6, needs a PRD hosting decision) and reword D-2 and report 4.15.
- **Files to edit.** `AGENTS.md`, `docs/design/platform/deployment.md`, `docs/reports/alignment-report.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the two substantive edits and treat the third as optional. (1) AGENTS.md Hosting row: copy the PRD wording ("Railway for the server, jobs, PostgreSQL, web app and counter PWA") and add that the file storage provider is OPEN for the product owner (deployment.md D-2). (2) deployment.md: mark the `forecast` row as proposed, with its hosting not yet in the PRD. In D-2, change "A Railway bucket fits DEC-028" to a suggestion only, for example "A Railway bucket is one option; DEC-028 does not cover file storage". Do not add a PRD change or a new value. (3) docs/reports/alignment-report.md 4.15 is optional. It is a one-time report that decides nothing, and its sentence "Everything runs on Railway for testing" already paraphrases DEC-028, which lists the five items. If it is edited, change that sentence to list the five items. Severity is better described as a wording drift than a hard clash.

### N-26 · clash · Persona cards say Operations approves write-offs and the Brand manager approves offers; policies say they propose; cards also omit policy-2 approvals

- `docs/design/access/personas.md` (P-OPS and P-BRM cards): "P-OPS: 'Approvals in this work: transfers, count differences, supplier-return steps, stock adjustments and write-offs.' P-BRM: 'Approvals in this work: offers and price changes for assigned brands.'"
- `docs/kdps-policies.md` (POL-17.10; POL-19.05): "Operations proposes write-off or disposal; an independent approver acts within configured cost limits, with Accounts reviewing value. / A Brand manager proposes promotion cost shares from the applicable brand agreement; an authorised approver approves them before activation."
- `docs/kdps-policies.md` (POL-02.21; POL-02.13): "A Store Manager may approve count differences only within configured cost limits. / A Store Manager may approve within a configured limit; Accounts approves above it."
- `docs/design/access/personas.md` (P-STM and P-ACC cards): "Approvals in this work: discounts and returns within the configured limit, and the Store's day close. / ... supplier payments and supplier bank-detail changes, discrepancy settlements, refunds routed to finance."

- **What disagrees.** The cards present P-OPS and P-BRM as approvers though policy makes them proposers; P-ADM, P-BKG, P-WHS and P-HRS use 'prepares', so they are inconsistent with their own convention. P-STM omits count differences within limit and refused offline bills; P-ACC omits day-close differences above the Store Manager limit and the buying-budget check (POL-05.09).
- **Higher rule.** POL-17.10, POL-19.03, POL-19.05, POL-02.07, POL-02.13, POL-02.21, POL-05.09; PRD-ACS-003
- **Fix.** Reword P-OPS to 'proposes write-offs and disposals; approves transfers, count differences within limit and supplier-return steps' and P-BRM to 'proposes offers, cost shares and price changes; approval by an authorised approver under policies 19 and 2'. Add the missing approvals to P-STM and P-ACC; keep 'limits come from policy 2'.
- **Files to edit.** `docs/design/access/personas.md`, `docs/design/ui/ui-blueprint.html`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Reword P-OPS to "proposes write-offs and disposals; approves transfers, supplier-return steps and stock adjustments, and count differences escalated above the Store Manager limit as the higher authorised approver, as configured under policy 2". Reword P-BRM to "proposes offers, promotion cost shares and price changes; approval by an authorised approver under policies 19 and 2". Add count differences within limit to P-STM. Add day-close differences above the Store Manager limit and the buying-budget check (POL-05.09) to P-ACC. Keep the "limits come from policy 2" line. Edit docs/design/access/personas.md. Edit ui-blueprint.html only if its P-OPS "Approve differences" label or its approval matrix conflicts after the change. / Edit only docs/design/access/personas.md. Leave ui-blueprint.html unchanged. P-OPS: "Approvals in this work: proposes write-offs and disposals for independent approval (policy 17). Transfers, supplier-return steps and stock adjustments: approved by an authorised person other than the preparer. Count differences above the Store Manager limit go to a higher authorised approver named in policy 2." Do not name Operations as the approver of count differences or give it a limit. P-BRM: "Approvals in this work: proposes offers, promotion cost shares and price changes; an authorised approver approves them (policies 19 and 2)." P-STM: add "count differences within the configured cost limit (POL-02.21)", and, if the PRD supports it, offline-bill handling. P-ACC: add "day-close cash differences above the Store Manager limit (POL-02.13)", plus "checks the buying budget (POL-05.09)" worded as a check, not an approval. Keep the line "limits come from policy 2". Cite the POL IDs next to each changed card, as AGENTS.md requires. No DEC is needed, because only a design document changes and no values are invented.

### N-27 · clash · Business measure 'Stock-count accuracy' treats differences within tolerance as matches; PRD-STK-012 says tolerance only selects the approver

- `docs/prd.md` (Business measures, Stock-count accuracy): "Pieces matching the system at a count ÷ pieces counted, within the configured tolerance for each operating unit"
- `docs/prd.md` (PRD-STK-012): "The configured count tolerance only selects the approver ... No difference is adjusted automatically."
- `docs/decisions.md` (DEC-008 Choice): "It picks the approver only. Every difference is recorded, explained and approved"

- **What disagrees.** The measure makes tolerance an accuracy band; DEC-008 and PRD-STK-012 give it one job. DEC-008 did not revisit the measure.
- **Higher rule.** PRD-STK-012; DEC-008
- **Fix.** Reword the measure to count pieces equal to the system quantity (differences listed by approver tier), or add a decision that a tolerance may define 'matching' for reporting only.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.

### N-28 · clash · PRD-NAV-016 still says the net-profit definition governs the Store P&L; DEC-011 added PRD-NAV-017 without amending it

- `docs/prd.md` (PRD-NAV-014 and PRD-NAV-016): "Minus applicable income-tax expense = Net profit ... These definitions govern the monthly Store net-asset-value snapshots and the Store P&L."
- `docs/prd.md` (PRD-NAV-017): "End the Store P&L and brand-by-store profit at profit before tax. Show income-tax expense and net profit only for a legal entity."
- `docs/decisions.md` (DEC-011 Changed): "New `PRD-NAV-017`"

- **What disagrees.** NAV-016 is unchanged, so the PRD says net-profit steps govern the Store P&L while NAV-017 stops it at profit before tax.
- **Higher rule.** PRD internal consistency (PRD-NAV-017 is the decided rule)
- **Fix.** Amend PRD-NAV-016 to 'These definitions govern the monthly Store NAV snapshots; the Store P&L follows PRD-NAV-017', logged in DEC-011 or a new entry.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** 5. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the direction, but follow the AGENTS.md sequence, which says changes to the PRD are logged in docs/decisions.md first and the PRD text belongs to the user. (1) Propose a decision-log entry and wait for the product owner to approve it. Either add a "Changed" line to DEC-011 or add a short new DEC. It should cite PRD-NAV-016 as amended, say it is a consistency fix following DEC-011, and decide no new business rule. (2) Then edit only the PRD-NAV-016 sentence to: "These definitions govern the monthly Store net-asset-value snapshots; the Store P&L follows PRD-NAV-017." Leave PRD-NAV-014 and the net-profit example untouched, since they still apply to a legal entity. Do not reword other PRD rules. No other file needs editing. The references to PRD-NAV-016 in stock-ledger.md and questions-for-kdps.md concern Store value and NAV snapshots, so they stay correct. Severity "clash" and blocks_stage 5 are reasonable. The owner has already settled the substance in DEC-011, so only approval of the wording entry is needed.

### N-30 · clash · Daily-summary channel: POL-02.11 and personas.md call it unconfigured/policy 2 while POL-02.14 (DEC-021) sets WhatsApp; the PRD row dropped 'channels' without a log entry

- `docs/kdps-policies.md` (POL-02.11): "daily-summary recipients and channel; and any remaining per-user authority remain unconfigured"
- `docs/kdps-policies.md` (POL-02.14): "Send KDPS's daily summary at 9 PM via WhatsApp to selected recipients. Recipient names remain unconfigured."
- `docs/design/access/personas.md` (section 3, last bullet): "Who receives them, and through which channel, are policy 2 values."
- `docs/prd.md` (Required policy configuration, row 'Permissions and approvals'): "daily summary time and recipients; material-change reapproval"
- `docs/decisions.md` (DEC-010 Changed): "Policy table, Permissions row: "9 PM summary recipients/channels" → "daily summary time, recipients and channels"."

- **What disagrees.** DEC-021 and POL-02.14 settle the channel; POL-02.11 and personas.md still treat it as open. DEC-010 said the PRD row would contain 'channels' but it does not, and no entry logs the removal. Only recipients are open (Owner question 30, V-51).
- **Higher rule.** PRD row text > kdps-policies.md > design; AGENTS.md (PRD edits logged first)
- **Fix.** Log the removal of 'channels' from the PRD row (amend DEC-021 or add an entry). Remove 'and channel' from POL-02.11. Reword personas.md to 'Recipients are a policy 2 value; channel and time are set (POL-02.14)'.
- **Files to edit.** `docs/decisions.md`, `docs/kdps-policies.md`, `docs/design/access/personas.md`, `docs/prd.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Add a new DEC entry rather than amending DEC-021, because DEC-029 leaves DEC-017 to DEC-022 as written. It should record that the PRD Permissions row dropped "channels" because PRD-EXC-012 and POL-02.14 fix the channel as WhatsApp, and that only recipients stay open. Then remove "and channel" from POL-02.11. Reword personas.md section 3 to "Recipients are a policy 2 value; channel and time are set (POL-02.14)". Leave docs/prd.md unchanged. This is a policy and design alignment that needs no new product-owner decision beyond logging it.

### N-31 · clash · Stock ledger says a Store on the earlier POS holds no stock in the app, citing DEC-030; phases, SL-9 and ledger section 9 treat it as holding test stock

- `docs/design/stock/stock-ledger.md` (section 5 'Where piece rules are off', first bullet): "A Store still selling through an earlier POS holds no stock in the app (DEC-030)."
- `docs/design/stock/stock-ledger.md` (section 9 and SL-9): "Test bills on the test setup move test stock in the test database only. / ... how goods move between a Site on the app and a Store not yet switched; direct deliveries to such a Store (`PRD-REC-004`)."
- `docs/phases.md` (Testing and switch-over, 'Side-by-side test' row): "Test the app: goods-in, transfers and test bills."
- `docs/decisions.md` (DEC-030 Choice): "They never create, reduce or move app stock."

- **What disagrees.** DEC-030 says the old POS's files never move app stock; it does not say the Store holds no stock in the app. Goods-in and transfers are tested there and PRD-REC-004 allows direct receipt.
- **Higher rule.** DEC-030; PRD-LIF-014, PRD-LIF-027; PRD-REC-004
- **Fix.** Reword section 5 to what DEC-030 supports (the earlier POS's files create, reduce and move no stock in the app; piece rules at that Store start at its switch count, PRD-MER-017) and point to SL-9 for goods the app receives or moves there.
- **Files to edit.** `docs/design/stock/stock-ledger.md`
- **Owner.** product owner (SL-9). **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Edit only docs/design/stock/stock-ledger.md section 5, first bullet. Reword it to what DEC-030 and the PRD support. For example, "A Store still selling through an earlier POS has its files kept out of app stock (DEC-030, PRD-LIF-014). It has no real opening stock until its switch count (PRD-LIF-027, POL-14.07). Its piece rules start at that count, where every piece without an ID is labelled and every piece ID is verified (PRD-MER-017, PRD-LIF-025). How goods the app receives or moves there before the switch are held is open (SL-9)." Do not state outright that the Store holds no stock in the app. Do not edit the PRD, policies or decisions.

### N-32 · clash · Ledger says valued movements feed the internal ledger in stage 5 and omits monetary records from the commit list; PRD and phases record money effects from stage 2

- `docs/design/stock/stock-ledger.md` (section 7.11 and 10.2): "Tally remains KDPS's official book (`POL-11.01`). The ledger's values feed the internal ledger and the Tally exchange in stage 5. / Number allocation, movements, balance rows, pool rows, approval evidence, audit and outbox commit together, or none of them do (`PRD-INT-004`)."
- `docs/prd.md` (PRD-STG-002; PRD-INT-004; PRD-MOD-013): "Commit number allocation, stock, monetary records, approval evidence, audit and outbox together or commit none."

- **What disagrees.** Section 7.11 reads as if values reach a ledger only in stage 5, while stage 5 only adds the Tally exchange and full accounting. Section 10.2 drops 'monetary records' and never says how PRD-INT-004 / PRD-MOD-013 (balanced journals per book at commit) are met.
- **Higher rule.** PRD-STG-002, PRD-INT-004, PRD-MOD-006, PRD-MOD-013; POL-09.12
- **Fix.** Reword 7.11: valued movements go to the internal ledger from the first stage that records them; only the Tally exchange waits for stage 5. State in 10.2 which monetary records commit with the movement and which follow through the outbox (citing POL-09.12); settle the detail in the financial posting design (GC-4).
- **Files to edit.** `docs/design/stock/stock-ledger.md`
- **Owner.** product owner (design); Accounts/CA for posting. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the proposed fix. When editing docs/design/stock/stock-ledger.md, do three things. (1) In 7.11, say valued movements reach the internal ledger from the first stage that records them (`PRD-STG-002`), and only the Tally exchange and full accounting wait for stage 5. (2) In 10.2, restore "monetary records" to the commit list, as in `PRD-INT-004`. (3) Say that the valued movement and its balance and pool rows commit with the movement. Say the journals follow through the outbox under the posting maps (`PRD-MOD-006`, `POL-09.12`), and mark how `PRD-MOD-013` (balanced journals per book) is met as OPEN, under GC-4. Do not name accounts or posting rules. Do not edit docs/prd.md or docs/kdps-policies.md.

### N-34 · clash · Design-language state colours and glyphs contradict the family rules (Stale chip, My work Overdue pill, stepper Done, trust chip glyphs)

- `docs/design/ui/design-language.md` (§7 row 33 vs §10.4): "| 33 | Stale | Attention | ! | Trust chip, sync | vs | Stale | ! `--d-fg` | “as of 22 Sep 2026, 18:00 · **stale**”"
- `docs/design/ui/design-language.md` (§10.4 Trust chip): "| Complete | ● `--s-fg` | ... | Partial | ◆ `--w-fg` | ..."
- `docs/design/ui/design-language.md` (§7 row 29 vs §10.5): "| 29 | Overdue | Attention | ! | ... | vs | Overdue | `--danger` / `--on-danger`, “n overdue” |"
- `docs/design/ui/design-language.md` (§1 principle 2 vs §10.8 Stepper): "**Navy means action, never state.** ... | Done | `--accent` fill, ✓ | connector `--accent` |"

- **What disagrees.** Stale is amber in §7 but red in §10.4; Done and Partial use ● and ◆ against §7 (✓; ◆ reserved for Quarantine). Overdue is Attention but the My work pill uses --danger, which §2 limits to destructive buttons. Stepper Done uses navy accent although Done is green. design-system.html repeats the overdue and stepper treatment.
- **Higher rule.** design-language.md §1.2-1.3, §2, §7
- **Fix.** Use §7 family tokens and glyphs in §10.4, §10.5 and §10.8 (Stale --w-fg !, Complete ✓, Partial Attention glyph, Overdue --w-*, Done --s-*; keep Current as accent ring). Align design-system.html.
- **Files to edit.** `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`
- **Owner.** design owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.

### N-35 · clash · Short, Excess, Damaged, Wrong and Unidentified listed as record statuses although the rule says they are line chips and PRD says conditions coexist

- `docs/design/ui/design-language.md` (§7 rows 27-28, 43-45): "| 27 | Short | Attention | ! | Delivery, transfer dispatch | ... | 28 | Excess | Attention | ! | Delivery |"
- `docs/design/ui/design-language.md` (§7 Rules): "A record shows **one** status badge: its lifecycle state. Line-level conditions (short, damaged…) appear as chips in the line’s Disposition cell."
- `docs/prd.md` (PRD-REC-006): "Record shortage, excess, wrong, unidentified and damage observations separately; conditions can coexist."

- **What disagrees.** The table gives Delivery the badges Short and Excess, so a delivery with both cannot show one badge. design-system.html shows DLV-0408 with status 'Short' and the exception drawer shows 'Short' as an Exception's header badge though Exception states are Closed, Overdue, Resolved, Reopened.
- **Higher rule.** PRD-REC-006; design-language.md §7 rules
- **Fix.** Remove Short and Excess as record statuses; show them only as line chips and counts beside the lifecycle badge. Update the design-system sample rows and exception drawer.
- **Files to edit.** `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`
- **Owner.** design owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Remove rows 27 (Short) and 28 (Excess) from design-language.md §7, including the "transfer dispatch" use. Add a note that short and excess appear only as line chips and counts beside the lifecycle badge (PRD-REC-006). Mirror this in the design-system.html status-table array. Change the DLV-0408 sample row to an existing lifecycle state plus a line count. Change the EXC-2291 drawer header badge to a defined Exception state (Resolved, Overdue or Reopened). Keep the line-level 'Short n' chips. Do not edit prd.md or kdps-policies.md.

### N-36 · clash · 'Blank means unknown' and 'percent integer or 1 decimal' conflict with the till's exact-cash field and the 2-decimal MARGIN

- `docs/design/ui/design-language.md` (§1 principle 4 and §6B): "Blank means unknown and 0 means known zero (§8). | Left empty, Cash received means exact cash; 0 means zero."
- `docs/prd.md` (PRD-MOD-016): "Resolve the exact-cash UI shorthand into its declared cash amount before persistence; it is not the general meaning of a missing monetary value."
- `docs/design/ui/design-language.md` (§8 Percent vs §10.10): "| Percent | integer or 1 decimal | 96% · 50.0% | ... | MARGIN = (MRP − P RATE) ÷ MRP × 100, rounded half-up to 2 decimals."
- `docs/prd.md` (PRD-PTW-011): "Display ticket MARGIN as (MRP − P RATE) ÷ MRP × 100, rounded half-up to two decimal places"

- **What disagrees.** §8 gives one blank rule and one percent rule with no exceptions, but the till uses blank for exact cash (PRD-POS-007, PRD-MOD-016) and MARGIN needs 2 decimals.
- **Higher rule.** PRD-POS-007, PRD-MOD-015, PRD-MOD-016, PRD-PTW-011
- **Fix.** Add to §8 the exact-cash exception (stored as the declared cash amount, citing PRD-POS-007/PRD-MOD-016) and 'PT MARGIN always shows 2 decimals (PRD-PTW-011)'.
- **Files to edit.** `docs/design/ui/design-language.md`
- **Owner.** design owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** The proposed fix is sound and needs no change to the files to edit. I would make two small adjustments. Put the exact-cash exception where the generic rule is stated, in the §8 Unknown row, and add a short pointer in §1 principle 4. Word it as: "Exception: the till's Cash received field, where blank is a UI shorthand resolved to the declared cash amount before saving (PRD-POS-007, PRD-MOD-016). 0 still means zero." Add the MARGIN note to the §8 Percent row as: "Ticket MARGIN always shows 2 decimals (PRD-PTW-011)." / Keep the fix, with two refinements. (1) Frame the exact-cash rule as an input-field shorthand, not a display of unknown. Add a note to the §8 "Unknown" row, or to §1 principle 4, such as "Exception: the till's Cash received field. Left empty it means exact cash and is resolved to the declared cash amount before it is saved (PRD-POS-007, PRD-MOD-016). It is not an unknown." (2) In the §8 Percent row, add "except ticket MARGIN, which always shows 2 decimals (PRD-PTW-011)". Edit only docs/design/ui/design-language.md. No DEC is needed.

### N-37 · clash · Offline till keeps F7 Manager approval live although actions needing fresh approval require online authority; no expired-working-set state

- `docs/prd.md` (PRD-OFF-016): "Refunds, store-credit redemption, transfers, supplier/bank payment execution and actions needing fresh approval require online authority."
- `docs/kdps-policies.md` (POL-16.03): "Refunds and returns/exchanges require online authority; store-credit redemption and actions requiring fresh approval also require online authority."
- `docs/design/ui/design-language.md` (§6B Function bar and Manager approval): "F6 Return (online only) · F7 Manager approval ... **Manager approval (F7):** for a discount or price change above the cashier's limit."
- `docs/design/ui/design-system.html` (fkeys (4B)): "['F6', noNet ? 'Return · online only' : 'Return', noNet], ['F7', 'Manager approval']"
- `docs/design/ui/design-language.md` (§6B Device trouble): "a full storage, a wrong clock, a second open tab or an app update stops new bills on that device with a banner that says why."

- **What disagrees.** Only F6 is greyed offline; F7 stays live. The offline status pill covers authority expiry only, with no state for an expired working set (PRD-OFF-004). The design chooses which device troubles stop billing, though PRD-OFF-019 only says to handle them without losing a finalised bill.
- **Higher rule.** PRD-OFF-004, PRD-OFF-016, PRD-OFF-018, PRD-OFF-019; POL-16.03
- **Fix.** Mark F7 online-only offline in §6B and the design-system till; state an offline bill needing approval above the cashier limit cannot be finalised. Add a 'Working set expired' blocked state. Reword the device-trouble rule unless the offline design/PRD sets which troubles block billing.
- **Files to edit.** `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`
- **Owner.** design owner; product owner for which device troubles block billing. **Blocks.** 4. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Split the finding in two. (1) Firm fix: add a "Working set expired" blocked state and pill to design-language.md §6B and the design-system till, mirroring Authority expired, so finalisation is blocked per PRD-OFF-004 and PRD-OFF-018. (2) Product-owner decision: first define whether an offline discount or price override above the cashier limit counts as an "action needing fresh approval" under PRD-OFF-016 and POL-16.03. If it does, grey F7 as "online only" offline in §6B and the design-system.html fkeys, and state that such a bill cannot be finalised offline. If it does not, state the offline manager-approval mechanism explicitly. Reword the Device trouble rule only if the PRD or offline design does not already name which troubles block billing. Downgrade the F7 part from "clash" to "ambiguity needing a decision". / Split the fix. (A) Do now, in docs/design/ui/design-language.md §6B and the design-system.html till (edit via json.loads of the template, then repack): add a "Working set expired" blocked state for the offline counter. Cite PRD-OFF-004. Match the authority-expired pattern: a stopped pill, a red banner saying new bills are blocked while viewing and upload still work, and a disabled "Pay blocked · working set expired" button, cleared after an online refresh. Add it to the tillMode enum and the state table (the row next to "Authority expired" at design-language line 270). Add no validity duration, because PRD-OFF-004 only says "a defined validity time" and no value is set; mark the duration OPEN, owner product owner, blocks stage 4. (B) F7: do not mark it online-only on the design's own authority. First raise the question against PRD-OFF-016 and POL-16.03, to be answered by the product owner and logged as a DEC or in docs/questions-for-kdps.md: does an above-limit discount or price-change approval at the offline counter count as an action needing fresh approval, so it requires online authority? Once the PRD or policy says so, update F7 in both design files. If the answer is yes, grey F7 offline as "Manager approval · online only" and state that an offline bill needing approval cannot be finalised. If no, document how the manager is verified offline. (C) Leave the device-trouble sentence alone, or soften it to say which device troubles stop new bills is subject to the offline design. PRD-OFF-019 does not forbid the current wording.

### N-39 · clash · design-system.html and its preview break design-language rules (money decimals, date formats, scope popover width, tokens, focus ring, Hindi, till tile, offline gate sample)

- `docs/design/ui/design-language.md` (§8 Money, Date rows; §10.3): "Money always shows 2 decimals, so the decimal points line up. ... Date and time | DD MMM YYYY, HH:mm (24-hour) | 23 Sep 2026, 10:42 ... **Popover (e3 glass, 340 px):**"
- `docs/design/ui/design-system.html` (kpi/approval values; till status bar; scope popover): "['kpi', 22, 28, 600, '₹3,41,26,000', S] ... 23 Sep 2026 · 11:06 ... width:360px"
- `docs/design/ui/design-system-preview.html` (<style> tokens and header .lang): ".btn:focus{outline:3px solid #9db8e8;outline-offset:2px} ... <span class="chip">English + Hindi</span>"
- `docs/phases.md` (How the stages are cut, last bullet): "Build screens in English first, ready for Hindi ... The Hindi interface and WhatsApp and SMS messaging arrive in stage 5."
- `docs/design/ui/design-system.html` (3.13 policy gate banner): "Policy 16 · Offline operation is not signed yet. Missing: signature, offline tender evidence procedure, registered offline counter for BLR01."
- `docs/kdps-policies.md` (POL-16.02): "The approved offline pilot starts cash-first."
- `docs/design/ui/design-system.html` (TN tenders): "['Customer credit', 'approved']"

- **What disagrees.** The page shows whole-rupee amounts and mixed date/time formats against §8, a 360 px popover against 340 px, a Customer credit tile showing only 'approved' (language: limit and due date; phases: stage 5), and a gate banner that demands a tender evidence procedure the cash-first pilot does not need. The preview claims English + Hindi, uses its own colour/state tokens (info navy as state, #9db8e8 3 px focus ring at about 1.84:1, 11 px table headers, non-§7 state names such as Review needed, Blocked, Pending profile, × glyph, no brand in scope example, no dark theme, 'request access' action).
- **Higher rule.** design-language.md §1.2, §2, §3, §7, §8, §9, §10.3, §10.6; phases.md; POL-16.02; PRD-POS-022
- **Fix.** Fix the page: 2-decimal money (or a stated whole-rupee exception), §8 date formats, 340 px popover, customer-credit sub-label (or hide until stage 5), gate banner listing only cash-pilot needs. Rebuild the preview from §2/§7 tokens and §7 state names, state English-first, or label it illustrative only.
- **Files to edit.** `docs/design/ui/design-system.html`, `docs/design/ui/design-system-preview.html`, `docs/design/ui/design-language.md`
- **Owner.** design. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** The proposed fix is sound. Tighten the scope to what was actually found:
- Fix the KPI sample to 2-decimal money, or to compact Cr/L with 2 decimals (₹3.41 Cr).
- Change the till date to `23 Sep 2026, 11:06`.
- Set the scope popover to 340 px.
- Make the Customer credit sub-label show its limit and due date.
- Make the gate banner list only the cash-pilot needs: signature and registered offline counter for BLR01. Drop the tender evidence procedure per POL-16.02.
- For the preview, use the light-theme accent for the focus ring, use §7 state names, and remove or relabel "English + Hindi" as stage 5. / Edit only docs/design/ui/design-system.html and docs/design/ui/design-system-preview.html. Leave design-language.md, the PRD and the policies unchanged. In design-system.html:
- Make the KPI sample money 2-decimal or compact (₹3.41 Cr).
- Change till-status date-times to "DD MMM YYYY, HH:mm", for example "23 Sep 2026, 11:06".
- Set the scope and column popovers to 340 px.
- Give the Customer credit tender tile a sub-label that names the limit and due date without inventing numbers (for example "limit · due date"), or hide the tile until stage 5.
- Do not change the policy-16 gate banner. If it is touched, reword it so it does not imply the cash-first pilot needs a tender evidence procedure, and invent no new policy content.
In design-system-preview.html:
- Change the focus ring to the §2 light-theme accent (#1f3a68).
- Replace the "English + Hindi" chip with "English first, Hindi in stage 5".
- Align state names with design-language §7.
- Or add a note that the file is illustrative only and design-language.md wins.

### N-40 · clash · Menu names in design-system.html repeat C-10 (not the PRD-UXP-004 Store areas)

- `docs/prd.md` (PRD-UXP-004): "Give Store users Billing, Bills, Till & Sync, Receive Goods, Transfers, Stock, Offers, Money, Reports and staff self-service."
- `docs/design/ui/design-system.html` (navItems, mNav, comboMenu): "['Home'], ['Sell'], ['Receive Goods', 2, true], ['Transfer', 1], ['Stock Count'], ['Damage & supplier returns'], ['Stock'], ['External sales'], ['Money'], ['Offers & price'], ['Reports']"

- **What disagrees.** Extends known C-10 from the blueprint to design-system.html and the combined-menu demo: no Till & Sync or Bills, and Stock Count, Damage and External sales are not in the PRD Store list.
- **Higher rule.** PRD-UXP-004, PRD-UXP-005
- **Fix.** Resolve C-10 once for blueprint and design system together: rename to PRD names or raise a PRD change.
- **Files to edit.** `docs/design/ui/design-system.html`, `docs/design/ui/ui-blueprint.html`
- **Owner.** product owner (names) then design. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep needs_product_owner_decision=true. Resolve the menu names once, across all three design documents: docs/design/access/personas.md, docs/design/ui/design-system.html (navItems, mNav, comboMenu) and docs/design/ui/ui-blueprint.html. Either rename the design menus to the PRD names (Billing, Bills, Till & Sync, Transfers and so on), or have the product owner raise a PRD change with a DEC that says whether PRD-UXP-004 lists capabilities or literal menu labels. If it lists capabilities, record that Sell groups Billing, Bills and Till & Sync, and add Stock Count, Damage and External sales to the list. Do not edit the PRD or policies without that DEC. Do not rename anything in design until the owner rules.

### N-41 · invented-value · POL-18.03 fixes restore-drill timing (before go-live, quarterly) with no PRD or DEC basis

- `docs/kdps-policies.md` (POL-18.03): "Admin conducts a restore drill before go-live, quarterly thereafter, and after major recovery changes."
- `docs/prd.md` (PRD-SEC-012): "Provide reliable backup, restore verification and export recovery for records and attachments, with defined recovery-time and data-loss objectives."
- `docs/questions-for-kdps.md` (Admin section): "Name the restore operator and set the pre-launch restore-test date under `POL-18.03`."

- **What disagrees.** The PRD sets no restore-test frequency and no DEC or KDPS answer supports 'quarterly'; the Admin question still treats the date and operator as unset.
- **Higher rule.** AGENTS.md 'Never invent a value'; PRD row 'Recovery and retention'
- **Fix.** Mark the restore-test frequency OPEN (Owner, Admin) in POL-18.03, or log a DEC naming who agreed 'quarterly'; add it to the Owner or Admin questions.
- **Files to edit.** `docs/kdps-policies.md`, `docs/questions-for-kdps.md`
- **Owner.** KDPS Owner, Admin. **Blocks.** 1. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the fix, with two adjustments. First, in POL-18.03 describe the before-go-live and quarterly cadence as "proposed, to be confirmed by KDPS Owner and Admin". Do not add an OPEN tag, since the repo uses the "proposed" or "provisional" wording instead (POL-18.01 and the "(proposed)" KPI targets). Alternatively, log a DEC that names who agreed "quarterly". Second, add an explicit Owner or Admin question in docs/questions-for-kdps.md that fills POL-18.03 and asks how often a restore is tested and by whom. Also correct the Admin line's pointer to Owner 4 and 5 (logins and bulk approval) so it points at Owner 6 (POL-18.01), plus the new question. / Edit only the lower documents, with no PRD change. In docs/kdps-policies.md POL-18.03, label the cadence as proposed and awaiting KDPS Owner and Admin sign-off, matching how POL-18.01 is worded. For example, "Admin conducts a restore drill before go-live; the recurring cadence (proposed quarterly) and after-change drills are OPEN for Owner and Admin, blocking stage 1." Do not state 'quarterly' as settled. The alternative of logging a DEC is valid only if KDPS actually agreed the cadence, so name who agreed. Do not invent an agreement. In docs/questions-for-kdps.md, add an explicit Admin or Owner question on restore-test frequency, in addition to the operator and pre-launch date. Fix the stale pointer "KDPS Owner 4 and 5", which are the Logins and Bulk-approval questions, so it points at the real restore question. Treat severity as a labelling or provenance gap, not an invented live value, because the whole policy is unsigned and Open.

### N-42 · invented-value · Business-measure text assumes a test run of at least a month ('first month of the test run') while run length is OPEN

- `docs/prd.md` (Business measures intro): "The present value of each measure is recorded during the first month of the test run."
- `docs/phases.md` (Go or no-go pass marks table): "Run length of the side-by-side test | OPEN — KDPS Owner, before test run"
- `docs/questions-for-kdps.md` (KDPS Owner 29): "Set how long the side-by-side test runs."

- **What disagrees.** A fixed 'first month' writes a duration into the PRD before its owner sets it; a shorter run would break the sentence.
- **Higher rule.** AGENTS.md 'Never invent a value'
- **Fix.** Reword to 'during the side-by-side test' (no duration) or record the duration as an OPEN value owned by the KDPS Owner, logged in decisions.md.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`
- **Owner.** KDPS Owner; product owner. **Blocks.** 2. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Edit docs/prd.md line 210 only. Change "during the first month of the test run" to "during the side-by-side test, before any switch" or simply "during the side-by-side test". Do not add a duration, and do not add a new OPEN item to decisions.md. The run length is already OPEN under the KDPS Owner in docs/phases.md line 243 and questions-for-kdps.md item 29. Only the product owner needs to confirm the wording. The KDPS Owner is not needed for this edit. / Log a DEC in docs/decisions.md (date, who decided, question, options, choice, IDs changed), get product-owner approval, then reword docs/prd.md line 210 to "The present value of each measure is recorded at the start of the side-by-side test." (or "during the side-by-side test"). Leave phases.md and questions-for-kdps.md alone. Run length stays OPEN for the KDPS Owner. Do not add a "one month" or similar value.

### N-43 · invented-value · Go/no-go pass marks, 'serious exception', carry-back and PT-export dependency live only in phases.md; POL-14.01 relies on them

- `docs/kdps-policies.md` (POL-14.01): "Switch one Store at a time at a recorded day close, after the side-by-side test's go/no-go checks pass."
- `docs/phases.md` (Testing and switch-over, pass-mark table): "Material-difference threshold per Store, at the switch count | OPEN — KDPS Owner and Accounts, before the first switch ... Open serious exceptions | None ... Participating staff trained | All"
- `docs/phases.md` (Rules): "Apparel OS exports the approved PT in the KDPS layout so the current POS can load it. This depends on the current POS accepting that file and must be confirmed."
- `docs/prd.md` (Required policy configuration, Opening and cutover row): "Verified manifest, financial opening balances, cutoff, outstanding work and sign-off authority"
- `docs/prd.md` (Words used, Exception): "A tracked unresolved condition or difference with an owner, due date, status, evidence and exposure"
- `docs/reports/alignment-report.md` (V-45): "The no-unexplained-difference and all-staff-trained checks are set"

- **What disagrees.** The policy gates a business action on 'go/no-go checks' that only phases.md (which sets delivery order only) defines. Run length and threshold are OPEN there, but 'no unexplained difference', 'all staff trained' and 'no serious exception' are shown as settled with no policy or PRD home; 'serious' has no scale in the PRD (Exception has no severity). The carry-back plan and the PT-export acceptance by the old POS 'must be confirmed' with no owner or stage. V-45 points only to phases.md.
- **Higher rule.** AGENTS.md: phases.md sets delivery order only; a business decision is never settled outside the PRD/policies; PRD-LIF-015, PRD-LIF-027
- **Fix.** Via a DEC, add the go/no-go criteria, run length, threshold, a definition of 'serious exception' (or mark it OPEN: KDPS Owner/Operations) and the fallback checks to policy 14 and its PRD row; give V-45 a POL-14 bullet ID; add a question on whether the old POS accepts the KDPS PT layout; then have phases.md cite policy 14.
- **Files to edit.** `docs/prd.md`, `docs/kdps-policies.md`, `docs/decisions.md`, `docs/phases.md`, `docs/questions-for-kdps.md`, `docs/reports/alignment-report.md`
- **Owner.** product owner (policy home); KDPS Owner, Accounts, Operations (values). **Blocks.** 4 (first switch); run length before the test run (2). **Needs a product-owner decision.** yes.
- **Sceptic notes.** Propose a DEC and wait for the product owner's approval. Do not edit the PRD or policies before then. If approved, make these changes:

1. Add one new POL-14 bullet (next free number, POL-14.08) that states the go/no-go criteria already decided in DEC-030: no unexplained material difference at the switch count, all participating staff trained, and no open serious exception. Mark run length (OPEN, KDPS Owner, before the test run) and material-difference threshold per Store (OPEN, KDPS Owner and Accounts, before the first switch) as OPEN. Mark the definition of "serious exception" as OPEN for the KDPS Owner and Operations, blocking stage 4. Invent no values. Optionally add a PRD-LIF row or word note only if the product owner wants severity in the PRD's Exception vocabulary.
2. Change phases.md to cite that POL-14 bullet and PRD-LIF-027 instead of holding the criteria itself. Keep the rules about the way back and PT export in phases.md as delivery notes.
3. In docs/questions-for-kdps.md, add a question on "serious exception". Add a separate question on whether the current POS accepts the KDPS PT layout, with an owner and the stage it blocks. Reference V-45 in both.
4. Leave docs/reports/alignment-report.md alone except for a cross-reference from V-45, because it decides nothing.
5. Do not add new fallback or carry-back policy text. POL-14.05 and POL-14.07 already cover it.

Downgrade the finding from invented-value to a rank-placement gap (criteria sit in phases.md) plus two unowned open items: the "serious" definition and the PT-export acceptance.

### N-44 · invented-value · Two business-measure targets (under 2% Tally rejection, fifth working day) carry no 'proposed' marker or recorded source

- `docs/prd.md` (Business measures, intro): "Targets marked proposed are starting goals awaiting KDPS agreement. They are goals, not system settings, and never act as policy defaults."
- `docs/prd.md` (Business measures, row Tally import rejection): "Less than 2%"
- `docs/prd.md` (Business measures, row Monthly brand-by-store profit): "Fifth working day"

- **What disagrees.** Seven targets say '(proposed)'; these two do not, so they read as agreed though no DEC, answer or question records who set them, and the fifth working day depends on allocation bases POL-09.20 leaves unset.
- **Higher rule.** AGENTS.md 'Never invent a value'
- **Fix.** Mark both '(proposed)' or log a DEC naming who agreed them; add to the Owner or Accounts questions.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`, `docs/questions-for-kdps.md`
- **Owner.** product owner; Accounts. **Blocks.** 5. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Do not edit docs/prd.md directly. First propose a DEC entry in docs/decisions.md with the product owner as decider. Offer two options: (a) mark both rows "(proposed)", or (b) record who agreed each target. Wait for approval. Only then apply the choice to prd.md rows 218 and 220 and cite the DEC ID. Separately, add to docs/questions-for-kdps.md an Accounts question on the Tally rejection threshold and a question on the fifth-working-day target. Tie the second to POL-09.20 and mark it as blocking stage 5. Do not change any value.

### N-45 · invented-value · Stock ledger section 9 step 4 settles billed-retained value and opening-stock status that SL-17 / V-35 leave OPEN

- `docs/design/stock/stock-ledger.md` (section 9, 'At the switch' step 4): "Billed-retained items carried across the switch (`POL-14.04`) are counted apart. They enter held as billed-retained, with their earlier-POS bill reference and no pool value, and never become opening stock."
- `docs/design/stock/stock-ledger.md` (section 6.1 and SL-17): "Whether value leaves the cost pool at the bill or at handover follows the recognition timing the CA sets (V-35, SL-17). ... A cancellation brings the goods back at the cost they left with, into an inspection hold."
- `docs/kdps-policies.md` (POL-14.04; POL-08.06): "Carry unfinished transfers, bookings, supplier/customer returns and refunds, claims and billed-retained items with their original references. / Revenue-recognition timing remains unresolved here and belongs to Financial posting."
- `docs/prd.md` (PRD-LIF-027): "At a Store's switch, its verified count becomes its opening stock under the opening rules."

- **What disagrees.** POL-14.04 only says carry the items with references. The ledger answers the open CA question anyway ('no pool value', 'never become opening stock'), which would make COGS zero or unknown on later handover, and 6.1 assumes a cancelled sale returns 'at the cost they left with'. PRD-LIF-027 has no billed-retained carve-out.
- **Higher rule.** AGENTS.md 'Never invent a value'; docs/README.md (design does not settle business questions); POL-08.06, POL-09.04
- **Fix.** Limit step 4 to what POL-14.04 and PRD-LIF-004/027 support (counted apart, keep earlier-POS bill reference). Mark cost-pool value and opening-stock status OPEN under SL-17 (CA, blocks 4) and make the 6.1 cancellation bullet conditional. Raise any carve-out against the PRD.
- **Files to edit.** `docs/design/stock/stock-ledger.md`
- **Owner.** CA (V-35 / SL-17); product owner for any PRD-LIF carve-out. **Blocks.** 4. **Needs a product-owner decision.** yes.

### N-46 · invented-value · Unlabelled invented sample values in design-system.html: policy 2 'effective 01 Sep 2026', GST rates, targets, dates, approver and counter names

- `docs/design/ui/design-system.html` (approval panel mkAp policy field): "policy: 'Policy 2 · Approval limits · adjustments · effective 01 Sep 2026'"
- `docs/kdps-policies.md` (policy table row 2; POL-02.10): "| 2 | Permissions and approvals | Owner, Admin | 1 | Open | ... Set numeric role/action limit values and name the authorised approvers before use; actual values and assignments remain undecided."
- `docs/design/ui/design-system.html` (till TL rows; portal target; mobile home; 3.13): "['Linen shirt', ..., 3499, 700, 18, ...], ['Polo', ..., 1799, 0, 5, ...] ... ₹4,12,380 of ₹6,00,000 · 69% ... ['Counts', 'Next: 26 Sep 2026', 0] ... registered offline counter for BLR01"
- `docs/reports/alignment-report.md` (§6 E-3): "Sample values with no "example" label: limits ₹50,000 and ₹50,00,000; day close "due 21:30"; shift 10:00–19:00 with no grace"

- **What disagrees.** The approval card shows an unsigned, Open policy as in force from a date, under a title ('Approval limits') that is not its name. Till GST rates (V-18 open), the sales target, next count date, BLR01 as the offline counter (V-36 open) and a 500-character counter are also unlabelled. These are in addition to C-04/E-3, which list only limits, day-close time and shift.
- **Higher rule.** AGENTS.md 'Never invent a value'; POL-02.10; V-18, V-36
- **Fix.** Remove the effective date and use the real policy title; add a page-level 'All names, dates, rates and amounts are synthetic' line and a Test data chip.
- **Files to edit.** `docs/design/ui/design-system.html`
- **Owner.** design; KDPS Owner and Accounts or CA own the real values. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Remove "effective 01 Sep 2026" from the approval panel's policy field and use the real title, "Policy 2 · Permissions and approvals". Add a page-level line saying all names, dates, rates and amounts are synthetic. Reuse the existing Test data chip rather than adding a new one. Drop the 500-character counter claim. Treat BLR01 as a minor "synthetic example" label rather than an invented value. / Edit only docs/design/ui/design-system.html, using the unpack and repack procedure in AGENTS.md. In the approval panel, drop 'effective 01 Sep 2026' and use the policy's real name, for example 'Policy 2 · Permissions and approvals · limit not configured'. Add one page-level line and a Test data chip stating that all names, dates, rates, targets and amounts are synthetic. Cite V-18 for the GST registration only, and cite the CA and the policy 10 GST rows for rates. Do not edit the PRD or the policies.

### N-47 · invented-value · POL-02.13 names day-close cash-variance approvers (Store Manager, Accounts) with no decision entry

- `docs/decisions.md` (DEC-008 Changed): "New `POL-02.13` (cash-variance tolerance and approvers: unconfigured)."
- `docs/kdps-policies.md` (POL-02.13): "A Store Manager may approve within a configured limit; Accounts approves above it. No difference is written off automatically."
- `docs/decisions.md` (DEC-026 Choice): "the Accounts approver is a KDPS value already in `POL-02.13`. No DEC added it."

- **What disagrees.** DEC-008 created POL-02.13 as unconfigured; the text now fixes a two-tier approver structure and DEC-026 admits no entry added it; DEC-020 lists POL-02.13 as changed without saying what changed.
- **Higher rule.** AGENTS.md: changes logged first; 'Never invent a ... approver'
- **Fix.** Add a DEC (or amend DEC-020/DEC-029) stating who chose the split and that KDPS agreed, or reword POL-02.13 to 'approvers remain unconfigured'.
- **Files to edit.** `docs/decisions.md`, `docs/kdps-policies.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Add one line to DEC-020's Choice and Changed, or a short new DEC. It should record that day-close cash differences go to the Store Manager within a configured limit and to Accounts above it, that this was agreed with the KDPS representative (DEC-029), and that the limit and named approvers stay OPEN (questions-for-kdps.md item 25, V-38). Reword DEC-026 line 260 so it no longer says "No DEC added it". Do not reword POL-02.13 to "approvers remain unconfigured": the line already says limits and named approvers are unconfigured, and PRD-CSH-011 already assumes a higher approver tier. Revert POL-02.13 to the old wording only if the product owner says KDPS did not agree the split. / Choose one of two options, and have the product owner choose rather than the fixer.

Option A, the default and lowest risk. Edit the lower document, docs/kdps-policies.md POL-02.13, to follow PRD-CSH-011: "Record every day-close cash difference. A difference within the configured tolerance goes to the approver set for it; above it goes to a higher approver and becomes an owned exception. No difference is written off automatically. Limits and named approvers remain unconfigured." Then amend the DEC-026 wording that calls Accounts "a KDPS value already in POL-02.13".

Option B, only if the product owner confirms the Store Manager and Accounts split. Add a new DEC, decided by the product owner, that records the choice and its source. Do not state that KDPS agreed unless the product owner confirms it. Keep POL-02.13 as it is. Do not edit DEC-020 retroactively. Fix the DEC-026 wording by pointing it at the new DEC.

Do not edit prd.md in either case, because the PRD is already role-neutral.

### N-48 · invented-value · Stock ledger section 5 EBO piece handling relaxes PRD-MER-016/MER-003 and invents restart conditions

- `docs/design/stock/stock-ledger.md` (section 5, second bullet under 'Where piece rules are off'): "When a labelled piece arrives there, its piece record notes the arrival and stops tracking it; from then on the Store holds it only as quantity. ... Their piece IDs count again only after a full count at that Store, as at a switch, or when they are scanned at the destination of a transfer out of it."
- `docs/prd.md` (PRD-EBO-011): "An EBO Store that reports through brand software holds piece-tracked goods as SKU quantity until it bills in Apparel OS; its imports name no piece."
- `docs/prd.md` (PRD-MER-016; PRD-MER-003): "Bill, count, transfer and return piece-tracked goods by scanning the piece ID. ... Preserve that piece identity through custody, PT coverage, sale, return and count."

- **What disagrees.** The ledger adds stop-tracking on arrival, exclusion from the one-place check, and re-identification at a transfer destination, meaning an outbound transfer without a piece scan, against PRD-MER-016/003. 'Until it bills in Apparel OS' is not mapped to a ledger event.
- **Higher rule.** PRD-MER-016, PRD-MER-003, PRD-EBO-011; DEC-023
- **Fix.** Limit section 5 to PRD-EBO-011 and DEC-023. If EBO Stores may send piece-tracked goods out by quantity, raise a PRD change via a DEC, then align section 5 and the 11.7 check.
- **Files to edit.** `docs/design/stock/stock-ledger.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Edit only docs/design/stock/stock-ledger.md section 5. Keep what PRD-EBO-011 and DEC-023 support: an EBO Store on brand software holds piece-tracked goods as SKU quantity per receipt origin until it bills in Apparel OS, and its imports name no piece. Delete the invented rules: stop-tracking on arrival, exclusion from the 11.7 one-place check, and re-identification after a count or at a transfer destination. In their place, mark as OPEN, owner product owner, the question of how piece-tracked goods arrive at, leave, and are counted at such a Store, and which stage it blocks. Also say what ends "until it bills in Apparel OS" at the Store, because the PRD does not define that event. Do not edit the PRD. If the product owner wants outbound-by-quantity or arrival-stops-tracking, log a DEC first (an exception to PRD-MER-016 and PRD-MER-003), then align section 5 and 11.7 to it.

### N-49 · invented-value · Customer return of a supplier-owned unit is declared to go back outside the pool, still the supplier's, ahead of the agreement and CA validation

- `docs/design/stock/stock-ledger.md` (section 7.2 bullets after the table): "A customer return of such a unit goes back outside the pool, still the supplier's. A loss or a supplier return of supplier-owned goods takes no pool value; it is settled under the agreement."
- `docs/kdps-policies.md` (POL-01.13; POL-01.05): "For consignment, settlement follows the agreed sale or consumption event and reporting cycle, reconciling customer returns and adjustments. / The ownership-transfer event is configurable per brand agreement and inherited by its bookings."
- `docs/prd.md` (PRD-ORG-014): "Record stock ownership from the applicable agreement. Outright and sale-or-return terms do not by themselves determine legal title, valuation or accounting recognition."

- **What disagrees.** Ownership, valuation and the effect of customer returns on a consignment sale are set by the agreement; the ledger decides a return reverts ownership, ahead of CA validation (SL-4).
- **Higher rule.** POL-01.13, POL-09.03, PRD-ORG-014; AGENTS.md (business decision not settled in design)
- **Fix.** Soften both bullets to follow the agreement (ownership event per POL-01.05, return effect per POL-01.13); add the customer-return reversal to the SL-4 list for the CA; keep pass-through as a synthetic G6 example only.
- **Files to edit.** `docs/design/stock/stock-ledger.md`
- **Owner.** CA / Accounts; product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the fix scoped to docs/design/stock/stock-ledger.md. Reword the customer-return sentence in 7.2 so its effect on ownership follows the agreement (ownership event per POL-01.05, return reconciliation per POL-01.13), instead of stating "still the supplier's". Leave the loss and supplier-return half mostly as is, since it already says "settled under the agreement". In SL-4, extend the existing "consignment pass-through (7.2)" item to say "including whether a customer return reverses ownership", rather than adding a separate entry. Keep the pass-through as the G6 synthetic example only. The product owner or CA decision flag stays valid. / Keep the fix as proposed, with one wording refinement. In docs/design/stock/stock-ledger.md section 7.2, reword the second bullet to say a customer return of a supplier-owned unit, and a loss or supplier return of one, follow the brand agreement under POL-01.05 and POL-01.13, and that the CA decides the accounting under POL-09.03. State no default reversion of ownership. Mark the customer-return effect OPEN with owner CA or the product owner. Add "customer return of a pass-through unit" to the SL-4 list. Do not edit the PRD or policies.

### N-51 · invented-value · Design-language states unsourced numbers and a WCAG 2.2 AA conformance target that no PRD or policy sets

- `docs/design/ui/design-language.md` (§9 heading and §2): "All pairs are checked against WCAG 2.2 AA in both themes ...  ## 9. Accessibility (WCAG 2.2 AA)"
- `docs/prd.md` (Operator experience PRD-UXP-001 to -010; Acceptance conditions): "(no accessibility, WCAG, contrast or colour-scheme requirement appears anywhere in prd.md, kdps-policies.md or phases.md)"
- `docs/design/ui/design-language.md` (§10.12, §10.9, §10.10, §3): "Lasts 6 s, pauses on hover or focus ...  |  Over 1,000 rows, pages load as the user goes.  |  Pages of 100 rows; only visible rows are drawn.  |  Labels, buttons and menus must allow about 30% longer text"

- **What disagrees.** A product conformance target is set only in a rank-3 file, and toast time (also an Undo window), paging thresholds and 30% Hindi growth are design choices stated as rules with no source or 'design default' label. The PRD sets only the PRD-PRF performance targets.
- **Higher rule.** AGENTS.md 'Never invent a value' and 'A business decision is never settled in design'; PRD-PRF-001
- **Fix.** Product owner adds a PRD-UXP bullet and DEC naming the accessibility target, or §9 is reworded as a design goal. Label the numbers 'design defaults' to validate against PRD-PRF; do not let an Undo toast define a business undo window.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`, `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Split the fix. (1) Lower-document fix, allowed now. In docs/design/ui/design-language.md §2 and §9 and the matching text in docs/design/ui/design-system.html, reword "WCAG 2.2 AA" as a design goal, for example "Design target (not yet a PRD requirement; see OPEN item)". Mark it OPEN with the product owner as owner. Label the toast duration, paging thresholds and 30% text growth as "design defaults, to validate against PRD-PRF", and state that the toast Undo is a UI affordance only and defines no business undo window. Invent no new values. (2) Higher-document change, only with approval. Propose a DEC entry for the product owner: add a PRD-UXP bullet (next free number, UXP-011) naming an accessibility conformance target, then cite that ID in design-language.md. Do not edit prd.md or decisions.md until the owner approves the DEC. Drop the toast, paging and 30% items from the "needs product owner decision" part. They only need design-default labelling.

### N-52 · invented-value · 'Seen' and 'Acknowledged' tracking, an acknowledge-by deadline and an Acknowledge action inside My work are not in the PRD

- `docs/design/ui/design-language.md` (§10.5 Count): "Seen, Acknowledged and Resolved are tracked separately inside My work."
- `docs/prd.md` (PRD-ACS-009, PRD-ACS-010, PRD-EXC-001): "Support approve/reject with reasons, evidence, comments, delegation during absence and escalation of overdue work."
- `docs/prd.md` (Words used: My work): "The user's assigned tasks, approvals and exceptions"

- **What disagrees.** The PRD gives ordering, delegation, escalation and one exception due date, with no seen/acknowledged status or acknowledge-by time. The design language, design-system.html (drawer 'Acknowledge by', 'Acknowledge') and blueprint add them as product rules; neither word is in Words used.
- **Higher rule.** PRD-ACS-009, PRD-EXC-001; docs/README.md Words
- **Fix.** Remove the sentence and second deadline, or raise a PRD change with a DEC adding the terms and lifecycle.
- **Files to edit.** `docs/prd.md`, `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`, `docs/design/ui/ui-blueprint.html`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Default: edit only the lower documents. Delete the "Seen, Acknowledged and Resolved are tracked separately inside My work." sentence at docs/design/ui/design-language.md line 418. Remove "with separate Seen, Acknowledged and Resolved states" from the Home notes in docs/design/ui/ui-blueprint.html. Remove the "Acknowledge" action from the Home actions list in ui-blueprint.html. Remove the "Acknowledge by" row and the "Acknowledge" button from the exception drawer in docs/design/ui/design-system.html, keeping the single "Resolve by" due date per PRD-EXC-001. Alternative: if the product owner wants the feature, propose a DEC first, wait for approval, and only then edit docs/prd.md. That edit would add a new PRD-ACS bullet and define "Seen" and "Acknowledged" in Words used. Whether there is an acknowledge-by deadline, and what its value is, stays OPEN with the product owner until the PRD sets it.

### N-53 · gap · Gift-voucher tax has no home in the Statutory applicability policy

- `docs/prd.md` (PRD-RET-020): "Tax on issue and redemption follows the Statutory applicability policy."
- `docs/prd.md` (Required policy configuration, row Statutory applicability): "Registration, goods/rate classification, invoice-number format, sale-or-return tax, e-invoice/e-way, TDS and payroll rules"
- `docs/kdps-policies.md` (POL-07.10): "Gift-voucher validity, partial redemption, refund of an unused balance and treatment of a lost voucher remain to be confirmed."
- `docs/questions-for-kdps.md` (CA question 6): "How is GST handled when a voucher is sold and when it is used? · `POL-07.10`"

- **What disagrees.** PRD-RET-020 sends voucher tax to policy 10, but no policy-10 row, bullet or question mentions vouchers. The tax question is parked under policy 7 (Owner, Accounts) and the CA list cites POL-07.10, which does not list tax. V-30 also points to POL-07.10.
- **Higher rule.** docs/prd.md PRD-RET-020
- **Fix.** Add gift-voucher tax on issue and redemption to the policy-10 row and a POL-10 bullet via a DEC; re-point POL-07.09, POL-07.10, the CA question and V-30.
- **Files to edit.** `docs/prd.md`, `docs/kdps-policies.md`, `docs/questions-for-kdps.md`, `docs/reports/alignment-report.md`
- **Owner.** Product owner (policy home); CA (tax treatment). **Blocks.** 4. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Narrow the fix and edit only the lower documents. Do not edit the PRD policy row. PRD-RET-020 already routes voucher tax to the Statutory applicability policy, and editing the PRD row would need a DEC. Make these edits:
1. docs/kdps-policies.md: add a new bullet POL-10.10 with no invented values, for example "Gift-voucher tax on issue and redemption remains to be confirmed by the CA; do not assume the treatment." Remove the implication that POL-07.10 owns tax. For example, let POL-07.10 cross-refer to POL-10.10 for tax.
2. docs/questions-for-kdps.md: re-point CA question 6 from POL-07.10 to POL-10.10 (keep V-30). In Owner question 20, keep POL-07.10 for the commercial terms and mention POL-10.10 for tax.
3. docs/reports/alignment-report.md: update the references to V-30, B-7 and 4.10 so tax points to POL-10.10 and the non-tax terms stay on POL-07.10.
4. Add a short DEC only if the project's convention requires one to record that the new POL-10.10 bullet implements DEC-006's "tax via policy 10". The PRD "Required policy configuration" row (docs/prd.md:891) is optional. Add "gift-voucher tax" there only if the product owner wants it, and only through a DEC.

### N-54 · gap · Offline working-set validity time is required by PRD-OFF-004 but has no policy home, value or owner

- `docs/prd.md` (PRD-OFF-004): "Cache authorised identities/aliases, eligible quantity, prices, offers and tax versions with a defined validity time. Block finalisation against an expired working set"
- `docs/prd.md` (Required policy configuration, row Offline operation): "Permitted offline tenders and their evidence, stock allocations, device authority and conflict resolution"
- `docs/kdps-policies.md` (POL-16.04): "Permit only reserved eligible counter stock and valid cached prices, offers and tax versions."

- **What disagrees.** Only the 24-hour authority renewal (PRD-OFF-003) is defined; the validity time is not in the policy-16 row, in POL-16, in the questions or in the report's open values.
- **Higher rule.** PRD-OFF-004; AGENTS.md OPEN-with-owner rule
- **Fix.** Add 'working-set validity time' to the Offline operation row and a POL-16 bullet marked OPEN (Owner, Operations); add to Owner questions and report open values.
- **Files to edit.** `docs/prd.md`, `docs/kdps-policies.md`, `docs/questions-for-kdps.md`, `docs/reports/alignment-report.md`
- **Owner.** Product owner (policy home); KDPS Owner, Operations (value). **Blocks.** 4. **Needs a product-owner decision.** yes.
- **Sceptic notes.** The proposed fix is sound. Two refinements. First, the 'Offline operation' row sits in the prd.md 'Required policy configuration' table at line 897. Second, add the new POL-16 bullet as POL-16.07 (the next free ID, since POL-16.06 exists). That is cleaner than inserting mid-sequence, because bullet IDs are stable. Also add a matching question to docs/questions-for-kdps.md, for example by extending Q24 or adding a new question referencing POL-16.07, plus a new V-number in the report's open values. / First propose a new DEC in docs/decisions.md (date, product owner as decider, question, options, choice, IDs changed) and wait for the product owner's approval. Only then edit the documents to match it. Add "working-set validity time" to the Offline operation row of the PRD's policy-configuration table (prd.md line 897). Add a new POL-16.07 bullet in docs/kdps-policies.md, marked OPEN, owner KDPS Owner and Operations, blocks stage 4, with no value invented. Do not renumber the existing bullets. Add the question to docs/questions-for-kdps.md, next to item 24, and add a new V-number to the open values in docs/reports/alignment-report.md. Add docs/decisions.md to files_to_edit, and make the PRD row edit conditional on the DEC.

### N-55 · gap · PRD-ACS-015 gives 'bill value' as the limit basis for no-bill returns, which have no bill

- `docs/prd.md` (PRD-ACS-015): "bill value for discounts, refunds and no-bill returns"
- `docs/kdps-policies.md` (POL-07.06): "Use documented, evidenced valuation rather than assuming MRP."
- `docs/prd.md` (PRD-RET-017): "Keep no-bill returns unavailable without their explicit eligibility, valuation, permission and tender policy."

- **What disagrees.** A no-bill return has no bill value; the basis the limit is compared with is undefined, so PRD-ACS-016 (unknown value) cannot be applied cleanly.
- **Higher rule.** PRD-ACS-015, PRD-ACS-016, PRD-RET-017
- **Fix.** Log a DEC and amend PRD-ACS-015 so no-bill returns use the documented valuation under the no-bill policy; reference it in POL-07.06.
- **Files to edit.** `docs/prd.md`, `docs/kdps-policies.md`
- **Owner.** product owner. **Blocks.** 4. **Needs a product-owner decision.** yes.
- **Sceptic notes.** The direction is right, but the fix should be sharper. Log a new DEC that amends DEC-009. Do not log a free-standing DEC, because DEC-009 is the source of the wording. Change PRD-ACS-015 to something like "bill value for discounts and bill-backed refunds; for no-bill returns, the documented, evidenced valuation under the no-bill policy". State in PRD-ACS-016 or PRD-RET-017 that a no-bill return with no accepted valuation counts as unknown value. Add a cross-reference in POL-07.06 and POL-07.08 to the limit basis. Keep the owner decision on which valuation method to use (for example last cost, an evidenced similar-item price, or estimated resale value). / Narrow the fix. Log a new DEC that partly supersedes DEC-009 (it does not replace DEC-009). The DEC would say that for no-bill returns the limit basis is the documented, evidenced valuation set by the no-bill valuation policy, not a bill value. The product owner must decide this. Then amend only the PRD-ACS-015 clause to read roughly "bill value for discounts and refunds; documented valuation under the no-bill valuation policy for no-bill returns", with an unknown or undocumented valuation handled by PRD-ACS-016. Do not edit docs/kdps-policies.md. POL-07.06 and POL-07.08 already require documented, evidenced valuation, and POL-07.08 already requires valuation and limits to be configured. The only policy-side change is an optional one-line cross-reference in the DEC's "Changed" list. The amount of the limit stays with KDPS (V-02), and no value is invented.

### N-56 · gap · Store-credit and loyalty settings appear in PRD policy row 6 (Owner, Operations) but are answered only in policy 7 (Owner, Accounts)

- `docs/prd.md` (Required policy configuration, row Customer returns): "Ordinary return window and defective-item assessment, qualifying date, authorised Store overrides, permitted remedies, Store-credit and loyalty settings | Owner, Operations | 4"
- `docs/prd.md` (Required policy configuration, row Refunds and no-bill returns): "Store credit and gift-voucher issuance/redemption rules; Customer credit limits and due dates; Bank transfer evidence; required customer notice/consent | Owner, Accounts"
- `docs/kdps-policies.md` (POL-07.13): "Keep loyalty disabled until an approved scheme, earning, redemption, liability and expiry rules are configured."

- **What disagrees.** Policy 6 has no bullet on either; policy 7 holds them (POL-07.09, 07.11, 07.13), so Operations, a named decider in row 6, does not decide where answers live. B-6 does not note the duplicate row.
- **Higher rule.** docs/prd.md Required policy configuration rows 6 and 7
- **Fix.** Remove 'Store-credit and loyalty settings' from the policy-6 row or add a policy-6 bullet pointing to policy 7; record in a DEC.
- **Files to edit.** `docs/prd.md`
- **Owner.** product owner. **Blocks.** 4. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the proposed fix, but reword the finding. Say that policy 6 covers store credit only as a remedy (POL-06.06) and has no settings questions. Say that B-6 already flags loyalty in rows 6 and 7, though the PRD row 7 text does not actually name loyalty. Then either remove "Store-credit and loyalty settings" from the row 6 content and add loyalty to the row 7 content in docs/prd.md, or add a policy 6 pointer to policy 7. Record the choice in a DEC and fold it into B-6. This needs the product owner's decision. / Treat the PRD as the higher document and fix policies. Edit docs/kdps-policies.md, not docs/prd.md.

1. Log a DEC first. It should say that policy 6 is where Operations co-decides the Store-credit and loyalty settings named in PRD row 6, and that the detailed rules stay in POL-07.09, 07.11 and 07.13.
2. Add one cross-reference answer bullet to policy 6, for example `POL-06.08`, saying that Store-credit and loyalty settings are answered in policy 7 and that Operations confirms them there. Do not add any values. Alternatively, extend policy 7's "Signed by" to include Operations.
3. Edit the PRD only if the product owner decides that Operations should not decide these settings. In that case, record a DEC and change the PRD row's Decided-by instead of deleting the loyalty text.
4. Keep loyalty OPEN with owner KDPS Owner and Accounts, blocking stage 4, as in B-6.

Do not drop "loyalty" from the PRD configuration table.

### N-57 · gap · Phone/WhatsApp approval action types have no policy 2 text; report B-8 says they do

- `docs/prd.md` (PRD-ACS-012): "Send phone approval notifications as links to authenticated actions bound to the exact record version. A plain text or WhatsApp “yes” is not approval."
- `docs/reports/alignment-report.md` (B-8): "Authenticated notification links bind approval to the exact record version; action types to enable remain to be confirmed"
- `docs/questions-for-kdps.md` (KDPS Owner 31): "Which approval types may use an authenticated notification link tied to the exact record version? A plain “yes” is not approval. · `PRD-ACS-012`"

- **What disagrees.** B-8 points to policy 2, but no bullet there mentions phone or WhatsApp approvals (POL-02.14 is only the daily summary) and the PRD policy-2 row does not list the action types; the question has no POL anchor or V number.
- **Higher rule.** PRD-ACS-012; Required policy configuration
- **Fix.** Add a POL-02 bullet (OPEN, KDPS Owner, stage 5) via a DEC and to the policy-2 row; re-anchor Owner question 31; correct B-8 and add a V entry.
- **Files to edit.** `docs/kdps-policies.md`, `docs/prd.md`, `docs/questions-for-kdps.md`, `docs/reports/alignment-report.md`
- **Owner.** Product owner (policy home); KDPS Owner (values). **Blocks.** 5. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Do not edit B-8 as an error. Treat this as a missing policy home, and keep all edits behind a DEC that the product owner approves.

1. Add a DEC. It gives the phone-approval action types a home under policy 2.
2. Add the next free POL-02 bullet (`POL-02.22`, never reusing an ID). It should say that authenticated notification links bound to the exact record version are used only for the explicitly allowlisted action types, and that the action types are OPEN (KDPS Owner, blocks stage 5). Do not list any action types.
3. Add "phone/WhatsApp approval action types" to the PRD policy-2 row. Do this only through the same DEC.
4. Re-anchor Owner question 31 to the new POL bullet and a new V entry.
5. Add that V entry to section 5 of the alignment report. Update B-8 to cite the new POL bullet and mark it "Settled: DEC-0xx (policy home)", in the same style as B-1 and B-2. Optionally add "(none yet)" to its "Nearest policy" cell until then.

Severity is a minor gap, because the question exists and the PRD behaviour is settled.

### N-58 · gap · Contra is a Tally voucher in Words used and policy 9 but PRD-LED-012 omits it

- `docs/prd.md` (PRD-LED-012): "Send approved masters before sales, purchases, payments, receipts, journals and credit/debit vouchers through Tally XML."
- `docs/prd.md` (Words used, Contra): "A Tally voucher for a transfer between accounts within the same legal entity"
- `docs/kdps-policies.md` (POL-09.25): "Map Contra only to cash or bank transfers between accounts of the same legal entity; it does not represent stock transfers."

- **What disagrees.** A lower document relies on a voucher kind the PRD requirement does not list.
- **Higher rule.** docs/prd.md PRD-LED-012
- **Fix.** Add contra vouchers to PRD-LED-012 (with a DEC) or say the list is not exhaustive.
- **Files to edit.** `docs/prd.md`
- **Owner.** product owner. **Blocks.** 5. **Needs a product-owner decision.** no.
- **Sceptic notes.** Edit PRD-LED-012 in docs/prd.md to add contra vouchers, for example "...payments, receipts, contra, journals and credit/debit vouchers through Tally XML." A DEC is optional because the PRD already defines Contra. If the list is meant to be non-exhaustive, say so instead. / Set needs_product_owner_decision to true. Propose a new DEC entry in docs/decisions.md (next free number, with date, decider, question, options, choice and why) that says the Tally XML export includes contra vouchers for own-entity cash and bank transfers, consistent with DEC-021 and POL-09.25. Wait for the product owner's approval. Then edit PRD-LED-012, keeping its ID, to add "contra" to the voucher list, for example "...payments, receipts, contra, journals and credit/debit vouchers...". Cite the new DEC as changing PRD-LED-012. Drop the "not exhaustive" alternative. The PRD edit is the whole fix, because POL-09.25 is already aligned and needs no change.

### N-59 · gap · Switch-day steps in phases.md omit the fresh bill series, cutoff and carried work required by PRD-LIF-015 and policy 14

- `docs/prd.md` (PRD-LIF-015): "Switch each Store over at a day close, with verified balances and a fresh bill series."
- `docs/kdps-policies.md` (POL-14.07 and POL-14.04): "Before the pilot switch, record the verified manifest and balances, cutoff and day-close date, carried work, approvals and fallback."
- `docs/phases.md` (Testing and switch-over, 'Switch day' row): "approve the cutover, record the verified count as opening stock, then start billing in Apparel OS"

- **What disagrees.** The switch row and its list of what is still to be set mention neither the per-device fresh series (PRD-POS-020), the recorded cutoff, nor unfinished work carried with original references; PRD-LIF-002 readiness (devices, users, locations) is not a go/no-go item.
- **Higher rule.** PRD-LIF-015, PRD-LIF-002, POL-14.04, POL-14.07
- **Fix.** Add to the switch-day row: allocate each device's fresh bill series; record cutoff and carry unfinished work; add Site readiness (PRD-LIF-002) to go/no-go.
- **Files to edit.** `docs/phases.md`
- **Owner.** product owner. **Blocks.** 4. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the fix, edit only docs/phases.md, and cite IDs without inventing values. (1) In the Switch day row, record the cutoff and day-close date and carry unfinished work with original references (POL-14.04, POL-14.07) before the stop-billing step. Allocate each billing device's fresh bill series before billing starts in Apparel OS (PRD-LIF-015, PRD-POS-020). (2) In the Go or no-go check row, add Site readiness: mappings, users and access, locations, devices, required policies and stock plan are verified (PRD-LIF-002). (3) In the intro sentence listing what remains to be set, add the cutoff and day-close date next to the date, manifest and balances (POL-14.07). Do not add any series format or cutoff value, since those are OPEN or set per Organisation.

### N-60 · gap · phases.md stage 5 'Policies needed' omits Customer credit (policy 7) and Store P&L allocation and asset policy (policy 9)

- `docs/phases.md` (Stage 5, Policies needed before live use): "Official book; Franchise/partner; Financial posting (vouchers and acknowledgments); Statutory applicability (TDS)."
- `docs/prd.md` (Required policy configuration, rows 7 and 9): "4; Customer credit by 5 ... 1; Store P&L allocation, asset policy, vouchers and acknowledgments by 5"
- `docs/phases.md` (Stage 5 In scope): "Customer credit at the till."

- **What disagrees.** Stage 5 scope includes Customer credit, fixed assets and Store P&L; its policy list names only vouchers/acknowledgments from policy 9 and nothing from policy 7, though the PRD and policy tables need both by stage 5. DEC-025 says stages 4 and 5 were updated.
- **Higher rule.** PRD Required policy configuration; kdps-policies.md table (Needed by stage)
- **Fix.** Change to: 'Official book; Franchise/partner; Refunds and no-bill returns (Customer credit); Financial posting (Store P&L allocation, asset policy, vouchers and acknowledgments); Statutory applicability (TDS).'
- **Files to edit.** `docs/phases.md`
- **Owner.** product owner. **Blocks.** 5. **Needs a product-owner decision.** no.
- **Sceptic notes.** The proposed fix is acceptable as written. Change line 177 to: "Official book; Franchise/partner; Refunds and no-bill returns (Customer credit); Financial posting (Store P&L allocation, asset policy, vouchers and acknowledgments); Statutory applicability (TDS)." Its parenthetical style matches the other stages' lists.

### N-61 · gap · phases.md stage 4 lists store-credit and loyalty liabilities but not the gift-voucher liability

- `docs/phases.md` (Stage 4 'Stock and money records from day one'): "store-credit and loyalty liabilities."
- `docs/prd.md` (PRD-RET-020): "Record each unredeemed balance as a liability, and check and consume the authoritative balance online at redemption."
- `docs/decisions.md` (DEC-006 / DEC-020): "held as a liability until used and checked online at redemption"

- **What disagrees.** Gift voucher is a stage 4 tender with a liability, but the stage 4 credit scope line and the liabilities list omit it.
- **Higher rule.** PRD-RET-020, PRD-POS-005, DEC-006
- **Fix.** Add 'gift vouchers' to the stage 4 credit line and 'gift-voucher' to the liabilities list.
- **Files to edit.** `docs/phases.md`
- **Owner.** product owner. **Blocks.** 4. **Needs a product-owner decision.** no.

### N-62 · gap · PRD-OFF-002 not updated by DEC-005: offline series is per device and year, not per registration

- `docs/prd.md` (PRD-OFF-002): "Register devices online and allocate a device-specific financial-year bill series; devices cannot share a live series."
- `docs/prd.md` (PRD-POS-020): "Give each billing device its own bill series per tax registration and financial year, online or offline."
- `docs/decisions.md` (DEC-005 Choice / Changed): "a till serving two registrations simply holds two series ... New `PRD-POS-020`"

- **What disagrees.** DEC-005 changed only PRD-POS-020; the offline rule still names one series with no registration.
- **Higher rule.** PRD-POS-020; DEC-005
- **Fix.** Reword PRD-OFF-002 to 'a device-specific bill series for each tax registration and financial year' and list it in DEC-005's Changed line.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** 4. **Needs a product-owner decision.** no.
- **Sceptic notes.** Do not edit docs/prd.md directly. First propose a decision entry, either a new DEC-0xx or an owner-approved amendment line on DEC-005. It would record: "PRD-OFF-002 reworded to 'a device-specific bill series for each tax registration and financial year', aligning it with PRD-POS-020. No change of intent." Set needs_product_owner_decision to true and keep the severity low (wording consistency). After approval, edit PRD-OFF-002 and add "PRD-OFF-002 reworded" to the Changed list. The PRD-OFF-002 change itself is to the higher document (PRD), so it is not a fix to a lower document. No lower document needs a change.

### N-63 · gap · 'Offline counter, enabled after online billing is proven' adds a gate the PRD, policy 16 and AGENTS.md do not have

- `docs/phases.md` (Stage 4 'In scope'): "Offline counter, enabled after online billing is proven."
- `AGENTS.md` (Delivery): "Design offline billing in stage 1; enable it only under the signed Offline operation policy."
- `docs/kdps-policies.md` (POL-16.01): "Enable offline billing only for approved Stores, through one registered counter per Store, with authority renewed online every 24 hours."

- **What disagrees.** 'Proven' has no pass mark, duration or approver, and the stage 4 offline exit check does not include it.
- **Higher rule.** PRD-OFF-001 to PRD-OFF-019; POL-16; AGENTS.md 'Never invent a value'
- **Fix.** Define the proof as a named exit check with an owner, or delete the phrase and rely on the policy 16 gate.
- **Files to edit.** `docs/phases.md`
- **Owner.** product owner. **Blocks.** 4. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Edit only docs/phases.md. Change line 136 to wording that uses existing gates, for example: "Offline counter, enabled only under the signed Offline operation policy and after the offline exit check below." Alternatively, delete "enabled after online billing is proven". Do not add a new "proven" criterion, owner or duration, and do not edit the PRD, policy 16 or AGENTS.md. If the product owner wants a real online-billing-first gate, that needs a DEC and a PRD or policy change first. Severity: minor wording gap, not stage-blocking; needs_product_owner_decision should be false for the simple rewording.

### N-64 · gap · Inbound ownership (PRD-ORG-017 to 019, PRD-ACP-020) is in no stage's scope or exit checks

- `docs/prd.md` (PRD-ACP-020): "Goods owned before receipt appear as inbound ownership, never as stock; they carry an amount only with invoice or agreement-price evidence, and close against the receipt count."
- `docs/prd.md` (PRD-ORG-017 to PRD-ORG-019): "Close inbound ownership against the receipt count."
- `docs/phases.md` (Stage 2 'In scope' and 'Exit checks'): "Physical custody from the actual count; official PT coverage and receipt cost; ownership from the agreement; the supplier obligation under the approved recognition rule."

- **What disagrees.** The word 'inbound' appears nowhere in phases.md, though exit checks should come from PRD acceptance conditions and the ledger treats inbound ownership as a real record closed at stage 2 receiving.
- **Higher rule.** PRD-ACP-020; PRD-ORG-017 to PRD-ORG-019
- **Fix.** Add 'Inbound ownership records, closed against the receipt count (PRD-ORG-017 to PRD-ORG-019)' to stage 2 scope and an exit check citing PRD-ACP-020.
- **Files to edit.** `docs/phases.md`
- **Owner.** product owner. **Blocks.** 2. **Needs a product-owner decision.** no.
- **Sceptic notes.** The proposed fix is sound. Optionally also name the record's creation in stage 1, or say that stage 1 builds the record type and stage 2 exercises it. Suggested stage 2 exit check wording: "Goods owned before receipt appear as inbound ownership, never as stock; an amount appears only with invoice or agreement-price evidence, otherwise unknown with an exception; the receipt count closes the record, and quantity or amount differences settle through the receiving discrepancy and invoice-matching records (PRD-ACP-020, PRD-ORG-017 to 019)." / Keep the target as docs/phases.md only. Add to the Stage 2 "In scope" list a bullet such as "Inbound ownership: goods owned under an agreement before receipt, recorded outside stock, with an amount only from invoice or agreement-price evidence, and closed against the receipt count (PRD-ORG-017 to PRD-ORG-019)". Extend the Stage 2 "Stock and money records from day one" line to name inbound ownership. Add an exit check that mirrors PRD-ACP-020: "Goods owned before receipt appear as inbound ownership, never as stock; they carry an amount only with invoice or agreement-price evidence, and close against the receipt count (PRD-ACP-020)." Do not add any new thresholds or values.

### N-65 · gap · Real-data side-by-side test: policy-signature gating and data-agreement prerequisite not stated in phases.md

- `docs/phases.md` (How the stages are cut): "A stage may be designed, developed and tested with synthetic data before policy signatures."
- `docs/design/platform/deployment.md` (1 and 10 (D-4)): "`kdps-test` holds real data only after KDPS agrees to it (KDPS Owner question 37)."
- `docs/phases.md` (Testing and switch-over table, 'Before the test' row): "Load product masters and approved mappings"

- **What disagrees.** Phases allows pre-signature testing only with synthetic data, while the test runs on kdps-test with real KDPS data. It does not say whether real-data testing needs signed policies or real configured values, nor list the Q37 / D-4 agreement as a 'Before the test' prerequisite.
- **Higher rule.** PRD Required policy configuration preamble; POL header
- **Fix.** State which gating applies to the real-data test; add the Q37 / D-4 agreement as a prerequisite; record in decisions.md if the gating rule changes.
- **Files to edit.** `docs/phases.md`
- **Owner.** product owner. **Blocks.** 2. **Needs a product-owner decision.** yes.
- **Sceptic notes.** The proposed fix is sound. Add the Q37 / D-4 agreement to the "Before the test" row or its prerequisites, since deployment.md says kdps-test holds real data only after that agreement. Add one sentence to the line 15 gating bullet saying whether the side-by-side test on real KDPS data needs signed policies. The likely answer is no, because the test is not a live operation and the current POS stays the system of record, but the product owner decides. Add a decisions.md entry only if the gating rule actually changes. / Edit only docs/phases.md.

1. In the "Before the test" row, add a prerequisite that points to the existing rule: KDPS's agreement to hold real data on the test setup, and whether customer details are imported, is recorded first (KDPS Owner question 37; deployment.md D-4). Until KDPS answers, imports keep no customer name or phone number (PRD-SEC-009, PRD-SEC-010). This restates deployment.md and invents nothing, so it needs no DEC.

2. Do not write a new gating rule in phases.md without the owner.
   - Ask the product owner whether the non-live side-by-side test on real data needs signed policies or configured real values.
   - If the owner says no, because the test is not a policy-dependent live operation, record that in decisions.md, as a clarification to DEC-028 or a new DEC, before wording phases.md line 15 or the testing section to match.
   - If the owner says yes, treat that as a gating change that needs a DEC and a possible PRD or policies edit, not just a phases.md edit.

3. Downgrade the severity to minor. The real-data test is already decided in DEC-028, and the only genuinely missing content is the D-4 cross-reference.

### N-66 · gap · Site readiness gating (PRD-LIF-001/002) is in no stage; blueprint puts Site closure and Data export in stage 1 while phases puts them in stage 5

- `docs/prd.md` (PRD-LIF-002): "Verify mappings, users/access, locations, devices, required policies and stock plan before enabling each activity."
- `docs/phases.md` (Stage 5 'In scope'): "Site closure, relocation and complete export."
- `docs/design/ui/ui-blueprint.html` (module 16 'Setup' (Stage 1)): "W('Site opening and closure', 'Readiness · Closure checklist'), W('Data export')"

- **What disagrees.** phases.md never mentions Site opening or readiness, which gates every activity. The blueprint tags the whole Setup module Stage 1 without page-level stage notes, though closure and export are stage 5 (PRD-ACP-015, -019); other Setup pages also depend on later stages.
- **Higher rule.** PRD-LIF-001, PRD-LIF-002, PRD-LIF-020 to -022; PRD-ACP-015, -019
- **Fix.** Add Site and business-unit readiness (PRD-LIF-001/002) to stage 1 scope; add per-page stage notes in Setup (closure checklist and Data export 'Stage 5').
- **Files to edit.** `docs/phases.md`, `docs/design/ui/ui-blueprint.html`
- **Owner.** product owner. **Blocks.** 1; 5. **Needs a product-owner decision.** no.
- **Sceptic notes.** Edit only docs/phases.md and docs/design/ui/ui-blueprint.html. Do not edit the PRD, and no DEC is needed.

phases.md:
- Stage 1 scope: add "Site and business-unit readiness for receiving, movement and selling (PRD-LIF-001, PRD-LIF-002): the readiness record and gating rules, exercised with synthetic data."
- Stage 1 exit checks: add "An activity stays disabled for a Site or business unit until its readiness checks pass."
- Stages 2, 3 and 4 (a short line each in scope, or in the exit checks): "enable receiving / movement / selling only after readiness approval."
- Stage 5 already covers closure, relocation and export. Optionally cite PRD-LIF-017 to -022 there.

ui-blueprint.html, module 16 Setup:
- Add page-level stage notes using the existing D('Stage N') convention.
- Mark 'Site opening and closure' as Readiness: Stage 1 (enables each activity at its own stage); Closure checklist: Stage 5.
- Mark 'Data export' as Stage 5.
- Optionally note that other Setup pages depend on later stages, such as Posting maps (stage 5).

Do not tag the whole Setup module as Stage 1 alone.

### N-67 · gap · Stage exit checks drop incentive golden cases from PRD-ACP-018 and PRD-MOD-007

- `docs/prd.md` (PRD-ACP-018): "Shared golden cases validate prices, discounts, tax, rounding, incentives and posting; real PostgreSQL concurrency and scoped browser journeys enforce the same rules."
- `docs/phases.md` (Stage 1 'Exit checks' bullet 2 and 'Offline design'): "Shared golden cases for prices, discounts, tax and rounding pass on server and counter code."
- `docs/phases.md` (Stage 6 'Exit checks'): "Attendance correction, returned-sale incentives and payroll replay preserve raw evidence and one approved period outcome."

- **What disagrees.** PRD-ACP-018 and PRD-MOD-007 include incentive logic in the shared golden cases; stage 1 lists only prices, discounts, tax and rounding, stage 6 has no golden-case check, and the stage 1 'Offline design' bullet omits discount allocation and incentives.
- **Higher rule.** PRD-ACP-018; PRD-MOD-007
- **Fix.** Add incentive golden cases to stage 6 exit checks citing PRD-ACP-018; align the stage 1 Offline design bullet with PRD-MOD-007.
- **Files to edit.** `docs/phases.md`
- **Owner.** product owner. **Blocks.** 6. **Needs a product-owner decision.** no.
- **Sceptic notes.** Add an incentive golden-case exit check to Stage 6, citing PRD-ACP-018. Cover returned-sale reversal and policy-version effects, and require the same cases to run on server and counter code if the shared module is used at the counter. In the Stage 1 Offline design bullet, add "discount allocation" to match PRD-MOD-007. Say that the shared module also hosts incentive logic, but that its golden cases are exercised in stage 6, so stage 1 does not claim incentive tests before the incentive feature exists. / Edit docs/phases.md only. (1) Stage 6 exit checks: add a bullet such as "Shared golden cases for incentives, including returned-sale reversals, pass on the shared logic (PRD-ACP-018, PRD-MOD-007)." Use no numeric values or scheme rules. (2) Stage 1 Offline design and exit check 2: add "discount allocation" to the list (pricing, tax, discount allocation and rounding). Do not add incentives to stage 1. Optionally add a note that incentive golden cases are completed in stage 6 once the Workforce policy exists.

### N-68 · gap · Stock ledger says the net realisable value write-down goes live in stage 5 but stage 5 scope does not list it

- `docs/design/stock/stock-ledger.md` (2.3, 'Net realisable value write-down' row): "Value only (`PRD-LED-007`) | 5"
- `docs/phases.md` (Stage 5 'In scope', 'Ledger and official books'): "Ledger and official books: reconciliations, period locks, month close, Tally XML exchange."

- **What disagrees.** PRD-LED-007 NRV write-downs are absent from the stage 5 ledger bullet; SL-5 and CA question 12 are also stage 5.
- **Higher rule.** PRD-LED-007; phases.md order
- **Fix.** Add 'net realisable value write-downs (PRD-LED-007)' to the stage 5 ledger bullet.
- **Files to edit.** `docs/phases.md`
- **Owner.** product owner. **Blocks.** 5. **Needs a product-owner decision.** no.

### N-69 · gap · Test-setup limits missing from deployment.md section 7 (no stock movement from imports, no tax invoice, test bills only) and backup/restore covers PostgreSQL only

- `docs/design/platform/deployment.md` (section 7 lead-in): "These follow from `PRD-LIF-016` and `PRD-LIF-026`. Each external adapter on `kdps-test` is either switched off or pointed at a sandbox:"
- `docs/prd.md` (PRD-LIF-026): "A side-by-side test on test hosting keeps the earlier POS as the system of record; it issues no tax invoice and bills no real customer."
- `docs/design/platform/deployment.md` (section 4 Backups): "Turn on Railway's scheduled PostgreSQL backups on `kdps-test`, and practise one restore so the steps are known before the go-live drill (`POL-18.03`)."
- `docs/phases.md` (Stage 1 exit checks): "A backup restores with linked records and attachments."
- `docs/prd.md` (PRD-SEC-012): "Provide reliable backup, restore verification and export recovery for records and attachments"

- **What disagrees.** Section 7 lists only external adapters and never states that the old-POS import never moves stock (PRD-LIF-014) or that kdps-test bills are test bills with no tax invoice (PRD-LIF-026); the header omits PRD-LIF-013/014. Section 4 rehearses restore for PostgreSQL only, so it cannot show 'linked records and attachments', and file storage (provider OPEN) has no backup step.
- **Higher rule.** PRD-LIF-013, PRD-LIF-014, PRD-LIF-026; PRD-SEC-012; PRD-ACP-019; POL-18.02
- **Fix.** Add rows to section 7 for the three limits (and PRD-LIF-013/014 to the header); extend section 4 so the restore rehearsal covers the file-storage bucket and attachment links, noting dependence on D-2.
- **Files to edit.** `docs/design/platform/deployment.md`
- **Owner.** product owner. **Blocks.** 1; 2. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the fix, but make the attachment-backup part primary. Extend section 4 Backups so the restore rehearsal covers the file-storage bucket and attachment links, and note the dependence on D-2. For section 7, add short rows or a lead-in sentence for the stock and tax-invoice limits. State that kdps-test bills are test bills with no tax invoice (PRD-LIF-026), that the old-POS import never creates a tax invoice (PRD-LIF-016) and that it never moves stock (PRD-LIF-014). Add PRD-LIF-013 and PRD-LIF-014 to the header. Nothing in this fix needs a product-owner decision. / The fix is basically right. Two refinements:
- In section 7, add rows or lines using only existing rule wording: "Old-POS imports never create, reduce or move stock (PRD-LIF-014)" and "Bills on kdps-test are test bills only. No tax invoice and no real customer billed (PRD-LIF-026)". Add PRD-LIF-013 and PRD-LIF-014 to the "Implements" header.
- In section 4, state that the restore rehearsal also checks that attachments and their links return, with the file-storage backup mechanism depending on the provider chosen in D-2. Do not name a Railway bucket backup feature or any new frequency or retention value.

### N-70 · gap · deployment.md does not say which authentication kdps-test (real data, staff logins) uses; POL-02.17 allows an easier path only in development

- `docs/design/platform/deployment.md` (section 3 last paragraph): "production requires TOTP (`POL-02.17`). Hosting changes neither."
- `docs/kdps-policies.md` (POL-02.17): "Any easier test path is development-only and cannot weaken production authentication."
- `docs/prd.md` (PRD-ACS-017): "Keep development test access separate from production authentication."

- **What disagrees.** kdps-test is neither development nor production, holds real data on the public internet, and its login rule is left unstated.
- **Higher rule.** POL-02.17; PRD-ACS-017; PRD-SEC-001
- **Fix.** State which environments may use the development-only path (dev, synthetic data only) and that kdps-test uses production authentication (TOTP), or raise it as OPEN to the product owner and Admin; add PRD-ACS-017 to the header.
- **Files to edit.** `docs/design/platform/deployment.md`
- **Owner.** product owner (Admin to validate). **Blocks.** before the side-by-side test. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Edit only docs/design/platform/deployment.md. (1) Add PRD-ACS-017 to the header "Implements" line. (2) In the last paragraph of section 3, state that kdps-test holds real data and follows PRD-SEC-001 and POL-02.17 as written: password plus authenticator-app TOTP, with no easier path. This is derived from PRD-SEC-001, which has no environment carve-out, and from POL-02.17, which allows an easier path only in development. Do not invent the content of any development-only path. (3) Mark as OPEN whether dev may use an easier test path under POL-02.17 and PRD-ACS-017, and what that path is. Add this as row D-6 in section 10, with the product owner as decider and the Admin validating (V-04). Mark it as needed before the side-by-side test. If the product owner wants kdps-test treated as non-production for login purposes, that is a policy change, so log a DEC and edit POL-02.17 first. Do not decide it in the design document.

### N-71 · gap · deployment.md says losing test data loses nothing official, but phases.md has the approved PT exported from the test setup into the live POS

- `docs/design/platform/deployment.md` (section 4 Backups): "The current POS is the system of record, so losing test data loses nothing official."
- `docs/phases.md` (Testing and switch-over Rules): "Apparel OS exports the approved PT in the KDPS layout so the current POS can load it. This depends on the current POS accepting that file and must be confirmed."
- `docs/design/stock/stock-ledger.md` (section 9): "Nothing moves from the test setup to production"

- **What disagrees.** If PTs are exported from kdps-test into the live POS, test-setup output feeds the system of record, so loss or error there is not harmless; deployment.md section 7 and open questions do not mention this outbound flow.
- **Higher rule.** PRD-LIF-026; PRD Words used (Official); phases.md Testing and switch-over
- **Fix.** Decide whether PT export happens from kdps-test during the test. If yes, list it in section 7 and reword the backup sentence; if no, say in phases.md that the export is a stage 2 feature used only on production hosting or by hand.
- **Files to edit.** `docs/design/platform/deployment.md`, `docs/phases.md`
- **Owner.** product owner. **Blocks.** 2. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the finding as a product-owner decision, but replace the "no" branch. The likely answer is yes. If yes: in deployment.md add one line to section 7 or section 4 saying PT export is a manually downloaded KDPS-layout file that a person loads into the current POS, with no adapter or automatic push. Reword the backup sentence so it says test data is not an official record, but an approved PT already loaded into the current POS exists there and a wrong export is a data error in the system of record. Add an open question in section 10 if the product owner wants one. In phases.md, state that the export is used during the side-by-side run on kdps-test, and keep the existing note that it depends on the current POS accepting the file. If no: record in phases.md that the export is not used during the test, and that PT entry into the current POS stays manual until a later stage. Do not say "production hosting only". Make no change to the PRD or policies. Record the choice as a new DEC.

### N-72 · gap · Policy tags in the blueprint do not follow DEC-005, DEC-008, DEC-014 policy homes (missing Policies 2, 10, 11, 15, 19)

- `docs/design/ui/ui-blueprint.html` (header intro; module 11 Store day; module 02 Till session; module 10 Offers; Devices page): "Amber tags such as Policy 2 name the KDPS policy a page needs before it can be used live. … W('Store day', 'Opening cash · Denominations · Variance · Petty cash · Pickup and deposit', 'Policy 9') … L('Offers', 'Draft · Awaiting approval · Live · Ended') [no tag] … L('Devices, tills and bill series', null, 'Policy 16')"
- `docs/kdps-policies.md` (POL-02.13, POL-19.03, POL-10.07): "Record every day-close cash difference. A Store Manager may approve within a configured limit; Accounts approves above it. ... Offer activation and markdown publication remain unavailable until the applicable rules and approvers are configured under policies 19 and 2."

- **What disagrees.** Day-close variance pages carry only Policy 9 though tolerance and approvers are policy 2; no Offers page carries Policy 19; the bill-series page lacks Policy 10 (POL-10.07); policy 15 suggestion pages and policy 11 Ledger/Tally pages are untagged. Report C-08 covers only the ledger wording.
- **Higher rule.** PRD Required policy configuration; DEC-005, DEC-008, DEC-014; POL-02.13, POL-19.03, POL-10.07
- **Fix.** Add Policy 2 to Store day and Till session, Policy 19 (and 2) to Offers pages, Policy 10 to the bill-series page, Policy 15 to suggestion pages, Policy 11 to Ledger and Tally exchange.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`
- **Owner.** design (UI). **Blocks.** 4. **Needs a product-owner decision.** no.
- **Sceptic notes.** In docs/design/ui/ui-blueprint.html make these changes. Store day: 'Policies 2, 9'. Till session: 'Policies 2, 9'. Offers and Offer: 'Policies 19, 2' (offer activation needs both under POL-19.03). Markdown suggestions: add Policy 19 for markdown approval authority; optionally add Policy 15 as well, since POL-15.01 and .06 cover the proposals and the page is a stage 6 page. Devices, tills and bill series: 'Policies 10, 16'. Buying suggestions and other planning suggestion pages: optionally add Policy 15, but cite the PRD Planning row and POL-15, not DEC-005, DEC-008 or DEC-014. Do not add Policy 11 to Ledger, trial balance or Tally exchange. Keep Tally exchange on Policy 9. Drop the DEC-005, DEC-008 and DEC-014 citation for the Policy 11 and Policy 15 items. Remove the C-08 reference, or replace it with E-7. / Edit only docs/design/ui/ui-blueprint.html. Make these tag changes:
- Store day: 'Policies 2, 9'.
- Till session: 'Policies 2, 9'.
- Offers, Offer, Running offers, End-of-season price lists: 'Policies 2, 19'.
- Devices, tills and bill series: 'Policies 10, 16'.
- Buying suggestions, Replenishment and rebalancing, Markdown suggestions: Policy 15 (Markdown suggestions also Policy 19). Keep the 'Stage 6' note, either by folding both into the tag slot or by moving the note into the page's description line.
Do not add Policy 11 to Tally exchange or to Ledger and trial balance. Tally exchange stays 'Policy 9' (POL-09.15 to POL-09.17). Ledger and trial balance can stay untagged unless the product owner decides the Policy 11 gating applies there.

### N-73 · gap · Blueprint Store day and Till session omit tender reconciliation, closing checklist and MBO opening checklist, and duplicate opening cash and day close

- `docs/design/ui/ui-blueprint.html` (module 02 Till session; module 11 Store day): "W('Till session', 'Opening cash · Till summary · Day close', 'Policy 9') … W('Store day', 'Opening cash · Denominations · Variance · Petty cash · Pickup and deposit', 'Policy 9')"
- `docs/prd.md` (PRD-UXP-006, PRD-UXP-010, Words used 'Day close'): "MBO opening includes attendance, readiness checklist, opening cash and till start; day close includes counted cash, tender reconciliation and closing checklist. … Provide one operational path for each business action."

- **What disagrees.** Neither page has tender reconciliation, a closing checklist or an opening readiness checklist, and opening cash and day close sit on two pages in two modules, against the one-path rule.
- **Higher rule.** PRD-UXP-006, PRD-UXP-010, PRD-CSH-001; PRD 'Day close' definition
- **Fix.** Pick one home for store day with Opening (readiness checklist, attendance, opening cash, till start) and Close (counted cash, tender reconciliation, variance, closing checklist); make the other a link.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`
- **Owner.** design (UI). **Blocks.** 4. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the proposed fix, with one refinement. Don't remove Till summary from Till session. A till summary is per till, and the PRD does not say it belongs to the store day. Pick one home for the store-day flow. Module 11 Money › Store day is the natural home, because the Store manager persona (P-STM) already navigates Money › Store day. Give it two parts. Opening has the readiness checklist, attendance, opening cash and till start. Close has counted cash by denomination, tender reconciliation, variance and the closing checklist. Keep Petty cash and Pickup and deposit there. Reduce module 02 Till session to Till summary, plus a link to Store day for opening and close. Remove the duplicated "Opening cash" and "Day close" labels from Till session. Use only PRD-named items and add no thresholds or tolerances. The variance tolerance and who approves stay OPEN under POL-09. The EBO Portal "Today checklist" (P-EBO) should point to the same page or be stated as the same checklist, which keeps one path. Also check the module 02 and module 11 action strings and the P-STM landing text ("day close") so they name the one page.

### N-74 · gap · Blueprint menus and grid name screens that no page provides (Integrations, Layouts, document numbering, CA comments and requests; Reports tabs)

- `docs/design/ui/ui-blueprint.html` (P-ADM menu; rbac Admin; P-CHA menu): "{ s: 'Setup', t: 'Everything: users, roles, devices, layouts, integrations' } … External sales 'O|Layouts' … Money 'O|Integrations' … { s: 'Money', t: 'Books and reports in scope · comments · document requests' }"
- `docs/design/ui/ui-blueprint.html` (menus P-BKG, P-BRM, P-HRS, P-CHA vs module 12 Reports pages): "{ s: 'Reports', t: 'Supplier performance' } … 'Brand performance' … 'Attendance · Staff' … 'Profit · GST' vs Reports pages: Business measures, Sales, Stock health, Profit, Ask a question, Metric definitions, Exports"
- `docs/prd.md` (PRD-TAX-007; PRD-EXC-012): "Provide a statutory calendar and scoped CA access to reports, comments and document requests."

- **What disagrees.** Setup, External sales and Money have no Integrations, Layouts, document numbering or comments/document-request pages ('Saved layouts' is a Receive Goods tab Admin cannot open). Four menus point to Reports tabs that are other modules' pages (Supplier performance, GST, Attendance) and there is no Brand performance page (PRD-EXC-012). Related to C-06.
- **Higher rule.** PRD P-ADM and P-CHA work; PRD-TAX-007; PRD-EXC-005, -006, -012; phases.md stage 1
- **Fix.** Add the missing Setup pages (Integrations, Saved layouts, Document numbering), a CA Comments and document requests page, and the missing report pages, or point each menu entry at the module that holds the page or remove the claims.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`
- **Owner.** design (UI). **Blocks.** 1. **Needs a product-owner decision.** no.
- **Sceptic notes.** Edit only docs/design/ui/ui-blueprint.html. (1) Add an Integrations page to Setup (module 16), citing P-ADM "integration administration" and PRD-SEC-013. (2) Either add a Saved layouts page under Setup or point Admin's rbac cells ('O|Layouts' under External sales, 'O|Integrations' under Money) at the Setup pages. (3) Add a CA comments and document requests page to Money (PRD-TAX-007, P-CHA), or reword the P-CHA menu. (4) Align the Reports menu tabs with module 12's pages: link Supplier performance, GST and Attendance to their home modules, and map Brand performance to Sales by brand and Stock health sell-through (PRD-EXC-012), or add a Brand performance page. Drop the "document numbering" claim, since "Devices, tills and bill series" already covers it. Do not edit the PRD or policies, and invent no values.

### N-75 · gap · Open item 13 (go/no-go pass marks) in the blueprint lumps already-set checks with open values and says it blocks only the pilot switch

- `docs/design/ui/ui-blueprint.html` (gaps item 13): "Go or no-go pass marks. Set the run length and material-difference threshold. Require no unexplained material difference, no open serious exception and training for every participating staff member. | KDPS · phases.md | Blocks: pilot switch"
- `docs/phases.md` (Go or no-go pass marks table): "Run length of the side-by-side test | OPEN — KDPS Owner, before test run … Material-difference threshold per Store, at the switch count | OPEN — KDPS Owner and Accounts, before the first switch"

- **What disagrees.** Run length is needed before the test run and the threshold before the first switch; the blueprint blocks both on the pilot switch with 'KDPS' as decider and lists set checks as open.
- **Higher rule.** phases.md pass marks; POL-14.01; AGENTS.md OPEN-owner rule
- **Fix.** Split item 13: run length (KDPS Owner, stage 2) and threshold (KDPS Owner and Accounts, stage 4); drop the already-set checks.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`
- **Owner.** design (UI). **Blocks.** 2 (run length); 4 (threshold). **Needs a product-owner decision.** no.
- **Sceptic notes.** Split item 13 into two open items. Run length: KDPS Owner, blocks the stage 2 test run. Material-difference threshold per Store: KDPS Owner and Accounts, blocks the stage 4 first switch. Do not simply delete the settled checks. Either move them to a one-line note such as 'Already set in phases.md: no unexplained difference at the count, no open serious exception, all participating staff trained, switch signed by Owner, Accounts and Operations', or drop them from the gaps list with a pointer to phases.md. Do not describe the blueprint as listing the set checks as open. / In docs/design/ui/ui-blueprint.html, replace gaps item 13 with two items, or one item with two clearly separated open values, and drop the already-set checks (None, None, All, signers). Item 13a: "Side-by-side test run length." Decider "KDPS Owner · phases.md"; "Blocks: start of the side-by-side test". Item 13b: "Material-difference threshold per Store, at the switch count." Decider "KDPS Owner and Accounts · phases.md"; "Blocks: first Store switch (stage 4)". Copy the "before test run" and "before the first switch" timing from phases.md. Do not assert "stage 2" unless phases.md is first changed to say it, which needs a DEC. Optionally keep one line in 13b noting that the other pass marks are set in phases.md, with no new values. Update the item count wherever the blueprint states it (gapCount is computed from the array).

### N-76 · gap · Blueprint open-items list carries settled items as questions and a CA policy value as 'Design work'; section 0 claims all open values are listed

- `docs/design/ui/ui-blueprint.html` (section 5 intro; gaps 15, 16, 20): "PRD question = needs your decision in the PRD. … G('15', 'prd', 'Quick re-check at the till.', 'Settled by POL-02.17. …') … G('16', 'prd', 'Store P&L.', 'Settled by DEC-011: …') … G('20', 'design', 'Bill number.', 'A format within 16 characters that includes the counter series.', 'KDPS and CA', …)"
- `docs/design/ui/ui-blueprint.html` (section 0 intro): "Open values and questions are in 5 · Open items."
- `docs/reports/alignment-report.md` (section 5, V-07, V-10, V-12, V-22, V-38, V-39, V-46): "V-07 Accounting framework: AS or Ind AS … V-39 Petty-cash float and limits per Store … V-46 Tally voucher types …"

- **What disagrees.** Items 15 and 16 say 'Settled' under 'PRD question'; item 20 is a CA-decided policy value (POL-10.07, V-40) labelled 'Design work', says '16 characters' as fact (E-1 wrongly calls G20 neutral; extends C-09) and 'counter series' where PRD-POS-020 says device. Pages tagged Policies 1, 5, 9, 12, 13, 14 and 18 have no matching item in section 5, so the completeness claim is false.
- **Higher rule.** PRD-POS-020; POL-10.07; AGENTS.md 'Mark every unknown as OPEN and name its owner'
- **Fix.** Remove items 15 and 16 or move them to a Settled group; reclassify item 20 as a KDPS value owned by the CA under policy 10 ('within the statutory limit, CA to confirm', 'billing device'); also fix design-language §12 and E-1; either add rows for the missing V values or reword sections 0 and 5 to say the list is a subset.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`, `docs/design/ui/design-language.md`, `docs/reports/alignment-report.md`
- **Owner.** design (UI). **Blocks.** 1-6 (per value). **Needs a product-owner decision.** no.
- **Sceptic notes.** In ui-blueprint.html:
- Move items 15 and 16 out of the "PRD question" group into a "Settled" note, or remove them.
- Reclassify item 20 as a KDPS value owned by the CA under policy 10 (POL-10.07, V-40). Reword it to "Bill-number format per tax registration, within the statutory limit; CA to confirm", with one series per billing device.
- Either add rows for the V values missing from section 5, or reword section 0 and the section 5 intro to say the list is a subset, with the full list in the alignment report.

Make the same wording changes in design-language.md §8 (line 303) and §12 (line 680): say "billing device" instead of "counter", and keep the 16-character figure only as "the statutory limit, CA to confirm".

Update alignment-report.md E-1 to match. Do not edit the PRD or the policies.

### N-78 · gap · Design documents do not cite requirement and policy IDs as AGENTS.md requires

- `AGENTS.md` (Alignment rules): "Design documents cite the requirement and policy IDs they implement: in their header and next to each rule they apply."
- `docs/design/access/personas.md` (header): "Implements these PRD sections: People, access and approvals; Operator experience; Franchise and partner accounts; HRMS and payroll. Policy: 2 (permissions and approvals)."
- `docs/design/ui/design-language.md` (header): "Policies: 2 (scope, approval limits), 3 (PT costing), 6 and 7 (returns, refunds, tenders), 16 (offline), 17 (held goods), 19 (offers and promotions)."

- **What disagrees.** stock-ledger.md (181 IDs) and deployment.md (17) comply. personas.md and ui/README.md cite none, design-language.md two (PRD-MER-016, PRD-ACS-015), ui-blueprint.html five and design-system.html and the preview none; they cite section names and policy numbers only. The alignment report still refers to blueprint items by retired 'G12'/'G20' codes and says UI codes should be mapped, though the blueprint now numbers items 1 to 24.
- **Higher rule.** AGENTS.md alignment rules; docs/design/README.md
- **Fix.** Add ID lists to the headers of personas.md, design-language.md, ui/README.md, both HTML files and the preview; cite IDs beside the rules (approval panel, tenders, offline till, state names, persona approvals); update report E-1, E-4 and section 7 to the blueprint's current item numbers.
- **Files to edit.** `docs/design/access/personas.md`, `docs/design/ui/design-language.md`, `docs/design/ui/README.md`, `docs/design/ui/ui-blueprint.html`, `docs/design/ui/design-system.html`, `docs/design/ui/design-system-preview.html`, `docs/reports/alignment-report.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the fix, with two cautions. (1) Take every cited ID from the current prd.md and kdps-policies.md. Do not invent IDs or infer them from section names. Where a rule has no matching ID, leave it uncited and note it, or propose a PRD ID through a DEC. (2) The alignment report is an unranked, dated snapshot ("decides nothing"). Updating the G12/G20 references in E-1, E-4 and section 7 is optional housekeeping, and it should not outrank the design-file edits. If you do it, change only the code references and note that they now point at the blueprint's current item numbers.

### N-79 · gap · Personas.md states partner users, service identities and no-login parties as settled; the PRD and policy 12 do not, and the partner portal has no persona

- `docs/design/access/personas.md` (section 4): "Partner users | They hold Store personas (P-STM, P-CSH, P-SLS) on their own Stores only. Their statements and ledger come from a permission"
- `docs/design/ui/design-language.md` (§6C Portal Partner): "Partner users hold Store personas on those Stores; there is no separate partner persona."
- `docs/prd.md` (PRD-FRN-001; PRD-ACS-002): "Maintain partner leads, active agreements and exit, with access limited to their authorised Stores and records. / Personas set home screens, menus and summaries; only role assignments grant access."

- **What disagrees.** The PRD lists 14 personas, none a partner, and never says partner staff are users holding Store personas or that service identities exist. Store personas land on the back office or till, not on a Partner portal with Dashboard, Statements and Ledger; no persona sets that home screen.
- **Higher rule.** AGENTS.md 'A business decision is never settled in design or code'; PRD-FRN-001; PRD-ACS-002
- **Fix.** Product owner decides via PRD change or DEC whether partner users are users and how classified, and whether service identities are a PRD concept (PRD-SEC-007, PRD-INT-007); until then mark the rows and the portal OPEN in §12.
- **Files to edit.** `docs/design/access/personas.md`, `docs/design/ui/design-language.md`
- **Owner.** product owner. **Blocks.** 5 (franchise); 1 (service identities). **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the fix, with these precisions. (1) Raise the question to the product owner as a proposed DEC against PRD-FRN-001, PRD-ACS-002 and the People, access and approvals persona table. The questions are whether partner staff are users, and how they are classified or onboarded. (2) Ask separately whether service identities are a PRD concept, anchored on PRD-SEC-007 and PRD-INT-007. Neither says anything about them today. (3) Until decided, edit only the lower documents. In docs/design/access/personas.md, add OPEN rows to section 6 "Open items", because that file has no section 12. The rows cover partner users' classification and Store-persona holding (product owner, stage 5) and service identities (product owner, stage 1). Mark the section 4 rows for Partner users and Service identities as provisional/OPEN. In docs/design/ui/design-language.md, add a row to section 12 "Open items" and mark the Partner shell on line 191 as provisional. Also flag the X-SVC entries at personas.md line 169 and ui-blueprint.html line 436. Do not edit docs/prd.md or docs/kdps-policies.md until the owner decides and a DEC is logged.

### N-80 · gap · personas.md shows 'phone' and 'phone scan' screens while the phone client is unplaced and the PRD names only keyboard-input scanners

- `docs/design/access/personas.md` (section 2 table): "| P-WHS | Warehouse | Warehouse | Back office, phone scan | ... | P-OWN ... Back office, phone"
- `docs/phases.md` (How the stages are cut): "The phone client is not yet placed in a stage."
- `docs/prd.md` (Stack, Hardware row): "Keyboard-input scanners, ESC/POS printing and cash drawer via local helper; Tauri only for an unmet hardware requirement"

- **What disagrees.** It is unclear whether 'phone' means the unplaced React Native client or responsive web (design-language 6D); 'phone scan' implies camera scanning not provided by the PRD Hardware row.
- **Higher rule.** PRD Stack (Phone, Hardware); phases.md
- **Fix.** Say 'phone (responsive web until the phone client is placed in a stage)', mark 'phone scan' proposed; raise camera scanning for a PRD Hardware change if wanted.
- **Files to edit.** `docs/design/access/personas.md`, `docs/design/ui/design-language.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** In personas.md, add a one-line note under the section 2 table: "phone = responsive web (design-language 6D) until the phone client is placed in a stage". Mark "phone scan" as proposed camera scanning. In design-language.md, only annotate the line 201 "Camera viewfinder" as pending a PRD Hardware change. The Mobile section already states the phone meaning, so leave it as is. / Edit only the lower documents, and invent no values. In personas.md section 2, add a short note under the table, or change the cells, so that "phone" reads as "phone (responsive web; see design-language 6D; the separate phone client is not yet placed in a stage)". Do not redefine it, because 6D already settles it. Mark "phone scan" for P-WHS as proposed, and state that camera scanning is OPEN and owned by the product owner. In design-language.md 6D, mark the "Camera viewfinder" line the same way: OPEN, owner product owner, because the PRD Hardware row lists only keyboard-input scanners. Do not edit prd.md or kdps-policies.md directly. If the product owner wants camera scanning, propose a DEC-nnn that amends the PRD Hardware row, then update the PRD and the design docs to match. Severity is minor to gap, since the phone-meaning part is already settled by 6D.

### N-81 · gap · Design-language §10.17 policy gate covers only synthetic data and a 'Test data' chip, but the side-by-side test runs on real data

- `docs/design/ui/design-language.md` (§10.17): "With synthetic test data the action works, and every screen shows a “Test data” chip."
- `docs/design/platform/deployment.md` (§1 Two environments): "| `kdps-test` | Real KDPS data for the side-by-side test | KDPS staff, through app logins only |"
- `docs/prd.md` (PRD-LIF-026): "A side-by-side test on test hosting keeps the earlier POS as the system of record; it issues no tax invoice and bills no real customer."

- **What disagrees.** On kdps-test the data is real and policies are unsigned; the design does not say whether gated actions work or how screens show 'test environment, not the system of record'. A 'Test data' chip would mislabel real data. The design-system 4A-4D shells show no chip, and the one shown uses the Pending family.
- **Higher rule.** PRD-LIF-026; Required policy configuration; AGENTS.md (synthetic data labelled)
- **Fix.** Ask the product owner whether policy-gated actions may run on kdps-test with real data before signature; then add an environment banner and define which chip appears for synthetic versus real test-setup data (and its family).
- **Files to edit.** `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the proposed fix: ask the product owner first, record the answer as a new DEC, then update the lower documents. Add docs/design/ui/ui-blueprint.html (the "Policy gate" row at line 323) to files_to_edit. No PRD or policy edit is needed unless the product owner's answer changes PRD-LIF-026 or the "Required policy configuration" rule. Do not pick a chip family or banner wording until the product owner answers.

### N-82 · gap · Design-language gaps against the PRD: payment states, approval-panel unknown value, non-INR formats, partner and device-trouble rules, stepper

- `docs/prd.md` (PRD-POS-010): "Distinguish manually recorded card/UPI collections from provider-confirmed attempts and from final bank settlement."
- `docs/design/ui/design-language.md` (§7 row 19): "| 19 | Confirmed | Done | ✓ | Booking (supplier accepted), damage report, card or UPI payment, refund |"
- `docs/prd.md` (PRD-ACS-016): "When a request's value on its basis is unknown, only a person whose authority explicitly covers unknown value may approve it; otherwise it stays pending. Unknown value never counts as zero."
- `docs/design/ui/design-language.md` (§10.14 States table and Scale): "| Within limit | ... | Above limit | ... | No approver set up | ... | Preparer | ... | No upper limit | ...   Scale: “₹0 · Your limit up to ₹X · Next: <next approver>”."
- `docs/prd.md` (PRD-MOD-014, PRD-ORG-011, PRD-MER-010): "other enabled currencies use their configured integer minor units ... Support packaged-goods units of measure, packs and conversions"
- `docs/design/ui/design-language.md` (§8): "Money · record ... ₹ + Indian grouping + 2 decimals | Quantity | Indian grouping, whole numbers | 1,08,420 pcs"

- **What disagrees.** There is no state to tell a manual card/UPI record from provider-confirmed or settled; the approval panel has no 'value unknown or disputed' case and its ₹ scale cannot show quantity or percentage limits (PRD-ACS-015); formats hard-code ₹, 2 decimals, whole numbers and 'pcs' though the PRD allows other currencies and units (piece, pair, pack).
- **Higher rule.** PRD-POS-010, PRD-POS-021, PRD-CSH-010, PRD-ACS-015, PRD-ACS-016, PRD-MOD-014, PRD-ORG-011, PRD-MER-010, POL-02.09, POL-04.03, POL-16.02
- **Fix.** Add states or chips 'Recorded manually', 'Provider-confirmed', 'Settled' (Confirmed only for provider or bank evidence); add a 'Value unknown' approval case with Approve disabled and unit-aware scale; state the formats are for INR and units come from the product's stock unit, or mark multi-currency OPEN (product owner).
- **Files to edit.** `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`
- **Owner.** design owner; product owner if multi-currency is in scope. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the proposed fix. Add 'Recorded manually', 'Provider-confirmed' and 'Settled' states, and restrict 'Confirmed' to provider or bank evidence (row 19). Add a 'Value unknown' case to the §10.14 states table with Approve disabled, unless the viewer's authority explicitly covers unknown value. Make the scale unit-aware for amount, quantity or percentage per PRD-ACS-015. In §8, scope the ₹ and 2-decimal formats to INR, take quantity units from the product stock unit (piece, pair or pack, per POL-04.03), and mark multi-currency OPEN for the product owner. Mirror the changes in design-system.html. Trim the title, or add evidence for the partner, device-trouble and stepper items. / Keep the proposed fix, with these refinements. Add the three payment states to §7 inside existing families, because §7 says new states must join one. Narrow row 19 so "Confirmed" no longer covers a manual card or UPI record. In §10.14, add a "Value unknown" case with Approve disabled unless the approver's authority explicitly covers unknown value. Make the scale unit-aware, showing the limit's basis as quantity, percentage or amount. Do not show a zero marker for an unknown value. For §8, say the formats apply to INR and that units come from the product's stock unit. Mark non-INR currency formats and any unit formats the PRD leaves open as OPEN, owned by the product owner, and name the stage they block. Make no PRD or policy edit and add no DEC.

### N-83 · gap · Design-language §12 open items use non-PRD owners, are not marked OPEN and give stages the PRD does not support

- `AGENTS.md` (Never invent a value): "Mark every unknown as **OPEN** and name its owner: the product owner, the KDPS Owner, the CA or Accounts (or another PRD persona the PRD names as decider). Say which delivery stage it blocks."
- `docs/design/ui/design-language.md` (§12): "| Reason list (Setup › Reason codes) | KDPS | Stage 2 |  ...  | Finance screen detail | Design | Stage 5 |  | Hindi text and a Devanagari font check | Design and KDPS | Stage 5 |  | Logo artwork | KDPS | Pilot switch |"
- `docs/prd.md` (PRD-ACS-010): "Support approve/reject with reasons, evidence, comments, delegation during absence and escalation of overdue work."

- **What disagrees.** Owners are 'KDPS', 'Design' or 'KDPS and CA', none a named decider; no row says OPEN. The reason list is stage 2 though approve/reject with reasons is stage 1, 'Pilot switch' is not a stage, and the reason codes have no PRD or policy home. Blueprint G18/G19 repeat this.
- **Higher rule.** AGENTS.md 'Never invent a value'; PRD Required policy configuration
- **Fix.** Relabel owners (KDPS Owner, Accounts, CA, product owner), mark each OPEN with its blocked stage, move the reason list to stage 1 or give it a policy-2 home, rename 'Pilot switch' to 'before the stage 4 pilot switch'; make the same change to blueprint G18 and G19.
- **Files to edit.** `docs/design/ui/design-language.md`, `docs/design/ui/ui-blueprint.html`
- **Owner.** design owner; product owner for the reason-list home. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Edit only design-language.md §12 and blueprint G18, G19, G20, G22 and G23. Do not edit the PRD or policies.

1. Replace the bare "KDPS" and "KDPS and CA" owners with named deciders. Use "KDPS Owner", "Accounts and CA" for the bill number format, and "KDPS Owner, policy 2" for the approval limits row. Keep "Design" as owner for the purely design tasks (finance screen layouts and the Devanagari font check). Add a "KDPS Owner" co-owner only where real KDPS input is needed, such as Hindi text review.
2. Retitle the section "Open items (OPEN)", or add a "Status: OPEN" column, so each row is explicitly marked OPEN.
3. Change "Pilot switch" to "Stage 4, before the pilot switch". This is the PRD and policy wording, so do not rename it or invent a stage.
4. Do not move the reason list to stage 1 or give it a policy-2 home. Mark the row OPEN, owner "KDPS Owner (product owner for where it lives)", and note that PRD-ACS-010 needs reasons from stage 1 approvals. Add the question to docs/questions-for-kdps.md. Propose a DEC to the product owner on whether reason codes belong in policy 2. Do not change the stage cell until that DEC is approved.
5. Split the reason list out of G18 so G18 covers only the sample delivery. Give the reason list its own entry.

### N-84 · gap · Design-language partial gaps: target-size claim, transfer states and mono list

- `docs/design/ui/design-language.md` (§9 Target size vs §10.7 and §10.5): "**Target size (2.5.8):** at least 24 × 24 px everywhere; 48 px on the till and portal.  |  Checkbox (16 px, radius 4), Radio (16 px), Toggle (34 × 20)  |  “My work” (13 / 500) + a 20 px pill"
- `docs/design/ui/design-language.md` (§7 rows 13 and 15): "| 13 | In transit | Moving | ▸ | Transfer dispatch, supplier-return shipment, cash in transit |  ...  | 15 | Dispatched | Moving | ▸ | Transfer |"
- `docs/prd.md` (PRD-TRF-005; PRD-TRF-013): "Record actual dispatch and arrival separately and safely once."
- `docs/design/ui/design-system.html` (1b Type note): "Codes (SKU, barcode, piece ID, doc no., bill no., persona ID) use mono."

- **What disagrees.** '24 × 24 everywhere' contradicts the 16 px radio, 20 px toggle and 20 px My work pill (only checkboxes get a 40 px hit area). Transfers have two near-identical Moving states with no rule for which shows (a multi-dispatch transfer fits either). §3's mono list omits piece ID and persona ID though design-system.html and §10.15/§10.18 use them.
- **Higher rule.** design-language.md §4, §7, §9; PRD-TRF-005, PRD-TRF-011
- **Fix.** Extend the hit-area rule to radio, toggle and My work or limit the claim; define when 'Dispatched' vs 'In transit' shows (or merge); add piece ID, persona ID and drawer reference to the §3 mono list.
- **Files to edit.** `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`
- **Owner.** design owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.

### N-85 · gap · Stock-ledger design gaps: business-unit moves, custody 'changed only by' list and count approval value recheck

- `docs/design/stock/stock-ledger.md` (section 7.1 vs section 2.3 'Location move'): "A move between business units at one Site is a location move when the book is the same ... / Within one Site: floor, backstore, rack, bin; keeps condition and acceptance (`PRD-STK-005`)"
- `docs/prd.md` (PRD-ORG-005; PRD-TRF-023): "Units at one Site may have different mappings; transactions use the relevant unit's mappings. / Determine statutory movement documents from configured ownership, entity, registration and movement rules."
- `docs/design/stock/stock-ledger.md` (section 3 table, Custody row): "Counts (receipt, arrival, return, opening, count difference), dispatch, handover, disposal, location and condition moves"
- `docs/design/stock/stock-ledger.md` (section 8.2 and 10.4): "The approval value is cost (`PRD-ACS-015`): the formula cost at approval, rechecked under lock at posting."
- `docs/kdps-policies.md` (POL-02.12): "Material changes after approval require renewed approval. These include changes to amount, quantity, price, supplier or customer, destination, commercial terms, or payment details when relevant to the action."

- **What disagrees.** Section 7.1 calls a business-unit change a 'location move' though 2.3 and PRD-STK-005 limit it to floor/backstore/rack/bin and units can differ in registration; no movement kind covers it. The custody 'Changed only by' column omits sale issue, supplier-return departure and failed-delivery return, lists 'return' under counts and uses ambiguous 'handover'. The approval value is rechecked under lock at posting but nothing says whether a changed cost voids the approval or needs renewed approval (PRD-ACS-007, POL-02.12).
- **Higher rule.** PRD-STK-005, PRD-ORG-005, PRD-TRF-023, PRD-FRN-006, PRD-ACS-007, PRD-ACS-015, POL-02.12
- **Fix.** Add a business-unit-change movement kind or state a location move may change unit only when book, legal entity and registration are unchanged (raise registration-only changes against PRD-TRF-023); rewrite the Custody row from the 2.3 kinds; add: if cost under lock exceeds the approver's limit or approved amount, posting is refused and returns for approval, with any tolerance a PRD/policy decision.
- **Files to edit.** `docs/design/stock/stock-ledger.md`
- **Owner.** product owner; KDPS Owner for any tolerance. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the fix, with one change. Rewrite the Custody row from the section 2.3 kinds as a mechanical edit that needs no decision. For the business-unit move, either add a business-unit-change kind or restrict a location move to a unit change only when book, legal entity and registration are all unchanged. Mark that choice for the product owner, and raise any registration-only change against PRD-TRF-023. For the approval value, state the rule as a direct application of PRD-ACS-007 and POL-02.12. If the cost under lock differs from the approved value in a way that crosses the approver's limit or the approved amount, posting is refused and the record returns for renewed approval. Leave any tolerance for small cost drift OPEN, owned by the product owner or KDPS Owner, and do not state a number.

### N-86 · gap · Operations ownership gaps across reports: product-owner items and open questions missing from lists

- `docs/questions-for-kdps.md` (Accounts Q5; KDPS Owner Q28): "5. **GST numbers.** Which GST registration covers each Store, warehouse and office unit? (With the CA.) · `POL-10.06` · V-18 · stage 2"
- `docs/design/platform/deployment.md` (section 10, D-5): "A separate test Tally company for the connector | Accounts | Stage 5 testing"
- `docs/design/ui/ui-blueprint.html` (gaps G14, G18, G19, G23): "G('14', 'kdps', 'Partner statements.', 'What partner users may see in their statements and ledger.' ... G('23' ... 'Logo.', 'Artwork for the empty logo slot.', 'KDPS'"
- `docs/design/stock/stock-ledger.md` (section 12, SL-9): "Product owner; KDPS for `POL-14.07`"
- `docs/reports/alignment-report.md` (section 1 'Since this report'): "Product-owner items left: SL-10 (returns with no sale in the app) ... SL-11 only if a performance test fails."
- `docs/design/platform/deployment.md` (section 10, D-1, D-2, D-3): "D-3 | A custom domain for `kdps-test`, or the Railway-provided address | Product owner | Before KDPS's side-by-side test"

- **What disagrees.** AGENTS.md says questions only KDPS or the CA can answer belong in questions-for-kdps.md, but it has nothing on: PT-file acceptance by the old POS, the switch fallback and who decides (Q28 covers manifest and balances only), a separate test Tally company (D-5), partner statement visibility, sample delivery, reason list, label layout, printer models, logo, warehouse go-live under POL-14.07 (SL-9), and HSN codes, rates and slabs (V-18 names them, Q5 asks only registrations). Separately, the report summary lists only SL-10 and SL-11 as product-owner items while SL-9, D-1 to D-3, GC-10, GC-11 and the 4.15 route question are also open, and gaps-before-code section 4 lists only two.
- **Higher rule.** AGENTS.md 'Questions only KDPS or the CA can answer go in docs/questions-for-kdps.md'; 'Mark every unknown as OPEN and name its owner'
- **Fix.** Add questions and V numbers for each missing item (owners Owner, Accounts, Operations; stages as above), and rewrite the report summary and gaps-before-code section 4 to one consistent product-owner list.
- **Files to edit.** `docs/questions-for-kdps.md`, `docs/reports/alignment-report.md`, `docs/reports/gaps-before-code.md`
- **Owner.** product owner (to add); KDPS Owner, Accounts, Operations (to answer). **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the fix. Make it narrower in three ways. (a) Drop or source the "PT-file acceptance by old POS" item before adding a question for it. (b) Treat the switch fallback as an extension of Q28 and V-44, using POL-14.05 and POL-14.07, rather than a new question. (c) Rewrite the alignment-report line-15 summary and gaps-before-code section 4 to the same product-owner list: SL-9, SL-10, SL-11, D-1 to D-3, GC-10, GC-11 and the 4.15 route question. Make sure D-2 and GC-10 are not double-counted. / Narrow the fix to three edits, all in lower documents, with no PRD or policy edits:
1. In docs/questions-for-kdps.md, extend Accounts Q5 (GST numbers) to also ask for HSN codes, rates and slabs under the existing V-18 and POL-10.06. Add a short Accounts question for a separate test Tally company, citing deployment.md D-5 and stage 5. Add questions for partner-statement visibility (G14), the reconciliation sample and reason list (G18), label and printer models (G19) and the logo (G23) only if no existing question covers them. Reuse existing V numbers, and add a new V entry in alignment-report.md section 5 only if the item needs one.
2. In the docs/reports/alignment-report.md "Since this report" paragraph, make the product-owner list complete by adding SL-9, deployment.md D-1 to D-3 and GC-10/GC-11 alongside SL-10 and SL-11. Say which of them block code and which do not.
3. Leave gaps-before-code.md section 4 as the code-blocking list, since it is deliberately short. At most, reword the "Two small decisions" wording in its intro to say it lists only the code-blocking decisions and point to section 6 and deployment.md section 10 for the rest.
Do not move product-owner-only items (D-1 to D-3, GC-10, GC-11) into questions-for-kdps.md.

### N-87 · gap · Alignment report section 5 omits V rows for open values; several questions have no V number or cite a struck-through one

- `docs/reports/README.md` (line 10): "They point to section 5 of the alignment report by `V-` number."
- `docs/questions-for-kdps.md` (KDPS Owner Q31; Operations Q4; CA Q3 and Q8; Admin): "31. **Phone approvals.** ... · `PRD-ACS-012` ... 4. **Transfer routes.** ... · `PRD-ORG-013` · stage 3 ... 8. **MSME suppliers.** ... · `POL-10.09` · stage 5"
- `docs/reports/alignment-report.md` (section 1 item 1, 4.4 vs V-07): "the CA's accounting treatment is an open value (V-07) ... | V-07 | Accounting framework: AS or Ind AS | `POL-09.10` | CA | 2 |"
- `docs/questions-for-kdps.md` (KDPS Owner Q17): "The actual limits are in V-02. · `POL-07.09`, `POL-02.15` · V-27"
- `docs/reports/alignment-report.md` (V-27): "~~Which refund cases require independent approval~~ Triggers settled by DEC-020; named approvers and limits remain V-02"

- **What disagrees.** Phone-approval types (B-8), transfer routes (B-14), MSME classification (B-12, POL-10.09), restore operator/date (POL-18.03), owned-before-receipt goods accounting (POL-09.22, POL-09.02, CA Q3) and the SL-2 rounding rule have questions but no V entry; the report attributes owned-before-receipt accounting to V-07, which is the AS/Ind AS framework. Q17 cites V-27, which is struck as settled (should be V-02/V-01).
- **Higher rule.** questions-for-kdps.md 'How to use this list'; AGENTS.md OPEN-with-owner rule
- **Fix.** Add V entries (V-58 onward, never reused) for these values with owners and stages, re-point V-07 references, add POL bullets and V numbers to Q31 and Ops Q4, and change Q17 to cite V-02 (and V-01 for names).
- **Files to edit.** `docs/reports/alignment-report.md`, `docs/questions-for-kdps.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Edit only docs/questions-for-kdps.md and docs/reports/alignment-report.md; do not touch the PRD or policies. 1) Change Q17's trailing V-27 to V-02 (limits) and V-01 (named approvers). 2) Re-point the V-07 references at report lines 17, 51 and 111 so they no longer imply V-07 covers owned-before-receipt accounting. Either add a new V row (V-58 onward, never reused) for the CA's treatment under POL-09.02/POL-09.22 (CA, stage 2), or cite CA Q3 and POL-09.02 directly. 3) Optionally add V rows (V-58 onward) for B-8 phone-approval types (owner KDPS Owner, stage 5), B-12 MSME classification (Accounts and CA, stage 5), B-14 transfer routes (Operations, stage 3), the POL-18.03 restore operator and date (Admin, stage 1) and SL-2 rounding (Accounts and CA, stage 2). Then add the matching V numbers to Q31, Operations Q4, CA Q3, CA Q8 and the Admin line. 4) Do not add POL bullets to Q31 or Operations Q4: POL-02 has no phone-approval line to cite and B-14 says there is no policy home. Keep the existing PRD IDs as the cited source.

### N-88 · term · Test-phase vocabulary (parallel run, side-by-side test, test run, pilot Store, switch count, earlier/old/current POS) is not defined in Words used and used interchangeably

- `docs/prd.md` (PRD-LIF-012 and PRD-LIF-026; Business measures intro): "Support a parallel run in which the existing external POS remains the selling system for a Store. ... A side-by-side test on test hosting keeps the earlier POS as the system of record ... recorded during the first month of the test run."
- `docs/kdps-policies.md` (POL-14.01; POL-14.07; POL-16.02): "after the side-by-side test's go/no-go checks pass. / Before the pilot switch, record the verified manifest and balances / The approved offline pilot starts cash-first."
- `docs/phases.md` (stage 2 and Testing and switch-over): "The parallel-run import of the current POS's daily sales report and SOH ... KDPS runs the side-by-side test on the Railway test setup"
- `AGENTS.md` (Delivery): "During the test run, the existing POS keeps selling"

- **What disagrees.** DEC-028/030 moved to 'side-by-side test'; PRD-LIF-012 to 016, phases stages 2 and 6, the ledger and blueprint still say 'parallel run'; the measures say 'test run'. 'Pilot' means the first Store to switch in POL-14 and the first offline Store in POL-16.02. 'Switch' and 'switch count' (PRD-LIF-025, -027, PRD-MER-017, PRD-EBO-011, DEC-023) are undefined, and the old system is called earlier, old, current and existing POS. Whether a parallel run could occur on production before a switch is unsaid.
- **Higher rule.** AGENTS.md and docs/README.md 'Words': a new term is added to Words used first
- **Fix.** Product owner adds Words used entries via a DEC (for example Side-by-side test, Switch, Switch count, Pilot Store, Earlier POS), then aligns PRD-LIF-012 to 016, phases, policies 14 and 16, the measures intro, AGENTS.md, questions and reports; use a distinct phrase such as 'first offline Store' in POL-16.02.
- **Files to edit.** `docs/prd.md`, `docs/phases.md`, `docs/kdps-policies.md`, `docs/decisions.md`, `AGENTS.md`, `docs/design/stock/stock-ledger.md`, `docs/design/ui/ui-blueprint.html`, `docs/questions-for-kdps.md`, `docs/reports/alignment-report.md`
- **Owner.** product owner. **Blocks.** 2. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the proposed fix. Correct the what_disagrees text: the ledger and blueprint do not say "parallel run". They use "earlier POS", "old POS" and "test run". Only decisions.md (DEC-023, DEC-024, DEC-027, DEC-030) and alignment-report.md (4.14) still say "parallel run". Say that "parallel run" appears in PRD-LIF-012 to 016, phases.md stage 2, decisions.md and alignment-report.md.

### N-89 · term · 'Billed-retained' is used as a defined term (policy row, custody state, flow, ledger) but is not in Words used

- `docs/prd.md` (PRD-POS-018; Required policy configuration row Billed-retained): "Support billed-retained goods paid for but still in store custody, with linked collection/alteration status and protected quantity."
- `docs/design/stock/stock-ledger.md` (6.1): "Billed-retained is not a hold. It is a way goods are held (2.2): paid for, and kept in the Store until handover"
- `docs/prd.md` (PRD-STK-002): "Track billed-retained, alteration and display custody without double-counting physical quantity."

- **What disagrees.** The term names a policy, a custody state and a flow but is defined only inline; the ledger adds its own wording ('a way goods are held').
- **Higher rule.** AGENTS.md 'Add a new term there first'; docs/README.md Words
- **Fix.** Add Billed-retained to Words used (goods paid for but still in Store custody awaiting collection or alteration; not a hold; not sellable stock) via a DEC.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** 4. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the fix as proposed: add a Billed-retained row to the PRD "Words used" table and log a DEC in docs/decisions.md, with the product owner choosing the wording. A definition consistent with the existing text would be: "Goods paid for but still held in the Store until handover to the customer, for collection or alteration; not a hold, and unavailable for sale or allocation." That follows PRD-POS-018, POL-08.02 and stock-ledger 6.1, and the owner should confirm it. After the PRD row is in place, align stock-ledger 6.1 to the PRD wording, since the lower document is the one that gets fixed.

### N-90 · term · Stock ledger uses 'on hand' for counted custody while the PRD defines SOH/stock on hand as a non-physical comparison figure

- `docs/prd.md` (Words used: SOH, stock on hand): "A quantity reported by a system as in stock; it is a comparison source, not physical verification"
- `docs/design/stock/stock-ledger.md` (section 2.2; section 6.2): "how the goods are held: on hand, in transit or billed-retained ... / **available = on hand − reserved − held units outside reservations**, and never below zero."

- **What disagrees.** The same words carry opposite status: reported and unverified in the PRD, counted custody in the ledger formula.
- **Higher rule.** PRD Words used (SOH, Custody); docs/README.md
- **Fix.** Use 'in custody' or 'physical quantity' in the ledger; keep 'SOH' only for reported quantities such as the earlier POS's SOH.
- **Files to edit.** `docs/design/stock/stock-ledger.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the proposal. Reword the ledger's section 2.2 "on hand" and section 6.2 "available = on hand − ..." to "in custody" or "physical quantity". Also check docs/decisions.md line 320 ("pool's stock on hand now"), which uses the reported-figure term for physical units, and reword it the same way. / Edit only docs/design/stock/stock-ledger.md. Replace "on hand" with "in custody" at line 42 ("held: in custody, in transit or billed-retained"), line 164 (available = in-custody quantity − reserved − held units outside reservations) and line 325 ("A comes back into custody"). Check for other "on hand" uses in that file, and keep "SOH" only for the earlier POS's reported figure. Do not edit the PRD.

### N-91 · term · Stock ledger coins terms not in Words used (book pool, Site pool, Count freeze, Held-goods reservation, Inspection hold) and a value-only exception to the freeze

- `docs/design/stock/stock-ledger.md` (section 7.1; section 6.1 table): "**book pool:** one pool per SKU per book; / **Site pool:** one pool per SKU per Site per book. / Count freeze | An open count over its scope ... Inspection hold ... Held-goods reservation"
- `docs/decisions.md` (DEC-033 Question): "A new word goes into "Words used" before any other document uses it."
- `docs/design/stock/stock-ledger.md` (section 8.1): "The freeze blocks every movement into or out of the scope. ... / Value-only movements, such as a late cost change, may post during a count; they change no quantity."
- `docs/prd.md` (PRD-STK-009; Words used: Movement): "Freeze counted items and locations from sale and movement while the count is open. / An append-only record of a change in stock quantity, place, condition, custody, ownership or value."

- **What disagrees.** DEC-033 added only four words. The ledger adds further bold terms, and with 'movement' defined to include value, 'freeze blocks every movement' and 'value-only movements may post during a count' say opposite things; the carve-out is a design rule, and PRD lists 'movement during counts' as a policy item.
- **Higher rule.** AGENTS.md Words rule; PRD-STK-009, PRD-STK-008; DEC-019
- **Fix.** Add the needed words to Words used with a DEC or rephrase using PRD wording and label the rest ledger-internal; reword to 'blocks every movement of quantity, place, condition or custody' and keep the value-only exception only if the product owner confirms it.
- **Files to edit.** `docs/design/stock/stock-ledger.md`, `docs/prd.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Sceptic notes.** Split the fix by strength. (a) Behaviour, the strong part and needs the product owner: either reword stock-ledger.md 8.1 line 302 to "blocks every movement of quantity, place, condition or custody", and keep line 306 only if the owner confirms the value-only exception. Record that in a new DEC that amends PRD-STK-009 and the "movement during counts" policy item. Or drop the exception. (b) Terms, the weaker part: do not treat Site pool as new, since PRD-LED-015 already uses it. Either add "book pool" and "Site pool" as sub-forms under the Cost pool row in Words used (or via a short DEC), or reword the ledger to "the whole-book pool" and "the Site pool" with an explicit reference to PRD-LED-015. For Count freeze, Inspection hold and Held-goods reservation, add them to Words used with a DEC, or label them as kinds of Hold and Reservation in 6.1 (for example "Hold kind: count freeze") so they read as ledger-internal labels, not new vocabulary.

### N-92 · term · Policy 2 vocabulary: 'tolerance' vs 'limit', 'business' scope and 'default' approval limits

- `docs/prd.md` (PRD-STK-012; PRD-CSH-011): "The configured count tolerance only selects the approver"
- `docs/kdps-policies.md` (POL-02.21; POL-02.13): "A Store Manager may approve count differences only within configured cost limits. / A Store Manager may approve within a configured limit; Accounts approves above it."
- `docs/kdps-policies.md` (POL-02.15; POL-02.02): "Provide default approval limits by role and action. / Assign each user one or more roles, each with explicit business, Site and brand scope."
- `docs/prd.md` (Required policy configuration, intro; PRD-ACS-001): "Suggested commercial, financial or permission values are never active defaults. / with explicit action, entity, Site, brand and field permissions."
- `docs/questions-for-kdps.md` (KDPS Owner 2): "Confirm default limits by role and action, then name any authorised person with an individual limit."

- **What disagrees.** The PRD and policy-2 question use 'tolerance' (selects the approver); the answers say 'limit' and 'cost limit', and POL-02.13 omits the above-tolerance owned exception of PRD-CSH-011. The 'movement during counts' part of the question has no answer bullet though PRD-STK-009 settles it. 'Business' is not a PRD word (Organisation, legal entity, business unit). 'Default' here means role-level limits, which invites the reading the PRD forbids; DEC-017 and Owner Q2 repeat it.
- **Higher rule.** PRD-STK-012, PRD-CSH-011, PRD-STK-009, PRD-ACS-001, PRD-ACS-015, Required policy configuration intro
- **Fix.** Use 'tolerance' with a stated cost basis, add the owned-exception step to POL-02.13, answer or drop the movement-rule question by citing PRD-STK-009; replace 'business' with 'legal entity' or 'business unit' as intended; replace 'default approval limits' with 'role-level approval limits' in POL-02.15, DEC-017 and Q2.
- **Files to edit.** `docs/kdps-policies.md`, `docs/questions-for-kdps.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** 1. **Needs a product-owner decision.** no.
- **Sceptic notes.** Propose one new DEC, logged in docs/decisions.md as a new entry, and wait for product-owner approval before any edit. Do not rewrite DEC-008 or DEC-017. After approval, edit only the lower document (docs/kdps-policies.md) and docs/questions-for-kdps.md. (a) POL-02.13: say "within the configured cash-variance tolerance, a Store Manager approves; above it, Accounts approves and the difference becomes an owned exception (PRD-CSH-011)". Do not add a cost basis. (b) POL-02.21 and Q13: use "count tolerance (stated as a cost difference per PRD-ACS-015)" in place of "cost limits". Keep the PRD-STK-012 sentence that the tolerance only selects the approver, and add the owned exception above it. (c) Movement rule: leave it open as an Owner/Admin configuration item, since PRD line 883 lists it. Add an answer bullet or an Open note citing PRD-STK-009, which sets the freeze, and keep only the remaining "who may move frozen items, if anyone" question open. Do not drop it. (d) "Business" in POL-02.02 and POL-02.09: report the choice between Organisation, legal entity and business unit to the product owner and have them pick. Do not guess. (e) "Default approval limits" in POL-02.15 and Q2: optional rewording to "role-level approval limits", included only if the owner approves. Leave DEC-017 as written, and note the wording change in the new DEC. Set needs_product_owner_decision to true.

### N-94 · term · Undefined or inconsistent nouns: 'Company', 'receipt lot', 'Crore'/'Cr', billing 'device'/'till'/'counter', capitalisation of defined nouns

- `docs/prd.md` (PRD-OFR-002; PRD-ORG-015): "retain combination rules, source and brand/company cost shares. / Track company, supplier/brand and partner-owned goods separately"
- `docs/prd.md` (PRD-OFR-008; Words used Receipt origin): "Track supplier return eligibility and deadlines by receipt lot and contractual qualifying event. / The counted receipt, opening stock or other counted source a quantity of stock came from."
- `docs/design/ui/design-language.md` (§8 Money rows): "Money · compact | L / Cr, 2 decimals | ₹12.65 L · ₹3.41 Cr"
- `docs/prd.md` (Words used, Till; PRD-POS-020): "The cash counter and its drawer for one billing session / Give each billing device its own bill series per tax registration and financial year"
- `docs/decisions.md` (DEC-005 Choice): "Every till its own series ... Bill numbers run per till, not across the Store."
- `docs/kdps-policies.md` (POL-02.13; POL-06.06): "A Store Manager may approve within a configured limit ... / Issue store credit only with the customer’s agreement."

- **What disagrees.** 'Company' is undefined (Organisation or legal entity; policy 19 says Organisation); 'receipt lot' is an undefined synonym for the defined 'receipt origin' used by the ledger and blueprint; 'crore', 'L' and 'Cr' are used while Words used has only 'Lakh'; series are keyed on 'device' (PRD) but 'till'/'counter' in DEC-005, design-language and design-system, though Till is a session; capitalisation varies ('Store credit', 'Store manager' vs 'Store Manager', 'brand-by-store', 'full store count').
- **Higher rule.** PRD Words used; AGENTS.md 'Working on the documents' (capitalised defined nouns); docs/README.md Words
- **Fix.** Replace 'company' with Organisation or legal entity in PRD-OFR-002, PRD-ORG-015, PRD-ORG-010; change 'receipt lot' to 'receipt origin' in PRD-OFR-008 and the blueprint; add Crore (and L/Cr as display abbreviations) to Words used; pick one word for the series owner (billing device) and align DEC-005, §8 and blueprint; normalise capitalisation. All PRD edits via a DEC.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`, `docs/kdps-policies.md`, `docs/phases.md`, `docs/design/ui/design-language.md`, `docs/design/ui/ui-blueprint.html`, `docs/design/stock/stock-ledger.md`
- **Owner.** product owner. **Blocks.** 4 (series owner). **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the fix, with two narrowings. (1) Do not blanket-replace "company" in PRD-ORG-010. "company-owned ... stores" names a store ownership format, so either add it to Words used or leave it. Only PRD-OFR-002 and PRD-ORG-015, where "company" means the owning party, should become Organisation or legal entity, in line with POL-19.02. (2) Treat "P-STM Store manager" as a persona label that needs a product-owner call, not a typo. For the series owner, decide whether it is the billing device (PRD-POS-020) or the Till (a session, per Words used). That choice is a DEC that supersedes DEC-005's "per till" wording. Also add Crore (and L/Cr as display abbreviations) to Words used, change "receipt lot" to "receipt origin" in PRD-OFR-008 and ui-blueprint.html:350, and make all PRD edits via a DEC. / Split it. (a) Propose one DEC, owner product owner, covering: retire "receipt lot" in favour of the defined "receipt origin" in `PRD-OFR-008`; add Crore (10,000,000) to "Words used", with L and Cr named as dashboard display abbreviations of Lakh and Crore; and choose one series-owner noun (likely "billing device") with a one-line Words used entry, because Till is defined as a session. Do not blanket-replace "company". Ask the owner, per use, whether `PRD-OFR-002` ("brand/company cost shares", where `POL-19.02` says "Organisation and brand cost shares") should read Organisation, and leave "company-owned" in `PRD-ORG-010` and `PRD-ORG-015` as the ownership contrast unless the owner says otherwise. (b) After the DEC is approved, edit only the lower documents without further DEC. These are the ui-blueprint "By receipt lot" row, design-language §8 and the blueprint G-20 "counter series" wording, DEC-005's "till" wording by a follow-up note rather than rewriting history, and `kdps-policies.md` capitalisation, meaning "Store Manager" to "Store manager" in `POL-02.13` and `POL-02.21`, and "store credit" to "Store credit" in `POL-06.06`, `POL-07.03` and `POL-07.06`. `phases.md` and `stock-ledger.md` need no change for receipt lot, since the ledger already says receipt origin.

### N-95 · term · UI state vocabulary outside §7: 'Held' as 'Receiving hold', 'Write-off pending', attendance states and chips

- `docs/design/ui/design-language.md` (§7 rows 26 and 46): "| 26 | Held | Attention | ! | Receiving hold, excess on hold, disputed portion | ... | 46 | Write-off pending | Quarantine | ◆ | Write-off |"
- `docs/prd.md` (Words used: Write-off; PRD-STK-001): "An approved record that removes the established accounting value of stock; it does not itself destroy or move the goods"
- `docs/design/stock/stock-ledger.md` (6.1 Kinds): "Damage hold | Quarantine | Excess hold | Source-conflict hold | Expiry hold | Ordinary hold | Count freeze | Transfer reservation ..."
- `docs/design/ui/design-system.html` (attendance rows; 'Request correction'): "['Present', 's'], ['Week off', 'n'], ['Late 21 min', 'w'], ['Correction requested', 'i'] ... Request correction"
- `docs/prd.md` (PRD-HRM-006, PRD-HRM-007): "Retain original attendance events; approved regularisation is separate evidence. ... Maintain rosters, shifts, weekly offs"

- **What disagrees.** 'Receiving hold' is not a hold kind (counted goods without a PT are unsellable for lack of coverage), 'Write-off pending' duplicates Awaiting approval and the PRD defines a write-off as an approved record, and the portal's Present, Week off, Late and Correction requested are not among the 46 states; the page says 'Request correction' and 'Week off' where the PRD says regularisation and weekly off. Extends C-11.
- **Higher rule.** PRD Words used (Hold, Write-off); PRD-STK-001; PRD-HRM-006; design-language.md §7
- **Fix.** Replace 'receiving hold' with the real hold kinds or 'no PT coverage yet'; delete row 46 (use Draft, Awaiting approval, Approved, Rejected; a present written-off piece keeps Quarantine); add the attendance outcomes to §7 or use existing states and the PRD words.
- **Files to edit.** `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`
- **Owner.** design. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** In docs/design/ui/design-language.md row 26, replace "Receiving hold" with the real hold kinds from stock-ledger.md 6.1 that apply, for example "Damage hold, excess hold, source-conflict hold, ordinary hold, disputed portion". Do not substitute "no PT coverage yet", because it is not a hold kind. Delete row 46 (Write-off pending). A write-off record uses Draft, Awaiting approval, Approved or Rejected. A written-off piece that is still present keeps Quarantine or Damaged, per PRD-DMG-011. Remove the matching `['Write-off pending','q','Write-off']` entry from the `SM` array in docs/design/ui/design-system.html and update the Held entry text there too. For the attendance mock in design-system.html, either map each outcome to an existing state or add attendance outcomes to §7 in an existing family, with no invented thresholds. Use the PRD words "weekly off" and "regularisation" in the page text. Treat "Late 21 min" as a measure shown beside a state, not as a state. Edit only the two design files, with no PRD or policy edit and no DEC needed.

### N-96 · stale-ref · Stale citations: phases Customer credit stage in V-25 and Q16; Q29 filed under stage 4; DEC-019/DEC-021 claim phases pass-criteria edits that are absent

- `docs/reports/alignment-report.md` (V-25): "Provider/evidence configuration and customer-credit limits/due dates for the selected tender set | `POL-07.09`, `PRD-POS-021`, `PRD-POS-022` | KDPS Owner, Accounts | 4"
- `docs/prd.md` (Required policy configuration, Refunds and no-bill returns row): "4; Customer credit by 5"
- `docs/questions-for-kdps.md` (Q29 and heading): "Test-run pass marks. Set how long the side-by-side test runs. Set the material-difference threshold per Store ..."
- `docs/phases.md` (Go or no-go pass marks): "KDPS sets the run length before the test starts and the material-difference threshold before the first switch."
- `docs/decisions.md` (DEC-019 Changed; DEC-021 Changed): "`PRD-STK-008`–`PRD-STK-009`; new `POL-02.21`; stage 3 count questions; `phases.md` pass criteria. / stage 5 questions and phase pass references."
- `docs/phases.md` (Stage 3 Exit checks): "Stock quantity and value reconcile from receipt through every movement."

- **What disagrees.** DEC-025 made Customer credit stage 5, but V-25 and Owner Q16 still say stage 4. Q29 mixes run length (needed before the side-by-side test) with the threshold (before the first switch) under 'Needed for stage 4'; Q37 is correctly filed. DEC-019 and DEC-021 list phases pass-criteria edits, yet stage 3 exit checks have nothing on count freeze, stopped selling or approved-only differences (PRD-STK-008, -009, -012) and stage 5 has nothing on phone approval links, Store P&L allocation or Contra limits; the PRD has no count acceptance condition.
- **Higher rule.** PRD Required policy configuration row 7; DEC-025; phases.md pass marks; decisions.md must truthfully list changes
- **Fix.** Split V-25 and Q16 (provider evidence stage 4, Customer credit limits and due dates stage 5); split Q29 and move run length beside Q37; add count exit checks to stage 3 (and stage 5 checks) citing the PRD IDs with a PRD acceptance condition if agreed, or correct the DEC-019 and DEC-021 Changed lines.
- **Files to edit.** `docs/reports/alignment-report.md`, `docs/questions-for-kdps.md`, `docs/phases.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** 2 (run length); 3 (counts); 5 (Customer credit). **Needs a product-owner decision.** yes.
- **Sceptic notes.** Keep the edits to alignment-report V-25, questions Q16 and Q29, and the phases.md exit checks. Split V-25 and Q16 so provider evidence stays at stage 4 and Customer credit limits and due dates go to stage 5, matching "4; Customer credit by 5". Move the run-length part of Q29 next to Q37 under "before the side-by-side test", and keep the threshold "before the first switch". Add stage 3 (count freeze, full-count selling stop, approved-only differences) and stage 5 (phone approval links, Store P&L allocation, Contra) exit checks to phases.md. These must only restate PRD-STK-008, -009 and -012 and the existing DEC-021 policy IDs, with no new values. Do not rewrite the "Changed" lines of DEC-019 or DEC-021 in place. If the checks are not added, append a new DEC, as DEC-026 did, saying those phases.md edits were not made. Do not add a PRD "count acceptance condition" unless a new DEC approves it, because AGENTS.md forbids PRD or policy edits without one. Drop docs/decisions.md from files_to_edit except for appending that new entry.

### N-97 · stale-ref · Alignment report is stale on header range and date, B-07, 4.1, 4.2 Blocks, and 4.15 file-storage stage

- `docs/reports/alignment-report.md` (line 5 vs line 15): "Refreshed after DEC-017 to DEC-029 ... | the product-owner decisions are logged as DEC-001 to DEC-035"
- `docs/reports/alignment-report.md` (2.2 B-07 vs 4.1): "What "KDPS-tracked" covers is open (4.1). | ... **Settled: DEC-002 and DEC-018**"
- `docs/reports/alignment-report.md` (4.2 vs V-08): "4.2: "**Blocks:** 2 (first receipt cost)." vs V-08: "... | `POL-09.09`, `POL-09.21` | Accounts, CA | 1""
- `docs/reports/alignment-report.md` (4.15 Blocks): "**Blocks:** 2 (side-by-side test with real data); 4 (first Store switch)."
- `docs/design/platform/deployment.md` (D-2): "File storage provider for the test setup. ... | Product owner | Stage 1 build"

- **What disagrees.** The header says refreshed after DEC-029 (dated 2 Oct) and the body says the settled list ends at DEC-026, yet it cites DEC-030 to DEC-035 (3 Oct). B-07 and the 4.1 'The point' text call KDPS-tracked scope open though 4.1 and DEC-002/018 settled it. 4.2 blocks stage 2 while V-08 and the questions say stage 1. 4.15 puts file storage at stages 2 and 4 while deployment D-2 and GC-10 say stage 1 build.
- **Higher rule.** decisions.md (DEC-002, DEC-018, DEC-030 to DEC-035); PRD policy table; AGENTS.md name the blocked stage
- **Fix.** Update header, date and the 'through DEC-026' sentence to DEC-035 / 3 Oct 2026; mark B-07 settled and strike the 4.1 'point'; align 4.2 Blocks with V-08; set 4.15 file storage Blocks to 1.
- **Files to edit.** `docs/reports/alignment-report.md`
- **Owner.** product owner. **Blocks.** 1. **Needs a product-owner decision.** no.
- **Sceptic notes.** In docs/reports/alignment-report.md:
- Update the title date and the line 5 header to DEC-035 and 3 Oct 2026.
- Change the line 18 "through DEC-026" sentence to cover DEC-027 to DEC-035.
- Change B-07 to say it is settled by DEC-002 and DEC-018, with a pointer to V-06.
- Strike or rewrite the 4.1 "The point" bullet.
- 4.2 Blocks: "1 (V-08, today's method); 2 (V-09, first receipt cost)".
- 4.15 Blocks: "1 (file storage provider, D-2/GC-10); 2 (side-by-side test with real data); 4 (first Store switch)". / Edit only docs/reports/alignment-report.md.
- Line 5: change "DEC-017 to DEC-029" to "DEC-001 to DEC-035". Change the title date to "3 Oct 2026" only if the report is actually re-swept, since line 15 already mixes dates.
- Line 18: change "logged through DEC-026" to "through DEC-035". Add DEC-027 and DEC-028 (Railway test hosting), DEC-029 (DEC-017 to DEC-022 agreed with KDPS) and a pointer to DEC-030 to DEC-035 (already described in the "Since this report" paragraph).
- B-07 row: change to "Settled: DEC-002, DEC-018 (piece tracking is set per profile; KDPS picks the categories, V-06)".
- 4.1: remove or reword "The point" bullet as history ("Before DEC-002 nothing said which pieces are tracked"). Update "Who decides" to match: the product-owner part is settled and only the categories (V-06) remain.
- 4.2: change Blocks to "1 (V-08, current method and valuation sample); 2 (V-09 confirmation, first receipt cost)". Do not reduce it to 1 only.
- 4.15: keep the other entries and add the file storage provider at stage 1, for example "Blocks: 1 (file storage provider, deployment.md D-2 / GC-10); 2 (side-by-side test with real data); 4 (first Store switch)."

### N-98 · stale-ref · Alignment report rows B-10, B-6, V-31, V-32 and A-3 are stale against DEC-018, DEC-020 and POL-05.09 / POL-06.05 / POL-07.12-13

- `docs/reports/alignment-report.md` (B-10; B-6; A-3): "| B-10 | Open-to-buy budget: who sets and approves it | `PRD-BKG-004`, `POL-05.02` | 5 | The budget owner and approval | KDPS Owner, Booking | 2 | / Rows 6 and 7 name loyalty; `POL-06` says nothing; `POL-07.09` says unconfirmed / KDPS's 15-day window and still-open defective cutoff belong in policy 6."
- `docs/kdps-policies.md` (POL-05.09; POL-07.13; POL-06.05): "Booking prepares the buying budget, Accounts checks it, and the Owner approves it before use. / Keep loyalty disabled until an approved scheme, earning, redemption, liability and expiry rules are configured. / ... without inventing a universal hard cutoff."
- `docs/questions-for-kdps.md` (KDPS Owner Q21 and Q22): "21. **Loyalty.** ... · `POL-07.13` · V-31 ... 22. **Customer phone numbers.** ... · `POL-07.12` · V-32"

- **What disagrees.** B-10 still lists the budget owner and approval as missing though V-17 in the same report says the workflow is set. B-6 and V-31/V-32 cite POL-07.09 and say policies are silent on loyalty, while POL-07.13 and POL-07.12 now carry those rules and the questions cite them. A-3 still speaks of a 'still-open defective cutoff' that POL-06.05 and V-23 rule out.
- **Higher rule.** kdps-policies.md POL-05.09, POL-06.05, POL-07.12, POL-07.13; DEC-018, DEC-020
- **Fix.** Mark B-10 'Settled: DEC-018 (POL-05.09)' leaving amounts and names as V-17; update B-6 to POL-07.13 and V-31/V-32 to POL-07.13 and POL-07.12; reword A-3 to 'KDPS's 15-day ordinary window belongs in policy 6; defective goods are assessed under POL-06.05 with no assumed cutoff'.
- **Files to edit.** `docs/reports/alignment-report.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** In docs/reports/alignment-report.md:
- B-10: prefix 'Settled: DEC-018 (POL-05.09)', cite `POL-05.09`, and change the missing item to 'Actual budgets, approver names and authority (V-17)'.
- B-6: cite `POL-07.13` (and `POL-07.09` for the unconfigured loyalty settings). Replace 'POL-06 says nothing' with the POL-07.13 rule that loyalty stays disabled until a scheme, earning, redemption, liability and expiry rules are approved. The missing item remains the scheme itself.
- V-31: cite `POL-07.13`, `POL-07.09`, `PRD-RET-019`.
- V-32: cite `POL-07.12`, `POL-07.09`, `PRD-POS-012`.
- A-3: reword to 'KDPS's 15-day ordinary window belongs in policy 6; defective goods are assessed under POL-06.05 with no assumed cutoff'.

### N-99 · stale-ref · Policy 6 question still asks for a defective-item return window after DEC-020 and POL-06.05 removed any hard cutoff

- `docs/kdps-policies.md` (Policy 6 question bullet 1): "How many days does a customer have for an ordinary return, and for a defective item?"
- `docs/kdps-policies.md` (POL-06.05): "Do not reject one solely because the ordinary return window has elapsed; assess applicable consumer rights and warranties without inventing a universal hard cutoff."

- **What disagrees.** The question asks for a number of days for defective items; the decided answer and DEC-025 give no window.
- **Higher rule.** POL-06.05, DEC-020, DEC-025
- **Fix.** Reword to 'How many days for an ordinary return, and what assessment process applies to a defective item?'
- **Files to edit.** `docs/kdps-policies.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Proposed rewording of docs/kdps-policies.md Policy 6 bullet 1: "How many days does a customer have for an ordinary return? How is a defective item assessed?" Do not ask for a defective-item day count, and do not state any assessment steps or limits, because those values are not yet decided. First propose a short DEC entry or a follow-on note to DEC-025 that lists the Policy 6 question bullet 1 among the IDs changed. Edit the policy text only after the product owner approves that entry. Set needs_product_owner_decision to true for the process step. The change is wording only and adds no new value.

### N-100 · stale-ref · PRD IDs banner says numbers count bullets 'in order', but several sections are out of numeric order

- `docs/prd.md` (IDs banner): "The number counts bullets in that section, in order."
- `docs/prd.md` (ACS, STK, RET, CSH, LED sections): "`PRD-ACS-015` ... `PRD-ACS-016` ... `PRD-ACS-012`; `PRD-STK-012` ... `PRD-STK-011`; `PRD-RET-022` ... `PRD-RET-012`; `PRD-CSH-011` ... `PRD-CSH-003`; `PRD-LED-014`–`PRD-LED-018` ... `PRD-LED-008`"
- `AGENTS.md` (Alignment rules): "A new bullet takes the next free number in its prefix. An edited bullet keeps its ID."

- **What disagrees.** AGENTS.md's next-free-number rule is what is actually followed, so the banner is false.
- **Higher rule.** docs/prd.md IDs note; AGENTS.md alignment rules
- **Fix.** Reword the banner to 'The number is the next free number in that section when the bullet was added; bullets are not renumbered or reordered.' via a decision entry.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Optional wording tweak: reword the banner to "The number is the next free number in that section when the bullet was added. Bullets may sit out of numeric order and are never renumbered." Log it as a DEC entry in docs/decisions.md first, then edit docs/prd.md. / Keep the fix, with two adjustments. First, add a new DEC entry in docs/decisions.md that proposes the banner rewording, then wait for the user's approval. Second, edit docs/prd.md line 7 to match, for example: "The number is the next free number in that section when the bullet was added. Bullets are never renumbered, so the order on the page need not follow the numbers." Invent no new ID values. The PRD-side change is wording only.

### N-101 · stale-ref · DEC-018 lists POL-09.21 to POL-09.25 but POL-09.25 belongs to DEC-021

- `docs/decisions.md` (DEC-018 Changed): "`POL-04.09`, `POL-05.09`–`POL-05.10`, `POL-09.21`–`POL-09.25`, `POL-10.08`, `POL-17.10`–`POL-17.11`; stage 2 questions."
- `docs/decisions.md` (DEC-021 Changed): "`PRD-ACS-012`; `POL-02.14`, `POL-09.20`, `POL-09.25`–`POL-09.26`, `POL-10.09`, `POL-12.07`"
- `docs/kdps-policies.md` (POL-09.25): "Map Contra only to cash or bank transfers between accounts of the same legal entity; it does not represent stock transfers."

- **What disagrees.** Both entries claim POL-09.25; DEC-018's choice text maps only to POL-09.21 to 09.24.
- **Higher rule.** AGENTS.md: IDs traceable to one entry
- **Fix.** Correct DEC-018's Changed line to `POL-09.21`–`POL-09.24` and note the correction in a later entry.
- **Files to edit.** `docs/decisions.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the fix, but cite AGENTS.md line 46 accurately: each decision entry lists "the IDs changed". In docs/decisions.md, change DEC-018's Changed line to `POL-09.21`–`POL-09.24`, and note the correction in a later entry. Per AGENTS.md line 47, the change to the log should be proposed to the product owner rather than applied unilaterally. / Follow the DEC-016 and DEC-029 precedent. Add a short new DEC at the end of docs/decisions.md, for example "Correction to DEC-018 Changed line". It should say that DEC-018's Changed list should read POL-09.21 to POL-09.24, and that POL-09.25 (Contra) was set by DEC-021. Leave DEC-018's text as written. If the product owner prefers an in-place edit, change DEC-018's Changed line to POL-09.21 to POL-09.24 and cite the correcting entry in that same line. Edit only docs/decisions.md. Leave kdps-policies.md and prd.md unchanged, and do not renumber IDs. The decided-by on the new entry is the product owner, so it needs the owner's approval, not an independent product decision.

### N-102 · stale-ref · AGENTS.md first line is a broken external link to http://AGENTS.md

- `AGENTS.md` (line 1): "# [AGENTS.md](http://AGENTS.md)"

- **What disagrees.** The title links to an external URL instead of the file; CLAUDE.md is a link to the same file, so the broken heading shows there too.
- **Higher rule.** Link integrity (docs/README.md, AGENTS.md)
- **Fix.** Change the heading to plain '# AGENTS.md'.
- **Files to edit.** `AGENTS.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.

### N-103 · stale-ref · gaps-before-code GC-2 cites PRD-ORG-001 to PRD-ORG-016, omitting inbound ownership PRD-ORG-017 to PRD-ORG-019

- `docs/reports/gaps-before-code.md` (GC-2 Source column): "`PRD-ORG-001`–`PRD-ORG-016`, `PRD-MER-001`–`PRD-MER-017`; policies 1 and 4"
- `docs/prd.md` (PRD-ORG-017 to PRD-ORG-019): "`PRD-ORG-017` When an agreement transfers ownership before receipt, record inbound ownership by agreement, booking, supplier document and quantity. Inbound ownership is not stock"

- **What disagrees.** The range stops three IDs short, so inbound ownership (DEC-003) is not counted as a stage 1 masters design item though the ledger treats it as an existing record.
- **Higher rule.** PRD section ORG
- **Fix.** Change the range to `PRD-ORG-001`–`PRD-ORG-019` or assign ORG-017 to 019 to a named design.
- **Files to edit.** `docs/reports/gaps-before-code.md`
- **Owner.** product owner. **Blocks.** 1. **Needs a product-owner decision.** no.
- **Sceptic notes.** Extend the GC-2 Source range to `PRD-ORG-001`–`PRD-ORG-019`. Also add "inbound ownership records (not stock)" to the GC-2 "What it covers" cell so the row is consistent. Alternatively, explicitly assign ORG-017 to 019 to GC-4 or the stock-ledger design. Note that stock-ledger.md already cites them, so severity is low. / In docs/reports/gaps-before-code.md, GC-2, change the Source range to `PRD-ORG-001`–`PRD-ORG-019`. Also add "inbound ownership records (not stock)" to the "What it covers" text, so the extended range matches the scope. Do not touch the PRD, policies or decisions.md. Alternative, if the product owner prefers the record to be designed with receiving rather than masters: leave GC-2 at ORG-016 and cite ORG-017 to 019 in a named receiving or stock design. Do not leave the record unassigned.

### N-104 · stale-ref · Shell count: 'three shells' in the blueprint and design-system heading vs four in design-language, the UI README and design-system section 4

- `docs/design/ui/ui-blueprint.html` (section 4): "Three shells, one account. The example below is a Store manager’s back-office sidebar."
- `docs/design/ui/design-system.html` (page heading vs section 4): "One system, three shells ... 4A · Back office ... 4B · Till ... 4C · Portal ... 4D · Mobile"
- `docs/design/ui/design-language.md` (section 6): "### A · Back office ... ### B · Till ... ### C · Portal ... ### D · Mobile (responsive web)"
- `docs/design/ui/README.md` (Design system bullet): "tokens, states, components and the four shells"

- **What disagrees.** The same shells are counted three in two places and four in three.
- **Higher rule.** design-language.md section 6 (design-system.html says the design language wins)
- **Fix.** Say 'four shells' in the design-system heading and the blueprint (adding Mobile or noting it is the responsive web view).
- **Files to edit.** `docs/design/ui/design-system.html`, `docs/design/ui/ui-blueprint.html`
- **Owner.** design. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Change the design-system.html h1 to "One system, four shells". In ui-blueprint.html line 216, say "Four shells, one account" and add a short D · Mobile card. A lighter option is "Three shells plus Mobile (the responsive web view, covered under Back office below), one account." That wording matches the blueprint's current layout and the design language's definition of D as responsive web.

### N-105 · stale-ref · Design headers list wrong or incomplete PRD sections and policies; two citations name non-existent PRD sections

- `docs/design/stock/stock-ledger.md` (line 7 vs line 9): "Implements these PRD sections: Stock and warehouse control; Ledger and official books (cost formulas and pools); ... Transaction and integration integrity. (ID list also cites PRD-OFR, PRD-RET, PRD-POS, PRD-OFF, PRD-EBO, PRD-IMP, PRD-ACS, PRD-SEC, PRD-NAV, PRD-FRN, PRD-EXC, PRD-ACP)"
- `docs/design/ui/design-system.html` (intro vs body): "It shows these PRD sections: Operator experience; People, access and approvals; Receiving and price tickets; Counter sales and payments; Offline counter; Exceptions, reports and planning. Policies: 2, 3, 6, 7, 16 and 17."
- `docs/design/ui/design-language.md` (§10.5 and §10.10): "(PRD: My work)  |  (PRD: base-to-ticket, ticket-to-purchase, or both supplied and checked)"
- `docs/design/ui/README.md` (line 5): "PRD sections implemented: Product; Organisation, sites and ownership; ... Offline counter; AI, security and operational reliability."

- **What disagrees.** The prose lists omit sections the bodies rely on (ledger: eight listed, many more cited; design-system cites policies 10 but never 6 or 17; design-language omits policy 10; README omits Required policy configuration and Performance). 'My work' is a Words used entry and the PT derivation modes are PRD-PTW-013; neither is a section heading.
- **Higher rule.** AGENTS.md Alignment rules; docs/README.md; docs/design/README.md
- **Fix.** Make each header list every section and policy actually cited (or say 'and the sections cited by the IDs below'); replace the two citations with PRD-ACS-009, PRD-ACS-010 and PRD-PTW-013; make the README a superset of its files' lists.
- **Files to edit.** `docs/design/stock/stock-ledger.md`, `docs/design/ui/design-system.html`, `docs/design/ui/design-language.md`, `docs/design/ui/README.md`
- **Owner.** design owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the proposed fix, with these changes:
- stock-ledger.md: add the missing sections (Booking and buying if cited, Customer returns, Offers, Counter sales, EBO, Franchise or lifecycle sections for LIF, Source conversion and imports, People, access and approvals, Technical platform) or say "and the sections cited by the IDs below".
- design-system.html: add policy 10 to the header list. Either drop 6 and 17 or add the places that justify them.
- design-language.md: replace "(PRD: My work)" with "(PRD-ACS-009, PRD-ACS-010; My work in Words used)". Replace "(PRD: base-to-ticket, ...)" with "(PRD-PTW-013)". Do not add policy 10. Reconcile the listed policies 6 and 19 with the body citations.
- README.md: add "Required policy configuration". Do not add "Performance". Fix "AI, security and operational reliability" to name its parent "Technical platform". Make the list a superset of its files' lists. / Edit only the four design files.

1. In design-language.md, change "PRD: My work" to "PRD-ACS-009, PRD-ACS-010", or to "PRD: Words used, My work". Change "PRD: base-to-ticket, ticket-to-purchase, or both supplied and checked" to "PRD-PTW-013".
2. In design-system.html, make the policy list match the policies the body actually cites (2, 3, 7, 10, 16). Either add 10 or drop 6 and 17 if they are not cited. Also make the section list match the sections the body relies on.
3. In stock-ledger.md, add "and the sections cited by the IDs below", or extend the prose with the other sections the ID list cites. Do not change the ID list.
4. In the UI README, add "Required policy configuration" if the files cite it. Do not add "Performance"; use the real heading "Technical platform" only if that is intended. Otherwise keep the README a superset of its files' real section headings.

Make no PRD or policy edits and add no DEC.

### N-106 · stale-ref · Stock-ledger citations that do not carry the rule attributed to them (section 3, 8.1, 10.5, 2.3, 7.6)

- `docs/design/stock/stock-ledger.md` (section 3 heading line): "`PRD-STK-001`, `PRD-STK-002`, `PRD-REC-009`, `PRD-LED-005`. Each is recorded on its own and changed only by its own events."
- `docs/prd.md` (PRD-REC-009; PRD-LED-005): "Keep counted custody, official priced coverage, available stock and financial approval distinct. / Keep operational quantities, provisional commercial amounts and accounting recognition distinct."
- `docs/design/stock/stock-ledger.md` (section 8.1; 10.5; 2.3; 7.6): "Before a full count freezes, the offline queue is reconciled along with the tills (`PRD-STK-008`). / An EBO import that sells more than the app holds ... (`PRD-EBO-011`, `PRD-EXC-001`). / a mistaken damage confirmation is undone by a reversal (`PRD-DMG-002`, `PRD-DMG-010`) / Moving, returning or disposing of pre-PT stock creates no cost, liability or journal (`PRD-DMG-016`)."
- `AGENTS.md` (Domain rules that cut across modules): "Keep separate: physical custody, PT coverage, availability, ownership and accounting recognition."

- **What disagrees.** The five-way split comes from AGENTS.md; the cited PRD IDs name four things with 'financial approval', three categories or eight states, and ownership is in PRD-ORG-009/014. PRD-STK-008 does not mention the offline queue, PRD-EBO-011 an oversell queue, PRD-DMG-002/010 undoing a confirmation, PRD-REC-006-style coexistence of holds, and PRD-DMG-016 covers pre-PT disposal only (moving and returning are PRD-ACP-004 and POL-17.07).
- **Higher rule.** AGENTS.md: design documents cite the IDs they implement; PRD wins over AGENTS.md wording
- **Fix.** Add PRD-ORG-009, PRD-ORG-014, PRD-ORG-001 and the Custody entry to section 3 and note it combines PRD-REC-009 and PRD-LED-005; re-point the other citations (PRD-OFF-011/PRD-OFF-006 or POL-16, PRD-EBO-003/005, PRD-ACP-004, POL-17.07); mark the rest as design rules and raise undoing a mistaken damage confirmation and EBO oversell as PRD gaps.
- **Files to edit.** `docs/design/stock/stock-ledger.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the fix, with these refinements.
- Section 3 heading: add PRD-ORG-009 and the Custody entry from Words used, and say the section combines PRD-REC-009 and PRD-LED-005 with AGENTS.md. PRD-ORG-014 is already cited in the table.
- Section 8.1, offline queue: re-point to PRD-OFF-011 and PRD-OFF-006, or to POL-16 if it carries the rule.
- Section 10.5, EBO oversell queue: re-point to PRD-EBO-003 and PRD-EBO-005, and raise the oversell queue as a PRD gap.
- Section 2.3, undoing a mistaken damage confirmation: mark it as a design rule and raise it as a PRD gap. PRD-DMG-003 covers only rejecting a report before confirmation.
- Section 7.6: keep PRD-DMG-016 for disposal only. Cite PRD-ACP-004 and PRD-DMG-008 for moving and returning, and cite POL-17.07 only for "no fictitious cost, liability or journal". / Edit only docs/design/stock/stock-ledger.md. (a) Section 3 heading line: add PRD-ORG-009, PRD-ORG-014 and PRD-ORG-001 (the table rows already cite PRD-ORG-014, so no row changes are needed). Note that the five-way split combines PRD-STK-001/002, PRD-REC-009 and PRD-LED-005 and that the ownership dimension comes from the AGENTS.md rule and PRD-ORG-009/014. (b) Line 304: re-point to PRD-OFF-011 and PRD-OFF-006 (or POL-16.05) instead of PRD-STK-008. Keep PRD-STK-008 only for "reconcile tills". (c) Line 393: replace PRD-EBO-011 with PRD-EBO-003, PRD-EBO-005, PRD-EXC-001 and PRD-INT-005. Mark the oversell queue as a design rule and raise it as a PRD gap with the product owner. (d) Line 59: drop PRD-DMG-002/010 as the source for "undone by a reversal". Cite PRD-DMG-003 and PRD-ACS-014 for what they do say. Mark the reversal after confirmation as a design rule and raise it as a PRD gap. (e) Line 244: cite PRD-ACP-004 and POL-17.07 for moving and returning, and keep PRD-DMG-016 for disposal only. Do not edit the PRD or policies without a DEC.

### N-107 · stale-ref · design-language.md 'Aligned on 2 Oct 2026' and design-system.html 'REV 3 · 2 OCT 2026' pre-date DEC-027 to DEC-035 (3 Oct)

- `docs/design/ui/design-language.md` (line 5): "Status: **Current.** Aligned to [prd.md] and [kdps-policies.md] on 2 Oct 2026."
- `docs/decisions.md` (DEC-027 to DEC-035): "**Date:** 3 Oct 2026 ... Changed. New `PRD-LIF-026` ... `PRD-LIF-027` ... `PRD-STK-013` to `PRD-STK-015` ... `PRD-LED-016` to `PRD-LED-018`"

- **What disagrees.** The alignment claim is dated before nine decisions that changed PRD text, with no recorded re-check.
- **Higher rule.** docs/README.md ('Fix the lower document to match the higher one')
- **Fix.** Re-check against DEC-027 to DEC-035 (the §10.17 test-data wording first) and re-date, or drop the date claim.
- **Files to edit.** `docs/design/ui/design-language.md`, `docs/design/ui/design-system.html`
- **Owner.** design owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.

### N-108 · stale-ref · design-system.html sample weekdays are wrong for 2026 (23 Sep 2026 is a Wednesday)

- `docs/design/ui/design-system.html` (portal greeting and attendance rows): "Shift 10:00–19:00 · Tuesday, 23 Sep 2026 ... ['Mon 22 Sep', '09:58 – 19:04', 'Present', 's'], ['Sun 21 Sep', 'No shift', 'Week off', 'n']"

- **What disagrees.** Every weekday is off by one day (23 Sep 2026 is Wednesday); the 'Week off' lands on a Monday.
- **Higher rule.** design-language.md §8 (dates); the page's own 23 Sep 2026 sample date
- **Fix.** Correct weekday names (Wed 23 Sep 2026; Tue 22, Mon 21, Sun 20, Sat 19, Fri 18 Sep) and move 'Week off' to the Sunday row.
- **Files to edit.** `docs/design/ui/design-system.html`
- **Owner.** design. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** In docs/design/ui/design-system.html, correct the weekday names. Change the greeting to "Wednesday, 23 Sep 2026". Change the attendance rows to Tue 22 Sep, Mon 21 Sep, Sun 20 Sep, Sat 19 Sep and Fri 18 Sep. Make "Week off" a sample choice, not a rule: moving it to the Sunday (20 Sep) row is fine and looks natural, but swapping the statuses is optional. Keeping it on the Monday 21 Sep row is also valid, because weekly offs are configurable under POL-13.03. Make the edit using the AGENTS.md procedure. Unpack the page with json.loads from the __bundler/template script. Edit it. Repack with json.dumps(page, ensure_ascii=False).replace('</', '<\\u002F'). Leave the manifest alone.

### N-109 · stale-ref · support.js header points to a source folder and build command that are not in this repository

- `docs/design/ui/support.js` (line 1): "// GENERATED from dc-runtime/src/*.ts — do not edit. Rebuild with `cd dc-runtime && bun run build`."
- `AGENTS.md` (Current state): "The repository holds documents only. There is no code, package manifest, build, lint or test command yet. Do not invent commands; add them here once the workspace exists."

- **What disagrees.** No dc-runtime folder, bun or build command exists here; the file is carried over from the RetailsOps origin.
- **Higher rule.** AGENTS.md Current state
- **Fix.** Add a note to design/ui/README.md that support.js is a vendored runtime not rebuilt here, or change the comment to say where it comes from.
- **Files to edit.** `docs/design/ui/README.md`, `docs/design/ui/support.js`
- **Owner.** design. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Sceptic notes.** Keep the proposed fix, with one caution. Add a line to docs/design/ui/README.md saying support.js is a vendored, generated runtime whose source (dc-runtime) is not in this repository and is not rebuilt here. Editing the line 1 comment in support.js is optional, since the file says "do not edit". If you do edit it, replace only the rebuild instruction and do not name an origin you have not confirmed. / Make the README note the primary fix. Add one sentence to docs/design/ui/README.md, next to the UI blueprint bullet. It should say support.js is a vendored, pre-built runtime copied in from elsewhere, that its source (dc-runtime) and build command are not in this repository, and that nobody should rebuild or hand-edit it here. Leave the first-line comment of support.js alone, because it is generated output marked "do not edit". If someone does reword it, the new text must say only that the source is not in this repository. It must not name an origin such as "RetailsOps" or a build command, since neither is documented here. Do not add dc-runtime or bun commands to AGENTS.md.

## 3. Split verdicts

### N-01 · clash · PRD-STG-002 says every stage records stock and money effects from the start; phases.md and AGENTS.md narrow it without a decision

- `docs/prd.md` (PRD-STG-002): "Each stage records its stock and money effects from the start; stage 5 extends those records into full accounting."
- `docs/phases.md` (Stage 1 'Stock and money records from day one'): "None are live. The rules that every later stage posts under are fixed and tested here."
- `AGENTS.md` (Delivery): "Each live operational stage records its stock and money effects from its first enabled operation."

- **What disagrees.** The PRD rule has no live/enabled qualifier. Phases (stage 1: none live; stage 5: 'No new kinds') and AGENTS.md narrow it. No DEC narrowed the PRD wording, and the phases heading 'from day one' sits on stages where it does not apply.
- **Higher rule.** docs/prd.md PRD-STG-002
- **Fix.** Product owner logs a DEC and rewords PRD-STG-002 to 'Each live operational stage records its stock and money effects from its first enabled operation', or rewords the phases headings. Do not leave three documents saying different things.
- **Files to edit.** `docs/prd.md`, `docs/decisions.md`, `docs/phases.md`
- **Owner.** product owner. **Blocks.** 1. **Needs a product-owner decision.** yes.
- **Status.** Kept for the decision pack or a small fix.
- **Sceptics.** HOLDS: All three quotes are verbatim at their locators. docs/prd.md:238 PRD-STG-002 reads "Each stage records its stock and money effects from the start; stage 5 extends those records into full accounting." It has no live or enabled qualifier. docs/phases.md:49 (Stage 1) reads "**Stock and money records from day one.** None are live. The rules that every later stage posts under are fixed and tested here." Stage 5 (line 175) says "No new kinds." AGENTS.md:68 sits under the "## Delivery" heading (line 66) and says "Each live operational stage records its stock and money effects from its first enabled operation." The narrowing is real and has no recorded decision. grep of docs/decisions.md for enabled, live operation and synthetic finds nothing that rewords PRD-STG-002. Two additions: docs/phases.md:11 also narrows the rule ("Every enabled operational stage records its stock and money effects from its first live operation"), so a fourth statement exists, and it should be aligned in the same fix. The findings text is accurate on that line only by implication. The proposed fix is reasonable: the PRD is the higher document, so a DEC plus a PRD reword is the correct route. / REFUTED: The finding overstates a wording nit as a clash. (1) The PRD does not say what the finding claims. The PRD stage table (prd.md ~line 232) says stage 1 delivers "stock/money recording rules". PRD-STG-002 then says each stage records effects "from the start", and stage 5 "extends those records into full accounting". Read together, stage 1 fixes the rules, later stages record effects as they go live, and stage 5 adds accounting. phases.md matches this: stage 1 "None are live. The rules that every later stage posts under are fixed and tested here"; stage 5 "No new kinds ... reconciled, closed by period and exchanged with Tally". Each stage records effects from its own start, and stage 1 has no live operations to record. AGENTS.md "Each live operational stage records ... from its first enabled operation" is a restatement that fits the PRD, not a narrowing. It also fits the PRD's own rules that policy-dependent live use waits for signed policies, and phases.md stage 1 "Out of scope". (2) docs/decisions.md has no DEC about PRD-STG-002, but none is needed. No PRD or policy meaning changes, and decisions.md is not ranked. (3) The proposed fix edits the higher document (prd.md) and needs a new DEC. That is heavy for what is at most a label issue. (4) "blocks_stage: 1" has no support. The only real residue is that the phases.md heading "Stock and money records from day one" sits on stage 1 ("None are live") and stage 5 ("No new kinds"), which reads loosely. That is a low-severity wording issue in the lower document.

### N-11 · clash · POL-09.21 retains KDPS's 'current' cost method although the PRD supports only FIFO and moving weighted average

- `docs/kdps-policies.md` (POL-09.21): "Initially retain KDPS's current CA-approved inventory-cost method and pool. Their actual method and pool are unknown until verified; do not switch methods based on a preferred future option."
- `docs/prd.md` (PRD-LED-014): "Support FIFO and moving weighted-average cost formulas. The Financial posting policy selects the formula for each accounting book"
- `docs/decisions.md` (DEC-031 Choice): "Periodic average stays out until a PRD change. If Accounts finds that KDPS uses one today (`POL-09.21`), raise it then."

- **What disagrees.** POL-09.21 is unqualified: if the current method is periodic average or anything outside PRD-LED-014, the policy answer falls outside the options the PRD allows.
- **Higher rule.** docs/README.md (policy within PRD options); PRD-LED-014
- **Fix.** After a decision entry, add to POL-09.21 'provided it is FIFO or moving weighted average (PRD-LED-014); any other method is raised as a PRD change'. Keep Accounts question 1 as the trigger.
- **Files to edit.** `docs/kdps-policies.md`, `docs/decisions.md`
- **Owner.** product owner (wording); Accounts and CA (fact). **Blocks.** 2 (first receipt cost). **Needs a product-owner decision.** yes.
- **Status.** Parked (a sceptic refuted it, citing a decision or reading that already settles it).
- **Sceptics.** HOLDS: All three quotes exist verbatim. POL-09.21 is at docs/kdps-policies.md line 279. PRD-LED-014 is at docs/prd.md line 561, and the quote is a correct prefix of the requirement. The DEC-031 quote is in the Choice section at docs/decisions.md line 323. The gap is real: POL-09.21 says "retain current method" with no condition, while PRD-LED-014 allows only FIFO and moving weighted average. The finding's severity is overstated, though. "Clash" implies a present contradiction, but no method is stated yet, and POL-09.21 itself says the method is "unknown until verified". The case is already covered in three places. (1) docs/README.md line 32 says "A KDPS policy answer that falls outside the options the PRD allows is not a valid policy. It is a request to change the PRD." (2) DEC-031 says that if KDPS uses a periodic average today (POL-09.21), "raise it then". (3) docs/questions-for-kdps.md lines 74 and 88 already ask Accounts to say whether KDPS uses a periodic average and to confirm the method. So this is a latent wording gap in POL-09.21, not a clash, and the Accounts question is already the trigger. The proposed fix is sound and follows the README order (decision entry first, then the edit). It is optional tightening and does not block stage 2 on its own. The real blocker is the unanswered V-08/V-09 fact. / REFUTED: The finding quotes the documents correctly. But DEC-031 already settles the case it describes, so this is not a live clash.  - PRD-LED-014 (prd.md:561) does say "Support FIFO and moving weighted-average cost formulas". POL-09.21 (kdps-policies.md:279) does say "retain KDPS's current CA-approved method and pool" with no qualifier. - DEC-031 "Choice" (decisions.md:323) is the product owner's decision on exactly this. It keeps periodic average out "until a PRD change" and says "If Accounts finds that KDPS uses one today (`POL-09.21`), raise it then." So the DEC names POL-09.21 and fixes the route: raise it as a PRD change if the fact turns up. It does not ask for a qualifier in the policy text. - Nothing disagrees today. KDPS's real method is unknown (POL-09.09, POL-09.21), and the possible mismatch is a factual contingency. The trigger is already live. questions-for-kdps.md:74 asks Accounts about a periodic average explicitly. alignment-report.md section 4.2 and V-08 and V-09 record "Product side settled: DEC-004, DEC-018 and DEC-031", with the block on stage 2 first receipt cost. - The finding's "clash" severity is therefore wrong. At most this is an optional wording note. - The proposed fix would also add a restriction to POL-09.21 ("provided it is FIFO or moving weighted average; any other method is raised as a PRD change"). That is new policy wording. AGENTS.md says PRD and policy text belong to the user, so it needs a new DEC and owner approval. The finding does flag that, but it creates a second DEC where DEC-031 already holds the decision. - The fix does edit the right document. The PRD is rank 1, the policy is rank 2, and the fix edits the policy, not the PRD. The problem is that it is unnecessary, not that it points the wrong way.  If the owner ever wants the escalation written into the policy, treat that as an optional clarity edit. It should cite DEC-031 and add no new values. It is not a clash and does not block stage 2.

### N-13 · clash · Blueprint puts the Opening stock page in the stage 2 module; policy 14 and phases load real opening stock only at the stage 4 switch

- `docs/design/ui/ui-blueprint.html` (module 04 'Receive Goods' (Stage 2), pages list): "L('Opening stock', 'Manifest · Physical check · Opening PT', 'Policy 14')"
- `docs/kdps-policies.md` (POL-14.07): "Load real opening stock and balances only at each Store's approved day-close switch in stage 4."
- `docs/phases.md` (Stage 1 'Goal' and 'Out of scope'): "Opening balances are prepared but not loaded."

- **What disagrees.** Phases has opening-stock work only as stage 1 layouts and the stage 4 switch, yet its stage 2 exit check mentions 'opening goods'. The stock ledger says an opening count goes live 'When its Site goes live (SL-9)', a third timing.
- **Higher rule.** POL-14.07; PRD-LIF-004 to PRD-LIF-011
- **Fix.** Relabel the blueprint page 'Stages 1 and 4 (sample data only before the switch)'. Decide whether stage 2 has an opening-stock acceptance path, or reword the stage 2 exit check as a synthetic-data test.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`, `docs/phases.md`
- **Owner.** product owner. **Blocks.** 2. **Needs a product-owner decision.** yes.
- **Status.** Parked (a sceptic refuted it, citing a decision or reading that already settles it).
- **Sceptics.** HOLDS: All three quotes were found verbatim and say what the finding claims. (1) docs/design/ui/ui-blueprint.html line 347 is module 04 'Receive Goods', stage 'Stage 2'. Its pages list contains L('Opening stock', 'Manifest · Physical check · Opening PT', 'Policy 14'). The warehouse persona at line 375 also lists 'Opening stock' under Receive Goods. (2) docs/kdps-policies.md POL-14.07 says: 'Load real opening stock and balances only at each Store's approved day-close switch in stage 4.' (3) docs/phases.md line 47, in the Stage 1 'Out of scope' paragraph, ends 'Opening balances are prepared but not loaded.' (Stage 1 'Goal' at line 32 also says real balances load only at each Store's approved cutover.) The secondary claims also hold. The stage 2 exit check at phases.md line 90 reads 'Supplier, direct-store and opening goods meet the same selling-Site acceptance and hold checks.' docs/design/stock/stock-ledger.md line 57 gives the opening count timing as 'When its Site goes live (SL-9)'. SL-9 (line 543) is an open question for the product owner and KDPS, marked 'Not a build blocker', and line 333 acknowledges POL-14.07 currently allows real opening stock only at a Store's switch. So the clash is real: the blueprint places an Opening stock page in a stage 2 module, and phases.md and POL-14.07 push real loading to stage 4. The finding is not settled elsewhere, since SL-9 and the alignment report list it as still open. Two caveats on severity and fix. (a) The stock ledger and the alignment report already track the warehouse timing as SL-9, 'not a build blocker'. That weakens 'blocks_stage: 2' and suggests this is partly a known open item. The blueprint page label is still a genuine inconsistency. (b) Phases places the opening-data layouts (stage 1) and the stage 4 switch. It does not explicitly say where the Opening stock page lives. The page could legitimately be a stage 2 screen run on sample data. The proposed relabel and the stage 2 exit check rewording are reasonable, but both depend on a product-owner decision, as the finding says. / REFUTED: The finding does not hold, for four reasons.  1. The "clash" mixes up building a page with loading real data. The blueprint's stage 2 'Opening stock' page (Manifest, Physical check, Opening PT) does not claim real stock is loaded in stage 2. POL-14.07 and DEC-013 (docs/decisions.md line 138) say only that real opening stock and balances load at each Store's stage 4 switch, and that layouts and tools are built and tested with sample data earlier. Phases line 47 ("Opening balances are prepared but not loaded") says the same.  2. The stage 2 exit check is required by the PRD. PRD-ACP-003 (docs/prd.md line 906) says "Supplier, direct-store, opening and transfer goods all meet the same selling-Site acceptance and hold checks." The phases exit check at line 90 restates it. PRD-LIF-004 also requires an opening PT and Site acceptance for existing stock. The opening PT and acceptance run on the stage 2 PT workbench and acceptance machinery. So the page sits in the Receive Goods module (stage 2) for a reason. It is exercised with synthetic data, as phases line 47 says for policy-dependent paths. Because PRD-ACP-003 already settles this, there is no open question about whether stage 2 needs an opening-goods acceptance path.  3. The "third timing" in the stock ledger (stock-ledger.md lines 57, 333, 543) is already tracked as SL-9. SL-9 is explicitly "Not a build blocker", and the ledger says "no answer changes the ledger". The alignment report (docs/reports/alignment-report.md line 215) lists it as still open and not a build blocker. So "blocks_stage: 2" and "needs a product owner decision now" are unsupported.  4. The proposed fix is wrong. Relabeling the page "Stages 1 and 4" would contradict PRD-ACP-003, PRD-LIF-004 and the phases stage 2 exit check, which all put opening-goods acceptance and the opening PT workflow in stage 2. Making the blueprint match phases would mean moving the page out of stage 2, and that would break the PRD. The reword-the-exit-check option is also unnecessary, because the check just mirrors PRD-ACP-003.  At most, a polish item remains. The blueprint page could carry a note such as "sample data until the stage 4 switch (POL-14.07)", and phases line 90 could say it is exercised with synthetic data. That is a minor clarification, not a clash, and it needs no decision from the product owner.

### N-18 · clash · Bill-number format: PRD sets it per Organisation, POL-10.07 and the CA question ask per tax registration

- `docs/prd.md` (PRD-POS-020): "Set the number format per Organisation within the statutory limits for invoice numbers."
- `docs/kdps-policies.md` (POL-10.07): "The bill-number format for each tax registration, within the statutory limit, remains to be confirmed by the CA."
- `docs/questions-for-kdps.md` (CA question 4): "Please confirm the length limit and allowed characters, and approve a format."

- **What disagrees.** The PRD allows one format per Organisation (series split per device, registration and year). The policy would let registrations carry different formats. Known 4.9/V-40 records the format as open, not this scope mismatch.
- **Higher rule.** docs/prd.md PRD-POS-020
- **Fix.** Decide scope. If one per Organisation, reword POL-10.07 to 'Organisation-wide format, checked by the CA against the statutory limit for every registration'. If per registration, log a DEC and change PRD-POS-020 first.
- **Files to edit.** `docs/kdps-policies.md`, `docs/questions-for-kdps.md`
- **Owner.** Product owner (scope); CA (compliance). **Blocks.** 4. **Needs a product-owner decision.** yes.
- **Status.** Parked (a sceptic refuted it, citing a decision or reading that already settles it).
- **Sceptics.** HOLDS: All three quotes are verbatim at their locators. They are PRD-POS-020 (prd.md:484), POL-10.07 (kdps-policies.md:305) and CA question 4 (questions-for-kdps.md:90). The scope is already settled, though. DEC-005 (decisions.md:56-67) records "format set per Organisation within statutory limits" under PRD-POS-020. It then says POL-10.07 is "format to be confirmed by the CA". So the product owner has chosen Organisation-wide, and the "Decide scope / log a DEC / change PRD first" branch of the fix is unnecessary. What remains is a wording ambiguity. POL-10.07 says "for each tax registration", which can be read as per-registration formats. Question 4 only says each till has its own series per GST registration, which is a series scope and not a format scope. So this is a minor wording clash, not a "clash" needing a product owner decision. needs_product_owner_decision should be false. / REFUTED: The scope question was already decided in DEC-005 (docs/decisions.md, 2 Oct 2026, decided by the product owner, report item 4.9/B-3/V-40). DEC-005 created PRD-POS-020 ("format set per Organisation within statutory limits") and POL-10.07 ("format to be confirmed by the CA") in the same entry. So the PRD (the higher document) says what the finding quotes, but there is nothing left for the product owner to decide, and no DEC is needed to "decide scope". POL-10.07 does not say that registrations may carry different formats. Read next to PRD-POS-020, "for each tax registration" is most naturally the CA confirming that one Organisation-wide format fits every registration's statutory limit. CA question 4 also asks the CA to "approve a format" (singular) and states the series is per registration and year, which is consistent with PRD-POS-020. The question is also not the place where policy is decided. Under AGENTS.md the PRD wins, so the policy cannot create per-registration formats anyway. At most this is a wording ambiguity in POL-10.07. It is not a "clash", it does not need a product-owner decision, and it does not block stage 4 beyond the existing CA confirmation. The proposed fix also has problems. It rewrites POL-10.07 without first logging a DEC, which AGENTS.md requires for any edit to kdps-policies.md. Its second branch (per-registration formats) would reverse DEC-005. If the maintainer wants the ambiguity removed, the correct route is a short DEC-005 follow-up entry that clarifies POL-10.07, with the policy edit made only after approval.

### N-19 · clash · Salesperson persona lands on a stage 6 screen although salesperson attribution starts in stage 4

- `docs/design/ui/ui-blueprint.html` (menus P-SLS; module 14 Self-service): "land: 'Self-service › My targets' … { num: '14', name: 'Self-service', shell: 'Portal', stage: 'Stage 6'"
- `docs/prd.md` (PRD-POS-002): "Attribute each line to a salesperson separately from the cashier."
- `docs/phases.md` (Stage 6 In scope): "HRMS and payroll: employee records, attendance, rosters, leave, targets, incentives, payroll, advances."

- **What disagrees.** Between stages 4 and 6 the persona has a landing page that does not exist. PRD-UXP-004 lists staff self-service for Store users without a stage while phases puts targets in stage 6.
- **Higher rule.** phases.md stages 4 and 6; PRD-UXP-004
- **Fix.** Give P-SLS a stage 4 landing (for example Sell > own lines) and keep Self-service as the stage 6 landing, or note the stage on the persona card.
- **Files to edit.** `docs/design/ui/ui-blueprint.html`, `docs/design/access/personas.md`
- **Owner.** design (UI and access). **Blocks.** 4. **Needs a product-owner decision.** no.
- **Status.** Parked (a sceptic refuted it, citing a decision or reading that already settles it).
- **Sceptics.** HOLDS: Every quote was found verbatim at its locator.  - ui-blueprint.html line 373: P-SLS has land: 'Self-service › My targets'. Line 357: module 14 Self-service is 'Stage 6'. personas.md line 46 repeats the same landing for P-SLS. - prd.md line 466 has PRD-POS-002 'Attribute each line to a salesperson separately from the cashier.' It sits in the Counter sales section, which phases.md Stage 4 puts in scope. phases.md line 145 also lists 'Sales by ... salesperson' as a stage 4 report. - phases.md line 194 puts 'targets, incentives' under Stage 6 HRMS and payroll. - The P-SLS menu also has a Sell item, 'Own attributed lines (read-only)', and Sell (module 02) is Stage 4. The item exists from stage 4, but the landing page does not exist until stage 6. - PRD-UXP-004 (prd.md line 742) gives Store users 'staff self-service' with no stage. - Nothing in the blueprint or personas.md gives a stage-gated landing or an interim landing for P-SLS, so the gap is not settled elsewhere.  The finding holds. Its severity is arguably minor, because a Stage 4 landing is a small tweak. The proposed fix is reasonable: land on Sell > own lines until stage 6, or note the stage on the persona card. / REFUTED: The quotes are accurate, but they do not show a clash. (1) The higher documents do not say what the finding claims. PRD-POS-002 only says to attribute each line to a salesperson separately from the cashier. PRD-UXP-004 only says Store users get "staff self-service". No PRD, policy or phases text requires a persona landing page to exist at a given stage. phases.md's Stage 6 list says nothing about landing pages either. So the "higher_rule" cited does not contradict the blueprint. (2) The persona menus and landings in ui-blueprint.html (menus array, lines 372-373) and personas.md (lines 46 and 107-109) describe the end state of the product. Neither file ties a persona's landing to a delivery stage. The same pattern holds for other personas: P-HRS lands on People, which is stage 6. Only the modules carry stage tags. (3) In stage 4 the salesperson is not a login persona needing a landing. Attribution is a till field (F3 Salesperson, "salesperson per line", blueprint lines 257-260), and the stage 4 report "Sales by ... salesperson" is a report. Self-service "comes with an employee record" (personas.md line 141). phases.md says employee records and attendance "can start after stage 1", and that incentives need sales evidence "from the parallel-run import or from stage 4". The sequencing is therefore deliberately flexible, and self-service can arrive before stage 6. (4) No DEC in decisions.md addresses this, so nothing already settles it. But "clash" severity and "blocks_stage 4" are overstated. At most this is a minor design-note gap, not a conflict with a higher document. Fixing it would not unblock stage 4. (5) The proposed fix is weak. A stage 4 landing of "Sell > own lines" would rely on a page that is not in module 02's page list. The finding's second option, a stage note on the persona card, is acceptable, since it edits only the design documents and invents no value. If anything is kept, downgrade it to a note-level item: add a line to personas.md or the blueprint saying persona menus show the end state and that Self-service appears when the stage 6 HRMS lands.

### N-29 · clash · POL-02.07 lists 'no-bill returns' as an independent-approval trigger although DEC-012 gives refund triggers only to policy 7

- `docs/decisions.md` (DEC-012 Choice): "Policy 7 owns which refund cases require independent approval. Policy 2 owns assigned approvers, authority, limits and no-self-approval, and cross-references policy 7. Do not duplicate refund triggers."
- `docs/kdps-policies.md` (POL-02.07): "refund cases identified under policy 7; no-bill returns; supplier payments and supplier bank-detail changes"
- `docs/kdps-policies.md` (POL-07.09): "Require independent approval for no-bill returns, cash substitution, tender/return overrides and refunds above the authorised limit."

- **What disagrees.** No-bill returns are a trigger in POL-07.09 and again by name in POL-02.07, which DEC-012 said not to duplicate.
- **Higher rule.** DEC-012; PRD-RET-010, PRD-RET-017
- **Fix.** Remove 'no-bill returns' from POL-02.07; 'refund cases identified under policy 7' already covers it.
- **Files to edit.** `docs/kdps-policies.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Status.** Parked (a sceptic refuted it, citing a decision or reading that already settles it).
- **Sceptics.** HOLDS: All three quotes exist verbatim at their locators and say what the finding claims. DEC-012 (docs/decisions.md line 133, Choice) reads: "Policy 7 owns which refund cases require independent approval. ... Do not duplicate refund triggers." POL-02.07 (docs/kdps-policies.md line 88) lists "refund cases identified under policy 7; no-bill returns; supplier payments...". POL-07.09 (line 221) says "Require independent approval for no-bill returns, cash substitution, tender/return overrides and refunds above the authorised limit." Policy 7 is titled "Refunds and no-bill returns" (line 202), so no-bill returns are in policy 7's scope and "refund cases identified under policy 7" already covers them. DEC-012's "Changed" line lists POL-02.07, so that clause was meant to be reconciled, and the leftover "no-bill returns" is a duplicated trigger. PRD-RET-010 and PRD-RET-017 (prd.md lines 498 and 506) do not conflict with the fix: RET-010 covers cash substitution and tender overrides, and RET-017 only makes no-bill returns unavailable until configured. Nothing in decisions.md settles this differently. A minor caveat is that DEC-012 says "refund triggers" and no-bill returns are arguably returns, not refunds. Policy 7's own title and POL-07.09 still treat them as policy 7 triggers, so the finding holds and the proposed fix is sound. / REFUTED: The finding does not hold. DEC-012 covers "refund cases", and no-bill returns are not shown to be one. (1) DEC-012 lists POL-02.07 among the bullets it changed. Commit 5070f28's earlier wording was "configured exceptional discounts and refunds; no-bill returns; ...". The edit replaced only "and refunds" with "; refund cases identified under policy 7", and "no-bill returns" was kept as its own list item. That reads as a deliberate, reviewed edit, not a missed one. DEC-016 then reviewed DEC-012 to 015 for slips and did not flag this. (2) The PRD treats no-bill returns as a separate category from refunds. PRD-ACS-015 says "bill value for discounts, refunds and no-bill returns". PRD-RET-017 is a separate rule for no-bill returns. The PRD row for policy 7 is headed "Refunds and no-bill returns" and lists "Refund cases requiring independent approval" and "no-bill eligibility/valuation" as distinct items. POL-07.09 also names no-bill returns apart from "refunds above the authorised limit". So "refund cases identified under policy 7" does not clearly cover no-bill returns, and removing the item could drop an approval trigger from the policy 2 list. (3) The list in POL-02.07 is an enumeration of "independently approved actions", and its stated aim is to name every one. It is not a refund-trigger definition. The trigger rule itself lives only in POL-07.09, and the policy 2 list adds no new condition. At most this is harmless cross-listing. It is not a clash with DEC-012. (4) The proposed fix edits a policy bullet, which AGENTS.md says needs a logged DEC. DEC-012 already listed this bullet and settled its wording, so a further edit would need a fresh decision. The finding's flag of needs_product_owner_decision=false is therefore wrong. If anyone wants "no-bill returns" to move wholly into policy 7, that is a product-owner call and a new DEC, not a mechanical alignment fix.

### N-33 · clash · Large documents posted as queued jobs 'never inside a user's request' versus the same-transaction rule the ledger itself cites

- `docs/design/stock/stock-ledger.md` (section 1 vs section 10.6): "Every stock effect of a business action is written through that interface in the same database transaction as the action (`PRD-MOD-006`, `PRD-INT-004`). / Large postings run as queued jobs, one at a time per accounting book, never inside a user's request. The document shows Posting until it commits."
- `docs/prd.md` (PRD-MOD-006; PRD-INT-004): "Perform synchronous economic effects through module interfaces in one transaction; use the outbox for durable follow-up."

- **What disagrees.** Section 10.6 defers the stock effect of an approved PT, opening or count to a queued job with a 'Posting' state and does not say whether approval evidence commits with the click or the job. Only chunked posting (SL-11) is flagged as bending PRD-INT-004.
- **Higher rule.** PRD-MOD-006, PRD-INT-004
- **Fix.** State in 10.6 what commits at approval versus in the job, and raise whether queued posting fits PRD-MOD-006 / PRD-INT-004 alongside SL-11 rather than treating it as settled.
- **Files to edit.** `docs/design/stock/stock-ledger.md`
- **Owner.** product owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** yes.
- **Status.** Kept for the decision pack or a small fix.
- **Sceptics.** REFUTED: The quotes are verbatim: stock-ledger.md line 20 (section 1), line 400 (10.6), prd.md lines 786 and 803. But they don't clash, and the ledger already settles the question the finding calls open.  1. Section 1 says stock effects are written in the same transaction "as the action". Section 10.6 says the posting is a queued job, "never inside a user's request", and the document "shows Posting until it commits". PRD-MOD-006 and PRD-INT-004 require atomicity (one transaction, or none). They say nothing about whether that transaction runs in the HTTP request or in a job. The job's single transaction satisfies them.  2. 10.6's first bullet states "One document is still one transaction (`PRD-INT-004`, `PRD-IMP-012`)". Section 10.2 (line 361) lists "Number allocation, movements, balance rows, pool rows, approval evidence, audit and outbox commit together, or none of them do". So approval evidence commits with the posting transaction, which in 10.6 is the job. The finding's claim that the ledger "does not say whether approval evidence commits with the click or the job" is mostly wrong.  3. Only chunking is flagged as bending PRD-INT-004 (SL-11), and that is correct. Queued posting does not bend it. prd.md PRD-PRF-003 ("Reporting, imports and background work must not delay counter finalisation") is the stated driver for taking large postings off the request path.  4. What remains is a small wording gap. 10.6 never says what the click itself records. It presumably writes only a queue entry or a Posting marker, and approved state and evidence appear only when the job commits. That is a clarity edit. It is not a "clash" and does not need a product-owner decision. / HOLDS: The finding holds, but its severity is overstated. PRD-INT-004 (prd.md:803) says to commit "number allocation, stock, monetary records, approval evidence, audit and outbox together or commit none". PRD-MOD-006 (prd.md:786) is also as quoted. Stock-ledger.md section 1 (line 20) and section 10.6 (lines 399-402) say one document is still one transaction, but that large postings run as queued jobs "never inside a user's request", with the document showing Posting until it commits. No PRD or policy text settles queued posting, and docs/decisions.md has no DEC covering queued jobs, a Posting state, PRD-INT-004 or PRD-MOD-006. No other design doc defines the Posting state. Only SL-11 (chunked posting) is flagged as bending PRD-INT-004, and SL-11 itself is not at issue. The open point is that 10.6 never says what the user's approval click commits and what the job commits. Approval evidence is one of the items PRD-INT-004 binds to the stock write, so the click could leave it committed before the stock effect.  The 10.6 design is not clearly non-compliant. If the whole approval commits inside the job, PRD-INT-004 is met. That makes this a gap in the lower document, not a "clash". The fix is also not a product-owner decision unless the design chooses to commit approval evidence at the click, separately from the stock effect. The proposed fix edits only the lower document (stock-ledger.md) and invents no values. It respects AGENTS.md, which bars editing the PRD or policies without a DEC.  Retained: 10.6 should state what the click commits (for example, only a request to post) and what the job commits (approval evidence, stock, number allocation, audit and outbox together). Only if approval evidence commits at the click should the design be raised to the product owner as a PRD-INT-004 question, with its own OPEN item like SL-11.

### N-38 · clash · design-system.html exception drawer, approval panel and PT approval example conflict with the PRD and the page's own grid

- `docs/prd.md` (PRD-ACS-015 and PRD-ACS-016): "use the total proposed acquisition cost of the covered PT quantities: the proposed P RATE times the covered quantity on the PT revision under approval ... missing or disputed proposed acquisition cost blocks value-based approval until resolved; do not treat it as zero."
- `docs/design/ui/design-system.html` (4A approval drawer vs 3.10 PT grid): "48 × ₹1,500.00 + 57 × ₹1,500.00 + 408 × ₹1,300.00 + 260 × ₹1,300.00 + 144 × ₹800.00 + 179 × ₹1,600.00 = ₹14,27,500.00 ... Linen shirt, M, QTY 48 ... 'P RATE': '1,749.50' ... Polo QTY 144 ... 'P RATE': '935.48'"
- `docs/design/ui/design-system.html` (3.10 grid row 203): "[203, {... MRP: '', BASIC: '', 'P RATE': '', MARGIN: '', 'SUPPLIER COST': '1,499.50' }, { [missing]: 'err' }, false]"
- `docs/prd.md` (PRD-ACS-015 last sentence): "Show the basis beside the limit."
- `docs/design/ui/design-system.html` (mkAp limit scale): "<span>₹0</span><span>Your limit up to {{ a.limit }}</span><span>Next: {{ a.next }}</span> ... valueLabel: 'Value at cost'"
- `docs/reports/alignment-report.md` (§6 E-2): "Its synthetic example shows 1,096 pieces and ₹14,27,500, calculated from its displayed quantities and unit costs"

- **What disagrees.** The drawer total uses unit costs that differ from the P RATE in the grid for the same PT-0098; grid row 203 has blank P RATE but the drawer still counts 408 pieces and can enable Approve; PT-0098 is 10,000 rows in the grid but 7 lines in the drawer. The limit line shows no basis (the basis sits above the value, not beside the limit). E-2 is marked Fixed but does not tie unit costs to the grid. The exception drawer (EXC-2291) also shows an owner and two due times with no sample label while POL-02.11 leaves owners and due times unconfigured and PRD-EXC-001 gives one due date.
- **Higher rule.** PRD-ACS-015, PRD-ACS-016, PRD-EXC-001; DEC-015, DEC-016; POL-02.11
- **Fix.** Derive the drawer total from the grid's P RATE per row; treat row 203 as unknown cost (Approve blocked); use consistent line counts; write the basis beside the limit ('Your limit up to ₹X at cost') in §10.14 and 4A; label exception owner and due times synthetic or 'Not set up yet (policy 2)'. Correct E-2.
- **Files to edit.** `docs/design/ui/design-system.html`, `docs/design/ui/design-language.md`, `docs/reports/alignment-report.md`
- **Owner.** design. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.
- **Status.** Parked (a sceptic refuted it, citing a decision or reading that already settles it).
- **Sceptics.** HOLDS: The finding holds on the evidence.  The PRD, E-2 and design-language.md quotes are verbatim: prd.md lines 292-293 (PRD-ACS-015/016), alignment-report.md line 293 (E-2), and design-language.md section 10.14. The design-system.html text sits in the JSON-escaped `__bundler/template` block, so a raw grep misses it. I decoded the block and confirmed each claim there.  1. Unit costs differ between the drawer and the grid.    - The drawer (reconciliation data `RC`) uses 1500 for Linen M and L, 1300 for Chino 32 and 34, 800 for Polo M, and 1600 for Overshirt. These are the "unitCost" values.    - The grid has Linen M `P RATE` '1,749.50', the TR constant (Chino) at 1,499.50, and the PO constant (Polo) `P RATE` '935.48'.    - The drawer total is `Σ pr × unitCost` = 72,000 + 85,500 + 530,400 + 338,000 + 115,200 + 286,400 = ₹14,27,500. That is 1,096 pieces, so the E-2 figures are internally consistent. The unit costs are not tied to the grid's `P RATE`.    - The drawer header is "PT-0098 · v2 · 7 lines" and the grid header is "PT-0098 · v2". The grid also shows "9,800 rows not reviewed" plus reviewed rows, so the line counts do not match. 2. Grid row 203 is Chino 32 with QTY 408 and `P RATE: ''` (blank). `SUPPLIER COST` is '1,499.50' and the error is on `[missing]`.    - The drawer counts the same 408 pieces at ₹1,300.    - `costApprovalBlocked` only checks `Number.isFinite(unitCost)`, and 1300 is finite.    - Approve is therefore enabled whenever `reconBlocked` is false. The blank P RATE on row 203 does not block Approve, which contradicts PRD-ACS-016. 3. The basis is not beside the limit.    - The scale reads `<span>₹0</span><span>Your limit up to {{ drawerLimit }}</span><span>Next: …</span>`.    - The basis ("Proposed acquisition cost · synthetic example" and, in `mkAp`, `valueLabel: 'Value at cost'`) sits above the value, not beside the limit.    - design-language.md 10.14 prescribes the scale "₹0 · Your limit up to ₹X · Next: <next approver>" with the label only on the value. 4. The exception drawer EXC-2291 shows "Assigned to Ravi K. · P-STM Store manager", "Acknowledge by 23 Sep 2026, 14:00" and "Resolve by 24 Sep 2026, 18:00". It has no synthetic label.    - The PT card in the same page does carry a "synthetic example" label, so the exception drawer is the inconsistent one.    - POL-02.11 (kdps-policies.md line 92) leaves "exception owners, due times, recipients and escalation" unconfigured.    - This sub-point is weaker, because PRD-EXC-001 requires an owner and a due date, but the missing sample label is real.  Minor weaknesses that do not undo the finding: - The row 203 quote is reconstructed from the template, because the `...TR` spread and the `prof` conditionals are collapsed. - The "10,000 rows" figure is inferred from "9,800 rows not reviewed" plus reviewed rows. No literal "10,000" exists in the file. - The row-203 effect on Approve is an inference from the code, since `costApprovalBlocked` ignores the grid.  Proposed fix and files: the proposed fix is directionally right. The files_to_edit are valid, because design-language.md exists at docs/design/ui/design-language.md, not docs/design/design-language.md. Use that full path. / REFUTED: The core claim fails. The PRD text is quoted accurately: PRD-ACS-015 and 016, DEC-015 and the DEC-016 correction (proposed P RATE times covered quantity), and POL-02.11 (exception owners and due times unconfigured). But the page does not break those rules, and the finding's "same PT-0098" premise is unsupported.  1. **The drawer is not PT-0098.** In design-system.html the 4A drawer is titled "Approve PT", prepared by Suresh M. PT-0098 appears only in the toast, the "PT-0098 · v2" grid header and the "Review PT-0098" button. The drawer's seven-line table is a separate constant, `RC`, with its own unit costs (1,500, 1,300, 800, 1,600). It is not wired to the 3.10 grid. Different unit costs, 7 lines against the grid's rows, and the blank P RATE on grid row 203 therefore do not contradict anything in the page.  2. **The example is labelled synthetic.** The card reads "Proposed acquisition cost · synthetic example", which meets the AGENTS.md rule that synthetic data must be labelled. E-2 says only that the total is "calculated from its displayed quantities and unit costs", which is true: the breakdown line prints each `qty × ₹cost` and the sum. E-2 never says the drawer ties to the grid, so "E-2 is marked Fixed but does not tie unit costs to the grid" is not a defect.  3. **The missing-cost rule is already built in.** The code sets `costApprovalBlocked` when any proposed line has a non-finite unit cost. It then shows "Unavailable", hides the marker, and prints "Resolve missing or disputed cost... do not treat it as zero". A second line says missing or disputed cost blocks value-based approval until resolved. This matches PRD-ACS-016. The unidentified-barcode row has proposed quantity 0 and unit cost null, so it is correctly excluded, not treated as zero cost.  4. **The exception drawer is general sample data.** EXC-2291 names Ravi K. as owner with two times. The whole page uses invented names and times (Ravi K., Meera N., Suresh M.). PRD-EXC-001 requires an owner and a due date. POL-02.11 says the real owner and due-time map is unconfigured, which stops live actions from being enabled. It does not forbid sample values in a layout specimen. Labelling is a cosmetic nicety at most, not a clash, and the finding itself says no product-owner decision is needed.  5. **Only one nit survives.** PRD-ACS-015 ends "Show the basis beside the limit." Section 10.14 and 4A put the basis label ("Value at cost" or "Proposed acquisition cost") above the value, while the scale reads "Your limit up to ₹X". Tightening that wording is a small optional edit to design-language.md and the HTML. It does not justify the finding as written, and no DEC settles or blocks it. The rest of the proposed fix would re-derive the drawer from the grid and rewrite E-2 over a non-existent clash.

### N-77 · gap · DEC-029's open item (KDPS representative's name) is not tracked as an open value or in the questions

- `docs/decisions.md` (DEC-029 Choice): "The representative's name is OPEN until the product owner adds it."
- `AGENTS.md` (Never invent a value): "Mark every unknown as **OPEN** and name its owner ... Say which delivery stage it blocks."

- **What disagrees.** DEC-029 names an owner but no blocking stage, and the alignment report (V-01 to V-57), gaps-before-code and questions list carry no entry for it.
- **Higher rule.** AGENTS.md 'Never invent a value'
- **Fix.** Add a V entry (owner: product owner; blocks: before any KDPS policy is signed) or state the stage in DEC-029.
- **Files to edit.** `docs/reports/alignment-report.md`, `docs/decisions.md`
- **Owner.** product owner. **Blocks.** before any KDPS policy is signed. **Needs a product-owner decision.** no.
- **Status.** Parked (a sceptic refuted it, citing a decision or reading that already settles it).
- **Sceptics.** HOLDS: Both quotes are verbatim and in context. docs/decisions.md DEC-029 Choice says "The representative's name is OPEN until the product owner adds it." AGENTS.md "Never invent a value" says "Mark every unknown as **OPEN** and name its owner ... Say which delivery stage it blocks." DEC-029 names the owner (the product owner) but gives no blocking stage. A grep for "representative" and "DEC-029" finds nothing tracking the name. The V table (V-01 to V-57, section 5) has no entry for it, and its only DEC-029 mention (alignment-report.md line 284) is a cross-reference. gaps-before-code.md section 4 lists only GC-10 and GC-11. The questions list also has no entry. The finding is real but minor. The name is a record-keeping attribute, not a policy value, so it may block no delivery stage. The proposed stage "before any KDPS policy is signed" is a guess the finding itself supplies. / REFUTED: The finding stretches the AGENTS.md rule and the fix invents a value. (1) AGENTS.md "Never invent a value" covers policy values, thresholds, tolerances, accounts, rates, limits, formulas, dates and approvers, and says to mark unknowns OPEN with an owner and the stage they block. The representative's name is none of these. It is provenance metadata in the decision log (a witness name for DEC-017 to DEC-022), and nothing in the system reads it. (2) DEC-029 already marks the name OPEN and names the owner, "until the product owner adds it". It blocks no delivery stage. DEC-029 also says "Each policy stays Open until it is signed in its 'Signed by, date' line", so signing is gated by the signature line, not by this name. (3) The V-01 to V-57 register tracks values that KDPS or the CA must supply, each tied to a POL or PRD clause or phases.md and a stage. The report's own note makes the same split: it distinguishes "settled product rules and policy homes" from "values that KDPS or the CA still needs to supply". A decision-log provenance name has no clause to anchor to, so it does not belong there. (4) The proposed blocking stage, "before any KDPS policy is signed", is not stated in any document. Writing it into DEC-029 or a V entry would invent a gate, which AGENTS.md forbids. No higher-ranked document (PRD or policies) requires the entry. At most this is a cosmetic note for the product owner to add the name. It is not a docs-alignment gap that needs a V entry or a stage.

### N-93 · term · Scope dimensions and words in personas.md (Store, business unit, Employers, Books, Records; Role assignment, User, Back office, Portal) are not PRD terms

- `docs/design/access/personas.md` (section 1 table; section 2 'Usual scope'): "A user, a role, a scope (legal entity, Site, Store, business unit, brand) and effective dates ... Employers in scope / Books in scope / Records in scope / Own EBO"
- `docs/prd.md` (PRD-ACS-001; PRD-INT-001; Words used Role, Till): "explicit action, entity, Site, brand and field permissions. / entity/Site/brand ... Role | A named set of permissions, granted to a person through scoped role assignments"
- `docs/README.md` (Words): "A new term is added to "Words used" first, before any other document or code uses it."

- **What disagrees.** PRD names entity, Site and brand; personas.md lists five dimensions and its own words; the PRD uses 'role assignment' without defining it, 'person' rather than 'user', and defines Till as a session, not a screen surface.
- **Higher rule.** PRD-ACS-001; PRD-INT-001; PRD Words used; docs/README.md Words
- **Fix.** Align the list to the PRD or ask the product owner to extend PRD-ACS-001/PRD-INT-001 and POL-02.02 with business unit and Store; replace 'Employers/Books/Records' with legal employer and accounting book; propose Role assignment (and User, Role template) for Words used via a DEC; name screen surfaces as design terms in design-language.md.
- **Files to edit.** `docs/design/access/personas.md`, `docs/prd.md`
- **Owner.** product owner. **Blocks.** 1. **Needs a product-owner decision.** yes.
- **Status.** Parked (a sceptic refuted it, citing a decision or reading that already settles it).
- **Sceptics.** REFUTED: The quotes are accurate, but the finding's central claim is wrong. It says Store, business unit, Employers, Books and Records are not PRD terms, and that the PRD does not define the words personas.md uses. The PRD does define most of them.  - Store and business unit are PRD Words used. docs/prd.md line 99 defines "Business unit" and line 172 defines "Store" ("A trading business at a Site"). PRD-ORG-001 (line 242) lists "Organisation, legal entity, tax registration, accounting book, Site, Store, business unit and internal stock location". PRD-ORG-005 (line 246) maps each business unit to its legal entity, tax registration and accounting book. So the Store and business unit scope dimensions are PRD vocabulary. - "Role assignment" is already used as a settled PRD phrase. The Words used entry for Role (line 163) says "granted to a person through scoped role assignments", and the RBAC entry (line 199) says "permissions assigned through scoped role assignments". PRD-ACS-002 (line 282) says "only role assignments grant access", and PRD-ACS-004 (line 284) says "Apply scope within each role assignment". personas.md defines it consistently with these. The PRD has no standalone entry for it, but it is not an invented term. - "Employers" matches the PRD. PRD-HRM-001, -008 and -018 use "legal employer" and "employer", and PRD-HRM-008 and -018 also say "by employer". - "Books" matches the PRD. "Accounting book" appears in PRD-LED-001 and the Cost pool, Tally and Business unit entries. - "Records in scope" is close to the PRD wording for the Auditor persona (line 279), "Scoped read-only records". - "Back office" and "Portal" are not PRD terms. They are design surface names, and docs/design/ui/design-language.md already uses and defines them (line 124, "A · Back office", "C · Portal"). They sit at the design rank, so the README rule that a term goes into Words used first does not apply to them. - "User" is used in the PRD (line 139 "The user's assigned tasks"; line 196 "sent to the user"; line 267 "Users, permissions, masters"). - "Till" is a PRD word for a billing session (line 178). personas.md uses it in the P-STM and P-CSH rows, "Back office, till, phone", which is consistent.  One narrow gap remains. PRD-ACS-001 and PRD-INT-001 list only "entity, Site, brand" permissions, while personas.md scopes also by Store and business unit. That is a small wording question, not a "not PRD terms" violation. It is also partly covered by PRD-ORG-001/005 and PRD-ACS-004, and by the persona rows that use "Own Store". "Own EBO" is a loose scope label rather than a defined scope dimension. The finding's proposed edits to docs/prd.md and its "term" severity, framed as undefined terms, are unsupported. / HOLDS: The finding holds in a narrower form, and it overstates the PRD gap. (1) Store and business unit are defined PRD terms. "Words used" defines Store and Business unit, and PRD-ORG-001/004/005 treat both as records. What the PRD does not say is that they are scope dimensions. PRD-ACS-001 and PRD-INT-001 list only entity, Site and brand, and POL-02.02 says "business, Site and brand scope". So personas.md section 1 ("legal entity, Site, Store, business unit, brand") extends the access scope past what the higher documents state, and the PRD never says Store-level scope ("Own Store", "Own EBO") is permitted. That is a real design-versus-PRD mismatch, but it is a scope question and not a missing-term question. (2) "Role assignment" is not in "Words used". It does appear in PRD-ACS-002, ACS-004, INT-001 and the Role and RBAC rows, so it is PRD vocabulary without its own definition. "User" is not defined either, and the PRD says "person". "Role template" is not defined. (3) "Employers in scope", "Books in scope" and "Records in scope" are loose paraphrases. The PRD uses "legal employer", "employer" (HRM) and "accounting book", so replacing them is a sound lower-document fix. (4) "Back office" and "Portal" appear in neither the PRD nor the policies. They are used 7 times in design-language.md, so they are design-layer surface names. They are not requirement terms, and no DEC settles them. (5) docs/decisions.md has no DEC on personas, scope dimensions or these words, so nothing is already settled. AGENTS.md rules apply: add a term to "Words used" first, never edit the PRD without a DEC, and never invent a value. The proposed fix lists docs/prd.md in files_to_edit, which is wrong unless a DEC is approved first.

## 4. Refuted

- **N-02** POL-18.01 turns the PRD's proposed backup goals into policy targets. All five quotes exist verbatim at the cited locators. docs/prd.md line 210 has the intro, line 222 has "15 minutes; 4 hours (proposed)", and docs/kdps-policies.md line 468 has POL-18.01. AGENTS.md line 31 has "Never invent a value". The clash claim is still overstated, because the policies document already handles the gap. (1) docs/kdps-policies.md line 18 says all 19 answers are "recorded, but their status remains Open until KDPS signs them; an answer does not mean its live values are configured". The policy table at line 39 lists Policy 18 as Open, decided by Owner and Admin, needed by stage 1. So POL-18.01 is not a signed policy default. (2) POL-18.01 is worded as provisional: "Use provisional targets ... subject to measured restore tests and KDPS business-impact acceptance. These targets are not a proven guarantee." That is not an invented value presented as settled. It repeats the PRD's proposed goals and marks them unaccepted. (3) The open acceptance is already tracked. docs/reports/alignment-report.md line 237 has V-12, "Recovery targets accepted (15 min / 4 h are provisional)", owned by the KDPS Owner and needed by stage 1. docs/questions-for-kdps.md line 21 asks KDPS directly whether the 15-minute and 4-hour targets are acceptable. (4) The "never act as policy defaults" rule is not breached in effect. Under line 18, nothing live is configured from any Open policy answer, so the figures cannot act as a default. The claim that V-12 "does not note this clash" is true but trivial, since V-12 already marks the figures provisional and unaccepted. At most this is a wording nit. "Use provisional targets" could read as adoption. The finding's proposed fix, rewriting POL-18.01 as OPEN, would turn the document's deliberate pattern of recorded answers that stay Open until signed into a special case for this one bullet. The finding overstates the PRD rule and misses that the policy already handles the issue. (1) The PRD intro says proposed targets "never act as policy defaults", but POL-18.01 does not adopt them as a default or settled value. It says "provisional targets ... subject to measured restore tests and KDPS business-impact acceptance. These targets are not a proven guarantee." That is the PRD's "awaiting KDPS agreement" status restated in policy wording. (2) The open acceptance is already tracked. docs/questions-for-kdps.md item 6 asks KDPS "Is that acceptable for your business?" citing POL-18.01 and V-12, and docs/reports/alignment-report.md line 237 lists V-12 "Recovery targets accepted (15 min / 4 h are provisional)" with the KDPS Owner, stage 1. The finding's claim that V-12 "does not note this clash" is true only because there is no clash. The open question is recorded. (3) Nothing contradicts. PRD-SEC-012 requires "defined recovery-time and data-loss objectives", and the PRD measure row uses the same 15 minutes and 4 hours marked proposed. The policy and the PRD give the same numbers with the same pending status. These are not invented values, because they come from the higher-ranked PRD. (4) The proposed fix is wrong for AGENTS.md. Its main option rewrites POL-18.01 in docs/kdps-policies.md, but AGENTS.md line 46 requires a DEC in docs/decisions.md before any edit to policies. The finding offers no DEC, and no DEC about the backup targets exists (grep of decisions.md finds none). The alternative, to log a DEC saying the Owner accepted the targets, would record an acceptance that has not happened. At most this is a wording nit: POL-18.01 could say "proposed in the PRD". It is not a clash and does not block stage 1.
- **N-50** Region 'Asia Southeast' for the Railway test setup chosen in deployment.md with no decision or open item. The quotes are verbatim and in the right places. deployment.md section 8 line 97 says "Railway's regions are US West, US East, Europe West and Asia Southeast. None is in India. Use **Asia Southeast**, the nearest." Owner question 37 says "...with Railway, a hosting company whose servers are outside India." The region is also absent from docs/decisions.md, which has DEC-027, DEC-028 and open items D-1 to D-5 only. What fails is the claim that this is an invented business decision that needs a product-owner decision and blocks stage 2.  1. Region is not an invented value. It is derived from a stated rule: the Railway region nearest to India. The same section 8 ties the choice to measuring counter barcode lookup and bill finalisation latency against the PRD targets. That makes it a technical hosting parameter inside the Railway-for-testing choice the product owner already made in DEC-027 and DEC-028.  2. What KDPS agrees to in question 37 does not depend on the region. The agreement is that real data sits with a host "outside India". Asia Southeast, US and Europe are all outside India, so the consent covers any of them. Naming the region would add detail, not change what is being agreed. Deployment.md section 8 already says KDPS's real data sits outside India and that this is why question 37 exists.  3. Open item D-4 (KDPS's agreement to hold real data on the test setup) is the same agreement point. D-1 covers production hosting, where region and data residency actually matter. The finding does not show that the test-setup region adds a separate decision beyond D-1 and D-4.  4. The AGENTS.md rule at line 25 is "A business decision is never settled in design or code." The finding does not show that picking the nearest region on a test host is a business decision. The "blocks stage 2" claim is also unsupported, because question 37 is already listed as needed before the side-by-side test.  At most this is a low-severity wording point: the design could say the region is a test-only choice that can be revisited, and that production hosting (D-1) must decide residency. The proposed fix of a new DEC or D-6 plus rewording question 37 is disproportionate. The finding does not hold as an invented-value or business-decision problem.  1. The region is a hosting engineering choice made inside a decision the product owner already took. DEC-027 and DEC-028 chose Railway for the whole test setup and said KDPS's side-by-side test runs there with real data. They did not name a region, but a region is a deployment parameter of that choice. AGENTS.md says test hosting detail lives in deployment.md. 2. What KDPS has to agree to is that its real data sits outside India. That is already stated in Owner question 37 ("servers are outside India") and in deployment.md §8 and D-4. All four Railway regions are outside India, so Asia Southeast, US or Europe all fall under the same consent. Naming the region in question 37 would not change what KDPS is agreeing to. 3. The value is not invented. deployment.md §8 gives the reason: it is the nearest region to India, chosen for latency, and the results "inform the production hosting choice". No policy number, rate, threshold or approver is involved. The "Never invent a value" rule in AGENTS.md targets policy values, not infrastructure defaults. 4. No higher document (PRD, policies) says anything about region. PRD-LIF-026 and PRD-SEC-009 do not mention region or jurisdiction beyond what DEC-028 sets. So nothing higher disagrees with the design. 5. The proposed fix is also wrong in form. Logging a DEC "decided by product owner" would put an invented decision on the owner's record. Adding D-6 and rewording question 37 would add an owner burden that does not change the answer.  Optional wording tweak only: deployment.md §8 could say "the default region, changeable without a decision". The finding does not need action beyond that.

## 5. Critic findings (not yet checked by sceptics)

### X-01 · gap · Offline online-only list omits gift-voucher, Customer credit and loyalty redemption

- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-RET-020): "check and consume the authoritative balance online at redemption"
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-OFF-016): "Refunds, store-credit redemption, transfers, supplier/bank payment execution and actions needing fresh approval require online authority."
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-OFF-017): "Enable offline cash/manual-tender recording only under its approved tender policy."
- `/Users/anand/ERP/apparel-os/docs/kdps-policies.md` (POL-16.03): "Refunds and returns/exchanges require online authority; store-credit redemption and actions requiring fresh approval also require online authority."
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-POS-022 and PRD-RET-019): "Allow Customer credit sales only under an approved customer limit and due date"

- **What disagrees.** PRD-RET-020 says a gift-voucher balance must be checked and consumed online at redemption. The online-only lists in PRD-OFF-016 and POL-16.03 name store-credit redemption but not gift-voucher redemption, Customer credit sales (limit and due date) or loyalty redemption. PRD-OFF-017 allows offline 'manual-tender recording' without saying which tenders that covers. A reader can therefore treat gift-voucher redemption as an allowed offline tender, which breaks the online-balance rule. The offline till tile list in design-system.html is limited to Cash, so the design is safe today but nothing in the PRD or policy backs that.
- **Higher rule.** PRD-RET-020 (online balance check) and PRD-OFF-016 (online-only actions). The PRD must list every tender whose balance or limit is authoritative only online.
- **Fix.** Log a DEC entry. Add gift-voucher redemption, Customer credit sales and loyalty redemption to PRD-OFF-016, or state in PRD-OFF-017 that offline tender recording means cash only until a signed procedure says otherwise. Then align POL-16.03 and the offline tender wording in the design docs.
- **Files to edit.** `/Users/anand/ERP/apparel-os/docs/decisions.md`, `/Users/anand/ERP/apparel-os/docs/prd.md`, `/Users/anand/ERP/apparel-os/docs/kdps-policies.md`
- **Owner.** product owner. **Blocks.** 4 (offline counter). **Needs a product-owner decision.** yes.

### X-02 · gap · PRD 'configured' rules with no policy home: cheaper replacement, replacement-SKU limits, large-discount alerts, onward-commission authority, refusal evidence

- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-RET-008): "For a cheaper replacement, apply the configured refund-difference, credit-difference or refusal rule."
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-RET-009): "Allow replacement SKUs other than the original unless the configured policy restricts them."
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-EXC-013): "Notify responsible users of cash gaps, large discounts, missing reports, overdue transit and return deadlines."
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-PAY-013): "Do not disburse unreceived onward commission without the configured Owner authority."
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-RET-015): "Record refused attempts and reasons within the applicable evidence policy."
- `/Users/anand/ERP/apparel-os/docs/reports/alignment-report.md` (section 3 intro): "Nothing is on by default (`PRD-SEC-017`), so each one needs a home in "Required policy configuration"."

- **What disagrees.** These PRD rules depend on a configured rule, threshold or authority, but no policy answers them. A grep of kdps-policies.md finds nothing on large discounts, onward commission, the cheaper-replacement rule or replacement-SKU restrictions. POL-06.06 says only 'collect or refund any price difference', which silently drops the PRD's credit-difference and refusal options. Alignment report section 3 is meant to list every configured rule that lacks a policy home (B-1 to B-14) but omits all of these. No V row or KDPS question covers them either.
- **Higher rule.** PRD-SEC-017 and the 'Required policy configuration' principle that every configured rule has a policy home and an open value with an owner.
- **Fix.** Product owner decides which policy owns each rule: policy 6 for RET-008, RET-009 and RET-015, policy 2 for the large-discount threshold and overdue-transit timing, policy 12 or 2 for PAY-013. Log a DEC entry and add the answer bullets and the 'Required policy configuration' rows. Then add B/V rows to the alignment report and questions for KDPS, each with owner and blocked stage.
- **Files to edit.** `/Users/anand/ERP/apparel-os/docs/decisions.md`, `/Users/anand/ERP/apparel-os/docs/prd.md`, `/Users/anand/ERP/apparel-os/docs/kdps-policies.md`, `/Users/anand/ERP/apparel-os/docs/reports/alignment-report.md`, `/Users/anand/ERP/apparel-os/docs/questions-for-kdps.md`
- **Owner.** product owner (placement); KDPS Owner and Accounts (values). **Blocks.** 4 (RET-008/009/015, EXC-013); 5 (PAY-013). **Needs a product-owner decision.** yes.

### X-03 · clash · phases.md switch day counts stock before billing on the current POS stops

- `/Users/anand/ERP/apparel-os/docs/phases.md` (Testing and switch-over table, 'Switch day' row): "physically count stock, label every piece of a piece-tracked profile that has no piece ID and verify every piece ID, stop billing on the current POS"
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-STK-008): "For a full Store count, stop selling, reconcile tills, establish and freeze the count scope, count/scan, review differences and authorise adjustments before resuming selling."
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-LIF-027): "Reconcile the count with the earlier POS's last SOH and report every difference."
- `/Users/anand/ERP/apparel-os/docs/design/stock/stock-ledger.md` (section 9 step 1): "Run a full Store count (8.1)."

- **What disagrees.** The phases switch-day sequence puts the physical count and labelling before 'stop billing on the current POS'. PRD-STK-008, which the stock ledger applies at the switch, starts a full count by stopping selling. A count taken while the old POS is still selling cannot be reconciled against its 'last SOH' (PRD-LIF-027), because that figure does not exist until billing stops. The known blueprint finding covers the Stock Count tab order, not this phases sequence.
- **Higher rule.** PRD-STK-008 (stop selling first) and PRD-LIF-027 (reconcile with the last SOH).
- **Fix.** Reorder the phases switch-day step: stop billing on the current POS, take the last SOH, then count and label, then reconcile. Cite PRD-STK-008 in that row.
- **Files to edit.** `/Users/anand/ERP/apparel-os/docs/phases.md`
- **Owner.** product owner. **Blocks.** 4 (pilot switch). **Needs a product-owner decision.** no.

### X-04 · gap · Stage 2 exit check and blueprint include opening goods, but real opening stock loads only at the stage 4 switch

- `/Users/anand/ERP/apparel-os/docs/phases.md` (Stage 2 exit checks): "Supplier, direct-store and opening goods meet the same selling-Site acceptance and hold checks."
- `/Users/anand/ERP/apparel-os/docs/kdps-policies.md` (POL-14.07): "Load real opening stock and balances only at each Store's approved day-close switch in stage 4."
- `/Users/anand/ERP/apparel-os/docs/design/ui/ui-blueprint.html` (module 04 Receive Goods (stage 'Stage 2'), pages array): "L('Opening stock', 'Manifest · Physical check · Opening PT', 'Policy 14')"
- `/Users/anand/ERP/apparel-os/docs/design/stock/stock-ledger.md` (section 2.3, Opening count row): "When its Site goes live (SL-9)"

- **What disagrees.** The stage 2 scope list has no opening-stock item, yet its exit check requires opening goods to pass acceptance and hold checks. The blueprint puts an Opening stock page in the stage 2 Receive Goods section. POL-14.07 allows real opening stock only at a Store's switch in stage 4, and stage 1 only prepares layouts. The stock ledger says opening count goes live 'when its Site goes live' and leaves this open as SL-9. The same check text does not appear under stage 4, so it is unclear when opening goods are exercised and enabled.
- **Higher rule.** POL-14.07 and DEC-013 (real opening data at stage 4 switches); PRD-ACP-003.
- **Fix.** Either move 'opening goods' in the stage 2 exit check to stage 4, or add synthetic-data opening stock to stage 2 scope and state that live use waits for stage 4. Re-tag the blueprint Opening stock page to match. Product owner resolves SL-9 (warehouse go-live and opening stock) and records it.
- **Files to edit.** `/Users/anand/ERP/apparel-os/docs/phases.md`, `/Users/anand/ERP/apparel-os/docs/design/ui/ui-blueprint.html`
- **Owner.** product owner (SL-9). **Blocks.** 2/4. **Needs a product-owner decision.** yes.

### X-05 · gap · PRD-TAX-004 (tax-document correction) is in no stage, though stage 4 returns need it

- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-TAX-004): "Keep tax-document issue, cancellation/correction and operational reversals distinct."
- `/Users/anand/ERP/apparel-os/docs/phases.md` (Stage 4 in scope): "IRN evidence through a GSP where a tax invoice requires it."
- `/Users/anand/ERP/apparel-os/docs/phases.md` (Stage 5 in scope): "Tax and assets: GST registers, GSTR-2B matching, e-way bills through a GSP, TDS, statutory calendar, fixed assets."
- `/Users/anand/ERP/apparel-os/docs/design/ui/design-language.md` (section 7 rules): "a tax-invoice cancellation is a separate tax-document state (PRD: Tax and assets)"

- **What disagrees.** Stage 4 delivers customer returns, exchanges and refunds against tax invoices, and IRN evidence at issue. Cancellation or correction of those tax documents (PRD-TAX-004) is not listed in stage 4 or stage 5, and phases lists only part of the Tax and assets section. The design language refers to a tax-document state that its own state table (section 7) does not contain. The Statutory applicability policy has no answer for the tax-document treatment of a customer return either.
- **Higher rule.** PRD-TAX-004, PRD-POS-019 and PRD-TAX-003.
- **Fix.** Product owner decides the stage for tax-document correction and cancellation (stage 4 alongside returns, or stage 5 with an explicit interim rule). Add it to phases scope and exit checks. CA to cover credit-note handling under policy 10. Add the tax-document states to design-language section 7.
- **Files to edit.** `/Users/anand/ERP/apparel-os/docs/phases.md`, `/Users/anand/ERP/apparel-os/docs/kdps-policies.md`, `/Users/anand/ERP/apparel-os/docs/design/ui/design-language.md`
- **Owner.** product owner (stage); CA (treatment). **Blocks.** 4. **Needs a product-owner decision.** yes.

### X-06 · gap · Label printing has no hardware path: PRD names ESC/POS receipt printing and a counter-PC helper only

- `/Users/anand/ERP/apparel-os/docs/prd.md` (Technical platform > Stack, Hardware row): "Keyboard-input scanners, ESC/POS printing and cash drawer via local helper; Tauri only for an unmet hardware requirement"
- `/Users/anand/ERP/apparel-os/docs/prd.md` (Words used, ESC/POS): "The command language used by receipt printers"
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-REC-020): "Print merchandise/MRP labels from official frozen PT values and retain print/reprint jobs."
- `/Users/anand/ERP/apparel-os/docs/design/platform/deployment.md` (section 6): "It runs on the counter PC."
- `/Users/anand/ERP/apparel-os/docs/design/ui/design-language.md` (section 12): "Piece-label layout; label and receipt printer models"

- **What disagrees.** Piece-ID, price-ticket and sale-sticker labels (PRD-MER-015, REC-020, OFR-004) are printed in stage 2 at warehouses and receiving Stores. The only hardware route the PRD, AGENTS.md and deployment.md define is an ESC/POS local helper on the counter PC, which the PRD defines as a receipt-printer language. No document says how labels print from a warehouse or office PC, which label-printer command language applies, or whether the Tauri exception is already triggered. KDPS's printer models are left to a stage 2 open item.
- **Higher rule.** PRD Technical platform: Hardware row ('Tauri only for an unmet hardware requirement').
- **Fix.** Product owner confirms how labels print outside the counter (helper on warehouse and office PCs, or another route). Amend the PRD Hardware row and Words used if label printers use other languages. Then extend deployment.md section 6 and add the printer models to the questions for KDPS.
- **Files to edit.** `/Users/anand/ERP/apparel-os/docs/decisions.md`, `/Users/anand/ERP/apparel-os/docs/prd.md`, `/Users/anand/ERP/apparel-os/AGENTS.md`, `/Users/anand/ERP/apparel-os/docs/design/platform/deployment.md`
- **Owner.** product owner; KDPS Operations (printer models). **Blocks.** 2. **Needs a product-owner decision.** yes.

### X-07 · clash · POL-09.06 calls moving weighted average the preferred baseline while POL-09.21 retains the current method; 'weighted-average' is wider than the PRD

- `/Users/anand/ERP/apparel-os/docs/kdps-policies.md` (POL-09.06): "Conditional preferred inventory-costing baseline: support FIFO and weighted-average methods; moving weighted average is preferred for KDPS interchangeable stock"
- `/Users/anand/ERP/apparel-os/docs/kdps-policies.md` (POL-09.21): "Initially retain KDPS's current CA-approved inventory-cost method and pool."
- `/Users/anand/ERP/apparel-os/docs/kdps-policies.md` (POL-09.21): "do not switch methods based on a preferred future option"
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-LED-014): "Support FIFO and moving weighted-average cost formulas."
- `/Users/anand/ERP/apparel-os/docs/decisions.md` (DEC-031 Choice): "Periodic average stays out until a PRD change."

- **What disagrees.** Policy 9 gives two different baselines. POL-09.06 names a preferred baseline (moving weighted average). POL-09.21, added by DEC-018, makes the baseline whatever method KDPS uses today and bars switching to a preferred option. DEC-018 did not amend POL-09.06, and DEC-031 still cites POL-09.06 as 'KDPS's stated preference'. POL-09.06 also says 'weighted-average methods' generally, while PRD-LED-014 and DEC-031 support only the moving form. A periodic-average answer would be outside the PRD options.
- **Higher rule.** PRD-LED-014 and DEC-031 (moving weighted average only). POL-09.21 (retain the current method) is the later policy decision.
- **Fix.** Log a DEC entry and reword POL-09.06 to say 'moving weighted average', and to describe it as a candidate for any future change, not the baseline. Make POL-09.21 the single baseline rule. Update alignment report 4.2 and the DEC-031 wording in the same pass.
- **Files to edit.** `/Users/anand/ERP/apparel-os/docs/decisions.md`, `/Users/anand/ERP/apparel-os/docs/kdps-policies.md`
- **Owner.** product owner; CA. **Blocks.** 1 (V-08) and 2 (V-09). **Needs a product-owner decision.** yes.

### X-08 · gap · No stage plans Hindi for the stage 6 screens (staff self-service, payslips, planning)

- `/Users/anand/ERP/apparel-os/docs/phases.md` (Stage 5 in scope): "Hindi interface for the screens already built."
- `/Users/anand/ERP/apparel-os/docs/phases.md` (How the stages are cut): "The Hindi interface and WhatsApp and SMS messaging arrive in stage 5."
- `/Users/anand/ERP/apparel-os/docs/prd.md` (PRD-PRO-009): "Support English and Hindi interfaces, counter and office PCs, and a phone client."
- `/Users/anand/ERP/apparel-os/docs/phases.md` (Stage 6 in scope): "HRMS and payroll: employee records, attendance, rosters, leave, targets, incentives, payroll, advances."

- **What disagrees.** The PRD requires an English and Hindi interface. Phases places Hindi in stage 5 and limits it to screens already built. Stage 6 delivers the staff-facing screens (check-in, targets, incentives, payslips, Self-service) after that point, and no stage or note says when they get Hindi. The same gap applies to the stage 4 Store day screens used by the pilot Store, which run English-only until stage 5.
- **Higher rule.** PRD-PRO-009.
- **Fix.** Product owner decides whether Hindi follows each stage's screens (so stage 6 gets its own Hindi step) or all screens in a later step. Record it in phases.md; the UI README, AGENTS.md and design-language section 12 follow.
- **Files to edit.** `/Users/anand/ERP/apparel-os/docs/phases.md`, `/Users/anand/ERP/apparel-os/AGENTS.md`, `/Users/anand/ERP/apparel-os/docs/design/ui/README.md`
- **Owner.** product owner. **Blocks.** 6. **Needs a product-owner decision.** yes.

### X-09 · stale-ref · ui-blueprint.html and personas.md still carry '2 Oct 2026' status although they hold 3 Oct content

- `/Users/anand/ERP/apparel-os/docs/design/ui/ui-blueprint.html` (header line): "Apparel OS · UI blueprint · Revision 5 · 2 Oct 2026"
- `/Users/anand/ERP/apparel-os/docs/design/ui/ui-blueprint.html` (rules array, 'Old POS during the test'): "At the switch, the verified count becomes opening stock and is reconciled with the last SOH (PRD-LIF-027)."
- `/Users/anand/ERP/apparel-os/docs/decisions.md` (DEC-030 Changed): "New `PRD-LIF-027` (the switch count is the opening stock, reconciled with the last SOH)."
- `/Users/anand/ERP/apparel-os/docs/design/access/personas.md` (status line): "2 Oct 2026"

- **What disagrees.** The blueprint cites PRD-LIF-027, which DEC-030 created on 3 Oct, but its header says Revision 5 of 2 Oct. personas.md says 'Current, 2 Oct 2026' although it was not refreshed for DEC-017 (eleven templates) or DEC-030. The confirmed findings name only the design-language and design-system dates, so the blueprint and personas dates are a further stale status.
- **Higher rule.** Design header convention (status line must reflect the decisions applied) and docs/README.md design-document rules.
- **Fix.** When the design docs are next edited, update the blueprint revision and date and the personas status line, and state which DEC entries each was aligned to.
- **Files to edit.** `/Users/anand/ERP/apparel-os/docs/design/ui/ui-blueprint.html`, `/Users/anand/ERP/apparel-os/docs/design/access/personas.md`
- **Owner.** design owner. **Blocks.** not stage-bound. **Needs a product-owner decision.** no.

### X-10 · gap · DEC-029 leaves the KDPS representative's name OPEN but no list tracks it

- `/Users/anand/ERP/apparel-os/docs/decisions.md` (DEC-029 Choice): "The representative's name is OPEN until the product owner adds it."
- `/Users/anand/ERP/apparel-os/docs/reports/alignment-report.md` (section 5 intro): "Every active value below is unset."
- `/Users/anand/ERP/apparel-os/AGENTS.md` (Never invent a value): "Mark every unknown as **OPEN** and name its owner"

- **What disagrees.** DEC-029 records an OPEN item (who from KDPS agreed DEC-017 to DEC-022) and names the product owner, but it does not say which delivery stage it blocks, which AGENTS.md requires for every OPEN value. The alignment report open-values table (V-01 to V-57) and questions-for-kdps.md have no row for it. DEC-017 to DEC-022 set KDPS policy choices (templates, WhatsApp summary, cash-first offline pilot), so the missing name weakens the audit trail of those choices.
- **Higher rule.** AGENTS.md 'Never invent a value': every OPEN names its owner and the stage it blocks.
- **Fix.** Product owner adds the representative's name to DEC-029, or adds a V row naming the product owner and the stage it blocks (the stage when KDPS signs policy 2). Then reference that row from the decision.
- **Files to edit.** `/Users/anand/ERP/apparel-os/docs/decisions.md`, `/Users/anand/ERP/apparel-os/docs/reports/alignment-report.md`
- **Owner.** product owner. **Blocks.** 1 (policy 2 signature). **Needs a product-owner decision.** yes.
