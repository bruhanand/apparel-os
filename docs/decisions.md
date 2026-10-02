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
