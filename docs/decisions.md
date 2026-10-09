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
- **Changed.** `POL-04.09`, `POL-05.09`–`POL-05.10`, `POL-09.21`–`POL-09.24`, `POL-10.08`, `POL-17.10`–`POL-17.11`; stage 2 questions. (`POL-09.25` was set by DEC-021; see DEC-081.)

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

> **Follow-up (DEC-067):** Live PRD text now uses "side-by-side test" and Words used defines Switch and Earlier POS; this entry keeps its original wording.

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
- **Follow-up (`DEC-067`).** Shadow stock was superseded by `DEC-030`. Live rule text now uses **side-by-side test** and **Earlier POS**, not "parallel run".

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

## DEC-027 — Host test environments on Railway and Vercel

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** 4.15 Deployment topology
- **Question.** Where do the server, database and front ends run? No document said.
- **Options.** Railway for the backend and database, Vercel for the front ends · One host for everything · Servers in KDPS's office.
- **Choice.** For testing: Railway runs the NestJS server, its pg-boss jobs and PostgreSQL; Vercel serves the web app and the counter PWA. Testing here means synthetic data. Still OPEN for the product owner: hosting for the KDPS parallel run and production; file storage provider; how the in-store local helper and the Tally local gateway reach the server.
- **Why.** Quick to set up for building and testing; the stack itself does not change.
- **Changed.** PRD "Technical platform › Stack": new Hosting row; `AGENTS.md` stack table; alignment report 4.15.
- **Follow-up.** `DEC-028` superseded the Vercel split for KDPS testing. Helper and Tally gateway connectivity is **OPEN** in `deployment.md` D-6 (design proposal only; product owner, `DEC-070` batch).

## DEC-028 — Run the KDPS side-by-side test on Railway; switch Stores only on production hosting

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** 4.15 Deployment topology
- **Question.** DEC-027 put the front ends on Vercel and limited test hosting to synthetic data. KDPS will now run the test build beside its current POS. The test plan also had a pilot Store switching mid-test and billing real customers in Apparel OS, which is production use.
- **Options.** Everything on Railway · Keep Vercel for the front ends. And: side by side only, with the switch waiting for production hosting · Switch the pilot Store on the Railway test setup.
- **Choice.**
  - Everything on Railway for testing: server, jobs, PostgreSQL, web app and counter PWA. This replaces the Vercel part of DEC-027.
  - KDPS's side-by-side test runs on this test setup with real KDPS data. The current POS stays the system of record throughout; Apparel OS issues no tax invoice and bills no real customer there.
  - No Store switches on test hosting. The product owner chooses production hosting before the first switch.
- **Why.** Testing stays testing. Real billing, tax invoices and backups that must meet policy 18 belong on hosting chosen for production.
- **Changed.** New `PRD-LIF-026`; PRD and `AGENTS.md` stack Hosting rows; `AGENTS.md` delivery note; `phases.md` stage 4 and "Testing and switch-over"; alignment report 4.15; a KDPS Owner question on test-data hosting.

## DEC-029 — DEC-017 to DEC-022 were agreed with KDPS

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** check of the 37 KDPS Owner questions
- **Question.** DEC-017 to DEC-022 say "Decided by: product owner", but they set KDPS choices in the policies (templates, login controls, WhatsApp summary, cash-first offline pilot, approval workflows and others). Did KDPS agree them?
- **Options.** Ask KDPS to confirm each choice · Record that they were already agreed.
- **Choice.** Record it. DEC-017 to DEC-022 were finalised by the product owner together with a KDPS representative. Those entries stay as written; this entry corrects their "Decided by". The representative's name is OPEN until the product owner adds it. Each policy stays Open until it is signed in its "Signed by, date" line.
- **Why.** The log must show who agreed each KDPS choice.
- **Changed.** Decision log only; the alignment report's summary line. The representative's name is tracked as V-65 in the alignment report (`DEC-085`).

## DEC-030 — The old POS stays outside the app's stock

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** stock-ledger design interview
- **Question.** DEC-024 made old-POS sales move app stock: official stock first, then shadow stock loaded from the old POS's SOH. While the old POS is active it does all real billing, and the app runs beside it only to test the app. Should the old POS's files move app stock at all?
- **Options.** Keep shadow stock and apply old-POS sales and returns to app stock · Leave the old POS outside the app's stock and reconcile at the switch.
- **Choice.** Leave it outside.
  - While the old POS is active, it does all real billing. Nobody scans goods twice. Bills made in the app during the test only test the app.
  - The old POS's end-of-day files (daily sales report and SOH) are loaded for checking and reports only. They never create, reduce or move app stock.
  - At each Store's switch, its verified count is its opening stock. The count is reconciled with the old POS's last SOH, and every difference is reported.
  - This replaces the shadow-stock rule of DEC-024 and the part of DEC-023 about imported sales changing SKU quantity. Piece rules still start at each Store's switch count (DEC-023).
- **Why.** The test checks the app, not a second stock record. The stock ledger needs no state for goods the app never handled.
- **Changed.**
  - PRD "Words used": Shadow stock removed.
  - `PRD-LIF-024` retired. New `PRD-LIF-027` (the switch count is the opening stock, reconciled with the last SOH).
  - `PRD-LIF-013`, `PRD-LIF-014` and `PRD-MER-017` reworded. The PRD IDs note lists the retired ID.
  - `POL-14.01`: "after the parallel run's stock and sales reconcile" → "after the side-by-side test's go/no-go checks pass".
  - `phases.md`: stage 2, "Testing and switch-over" and the go/no-go pass marks.
- **Follow-up (`DEC-067`).** Retired **parallel run** / **test run** in live PRD and policy wording in favour of **side-by-side test** and related Words used entries.

## DEC-031 — Cost rules: moving average, late cost changes, outflows

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** stock-ledger design interview
- **Question.** The PRD supports FIFO and weighted average (`PRD-LED-014`) and asks for the effect of late cost adjustments on goods already sold (`PRD-LED-006`). It did not say which weighted average, how a late cost change splits between stock still held and goods gone, or at what cost a supplier return leaves stock.
- **Options.**
  - Weighted average: moving only · moving and periodic.
  - Late cost change under weighted average: follow the receipt's own units · split by the pool's stock on hand now.
  - Supplier return: the pool's formula cost · that receipt's own cost.
- **Choice.**
  - Moving weighted average only: the average is recalculated each time goods enter the cost pool. Periodic average stays out until a PRD change. If Accounts finds that KDPS uses one today (`POL-09.21`), raise it then.
  - A late cost change follows its goods. Under FIFO it follows the receipt's cost layer; under weighted average, the receipt's own units, which the receipt origin tracks. Units still held change the pool's value; units gone carry their share to cost of goods sold or to the movement that took them. A pool's value never falls below zero; any excess goes with the share for units gone.
  - Every outflow from a cost pool, including a supplier return, leaves at the formula cost. The difference from the supplier's credit is a separate variance. An inflow that undoes an earlier outflow, such as a customer return or found goods matched to a recorded loss, comes back at the cost it left with. This last rule was proposed in the design outline and approved with it.
- **Why.** Moving average gives every sale its cost at once and is KDPS's stated preference (`POL-09.06`). Following the receipt's own units uses tracking the product already keeps (`PRD-STK-004`). One outflow rule is simple to explain and cannot push a pool below zero. The CA still validates these rules with real cases before activation (`POL-09.06`).
- **Changed.** PRD "Words used": Weighted average. `PRD-LED-014` reworded. New `PRD-LED-016` and `PRD-LED-017`.

## DEC-032 — Which receipt origin moves, and count surplus with no origin

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** stock-ledger design interview
- **Question.** Quantity-tracked goods keep their receipt origin through every move (`PRD-STK-004`), but a sale or a count shortage often does not say which origin. A count can also find extra goods whose origin, owner, PT and cost nobody knows.
- **Options.**
  - Which origin: the oldest first · the person picks each time.
  - Count surplus: hold it until explained · give it the latest origin at that place.
- **Choice.**
  - Take the oldest receipt origin at that place first. Where batch or expiry is tracked, take the soonest expiry first.
  - A count surplus with no known origin is custody held as excess, with owner, PT coverage and cost unknown. It becomes available only when an approver links it to a recorded loss, which is then reversed with that loss's origin, owner, coverage and cost; or when its owner is established and a PT for the counted quantity is approved, as for opening stock.
- **Why.** Automatic and quick at the till, and nothing is guessed. Piece-tracked goods need neither rule: the piece ID names the origin.
- **Changed.** New `PRD-STK-013` and `PRD-STK-014`.

## DEC-033 — Stock-ledger words

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** stock-ledger design interview
- **Question.** The stock-ledger design needs words the PRD uses but never defines (movement, receipt origin, cost pool) and one it does not use yet (cost layer). A new word goes into "Words used" before any other document uses it.
- **Options.** Add them to "Words used" · Define them only in the design.
- **Choice.** Add them, as the documents index requires.
- **Changed.** PRD "Words used": new Cost layer, Cost pool, Movement and Receipt origin.

## DEC-034 — Undoing a mistaken inflow, and late-cost excess

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** stock-ledger review, open questions SL-12 and SL-13
- **Question.** Two value cases had no rule.
  - A mistaken inflow (a wrong receipt count, opening row, cost established or cost adjustment) is found after the pool has moved on. What value comes off when it is reversed?
  - A late cost cut can be larger than the pool can absorb while all the receipt's units are still held. `PRD-LED-016` sent any excess "with the share for units gone", but none are gone.
- **Options.**
  - Reversal: the mistake's own value · today's formula cost, like any outflow.
  - Excess with nothing gone: to cost of goods sold as its own line · held as an exception for Accounts to decide each time.
- **Choice.**
  - A reversal of an inflow made in error takes off the value that inflow added. Any part that would take a cost pool below zero is shown as a separate variance. Example: 10 pieces at ₹100.00 counted, only 8 arrived; the reversal takes off ₹200.00. If nothing was sold since, stock value comes out exactly right; the formula cost would not.
  - When none of the receipt's units are gone, the excess goes to cost of goods sold as its own line, because earlier outflows were costed too high.
- **Why.** Undoing a mistake should remove what the mistake added. The excess belongs to goods already costed out, and an automatic rule avoids a manual case for a rare event. Accounts and the CA map both accounts and validate the rules (`POL-09.06`).
- **Changed.** `PRD-LED-016` and `PRD-LED-017` reworded. New `PRD-LED-018`.

## DEC-035 — A counted piece the ledger shows as gone

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** stock-ledger review, open question SL-16
- **Question.** A count finds piece A, but the ledger shows A as sold, returned to its supplier or disposed of. Usually the cashier scanned A while the customer took piece B of the same SKU, so B is the one missing.
- **Options.** Swap the two pieces under approval · treat A as found stock with no known origin and B as a count loss.
- **Choice.** Swap with approval. An approver links A to the movement that wrongly named it. A correction record swaps A with the piece of the same SKU that actually left. A comes back with its own history, PT coverage and cost; the bill or other document never changes. With no matching missing piece, or a different SKU, A is held and an exception is raised.
- **Why.** A keeps the history and PT it already has, so it needs no new PT before it can be sold, and the record shows what really left.
- **Changed.** New `PRD-STK-015`.

## DEC-036 — Transfers: only a quantity increase is material

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-03 (decision pack, 3 Oct 2026)
- **Question.** `PRD-TRF-010` requires renewed approval for changed items, increased quantity or a changed destination, but `POL-02.12` and `POL-05.03` treated any quantity change as material. Is a cut to an approved transfer a new approval?
- **Options.** A: the PRD wins; narrow the policies for transfers only (an increase is material, a reduction is not) · B: change `PRD-TRF-010` so a reduction before dispatch also needs renewed approval.
- **Choice.** A. For transfers only, an increase in quantity, a change of item or a change of destination is material; a reduction before dispatch is not. Other actions keep "any quantity change" as material. A smaller dispatch leaves the remainder reserved (`PRD-TRF-010`). No PRD text changes.
- **Why.** It fixes the lower document to match the higher one and touches no PRD rule.
- **Changed.** `POL-02.12`, `POL-05.03`.

## DEC-037 — Exception routing uses POL-02.16 alone

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-04 (decision pack, 3 Oct 2026)
- **Question.** `POL-02.16` routes stock to Operations, money to Accounts and supplier matters to Booking, but `POL-03.05` added Warehouse and `POL-16.05` added Store Manager as exception owners.
- **Options.** A: keep `POL-02.16` as the one routing home and point `POL-03.05` and `POL-16.05` at it · B: add Warehouse and Store Manager to `POL-02.16` as routing targets.
- **Choice.** A. `POL-02.16` is the only routing home. `POL-03.05` and `POL-16.05` read "owner as routed under `POL-02.16`". `POL-02.16` and `PRD-REC-010` are unchanged. Warehouse and Store Manager get no exception-owner role until the product owner says so. Owner names and due times stay OPEN (KDPS Owner, V-03; blocks stage 1 exception routing and stage 2 source conflicts).
- **Why.** One home is simpler and invents no new owner role.
- **Changed.** `POL-03.05`, `POL-16.05`.

## DEC-038 — Day-close cash variance follows PRD-CSH-011

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-47 (decision pack, 3 Oct 2026)
- **Question.** `POL-02.13` said the Store Manager approves within a limit and Accounts above it, but no decision entry records that split or a KDPS source for it (`DEC-008`, `DEC-020`, `DEC-026`). `PRD-CSH-011` is role-neutral.
- **Options.** A: reword `POL-02.13` to follow `PRD-CSH-011` · B: keep `POL-02.13` and log the Store Manager and Accounts split with its source (only if the product owner confirms the source).
- **Choice.** A, because no KDPS source for the split is confirmed. `POL-02.13`: within the configured cash-variance tolerance, the approver set for that tolerance approves; above it, a higher approver approves and the difference becomes an owned exception; no difference is written off automatically. Tolerances, approver sets and named approvers are OPEN (KDPS Owner and Accounts, V-38; blocks stage 4 day close). The `DEC-026` statement that Accounts is "a KDPS value already in `POL-02.13`" no longer holds.
- **Why.** The policy must not carry a role split that no decision or KDPS source backs.
- **Changed.** `POL-02.13`; `questions-for-kdps.md` item 25; `personas.md` (P-ACC and P-STM approval notes).

## DEC-039 — No-bill return limits use documented valuation

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-55 (decision pack, 3 Oct 2026)
- **Question.** `PRD-ACS-015` gave bill value as the limit basis for no-bill returns, which have no bill. `POL-07.06` says use documented, evidenced valuation, not MRP; `PRD-ACS-016` says unknown value is never zero.
- **Options.** A: bill value for discounts and bill-backed refunds, documented valuation for no-bill returns · B: limit no-bill returns by quantity and keep valuation only for store credit.
- **Choice.** A. `PRD-ACS-015`: bill value for discounts and bill-backed refunds; documented valuation under the no-bill policy for no-bill returns; if no valuation is accepted the value is unknown and `PRD-ACS-016` applies. `POL-07.06` cross-refers to it. Partly supersedes `DEC-009` for no-bill returns only. The valuation method and limit amount stay OPEN (KDPS Owner, V-02; blocks stage 4 returns).
- **Why.** A valuation is needed anyway to price the store credit or exchange, so the limit can use it.
- **Changed.** `PRD-ACS-015`, `POL-07.06`.

## DEC-040 — Phone and WhatsApp approvals need POL-02.22

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-57 (decision pack, 3 Oct 2026)
- **Question.** `PRD-ACS-012` binds approval links to the exact record version, but no `POL-02` bullet or PRD policy-2 row says which action types may use them (`POL-02.14` is only the daily summary).
- **Options.** A: add a new bullet `POL-02.22` with an allowlist and add the item to the PRD policy-2 row · B: add no bullet and keep question 31 (V-60) as the only home.
- **Choice.** A. New `POL-02.22`: phone and WhatsApp approval links only for explicitly allowlisted action types. The allowed types are OPEN (KDPS Owner, V-60; blocks stage 5). The PRD policy-2 row lists them. Question 31 and B-8 point at `POL-02.22`.
- **Why.** Nothing is on by default (`PRD-SEC-017`), and a policy-dependent action needs a signed home before it goes live.
- **Changed.** New `POL-02.22`; PRD "Required policy configuration" policy-2 row; `questions-for-kdps.md` item 31; `alignment-report.md` B-8 and V-60.

## DEC-041 — Self-service via role assignment only

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-09 (decision pack, 3 Oct 2026)
- **Question.** `personas.md` said staff self-service "comes with an employee record", but `PRD-ACS-002` and `PRD-ACS-003` say only role assignments grant access.
- **Options.** A: self-service is a permission on a role assignment, limited to the person's own records; fix the design text · B: add an employee-record baseline to the PRD.
- **Choice.** A. Self-service is granted only through a role assignment scoped to the person's own records. No PRD or policy change. Which template or assignment carries it is OPEN (product owner; blocks stage 1 access and stage 6 HRMS self-service).
- **Why.** The PRD already says it, so only the lower document changes.
- **Changed.** `personas.md` (section 4 "Every employee" row, open items); `ui-blueprint.html` (self-service note).

