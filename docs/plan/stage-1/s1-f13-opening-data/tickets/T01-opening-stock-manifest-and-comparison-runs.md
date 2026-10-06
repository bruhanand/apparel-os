# S1-F13-T01 — Opening-stock manifest and comparison runs

Status: blocked
Blocked by: S1-F04-T02 (the stock-plan check); S1-F06-T03 (layouts, staging, the validation report); S1-F10-T03 (valued stock, and Post behind the ledger, for test 18); RR-047 (the PRD bullet and the GC-6 10.2 edit for opening-stock age, before this feature's code)
Feature: [S1-F13 Opening-data layouts and reconciliation](../../spec.md)

## Build

The opening-stock manifest staged and validated on synthetic data, the earlier POS's SOH and daily sales loaded as reference only, and the comparison runs that reconcile them ([imports-and-opening-data.md](../../../../design/platform/imports-and-opening-data.md) (GC-6) 4.1, 4.2, 10.1 to 10.3, 10.5, 13.1, 14, 15.1; `POL-14.07`, `DEC-013`). Nothing here publishes an opening batch: that is S1-F13-T03.

- **The opening-stock manifest layout** (10.2; `PRD-LIF-004`, `PRD-LIF-005`), of the opening-balance kind, on a synthetic XLSX. One row is one SKU, or one source identity not yet resolved to a SKU, at one location of one business unit: Site, unit and internal location through confirmed rules (`PRD-ORG-012`); identity by Resolve a code or by style, colour and size, else a product proposal confirmed first (`PRD-MER-013`); a whole quantity in the SKU's stock unit; batch and expiry only where the tracking profile requires them, a missing one blocking the row (`PRD-MER-011`); condition as the stock ledger names them; owner, the Organisation's legal entity or a supplier or brand under its agreement (`POL-14.02`, `PRD-ORG-014`); season, or Unknown selected explicitly by a person and audited (`PRD-LIF-006`); valuation evidence with its cost per unit, or Unknown (`POL-14.03`); the original receipt date only where a source backs it, otherwise Unknown (RR-047); the source words as given. Billed-retained items are a separate section with their earlier-POS bill reference, not opening stock (`PRD-LIF-028`, `POL-14.04`, `DEC-090`). Piece IDs are never imported.
- **The opening-balance handler, validating half** (13.2; GC-6 section 12): the stage 1 test handler checks references through `organisation` and `merchandise` and previews each document; it posts nothing here. It is composed only into the test application (code-house-rules 11.4; harness decisions H2 and H5).
- **SOH and daily sales as historical reference** (4.1, 4.2; `PRD-LIF-013`, `PRD-LIF-014`, `PRD-LIF-016`, `PRD-IMP-010`): a synthetic SOH layout and a synthetic daily-sales layout, labelled synthetic and not the sample layouts of 6.7; a historical-reference handler that keeps their rows as reference records with their source identities and never moves stock, makes a sale or issues a tax invoice. The handler lives in a minimal `ebo-imports` module built here, holding only that handler and its reference records; stage 2 (S2-F12) extends it (product owner, 6 Oct 2026, DEC-116). Module-map section 2 and the module check's tier table (`tools/module-check/check.mts`) gain it with the code, and it registers its restore participant (S1-F14-T02 Notes). A historical-reference batch carries the line "Checking and reports only; never moves stock" (section 16). Every source reference passed to the ledger or Post carries its kind, and both refuse historical reference (stock-ledger 13.2, `historical-reference-source`).
- **Comparison runs** (section 2, 10.3, 15.1; `PRD-LIF-027`): Run a comparison takes two sets and a key: manifest against last SOH (barcode, then SKU), count against manifest (SKU and location; the count from the stock ledger's read model, synthetic here) and count against last SOH (barcode, then SKU). Every difference is listed; each run keeps both sides' batch versions or read-model as-of times and its result in `comparison_run` and `comparison_line`, append-only; neither side is ever changed. A barcode missing from an SOH that lists only positive rows is reported as not listed, never as zero (class I-1).
- **Read model and screen** (14): comparison runs with their differences, under the reader's authorisation and scope.

## Expected outputs

- The opening-stock manifest layout and mapping; the validating half of the opening-balance test handler
- The synthetic SOH and daily-sales layouts; the minimal `ebo-imports` module with its `index.ts`, migration and `tables.json` entries, holding the historical-reference handler
- Comparison runs, their tables, read model and screen; tests

## Done when

- GC-6 17 test 18 passes, including the ledger's and Post's refusal of a historical-reference source
- The three comparison runs on synthetic data list every difference, and both sides read the same before and after the run
- A manifest row with no valuation evidence keeps its value Unknown, never zero; a row missing a batch or expiry its tracking profile requires is Blocking; an explicit Unknown season shows who chose it and when

An approved, unpublished opening-stock batch for a unit makes the S1-F04-T02 stock-plan check pass for that unit only, and approving the batch needs no activation (`DEC-117`)

## Notes

- The stage 1 historical-reference handler lives in a minimal `ebo-imports` module, which stage 2 (S2-F12) extends (product owner, 6 Oct 2026, DEC-116; module-map 11.1).
- Books-and-posting does not yet name Post's refusal of a historical-reference source (GC-6 4.2 proposes it; stock-ledger 13.2 took it). Write it into books-and-posting with this code, as AGENTS.md "How we work" step 3 says, or raise it if a reviewer disagrees.
- RR-199: the season order and the "old" cutoff are KDPS's; tests use a labelled synthetic order. RR-132 (GC6-9): what counts as valuation evidence stays with Accounts and the CA. GC6-16: whether "not listed" may be read as zero stays open.
- Earlier-POS line classes (6.8, test 19) and the sample layouts moved to `S2-F13`.
