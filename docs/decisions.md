# Decision log

> **Not ranked.** This log records why the PRD or the KDPS policies changed. The rule itself lives in [prd.md](prd.md) or [kdps-policies.md](kdps-policies.md); if this log and those documents disagree, they win. See [README.md](README.md).

- One entry per decision, newest last. Write the entry first, then edit the PRD or the policies to match.
- Cite an entry as `DEC-001`. Numbers are never reused.
- Each entry: date, who decided, the question, the options, the choice and why, and the IDs changed.

## DEC-001 — A person may hold several roles

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** A-1, 4.6
- **Question.** The PRD lets a person hold several roles (`PRD-ACS-001`), each applied inside its own scope (`PRD-ACS-004`). Policy 2 said "Assign each user a role", which reads as one.
- **Options.** Several roles, as the PRD says · One role only, with merged custom roles for people doing two jobs.
- **Choice.** Several roles. It matches the PRD and fits people who hold several personas.
- **Changed.** `POL-02.02` now reads "Assign each user one or more roles, each with explicit business, Site and brand scope."

## DEC-002 — Piece tracking is set per merchandise tracking profile

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** 4.1, A-4 (piece part), V-06
- **Question.** The PRD gave each "KDPS-tracked" piece its own ID (`PRD-MER-003`) but never said which pieces are tracked. If the till scans only a shared supplier barcode, nobody knows which piece was sold.
- **Options.** Per category profile, with a piece-ID scan for tracked goods · No piece IDs for now.
- **Choice.** Per category profile. Tracked goods keep piece identity through sale; other goods (such as packaged goods) stay quantity per SKU. KDPS picks the categories.
- **Changed.**
  - PRD "Words used": Piece ID reworded ("piece-tracked" for "KDPS-tracked"); new word Piece-tracked.
  - `PRD-MER-003` reworded the same way.
  - New `PRD-MER-014` (tracking set per profile), `PRD-MER-015` (labels from the receipt count, no price before PT approval), `PRD-MER-016` (bill, count, transfer and return by piece-ID scan).
  - `POL-04.06` reworded; new `POL-04.09` (which categories: to be confirmed).
  - `phases.md` stage 2 wording matched. `ui-blueprint.html` still says "KDPS-tracked"; fix it at the next design edit.

