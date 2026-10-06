# Requirement coverage

> **Not ranked.** Part of the plan ([roadmap](roadmap.md)). It traces requirements to features; it adds no requirement. The PRD and the policies are the source.

## 1. How to read it

- **Owner** is the one feature accountable for a PRD bullet: it builds the bullet's mechanism or main workflow and holds the acceptance test for it. Every bullet has exactly one owner.
- **Complete at** is the feature after which every part of the bullet exists and is proved. "Same" means the owner completes it. A later feature completes a bullet when the bullet names a part that only that feature builds: a scope dimension, a tender, an adapter, a document, a screen area.
- A bullet that states a rule every later feature must apply (audit records, independent approval, field restriction, idempotency, as-of time) is complete at its owner once the mechanism and its test exist. Each later feature's own acceptance shows that it applies the rule; that is not tracked again here.
- **Also builds or relies on** names features that build part of the bullet earlier, or use it later. A rule exercised on synthetic data in stage 1, such as a cost rule in the golden scenarios, is owned by the stage 1 feature that builds its mechanism and completed where its live workflow is accepted.
- **Acceptance evidence** names the design's synthetic tests, the stage exit check or the feature's acceptance tests.
- A stage exits only when every bullet whose **Complete at** falls in that stage passes its whole acceptance, and every bullet it owns passes the part it builds ([stage 1](stage-1/README.md) section 7, [roadmap](roadmap.md) for later stages).
- Checked on 5 Oct 2026: all 520 PRD bullets have one owner, none twice, and no placed ID is missing from the PRD. Re-check by hand when the PRD changes.

## 2. Summary

| Stage | Bullets owned | Bullets completed |
| --- | --- | --- |
| Stage 0 (module boundaries, pinned dependencies, required checks) | 3 | 1 |
| Stage 1 | 139 | 106 |
| Stage 2 | 86 | 79 |
| Stage 3 | 64 | 64 |
| Stage 4 | 112 | 126 |
| Stage 5 | 80 | 93 |
| Stage 6 | 32 | 38 |
| Every stage (cross-cutting; complete only when the last stage applies it) | 3 | 12 |
| Not built: outside product scope | 1 | 1 |
| **Total** | **520** | **520** |

67 bullets are completed by a later feature than their owner. `PRD-ACP-018` is owned jointly by `S1-F10` (posting) and `S1-F11` (calculations), counted once under stage 1, and completed with the incentive cases in `S6-F02`.

## 3. PRD bullets

