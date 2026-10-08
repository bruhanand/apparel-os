# S1-F08-T01 — Gapless number series

Status: blocked
Blocked by: S1-F01-T04
Feature: [S1-F08 Number series and exceptions](../../spec.md)

## Build

The `numbering` module with its first migration ([numbering-and-audit.md](../../../../design/platform/numbering-and-audit.md) 2, 3.1 to 3.3, 3.5, 3.7, 6.1; [module-map.md](../../../../design/architecture/module-map.md) 4.6). It calls no other module.

- **Tables** (6.1): `number_format` with versions, `series`, `allocation` and `series_event`, the last two append-only (house rules 7.1).
- **Kinds** (3.1): each owning module declares the kinds it numbers: whether a kind restarts each financial year, what its scope key stands for, and its display scope. The owning module validates the scope and supplies an opaque scope key, and for a yearly kind the financial year its document's business date falls in under the Organisation's timezone (3.3; `PRD-MOD-009`).
- **Formats** (3.5): fixed text, a part taken from the series' scope, the financial-year label and the sequence number at a set width. A series keeps its format for life; a new format applies only to series defined after it. A format that could give the same text to two series in one display scope is refused, and the database keeps formatted text unique in that scope. No format has a default.
- **Define a series** (3.7): refused while an Open or Paused series exists for the same kind, scope key and year (`PRD-POS-020`).
- **Allocate** (3.2; `PRD-MOD-004`, `PRD-INT-004`): inside the owning module's transaction. The command locks every series it draws from last, in the lock order (stock-ledger 10.3 step 8; house rules 8.2), with `numbering` offering the series rows as lock targets. Allocate refuses a series the transaction has not locked, and a Paused or Closed one. It records the series, the sequence number, the formatted text, the document kind and reference, and the time; the number commits with its document or not at all, so a rollback leaves no gap. A replayed command returns its first number (`PRD-INT-002`).
- **Pause, release and close** (3.7): Closed is final, never reopened or continued (`PRD-LIF-015`, `PRD-OFF-010`). **Read series state**: the financial year and the next sequence number.
- A test-only document kind in a `test_` schema (house rules 11.4) drives the tests, since no stage 1 document is numbered yet.

## Expected outputs

`numbering` module with its `index.ts`; first `numbering` migration with its `tables.json` entries; integration and concurrency tests

## Done when

- numbering-and-audit 7 tests 1 to 5 pass on real PostgreSQL with the test-only kind. Test 2: concurrent allocations on one series get distinct, consecutive numbers, and allocations on two series of one kind with different scope keys do not wait for each other. Tests 3 and 4 prove the series rules that device and Store-switch series rely on
- A yearly and a non-yearly kind both allocate; Allocate on a series the transaction has not locked is refused; a replayed command gets its first number
- A second synthetic Organisation sees none of these series

## Notes

- The device bill series of tests 2 to 4 are proved again with real devices in S1-F12. Record used numbers waits for the stage 4 offline upload (GC-8). The pause after a restore and its reconciliation (test 7) belong to S1-F14.
- Import batch codes come from a `numbering` series (GC9-9, approved 6 Oct 2026): `files-imports` declares that kind in S1-F06. Exception codes get their kind in S1-F08-T02.
- The financial year's start and end are an Organisation setting with no default (GC5-1, RR-060; Accounts, CA; live S1, bills in S4); tests use a labelled synthetic year and synthetic formats. The bill-number format (V-40) and other statutory formats (GC5-2) stay OPEN.
- numbering-and-audit 6.1 does not say which `numbering` tables are `scoped` (house rules 6.1); write it there with the code.
- Built (9 Oct 2026): the `numbering` module (`apps/server/src/modules/numbering`), migration 0033 with its six register entries, and `apps/server/test/numbering.int.test.ts` (tests 1 to 5, both kinds, the unlocked refusal, the replay, the second Organisation). The details settled are written in numbering-and-audit 6.1 "As built": every table `unscoped`, format versions and parts, the empty display year as a stated value, the could-repeat check, exhausted series. The kernel's transaction context gained `heldLock`, which Allocate asks (code-house-rules 8.2). The refusal codes are declared in `packages/schemas` (`numberingCodes`) with their English messages. No route, so no OpenAPI change. `numbering` is not yet in the app's composition: the first owning module (S1-F06 or S1-F08-T02) imports it and provides its kinds under `NUMBERED_KINDS`.
