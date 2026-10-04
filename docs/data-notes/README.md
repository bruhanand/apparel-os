# KDPS data notes

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [docs/README.md](../README.md).

## What this folder is

- Notes on the data KDPS Lifestyle Pvt. Ltd. sent to the ERP team in June and July 2026, written in October 2026 for future design and code.
- The raw files are in `docs/data-from-kdps/`. They are git-ignored; only their READMEs are committed. Start at [data-from-kdps/README.md](../data-from-kdps/README.md) for a folder-by-folder description of every file.
- These notes cut the same data by ERP topic instead of by folder: what each layout looks like, what each column means, what the data shows about how KDPS works today, where it fits the PRD, and what is still unknown.
- Like [reports/](../reports/README.md), these notes are not ranked. When a note and the PRD, the KDPS policies or a design disagree, the higher document wins and the note reports the clash.

## Rules these notes follow

- **Nothing here is a setting.** A threshold, rate, formula or meaning found in a KDPS sheet, a vendor file or an earlier analysis is what that file does today, not a policy (`AGENTS.md`, "Never invent a value"). Every unknown is marked OPEN with an owner.
- **Analyst values are not KDPS decisions.** The reports, dashboards, script and configs in `store-analysis/` and the role grid in `scope-dashboard-detail/` were made by the ERP team or an analyst. Their thresholds, benchmarks, costs and budgets are listed in [analyses-and-metrics.md](analyses-and-metrics.md) and must not become ERP defaults.
- **No personal data.** Customer names and phone numbers, bank details, tax registration numbers, card terminal IDs and staff contact details are described ("present"), never copied.
- **Guesses are marked** "(guess)" or "(inferred)". Counts were recomputed from the raw files where the first-pass read (October 2026) disagreed; the notes say so, and a figure marked "survey" comes from that first-pass read.
- **Raw files are named in backticks, not linked**, because they are not in git. Links go only to committed files.

## The notes