| IDs | Requirement area | Owner | Complete at | Also builds or relies on | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| `PRD-PRO-001` | Stock by product, size, location, condition, owner | S2-F11 | Same | S1-F10 | Stage 2 reports |
| `PRD-PRO-002` | Supplier files into reviewed PT records | S2-F04 | Same | S1-F06, S2-F13, S2-F05 | Stage 2 exit |
| `PRD-PRO-003` | Supplier commitments, return rights, claims, settlement | S3-F09 | S5-F04 | S2-F01, S3-F07, S5-F04 | Stage 3 exit |
| `PRD-PRO-004` | Reconcile sales, cash, collections, bank | S5-F03 | Same | S4-F08 | Stage 5 exit |
| `PRD-PRO-005` | Double-entry ledger and Tally vouchers | S5-F02 | Same | S1-F09 | Stage 5 exit |
| `PRD-PRO-006` | Attendance, attribution, targets, incentives, payroll | S6-F02 | S6-F03 | S6-F01, S6-F03 | Stage 6 exit |
| `PRD-PRO-007` | History through openings, closures, relocation | S5-F09 | Same | S4-F12 | Stage 5 exit |
| `PRD-PRO-008` | Reports, profit analysis, human-approved planning | S6-F04 | Same | every feature | Each stage report list |
| `PRD-PRO-009` | English and Hindi; counter and office PCs; phone client | S5-F10 | S6-F06 | S6-F06; DEFERRED (native phone client, DEC-105) | Stage 5 and 6 Hindi checks |
| `PRD-PRO-010` | Scope exclusions | Not built: outside product scope | Same | — | Nothing to build |
| `PRD-STG-001` | Basic operational reports in every stage | Every feature | Same | S1-F01, S1-F02, S1-F03, S1-F06 | Each stage report list |
| `PRD-STG-002` | Stock and money effects recorded from the start | S1-F10 | Every stage | every feature | Stage 1 golden scenarios |
| `PRD-ORG-001` to `PRD-ORG-010`, `PRD-ORG-012`, `PRD-ORG-020`, `PRD-ORG-021` | Structure, mappings, geography, locations, routes | S1-F02 | Same | S3-F01 (routes) | structure-and-masters 9 tests 1–6, 14–17 |
| `PRD-ORG-011` | Organisation-level configuration | S1-F04 | Every stage | S1-F03 | S1-F04 acceptance |
| `PRD-ORG-013` | Default warehouse and other authorised routes | S1-F02 | S3-F01 | S3-F01 (routes used) | structure-and-masters 9; stage 3 transfers |
| `PRD-ORG-014` to `PRD-ORG-016` | Ownership from agreements; effective terms | S1-F03 | Same | S2-F01, S2-F06 | structure-and-masters 9 test 13 |
| `PRD-ORG-017`, `PRD-ORG-018` | Inbound ownership before receipt | S2-F03 | Same | — | Stage 2 exit (PRD-ACP-020) |
| `PRD-ORG-019` | Inbound ownership closed against the receipt count; differences settled | S2-F03 | S2-F10 | S2-F10 | Stage 2 exit (PRD-ACP-020) |
| `PRD-ACS-001` | Several roles with explicit action, entity, Site, brand and field permissions | S1-F01 | S1-F03 | S1-F02 (entity, Site), S1-F03 (brand, field) | access-and-approvals 15 tests 6 to 9 |
| `PRD-ACS-002`, `PRD-ACS-003`, `PRD-ACS-006`, `PRD-ACS-007`, `PRD-ACS-013`, `PRD-ACS-014`, `PRD-ACS-017`, `PRD-ACS-020`, `PRD-ACS-022`, `PRD-ACS-023` | Personas grant nothing; independent approval; version binding; audit; append-only history; sessions; one Organisation per user; self-service rule; setup step | S1-F01 | Same | S1-F05 (delegation, escalation) | S1-F01-AT01 to S1-F01-AT18 |
| `PRD-ACS-004` | Scope applied inside each assignment; no mixing across assignments | S1-F01 | S1-F10 | S1-F02, S1-F03 | access-and-approvals 15 test 7 |
| `PRD-ACS-005` | Effective-dated assignments; all, selected or empty scope | S1-F01 | S1-F02 | S1-F02 (selected members) | access-and-approvals 15 tests 5a, 8, 9 |
| `PRD-ACS-008` | Restricted field classes | S1-F03 | Same | every feature with restricted fields | access-and-approvals 15 test 7; structure-and-masters 9 test 12 |
| `PRD-ACS-009` | One inbox of tasks, exceptions and approvals | S1-F01 | S1-F08 | S1-F05 (due times), S1-F08 (exceptions) | access-and-approvals 15 test 20 |
| `PRD-ACS-010` | Approve or reject with reasons, evidence, comments; delegation; escalation | S1-F01 | S1-F08 | S1-F05 (stand-ins, escalation), S1-F08 (evidence files) | access-and-approvals 15 tests 18, 19b, 20a |
| `PRD-ACS-011`, `PRD-ACS-015`, `PRD-ACS-016`, `PRD-ACS-018`, `PRD-ACS-019` | Bulk approval, limits and value basis, Unknown value, stand-ins | S1-F05 | Same | S1-F10 | access-and-approvals 15 tests 13, 13a, 17, 18, 18a |
| `PRD-ACS-012` | Phone approval links | S5-F11 | Same | — | access-and-approvals 9.10 |
| `PRD-ACS-021` | Place scope by Site, Store or business unit | S1-F02 | Same | S1-F01 | access-and-approvals 15 tests 8, 9 |
| `PRD-MER-001`, `PRD-MER-002`, `PRD-MER-004` to `PRD-MER-007`, `PRD-MER-013`, `PRD-MER-014` | Parties, SKUs, attributes, Unknown kept, external codes, proposals, tracking profiles | S1-F03 | Same | S2-F04, S2-F07 | structure-and-masters 9 tests 7–12, 18, 20 |
| `PRD-MER-003` | Unique piece ID kept through custody, coverage, sale, return and count | S2-F07 | S4-F05 | S3-F05, S4-F02 | Stage 2 exit; stage 4 returns |
| `PRD-MER-008`, `PRD-MER-015` | Piece IDs, internal labels, piece scans | S2-F07 | Same | S3-F05, S4-F02 | Stage 2 exit |
| `PRD-MER-009` | Cost, MRP, price, tax, discount kept apart with snapshots | S2-F04 | S4-F02 | S4-F02 | Stage 4 exit |
| `PRD-MER-010` | Units, packs, conversions; batch and expiry where the profile requires | S1-F03 | S2-F02 | S2-F02 | structure-and-masters 9 test 9; stage 2 receiving |
| `PRD-MER-011` | Unit, batch and expiry carried through receiving, movement, sale, return, count | S2-F02 | S4-F05 | S3-F02, S4-F02 | Stage 4 exit |
| `PRD-MER-012` | Expiry eligibility and holds; no silent unit combining | S2-F02 | S4-F02 | S4-F02 | Stage 4 exit |
| `PRD-MER-016` | Bill, count, transfer and return piece-tracked goods by piece-ID scan | S2-F07 | S4-F05 | S3-F02, S3-F05, S4-F02 | Stage 4 exit |
| `PRD-MER-017` | Piece rules start at the switch | S4-F12 | Same | — | Stage 4 switch checks |
| `PRD-MER-018` | Tracking profile changed to piece-tracked only through a labelling count | S1-F03 | S2-F07 | S2-F07 (the labelling count) | structure-and-masters 9 test 10 |
| `PRD-IMP-001` | Formats: spreadsheets, CSV, PDF, photographs | S2-F13 | S2-F05 | S1-F06 (XLSX), S2-F05 (photographs) | imports-and-opening-data 17 test 1 |
| `PRD-IMP-002` to `PRD-IMP-005`, `PRD-IMP-007` to `PRD-IMP-013` | Intake, mappings, staging, review, duplicates, outcomes | S1-F06 | Same | S2-F13, S1-F13, S2-F12 | imports-and-opening-data 17 tests 2–17 |
| `PRD-IMP-006` | Supplied, calculated, mapped and AI-suggested values kept apart | S1-F06 | S2-F05 | S2-F05 (AI origin) | imports-and-opening-data 17 test 11 |
| `PRD-BKG-001` to `PRD-BKG-006`, `PRD-BKG-009`, `PRD-BKG-010`, `PRD-BKG-013` | Bookings, terms, open-to-buy, tracking, confirmations | S2-F01 | Same | — | Stage 2 exit and reports |
| `PRD-BKG-007`, `PRD-BKG-008` | GRN links to bookings; deliveries without booking | S2-F02 | Same | S2-F01 | Stage 2 exit |
| `PRD-BKG-011` | Supplier fill rate and timeliness | S2-F11 | Same | — | Stage 2 reports |
| `PRD-BKG-012` | Buying suggestions from sales history | S6-F04 | Same | — | Stage 6 exit |
| `PRD-REC-001` | One Receive Goods inbox per Site: supplier deliveries and incoming transfers | S2-F02 | S3-F02 | S3-F02 (incoming dispatches) | Stage 3 transfers |
| `PRD-REC-002` to `PRD-REC-009`, `PRD-REC-011` to `PRD-REC-013` | Receive Goods inbox, count, GRN, discrepancies, held goods | S2-F02 | Same | S1-F10 | Stage 2 exit (PRD-ACP-001) |
| `PRD-REC-010` | Nightly invoice, GRN and PT compare | S2-F10 | Same | — | Stage 2 exit |
| `PRD-REC-014` to `PRD-REC-016` | PT preparation; primary and supplemental PTs | S2-F04 | Same | S2-F06 | Stage 2 exit (PRD-ACP-002) |
| `PRD-REC-017`, `PRD-REC-018` | Independent PT approval; frozen revision | S2-F06 | Same | S1-F10 | Stage 2 exit |
| `PRD-REC-019` | PT corrections and reversals | S2-F09 | Same | — | Stage 2 and 4 exits |
| `PRD-REC-020` to `PRD-REC-022` | Labels from frozen values; verification and acceptance | S2-F07 | Same | — | Stage 2 exit (PRD-ACP-003) |
| `PRD-PTW-001` to `PRD-PTW-013` | PT workbench, KDPS export profile, costing | S2-F04 | Same | S1-F11 (ticket margin) | Stage 2 exit |
| `PRD-STK-001`, `PRD-STK-004`, `PRD-STK-013` | Separate stock facts; origins through moves; oldest origin first | S1-F10 | Same | every stock feature | stock-ledger 11; books-and-posting 16 |
| `PRD-STK-002` | Billed-retained, alteration and display custody | S4-F07 | Same | — | Stage 4 exit |
| `PRD-STK-003` | Sellable rule | S2-F07 | S4-F02 | S4-F02 (sale checks it) | Stage 2 and 4 exits |
| `PRD-STK-005` | Within-Site moves | S3-F04 | Same | — | Stage 3 exit |
| `PRD-STK-006` | Stock search | S2-F11 | Same | — | Stage 2 scope |
| `PRD-STK-007`, `PRD-STK-011` | Dead versus damaged stock; broken size runs | S3-F10 | Same | S6-F04 | Stage 3 reports |
| `PRD-STK-008` to `PRD-STK-010`, `PRD-STK-012`, `PRD-STK-014`, `PRD-STK-015` | Full and cycle counts, differences, surpluses, found pieces | S3-F05 | Same | S1-F10 (G3, G12) | Stage 3 exit |
| `PRD-STK-016` | EBO import that would oversell is held | S4-F10 | Same | — | Stage 4 exit |
| `PRD-STK-017` | Mistaken damage confirmation reversed | S2-F08 | Same | — | Stage 2 exit |
| `PRD-TRF-001` to `PRD-TRF-010` | Transfer request, higher-authority approval, reservation | S3-F01 | Same | S1-F05 | Stage 3 exit (PRD-ACP-006) |
| `PRD-TRF-011` to `PRD-TRF-022` | Dispatch, destination count, acceptance, completion | S3-F02 | Same | — | Stage 3 exit (PRD-ACP-006) |
| `PRD-TRF-023` to `PRD-TRF-025` | Statutory movement documents and compliance | S3-F03 | Same | S5-F06 (e-way creation) | Stage 3 scope |
| `PRD-TRF-026` | Return deadlines and reminders | S3-F07 | Same | — | Stage 3 reports |
| `PRD-DMG-001` to `PRD-DMG-006`, `PRD-DMG-010` | Damage report, hold, independent confirmation | S2-F08 | Same | — | Stage 2 exit (PRD-ACP-005) |
| `PRD-DMG-007` to `PRD-DMG-009`, `PRD-DMG-011` to `PRD-DMG-017` | Quarantine movement, write-off, disposal | S3-F06 | Same | S3-F08 | Stage 3 exit (PRD-ACP-004) |
| `PRD-POS-001` to `PRD-POS-004`, `PRD-POS-006` to `PRD-POS-009`, `PRD-POS-011`, `PRD-POS-013`, `PRD-POS-014`, `PRD-POS-021`, `PRD-POS-023`, `PRD-POS-024` | Counter sale, tenders, cash, held carts, bill search and reprint | S4-F02 | Same | S1-F11 | Stage 4 exit (PRD-ACP-010) |
| `PRD-POS-005` | Tenders with exact split, including Store credit, Gift voucher and Customer credit | S4-F02 | S5-F05 | S4-F06, S5-F05 | Stage 4 and 5 scope |
| `PRD-POS-010` | Manual, provider-confirmed and settled collections kept apart | S4-F02 | S5-F03 | S5-F03 (bank settlement) | Stage 5 exit |
| `PRD-POS-012` | Customer phone and consent | S4-F03 | Same | — | Stage 4 scope |
| `PRD-POS-015` | Bill search including unsynced local bills, without duplicates | S4-F02 | S4-F11 | S4-F11 | Stage 4 exit |
| `PRD-POS-016` | Reprint keeps identity; printer or digital-delivery failure makes no new sale | S4-F02 | S5-F11 | S5-F11 (digital delivery) | Stage 4 exit (PRD-ACP-010) |
| `PRD-POS-017` | Digital bills by WhatsApp or SMS | S5-F11 | Same | — | Stage 5 scope |
| `PRD-POS-018` | Billed-retained goods | S4-F07 | Same | — | Stage 4 scope |
| `PRD-POS-019` | IRN evidence before a tax invoice | S4-F09 | Same | — | Stage 4 scope |
| `PRD-POS-020` | Bill series per billing device | S1-F12 | S4-F11 | S4-F02, S4-F11 | numbering-and-audit 7 tests 2–4 |
| `PRD-POS-022` | Customer credit sales | S5-F05 | Same | — | Stage 5 scope |
| `PRD-RET-001`, `PRD-RET-003` to `PRD-RET-015`, `PRD-RET-017`, `PRD-RET-022`, `PRD-RET-024` | Returns, exchanges, refunds, no-bill returns | S4-F05 | Same | S1-F11 | Stage 4 exit (PRD-ACP-008, PRD-ACP-009) |
| `PRD-RET-016`, `PRD-RET-019` to `PRD-RET-021`, `PRD-RET-023` | Store credit, loyalty, gift vouchers | S4-F06 | Same | — | Stage 4 exit (PRD-ACP-009) |
| `PRD-RET-018` | Customer purchase history | S4-F03 | Same | — | Stage 4 scope |
| `PRD-EBO-001` to `PRD-EBO-008`, `PRD-EBO-010`, `PRD-EBO-011` | EBO report imports applied once | S4-F10 | Same | S1-F06 | Stage 4 exit (PRD-ACP-012) |
| `PRD-EBO-009` | EBO brand-settlement statements | S5-F08 | Same | — | Stage 5 scope |
| `PRD-OFR-001` to `PRD-OFR-006`, `PRD-OFR-021` | Offers, approval, one evaluation, price lists | S4-F04 | Same | S1-F11 | Stage 4 exit |
| `PRD-OFR-007` | Markdown suggestions | S6-F04 | Same | — | Stage 6 scope |
| `PRD-OFR-008` to `PRD-OFR-010` | Return eligibility, deadlines, reminders, proposed lists | S3-F07 | Same | — | Stage 3 reports |
| `PRD-OFR-011` to `PRD-OFR-017` | RTV legs and outcomes | S3-F08 | Same | — | Stage 3 exit (PRD-ACP-007) |
| `PRD-OFR-018`, `PRD-OFR-020` | Supplier-claims register; sale-or-return statements | S3-F09 | Same | S5-F04 | Stage 3 scope |
| `PRD-OFR-019` | Debit requests, credit notes, application and cash outcome linked | S3-F09 | S5-F04 | S5-F04 (cash outcome) | Stage 3 scope; stage 5 exit |
| `PRD-LED-001`, `PRD-LED-004`, `PRD-LED-009`, `PRD-LED-019`, `PRD-LED-020` | Ledger per book, balanced immutable journals, period locks, reopening by a second person | S1-F09 | Same | S1-F10 | books-and-posting 15 |
| `PRD-LED-002` | Books through the business unit; inter-book allocations for shared bank accounts | S1-F09 | S5-F03 | S5-F03 | books-and-posting 15 test 7 |
| `PRD-LED-003` | Configured posting rules for receipts, sales, returns, claims, payments, payroll, adjustments | S1-F09 | S6-F03 | Stages 2 to 6 posting features | books-and-posting 15 |
| `PRD-LED-005` | Operational, provisional and recognised amounts apart | S2-F10 | Same | S1-F10 | Stage 2 scope |
| `PRD-LED-006`, `PRD-LED-014` to `PRD-LED-018` | Cost evidence, formulas, pools, late cost, outflows, reversals | S1-F10 | Same | S2-F06, S2-F09, S3-F08 | stock-ledger 11; books-and-posting 16 |
| `PRD-LED-007`, `PRD-LED-008`, `PRD-LED-010`, `PRD-LED-011` | NRV, reconciliations, month close, official book | S5-F01 | Same | — | Stage 5 exit |
| `PRD-LED-012`, `PRD-LED-013` | Tally XML and acknowledgments | S5-F02 | Same | — | Stage 5 exit |
| `PRD-CSH-001`, `PRD-CSH-002`, `PRD-CSH-004`, `PRD-CSH-005`, `PRD-CSH-011` | Day close, petty cash, pickup and deposit | S4-F08 | Same | — | Stage 4 scope |
| `PRD-CSH-003` | Sales collections, old-dues recovery, cash transfers and non-cash collections apart | S4-F08 | S5-F05 | S5-F05 (old dues) | Stage 4 scope |
| `PRD-CSH-006` to `PRD-CSH-010` | Provider settlement and bank matching | S5-F03 | Same | — | Stage 5 exit (PRD-ACP-016) |
| `PRD-PAY-001`, `PRD-PAY-002` | Supplier invoices from capture to settlement; duplicates and disputes | S5-F04 | Same | S2-F10 (capture and matching) | Stage 5 exit (PRD-ACP-016) |
| `PRD-PAY-003` to `PRD-PAY-010`, `PRD-PAY-014` | Obligations, payment plans and runs, evidence, MSME, expense allocation | S5-F04 | Same | — | Stage 5 exit |
| `PRD-PAY-011` to `PRD-PAY-013` | Receivables, commission, onward commission authority | S5-F05 | Same | S5-F08 | Stage 5 scope |
| `PRD-TAX-001`, `PRD-TAX-002`, `PRD-TAX-006` to `PRD-TAX-008` | GST registers, GSTR-2B, TDS, statutory calendar, filing data | S5-F06 | Same | — | Stage 5 scope |
| `PRD-TAX-003` | E-invoice and e-way through a GSP, with lookup and safe retry | S4-F09 | S5-F06 | S5-F06 (e-way creation) | Stage 4 exit; stage 5 scope |
| `PRD-TAX-004` | Tax documents kept apart from operational reversals | S4-F09 | Same | S5-F06 (e-way creation) | Stage 4 exit |
| `PRD-TAX-005` | Effective-dated classification, rates, applicability | S1-F09 | Same | S1-F11 | shared-calculations 12 |
| `PRD-TAX-009` | Fixed assets and Store NAV snapshots | S5-F07 | Same | — | Stage 5 scope |
| `PRD-NAV-001` to `PRD-NAV-017` | Net asset value and profitability | S5-F07 | Same | — | Stage 5 reports |
| `PRD-FRN-001` to `PRD-FRN-007` | Franchise and partner accounts; partner users | S5-F08 | Same | S1-F01 (partner-user rule fixed in tables) | Stage 5 scope |
| `PRD-HRM-001` to `PRD-HRM-008` | Employees, attendance, rosters, leave | S6-F01 | Same | — | Stage 6 exit (PRD-ACP-017) |
| `PRD-HRM-009` to `PRD-HRM-013` | Targets and incentives | S6-F02 | Same | S1-F11 | Stage 6 exit |
| `PRD-HRM-014` to `PRD-HRM-019` | Payroll | S6-F03 | Same | — | Stage 6 exit (PRD-ACP-017) |
| `PRD-EXC-001` to `PRD-EXC-004` | Exception record, resolution, dashboards | S1-F08 | Same | every stage | access-and-approvals 15 test 21 |
| `PRD-EXC-005` | Sales reports | S4-F14 | Same | — | Stage 4 reports |
| `PRD-EXC-006`, `PRD-EXC-007` | Ageing, sell-through, dead stock, missed returns | S3-F10 | Same | S6-F04 | Stage 3 reports |
| `PRD-EXC-008` | Brand-by-store profit and Store P&L | S5-F07 | Same | — | Stage 5 reports |
| `PRD-EXC-009`, `PRD-EXC-010` | One metric definition; sales, collections, settlement and profit apart | S2-F11 | Every stage | every report | First metric report |
| `PRD-EXC-011` | Drill to evidence; reports restricted to permitted data | S1-F01 | Same | every report | access-and-approvals 15 test 11 |
| `PRD-EXC-012` to `PRD-EXC-014` | Daily summaries, alerts, customer messages | S5-F11 | Same | My work alerts in S3-F02, S3-F07, S4-F02, S4-F08, S4-F10 | Stage 5 scope |
| `PRD-EXC-015` | Plain-language questions | S6-F05 | Same | — | Stage 6 scope |
| `PRD-EXC-016` to `PRD-EXC-021` | Replenishment, forecasts, planning proposals | S6-F04 | Same | — | Stage 6 exit |
| `PRD-LIF-001`, `PRD-LIF-003` | Site readiness and activity approval; zero opening | S1-F04 | Same | S2, S3, S4 activation | Stage 1 exit |
| `PRD-LIF-002` | Verify mappings, users, locations, devices, policies and stock plan before an activity | S1-F04 | S1-F12 | S1-F12 (devices check) | Stage 1 exit check 6 |
| `PRD-LIF-004`, `PRD-LIF-015`, `PRD-LIF-025` to `PRD-LIF-028` | Opening stock and the switch | S4-F12 | Same | S1-F13 | Stage 4 switch checks |
| `PRD-LIF-005` to `PRD-LIF-009`, `PRD-LIF-011` | Opening evidence, unknown season, no fabricated purchases, dues | S1-F13 | S4-F12 | S4-F12 | imports-and-opening-data 17 tests 20–22 |
| `PRD-LIF-010`, `PRD-LIF-012` to `PRD-LIF-014`, `PRD-LIF-016` | Historical sales and side-by-side test imports | S2-F12 | Same | — | Stage 2 exit |
| `PRD-LIF-017` to `PRD-LIF-023`, `PRD-LIF-029` | Closure, relocation, complete export, migration | S5-F09 | Same | S1-F14 (export design) | Stage 5 exit |
| `PRD-UXP-001` | Persona home screens; daily actions within three navigation actions | S1-F01 | Every stage | every feature with screens | Browser journeys per feature |
| `PRD-UXP-002` | Scan, search, shortcuts, saved filters, bulk actions, comments, attachments, drill-through | S1-F01 | Every stage | every feature with screens | Browser journeys per feature |
| `PRD-UXP-003`, `PRD-UXP-010` | State, blocking reason and next action; one operational path | S1-F01 | Same | every feature | Browser journeys per feature |
| `PRD-UXP-004` | Store users' areas | S4-F13 | Same | — | Stage 4 scope |
| `PRD-UXP-005` | Warehouse users' areas | S2-F02 | Same | S3-F02, S3-F05 | Stage 2 scope |
| `PRD-UXP-006` | MBO opening and close | S4-F01 | Same | S4-F08 | Stage 4 scope |
| `PRD-UXP-007` | EBO opening and close | S4-F10 | Same | S4-F08 | Stage 4 scope |
| `PRD-UXP-008` | Accounts workbench | S5-F01 | Same | — | Stage 5 scope |
| `PRD-UXP-009` | Owner, Booking, Operations, Brand, HR, Admin workbenches | Every feature | Same | S1-F04 (Admin Setup first) | Each stage |
| `PRD-MOD-001`, `PRD-MOD-003`, `PRD-MOD-006`, `PRD-MOD-008` to `PRD-MOD-011` | Database per Organisation, read models, one transaction with outbox, identifiers, time, effective dating, append-only records | S1-F01 | Same | every feature | S1-F01-AT02, S1-F01-AT15 and every database test |
| `PRD-MOD-002` | Module ownership and interfaces | S0 | Same | every feature (pnpm check:modules) | Module check in CI |
| `PRD-MOD-004` | Shared modules: access, configuration, audit, numbering, calculations, imports, inbox, notifications, AI gateway | S1-F01 | S5-F11 | S2-F05 (AI gateway), S5-F11 (notifications) | Each module's feature |
| `PRD-MOD-005` | Business modules | Every feature | Same | — | Stage exits |
| `PRD-MOD-007` | Pricing, tax, discount allocation, rounding and incentive logic written once | S1-F11 | S6-F02 | S6-F02 (incentives) | shared-calculations 12; stage 6 exit |
| `PRD-MOD-012` | Stock balances from movements | S1-F10 | Same | — | stock-ledger 11.7 |
| `PRD-MOD-013` | Balanced journals per book at commit | S1-F09 | Same | S1-F10 | books-and-posting 15 test 2 |
| `PRD-MOD-014`, `PRD-MOD-015` | Integer paise; Unknown distinct from zero | S1-F11 | Same | every feature | shared-calculations 12 |
| `PRD-MOD-016` | Exact-cash shorthand resolved before persistence | S1-F11 | S4-F02 | S4-F02 | shared-calculations 12; stage 4 exit |
| `PRD-INT-001`, `PRD-INT-002`, `PRD-INT-008` | Authenticate and authorise; scoped idempotency; replay-safe outbox | S1-F01 | Same | every feature | S1-F01-AT07, S1-F01-AT13, S1-F01-AT14 |
| `PRD-INT-003`, `PRD-INT-004` | Lock order and rechecks; commit together; no oversell or double reservation | S1-F10 | Same | every posting feature | stock-ledger 11.9 |
| `PRD-INT-005` | No oversell, duplicate return, overlapping coverage or double reservation | S1-F10 | S4-F05 | S2-F06, S3-F01, S4-F02, S4-F05 | stock-ledger 11.9; stage 4 exit |
| `PRD-INT-006` | Bank, GST, Tally and messaging outcomes outside the local transaction | S4-F09 | Stage 5 | S5-F02, S5-F03, S5-F11 | Stage 4 and 5 scope |
| `PRD-INT-007` | Request identities, outcome states, authenticated callbacks, reconcile before retry | S4-F09 | Stage 5 | S4-F02, S5-F02, S5-F03, S5-F11 | Stage 4 and 5 scope |
| `PRD-INT-009` | TallyPrime gateway | S5-F02 | Same | — | Stage 5 exit |
| `PRD-INT-010`, `PRD-INT-013` | GST through an approved GSP with status lookup; adapter replacement keeps meaning | S4-F09 | Same | S4-F02, S5-F02, S5-F03 | Stage 4 scope |
| `PRD-INT-011` | Bank files, statements, settlement imports, terminals | S5-F03 | Same | S4-F02 (terminal adapters) | Stage 5 scope |
| `PRD-INT-012` | EBO adapters | S4-F10 | Same | — | Stage 4 scope |
| `PRD-OFF-001`, `PRD-OFF-003` to `PRD-OFF-009`, `PRD-OFF-011` to `PRD-OFF-019` | Offline counter | S4-F11 | Same | — | Stage 4 exit (PRD-ACP-011) |
| `PRD-OFF-002`, `PRD-OFF-010` | Device registration and fresh series | S1-F12 | S4-F11 | S4-F11 | numbering-and-audit 7 tests 3, 4 |
| `PRD-SEC-001`, `PRD-SEC-006`, `PRD-SEC-007`, `PRD-SEC-014`, `PRD-SEC-018` | Sign-in with TOTP, encryption at rest, access record, logs without secrets, service identities | S1-F01 | Same | every feature | access-and-approvals 15 tests 2–5, 11, 22, 23 |
| `PRD-SEC-002` to `PRD-SEC-004` | AI gateway, reviewable drafts, AI never posts | S2-F05 | Same | — | Stage 2 scope |
| `PRD-SEC-005` | Access enforced on APIs, search, reports, exports, files, jobs, notifications, live updates, AI answers | S1-F01 | S6-F05 | every feature; S5-F11, S6-F05 | access-and-approvals 15 test 11; each feature |
| `PRD-SEC-008` | Revoke lost devices and sessions; bounded offline delegation | S1-F01 | S4-F11 | S1-F12, S4-F11 | access-and-approvals 15 test 5; stage 4 exit |
| `PRD-SEC-009` | Consent, retention, deletion, legal holds | S1-F14 | S6-F01 | S4-F03 (consent), S6-F01 (employee data) | numbering-and-audit 7 test 14 |
| `PRD-SEC-010` | Employee photos, location, payroll data | S6-F01 | Same | — | Stage 6 scope |
| `PRD-SEC-011` | File validation at intake | S1-F06 | Same | — | imports-and-opening-data 17 test 1 |
| `PRD-SEC-012` | Backup, restore verification, export recovery | S1-F14 | Same | S5-F09 | Stage 1 exit |
| `PRD-SEC-013` | Failed jobs, stale data, stuck sync visible | S1-F08 | Stage 5 | S4-F11 | S1-F08 acceptance |
| `PRD-SEC-015`, `PRD-SEC-016` | Pinned dependencies; required checks on every change | S0 | Every stage | every feature | CI on every push |
| `PRD-SEC-017` | Capability controls | S1-F04 | Same | every feature | Stage 1 exit |
| `PRD-PRF-001` | Measured against the reference workload | S4-F02 | Same | S2-F13 (PT import target) | Side-by-side measurements |
| `PRD-PRF-002` | External calls measured apart | S4-F09 | Same | — | Stage 4 scope |
| `PRD-PRF-003` | Background work never delays counters | S1-F10 | S4-F02 | S4-F02 | stock-ledger 11.9 |
| `PRD-PRF-004` | Freshness shown | S1-F01 | Every stage | every feature | Read models show as-of |
| `PRD-ACP-001` | No uncounted stock from documents | S2-F02 | Same | — | Stage 2 exit |
| `PRD-ACP-002` | No overlapping coverage; corrections respect dependants | S2-F09 | S4-F02 | S2-F06 | Stage 2 and 4 exits |
| `PRD-ACP-003` | Same acceptance checks for every source | S2-F07 | S4-F12 | S3-F02, S4-F12 | Stage 2 and 3 exits |
| `PRD-ACP-004` | Pre-PT unknowns stay unknown | S3-F06 | Same | S1-F10 (G2) | Stage 3 exit |
| `PRD-ACP-005` | Damage blocks at once; rejection clears only its hold | S2-F08 | Same | S1-F10 (G5) | Stage 2 exit |
| `PRD-ACP-006` | Transfers reconcile every quantity | S3-F02 | Same | S3-F01 | Stage 3 exit |
| `PRD-ACP-007` | RTV completion rules | S3-F08 | Same | — | Stage 3 exit |
| `PRD-ACP-008` | Return policy and caps | S4-F05 | Same | — | Stage 4 exit |
| `PRD-ACP-009` | No double spend of entitlement | S4-F05 | S4-F06 | S4-F06 | Stage 4 exit |
| `PRD-ACP-010` | One correctly paid immutable bill | S4-F02 | Same | — | Stage 4 exit |
| `PRD-ACP-011` | Offline resilience | S4-F11 | Same | — | Stage 4 exit |
| `PRD-ACP-012` | EBO uploads affect once | S4-F10 | Same | — | Stage 4 exit |
| `PRD-ACP-013` | One Site, units in different books | S1-F02 | S5-F01 | S1-F09, S5-F01 | Stage 1 and 5 exits |
| `PRD-ACP-014` | Unknown season and offers; corrections never rewrite | S4-F12 | Same | S1-F13, S4-F04 | Stage 4 exit |
| `PRD-ACP-015` | Closure cannot retire unresolved items | S5-F09 | Same | — | Stage 5 exit |
| `PRD-ACP-016` | Purchase and sale cycles reconcile through Tally | S5-F04 | Stage 5 | S5-F02, S5-F03 | Stage 5 exit |
| `PRD-ACP-017` | Attendance, incentives, payroll replay | S6-F03 | Same | S6-F01, S6-F02 | Stage 6 exit |
| `PRD-ACP-018` | Golden cases, real PostgreSQL concurrency, scoped browser journeys | S1-F10, S1-F11 | S6-F02 | S6-F02 (incentives); every feature (journeys) | Stage 1 and 6 exits |
| `PRD-ACP-019` | Restore and export reproduce records | S1-F14 | S5-F09 | S5-F09 | Stage 1 and 5 exits |
| `PRD-ACP-020` | Inbound ownership is never stock | S2-F03 | Same | — | Stage 2 exit |

