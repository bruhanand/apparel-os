# S1-F09-T02 — Posting maps, Post, open periods and trial balance

Status: blocked
Blocked by: S1-F09-T01; S1-F08-T01 (journal series); S1-F02-T03 (place scope, for test 18); S1-F04-T01 (the validity-check registration in `configuration` and the Available check, for test 15); S1-F06-T05 (stored files, for the CA's evidence on maps)
Feature: [S1-F09 Books, posting maps, periods and tax-rule records](../../spec.md)

## Build

The posting half of `finance` · books ([books-and-posting.md](../../../../design/finance/books-and-posting.md) 4 to 12; tables of 13.1).

- **Posting event kinds** (7.1): the module that posts declares each kind in code, with its components and its reversal kind. Tests declare labelled synthetic kinds and a synthetic caller composed only into the test application (`DEC-112` H2); the stock kinds of 7.2 are declared by S1-F10.
- **Posting maps** (6.1 to 6.3; `PRD-LED-003`, `POL-09.11`, `POL-09.12`): versions per book and event kind; each line a component, a side, an account of the same book and its required dimensions; every component has a line; a positive amount posts on its line's side, a negative one on the other. Approved versions never overlap and never start on a past date; a version in force is never edited. Approval as in S1-F09-T01 (maker, a different Accounts decider, the CA's evidence attached as a stored file through S1-F06-T05 or referenced; `POL-09.01`, `DEC-112` GC4-2; product owner, 6 Oct 2026, DEC-116). Emits `finance.posting-map-changed`.
- **Open periods** (4.1; product owner, 6 Oct 2026): periods per book with a code unique in the book, inside one financial year, no overlap (exclusion constraint) and no gap after the book's first period (trigger). Every period is Open here. Post accepts only an accounting date inside an Open period; a date in no period is refused with its reason. Hold periods takes each period row in shared mode at lock step 7 (4.5; stock-ledger 10.3). Lock, its wait for postings in flight, and reopening are S1-F09-T03.
- **Check postable and Post** (8, 9.1 to 9.3; `PRD-LED-004`, `PRD-MOD-013`): Check postable writes and locks nothing and gives, per item, the book, the period and its state, the map version and the journal series, or the reason Post would give. Post rechecks under the locks and refuses a missing or invalid map with the failed condition of 6.2, an Unknown amount (8.4; `PRD-MOD-015`), a missing required dimension, a journal that would not balance, or an item already posted with different content (returning what 9.3 asks the caller to keep). It writes one journal per book, event kind and accounting date, with lines summed by account, side, business unit, Store and brand; one posting-source row per item and component; a journal number from the book's series (5.4, GC4-4); and the map and mapping versions used. It is idempotent per source module, item key and component, answers Posted, Nothing to post or Refused, refuses the whole document if one item is refused (9.2), opens no transaction of its own, and emits `finance.journal-posted`.
- **Never changed** (5.2, 5.3; `POL-09.13`, `PRD-MOD-011`): `journal`, `journal_line` and `posting_source` are insert only for the runtime role, with refusal triggers; a deferred constraint trigger refuses an unbalanced journal at commit; the journal's period-guard trigger refuses a date in no period (S1-F09-T03 adds Locked).
- **Reverse** (9.1, 9.4): a linked journal with the lines on opposite sides, on its own business date, keeping the original map version; at most once per journal.
- **Policy gate** (11; `PRD-SEC-017`, `PRD-UXP-003`): `finance` · books registers its validity check for policy 9 with `configuration`: valid for a book only when policy 9 is Signed and validated and the book has an approved cost setting, a chart in force, a period covering today and an approved map for every event kind each enabled operation posts. Otherwise the operation is unavailable and names what is missing.
- **Read models** (12; `PRD-MOD-003`, `PRD-PRF-004`): the ledger and the trial balance per book and period, with their as-of time, labelled the internal ledger (`POL-11.01`). Rows carry legal entity, business unit, Store and brand as scope facts under row-level security; a reader whose scope covers part of a book sees the lines in scope and a trial balance marked partial.
- **Screens** (14): Setup › Posting maps (each component and its lines, the version in force on a chosen date, its approval) and Money › Internal ledger and trial balance (internal-ledger label, as-of time, partial).

## Expected outputs

Event-kind registry, posting maps, periods, journals and posting sources in `finance`; Check postable, Hold periods, Post and Reverse on its `index.ts`; the policy 9 validity check; the two screens; tests

## Done when

- books-and-posting 15 tests 2, 3, 6, 14, 15, 15a (all four version kinds) and 18 pass, and the overlap and gap clauses of test 13
- At Post's interface, with the synthetic caller: a date in no period is refused with its reason; the same item twice gives one journal and the first result; changed content is refused; an Unknown amount is refused; all-zero components answer Nothing to post. Tests 4 and 5 in full stay with S1-F10-T03, where the real caller keeps the refused item and G2 runs
- Browser journey: an Accounts user prepares a map version; a different Accounts user decides it from My work, with a synthetic CA evidence file attached; the Posting maps screen shows it in force on a chosen date; the trial balance shows its as-of time and, for a Store-scoped reader, says it is partial

## Notes

- Synthetic values only: the financial year and journal number format (GC5-1, RR-060; numbering-and-audit 3.5), the periods (GC4-1, RR-061) and the chart and maps of 16.1 (V-10, RR-073). Live posting waits for policy 9 (RR-165) and Accounts' and the CA's confirmation of the workflow and the journal series (RR-198).
- S1-F10-T07 also lists test 18; this ticket proves it at `finance`'s seam.