## DEC-042 — Partner users and service identities in the PRD

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-79 (decision pack, 3 Oct 2026)
- **Question.** `personas.md` and `design-language.md` 6C drew partner users and service identities as settled, but `PRD-FRN-001`, `PRD-ACS-002`, `PRD-SEC-007` and `PRD-INT-007` do not name them.
- **Options.** A: confirm the design reading in the PRD, with no new persona · B: keep both provisional and OPEN in the design.
- **Choice.** A. Partner staff are users who hold Store personas on their authorised Stores only, with statement and ledger access from role assignments (`PRD-FRN-007`). Service identities are non-human actors with their own audit identity, scoped credentials and least-privilege access, and no operator screens (`PRD-SEC-018`). No persona is added. What partners see in statements and ledgers stays OPEN (KDPS, policies 2 and 12; stage 5).
- **Why.** The reading fits `PRD-ACS-002`, and stage 1 needs service identities for integrations and audit.
- **Changed.** New `PRD-FRN-007` and `PRD-SEC-018`; `personas.md` (section 4 partner and service-identity rows, X-SVC row) and `design-language.md` 6C Partner now cite them.

## DEC-043 — Higher authority uses the limit ladder

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** C-07 (decision pack, 3 Oct 2026)
- **Question.** `PRD-TRF-005` requires "independent higher-authority approval", while `POL-02.07` and `PRD-ACS-006` say only "a different authorised person". Nothing defines "higher".
- **Options.** A: "higher" means a different person whose authority covers the transfer on its cost basis, using the existing limits (`PRD-ACS-015`, `POL-02.09`) · B: a set rank above the preparer's role, order OPEN with the KDPS Owner.
- **Choice.** A. Higher authority is a different person whose approval limit covers the action on its value basis. New "Higher authority" row in the PRD "Words used"; `PRD-TRF-005` is unchanged; `POL-02.07` adds a transfer clause. No ranking is invented. Limits and approvers stay OPEN (KDPS Owner, V-02; blocks stage 1 live approvals and the stage 3 transfer flow).
- **Why.** It reuses the limit ladder that already exists.
- **Changed.** PRD "Words used" (new Higher authority row); `POL-02.07`; `personas.md` (P-OPS approval note); `alignment-report.md` E-8.

## DEC-044 — Stage 1 fixes the recording rules; later stages record from their first live operation

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-01 (decision pack, 3 Oct 2026)
- **Question.** `PRD-STG-002` says each stage records its stock and money effects "from the start"; `phases.md` and `AGENTS.md` (Delivery) say "from its first live/enabled operation", and the `phases.md` "from day one" headings sit on stage 1 ("None are live") and stage 5 ("No new kinds").
- **Options.** A: reword `PRD-STG-002` to "from its first enabled operation" · B: leave the PRD as it is, read it with its stage table, and reword `phases.md` and `AGENTS.md` to match.
- **Choice.** B. `PRD-STG-002` is read as: stage 1 fixes the stock and money recording rules; each later live operational stage records its effects from its first enabled operation; stage 5 extends those records into full accounting. No PRD or policy text changes. No value is invented.
- **Why.** The PRD already works when read with its stage table, and a lower document is fixed to match a higher one.
- **Changed.** `phases.md` (stage 1 "Stock and money records" paragraph); `AGENTS.md` (Delivery sentence). No PRD or policy change.

## DEC-045 — "Needed by stage" means the earliest stage any value is needed

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-10 (decision pack, 3 Oct 2026)
- **Question.** The PRD "Required policy configuration" table and the `kdps-policies.md` table say policies 2, 4 and 9 are "needed by 1", but some of their values are needed at stages 2, 3 and 4 in the alignment report.
- **Options.** A: add one sentence to the table note in the PRD and in `kdps-policies.md` saying "Needed by stage" is the earliest stage at which any value of the policy is needed · B: split the rows for policies 2, 4 and 9 per value, using only stages already in the V-items.
- **Choice.** A. "Needed by stage" is the earliest stage at which any value of that policy is needed. Each value's own stage stays in the alignment report (section 5). Table rows and stage numbers are unchanged; no value is added.
- **Why.** It is a small wording fix, and copying per-value stages into the PRD would let them drift from the report.
- **Changed.** `prd.md` (note under "Required policy configuration", no ID); `kdps-policies.md` (note above the policy table, no ID).

## DEC-046 — Statutory applicability: stage named for each part

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-12 (decision pack, 3 Oct 2026)
- **Question.** The PRD Statutory applicability row and `kdps-policies.md` table row 10 read "2; e-invoice by 4, TDS by 5, payroll by 6", so movement documents and invoice-number format read as stage 2, while `phases.md` puts movement documents at stage 3 and V-40 and CA question 4 put the bill-number format at stage 4.
- **Options.** A: name the stage for each part in the PRD row and policy row, using stages already in the documents · B: keep "2" for these parts and change the lower documents to stage 2.
- **Choice.** A. Registration, goods/rate classification and sale-or-return tax stay at stage 2; movement documents by stage 3; invoice-number format and e-invoice by stage 4; e-way creation by stage 5; TDS by stage 5; payroll by stage 6. Any different stage for a part is OPEN (owner: product owner) until named. `POL-10.07` text is unchanged.
- **Why.** The bill-number format is used only when a bill is issued in stage 4, so asking the CA for it at stage 2 adds no safety.
- **Changed.** `prd.md` (Statutory applicability row of "Required policy configuration"); `kdps-policies.md` (table row 10).

## DEC-047 — Old-POS imports are not incentive evidence

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-23 (decision pack, 3 Oct 2026)
- **Question.** `phases.md` stage 6 let incentives use sales evidence "from the parallel-run import", but `PRD-LIF-014` and `PRD-LIF-010` limit earlier-POS data to checking and reports, and `PRD-HRM-011` names only POS and approved EBO evidence.
- **Options.** A: fix `phases.md` so incentives use stage 4 bills or approved EBO imports only · B: allow old-POS data to feed incentives, which needs changes to `PRD-LIF-014`, `PRD-LIF-010` and `PRD-HRM-011` and a policy home.
- **Choice.** A. Incentives need sales evidence from stage 4 bills or approved EBO imports (`PRD-HRM-011`). Old-POS imports are not incentive evidence. No PRD or policy text changes.
- **Why.** Paying incentives is a money effect, and A follows the PRD without inventing anything.
- **Changed.** `phases.md` (stage 6, "Order inside the stage"). No PRD or policy change.

## DEC-048 — Business measures are recorded during the side-by-side test, with no duration

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-42 (decision pack, 3 Oct 2026)
- **Question.** The PRD "Business measures" intro said each measure's present value is recorded "during the first month of the test run", which writes a duration into the PRD while the run length is OPEN (KDPS Owner, before the side-by-side test; questions-for-kdps.md KDPS Owner 38).
- **Options.** A: reword to "during the side-by-side test", with no duration · B: keep a measuring window and say its length is set by the KDPS Owner and stays OPEN.
- **Choice.** A. The present value of each measure is recorded during the side-by-side test. The PRD sets no duration. The run length stays OPEN (owner: KDPS Owner; blocks the stage 2 test run).
- **Why.** It is shorter and cannot go wrong if the run is shorter than a month.
- **Changed.** `prd.md` ("Business measures" intro sentence, no ID). No policy change.

## DEC-049 — Go/no-go checks move into policy 14

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-43 (decision pack, 3 Oct 2026)
- **Question.** `POL-14.01` switches a Store "after the side-by-side test's go/no-go checks pass", but only `phases.md`, which sets delivery order only, defines those checks, and "serious exception" has no meaning in the PRD.
- **Options.** A: add a new policy 14 bullet naming the three checks, mark the rest OPEN, and have `phases.md` cite it · B: keep the checks in `phases.md` and add only a policy 14 note that the pass marks are KDPS's to set and sign.
- **Choice.** A. New `POL-14.08` names the three checks: no unexplained material difference at the switch count; all participating staff trained; no serious exception open. OPEN, no value set: run length of the side-by-side test (KDPS Owner, before the side-by-side test); material-difference threshold per Store (KDPS Owner and Accounts, before the first switch); meaning of "serious exception" (KDPS Owner and Operations, blocks stage 4). The way back stays under `POL-14.05` and `POL-14.07`. No PRD change.
- **Why.** A business gate belongs in a signed policy, not in a delivery plan.
- **Changed.** `kdps-policies.md` (`POL-14.08`); `phases.md` (go/no-go pass marks cites `POL-14.08`; run-length row wording); `questions-for-kdps.md` (KDPS Owner 38 cites `POL-14.08`; new KDPS Owner 39 on serious exception and 40 on the earlier POS accepting the PT file).

## DEC-050 — Two business-measure targets marked proposed

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-44 (decision pack, 3 Oct 2026)
- **Question.** The PRD "Business measures" intro says targets marked "(proposed)" await KDPS agreement, but "Tally import rejection: Less than 2%" and "Monthly brand-by-store profit: Fifth working day" carry no marker and no record shows who agreed them; the second also depends on allocation bases that `POL-09.20` leaves unset.
- **Options.** A: mark both "(proposed)" · B: keep them unmarked and log who agreed each, with name and date OPEN with the product owner.
- **Choice.** A. Both targets are marked "(proposed)" and are goals awaiting KDPS agreement, not settings. No target value changes. Accounts is asked to confirm each (stage 5).
- **Why.** No record of agreement was found, so "proposed" is the honest label.
- **Changed.** `prd.md` ("Business measures" rows: Tally import rejection; Monthly brand-by-store profit); `questions-for-kdps.md` (Accounts 12 and 13). No policy change.

## DEC-051 — Offline enabling follows policy 16 only

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-63 (decision pack, 3 Oct 2026)
- **Question.** `phases.md` stage 4 said the offline counter is "enabled after online billing is proven", but `PRD-OFF-001` to `PRD-OFF-019`, `POL-16.01` and AGENTS.md gate offline only on the signed Offline operation policy. "Proven" has no pass mark, length or approver.
- **Options.** Reword `phases.md` to the gates that already exist (signed policy 16 and the stage 4 offline exit check) and drop "proven" · Keep an online-billing-first gate and define its check, owner and stage.
- **Choice.** Option A. Offline enabling follows the signed Offline operation policy (policy 16) and the stage 4 offline exit check only. "Proven" is removed. No PRD or policy text changes and no value is set.
- **Why.** The policy and the exit check already do the job.
- **Changed.** `phases.md` stage 4 offline line.

## DEC-052 — Side-by-side test needs D-4 agreement, not signed policies

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-65 (decision pack, 3 Oct 2026)
- **Question.** `phases.md` allows pre-signature testing "with synthetic data", but the side-by-side test runs on `kdps-test` with real KDPS data (DEC-028). Nothing said whether that test needs signed policies, or KDPS's agreement to hold real data (KDPS Owner question 37; `deployment.md` D-4).
- **Options.** The test is not a live operation, so it needs no signed policies, only the question 37 agreement first · Real-data testing needs signed policies and configured real values first.
- **Choice.** Option A. The side-by-side test is not a live operation: the earlier POS stays the system of record and test bills issue no tax invoice and bill no real customer (`PRD-LIF-026`). It needs the D-4 agreement first and no signed policies. Until KDPS answers question 37, imports keep no customer name or phone number (`PRD-SEC-009`, `PRD-SEC-010`). Gated actions stay disabled until their policies are signed (DEC-071).
- **Why.** Nothing live happens in the test, so a policy signature gates nothing there.
- **Changed.** `phases.md` "Before the test" row of Testing and switch-over. No PRD or policy change.

## DEC-053 — PT export from kdps-test during the test

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-71 (decision pack, 3 Oct 2026)
- **Question.** `deployment.md` says losing test data loses nothing official, but `phases.md` has Apparel OS export the approved PT in the KDPS layout (`PRD-PTW-008`) for the earlier POS to load. If that file comes from `kdps-test`, test output feeds the system of record.
- **Options.** The PT export is used during the test, listed as a file a person loads into the earlier POS with no automatic link · The export is not used during the test and PT entry into the earlier POS stays manual.
- **Choice.** Option A. The approved PT export from `kdps-test` is used during the side-by-side test. A person loads it into the earlier POS manually; there is no automatic link. A PT file already loaded into the earlier POS is that system's record. Whether the earlier POS accepts the file stays OPEN (KDPS Owner, KDPS Owner question 40; blocks the stage 2 test).
- **Why.** It matches `phases.md`, which already assumes the export.
- **Changed.** `deployment.md` (section 4 backup sentence; new outbound-files section); `phases.md` Testing and switch-over Rules line; `questions-for-kdps.md` KDPS Owner question 40. No PRD or policy change.

## DEC-054 — Profile to piece-tracked via labelling count

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** C-12 (decision pack, 3 Oct 2026)
- **Question.** `PRD-MER-014` sets tracking per profile and `POL-04.09` lets other categories be selected, but `PRD-MER-017` and `PRD-LIF-025` start piece rules only at a Store's switch count. Nothing said what happens to stock held as quantity when a profile later becomes piece-tracked.
- **Options.** Allow the change only through a labelling count of every piece of that profile at each Site · Allow no change for a profile with stock; the change applies only to goods received after it, with date and limit OPEN with the product owner.
- **Choice.** Option A. Changing a profile from quantity-tracked to piece-tracked applies only through a labelling count: count, label and verify every piece of that profile at each Site. Piece rules start from that count. `PRD-MER-014`, `PRD-MER-017` and `PRD-LIF-025` keep their IDs.
- **Why.** It reuses the rule already in `PRD-LIF-025` and leaves no mixed stock.
- **Changed.** New `PRD-MER-018`; `POL-04.09` (pointer to `PRD-MER-018`); `design/ui/README.md` (PRD ID range now to `PRD-MER-018`).

## DEC-055 — Putaway stage 2; general location moves stage 3

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** C-13 (decision pack, 3 Oct 2026)
- **Question.** `stock-ledger.md` section 2.3 lists "Location move" as stage 2, while `phases.md` puts "within-Site moves" (`PRD-STK-005`) in stage 3 and putaway (`PRD-REC-022`) in stage 2.
- **Options.** Confirm the reading: stage 2 putaway uses the location-move movement and general within-Site move screens arrive in stage 3 · Move general within-Site moves into stage 2 and edit the `phases.md` stage 2 and 3 scope.
- **Choice.** Option A. Putaway at the selling Site (stage 2) uses the location-move movement; general within-Site move screens (floor, backstore, rack, bin) are stage 3. No PRD, policy or `phases.md` scope change.
- **Why.** It keeps stage 2 small and needs no scope change.
- **Changed.** `stock-ledger.md` section 2.3 (Location move row and stage column).