| Note | What it covers | Use it for |
| --- | --- | --- |
| [needs-coverage.md](needs-coverage.md) | Every raw file, sheet and habit read as "what job does it do, what need is behind it, is it covered": 309 rows with an outcome each (Covered, Gap, Retire habit, Move data once, Outside format, No need), and the 23 gaps as proposed decision entries | Start here. Checking that every need is covered; planning the switch |
| [stores-and-codes.md](stores-and-codes.md) | The 17 places on KDPS's store list, other places seen in the data, the two states, legal entity and franchise names, bill series per store and year, and every store, site and document code found | Organisation, Site and Store setup; bill series; reading any file's codes |
| [pos-exports.md](pos-exports.md) | Every sales and stock layout from the earlier POS and the stores' Excel (29 layouts): columns, row meaning, quirks, cross-checks that held, what no export carries | Side-by-side test imports (`PRD-LIF-013`, `PRD-LIF-014`) and opening data |
| [pos-export-layouts.json](pos-export-layouts.json) | The same 29 layouts, machine-readable | Writing import adapters and tests |
| [pt-file-layouts.md](pt-file-layouts.md) | KDPS's own PT template (columns, formulas, drift between tabs, a worked invoice-to-PT example) and all 33 vendor PT files: layout, column mapping, barcode type, missing fields, difficulty, layout families | PT import adapters (`PRD-IMP-001`) and the PT workbench |
| [pt-layouts.json](pt-layouts.json) | Adapter specs for 37 PT layouts (35 vendor layouts and 2 KDPS template layouts), machine-readable | Writing PT adapters and their tests |
| [item-master-vocabulary.md](item-master-vocabulary.md) | Every value list KDPS uses for items: seasons, brands and alias groups, colours and the `PREMIUM` / `MEDIUM` / `ECONOMY` tags, genders, sub-categories, types, items, fits, sizes, category codes; brand to supplier; who prints barcodes; the GST rules found in different files | Merchandise masters, brand and size grids, import clean-up |
| [offers-and-brand-reports.md](offers-and-brand-reports.md) | Offer vocabulary, every offer mechanic seen, every offer brand by brand and month by month, overlaps and ambiguities, the AMM list, the monthly brand report and its tools | Offers and prices, shared calculations, brand reporting |
| [purchases-and-supplier-notes.md](purchases-and-supplier-notes.md) | The purchase-invoice tracker, supplier master fields, debit and credit notes and the claim process, supplier ledgers, extra charges on invoices, totals that disagree | Booking and buying, receiving, supplier returns, payables |
| [store-close-cash-and-bank.md](store-close-cash-and-bank.md) | A store's daily close workbook (sales by tender, cash book, stock in, bank check, petty cash) and the company bank extract; how settlement matching works today and its limits | Counter payments, cash, bank and collections |
| [transfers.md](transfers.md) | How stock moves between the warehouse and stores today: challans, gate passes, hand tallies, transfer columns in the POS, transfer lines in the store workbook; what the ERP must capture | Transfers and physical movement |
| [access-and-store-asks.md](access-and-store-asks.md) | The ERP team's earlier role grid and dashboard wish list against the PRD's 14 personas; the users list that never arrived; the store staff's handwritten wish list mapped to PRD IDs | Access, roles, My work, reports |
| [analyses-and-metrics.md](analyses-and-metrics.md) | The earlier analyses of KDPS data: every metric and its formula, every analyst assumption, headline findings and which reproduce, terminology clashes with the PRD, what the ERP must record | Reports and planning; avoiding analyst values as defaults |
| [data-quality-and-import-rules.md](data-quality-and-import-rules.md) | Every data problem seen in any file (dates, numbers as text, barcodes, reused columns, spellings, total rows, hidden rows, extensions that lie, formula drift) and the import rule each implies; what a validation report must show | The imports and opening-data design (GC-6, not yet written) |
| [prd-fit.md](prd-fit.md) | The same findings by PRD area: covered, stretch, gap, habit to retire or a real clash with an outside fact; inputs for designs not yet written; candidate decisions for the product owner | Planning PRD, policy and design work |
| [open-questions.md](open-questions.md) | Every question the data raises, in three parts: business facts and policy values (A), needed to move data in (B), dropped because they only ask how an old sheet works (C); grouped by who can answer; files KDPS still has to send | Talking to KDPS; later moving questions into [questions-for-kdps.md](../questions-for-kdps.md) |
| [file-inventory.csv](file-inventory.csv) | One row per raw file (136): real format, whether the extension lies, size, sheets and rows, what it is, who made it, period, stores, brands, sensitive content, duplicates, its README and the notes that cover it. In `sheets_and_rows` the number after each sheet counts rows holding any value or formula, so formula-only rows count; PDFs show pages | Finding a file; checking coverage |

## How to use these notes

- **KDPS will change its process to fit the product.** Copying today's way is not a goal; covering every need is. A habit that breaks a PRD rule is retired, not kept. [needs-coverage.md](needs-coverage.md) applies this to every file.
- **Before designing a module**, read [needs-coverage.md](needs-coverage.md) and [prd-fit.md](prd-fit.md) for that area, then the topic note they point to.
- **Before writing an import adapter**, read [data-quality-and-import-rules.md](data-quality-and-import-rules.md) and the JSON layout file for that source. Build and test with labelled synthetic data; the raw files are a sample, never a default.
- **Before asking KDPS anything**, check [open-questions.md](open-questions.md) and [questions-for-kdps.md](../questions-for-kdps.md) so a question is asked once.
- **When KDPS sends new data**, add it under `docs/data-from-kdps/`, write or update the folder README, and update the notes it touches and the inventory.

## Keeping these notes honest

- These notes are not tracked sections of the doc checker's review gate. The checker still checks their IDs, links and tables.
- A note that cites a PRD or policy ID must keep citing a live ID. If the PRD changes, the checker fails on a retired ID; fix the note.
- Moving a question into [questions-for-kdps.md](../questions-for-kdps.md), or turning a finding into a PRD or policy change, follows the change gate in `AGENTS.md` ("Checking the documents").