## DEC-003 — Goods owned before receipt get an inbound ownership record

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** A-2, 4.4
- **Question.** An agreement can make KDPS the owner at supplier dispatch (`POL-01.05`), but only a count creates stock (`PRD-REC-008`). Policy 9 allows a provisional supplier amount (`POL-09.02`); the PRD forbids a fictitious payable (`PRD-ACP-004`) and never said which evidence makes an amount allowed.
- **Options.** An inbound ownership record that is not stock, with an amount only from invoice or agreement-price evidence · Record ownership and amounts only from the receipt count.
- **Choice.** Inbound ownership record. The books can show owned goods in transit without inventing stock or value. The CA still sets the accounting under policy 9.
- **Changed.**
  - PRD "Words used": new word Inbound ownership.
  - New `PRD-ORG-017` (record inbound ownership; it is not stock), `PRD-ORG-018` (provisional amount only from a supplier invoice or the agreement's price for the same goods and quantity; otherwise unknown plus an exception), `PRD-ORG-019` (close it against the receipt count).
  - New `PRD-ACP-020` (acceptance condition).
  - No policy change: `POL-09.02` already asks for traceable evidence and keeps the amount unknown without it, which fits inside the new PRD rule.

## DEC-004 — Cost pool is configurable per book: whole book or each Site

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** 4.2, V-09
- **Question.** Policy 9 prefers moving weighted average, subject to the CA (`POL-09.06`), but nothing said what the average runs over. That decides cost layers and the cost of every transfer.
- **Options.** One pool per SKU per accounting book · Configurable per book: each SKU across the book, or each SKU at each Site.
- **Choice.** Configurable. The CA picks the pool for KDPS. Under a Site pool, transfers carry source cost into the destination pool and re-average there; this costs more to build and test, and is accepted for the flexibility.
- **Changed.**
  - New `PRD-LED-014` (FIFO and weighted average supported; one formula per book, used consistently).
  - New `PRD-LED-015` (pool per book: whole book or each Site; transfers carry cost without markup; changes are effective-dated and reconciled).
  - PRD "Required policy configuration", Financial posting row: adds "cost pool".
  - New `POL-09.19` (pool to be confirmed by the CA).

## DEC-005 — Every billing device has its own bill series

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** 4.9, B-3, V-40
- **Question.** The offline counter has its own series per financial year (`PRD-OFF-002`). Nothing said whether online tills also have one each or share a Store series. A GST invoice number must be unique per registration and year, within a length limit, and one Site can hold units with different registrations.
- **Options.** Every till its own series per registration and year · Online tills share a Store or business-unit series from the server; only the offline counter has its own.
- **Choice.** Every till its own series. One rule for all tills, no clash when a till drops offline, and a till serving two registrations simply holds two series. Bill numbers run per till, not across the Store.
- **Changed.**
  - New `PRD-POS-020` (series per device, per registration, per financial year; format set per Organisation within statutory limits).
  - PRD "Required policy configuration", Statutory applicability row: adds "invoice-number format".
  - New `POL-10.07` (format to be confirmed by the CA).

## DEC-006 — Gift vouchers are the Organisation's own bearer vouchers

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** 4.10, B-7, V-30
- **Question.** The PRD names "gift voucher" as a tender (`PRD-POS-005`) but never said where vouchers come from, whether they are named or bearer, or how they are held.
- **Options.** The Organisation's own vouchers only · Own vouchers plus outside (brand or corporate) vouchers, with a claim on the issuer.
- **Choice.** Own vouchers only. Each is a bearer voucher with a unique code, held as a liability until used and checked online at redemption. Outside vouchers would add a third-party settlement flow; they wait for a later PRD change. Store credit stays customer-linked (`PRD-RET-016`).
- **Changed.**
  - PRD "Words used": new word Gift voucher.
  - New `PRD-RET-020` (issue, liability, online balance check, tax via policy 10) and `PRD-RET-021` (own vouchers only).
  - New `POL-07.10` (validity, partial redemption, refund of unused balance, lost voucher: to be confirmed).

## DEC-007 — Split-tender refunds are proportional

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** 4.7, V-26
- **Question.** Refunds go only to the original tenders, capped per tender (`POL-07.01`), but nothing said which tender is refunded first when part of a split-paid bill comes back.
- **Options.** Proportional to the original split · A configurable order (proportional, card/UPI first, cash first) chosen by KDPS.
- **Choice.** Proportional. One fixed rule, nothing for the cashier to choose, easy to audit. Example: ₹1,500 card + ₹500 cash; an ₹800 return refunds ₹600 to card and ₹200 in cash.
- **Changed.**
  - New `PRD-RET-022` (proportional split, per-tender cap, overflow to the other tenders in proportion, rounding paise to the largest tender).
  - `POL-07.01`: "no new tender priority is assumed" → "split each refund across them in proportion, as the PRD requires". KDPS no longer needs to choose an order.

## DEC-008 — A tolerance only selects the approver

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** 4.8, B-1, V-21, V-38
- **Question.** Counts and day-close cash will have tolerances, but nothing said what a tolerance does: auto-accept small differences, or only route their approval. The day-close cash tolerance also had no policy home.
- **Options.** The tolerance picks the approver; every difference is approved · Differences inside the tolerance are adjusted automatically.
- **Choice.** It picks the approver only. Every difference is recorded, explained and approved; above the tolerance it goes to a higher approver and becomes an owned exception. Nothing is adjusted or written off automatically, matching `POL-09.13` ("a tolerance never authorises a write-off").
- **Changed.**
  - New `PRD-STK-012` (counts) and `PRD-CSH-011` (day-close cash).
  - PRD "Required policy configuration", Permissions and approvals row: adds "day-close cash-variance tolerance/approval".
  - New `POL-02.13` (cash-variance tolerance and approvers: unconfigured).

## DEC-009 — Each approval limit names its value basis

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** 4.11, audit D-06
- **Question.** Limits use "amount, quantity or discount percentage" (`POL-02.09`), but for stock nothing said whether the amount is at cost or at MRP, and pre-PT cost can be unknown (`PRD-DMG-005`).
- **Options.** Each limit names its basis, with a rule for unknown value · MRP for every stock limit.
- **Choice.** Each limit names its basis: cost for stock adjustments, write-offs, disposals and transfers; bill value for discounts, refunds and no-bill returns; the amount paid for payments. MRP would overstate real losses and can be unknown too. An unknown value goes only to an approver whose authority explicitly covers it.
- **Changed.**
  - New `PRD-ACS-015` (basis per limit, shown beside it) and `PRD-ACS-016` (unknown value: explicit authority or pending; never zero).
  - No policy change: `POL-02.09` already allows amount, quantity or percentage per action. KDPS still sets the amounts (V-02).
  - `design-language.md` §12 still lists "the value basis (MRP or cost)" as open, and `design-system.html` shows "Proposed at MRP" for a PT approval. Fix both at the next design edit.

## DEC-010 — KDPS values move out of the PRD

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** A-3, A-4 (Tally part), A-5
- **Question.** The PRD carried KDPS's own values: the 15-day return window and open defective cutoff (`PRD-RET-002`, repeated in `POL-06.02`), Tally as "KDPS's sole official accounting book" in "Words used", and a fixed 9 PM summary (`PRD-EXC-012`).
- **Options.** Move them to the policies and keep the PRD customer-neutral · Leave them in the PRD.
- **Choice.** Move them. The PRD and policy 6 no longer need to be kept in sync by hand, and a second customer needs no cleanup. Names of the KDPS PT layout (BASIC, NAG, P RATE, `PRD-PTW-008`) stay: they name a layout the product supports.
- **Changed.**
  - `PRD-RET-002` retired (not reused). Its product part, an effective-dated Store override, moves into `PRD-RET-001`. The 15 days and the open cutoff stay in `POL-06.02` and `POL-06.05`.
  - PRD "Words used", Tally: "TallyPrime, an external accounting book. Whether it is the official book is set by the Official book policy". `POL-11.01` already makes Tally KDPS's sole official book.
  - `PRD-EXC-012`: "the configured 9 PM WhatsApp summary" → "the configured daily WhatsApp summary". Policy table, Permissions row: "9 PM summary recipients/channels" → "daily summary time, recipients and channels".
  - `POL-02.11`: "9 PM summary" → "daily summary". New `POL-02.14` (KDPS's daily summary at 9 PM).
  - `phases.md` stage 5: "the 9 PM summary" → "the daily summary".
  - The PRD IDs note lists retired IDs.

## DEC-011 — Store P&L stops at profit before tax

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** audit D-02
- **Question.** The PRD's profit steps end at "minus applicable income-tax expense = Net profit" (`PRD-NAV-014`), and they govern the Store P&L (`PRD-NAV-016`). A Store does not pay income tax; the legal entity does.
- **Options.** Stop the Store P&L at profit before tax · Allocate the entity's tax to Stores by a configured rule.
- **Choice.** Stop at profit before tax. A tax split across Stores would be an allocation, not a real amount, and would need its own policy.
- **Changed.** New `PRD-NAV-017` (Store P&L and brand-by-store profit end at profit before tax; income tax and net profit only for a legal entity).

## DEC-012 — Refund approval cases belong to policy 7

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** A-6, D-05
- **Question.** Policy 7 asks which refund cases need independent approval, while policy 2 and the PRD also appear to decide those cases. Policy 2 must still define who may approve, their authority and limits, and prevent self-approval.
- **Options.** Put refund-case triggers in policy 7 and approver identity/authority in policy 2 · Keep refund triggers in both policies.
- **Choice.** Policy 7 owns which refund cases require independent approval. Policy 2 owns assigned approvers, authority, limits and no-self-approval, and cross-references policy 7. Do not duplicate refund triggers.
- **Changed.** `POL-02.05`, `POL-02.07`, `POL-02.08`, `POL-02.09`, `POL-07.09`; the PRD Required policy configuration rows for policies 2 and 7.

## DEC-013 — Real opening data is loaded at the stage 4 switch

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** A-7, D-03
- **Question.** Opening and cutover policy 14 is needed in stage 1 to design import layouts, while verified opening stock, balances and sign-off are needed for the stage 4 pilot switch.
- **Options.** Require the verified opening data in stage 1 · Build and test layouts with sample data in stage 1, then load verified real data at the approved stage 4 switch.
- **Choice.** Build and test import layouts with sample data in stage 1. Load real opening stock and balances, and record verification and sign-off, at each approved day-close switch in stage 4.
- **Changed.** `POL-14.07`; the PRD Required policy configuration row for policy 14.

## DEC-014 — Give offers, EBO settlements and Store P&L allocation explicit policy homes

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report items:** B-2, B-4, B-5
- **Question.** Offer combination, funding and markdown approvals; missing EBO report timing and EBO brand commission/settlement; and Store P&L allocation had no complete policy homes.
- **Options.** Add a separate offers policy and extend the existing permission, partner and financial-posting policies · Leave the details in design or in unrelated policies.
- **Choice.** Add policy 19, Offers and promotions, decided by Owner and Brand manager for stage 4. Policy 2 owns missing EBO report due/exception timing; policy 12 also covers EBO brand commission and settlement; policy 9 owns Store P&L and brand-by-Store allocation with Accounts and CA for stage 5. This approves policy homes only; actual rates, terms, bases and formulas remain OPEN.
- **Changed.** Updated PRD Required policy configuration rows 2, 9 and 12; new row for policy 19; `POL-02.11`, new `POL-12.06`, new `POL-09.20`, and new `POL-19.01`–`POL-19.03`.

## DEC-015 — PT approval limits use proposed acquisition cost

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** 4.11, V-55
- **Question.** A PT approval monetary limit could be compared with MRP or with the acquisition cost of the proposed covered quantities. A missing or disputed cost must not be treated as zero.
- **Options.** Use the total proposed acquisition cost for the covered PT quantities · Use their MRP total.
- **Choice.** Use total proposed acquisition cost, calculated from the approved receipt-layer cost of each covered quantity; do not use MRP. A missing or disputed cost blocks value-based approval until resolved, never as zero. This is an approval valuation and does not determine supplier-liability recognition.
- **Changed.** `PRD-ACS-015`, `PRD-ACS-016`; cross-references in `POL-02.09` and `POL-03.07`; design-language and design-system approval guidance; V-55 is settled.

## DEC-016 — Corrections to DEC-013 to DEC-015

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** review of DEC-012 to DEC-015
- **Question.** A check of DEC-012 to DEC-015 found four slips: policy 12 had two names; policy 12 said "EBO reporting by 4" although DEC-014 put EBO report timing in policy 2; policy 14's stage said "1 for layouts and sample-data tests", but the "Needed by stage" column marks live use only; and the PT approval cost used "approved receipt-layer costs", which are not approved until the PT itself is.
- **Options.** Correct each slip · Leave them.
- **Choice.** Correct them.
  - Policy 12 keeps the single name "Franchise/partner" in both documents; it still covers EBO brand settlement. Needed by stage 5.
  - Policy 14 is needed by stage 4, before the pilot switch. Its import layouts are built and tested in stage 1 with sample data, which needs no policy.
  - A PT approval limit compares with the proposed P RATE times the covered quantity on the PT revision under approval. This replaces the DEC-015 wording "approved receipt-layer cost".
- **Changed.** PRD "Required policy configuration" rows for policies 12 and 14; `PRD-ACS-015`; policy table rows 12 and 14; `POL-02.09`; `phases.md` stages 1 and 4; the alignment report's A-2 status and PT wording.

## DEC-017 — Set the stage 1 access baseline

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** six-stage chat choices
- **Question.** Which role templates, login controls, approval defaults and exception routing should shape the shared foundation?
- **Options.** Keep the six original templates and leave these flows wholly unspecified · Add the five named templates and record the selected access-control behaviours while leaving actual users, Sites, brands, amounts and owners open.
- **Choice.** Use eleven editable templates; require production TOTP; set initial 5-minute shared-POS and 15-minute office idle locks plus a 12-hour absolute limit; preserve unfinished work; define default role/action limits with explicitly authorised individual limits; require item-level bulk checks and named, scoped, expiring stand-ins; route exceptions by type and Site. Missing values confer no authority.
- **Why.** The product needs reviewable access and workflow defaults without inventing KDPS's roster, limits or actual assignments.
- **Changed.** `PRD-ACS-017`–`PRD-ACS-019`; `POL-02.01`, `POL-02.11`, `POL-02.15`–`POL-02.20`; policy 2 template map; stage 1 questions.

## DEC-018 — Keep stage 2 authority and accounting grounded in real evidence

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** six-stage chat choices
- **Question.** Which goods-in, booking and costing approaches can be fixed before the real agreements, chart and CA values are supplied?
- **Options.** Infer terms, accounts or costing from examples · Set workflow ownership and evidence rules while retaining verified current policy and keeping actual terms open.
- **Choice.** Use signed brand agreements for commercial terms; Booking proposes material booking changes and cancellations for authorised approval; Booking prepares buying budgets, Accounts checks, and the Owner approves. Operations proposes write-offs/disposals for independent cost-limit approval with Accounts reviewing value. Name Booking approvers by Site and brand for resolved wrong/unknown goods. Start from the current CA-approved chart, mappings, cost method and pool; verify them and do not switch methods. CA and Accounts validate real examples, framework, goods-in-transit postings, tax mappings and tolerances. Apparel and footwear use piece IDs; other categories require explicit selection.
- **Why.** Product-owner choices establish safe process without fabricating contracts, accounts, legal facts, rates or thresholds.
- **Changed.** `POL-04.09`, `POL-05.09`–`POL-05.10`, `POL-09.21`–`POL-09.25`, `POL-10.08`, `POL-17.10`–`POL-17.11`; stage 2 questions.

## DEC-019 — Freeze counted stock and require approved variance

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** six-stage chat choices
- **Question.** What stock controls apply while a full or cycle count is in progress?
- **Options.** Permit normal selling/movement or automatic adjustments · Freeze counted scope and require approval, with full selling stopped for a full Store count.
- **Choice.** Freeze counted items and locations during counts; stop selling during full Store counts; a Store Manager may approve count differences only within configured cost limits, and larger differences escalate. Never adjust automatically.
- **Why.** This protects counted stock and retains independent control without inventing limits or people.
- **Changed.** `PRD-STK-008`–`PRD-STK-009`; new `POL-02.21`; stage 3 count questions; `phases.md` pass criteria.

## DEC-020 — Include the selected store-day instruments and controls

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** six-stage chat choices
- **Question.** Which store-day features belong in product scope, and which controls apply before live activation?
- **Options.** Defer some requested payment instruments and customer credit outside the product · Include them, gated by signed policy and verified terms/evidence.
- **Choice.** Include cash, UPI, card, verified Bank transfer, Store credit, own Gift vouchers and approved Customer credit/pay-later. Store credit is redeemable only at authorised Stores in the same legal entity. Keep customer phone optional and marketing consent separate. Require independent approval for no-bill, cash-substitution, tender/return override and above-limit refund exceptions. Assess defects under applicable rights/warranties without inventing a hard cutoff. Keep loyalty off until approved. Offline pilot is one approved counter with reserved stock and cash-first; external-terminal evidence remains a later explicitly approved procedure. Offers do not stack unless allowed, and Brand managers propose agreement-based shares for authorised approval.
- **Why.** The requested instruments and workflows are in scope; their real limits, validity, provider, agreement, tax and approver facts remain gated.
- **Changed.** PRD "Words used" (Bank transfer, Customer credit), `PRD-POS-005`, `PRD-POS-012`, `PRD-POS-021`–`PRD-POS-022`, `PRD-RET-010`, `PRD-RET-023`; `POL-02.13`, `POL-06.05`, `POL-07.01`, `POL-07.09`–`POL-07.13`, `POL-16.02`, `POL-19.04`–`POL-19.05`; store-day questions and tender UI references.

## DEC-021 — Send the selected financial-control evidence to named approvers

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** six-stage chat choices
- **Question.** Which notifications and review evidence should stage 5 support?
- **Options.** Leave summary channel and store-profit allocation presentation open · Set the requested channel and require approved causal allocation with a visible comparison.
- **Choice.** Send the 9 PM daily summary by WhatsApp to selected recipients. Phone approval notifications use authenticated links bound to the exact record version; a plain “yes” does not approve. Show Store P&L before and after shared-cost allocation using approved causal drivers. Keep franchise and EBO formulas tied to signed contracts; verify Tally mappings and supplier MSME classification/deadlines with real evidence; have the CA approve category-specific asset capitalisation/depreciation policy. Use Contra only for cash/bank transfers inside one legal entity, never stock transfers.
- **Why.** The chosen product behaviours are clear while actual recipient names, agreements, mapping and allocation drivers remain evidence-based and open.
- **Changed.** `PRD-ACS-012`; `POL-02.14`, `POL-09.20`, `POL-09.25`–`POL-09.26`, `POL-10.09`, `POL-12.07`; `POL-13.16` retired and moved to policy 9; stage 5 questions and phase pass references.

## DEC-022 — Validate stage 6 plans against current rules and held-out evidence

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** six-stage chat choices
- **Question.** What planning and workforce approach should stage 6 use?
- **Options.** Invent default pay/incentive and forecast values · Start from validated current rules and evaluate forecasts against a baseline and operational outcomes.
- **Choice.** Use existing validated pay, leave and overtime rules by employer/state/group and verify current incentive schemes against examples. Set replenishment horizon from lead time plus review cycle and buying horizon from the seasonal plan. Evaluate on held-out data against a simple baseline and stockout/excess outcomes. Configure payroll only where applicable. CA approves category-specific asset policy; actual rates, rules, data and thresholds remain open.
- **Why.** Stage 6 can be designed around real validated inputs without turning synthetic examples into defaults.
- **Changed.** `POL-13.15`, `POL-15.08`; stage 6 questions.

## DEC-023 — Piece tracking becomes binding at each Store's switch

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** review of DEC-017 to DEC-022, finding 1
- **Question.** Piece-tracked goods must be sold by piece ID (`PRD-MER-016`), but the parallel-run import (`PRD-LIF-013`) and EBO brand-software imports (`PRD-EBO-005`) report sales by barcode or SKU. Which piece was sold is unknown.
- **Options.** Piece tracking binds at each Store's switch; before it, imports change SKU quantity only · Imports change SKU quantity and leave an unresolved piece until the next count.
- **Choice.** Binding at the switch. Before a Store's switch, imported sales and returns change SKU quantity and name no piece. At the switch count, every piece of a piece-tracked profile is labelled and verified; piece rules apply from then on. An EBO Store reporting through brand software holds piece-tracked goods as SKU quantity until it bills in Apparel OS.
- **Why.** The stock ledger needs no "unresolved piece" state, and the switch count already touches every piece.
- **Changed.** New `PRD-MER-017`, `PRD-LIF-025`, `PRD-EBO-011`; `phases.md` switch-over.

## DEC-024 — Shadow stock for the parallel run

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** review of DEC-017 to DEC-022, finding 2
- **Question.** The daily comparison with the earlier POS's SOH (`PRD-LIF-014`) has nothing to compare against: opening stock becomes official only at the switch (DEC-013), so imported sales of older stock would drive quantities negative.
- **Options.** Load the earlier POS's SOH as unofficial shadow stock per Store · Compare daily movements only and drop the balance check.
- **Choice.** Shadow stock. At the start of the run, load the earlier POS's SOH as each Store's shadow stock. Imported sales reduce that Store's official stock of the SKU first, then its shadow stock, so goods received during the run and sold by the earlier POS do not show as a loss at the switch. Imported returns add to shadow stock. Shadow stock is never official stock, value, PT coverage or sellable stock. The verified switch count replaces it, and every difference is reported.
- **Why.** Drift is caught every day, not on switch day, without making unverified quantities official.
- **Changed.** PRD "Words used": new Shadow stock; new `PRD-LIF-024`; `PRD-LIF-014`; `phases.md` stage 2 and switch-over.

## DEC-025 — Customer credit goes live in stage 5

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** review of DEC-017 to DEC-022
- **Question.** Customer credit is a stage 4 Tender (DEC-020), but receivables arrive in stage 5. A stage 4 credit sale would have no receivable to post to.
- **Options.** Enable Customer credit in stage 5 with receivables · Build a small receivable in stage 4.
- **Choice.** Stage 5. Also bring the policy table rows for policies 6 and 7 up to date with DEC-020: defective items are assessed, not given a window; policy 7 also sets Customer credit limits and due dates and Bank transfer evidence.
- **Why.** No half-built receivable.
- **Changed.** PRD and policies "Required policy configuration" rows 6 and 7; `phases.md` stages 4 and 5.

## DEC-026 — Clean-ups after DEC-017 to DEC-022

- **Date:** 2 Oct 2026 · **Decided by:** product owner · **Report item:** review of DEC-017 to DEC-022
- **Question.** The review found a duplicate rule, a placeholder ID and changes the entries did not list.
- **Options.** Leave them · Fix them, leaving DEC-017 to DEC-022 as written.
- **Choice.**
  - Retire `PRD-EXC-022`. `PRD-CSH-011` already states the cash-variance rule, and the Accounts approver is a KDPS value already in `POL-02.13`. No DEC added it.
  - List `POL-13.16` as retired in the policies IDs note and remove its placeholder bullet.
  - For the record, DEC-017 to DEC-022 also changed `POL-02.10`, the PRD Tender word, and the policy table rows 2 and 9.
- **Why.** Every change stays traceable to an entry.
- **Changed.** `PRD-EXC-022` retired; PRD and policies IDs notes; `POL-13.16` placeholder removed.