## 4. Policies

All 19 policies are Open. A policy's bullets shape the build now, as the `DEC-105` baseline; its live operations wait for its signature and validated values ([kdps-values.md](kdps-values.md) section 4).

| Policy | Bullets | Built in | Live gate |
| --- | --- | --- | --- |
| 1 Commercial ownership | `POL-01.01` to `POL-01.15` | Agreement terms in `S1-F03`; booking-level model and terms in `S2-F01`; ownership before receipt in `S2-F03`; return rights in `S3-F07`, `S3-F08`; payment terms in `S5-F04` | Live S2 |
| 2 Permissions and approvals | `POL-02.01` to `POL-02.25` | Roles, independence, sign-in and sessions, reasons in `S1-F01`; limits, bulk and stand-ins in `S1-F05`; exception routing in `S1-F08`; sensitive fields in `S1-F03`; count rules in `S3-F05`; day-close variance in `S4-F08`; daily summary and phone approval in `S5-F11` | Live S1 |
| 3 Source conflicts and pricing | `POL-03.01` to `POL-03.08` | `S2-F04`, `S2-F06`; the source-conflict exception type in `S1-F08` | Live S2 |
| 4 Merchandise tracking | `POL-04.01` to `POL-04.09` | `S1-F03`; batch and expiry through receiving in `S2-F02`; piece IDs in `S2-F07` | Live S1 |
| 5 Booking | `POL-05.01` to `POL-05.10` | `S2-F01` | Live S2 |
| 6 Customer returns | `POL-06.01` to `POL-06.11` | `S4-F05`, `S4-F06` | Live S4 |
| 7 Refunds and no-bill returns | `POL-07.01` to `POL-07.13` | `S4-F05`, `S4-F06`, `S4-F03`; Customer credit in `S5-F05` | Live S4; Customer credit S5 |
| 8 Billed-retained | `POL-08.01` to `POL-08.06` | `S4-F07` | Live S4 |
| 9 Financial posting | `POL-09.01` to `POL-09.26` | Books, maps, periods and tolerances as settings in `S1-F09`; cost rules on synthetic data in `S1-F10`; live cost establishment in `S2-F06`; petty cash in `S4-F08`; close, vouchers, allocation and assets in `S5-F01`, `S5-F02`, `S5-F07` | Live S1; parts S5 |
| 10 Statutory applicability | `POL-10.01` to `POL-10.11` | Unit mappings and their verification in `S1-F02`; tax-rule records in `S1-F09`; movement documents in `S3-F03`; invoice format, e-invoice and return credit notes in `S4-F09`; gift-voucher tax in `S4-F06`; TDS and MSME in `S5-F06`, `S5-F04`; payroll in `S6-F03` | Live S2 to S6 by part |
| 11 Official book | `POL-11.01` to `POL-11.04` | `S5-F01` | Live S5 |
| 12 Franchise/partner | `POL-12.01` to `POL-12.08` | `S5-F08`; onward commission in `S5-F05` | Live S5 |
| 13 Workforce | `POL-13.01` to `POL-13.15` | `S6-F01` to `S6-F03` | Live S6 |
| 14 Opening and cutover | `POL-14.01` to `POL-14.08` | Layouts and reconciliation on sample data in `S1-F13`; the switch in `S4-F12` | Live S4 |
| 15 Planning | `POL-15.01` to `POL-15.08` | `S6-F04` | Live S6 |
| 16 Offline operation | `POL-16.01` to `POL-16.07` | Device series in `S1-F12`; the offline counter in `S4-F11` | Live S4 |
| 17 Held-goods outcomes | `POL-17.01` to `POL-17.11` | Holds and wrong or unidentified goods in `S2-F08`; write-off and disposal in `S3-F06` | Live S2; write-off and disposal S3 |
| 18 Recovery and retention | `POL-18.01` to `POL-18.05` | `S1-F14` | Live S1 |
| 19 Offers and promotions | `POL-19.01` to `POL-19.05` | `S4-F04`; markdown approval in `S6-F04` | Live S4 |

