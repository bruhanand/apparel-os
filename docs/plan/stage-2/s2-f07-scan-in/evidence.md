# Stage 2 first version — Acceptance evidence

> **Not ranked.** Evidence for the "Done when" of [S2-F07-T02](tickets/T02-first-version-acceptance.md): the first version of goods-in, tested end to end. It decides nothing; acceptance is the product owner's. The design it checks is [goods-in.md](../../../design/goods-in/goods-in.md) section 12; the exit checks are those of the [stage 2 README](../README.md) section 7 and [roadmap.md](../../roadmap.md) 2.1 to 2.3.

**How to read the codes.** `PRD-…` is a requirement of the [PRD](../../../prd.md) and `POL-…` a policy answer; `DEC-…` is a decision in [decisions.md](../../../decisions.md); `RR-…` is an open question in [open-items.md](../../open-items.md) or [kdps-values.md](../../kdps-values.md). "Test 12" means goods-in section 12, test 12. A file name ending `.int.test.ts` is a test against a real PostgreSQL database (in `apps/server/test/`); one ending `.spec.ts` is a browser journey, a person clicking through the screens (in `apps/web/e2e/`). Every person, place, product, price, budget and limit in them is SYNTHETIC.

## 1. The runs

Local runs on branch `s2/review-10-fixes` (the fixes of code review 10), 23 Oct 2026, on a development laptop whose Docker and processors were **shared with other work** (load average 2 to 4 during the runs).