## DEC-056 — PRD-UXP-004 lists capabilities, not menu labels

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-40 (with C-10) (decision pack, 3 Oct 2026)
- **Question.** `PRD-UXP-004` named Store areas (Billing, Bills, Till & Sync, Receive Goods, Transfers, Stock, Offers, Money, Reports, staff self-service), while the blueprint and `personas.md` use working menu labels (Sell, Stock Count, Damage & supplier returns, External sales and others). Stock Count, Damage and External sales were in no PRD Store list. Both design documents marked this OPEN.
- **Options.** Rename the design menus to the PRD names, leaving Stock Count, Damage and External sales with no Store menu entry · `PRD-UXP-004` lists capabilities and areas, not menu labels; Sell groups Billing, Bills and Till & Sync; the PRD wording adds counts, damage and supplier returns, and external sales.
- **Choice.** Option B (the N-40 option B, which is C-10's option A). `PRD-UXP-004` now lists the operational areas a Store user needs, including stock and counts, damage and supplier returns, and external sales imports, and says it names capabilities and areas, not menu labels. Design menus keep their working labels. C-10's own pick (rename the menus) clashed with this; on 3 Oct 2026 the product owner confirmed this rule instead.
- **Why.** Counts and damage must stay reachable for Store users, and the design groups them sensibly.
- **Changed.** `PRD-UXP-004`; `personas.md` (menu-label note; OPEN row removed); `ui-blueprint.html` (gap G27 marked settled). No policy change.

## DEC-057 — PRD-TAX-004 delivered in stage 4

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** X-05 (decision pack, 3 Oct 2026)
- **Question.** `PRD-TAX-004` (keep tax-document issue, cancellation or correction, and operational reversals distinct) sat in no stage. Stage 4 delivers returns, exchanges and refunds against tax invoices, `design-language.md` section 7 mentions a tax-invoice cancellation state its state table lacks, and `POL-10` had no answer on the tax-document treatment of a customer return.
- **Options.** Place it in stage 4 with returns, in scope and exit checks · Place it in stage 5 with an explicit interim rule for stage 4 returns, OPEN with the product owner and CA.
- **Choice.** Option A. Tax-document cancellation and correction (`PRD-TAX-004`) is delivered in stage 4. `PRD-TAX-004` keeps its text. New `POL-10.11` records that the credit-note and tax-document cancellation treatment of customer returns is to be confirmed by the CA. That treatment is OPEN (CA; blocks stage 4). No value is set.
- **Why.** Stage 4 creates the returns that need it.
- **Changed.** `phases.md` stage 4 scope; new `POL-10.11`; `prd.md` Required policy configuration, Statutory applicability row (cites `POL-10.11`); `questions-for-kdps.md` CA question 7 (Return credit notes).

## DEC-058 — Hindi for stage 6 screens in stage 6

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** X-08 (decision pack, 3 Oct 2026)
- **Question.** `PRD-PRO-009` requires English and Hindi interfaces with no stage. `phases.md`, AGENTS.md, `ui/README.md` and `design-language.md` put the Hindi interface in stage 5 for "the screens already built", so stage 6 screens (check-in, targets, incentives, payslips, self-service, planning) had no Hindi step.
- **Options.** Hindi follows each stage's screens, and stage 6 gets its own Hindi step after its screens are built · Keep one Hindi step in stage 5 and name one later step for all later screens, timing OPEN with the product owner.
- **Choice.** Option A. Hindi for the screens built in stages 1 to 5 arrives in stage 5. Hindi for stage 6 screens arrives in stage 6. WhatsApp and SMS messaging stay in stage 5. No PRD or policy change, because `PRD-PRO-009` names no stage.
- **Why.** Staff payslips and targets are the screens that most need Hindi.
- **Changed.** `phases.md` ("How the stages are cut" Hindi bullet); `AGENTS.md` Delivery paragraph; `design/ui/README.md`; `design-language.md` section 12 (two Hindi rows).

## DEC-059 — Interim unavailable for unlinked returns after switch

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-20 (decision pack, 3 Oct 2026)
- **Question.** `SL-10` in the stock ledger keeps an EBO return not linked to its imported sale, and a return of an earlier-POS bill after a Store's switch, unavailable. `PRD-EBO-005` applies approved EBO returns to stock and `POL-06.02` gives a 15-day return window, so for 15 days after each switch a customer with an earlier-POS bill cannot return in the app.
- **Options.** Allow these returns in the app, each with a documented cost source (OPEN; would change `PRD-LIF-010` and `PRD-LIF-015`) · Keep them unavailable for now, as a named exception to `POL-06.02` for the window after each switch.
- **Choice.** Keep them unavailable in the app for now. `POL-06.02` carries the exception until a later plan is approved. `PRD-EBO-005` is unmet for these returns until then. How the customer is served meanwhile is OPEN (owner: product owner); it blocks stage 4, in particular the first Store switch. No-bill returns are unchanged (`PRD-RET-017`, `POL-07.08`).
- **Why.** It needs no cost source and does not change `PRD-LIF-010`; allowing them can follow in the later data-import plan.
- **Changed.** `POL-06.02` (exception noted); `docs/design/stock/stock-ledger.md` SL-10. No PRD ID changed.

## DEC-060 — PRD-LED-011 follows Official book policy

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-24 (decision pack, 3 Oct 2026)
- **Question.** The PRD "Words used" entry for Tally (as changed by `DEC-010`) says the Official book policy sets whether Tally is the official book, but `PRD-LED-011` says "Tally remains the official book until an authorised accounting-book transition".
- **Options.** Reword `PRD-LED-011` (and the Official book policy row) to follow the Official book policy · Keep `PRD-LED-011` and change "Words used" to say Tally is the official book.
- **Choice.** Reword. `PRD-LED-011` now reads: the official book is the one the Official book policy names, until an authorised accounting-book transition. `POL-11.01` to `POL-11.03`, `PRD-LED-012` and `PRD-INT-008` stand as they are.
- **Why.** It finishes what `DEC-010` started: no KDPS values in the PRD.
- **Changed.** `PRD-LED-011` in `docs/prd.md`.

## DEC-061 — Stock-count accuracy without tolerance-as-match

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-27 (decision pack, 3 Oct 2026)
- **Question.** The PRD Business measures row "Stock-count accuracy" counts pieces matching the system "within the configured tolerance", but `PRD-STK-012` and `DEC-008` say a tolerance only selects the approver.
- **Options.** Reword the measure to pieces equal to the system quantity, with differences tracked by approver tier · Keep the measure and let a tolerance define "matching" for reporting only.
- **Choice.** Reword. The measure is pieces equal to the system quantity at a count divided by pieces counted, for each operating unit; differences are tracked by approver tier. The 98% target stays "(proposed)"; Operations re-confirms it under the new wording. No new target is added.
- **Why.** It keeps tolerance with one job, as `DEC-008` says.
- **Changed.** PRD Business measures, "Stock-count accuracy" row, in `docs/prd.md`. `PRD-STK-012` unchanged.

## DEC-062 — Offline manager approval is online-only

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-37 (decision pack, 3 Oct 2026)
- **Question.** `PRD-OFF-016` and `POL-16.03` say actions needing fresh approval require online authority, yet the till design greys F6 Return offline but keeps F7 Manager approval live. `PRD-OFF-004` blocks finalisation on an expired working set, but the design has a state only for expired authority.
- **Options.** Treat an above-limit discount or price approval as needing fresh approval, so F7 is online-only · Allow it offline (how a manager is checked offline would be OPEN, and `PRD-OFF-016` or `POL-16.03` would need a carve-out).
- **Choice.** F7 Manager approval is online-only: greyed "online only" while the till is offline, and a bill needing that approval cannot be finalised offline. `PRD-OFF-016` and `POL-16.03` stand as written. Separately, a "Working set expired" blocked state is added beside "Authority expired" (`PRD-OFF-004`); its duration is OPEN (see `DEC-064`).
- **Why.** It follows the rule as written and invents no new mechanism.
- **Changed.** `docs/design/ui/design-language.md` section 6B (function bar, Manager approval (F7), Working set expired state and state-pill list) and its proposed-states table. No PRD or policy ID changed.

## DEC-063 — Gift-voucher tax home in policy 10

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-53 (decision pack, 3 Oct 2026)
- **Question.** `PRD-RET-020` and `DEC-006` say voucher tax follows the Statutory applicability policy (policy 10), but no policy 10 bullet mentions vouchers; the tax question sat under `POL-07.10`, which does not list tax.
- **Options.** Add a policy 10 bullet for gift-voucher tax and re-point the CA question and V-30 to it · Leave tax under policy 7 and reword `PRD-RET-020` to point at policy 7.
- **Choice.** Add `POL-10.10`: gift-voucher tax on issue and redemption remains to be confirmed by the CA. `POL-07.10` cross-refers to it. `PRD-RET-020` is unchanged. No tax value is set; the treatment is OPEN (owner: CA; blocks stage 4).
- **Why.** It keeps `DEC-006`'s "tax via policy 10" and changes only lower documents.
- **Changed.** New `POL-10.10`; `POL-07.10` cross-reference in `docs/kdps-policies.md`; `docs/questions-for-kdps.md` CA question 6 (now cites `POL-10.10`).

## DEC-064 — Working-set validity in policy 16

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-54 (decision pack, 3 Oct 2026)
- **Question.** `PRD-OFF-004` needs a defined validity time for the cached working set, but only the 24-hour authority renewal (`PRD-OFF-003`, `POL-16.01`) is defined, and neither the Offline operation row nor `POL-16.01` to `POL-16.06` mentions it.
- **Options.** Add working-set validity time to the Offline operation row and a new policy 16 bullet, marked OPEN · Do not make it a setting and state in `PRD-OFF-004` that the working set lasts as long as the device authority.
- **Choice.** Make it a policy setting. The PRD "Offline operation" row now lists working-set validity time, and new `POL-16.07` says it remains to be configured. The value stays OPEN (owners: KDPS Owner and Operations; blocks stage 4). `PRD-OFF-004` is unchanged.
- **Why.** It gives the missing value a home without choosing it.
- **Changed.** PRD "Required policy configuration", Offline operation row, in `docs/prd.md`; new `POL-16.07` in `docs/kdps-policies.md`; `docs/design/ui/design-language.md` section 6B (the "Working set expired" state cites `POL-16.07`, duration OPEN).

## DEC-065 — Store-credit and loyalty settings answered in policy 7

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-56 (decision pack, 3 Oct 2026)
- **Question.** The PRD row "Customer returns" (policy 6) lists "Store-credit and loyalty settings" (Owner, Operations), but the answers live only in `POL-07.09`, `POL-07.11` and `POL-07.13`; policy 6 has no bullet on either.
- **Options.** Add one pointer bullet to policy 6 saying these settings are answered in policy 7, and keep the PRD rows · Remove them from the policy 6 row and add loyalty to the policy 7 row in the PRD.
- **Choice.** Add `POL-06.08`: store-credit and loyalty settings are answered in policy 7; Operations confirms them there. It carries no values. Both PRD rows are unchanged. Loyalty stays OPEN (owners: KDPS Owner and Accounts, as in alignment report B-6; blocks stage 4).
- **Why.** It edits lower documents only and keeps loyalty in the PRD table.
- **Changed.** New `POL-06.08` in `docs/kdps-policies.md`.

## DEC-066 — Business-unit moves and approval value recheck

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-85 (decision pack, 3 Oct 2026)
- **Question.** Stock-ledger 7.1 calls a business-unit move a "location move", but `PRD-STK-005` limits location moves to floor, backstore, rack and bin and no movement kind covers a unit change (`PRD-ORG-005`, `PRD-TRF-023`). The Custody row in section 3 omits several movement kinds. Nothing says whether a cost that changes under lock at posting needs renewed approval (`PRD-ACS-007`, `POL-02.12`).
- **Options.** Add a new "business-unit change" movement kind · Allow a unit change as a location move only when book, legal entity and tax registration are unchanged, and send everything else through the transfer or pool-move route.
- **Choice.** The second option, adding no new movement kind. When the book differs, use the pool-move route (7.8); when the legal entity differs, use the commercial or inter-entity process (`PRD-FRN-006`). A registration-only change at one Site is raised against `PRD-TRF-023` and stays OPEN (owner: product owner). The Custody row is rewritten from the section 2.3 kinds. If cost under lock exceeds the approver's limit or the approved amount, posting is refused and the record returns for renewed approval (`PRD-ACS-007`, `POL-02.12`); any tolerance for small cost drift stays OPEN (owner: product owner or KDPS Owner), with no number written.
- **Why.** It adds no new movement kind and keeps the rule that an approval binds to its approved value.
- **Changed.** `docs/design/stock/stock-ledger.md` section 3 (Custody row), section 7.1 (business-unit move bullet) and section 10.4 (value recheck). No PRD or policy ID changed.

## DEC-067 — Side-by-side test vocabulary

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-88 (decision pack, 3 Oct 2026)
- **Question.** `PRD-LIF-012`, `-013`, `-014` and `-016` say "parallel run"; `PRD-LIF-026`, `POL-14.01` and `phases.md` say "side-by-side test"; the Business measures intro and `AGENTS.md` say "test run". Switch, Switch count, Pilot Store and Earlier POS are not in Words used, and "pilot" means two different Stores (`POL-14.07`, `POL-16.02`).
- **Options.** A: one phrase, "side-by-side test"; add Words used entries for it, Switch, Switch count, Pilot Store and Earlier POS; retire "parallel run" and "test run" in live rule text; `POL-16.02` says "first offline Store" · B: keep "parallel run" for the earlier POS selling on any hosting and define "side-by-side test" as a parallel run on test hosting.
- **Choice.** A. Live PRD and policy text says "side-by-side test" and "earlier POS"; "parallel run" and "test run" are retired from live rule text. Old DEC entries stay as written, with follow-up notes. Whether the earlier POS may keep selling at a Store on production hosting before its switch is **OPEN** (product owner; stage 2 waits); no default is set.
- **Why.** DEC-028 and DEC-030 already moved the documents to "side-by-side test", so one phrase is simpler.
- **Changed.** PRD Words used: new Side-by-side test, Switch, Switch count, Pilot Store and Earlier POS rows; `PRD-LIF-012`, `PRD-LIF-013`, `PRD-LIF-014`, `PRD-LIF-016`; PRD Business measures intro and Delivery intro (wording only); `POL-14.06`; `phases.md` (stage 2, exit check, run-length row); `AGENTS.md` (Delivery); `ui-blueprint.html` (earlier POS wording); follow-up notes on DEC-023, DEC-024, DEC-027 and DEC-030 in `decisions.md`.

## DEC-068 — Billed-retained in Words used

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-89 (decision pack, 3 Oct 2026)
- **Question.** `PRD-POS-018`, `PRD-STK-002` and policy 8 use "billed-retained", but Words used has no row for it, and the stock ledger (6.1) coins its own wording.
- **Options.** A: add a Billed-retained row to Words used and align the ledger to it · B: add no row; treat `PRD-POS-018` as the definition and have the ledger only cite it.
- **Choice.** A. Words used defines Billed-retained as goods paid for but still held in the Store until handover to the customer, for collection or alteration; not a hold; not available for sale or allocation. The wording follows `PRD-POS-018` and `POL-08.02`.
- **Why.** The documents index requires a term to be defined first in Words used, and it costs one table row.
- **Changed.** `stock-ledger.md` 6.1 (Billed-retained paragraph). PRD Words used: new Billed-retained row.

## DEC-069 — Count freeze blocks every movement

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-91 (decision pack, 3 Oct 2026)
- **Question.** `PRD-STK-009` freezes counted items from sale and movement, and Words used counts a change of value as a Movement, but ledger 8.1 let value-only movements post during a count. The ledger also coined book pool, Site pool, Count freeze, Inspection hold and Held-goods reservation, which Words used does not define.
- **Options.** A: keep the carve-out, add the five words to Words used and add a sentence to `PRD-STK-009` · B: remove the carve-out and add no new words; label the ledger terms as kinds of Hold and Reservation and cite `PRD-LED-015` for pools.
- **Choice.** B. The count freeze blocks every movement, including a change of value; a late cost change waits until the count closes. No PRD change. Any later carve-out belongs under the policy 2 item "movement during counts" (decider: product owner with the KDPS Owner).
- **Why.** It adds no new business rule and matches the PRD as written.
- **Changed.** `stock-ledger.md` 8.1 (value-only line removed). No PRD or policy change.

## DEC-070 — Receipt origin, Crore, billing device, capitalisation

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-94 (decision pack, 3 Oct 2026)
- **Question.** `PRD-OFR-008` says "receipt lot" where Words used defines Receipt origin; design-language §8 uses "Cr" and "L" but Words used has only Lakh; `PRD-POS-020` gives the bill series to a "billing device" while DEC-005 and the design say "till" or "counter"; the policies capitalise "Store Manager" and "store credit" differently from the persona label and Words used.
- **Options.** A: one word per thing across the PRD, Words used, policies and design · B: define the loose words as synonyms and leave the bullets and capitalisation alone.
- **Choice.** A. "Receipt lot" becomes "receipt origin". Words used adds Crore (100 Lakh), with L and Cr as display shortcuts, and Billing device as the owner of a bill series. "Company-owned" in `PRD-ORG-010` and `PRD-ORG-015` stays as the ownership contrast. Policy capitalisation follows Words used (Store credit). Whether "company" in `PRD-OFR-002` becomes Organisation is **OPEN** (product owner; blocks no stage). The series-owner wording blocks stage 4.
- **Why.** One word per thing is the rule in `docs/README.md`.
- **Changed.** `PRD-OFR-008`; `POL-06.06`, `POL-06.07`, `POL-07.03`, `POL-07.06` and the policy 6 and 7 question lines (Store credit). PRD Words used: new Crore and Billing device rows; `ui-blueprint.html` receipt-lot wording; `design-language.md` §8 Bill no. row.

## DEC-071 — Gated actions disabled on kdps-test until signed

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-81 (decision pack, 3 Oct 2026)
- **Question.** Design-language §10.17 says a gated action works with synthetic data under a "Test data" chip, but `kdps-test` holds real KDPS data for the side-by-side test (`PRD-LIF-026`). The PRD's Required policy configuration exempts only design, development and synthetic-data tests, so a gated action on real data with an unsigned policy has no rule.
- **Options.** A: the gate holds on `kdps-test`; gated actions stay disabled there until their policy is signed; real data is used only for imports and checks that need no gated action · B: allow gated actions on `kdps-test` as test use, with PRD wording that such use is not live.
- **Choice.** A. On `kdps-test`, gated actions stay disabled until their policy is signed and configured, even though the data is real. On `dev` with synthetic data they may work, under a synthetic-data banner. `kdps-test` shows an environment banner. Banner wording and chip family are left to design after policy signatures. No PRD change.
- **Why.** It needs no PRD change and never lets an unsigned policy act on real KDPS data.
- **Changed.** `design-language.md` §10.17; `phases.md` Testing and switch-over, "Before the test" row. `design-system.html` test-setup note; `ui-blueprint.html` Policy gate row; `deployment.md` §1.

## DEC-072 — Reason list in policy 2

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-83 (decision pack, 3 Oct 2026)
- **Question.** `PRD-ACS-010` requires approve/reject with reasons, but no PRD or policy rule says where the reason list is configured; design-language §12 gives it owner "KDPS" and stage 2, though approvals are stage 1 (policy 2).
- **Options.** A: add the reason list to policy 2 (Permissions and approvals row, new `POL-02` bullet), needed by stage 1 · B: leave it an OPEN design item owned by the KDPS Owner, with a question in `questions-for-kdps.md`.
- **Choice.** A. The approve/reject reason list is a policy 2 item (`POL-02.23`), decided by Owner and Admin and needed by stage 1. The reasons themselves are **OPEN** (owner: Owner and Admin; blocks stage 1).
- **Why.** Reasons are needed for stage 1 approvals, and policy 2 already sits at stage 1.
- **Changed.** New `POL-02.23`; PRD Required policy configuration, Permissions and approvals row; `design-language.md` §12 (Reason list row). `ui-blueprint.html` open item 18a; `questions-for-kdps.md` (reason-list question).

## DEC-073 — PRD-NAV-016 follows PRD-NAV-017

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-28 (decision pack, 3 Oct 2026)
- **Question.** `PRD-NAV-016` says the net-profit steps (`PRD-NAV-014`) govern the Store P&L, but `PRD-NAV-017` (DEC-011) ends the Store P&L at profit before tax.
- **Options.** Reword `PRD-NAV-016` · Leave the PRD and note in DEC-011 that `PRD-NAV-017` wins.
- **Choice.** Reword `PRD-NAV-016`: the definitions govern the monthly Store net-asset-value snapshots; the Store P&L follows `PRD-NAV-017`. `PRD-NAV-014` is untouched because it still applies to a legal entity. No new rule; this is a consistency fix after DEC-011.
- **Why.** DEC-011 already decided the substance, so only the sentence needed fixing.
- **Changed.** `PRD-NAV-016`.

## DEC-074 — Daily summary channel fixed as WhatsApp

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-30 (decision pack, 3 Oct 2026)
- **Question.** `POL-02.14` (DEC-021) and `PRD-EXC-012` fix the 9 PM summary as WhatsApp, but `POL-02.11` and `personas.md` section 3 still list the channel as an unconfigured policy 2 value. The PRD "Permissions and approvals" row reads "daily summary time and recipients" although DEC-010 said it would contain "channels", and no entry logged the removal.
- **Options.** Drop the channel from the unconfigured lists and record why the PRD row dropped "channels" · Put "channels" back into the PRD row.
- **Choice.** The channel is decided (WhatsApp); only recipients are unconfigured. The PRD row dropped "channels" for that reason (recorded here; this entry does not edit the PRD). `POL-02.11` no longer lists the channel. `personas.md` section 3 reads "Recipients are a policy 2 value; channel and time are set (`POL-02.14`)". Recipient names stay **OPEN** with the KDPS Owner (V-51); they block stage 5.
- **Why.** The channel is decided and only the recipients are open.
- **Changed.** `POL-02.11`; `personas.md` section 3.

## DEC-075 — POL-18.03 restore drill cadence proposed

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-41 (decision pack, 3 Oct 2026)
- **Question.** `POL-18.03` says restore drills run "quarterly thereafter" with no decision behind it; `PRD-SEC-012` sets no frequency, and the Policy 18 question and V-63 do not ask for one. The Admin line in `questions-for-kdps.md` pointed at Owner 4 and 5 (Logins, Bulk approval), not Owner 6 (recovery).
- **Options.** Word the cadence as proposed, awaiting sign-off, add the question and fix the pointer · Log who at KDPS agreed "quarterly" (no such agreement is known).
- **Choice.** `POL-18.03` states the quarterly cadence as proposed, awaiting KDPS Owner and Admin sign-off, as `POL-18.01` is worded. The Admin question now points to Owner 4, 5 and 6 and asks how often restore drills run. How often and by whom stays **OPEN** (KDPS Owner and Admin); it blocks stage 1.
- **Why.** It invents no agreement.
- **Changed.** `POL-18.03`; `questions-for-kdps.md` (Admin pointer and cadence question; Owner 6); alignment report V-63.

## DEC-076 — Contra in PRD-LED-012

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-58 (decision pack, 3 Oct 2026)
- **Question.** "Words used" defines Contra as a Tally voucher and `POL-09.25` (DEC-021) maps it, but `PRD-LED-012` does not list contra among the voucher types sent through Tally XML.
- **Options.** Add "contra" to `PRD-LED-012` · Leave the list and say it is not exhaustive.
- **Choice.** `PRD-LED-012` now lists contra: "...payments, receipts, contra, journals and credit/debit vouchers through Tally XML". The Tally XML export includes contra vouchers for same-entity cash and bank transfers, consistent with `POL-09.25`.
- **Why.** The PRD already defines Contra, so listing it is the plain fix and keeps tests and acknowledgment tracking exact.
- **Changed.** `PRD-LED-012`.

## DEC-077 — PRD-OFF-002 aligns with DEC-005

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-62 (decision pack, 3 Oct 2026)
- **Question.** `PRD-POS-020` (DEC-005) gives each device its own bill series per tax registration and financial year, but `PRD-OFF-002` still says "a device-specific financial-year bill series".
- **Options.** Reword `PRD-OFF-002` · Leave it and log that `PRD-POS-020` governs.
- **Choice.** `PRD-OFF-002` now reads "a device-specific bill series for each tax registration and financial year; devices cannot share a live series". The intent does not change.
- **Why.** A till serving two registrations holds two series, and the offline rule should say so.
- **Changed.** `PRD-OFF-002`.

## DEC-078 — Policy 2 tolerance and movement wording

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-92 (decision pack, 3 Oct 2026)
- **Question.** `PRD-STK-012` and `PRD-CSH-011` say a tolerance only selects the approver (above it, a higher approver and an owned exception), but `POL-02.21` says "cost limits"; no Policy 2 answer covers movement while a count is open (`PRD-STK-009`); `POL-02.02` and `POL-02.09` scope roles by "business" where `PRD-ACS-001` says entity, Site and brand; and `POL-02.15` and Owner Q2 say "default approval limits" where the PRD says suggested values are never active defaults.
- **Options.** Five wording edits (tolerance in `POL-02.13` and `POL-02.21`, movement answer, entity/Site/brand, role-level limits) · The same without the "business" change.
- **Choice.** All five edits. `POL-02.21` states the count tolerance as a cost difference (`PRD-ACS-015`, `PRD-STK-012`); above it a higher approver approves and the difference becomes an owned exception. `POL-02.13` already follows `PRD-CSH-011` through DEC-038 and does not reintroduce named roles. New `POL-02.24` keeps counted items and locations frozen during a count (`PRD-STK-009`); who may move frozen items, if anyone, stays **OPEN**. `POL-02.02` and `POL-02.09` say "entity, Site and brand" (`PRD-ACS-001`). "Default approval limits" becomes "role-level approval limits" in `POL-02.15` and Owner Q2; DEC-017 stays as written and this entry records the change. Tolerances, approvers and the movement rule stay **OPEN** (KDPS Owner and Admin); policy 2 blocks stage 1 and the movement rule matters at stage 3. The new bullet is `POL-02.24` because `POL-02.22` and `POL-02.23` were already taken.
- **Why.** The wording now matches the PRD and invents no value.
- **Changed.** `POL-02.02`, `POL-02.09`, `POL-02.11`, `POL-02.15`, `POL-02.21`; new `POL-02.24`; `questions-for-kdps.md` Owner Q2 and Q13; `personas.md` Store Manager card; alignment report 4.8.

## DEC-079 — Policy 6 question reworded for defects

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-99 (decision pack, 3 Oct 2026)
- **Question.** The Policy 6 question asks for a return window "for a defective item", but `POL-06.05` (DEC-020) and DEC-025 say a defective item is assessed with no hard cutoff.
- **Options.** Reword the question · Leave it.
- **Choice.** The question now reads "How many days does a customer have for an ordinary return? How is a defective item assessed?" It asks for no defective-item day count. KDPS's answers stand: 15 days for an ordinary return (`POL-06.02`) and a separate assessment process for defective items (`POL-06.05`); the assessment details remain V-23 (KDPS Owner and Operations; stage 4).
- **Why.** The question must not ask for a number the policy says not to invent.
- **Changed.** Policy 6 question bullet 1 in `kdps-policies.md` (question bullets have no ID).

## DEC-080 — PRD IDs banner reworded

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-100 (decision pack, 3 Oct 2026)
- **Question.** The `prd.md` IDs banner says the number counts bullets "in order", but several sections have bullets out of numeric order (for example `PRD-STK-012` before `PRD-STK-011`), and IDs are never renumbered.
- **Options.** Reword the banner · Leave it and rely on AGENTS.md.
- **Choice.** The banner now says the number is the next free number in that section when the bullet was added; bullets are never renumbered, so page order need not follow the numbers. No ID changes.
- **Why.** The banner must say what is true.
- **Changed.** `prd.md` IDs banner.

## DEC-081 — DEC-018 changed list corrected

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-101 (decision pack, 3 Oct 2026)
- **Question.** DEC-018's "Changed" line lists `POL-09.21` to `POL-09.25`, but `POL-09.25` (Contra) is DEC-021's rule and DEC-018's choice covers only `POL-09.21` to `POL-09.24`.
- **Options.** Add a correcting entry, as DEC-016 and DEC-029 did · Edit DEC-018's "Changed" line in place.
- **Choice.** DEC-018's Changed list reads `POL-09.21` to `POL-09.24`; `POL-09.25` was set by DEC-021. This entry carries the correction, and DEC-018's Changed line carries a pointer to it.
- **Why.** It follows the existing precedent for corrections.
- **Changed.** `decisions.md` only (this entry; the pointer on DEC-018's Changed line). No PRD or policy IDs change.

## DEC-082 — Extended offline online-only list

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** X-01 (decision pack, 3 Oct 2026)
- **Question.** `PRD-OFF-016` and `POL-16.03` name Store-credit redemption as needing online authority but not gift-voucher redemption (`PRD-RET-020`), Customer credit sales (`PRD-POS-022`) or loyalty redemption (`PRD-RET-019`), whose balance or limit lives only online.
- **Options.** Add the three to the online-only list · Say in `PRD-OFF-017` that offline tender recording means cash only until a signed procedure says otherwise.
- **Choice.** `PRD-OFF-016` and `POL-16.03` now also name gift-voucher redemption, Customer credit sales and loyalty redemption as requiring online authority. Which tenders may be recorded offline, and the evidence for them, stay **OPEN** (KDPS Owner and Operations); they block stage 4.
- **Why.** A tender whose balance or limit lives only online is now named, so tests are clear.
- **Changed.** `PRD-OFF-016`; `POL-16.03`.

## DEC-083 — Policy homes for five PRD rules

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** X-02 (decision pack, 3 Oct 2026)
- **Question.** `PRD-RET-008`, `PRD-RET-009`, `PRD-RET-015`, `PRD-EXC-013` and `PRD-PAY-013` depend on something "configured", but no policy bullet switches them on (`PRD-SEC-017`).
- **Options.** Name a policy home for each and add answer bullets, report rows and questions · Log the five as unplaced in the alignment report until stage 4.
- **Choice.** Homes: `PRD-RET-008`, `PRD-RET-009` and `PRD-RET-015` in policy 6 (`POL-06.09` to `POL-06.11`); `PRD-EXC-013` in policy 2 (`POL-02.25`); `PRD-PAY-013` in policy 12 (`POL-12.08`). The PRD "Required policy configuration" rows for policies 2, 6 and 12 name them. Every rule, threshold and authority stays **OPEN** with the owners the PRD rows name (policy 6: Owner, Operations; policy 2: Owner, Admin; policy 12: Owner, Accounts). Stage 4 waits for the first four; stage 5 waits for `PRD-PAY-013`.
- **Why.** Nothing runs without a policy home (`PRD-SEC-017`), and stage 4 needs these.
- **Changed.** New `POL-06.09`–`POL-06.11`, `POL-02.25`, `POL-12.08`; PRD "Required policy configuration" rows for policies 2, 6 and 12; alignment report B-15 to B-19 and V-66 to V-70; `questions-for-kdps.md`.

## DEC-084 — Label printing via local helper

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** X-06 (decision pack, 3 Oct 2026)
- **Question.** The PRD Hardware row covers ESC/POS receipt printing and cash drawer through a local helper, but `PRD-MER-015`, `PRD-REC-020` and `PRD-OFR-004` print labels, price tickets and stickers at warehouses and receiving Stores in stage 2, and `deployment.md` said the helper runs on the counter PC.
- **Options.** The same local helper runs on any PC with a label printer · Treat label printing as an unmet hardware need and use Tauri.
- **Choice.** The same local helper serves receipt printing, cash drawer and label printing on any PC that has the printer (counter, warehouse or office). Tauri stays available only for an unmet hardware requirement. "Words used" ESC/POS is unchanged. Label printer models and the label command language stay **OPEN** (KDPS Operations); they block stage 2.
- **Why.** It keeps the stack as it is.
- **Changed.** PRD Stack Hardware row; `AGENTS.md` Stack Hardware row; `deployment.md` section 6; `questions-for-kdps.md` "Labels and printers".

## DEC-085 — V-65 for KDPS representative name

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** X-10 (decision pack, 3 Oct 2026)
- **Question.** DEC-029 leaves the KDPS representative's name **OPEN** with no stage and no list entry, though every OPEN must name its owner and the stage it blocks.
- **Options.** The product owner adds the name to DEC-029 · Add V-65 to the alignment report and point DEC-029 at it.
- **Choice.** Add V-65, "KDPS representative who agreed DEC-017 to DEC-022 with the product owner": owner product owner, blocks stage 1 (policy 2 signature). DEC-029 points to V-65. The name stays **OPEN** until the product owner supplies it.
- **Why.** It works now, and the name can be filled in later.
- **Changed.** `alignment-report.md` section 5 (V-65); the pointer on DEC-029. No PRD or policy IDs change.

## DEC-086 — Inbound ownership records are delivered in stage 2

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-64 (decision pack, 3 Oct 2026)
- **Question.** `PRD-ORG-017` to `PRD-ORG-019` and `PRD-ACP-020` define inbound ownership records, but neither the PRD stage table nor the policies say which stage delivers them.
- **Options.** Stage 2 (goods-in): the receipt count closes the record, and the Commercial ownership policy is needed by stage 2 · Stage 1 builds the record type and stage 2 only exercises it.
- **Choice.** Stage 2. Inbound ownership records are built in the goods-in stage and closed against the receipt count. The Commercial ownership policy is needed before their live use.
- **Why.** The receipt count is what closes the record, so the record belongs with receiving.
- **Changed.** No document text changed. `phases.md` stage 2 already lists inbound ownership (`PRD-ORG-017` to `PRD-ORG-019`, `PRD-ACP-020`) and Commercial ownership among its policies; the pick confirms it.

## DEC-087 — Journals are written in the same transaction as the valued movement

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-33 (decision pack, 3 Oct 2026)
- **Question.** `PRD-MOD-013` requires balanced journals per book at commit. `PRD-MOD-006` and `POL-09.12` were read as sending journals through the outbox after the movement commits. How are the two met together?
- **Options.** Write the journals inside the same transaction as the valued movement, so they balance at commit; the financial posting design owns this · Let journals follow through the outbox and balance when they post, which needs a decision record clarifying `PRD-MOD-013`.
- **Choice.** Same transaction. A valued movement, its balance and pool rows, and the balanced journals per book for that movement commit together (`PRD-MOD-013`, `PRD-MOD-006`). The outbox carries durable follow-up only, such as messages and the Tally exchange. What happens to the movement when no valid posting map exists at commit (`POL-09.12` preserves the operational event) is OPEN (new SL-23; owner product owner and the CA; blocks stage 1).
- **Why.** It meets `PRD-MOD-013` as written without changing the PRD.
- **Changed.** `stock-ledger.md` section 1 (second and fourth bullets), section 7.11 (first two bullets), section 10.2, SL-21 (settled), new SL-23 and the header's decision list. No PRD or policy bullet changed.

## DEC-088 — No piece-tracking exception for EBO Stores on brand software

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-48 (decision pack, 3 Oct 2026)
- **Question.** `PRD-EBO-011` and DEC-023 say an EBO Store on brand software holds piece-tracked goods as SKU quantity until it bills in Apparel OS. `PRD-MER-003` and `PRD-MER-016` say piece-tracked goods keep a piece ID and are billed, counted, transferred and returned by scanning it. Can such a Store take goods in, send them out or count them by quantity?
- **Options.** No exception: piece IDs are kept and scanned as the PRD says, and EBO imports name no piece only for sales reporting · Log a decision record allowing arrival or outbound by quantity at such a Store, then align section 5 and check 11.7 of the ledger.
- **Choice.** No exception. Piece IDs are kept and scanned (`PRD-MER-003`, `PRD-MER-016`). EBO imports name no piece only for sales reporting (`PRD-EBO-011`, DEC-023). The event that ends "until it bills in Apparel OS" at such a Store is OPEN (SL-18; product owner; blocks stage 4). Any later exception needs a decision record first.
- **Why.** The ledger had invented a stop-tracking rule that no PRD bullet allows.
- **Changed.** `stock-ledger.md` section 5 (EBO paragraph) and SL-18 (narrowed to the end-event question). No PRD or policy bullet changed.

## DEC-089 — PRD rules for an EBO import that oversells and for a mistaken damage confirmation

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-106 (decision pack, 3 Oct 2026)
- **Question.** The ledger held two design rules with no PRD basis: a reconciliation queue for an EBO import that sells more than the app holds (section 10.5), and undoing a mistaken damage confirmation by a reversal (section 2.3). `PRD-DMG-003` covers only rejection before confirmation; `PRD-ACS-014` and `PRD-EXC-001` are generic. Should the PRD gain these rules?
- **Options.** Add PRD bullets through a decision record, then cite them in the ledger · Drop both rules from the ledger and leave the cases to the generic exception route (`PRD-EXC-001`, `PRD-ACS-014`).
- **Choice.** Add the bullets. `PRD-STK-016`: when an imported EBO sale report would oversell available stock, hold the import for reconciliation before stock is reduced; do not apply the oversell silently. `PRD-STK-017`: a mistaken damage confirmation is corrected by a linked reversal that restores the prior custody and stock state; it does not edit the original confirmation.
- **Why.** Both rules protect stock integrity and belong in the source of truth, not only in design.
- **Changed.** New `PRD-STK-016`, `PRD-STK-017` in `prd.md`; `stock-ledger.md` section 2.3 (Condition change), section 10.5, SL-19, SL-20 and the header's PRD ID and decision lists; `ui/README.md` PRD ID range (`PRD-STK-001`–`PRD-STK-017`).

## DEC-090 — Billed-retained items at the switch are counted apart, not opening stock

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-45 (decision pack, 3 Oct 2026)
- **Question.** `POL-14.04` carries billed-retained items across a Store's switch. `PRD-LIF-027` makes the verified count the opening stock and has no carve-out. Do these items carry cost-pool value, and do they count as opening stock?
- **Options.** They are opening stock under `PRD-LIF-027` like any counted item, valued from the CA's recognition timing · A decision record adds a carve-out: they are counted apart and valued under the CA's rule.
- **Choice.** Carve-out. This entry is the decision record. Billed-retained items carried across a Store's switch under `POL-14.04` are counted apart from its opening stock and are not opening stock under `PRD-LIF-027`. Their value follows the recognition rule the CA sets under the Financial posting policy. That rule is OPEN (V-35, SL-17; owner the CA; blocks stage 4).
- **Why.** The goods are paid for but still in the Store, so they should not be mixed into the opening count.
- **Changed.** New `PRD-LIF-028` in `prd.md`; `stock-ledger.md` section 9 step 4, SL-17 and the header's PRD ID and decision lists. `PRD-LIF-027` and `POL-14.04` are not reworded.

## DEC-091 — A customer return of a consignment unit follows the brand agreement

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** N-49 (decision pack, 3 Oct 2026)
- **Question.** Where a brand agreement passes ownership at sale (`POL-01.05`), does a customer return of that unit revert ownership to the supplier? `POL-01.13` has consignment settlement reconcile customer returns.
- **Options.** Follow the brand agreement per `POL-01.05` and `POL-01.13`, set per agreement · Set one default in a decision record.
- **Choice.** Follow the agreement. The ownership effect of a customer return is whatever each brand agreement says; the ledger sets no default that ownership reverts. The CA decides the accounting (`POL-09.03`). The accounting effect of a customer return of a pass-through unit is OPEN (SL-4; owner the CA, product owner for the ownership effect; blocks stage 2).
- **Why.** Ownership events are configured per agreement, so one default would override signed terms.
- **Changed.** `stock-ledger.md` SL-4 (wording only: the open point is the accounting under each agreement, not a general ownership reversal). Section 7.2 already reads this way. No PRD or policy bullet changed.

## DEC-092 — Signed and Revoked join the status states

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** C-11 (decision pack, 3 Oct 2026)
- **Question.** `design-language.md` section 7 had two proposed state names the settled table lacks, one for policy readiness and one for a lost device or session. Which names does the product owner want?
- **Options.** Signed (Done family) and Revoked (Stopped family), as proposed · Other names, or no badge: keep the 10.17 banner for policy status and treat a lost device as a Setup list outside the badge families.
- **Choice.** Signed and Revoked. Signed (Done, ✓) shows on Policy readiness when the policy's "Signed by, date" line is complete (`DEC-029`). Revoked (Stopped, ✕) shows on a registered device or session reported lost and revoked (`PRD-SEC-008`, `PRD-OFF-019`). An unsigned policy still shows the 10.17 banner, not a badge.
- **Why.** Both fit existing families, and screens need the names.
- **Changed.** `design-language.md` section 7 (both states move from the proposed table into the settled states table; the proposed table keeps only Working set expired, `DEC-062`) and the states list in `design-system.html`. No PRD or policy bullet changed.

## DEC-093 — The Organisation is found by its code at sign-in; one user per Organisation

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** MM-2 (module map, 3 Oct 2026)
- **Question.** With one database per Organisation (`PRD-MOD-001`), how is the Organisation found before sign-in (`PRD-INT-001`), where is the list of Organisations kept, and does a person who serves several Organisations, such as a CA or an Auditor, get one login or one per Organisation?
- **Options.** An Organisation code at sign-in; a small directory outside the Organisation databases holds only what routing needs; users and sessions live in each Organisation's database; a person serving several Organisations holds a separate user in each · One shared login per person across Organisations, kept in a shared store outside the Organisation databases; after sign-in the person picks an Organisation.
- **Choice.** An Organisation code, and one user per Organisation. New `PRD-ACS-020`: a user belongs to one Organisation; a person who works for several holds a separate user in each, and no login, session or role assignment crosses Organisations. The routing itself is design: the directory holds only each Organisation's code and where its database is, sign-in asks for the code, and a custom domain may fill it in later.
- **Why.** Every Organisation stays fully walled off: its people, passwords and sessions never sit outside its own database.
- **Changed.** New `PRD-ACS-020` in `prd.md`; `module-map.md` section 4.1 (Organisation routing) and MM-2 (settled); `deployment.md` sections 3 and 4.

## DEC-094 — A role assignment's places: whole Sites, or single Stores or business units within a Site

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** DM-1 (domain model, 3 Oct 2026)
- **Question.** `PRD-ACS-001` and `POL-02.02` scope a role assignment by entity, Site and brand. `personas.md` also names Store and business unit, and self-service needs a scope of the person's own records (DEC-041). Are Store and business unit scope dimensions of their own, or selections inside a Site?
- **Options.** One place tree: whole Sites, or single Stores or business units within a Site; legal entity and brand stay separate filters · Whole Sites only: a person given a Site sees every Store and business unit at it.
- **Choice.** The place tree. New `PRD-ACS-021`: scope a role assignment's places by whole Sites, or by single Stores or business units within a Site; a selected Site covers every Store and business unit at it, including ones added later; self-service uses a scope limited to the person's own records. `PRD-ACS-001`, `PRD-ACS-005` and `POL-02.02` are not reworded: Site scope still exists, and all, selected and empty scope apply as before.
- **Why.** Two trading units at one Site, such as a brand counter inside a Store, can be kept apart, while a Site-wide assignment works as before.
- **Changed.** New `PRD-ACS-021` in `prd.md`; `domain-model.md` section 3.2 (Scope) and DM-1 (settled); `structure-and-masters.md` (the place tree).

## DEC-095 — Each tax registration and each accounting book belongs to one legal entity

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** DM-2 (domain model, 3 Oct 2026)
- **Question.** `PRD-ORG-005` maps each business unit to a legal entity, a tax registration and an accounting book, and says nothing of how the three relate. Does a book belong to exactly one legal entity? Does a tax registration?
- **Options.** Yes, both: each belongs to one legal entity, which may hold several of each, and a business unit's mapping is checked for consistency · No link: any combination is allowed and nothing is checked.
- **Choice.** Yes, both. New `PRD-ORG-020`: each tax registration and each accounting book belongs to exactly one legal entity, fixed when it is created; a legal entity may hold several of each; a business unit's tax registration and accounting book must belong to its mapped legal entity. The CA is asked to confirm this for KDPS's GST registrations and books (CA question 16 in `questions-for-kdps.md`).
- **Why.** A GST registration belongs to one PAN, and a book is one entity's books. The check stops a wrong mapping before any transaction uses it, and makes a move between legal entities visible.
- **Changed.** New `PRD-ORG-020` in `prd.md`; `domain-model.md` section 3.1 and DM-2 (settled); `structure-and-masters.md`; CA question 16 in `questions-for-kdps.md`.

## DEC-096 — Several Stores may share a Site; a brand counter is a business unit; a relocated Store keeps its identity

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** DM-3 (domain model, 3 Oct 2026)
- **Question.** Can more than one Store trade at one Site at the same time? Is a shop-in-shop a Store, or a business unit of its host Store (`PRD-ORG-006`, `PRD-ORG-010`)? On relocation (`PRD-LIF-021`), does the Store keep its identity at the new linked Site?
- **Options.** Flexible: several Stores per Site; a brand counter inside the Organisation's own Store is a business unit of that Store; the shop-in-shop format is the Organisation's own Store inside another business's premises; a relocated Store keeps its code and history, with a dated Site link · Strict: one Store per Site at a time; a relocation closes the Store and opens a new one, linked to the old.
- **Choice.** Flexible. New `PRD-ORG-021`: several Stores may trade at one Site at the same time; a Store's link to its Site is effective-dated; a brand counter inside the Organisation's own Store is a business unit of that Store; the shop-in-shop Store format is the Organisation's own Store trading inside another business's premises. New `PRD-LIF-029`: on relocation the Store keeps its code, name and history, and its Site link moves to the new linked Site from the relocation date. How a relocating Store's business units move to the new Site is left to the stage 5 relocation design (OPEN; product owner).
- **Why.** It fits how stores are laid out, and keeps a Store's sales and history together when it moves.
- **Changed.** New `PRD-ORG-021` and `PRD-LIF-029` in `prd.md`; the "Words used" entry for Shop-in-shop, which read "A brand counter operating inside a larger store", now matches the choice; `domain-model.md` section 3.1 and DM-3 (settled); `structure-and-masters.md`.

## DEC-097 — An approval waits, unused, for its posting job; a failed job keeps it

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** SL-22 (stock ledger), MM-4 and MM-5 (module map, 3 Oct 2026)
- **Question.** A large document is approved by a click and posted later by a queued job, one at a time per accounting book (stock-ledger 10.6). Approval evidence commits with the stock and money records. Where are the approver's identity and the approval time held between the click and the job, and what happens to the approval if the job fails? Which design settles it: the financial posting design (GC-4) or the access design (GC-3)?
- **Options.** Keep the approval: the click commits the approval decision with its audit record and a request to post, with no stock or money effect; the job locks the decision with the document, rechecks it, posts, and records in that same transaction that this decision authorised this posting; a failed job leaves the decision recorded and unused · The approval lapses when the job fails, and the document always returns for approval.
- **Choice.** Keep the approval. The record that links the decision to its posting, written in the job's transaction, is the approval evidence that commits with the stock and money records (`PRD-INT-004`). A decision authorises at most one posting. A retry needs no new approval only while the document version is unchanged and its value on its basis is still within the decision's limit and the approved amount; otherwise the document returns for renewed approval, as DEC-066 already requires. The access design (GC-3) settles it.
- **Why.** A job that fails for a technical reason, such as a lock wait, should not throw away a valid approval. The recheck under the locks still guards every change.
- **Changed.** No PRD or policy bullet changed. `stock-ledger.md` 10.6 and SL-22 (settled); `module-map.md` 6.2 flow E, 6.3, 11.3, MM-4 and MM-5 (settled); `domain-model.md` 3.2; the new access design `access-and-approvals.md`.

## DEC-098 — A selected Store covers its business units, including ones added later

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** GC2-8 (structure and masters, 3 Oct 2026)
- **Question.** Selected-member scope stays fixed, and a selected Site is the one exception: it covers every Store and business unit at it, including ones added later. Does a role assignment scoped to one Store likewise cover business units added to that Store later, such as a new brand counter?
- **Options.** Yes, the same as a Site: a selected Store covers every business unit of it, now and later · No: a selected Store covers only the units it had when the assignment was made, and a new unit needs an edited assignment.
- **Choice.** Yes. `PRD-ACS-021` gains one sentence: a selected Store covers every business unit of it, including ones added later. A business unit selected on its own still covers only itself.
- **Why.** Store staff work the whole Store. A new brand counter inside it should not need every assignment edited.
- **Changed.** `PRD-ACS-021` (one sentence added; ID kept). `structure-and-masters.md` 3.9 and GC2-8 (settled); `domain-model.md` 3.2; the new access design `access-and-approvals.md`.

## DEC-099 — No message channel before stage 5

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** MM-9 (module map, 3 Oct 2026)
- **Question.** `phases.md` brings WhatsApp and SMS in stage 5 and names no stage for email. Do stages 1 to 4 need any message channel, for one-time passwords at sign-in or for alerts to responsible users?
- **Options.** None before stage 5: sign-in uses the authenticator-app code required by `POL-02.17`, which sends nothing; alerts in stages 1 to 4 reach people as work items in My work and on screens; email, WhatsApp and SMS adapters all arrive in stage 5 · An email adapter from stage 1 for alerts and sign-in help, with WhatsApp and SMS in stage 5.
- **Choice.** None before stage 5. In stages 1 to 4 the second factor at sign-in is the authenticator-app code; no one-time password is sent (`PRD-SEC-001`). Alerts to responsible users reach them in My work and on screens (`PRD-EXC-013`). The notifications module has no channel adapter before stage 5, and email arrives in stage 5 with WhatsApp and SMS.
- **Why.** The authenticator app needs no channel, and the one inbox already carries tasks, exceptions and approvals. Fewer outside systems to build and test early.
- **Changed.** No PRD or policy bullet changed. `phases.md` ("How the stages are cut"; stage 5 scope); `module-map.md` 2.2, 4.9 and MM-9 (settled); the new access design `access-and-approvals.md`; `AGENTS.md` ("Delivery").

## DEC-100 — Own-record self-service has its own role

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** DEC-041 open item; module map 4.3; `personas.md` open items
- **Question.** DEC-041 grants self-service only through a role assignment scoped to the person's own records, and left open which template or assignment carries it. One assignment's action is never combined with another assignment's scope.
- **Options.** A separate self-service role, whose assignments have only own-record scope, held beside a person's work roles · Self-service permissions inside each work role, so one assignment holds both a place scope and an own-record scope.
- **Choice.** A separate role. New `PRD-ACS-022`: grant self-service only through a role assignment whose only scope is the person's own records; that assignment covers no legal entity, place or brand, and an assignment scoped by legal entity, place or brand never grants self-service. The eleven KDPS templates are unchanged. Which people hold the self-service role stays with KDPS (V-01).
- **Why.** Each assignment keeps one kind of scope, so own records never widen a work scope, and a work scope never reaches another person's own records through self-service.
- **Changed.** New `PRD-ACS-022` in `prd.md`. `personas.md` (sections 1 and 4, open items); `module-map.md` 4.3; `domain-model.md` 3.2; `structure-and-masters.md` 3.9; the new access design `access-and-approvals.md`.

## DEC-101 — A new Organisation's first access is set up in one recorded step

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** GC3-2 (access design, 3 Oct 2026)
- **Question.** Role, permission and approval-rule changes need approval by an authorised person other than the preparer. In a new Organisation nobody holds that authority yet. How is its first access set up and approved?
- **Options.** One setup step, recorded under a service identity, creates the first Admin and a first approver of access changes together; every later change follows independent approval · Another route, such as two people from outside the Organisation preparing and approving the first assignments.
- **Choice.** One setup step. New `PRD-ACS-023`: create a new Organisation's first Admin and its first approver of access changes together, in one setup step recorded under a service identity, since no user of the Organisation can yet approve it; from then on every change to roles, permissions, role assignments and approval rules needs approval by a different authorised person (`POL-02.07`). The step is audited like any other change.
- **Why.** It gives every Organisation a working pair from the start, so the independent-approval rule can apply to everything after it.
- **Changed.** New `PRD-ACS-023` in `prd.md`. `access-and-approvals.md` 4.2, 4.3, 7.1, 9.11 and GC3-2 (settled); `module-map.md` header, 4.3 and 11.1; `domain-model.md` header, 3.2 and section 5; `ui/README.md`; KDPS Owner question 4.

## DEC-102 — `kdps-test` uses the policy 2 session limits before signing

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** GC3-3 (access design, 3 Oct 2026)
- **Question.** Session limits come from policy 2, which is not signed, and on `kdps-test` gated actions stay disabled until their policy is signed (DEC-071). What session limits apply on `kdps-test`, so KDPS staff can sign in for imports and checks?
- **Options.** Use the values policy 2 already states · Keep sign-in closed on `kdps-test` until policy 2 is signed.
- **Choice.** Use the stated values. On `kdps-test`, before policy 2 is signed, sessions use the idle and absolute limits `POL-02.18` states, and sign-in still requires the authenticator code. They are settings of the test setup, not a signed policy: no other gated action is enabled by them, and on production they apply only once policy 2 is signed and the Admin has validated them (V-04).
- **Why.** The side-by-side test needs KDPS staff to sign in, and the policy's own values are the only ones KDPS has stated.
- **Changed.** No PRD or policy bullet changed. `access-and-approvals.md` 3.3 and GC3-3 (settled); `deployment.md` sections 1 and 3.

## DEC-103 — KDPS staff get test role assignments on `kdps-test` before signing

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** GC3-11 (access design, 3 Oct 2026)
- **Question.** Role assignments are policy 2 values, unconfigured until policy 2 is signed, and gated actions stay disabled on `kdps-test` until then (DEC-071). With DEC-102 KDPS staff can sign in there, but without a role assignment they can do nothing. How do they get the assignments they need for imports and checks?
- **Options.** Treat them like DEC-102: role assignments on `kdps-test` are made from what KDPS tells us, as settings of the test setup that enable no gated action · No role assignments on `kdps-test` until policy 2 is signed, so staff can only sign in.
- **Choice.** Test settings. On `kdps-test`, before policy 2 is signed, KDPS staff get role assignments prepared from what KDPS tells us and approved like any other access change (`PRD-ACS-023`). They are settings of the test setup, not the signed role map of `POL-02.11`: they enable no gated action, so only imports and checks that need no gated action run (DEC-071). On production, role assignments wait for policy 2 as before.
- **Why.** The side-by-side test needs KDPS staff to load and check data, and the gate still keeps every gated action off.
- **Changed.** No PRD or policy bullet changed. `access-and-approvals.md` 4.3 and GC3-11 (settled); `deployment.md` section 1.

## DEC-104 — A change to the reason list is decided with a free-text reason

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** GC3-10 (access design, 3 Oct 2026)
- **Question.** The access design makes every approve or reject decision pick a reason from the configured list, and a change to that list needs a decision by a different person. So the first list of a new Organisation can never be approved. How is it approved?
- **Options.** A decision on a change to the reason list gives a free-text reason, since it cannot use the list it changes · The setup step also loads the first list the Organisation supplies.
- **Choice.** Free text. A decision on a change to the approve and reject reason list gives its reason as free text; every other decision picks a reason from the list in force (`POL-02.23`, `PRD-ACS-010`). The change itself still needs a different authorised person (`PRD-ACS-023`).
- **Why.** It breaks the loop without loading any value KDPS has not approved, and keeps the reasons KDPS sets for every other decision.
- **Changed.** No PRD or policy bullet changed. `access-and-approvals.md` 8, 9.5, section 15 and GC3-10 (settled).

## DEC-105 — Baseline scope: build the whole application to the decisions taken so far

- **Date:** 3 Oct 2026 · **Decided by:** product owner · **Report item:** baseline request (3 Oct 2026)
- **Question.** Many design questions are open and no KDPS policy is signed. Should design and build wait for each answer, or go ahead to one fixed baseline that KDPS then reviews?
- **Options.** A baseline now: design and build the whole application to the decisions taken so far and to the picks below; KDPS reviews it in the next policy round and asks for changes, each a new decision entry · Wait for each answer before designing or building what depends on it.
- **Choice.** A baseline now. (1) Every PRD feature is designed and built, in the stage order of `phases.md`, to this baseline. (2) The KDPS policy answers as written in `kdps-policies.md` are the baseline behaviour; live use still needs the policy signed (`PRD-SEC-017`). (3) KDPS's own values (limits, tolerances, names, dates, reasons, recipients, number formats, retention periods) stay settings with no default; tests use labelled synthetic data. (4) Every policy-dependent feature is built complete and ships switched off; an Admin switches it on per Organisation once its settings are valid and its policy is signed. (5) The open questions in the table below take the baseline pick shown. (6) Any change KDPS asks for is a new decision entry.
- **Baseline picks.** The person named last confirms the pick or asks for a change.

| Question | Baseline pick | Confirms |
| --- | --- | --- |
| GC2-1 | A business unit's tax registration must be in the State of its Site; the mapping check compares them | CA (question 16) |
| GC2-2 | Changes to the structure, to business-unit mappings and to agreement versions need approval by a different authorised person. Verifying a mapping is a separate permission, held by a different person from the one who made the mapping | KDPS Owner, Admin; Accounts, CA |
| GC2-3 | The Site kind where Stores trade is a retail site (new "Words used" row; `PRD-ORG-010`) | — |
| GC2-4 | A relocating Store gets new business units at its new Site, linked to its old ones; stock moves between them by transfer | — |
| GC2-5 | A SKU's stock unit cannot change while any stock of it is recorded | Booking, Operations |
| GC2-6 | Every party's bank-detail change needs approval by a different authorised person, not only a supplier's | KDPS Owner, Admin |
| GC2-7 | No master version ever starts on a past date | — |
| GC2-9 | Every list-type merchandise attribute carries an approved vocabulary; which attributes exist is configured per Organisation (`PRD-ORG-011`) | Booking |
| GC3-1 | The preparers of a version are everyone who recorded a change in it, including the one who submitted it | KDPS Owner |
| GC3-4 | A credential reset needs no second approver; it is a protected action, it is recorded, and nobody resets their own | KDPS Owner, Admin |
| GC3-6 | A fresh authenticator code is asked for when deciding an approval, changing access, changing bank details, and showing or exporting an encrypted field; how long a code stays fresh is a setting | KDPS Owner |
| GC3-7 | A stand-in grant needs approval by a different authorised person | KDPS Owner |
| GC3-8 | Approvals and tasks have a due time and an escalation recipient per action type and Site, set like exception routing; an escalation adds the recipient and keeps the owner | KDPS Owner, Admin |
| GC3-9 | Staff see their own employee record, read-only, through self-service; its restricted fields follow the self-service role's field permissions | KDPS Owner, HR |
| GC3-12 | On `kdps-test`, the first reason list, with the reasons KDPS gives, is a setting of the test setup, approved first with a free-text reason | KDPS Owner, Admin |
| DM-4 | State names. Site, Store and business unit: Setting up, Active, Closing, Closed. Master version: Awaiting approval, Scheduled, In force, Ended, Rejected. User: Active, Disabled, Ended. Import batch: Staged, Validated, Published, Failed. Proposal: Proposed, Confirmed, Rejected. Financial period: Open, Locked, Reopened. Number series: Open, Paused, Closed. An exception not yet resolved: Unresolved. An approval request ended by a material change: Superseded | Design review |
| DM-5 | A product proposal is confirmed by a different person from its proposer | KDPS Owner |
| DM-6 | A policy's real values are recorded as validated, with the evidence, by a person holding the validate permission who did not enter them | — |
| DM-7 | Records stay separate in each module; an optional link by tax identity shows one legal person's records together; payables and receivables are never netted automatically | — |
| DM-8 | Value bases: booking approval, the booking's value at cost; damage confirmation, acceptance of excess, wrong or unidentified goods, and each supplier-return step, cost; day-close cash variance, the difference; payroll inputs, the period's net pay; offers, no value limit | KDPS Owner (limits) |
| MM-1 | `organisation` and `kernel` are confirmed module names, and modules keep their parts | — |
| MM-3, SL-23 | Outcome A: a valued movement with no valid posting map does not commit; the document stays as it was, and an exception is raised in its own transaction | CA |
| MM-6 | The financial period row is locked in shared mode after cost pool rows and before number series | — |
| MM-7 | `receiving` owns inbound ownership records | — |
| MM-8 | Readiness and activity approval is given by a different person from the one who ran the checks; who holds it is KDPS's (question 49) | KDPS Owner |
| MM-10 | An e-invoice-applicable bill waits for its IRN before the tax invoice prints and the goods are handed over. Meanwhile the customer gets nothing that looks like a tax invoice, and an unknown or failed outcome keeps the bill pending until it is resolved | CA |
| MM-12 | The Tally voucher model supports vouchers with and without items; a setting per book chooses | Accounts, CA |
| MM-13 | A registration-only change between business units at one Site always needs its statutory document; it is never a location move | CA |
| MM-14 | The AI gateway is built in stage 2, for PT source files; stage 1 imports use the manual route only | — |
| MM-15 | Retention, deletion and legal holds are designed with backup, restore and export (GC-9); customer consent and notices in the stage 4 counter design; employee data in the stage 6 HR design | — |
| SL-10 | Until a later plan allows those returns, the customer is served under the no-bill return route where policy 7 allows it, and is otherwise refused with the reason shown | — |
| SL-18 | The event is the Store's switch to billing in Apparel OS | — |
| Cost drift (stock-ledger 10.4) | No tolerance: any rise above the decision's limit or the approved amount needs renewed approval | KDPS Owner |
| D-2 | A Railway bucket, S3-compatible, holds files on the test setup | — |
| D-3 | `kdps-test` uses the Railway-provided address; a custom domain can be added later | — |
| D-6 | The local helper and the Tally local gateway call the server over HTTPS with a service-identity credential; nothing calls into a Store or office. Development uses the same sign-in as production, with synthetic users | — |
| Owner and losses (personas) | The Owner template approves write-offs, disposals and count differences above the Store manager's tolerance, within limits KDPS sets | KDPS Owner |
| Camera scanning (personas) | Built for phones in the browser, for lookup, receiving and counts; switched off by default | — |
| Phone client (PRD Stack) | Responsive web serves phones through stage 6; a native phone client needs a later decision | — |
| Forecast service hosting (module-map 10) | It runs as one more service in the same hosting as the app | — |
| Accessibility (design-language 12) | WCAG 2.2 AA is the target for every screen | — |

- **Left open.** KDPS's values (alignment report section 5, V-01 onwards, and the KDPS questions); the accounting and statutory rules Accounts and the CA set (SL-1 to SL-8, SL-14, SL-15, SL-17, GC5-1, GC5-2); sign-in security values (GC3-5); production hosting (D-1, chosen before the first switch); KDPS's agreement to real data and a test Tally company (D-4, D-5); the rollout order on production (SL-9); chunked posting, needed only if the performance test fails (SL-11); where the Customer credit receivable sits (MM-11, the stage 5 design); team size (GC-11).
- **Why.** Builders and KDPS see one defined scope now. KDPS can adapt to it or ask for changes, and nothing it has not approved goes live.
- **Changed.** `PRD-ORG-010` and a new "Words used" row, Retail site. Each open question above is marked with its baseline pick where it is listed and where its text points to it: `structure-and-masters.md`, `access-and-approvals.md`, `numbering-and-audit.md`, `domain-model.md`, `module-map.md`, `stock-ledger.md`, `deployment.md`, `personas.md`, `design-language.md`, `design-system.html`, `ui-blueprint.html`, `phases.md` and `questions-for-kdps.md`. No policy bullet changed.

## DEC-106 — Reopening a locked period needs a second person

- **Date:** 4 Oct 2026 · **Decided by:** product owner · **Report item:** GC-4 (books and posting design, 4 Oct 2026)
- **Question.** `PRD-LED-009` locks financial periods and requires "authorised reopening for affected posting". It does not say whether one authorised person may reopen a locked period alone, or whether a second person must approve it, as for structure, mapping and access changes.
- **Options.** Two people: one authorised person requests the reopening with its reason, and a different authorised person approves it · One person: an authorised Accounts person reopens the period alone, with a reason.
- **Choice.** Two people. New `PRD-LED-019`: reopening a locked financial period needs a request with its reason, approved by a different authorised person from the requester. It is then an independently approved action of the PRD, which policy 2 already requires to be approved by a different person, so no policy edit is needed. Who may request and who may approve stays KDPS's (V-01).
- **Why.** A locked period holds figures already closed and reconciled. A second person checks every change to them, as for every other control on money.
- **Changed.** New `PRD-LED-019` in `prd.md`. The new design `finance/books-and-posting.md` (GC-4); `module-map.md` 4.14 and 11.1; `domain-model.md` section 5.

## DEC-107 — A reopening lets in only the corrections it names

- **Date:** 4 Oct 2026 · **Decided by:** product owner · **Report item:** GC-4 (books and posting design, 4 Oct 2026)
- **Question.** Once a locked period is reopened, may any posting enter it until someone locks it again, or only the corrections the reopening was for? `PRD-LED-009` speaks of reopening "for affected posting".
- **Options.** Only named corrections: the reopening names the corrections it is for, only their postings enter the period, and the period locks again when they are done · Anything until relocked: the whole period accepts any posting until a person locks it again.
- **Choice.** Only named corrections. New `PRD-LED-020`: a reopening names the corrections it is for; only their postings may enter the reopened period, and every other posting stays refused; the period locks again once they have posted or the reopening is withdrawn. Which accounting date a late movement takes when its business date falls in a locked period stays OPEN (stock-ledger SL-15; Accounts, CA).
- **Why.** Late or unrelated entries cannot slip into a closed month while it is open for one fix, and nobody has to remember to lock it again.
- **Changed.** New `PRD-LED-020` in `prd.md`. The new design `finance/books-and-posting.md` (GC-4); `module-map.md` 4.14 and 11.1; `domain-model.md` section 5.

## DEC-108 — When offers may not combine, the customer gets the best permitted set

- **Date:** 4 Oct 2026 · **Decided by:** product owner · **Report item:** GC-7 (shared calculations design, 4 Oct 2026)
- **Question.** `POL-19.04` says offers do not stack unless an effective-dated rule permits the combination. When two or more offers apply to the same lines and no rule lets them combine, nothing says which one applies.
- **Options.** Best for the customer: apply the permitted set of offers that gives the largest total discount on the bill · A priority set on each offer at approval: the higher priority wins.
- **Choice.** Best for the customer. New `PRD-OFR-021`: when offers apply to the same lines and no effective rule permits them to combine, apply the permitted set of offers that gives the customer the largest total discount on the bill; a tie goes to the set holding the offer approved first. Running Offers and checkout make the same choice. Which offers may combine, and in what order combined offers apply, stay KDPS's (policy 19, V-43).
- **Why.** No extra setting on every offer. The customer always gets the lowest price the approved offers allow, and Running Offers can show why.
- **Changed.** New `PRD-OFR-021` in `prd.md`. The new design `calculations/shared-calculations.md` (GC-7); `module-map.md` 11.1.

## DEC-109 — A discount earned by several lines is spread by price

- **Date:** 4 Oct 2026 · **Decided by:** product owner · **Report item:** GC-7 (shared calculations design, 4 Oct 2026)
- **Question.** `PRD-POS-004` allocates basket discounts across lines before tax and rounding, but does not say by what key. A basket-value or buy-X-get-Y offer gives one discount for several lines. How it is split sets each line's taxable value and, where a rate depends on a value slab, its rate.
- **Options.** Spread over the lines that earned it, in proportion to their price, with leftover paise to the largest line · Each offer chooses at approval: spread by price, or only on the reward lines.
- **Choice.** Spread by price. New `PRD-POS-023`: a discount that an offer gives for a group of lines, such as a basket-value or buy-X-get-Y offer, is spread over the lines that earned it in proportion to each line's value before that discount. Each share is rounded down to whole paise; the paise left go to the line with the largest such value, and a tie to the first of those lines on the bill. The CA confirms the tax effect (CA question 20).
- **Why.** One rule for every offer, built like the split-tender refund of `PRD-RET-022`. No unit is billed at zero, so a later return of one unit refunds a fair share.
- **Changed.** New `PRD-POS-023` in `prd.md`. The new design `calculations/shared-calculations.md` (GC-7); `module-map.md` 11.1.

## DEC-110 — A return from an offer bill refunds what was paid for the returned units

- **Date:** 4 Oct 2026 · **Decided by:** product owner · **Report item:** GC-7 (shared calculations design, 4 Oct 2026)
- **Question.** When a customer returns some units from a bill that had an offer, is the refund the value the bill recorded as paid for those units, or is the offer worked out again on what the customer keeps? `PRD-RET-005` caps entitlement at the original paid value less prior returns; it does not say whether an offer condition the customer no longer meets lowers the refund.
- **Options.** The paid value recorded for the returned units; the offer is not worked out again · Work the offer out again on the units kept and take the lost benefit off the refund.
- **Choice.** The paid value. New `PRD-RET-024`: the refund for returned units is the paid value the bill recorded for them, after offers and spread discounts; the offer is not worked out again on the units the customer keeps. For part of a line, the units share the line's paid value the same way as `PRD-POS-023`: each returned unit takes the line's paid value ÷ sold quantity, rounded down to whole paise, and the return that brings the line's returned quantity to its sold quantity takes all that remains.
- **Why.** Simple to explain at the till, and it fits the paid-value cap. With DEC-109 every unit carries its share of the discount, so returning one unit never refunds more than was paid for it.
- **Changed.** New `PRD-RET-024` in `prd.md`. The new design `calculations/shared-calculations.md` (GC-7); `module-map.md` 11.1.

## DEC-111 — A selling price never exceeds MRP

- **Date:** 4 Oct 2026 · **Decided by:** product owner · **Report item:** GC-7 (shared calculations design, 4 Oct 2026)
- **Question.** `PRD-POS-003` allows a manual price change with the configured authority and reason, and `PRD-OFR-004` keeps price lists. Nothing says whether a selling price may be above the MRP on the price ticket.
- **Options.** Never: the counter refuses any price above MRP, from a price list or a manual change · Allowed with the configured authority and reason.
- **Choice.** Never. New `PRD-POS-024`: a line's selling price, whether from a price list or a manual change, never exceeds the MRP of the goods sold; it is refused, with no override.
- **Why.** MRP is the maximum retail price printed on the tag. Charging more is never a routine exception to approve.
- **Changed.** New `PRD-POS-024` in `prd.md`. The new design `calculations/shared-calculations.md` (GC-7); `module-map.md` 11.1.

## DEC-112 — Stage 1 baseline: setup step, test harness, imports and posting-map workflow

- **Date:** 5 Oct 2026 · **Decided by:** product owner · **Report item:** [S1 baseline decisions](history/apparel-os-s1-baseline-decisions.md) (5 Oct 2026)
- **Question.** Stage 0 is complete and `S1-F01` is next. Open design and engineering questions sit at stage 1 gates: the setup step (CH-1, RR-017), the house-rule questions CH-2 to CH-5 and CH-7, the stock harness decisions H1 to H6, the import questions of GC-6, the approval of posting maps (GC4-2), journal numbering (GC4-4), and the master proposals of RR-047. Which picks does stage 1 build to?
- **Options.** Take the picks below as the stage 1 baseline; the person named last confirms a pick or asks for a change · Leave each question open and decide it at its own gate.
- **Choice.** The stage 1 baseline. (1) The picks in the table bind the build in the same way as the earlier baseline picks: the person named last confirms one or asks for a change, and a change is a new decision entry. (2) They approve product and development workflow only. They are no Accounts or CA signoff, no signed policy, no KDPS value, and no permission for real data, installation, pushing, deployment or live activation; a technical starting value is a development assumption until it is measured. (3) KDPS's files and habits are evidence for migration and engineering, not authority for product rules; accounting, legal, data-use and correctness gates still apply. (4) Which lines earn a group discount (RR-042, GC7-11) stays deferred and unapproved, and the discount-pattern research report is reference only.
- **Baseline picks.**

| Question | Baseline pick | Confirms |
| --- | --- | --- |
| CH-1; RR-017 (setup states) | An authorised operator command creates and migrates the Organisation's database; ordinary users cannot run it. An identical request safely resumes an interrupted setup; a conflicting request with the same Organisation code is refused; a finished setup never runs again | — |
| RR-017 (the two first users) | The first Admin prepares users, roles, role assignments, approval rules and changes to the reason list; the first approver inspects them and approves or rejects them; neither decides their own preparation. Both get the Organisation-wide view of these records and their history that the duties need. Neither gets, from the setup step, access to post business documents or to payroll, bank, customer-contact, cost or margin data. The builders derive the exact permission matrix (record type, action, field class, scope) and have it independently reviewed before the setup step is accepted; the workflow is approved, an unwritten matrix is not. `S1-F01` uses all-members or empty scope until selected members exist. The setup step activates no unsigned policy and no live operation | KDPS Owner (role map, V-01) |
| CH-7 | One user may hold several role assignments at once: of different roles, or of one role over different scopes. Assignments of the same user, the same role and the same exact scope never overlap in time; a replacement ends or supersedes the earlier one. Permissions and scopes of separate assignments never combine to widen authority, and nobody approves their own preparation. The canonical form of the scope and the reviewed constraint are settled before the first `access` migration that creates role assignments | — |
| CH-2 | PostgreSQL 17 for development and tests. Railway's actual major version is verified separately, before the first deploy of a migration to `dev` | — |
| CH-3 | For runtime work on synthetic data (local, tests, `dev`), the runtime role starts with a lock wait limit of 1 s and a statement limit of 5 s; a command that reaches one rolls back and reports the failure. Both are tuned after measurement. Longer limits for migration and maintenance, and the limits of `kdps-test` and production, are not set here. These are no server-wide settings and no performance promise | — |
| CH-4; H6 | Tests read invariants through the read models first, and by raw query only under a read-only database role, in isolated databases with synthetic data | — |
| CH-5 | Audit partitions are created ahead by restricted maintenance, at an Organisation's setup and on a schedule. A failure to cover the coming months raises an alert, and an audit record is never silently dropped. Partitions stay by recording month. The creation mechanism and how far ahead it reaches are specified with the first `audit` migration | — |
| H1 to H5 | A test-only synthetic document driver exercises the real stock and posting logic (H1). The ledger accepts registered callers only, and synthetic callers exist only in tests (H2). Harness documents live in a test-only schema (H3). Synthetic approval action types go through the real approval machinery (H4). The harness runs only in isolated test databases, never live (H5). Every golden scenario stays: receipt, transfer, sale, customer return, cost established at PT approval, late cost change, opening count, the supplier-return legs, damage, count and reversals. Tests of the real source documents are still needed when those documents arrive | — |
| GC6-1 | Stage 1 proves, in this order of priority: product and supplier masters; opening quantities and values; purchase and receiving PT; the earlier-POS sales and returns comparison. The order overrides no dependency and drops no required format. Which files and layouts represent each is engineering coverage; KDPS's habits do not set the product baseline | — |
| GC6-2 | ExcelJS reads XLSX; SheetJS CE reads legacy XLS and XLSB. PDF.js reads selectable PDF text and Tesseract.js reads images when needed; a scanned PDF needs a separate conversion and a reviewed extraction. Structured spreadsheets are preferred. PDF or image extraction makes a reviewable draft, and an uncertain required field blocks publishing; nothing is guessed or published silently. No macro runs and nothing external is fetched. Before use, each library's version is checked as maintained, security-checked and compatible with the repository, and pinned; this entry authorises no installation. The CSV reader and further image formats stay open | — |
| GC6-3 | A workbook that depends on data in another workbook is refused before it is stored, with the reason and a request for a self-contained copy. Nothing is stripped silently, and no stale linked value is trusted. This rule alone refuses no ordinary hyperlink and no reference inside the workbook, and approves no external link | — |
| GC6-4 | Each new or changed layout and mapping version is approved by a separate authorised person before it is published. Drafting and validation may come first. An unchanged approved mapping needs no approval for each file | KDPS Owner (names the approvers) |
| GC6-5 | The builders choose, document and tune the technical caps at intake (uploaded and expanded size, rows, parser memory, processing time) within the approved safeguards, and test them with representative synthetic files. Excess is refused clearly and never truncated silently. A cap that blocks a required workflow is reported to the product owner. No number is fixed here; product rules, acceptance criteria and live-data permission stay the product owner's | — |
| GC6-6 | On `kdps-test`, intake refuses a file with customer-contact columns before storing it, even when they hold synthetic contacts, and offers a clean upload again; columns are never removed silently. Synthetic contact tests run in isolated development tests, not on `kdps-test`. Permission for real data stays separate (D-4, RR-180). An answer to question 37 that lets customer contacts in would be a new decision | KDPS Owner (question 37) |
| GC6-8 | On `kdps-test`, opening files may be mapped, staged and validated, showing errors and reconciliation totals, as a rehearsal that stays staged: it never publishes stock or financial balances. Policy 14 and the switch gates stay | KDPS Owner (D-4) |
| GC4-2 | An authorised Accounts maker prepares a change to an account, posting map, cost setting or voucher setting; a separate authorised Accounts approver decides it in the app. The CA's approval evidence is attached or referenced before the change takes effect. The CA need not use the app, and one piece of evidence may cover a named set of versions if it says which. Ordinary transactions under approved rules need no fresh CA approval. Version history stays and posted journals are never rewritten. This is the workflow only, not the Accounts and CA approval itself | Accounts, CA |
| GC4-4 | One internal journal series per book and financial year. The number lock is held briefly without breaking one-transaction posting. Concurrent posting and large jobs are proved before acceptance; if the performance test fails, the series is revisited with Accounts. Posting in ordered chunks would change atomicity and needs its own decision. Bill numbering is unchanged | Accounts |
| RR-047 (gap 1, G-3) | Gift-with-purchase, promotional and packaging goods are SKUs with an explicit purpose and their actual stock cost; giving one away does not make its cost zero. Their use is reported apart from merchandise sales | — |
| RR-047 (gap 2, G-7) | A brand may name an optional parent brand (its family), kept apart from its aliases | — |
| RR-047 (gap 3, G-6) | Brands and suppliers are linked many-to-many by effective-dated links. Each booking names its actual supplier; no exclusive supplier is inferred | — |
| RR-047 (gap 4, G-1) | Supplier cash-discount and interest terms are recorded as structured terms in stage 1. Calculating, applying and posting them wait for the later payment design | Accounts, CA (values and treatment) |
| RR-047 (gap 18, A-4) | An opening row keeps its original receipt date only where a source backs it; otherwise its original age is Unknown, and time since the switch is reported apart. Season is kept for grouping, and older seasons are flagged only through an explicit season order; a season proves no receipt date and no age. The season order and the cutoff for "old" are not set | KDPS Owner, Booking (season order and cutoff) |

- **Left open.** RR-042 (GC7-11) waits for the product owner's discount-module decisions: neither allocation reading is accepted; offer selection and combination, and line allocation, are separate decisions; the `S1-F11` acceptance case where the readings differ and the `S4-F02` live gate stay; and the CA's taxable-value confirmation stays separate. A question for the product owner: GC-6 section 12 and `S1-F13` plan a handler that posts synthetic opening counts on `dev`, while H2 and H5 keep synthetic ledger callers to tests; until it is answered, that handler runs in tests only. Also open at their gates: the stock-plan readiness check, derived from the approved opening path or an explicit zero declaration, and the devices check, with no invented replenishment threshold and no new business prerequisite (RR-016); where the counter build lives, `apps/counter` at `/counter/` being only an engineering proposal, recorded and reviewed before the counter run of `S1-F11` (RR-015); scope with several values of one fact, designed before the first stage 2 or 3 table that needs it (CH-6); the ledger interface and tables and the 25 baseline-only ledger sections, reviewed in DR-2 before `S1-F10` (RR-012, RR-018); GC-8 and GC-9 under DR-3, with the offline counter design before `S1-F12` and stage 1 exit, and the `S1-F14` synthetic restore drill with attachments, hashes, paused numbering and audit seals; house rules part B and deployment sections 5 and 9 before `S1-F01-T04`; the design-language and blueprint reviews before `S1-F01-T14`; RR-193 to RR-196 at their tasks; Railway's topology, version and wiring before the first `dev` demo (RR-187); the checks of reader compatibility and security, measured caps, representative fixtures and journal performance; the stage 1 exit evidence (server and counter calculations, stock and posting under both formulas and both pool modes, policy and readiness refusals, mappings, restore with attachments, concurrency, isolation and independent approvals, the 10,000-line PT parse, a large posting while counters sell), with G10a inventing no rounding rule and G10b waiting for the real rule before moving-average posting goes live; and every policy signature, KDPS value, Accounts and CA evidence, activity grant, real-data permission and production or restore gate. No earlier KDPS rate, account or threshold becomes a default.
- **Why.** Stage 1 gets one defined scope for the setup step, the harness, imports and the posting-map workflow, while every external approval, value and live gate stays where it was.
- **Changed.** No PRD or policy bullet changed. The PRD bullets for the RR-047 picks, and the design edits they need, come before the `S1-F03` code that implements them, through decision entries that cite this one. `access-and-approvals.md` 4.3, 9.11, 13.1, 15 and 16; `code-house-rules.md` status, 3.2, 4.3, 5.1, 7.3, 10.1, 10.4, 10.6, 11.4 and 13; `numbering-and-audit.md` 4.4; `imports-and-opening-data.md` 3.1, 6.4, 6.5, 6.7, 8.3, 9.2, 9.3, 10.1, 11, 12, 13.1, 15.1, 17 and 18; `books-and-posting.md` 5.4, 6.3, 15 and 17; `questions-for-kdps.md` the list's introduction, KDPS Owner 4, 37 and 59, Accounts 21 and CA 18; `AGENTS.md` "Code workspace"; the reports index; the implementation plan.

## DEC-113 — A secret shown once is not shown again on a replay

- **Date:** 6 Oct 2026 · **Decided by:** product owner · **Report item:** code house rules part B, CH-12 (RR-218), 6 Oct 2026
- **Question.** `PRD-INT-002` says an identical replay returns the original result. An answer that shows a secret, such as the authenticator secret at enrolment or a service identity's secret, would then show it again on a replay, while access-and-approvals 3.2 says the secret is never shown again (`PRD-SEC-014`).
- **Options.** The replay is refused and the request is started again, so the secret is shown once · The secret is kept, encrypted, until enrolment is confirmed, so a replay can return it.
- **Choice.** Refused. `PRD-INT-002` adds: an answer that showed a secret, such as an authenticator secret at enrolment, is never repeated: its identical replay is refused and the request is started again.
- **Why.** A secret shown twice could be taken from a retried answer. Starting enrolment again replaces the secret not yet confirmed, so nothing is lost and no unconfirmed secret stays usable.
- **Changed.** `PRD-INT-002` in `prd.md`. `code-house-rules.md` 12.6 and CH-12; readiness register RR-218.

## DEC-114 — An unmasked restricted value is not shown again on a replay

- **Date:** 6 Oct 2026 · **Decided by:** product owner · **Report item:** review of DEC-113, round 2 (code house rules 12.4, CH-13), 6 Oct 2026
- **Question.** Showing an encrypted field unmasked, such as bank details, is a command that asks for a fresh authenticator code and writes an access record (`PRD-SEC-001`, `PRD-SEC-007`). Under `PRD-INT-002` an identical replay of it would return the value again, with no fresh code, for as long as the idempotency record is kept.
- **Options.** Treat an unmasked restricted value like a secret: never repeated, the replay refused and the person asks again · Keep the answer encrypted and show it again on a replay only with a fresh code and a field grant still in force.
- **Choice.** Refused, like a secret. `PRD-INT-002` now reads: an answer that showed a secret, such as an authenticator secret at enrolment, or a restricted value shown unmasked, is never repeated: its identical replay is refused and the request is started again. Recovery is a new request, authorised in full.
- **Why.** Every showing of a restricted value then has its own fresh code, its own authorisation and its own access record, and no idempotency record holds the value.
- **Changed.** `PRD-INT-002` in `prd.md`. `code-house-rules.md` 12.3, 12.4, 12.6 and CH-13; `module-map.md` 4.1.

## DEC-115 — Sample layouts and the other file readers move to stage 2

- **Date:** 6 Oct 2026 · **Decided by:** product owner · **Report item:** stage 1 grilling, 6 Oct 2026 (G6)
- **Question.** `S1-F07` proved the sample layouts (the KDPS PT template, the chosen vendor-PT and earlier-POS layouts) on synthetic replicas, added the XLS, XLSB and CSV readers and measured the 10,000-line PT parse, all in stage 1. Their first users are stage 2 and 4 features (`S2-F04`, `S2-F12`, `S4-F10`), and `DEC-112` GC6-1 put purchase and receiving PT and the earlier-POS comparison in stage 1's proof order. Should the feature stay in stage 1?
- **Options.** Keep `S1-F07` in stage 1 · Move it to stage 2 as its first feature, keeping in stage 1 what the opening-data work needs.
- **Choice.** Move it to stage 2 as `S2-F13` "Sample layouts and readers", first in stage 2's order; `S2-F04`, `S2-F12` and `S4-F10` depend on it in place of `S1-F07`. It takes the XLS, XLSB and CSV readers (with RR-033's CSV reader), the sample layouts, the 10,000-line structured PT parse (RR-189's stage 1 part) and imports-and-opening-data 17 tests 1 (other formats), 3 to 10, 19 and 27. `S1-F06` keeps a complete XLSX intake test. Comparison runs, a synthetic SOH layout and the historical-reference handler stay in stage 1, because `S1-F13` needs them; `S1-F13` stays in stage 1, last (`POL-14.07`, `DEC-013`). This amends `DEC-112` GC6-1: stage 1 proves intake with XLSX, product and supplier masters, and opening quantities and values; purchase and receiving PT and the earlier-POS sales and returns comparison are proved in stage 2. The label `S1-F07` is not reused.
- **Why.** The layouts and readers are proved beside the features that first use them. No stage 1 exit check needs them, stage 1 keeps one complete intake path, and no required format is dropped.
- **Changed.** No PRD or policy text changes. `phases.md` stages 1 and 2; `plan/roadmap.md` (the `S2-F13` row and the dependencies of `S2-F04`, `S2-F12` and `S4-F10`); `plan/stage-1/README.md` and `plan/stage-1/spec.md`; RR-033 and RR-189 in `plan/open-items.md`.

## DEC-116 — Stage 1 open questions answered

- **Date:** 6 Oct 2026 · **Decided by:** product owner · **Report item:** stage 1 open questions Q1 to Q23 and the stage 1 grilling (G1 to G10), 6 Oct 2026
- **Question.** Questions stood open at stage 1 gates: recovering the first two users' credentials (RR-206), sign-in throttling (RR-209), pending users and their assignments (RR-215), landing screens (RR-212), approval routing, which operations the policy gate covers, what the readiness checks verify (RR-016), how tax-rule records are approved, external links in sheets (RR-201), the synthetic opening-count handler (RR-013), and technical picks in the designs. Which answers does stage 1 build to?
- **Options.** Answer them now, as below · Leave each at its gate.
- **Choice.** Answer them now.
  - **Q1 (RR-206, GC3-13).** A platform-operator recovery command (an operator command like setup, never an API route) restores a lost password or authenticator of the first Admin or the first approver, only while no Organisation user holds the credential-reset permission. It verifies the person's identity and records how, revokes their sessions, writes an access record, and grants no role or permission.
  - **Q2 (RR-209, GC3-5).** Throttling counts sign-in attempts by typed login and by source address. A login that exists and one that does not get equivalent answers: the same refusal and the same slowing. The threshold values stay OPEN (RR-054).
  - **Q3 (RR-215).** A user's first version and their role assignment may wait together; deciding the assignment is refused until the user's version is approved; rejecting the user withdraws their pending assignments.
  - **Q5 (RR-212).** A person lands on their persona's home screen when their roles grant it, otherwise on the first screen their roles grant in the persona's menu; the first Admin lands on Setup › Users (`PRD-ACS-002`).
  - **Q6.** design-language 10.14's "Send to ‹next approver›" action is removed. A request waits for an approver whose limit covers it (`POL-02.09`, `DEC-043`) and escalates as `S1-F05` sets out (access-and-approvals 9.4).
  - **Q8.** structure-and-masters 9 test 4 is proved in stage 1 with a Scheduled (future-dated) Store–Site link version only; the relocation flow stays in stage 5 with test 17 (`PRD-LIF-029`).
  - **Q10 (a reading of `PRD-SEC-017`, like `DEC-044`).** Setup and configuration operations (access, structure, masters, book setup, readiness, policy readiness) are not policy-gated, because they are how a policy gets configured; they still need their permissions and independent approvals. Operations that record business effects are gated: stock or money posting, opening-data publishing, device selling. A synthetic Organisation may record a labelled synthetic Signed status for tests and demos; never on `kdps-test` or production (`DEC-071`).
  - **Q11 (DM-6).** The person who entered a policy's values cannot validate them. No rule requires the person who records Signed to differ from the validator. This replaces the earlier ticket and spec wording "Signed and validated by different people".
  - **Q12 (RR-016; `PRD-LIF-002`, `PRD-LIF-003`).** The readiness checks verify: users and access, that every permission the activity needs is held by someone with an active assignment covering the unit, and every independently approved action has two different people able to prepare and approve; required policies, that the Available check passes for each policy the activity's operations need (Q10); stock plan, an approved opening plan (not an already-completed opening posting) or an explicit zero declaration, meaning the unit genuinely holds no stock; devices, as GC-8 11. No replenishment threshold and no new business prerequisite.
  - **Q13.** With no open exception-code series, the operation that would raise a numbered exception is unavailable and the Available check names the missing series; failed-job records and their diagnostic evidence are still kept in the operations view (`PRD-SEC-013`), so nothing is lost.
  - **Q15 (a reading of `POL-10.05`).** Tax-rule records are approved like posting maps (`DEC-112` GC4-2): an Accounts preparer, a different Accounts approver, and the CA's evidence attached or referenced.
  - **Q16.** Book settings, the chart of accounts and tax configuration are API only in stage 1; their screens are designed and built before the first live posting in stage 2.
  - **Q17 (RR-201, GC6-17).** An ordinary external hyperlink in a sheet is kept as inert text, never followed or rendered as a live link, and the file is accepted; nothing follows it, so imported content still executes no external link (`PRD-SEC-011`). The cross-workbook dependency refusal (`DEC-112` GC6-3) is unchanged.
  - **Q19 (RR-013, GC6-18).** The synthetic opening-count handler runs in tests only (`DEC-112` H2, H5).
  - **Technical picks and grilling approvals.** Q4 (the Withdrawn state and its mechanism, RR-202), Q7 (due times and escalation on Setup › Exception rules; the failed-jobs list), Q9 (`S1-F06-T05` stored files and evidence attachments), Q14 (the "has this book held stock?" contract), Q18 (a minimal `ebo-imports` module), Q20 (device enrolment without a bill format or financial-year dates), Q21 (device state names, GC8-7), Q22 (`S1-F08-T04`) and Q23 (RR-224), with G1 to G5 and G8 to G10 (the stock ledger choices, lock order and stock row security, GC-8's stage 1 sections, GC9-9 and GC9-10, the ticket regrouping, the `dev` pool and the demos), are written into the designs and the plan, not repeated here. G6 is `DEC-115`; G7 keeps `S1-F13` in stage 1.
  - No KDPS value is set: the throttling thresholds stay RR-054; the `dev` backup-key custodian is named by the product owner before the restore drill (RR-236); production backup-key custody is for KDPS's Owner and Admin under policy 18 (`POL-18.02`; KDPS Owner 62, RR-237) and blocks live use only.
- **Why.** Each answer stays inside the PRD and the policies: Q10 and Q15 read them as they stand, and the rest settle design and workflow they leave open, so stage 1 code can go on without guessing.
- **Changed.** No PRD or policy text changes. The designs each answer names (access-and-approvals, design-language, structure-and-masters, books-and-posting, imports-and-opening-data, offline-counter, backup-and-restore, stock-ledger, module-map, code-house-rules); the stage 1 spec, README and tickets; `plan/open-items.md`, `plan/kdps-values.md` and `questions-for-kdps.md` (KDPS Owner 62).

## DEC-117 — Stage 1 follow-up answers

- **Date:** 6 Oct 2026 · **Decided by:** product owner · **Report item:** questions found while writing `DEC-116` into the designs and tickets, 6 Oct 2026
- **Question.** Writing the stage 1 answers in raised eight more: how a stock header row carries its brand set for row-level security (CH-6); how a brand-limited command respects holds and freezes it cannot see; when evidence files are checked; how a device enrolled before its bill format or financial year gets its series; what "approved opening plan" means for the stock-plan readiness check; what state a rejected user's pending assignments take; the colour family of Withdrawn; and whether a merge into `main` is a deployment.
- **Options.** For each, the recommendation put to the product owner, or an alternative (a child table of brand rows; brand-free control rows only; checks only with workbook intake; a separate device-series action; a new opening-plan record; "Cancelled").
- **Choice.**
  - **Brand sets (CH-6, for brands).** A row that can cover goods of several brands stores its brand set on the row, and access requires the actor's assignment to cover every brand in it.
  - **Hidden rows.** A unit anchor carries no brand and is matched by place. A command's rechecks under lock read holds and count freezes hidden from its actor through one narrowly authorised internal check, which returns a generic refusal and never the hidden row's details.
  - **Evidence files.** Their validation and size limits come with the first upload ticket, `S1-F06-T05`.
  - **Device series.** When an approved change defines the bill format or the financial-year dates, it creates the missing series for every Active device; retry-safe, and it never replaces or resets an existing series.
  - **Stock plan.** An approved, unpublished opening-data batch for the unit, its approval and scope checked independently of activation, so the dependency is not circular; or a zero declaration meaning genuinely no stock (`PRD-LIF-003`).
  - **Withdrawn.** It also covers a request withdrawn before approval, such as a rejected user's pending assignments; the record keeps whether it was withdrawn before approval or before taking effect, and why. Its colour family is Neutral.
  - **Merges.** Because `main` deploys to `dev` automatically, an approval to merge must say explicitly that it includes that deployment. This decision authorises no merge.
- **Why.** Each closes a gap the stage 1 designs left, inside the PRD and the policies, so the stock, file, device, readiness and access tickets can be built without guessing.
- **Changed.** No PRD or policy text changes. code-house-rules 6.2 and CH-6; stock-ledger 14.1, 14.3 and SL-25; imports-and-opening-data 9.3; offline-counter 4.1; domain-model 3.6; access-and-approvals 4.3; design-language section 7 (state 64); deployment.md section 1; `AGENTS.md` "How we work"; tickets `S1-F06-T02`, `S1-F06-T05`, `S1-F10-T01`, `S1-F10-T02`, `S1-F12-T01`, `S1-F04-T02`, `S1-F13-T01`, `S1-F01-T13`.

## DEC-118 — Stage 1 access, screen and worker answers

- **Date:** 7 Oct 2026 · **Decided by:** product owner · **Report item:** open items left by `S1-F01` and its review: RR-321, RR-260, RR-310, RR-280, RR-262, RR-270, RR-330, RR-334 (with code-house-rules 12.14), RR-360, RR-240; 7 Oct 2026
- **Question.** Building `S1-F01` left questions only the product owner could answer: whether disabling a user must take effect the same day; what sign-in does when a security setting is missing; where a person lands with no granted screen; which time zone screens use; whether enrolment shows a QR code, and how; how the fonts are bundled; the worker's retries for synthetic work and its sealing interval; what to do with the seed's two Organisations; how essential security settings change after setup; whether the role joins the first locking step; and how the audit partitions are kept up between deploys.
- **Options.** For each, the choices put in the open item: accept the as-built wait or make disabling immediate; a default or a block; My work or another screen; the device's or the Organisation's time zone; no QR code, code of our own, or a library in the Stack; fonts committed or from a package; the proposed retries or others; new synthetic codes, moving the seed onto the setup step, or dropping its Organisation part; with the settings screens or sooner; the role at step 0 or not; a separate Railway service under the migration role or the existing worker.
- **Choice.**
  - **Same-day disabling (RR-321).** Required. Once a disabling or ending is approved, it removes access at once: every session of the user is revoked and no new sign-in is allowed, from the moment of the decision, not from the next business day. New `PRD-SEC-019`.
  - **Missing security settings (code-house-rules 12.14).** Sign-in is blocked while a required security setting is missing, and the refusal names it; nothing falls back silently to a value. The setup step validates that the required settings are present and refuses a request without them.
  - **Landing (RR-260).** A person lands on My work when they may use it, that is when they hold a role assignment in force; otherwise on a clear "No access assigned" page with sign-out. This completes `DEC-116` Q5.
  - **Time zone (RR-310).** Screens show times, and business dates are worked out, in the Organisation's configured timezone, whatever the device's; timestamps are stored in UTC. New `PRD-MOD-017`.
  - **Authenticator QR code (RR-280).** Enrolment shows a QR code, generated inside the app by a maintained QR library, never through an outside QR service; the setup key stays as the manual fallback. The PRD Stack's Authentication row names the library.
  - **Fonts (RR-262).** The design's font files are self-hosted, committed with the app under their licence; no extra package.
  - **Worker retries (RR-270, part).** For transient failures, five attempts in all, with increasing delays and jitter, as a provisional default for synthetic and test work only, never a KDPS value and never a default in code. Failed jobs stay visible. The sealing interval and the other interval jobs (seal every 15 minutes, check seals hourly, check partition coverage hourly, as proposed) are **not** approved and stay OPEN with the product owner.
  - **Test Organisations (RR-330).** The seed's two synthetic Organisations are initialised through the supported setup step, each with its own first Admin and first approver.
  - **Essential security settings (RR-334).** The general settings screen waits for its planned task (`S1-F04`). The essential security settings (sign-in throttling, password rules, session limits) get a supported, authorised and independently approved way to change after setup now.
  - **Role locking (RR-360).** Yes: a role change and a command relying on that role cannot pass each other. The role joins the authority rows locked at step 0, shared when relied on and exclusive when a role version takes effect, in the existing lock order (`PRD-INT-003`).
  - **History upkeep (RR-240).** The audit partitions are kept up by a job of the existing worker on a schedule, independent of deployments. Its failures are visible; upkeep never deletes history.
- **Why.** Same-day disabling and the Organisation's timezone close gaps the PRD left; a missing setting blocks rather than guesses (`AGENTS.md` "Never invent a value", `PRD-SEC-017`); a QR code in the app helps KDPS staff enrol without sending the secret to anyone else; self-hosted fonts keep the one origin; the retry default lets the worker run on `dev` without making a KDPS value; and the setup step, the lock order and the worker are reused rather than adding new paths.
- **Changed.** `prd.md`: new `PRD-SEC-019` and `PRD-MOD-017`; the Stack's Authentication row. `AGENTS.md` Stack table. access-and-approvals 2.1, 3.1, 3.2, 3.3, 9.5, 9.11, 15 and 16; personas.md section 2; design-language 3, 8 and 10.20; code-house-rules 3.2, 5.1, 8.2, 9, 11.2, 12.9, 12.14, CH-5 and CH-10; numbering-and-audit 4.4; deployment.md section 2. `plan/open-items.md`; tickets `S1-F01-T22` to `S1-F01-T25`; `STATUS.md`. No policy text changes.

## DEC-119 — Worker timings for synthetic and test work

- **Date:** 7 Oct 2026 · **Decided by:** product owner · **Report item:** RR-270 (the part `DEC-118` left OPEN) and the upkeep job of RR-240; 7 Oct 2026
- **Question.** Which interval and limit values the worker uses for synthetic and test work, beyond the five attempts `DEC-118` approved.
- **Options.** The values proposed in RR-270, or others.
- **Choice.**
  - Seal closed audit blocks every 15 minutes; verify the seals hourly.
  - Check the audit partition coverage hourly, creating partitions ahead of need through the worker's upkeep job (`DEC-118`, RR-240).
  - Poll for jobs every 5 seconds.
  - First retry after 10 seconds, then increasing delays with jitter; five attempts in all (`DEC-118`).
  - A limit of five minutes per attempt for ordinary jobs. Import and restore jobs get their own, longer limits, set with those jobs (`S1-F06`, `S1-F13`, `S1-F14`). A timeout never makes a committed action run twice: every job step keeps its idempotency (`PRD-INT-002`, `PRD-INT-008`).
  - As with `DEC-118`, these are provisional values for synthetic and test work only, labelled synthetic, never KDPS values and never defaults in code.
- **Why.** They let the worker run on `dev` and in tests now, as proposed, while the values of `kdps-test` and production stay with their own decisions.
- **Changed.** Applied by `S1-F01-T24`: code-house-rules 12.9 and CH-10, the synthetic worker settings, `plan/open-items.md` RR-270.

## DEC-120 — First roles and settings, planned interruptions on `dev`, assignment validity

- **Date:** 7 Oct 2026 · **Decided by:** product owner · **Report item:** RR-402, RR-370, RR-400 and RR-390, left by `S1-F01-T22`, `S1-F01-T24` and `S1-F01-T25`; 7 Oct 2026
- **Question.** Whether the two roles the setup step creates may change the essential security settings; whether a migration that briefly breaks the running version may be deployed to `dev`; and how often the grants rebuild runs, and whether it decides who may act.
- **Options.** Keep the 9.11 matrix, or give the first Admin edit and the first approver approve on the settings; accept the short window, or add-then-remove migrations over two deploys; a synthetic interval for the rebuild, with or without the rebuild deciding access validity.
- **Choice.**
  - **First roles and security settings (RR-402).** "Give the starting roles their intended security-settings permissions, keeping proposer and approver separate." The first Admin may prepare and edit the essential security settings, the first approver may approve them; neither holds both (`PRD-ACS-006`, `POL-02.07`).
  - **Planned interruption on `dev` (RR-370, RR-400).** "Allow a planned brief interruption on the sample-data test server." A migration not compatible with the running version may be deployed to `dev`, which holds only synthetic data, as a planned brief interruption; `kdps-test` and production keep the add-then-remove rule.
  - **Assignment validity (RR-390).** "Use a one-minute assignment recheck for testing. Expired assignments must stop authorising actions immediately; the sweep must not determine access validity." The grants rebuild runs every 60 seconds in synthetic and test work only, labelled synthetic, never a KDPS value or a default in code. An assignment, and the role version it grants through, authorise only while their dates hold today, checked when authorising and by row-level security when reading; the rebuild only refreshes the effective grants and publishes what changed.
- **Why.** The first two roles can then run a settings change through independent approval without another role; the test setup can take the planned migrations without a second deploy; and access never waits for a job.
- **Changed.** No PRD or policy text changes. access-and-approvals 7.1, 7.2, 9.11 and 13.1; code-house-rules 4.2, 6.2, 12.9 and CH-10; the synthetic worker settings; `plan/open-items.md` RR-402, RR-370, RR-400, RR-390; ticket `S1-F01-T26`.

## DEC-121 — Test sign-in buttons on the development environments

- **Date:** 7 Oct 2026 · **Decided by:** product owner · **Report item:** the Railway `dev` demo of `S1-F01`; 7 Oct 2026
- **Question.** Signing in on the test server needs the password and the authenticator code every time. May the development environments have one-click sign-in buttons for the SYNTHETIC first users?
- **Options.** Keep the same sign-in as production on development (deployment.md D-6, `DEC-105`); long session limits and a password manager instead; buttons on the developer's own machine only; buttons on `local` and `dev`.
- **Choice.** Buttons on `local` and `dev`, below the Sign in form: one per SYNTHETIC person the server's `AOS_DEMO_SIGN_IN` lists, signing in without the password or the authenticator code. Only where `AOS_ENVIRONMENT` is `local` or `dev`; the server refuses to start with the list set anywhere else or naming an Organisation whose code is not SYNTHETIC; the person must still be Active; each one writes an access record of its own kind, `demo-sign-in`. Removed by unsetting the variable, before KDPS has access to any environment that has it.
- **Why.** The URL is shared with nobody, the data is synthetic, and re-entering a password and code for each test is slow. `POL-02.17` already allows "Any easier test path" that is "development-only and cannot weaken production authentication", and `PRD-ACS-017` keeps development test access apart from production authentication; the switch lives only in development environments' settings, so production authentication is unchanged.
- **Changed.** No PRD or policy text changes. deployment.md section 3 and D-6 (the design's "no easier path" on development is replaced); access-and-approvals 3.4 (new); numbering-and-audit 5.2 (the new access-record kind); code-house-rules 12.14; `AGENTS.md`; ticket `S1-F01-T28`.

## DEC-122 — The worker's internal service identities in an existing Organisation

- **Date:** 9 Oct 2026 · **Decided by:** product owner · **Report item:** RR-457, left by RR-331 (`add-service-identities`); 9 Oct 2026
- **Question.** `PRD-ACS-023` says that after the setup step every change to roles, permissions, role assignments and approval rules needs approval by a different authorised person. The operator command that gives an existing Organisation the worker's new internal service identities writes their roles and assignments with no second person, as the setup step does. Allow it, or make it a prepared and approved change?
- **Options.** Allow it as an exception logged here; or rebuild it as a prepared change a second person approves before the identity takes effect.
- **Choice.** Allow it. The worker's internal service identities, whose grants come from the deployed build's registry, which grant no person anything and which no user can view, are written by the setup step or by the operator command `add-service-identities`, with audit records, and need no second person's approval. Every other change to roles, permissions, role assignments and approval rules still does.
- **Why.** These identities are part of the deployed software, not of anyone's access: their grants are fixed by the reviewed code, a person cannot hold them, and requiring an approver for each deploy that adds a job would stop the worker without adding control.
- **Changed.** `PRD-ACS-023` (one sentence added). access-and-approvals 9.11a; `plan/open-items.md` RR-457.

## DEC-123 — Master picks of `DEC-112` written into the PRD

- **Date:** 9 Oct 2026 · **Decided by:** product owner · **Report item:** RR-047 (data notes gaps 1, 2, 3, 4 and 18), whose answers `DEC-112` gave on 5 Oct 2026
- **Question.** `DEC-112` settled five master picks but left their PRD bullets to be drafted and approved before `S1-F03`. Approve the bullets as drafted?
- **Options.** Approve as drafted; approve with changes; keep RR-047 open.
- **Choice.** Approved as drafted:
  - gift-with-purchase, promotional and packaging goods are SKUs with an explicit purpose and their actual stock cost, their use reported apart from merchandise sales (gap 1), with "Gift-with-purchase" defined apart from "Gift voucher";
  - a brand may name an optional parent brand, apart from its aliases (gap 2);
  - brands and suppliers are linked many-to-many by effective-dated links, no exclusive supplier is inferred, and each booking names its actual supplier (gap 3);
  - supplier cash-discount and interest terms are recorded as structured terms; calculating, applying and posting them follow a later payment design, with values and treatment set by Accounts and the CA (gap 4);
  - an opening row keeps its original receipt date only where a source backs it, otherwise its original age is Unknown, time since the switch is reported apart, and season proves no age, older seasons being flagged only through an explicit season order (gap 18).
- **Why.** The picks were already decided in `DEC-112`; the PRD must say them before the code that implements them (`S1-F03`, `S1-F13`).
- **Changed.** PRD "Words used" (new row Gift-with-purchase); `PRD-MER-019`, `PRD-MER-020`, `PRD-MER-021`, `PRD-BKG-014`, `PRD-PAY-015`, `PRD-LIF-030`, `PRD-LIF-031` (new). structure-and-masters 4.1, 5.1 and 5.2; imports-and-opening-data 10.2; `plan/open-items.md` RR-047. Still OPEN: the season order and the cutoff for "old" (RR-199); the supplier-term values (RR-235).