## 5. Deferred or not built, by decision

Nothing below disappears silently: each item is held by a decision or a stage.

| Item | Why | Where it is held |
| --- | --- | --- |
| Online storefronts, marketplace orders, automatic return filing, facial recognition (`PRD-PRO-010`) | Outside product scope | Not built |
| A native phone client (`PRD-PRO-009`, phone part) | Responsive web serves phones through stage 6; a native client needs a later decision (`DEC-105`) | RR-051 |
| Returns of earlier-POS bills after a Store's switch and EBO returns not linked to their imported sale | Unavailable until a later plan; `PRD-EBO-005` is unmet for them meanwhile; the customer is served by the no-bill route where policy 7 allows it (`DEC-059`, `DEC-105`, SL-10) | RR-045 |
| Offline billing (`PRD-OFF-001` and the rest) | Designed in stage 1, built in stage 4, enabled only under the signed policy 16 and the offline exit check | `S1-F12`, `S4-F11` |
| AI drafts (`PRD-SEC-002` to `PRD-SEC-004`) | Stage 2, switched off by default; stage 1 imports are manual (`DEC-105`) | `S2-F05` |
| Email, WhatsApp and SMS (`PRD-POS-017`, `PRD-EXC-012` to `PRD-EXC-014`, `PRD-ACS-012`) | Nothing is sent before stage 5; alerts reach My work meanwhile (`DEC-099`) | `S5-F11` |
| Hindi screens (`PRD-PRO-009`, language part) | Stage 5 for stages 1 to 5, stage 6 for its own screens | `S5-F10`, `S6-F06` |
| Customer credit at the till (`PRD-POS-022`) | Stage 5 (`DEC-025`) | `S5-F05` |
| The complete export (`PRD-LIF-022`) | Designed with backup in stage 1 (GC-9), built in stage 5 | `S1-F14`, `S5-F09` |
| Incentive golden cases (`PRD-ACP-018`, incentive part) | Completed in stage 6 ([phases.md](../phases.md)) | `S6-F02` |
| Golden scenario G10 with values under the real rounding rule (G10b) | The rule is OPEN (SL-2, V-64). Stage 1 proves G10a instead: with no rule set the outflow is refused and commits nothing, and an outflow that empties the pool leaves no residue (stock-ledger 7.3, 7.10). G10b is accepted when the rule is set, before moving-average postings go live | RR-124; [roadmap.md](roadmap.md) section 2.3 |
| Chunked posting of a large document | Only if the performance test fails, and then a PRD decision (SL-11) | RR-046 |
| The 23 needs the data notes found uncovered | Proposals, not requirements: each becomes a PRD bullet only through a decision entry | RR-047, RR-048 |