| Check | Result |
| --- | --- |
| `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm check:modules`, `pnpm check:links`, `pnpm format:check` | Passed |
| `pnpm test` (unit tests) | Passed: server 85 files, 623 tests; web 187; calculations 193; schemas 93; domain 18; counter 5; ui 2 |
| `pnpm test:integration` (two files at a time) | 118 files, 1,649 tests passed (633 s) |
| `pnpm test:e2e` (two journeys at a time) | 48 of 49 browser journeys passed (6.3 min, the server's start included); the joined journey took 32 s. The one failure, the PT approval journey (`pt-approval.spec.ts`), did not see the "Accepted" message of its last scan, though the scan was accepted; run again alone, it passed (35 s) |

Earlier runs, on branch `s2/f07-t02-acceptance`: 1,645 integration tests passed (830 s), and all 49 journeys (5.6 min).

CI (the checks GitHub runs on every push) has **not run**: the branch is not pushed. It runs once the product owner allows the push.

## 2. What was added for this ticket

- **The joined browser journey** (test 22), `goods-in-journey.spec.ts`: six people take one style of two pieces from a booking to stock on sale at a Store. At each step the server refuses one of them once, the reason on screen, and that person then does the step right:
  1. Booking (P-BKG) records the booking; submitting is refused until the booking document is attached.
  2. The Owner (P-OWN) approves it: refused, because the brand and season have no approved open-to-buy budget.
  3. Booking prepares the budget and, while Accounts (P-ACC) has its check open, corrects the amount. Accounts' check of the replaced version is refused ("a newer version replaced this request"); Accounts opens the newer one from My work and checks it. Accounts is then refused approving what they checked (a third person must, `DEC-142`); the Owner approves the budget, then the booking.
  4. Warehouse (P-WHS) receives against the booking: the Arrival is refused for an arrival time later than now, then recorded with the right time; the count waits for the supplier invoice.
  5. Warehouse counts one piece of two; the browser is restarted and the count is still there; issuing the GRN is refused because nobody owns a shortage at that Site; the second piece is found and, added as a new line, refused, since the count already has a line for that style, colour and size; that line is changed instead, the GRN issued and its line linked to the booking.
  6. A PT file is refused whole, every problem listed; the next file is submitted.
  7. Operations (P-OPS) rejects that PT with a reason (its P RATE left out the handling). Approving the corrected file with the authenticator code they had just used is refused ("already used"); with the new code it is approved.
  8. A Store's staff (P-STM) scan the pieces in on a phone-sized screen: a barcode not on the PT is refused; after one piece the browser restarts and the scan-in carries on where it stopped.
  9. Stock search shows both pieces on the floor, available to sell, cost hidden from the Store's staff and ₹1,890.00 at cost to Accounts. Booking is refused Stock search, naming the permission, and Booking status shows the booking delivered in full.
- **Test 19 across the whole flow**, `goods-in-acceptance.int.test.ts`: every write from the budget to the scan-in is sent twice under the same idempotency key (the label a client puts on a request so that sending it again is recognised). Every second answer must equal the first and be marked as a replay (`Idempotent-Replayed`), and the end state must be what one sending makes: one budget reserving ₹1,000.00 once, one booking delivered once, one Arrival, one GRN, one PT posting ₹1,890.00 once, two pieces on sale. The same file also issues one GRN twice at the same moment, under two keys and under one key (section 3).
- **A defect it found, fixed:** starting a PT file's import sent again under its key was refused (`files-imports.file-already-imported`, "this file is already being imported", or, once its PT was published, `files-imports.subject-refused`) instead of getting its first answer, against `PRD-INT-002` and code-house-rules 12.4. As fixed after code review 10: every refusal of the start except "not allowed" and "not found" is answered under the key, after the key is looked up, so a request sent again gets its first answer whatever happened since; and the duplicate refusal is decided under the stored file's lock, so a batch withdrawn in between leaves no stale refusal ([imports-and-opening-data.md](../../../design/platform/imports-and-opening-data.md) section 7 "As built", "Checked three times", which gives the order of the refusals). Proved by a start sent again after its batch is published, for a product file (`imports-duplicates.int.test.ts`) and a PT file (`goods-in-acceptance.int.test.ts`), and by an earlier batch withdrawn between the start's read and its transaction (`imports-duplicates.int.test.ts`). The same fault would have hit any import, opening data included, whose client sent its start again after losing the answer.

## 3. Each design test of goods-in section 12, and where it is proved

| Test | What | Where |
| --- | --- | --- |
| 1 | Invoice 10, counted 8: custody 8, shortage with Booking | `receiving-findings.int.test.ts` |
| 2 | Clean, excess, wrong, unidentified and damaged lines held apart; PT upload waits | `receiving-findings.int.test.ts`, `pt-upload.int.test.ts`; `held-lines.spec.ts` |
| 3 | No invoice, no count | `receiving.int.test.ts`; `receive-goods.spec.ts`, `goods-in-journey.spec.ts` |
| 4 | Booking approval against open-to-buy and the Agreement | `bookings.int.test.ts`, `booking-lifecycle.int.test.ts`; `booking.spec.ts`, `goods-in-journey.spec.ts` |
| 5 | Delivered and outstanding from real GRNs | `receiving-against-booking.int.test.ts` |
| 6 | GRN lines link to bookings or go to review | `receiving-against-booking.int.test.ts`; `receive-against-booking.spec.ts` |
| 7 | Overdue balances reach Booking; nothing cancelled | `booking-lifecycle.int.test.ts` |
| 8 | PT file refusals, each listed | `pt-upload.int.test.ts`; `pt-upload.spec.ts` |
| 9 | Colour not compared | `pt-upload.int.test.ts` |
| 10 | New products; a barcode on two products kept for both | `pt-upload.int.test.ts`, `catalogue-products.int.test.ts`, `catalogue-routes.int.test.ts` |
| 11 | PT approval: not by the uploader; limit on P RATE × QTY; posting; refusals | `pt-approval.int.test.ts`; `pt-approval.spec.ts` |
| 12 | Two approvals of one PT at once; a recount against a PT approval | `pt-approval.int.test.ts` ("approvals at once") |
| 13 | Nothing sellable until the scan-in | `receiving-scan-in.int.test.ts`; `goods-in-journey.spec.ts` |
| 14 | Scan-in refusals, repeated barcodes, damage, stop and resume, the last piece scanned twice at once | `receiving-scan-in.int.test.ts`; `pt-approval.spec.ts`, `goods-in-journey.spec.ts` |
| 15 | A PT reversed before the scan-in | `pt-reversal.int.test.ts`; `pt-approval.spec.ts` |
| 16 | Damage holds at once; rejection releases only its hold | `damage-reports.int.test.ts`; `damage-reports.spec.ts` |
| 17 | Store and warehouse meet the same checks | `receiving-scan-in.int.test.ts` |
| 18 | No receiving without approved readiness or a verified mapping | `receiving.int.test.ts`; `site-readiness.spec.ts`, `receive-goods.spec.ts` |
| 19 | A GRN issued twice gives one GRN; every write replays its first answer | `receiving.int.test.ts`, `goods-in-acceptance.int.test.ts` (whole flow; a GRN issued twice at once), `receiving-scan-in.int.test.ts`, `bookings.int.test.ts`, `damage-reports.int.test.ts` |
| 20 | A reader of one Store sees only it; cost hidden without the permission | `receiving.int.test.ts`, `stock-search.int.test.ts`, `stage-2-reports.int.test.ts`; `goods-in-journey.spec.ts` |
| 21 | 10,000 lines: the file check within a minute; the approval posted by the job | `pt-upload.int.test.ts`, `pt-approval-large.int.test.ts`; section 5 |
| 22 | The joined browser journey | `goods-in-journey.spec.ts` |

**The concurrency cases** (tests 12, 14, 19). Each race is forced, never left to timing (code-house-rules 10.3): the first request runs in a transaction of its own and is held, after it has taken its locks and written, until the database shows the second waiting for a lock; only then is the first let go (`heldUntilSecondWaits` in `test/support/transactions.ts`). Each was also run once with the lock that keeps the two apart taken out of the code, and failed, so the test catches a missing lock.

| Case | How it is forced | Proved | With the lock taken out |
| --- | --- | --- | --- |
| Two approvals of one PT at once (`PRD-ACP-002`, `PRD-INT-005`; `pt-approval.int.test.ts`) | The first approval held after posting, under its locks of the approval request and the PT; the second sent through the route | The second is refused (`access.approval-not-open`); ₹1,890.00 posted once, the pieces covered once | The second fails (500) |
| The last piece scanned twice at once (`PRD-INT-003`; `receiving-scan-in.int.test.ts`) | The first scan held after accepting the piece, under its lock of the GRN | The second is answered "nothing left"; one piece accepted | The stock ledger refuses the second instead |
| A GRN issued twice at once, two keys (`PRD-INT-003`; `goods-in-acceptance.int.test.ts`) | The first issue held after writing the GRN, under its lock of the Arrival | The second is refused (`receiving.grn-issued`); one GRN | The second fails (500) |
| A GRN issued twice at once, one key (`PRD-INT-002`; `goods-in-acceptance.int.test.ts`) | A synthetic blocker holds the Arrival, so the first issue waits with its key taken; the second, under the same key, is seen waiting on the key; then the blocker lets go | The second answers the first answer, marked as a replay; one GRN | Not applicable: the key's own unique index keeps them apart |
| Two booking approvals at once (`PRD-INT-003`; `bookings.int.test.ts`) | The first approval held after reserving, under its lock of the open-to-buy budget | The second is refused (`booking.open-to-buy-short`); the budget reserved once | The second is approved too, over-reserving |
| A recount and a PT approval (`PRD-REC-019`; `pt-approval.int.test.ts`) | Not a race: a recount is refused from the moment the PT file is submitted, before and after the approval | Both orders refused (`receiving.pt-attached`) | — |
| Every write of the flow sent twice (`PRD-INT-002`; `goods-in-acceptance.int.test.ts`) | One after the other under one key, as a client that lost the answer sends it | Each second answer is the first, marked as a replay | — |

## 4. The persona journeys, with recovery (roadmap 2.2)

"Recovery" is read here as: the person meets a refusal, sees why, and then does the step right themselves; and unfinished work survives a browser restart (RR-670 asks the product owner to confirm). What each persona meets, and how they recover; "form check" marks a refusal the screen makes before sending anything, every other one is the server's:

| Persona | Journeys | Refused, then recovers |
| --- | --- | --- |
| Booking (P-BKG) | `booking.spec.ts`, `open-to-buy.spec.ts`, `receive-against-booking.spec.ts`, `stage-2-reports.spec.ts`, `goods-in-journey.spec.ts` | Submitting without a document, then attaches it; an Issued date in the future, then today's; checking their own budget, which Accounts then checks. Refused Stock search and the stock report, which their role does not give: shown why, nothing to recover |
| Warehouse (P-WHS) | `receive-goods.spec.ts`, `held-lines.spec.ts`, `recount.spec.ts`, `receive-against-booking.spec.ts`, `pt-upload.spec.ts`, `pt-approval.spec.ts`, `goods-in-journey.spec.ts` | A GRN whose shortage has no owner, then counts again; an extra piece not said received or not (form check), then says it; a recount at the same count, then at the right one; an Arrival without its booking (form check), then names it; an arrival time later than now, then the right one; a count line repeated, then changes the line; a PT file refused whole, then a corrected one; a PT Operations rejected, then the corrected file; a browser restart mid-count. Refused damage on a product where no rule routes it: shown why |
| A Store's staff (P-STM) | `receive-goods.spec.ts`, `damage-reports.spec.ts`, `pt-approval.spec.ts`, `goods-in-journey.spec.ts` | A GRN without batch and expiry, then adds them; damage on more pieces than are there, then on two; a barcode not on the PT, then the right one; a browser restart mid-scan-in |
| Accounts (P-ACC) | `open-to-buy.spec.ts`, `goods-in-journey.spec.ts` | Checking a budget version a newer one replaced, then checks the newer one. Refused approving a budget they checked: a third person must, so the Owner approves it |
| Operations (P-OPS) | `damage-reports.spec.ts`, `pt-approval.spec.ts`, `goods-in-journey.spec.ts` | Approving a PT with an authenticator code already used, then with the new code. Rejecting the wrong PT is their own decision, not a refusal |
| Owner (P-OWN) | `booking.spec.ts`, `open-to-buy.spec.ts`, `recount.spec.ts`, `receive-against-booking.spec.ts`, `goods-in-journey.spec.ts` | A booking approval refused for missing open-to-buy, then approves it once the budget is |

The screens give no way to try some refusals at all, such as the uploader approving their own PT (My work never offers it to them) or an Arrival against another supplier's booking (the screen lists only that supplier's and brand's bookings); those are proved against the server (`pt-approval.int.test.ts`, `receiving-against-booking.int.test.ts`). Read-only screens are not yet walked by every persona whose menu has them (RR-660).

## 5. The 10,000-line timings (test 21, `PRD-PRF-001`)

Measured 23 Oct 2026, after the fixes of code review 10, on a development laptop (10 cores) **shared with other work**, its load average between 2 and 3 throughout, against PostgreSQL in a test container: each test file alone, twice. Recorded, not judged, except the one-minute target of the check, which the test itself asserts.

| What | Run 1 | Run 2 |
| --- | --- | --- |
| A 10,000-line PT file checked: read, staged and validated against its GRN (target: within one minute) | 4.3 s | 4.2 s |
| The same file then submitted for approval | 7.4 s | 7.5 s |
| A 10,000-line PT approved: the click, which records the approval and a request to post | 0.6 s | 0.5 s |
| The approval posted whole by the queued job the worker runs, from the click | 6.8 s | 6.7 s |

During the whole integration run of section 1, two test files at a time and the load average up to 4, the check took 4.6 s, the submit 8.4 s, the click 0.8 s and the job 8.7 s from the click. The job posts 10,000 pieces at a P RATE of 945.00, ₹94,50,000.00 into stock value, which the test checks in the trial balance (`pt-approval-large.int.test.ts`; `pt-upload.int.test.ts` for the check). These are a laptop's numbers; the measurement that counts is on the defined workload, devices and connections (RR-189).

## 6. The stage 2 exit checks

| Exit check (README 7; roadmap 2.1) | First version |
| --- | --- |
| Invoice or booking quantities never create uncounted stock; clean goods proceed while problems stay held (`PRD-ACP-001`) | **Proved**: tests 1 and 2 |
| PT coverage never overlaps, even under concurrent approval (`PRD-ACP-002`, `PRD-INT-005`) | **Proved for one PT per GRN**: test 12. Supplemental PTs come later (RR-546) |
| Supplier, direct-store and opening goods meet the same acceptance and hold checks (`PRD-ACP-003`) | **Proved for goods received at a Store and at a warehouse**: test 17. Opening goods arrive with the stage 4 switch |
| Damage blocks stock at once; independent rejection clears only the mistaken hold (`PRD-ACP-005`) | **Proved**: test 16 |
| Goods owned before receipt shown as inbound ownership (`PRD-ACP-020`) | **Waits**: inbound ownership is after the first version (`DEC-139`; placement RR-546) |
| A side-by-side import changes no stock (`PRD-LIF-014`) | **Waits**: the side-by-side test imports (feature `S2-F12`) are parked |
| Checks every stage owes (roadmap 2.2): concurrency, isolation, self-approval, stale versions, duplicates, rollback; the stage 2 reports | **Proved** for the first version: the preparer refused their own approval of a PT (`pt-approval.int.test.ts`), a damage report (`damage-reports.int.test.ts`), excess and wrong goods (`receiving-findings.int.test.ts`) and a booking (`bookings.int.test.ts`); stale versions, duplicates and rolled-back refusals in each feature's file; concurrency and isolation in section 3; the reports in `stage-2-reports.int.test.ts` and `stage-2-reports.spec.ts` |
| Persona journeys with recovery (roadmap 2.2) | **Built; waiting on RR-660 and RR-670** (section 4): whether each read-only screen needs a journey per persona (RR-660) and what "recovery" means (RR-670) are the product owner's to answer |

Stage 2 exits only once inbound ownership and the side-by-side import are placed and proved, and after stage 1 exits.

## 7. What still blocks live use

Everything runs on labelled synthetic data. Before real goods-in on `dev` or anywhere live (roadmap 2.3):

- **Policies signed and validated**: 1 Commercial ownership, 3 Source conflicts and pricing, 5 Booking, 17 Held-goods outcomes and the stage 2 parts of 10 (RR-157, RR-159, RR-161, RR-173, RR-166). Which records count as the values of policies 5, 1, 17 and 3 is still to be said (RR-561, RR-565, RR-566, RR-605): until then booking approval, damage and held-line decisions and PT approval stay unavailable outside tests.
- **Ownership at the scan-in**: goods whose Agreement passes ownership at receipt and acceptance cannot be scanned in until the ledger rule SL-26 is settled (RR-610).
- **Values entered**: open-to-buy budgets (RR-080), the posting map's receipt account, approval limits; the number series for bookings, GRNs, PTs and SKU codes, which no screen sets up yet (RR-449, RR-607); each Site's receiving readiness approved (`PRD-LIF-001`).
- **The binding performance measurement** is on the defined workload, devices and connections (RR-189); section 5 is a development laptop's.

## 8. Open items from this ticket

- RR-670: confirm what "recovery" means for the stage 2 persona journeys (section 4).
- RR-660 updated: Stock search is now walked by Accounts, and refused to Booking, in the joined journey.
- RR-680, for the builders: the scan form's "Accepted" message missed once in the PT approval journey (section 1).
