# Open questions from the KDPS data

> **Not ranked.** These notes describe the data KDPS sent. They decide nothing. A PRD or policy change they lead to needs an entry in [decisions.md](../decisions.md) first. See [README.md](README.md).

These are the questions the KDPS data raises. They are **not yet in the official list**. Moving one into [questions-for-kdps.md](../questions-for-kdps.md) is a separate step: it goes through the doc checker's review gate (AGENTS.md, "Checking the documents"). Until then a question here changes nothing, and building and synthetic-data testing do not wait for it.

The questions come from the "Open questions" lists of the 26 READMEs in `docs/data-from-kdps/` and of the notes in this folder. Questions asked in several files are merged into one, with every source listed. Q-1 to Q-151 are the merged questions; Q-152 and Q-153 were added when the questions were sorted (below). There are 153 questions.

**Three parts, and why.** KDPS will move to Apparel OS and change how it works, so copying its current process is not a goal, but every need the data shows must still be covered. The questions are therefore sorted into three parts. **Part A** holds business facts and policy values the product needs: it is what KDPS must decide or tell us. **Part B** holds questions whose answer is needed only to load opening data or to run the side-by-side test, such as what an old column means. **Part C** lists the questions dropped because they only ask how an old sheet or habit works; each names the question or note that covers the need behind it. Question numbers never change, so other references stay valid.

**How to read a question.**

- Within Parts A and B, questions are grouped by who can answer. The KDPS Owner group also holds questions the Owner will pass to Operations (P-OPS), Booking (P-BKG), Brand manager (P-BRM), HR (P-HRS) or Admin (P-ADM); the Answerer line names that person. The personas are in [personas.md](../design/access/personas.md).
- Where a question has no Answerer line, the owner of its group answers.
- **Why it matters** is one line. **Blocks** names the delivery stage in [phases.md](../phases.md) that waits for the answer, or says that it does not block. In Part B it names the opening load or the side-by-side test. Design and synthetic-data work never waits; only live use does.
- **Already asked** names the group and number in [questions-for-kdps.md](../questions-for-kdps.md) at the time of writing. "Partly" means the official question covers only a part. A question with no such line is not yet asked there.
- **Added** marks a question split out of another when the questions were sorted into parts.
- **Sources** are the READMEs and notes the question came from. Raw files are not in git; the READMEs describe them.
- Values set by earlier analysts are analyst assumptions, not KDPS decisions. Nothing here supplies a value.

## Count by part and group

| Group | Part A: business facts and policy values | Part B: needed to move data in | Part C: dropped | Total |
| --- | --- | --- | --- | --- |
| KDPS Owner (P-OWN) | 56 | 14 | 11 | 81 |
| Accounts (P-ACC) | 24 | 8 | 5 | 37 |
| CA (P-CHA) | 5 | 1 | 0 | 6 |
| Store manager (P-STM) and Store staff | 0 | 4 | 3 | 7 |
| KDPS data providers (Priyo, Debanjan) | 5 | 5 | 0 | 10 |
| Product owner | 7 | 3 | 2 | 12 |
| Total | 97 | 35 | 21 | 153 |

Groups are the owner groups of the earlier list. A question counts under the group that owned it there; Q-152 and Q-153 count under the group that owns the question they were split from.

## Part A — Business facts and policy values

Answers here set a policy value, give a business fact the product needs (entities, registrations, codes that stay, who funds an offer, what a brand term means, what a role may do), or settle a decision. Nothing here asks how an old sheet works.

### KDPS Owner (P-OWN)

Questions only KDPS can answer. The Owner may pass a question to the person named in its Answerer line: Operations (P-OPS), Booking (P-BKG), Brand manager (P-BRM), HR (P-HRS) or Admin (P-ADM).

#### Places, codes and legal entities

- **Q-3.** Is `JAINSONS-LIFESTYLE | HAZARIBAGH` the one Store behind both `HZB` and `JSL`? Which name and code should the ERP use?
  - Why it matters: One Store must not become two Stores in the master.
  - Blocks: Stage 1 (shared foundation): Store set-up.
  - Sources: [hazaribagh](../data-from-kdps/store-analysis/hazaribagh/README.md), [jsl](../data-from-kdps/store-analysis/jsl/README.md), [analyses-and-metrics](analyses-and-metrics.md), [stores-and-codes](stores-and-codes.md).
- **Q-4.** What are Om Ganpati Enterprises, Sanskar Retail, Jainsons Lifestyle and D D Developers: a franchise, a related firm, a trade name or a second legal entity? Which Stores does each own, and what does the column `FRENCHEEZI` mean? Why does the `DEAL` file name Jainsons Lifestyle, `JOCKEY.xlsx` D D Developers, and the `DEAL` voucher Om Ganpati Enterprises?
  - Answerer: KDPS Owner, with the CA (P-CHA).
  - Why it matters: Legal entities decide books, registrations and franchise handling, and they change which Store belongs to whom.
  - Blocks: Stage 1 (shared foundation): structure; Stage 5 (financial control): franchise and books.
  - Sources: [stores-and-codes](stores-and-codes.md), [data-from-kdps](../data-from-kdps/README.md), [PT FILE](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md), [pt-file-layouts](pt-file-layouts.md), [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
  - Already asked: CA 16 asks only whether each registration and each set of books belongs to one legal entity (partly).
- **Q-5.** How many billing devices will each Store run, and under which tax registration does each one bill? Each device gets its own bill series per registration (`PRD-POS-020`).
  - Answerer: Operations (P-OPS), with Admin (P-ADM).
  - Why it matters: Offline billing and bill numbering need one series per billing device.
  - Blocks: Stage 4 (store day): billing.
  - Sources: [stores-and-codes](stores-and-codes.md), [pos-exports](pos-exports.md).
- **Q-7.** Who issues dealer site codes such as `KDPS-HZB-MF` and `KDPS-DEGR-MF`, does every brand have one per Store, and what does the placeholder style `KDPS-DEGR-MF` on Mufti sales and stock lines stand for?
  - Answerer: Booking (P-BKG).
  - Why it matters: PT conversion by dealer site and the brand reports both need these codes.
  - Blocks: Stage 2 (goods-in): PT conversion by dealer site.
  - Sources: [stores-and-codes](stores-and-codes.md), [brand-analysis-report](../data-from-kdps/brand-analysis-report%20/README.md), [mufti](../data-from-kdps/brand-analysis-report%20/mufti/README.md), [2026-05/data](../data-from-kdps/monthly-reports-april-may-2026/2026-05/data/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).
- **Q-152.** Which single-brand Stores (EBO) bill on KDPS's own POS today, and which bill on the brand's own software? Which of them will bill in Apparel OS, and which will keep the brand's software, whose reports the product imports (`PRD-PRO-010`)?
  - Answerer: Operations (P-OPS).
  - Why it matters: A Store on a brand's software is set up for report import and the stock hold in `PRD-STK-016`, not for counter billing; the switch plan differs for each kind.
  - Blocks: Stage 1 (shared foundation): Site and Store master; the switch plan.
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [stores-and-codes](stores-and-codes.md), [pos-exports](pos-exports.md).
  - Added: split out of Q-9 when the questions were sorted into parts.

#### Items, brands and suppliers (masters)

- **Q-12.** Who keeps the master lists (brands, items, sizes, colours) current, and who approves a new value?
  - Answerer: KDPS Owner; Booking (P-BKG) and Admin (P-ADM) do the work.
  - Why it matters: A master list with no owner drifts; approvals need a named approver.
  - Blocks: Stage 1 (shared foundation): item master.
  - Sources: [05-reference-data](../data-from-kdps/05-reference-data/README.md).
- **Q-15.** Which category list does KDPS want: the master sub categories, the POS codes or a new tree? Is `SUB CATEGORY` a category or an attribute?
  - Answerer: Booking (P-BKG).
  - Why it matters: The category tree is the base of reports and offers.
  - Blocks: Stage 1 (shared foundation): vocabulary.
  - Sources: [item-master-vocabulary](item-master-vocabulary.md), [pos-exports](pos-exports.md).
- **Q-16.** Are the 98 items of the item master the intended list? Which POS item words (`SET`, `COAT`, `WINTER SET`, `WAISTCOAT`, `HOT PANT`, `SARARA`) become items, and are accessories, jewellery, electronics and toiletries in scope?
  - Answerer: Booking (P-BKG).
  - Why it matters: The item list decides what the item master and the PT forms offer.
  - Blocks: Stage 1 (shared foundation): vocabulary.
  - Sources: [item-master-vocabulary](item-master-vocabulary.md).
- **Q-17.** Is the size list one list or one list per category (the PRD asks for category-specific size sets, `PRD-MER-002`)? What do the odd codes `AS`, `EES`, `EL`, `ES`, `EXL` and `EXS` mean, and what unit do the plain numbers carry?
  - Answerer: Booking (P-BKG).
  - Why it matters: Size sets are part of the SKU identity.
  - Blocks: Stage 1 (shared foundation): size sets.
  - Sources: [item-master-vocabulary](item-master-vocabulary.md).
- **Q-18.** What do the brand and division codes stand for: `AK`, `AL`, `AH`, `AT`, `LA`, `LX`, `PJ`, `N`, `RE`, `AY`, `PT`; the Van Heusen sub-brand codes `HOVH`, `VS`, `VD`, `VX`, `VF`, `VW`; the `V ` and `FS-` prefixes? Do the division codes (`LP`, `LY`, `LR`, `VH`, `VS`, `VD`, `VF`, `VX`, `AS`, `AL`, `AT`) roll up into one brand, and which codes does each Van Heusen offer row cover?
  - Answerer: Brand manager (P-BRM), with Booking (P-BKG) and Madura.
  - Why it matters: The brand master and every brand offer depend on the code meanings.
  - Blocks: Stage 1 (shared foundation): brand and SKU masters; Stage 4 (store day): offers.
  - Sources: [item-master-vocabulary](item-master-vocabulary.md), [data-quality-and-import-rules](data-quality-and-import-rules.md), [VAN HEUSEN](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/VAN%20HEUSEN/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).
- **Q-19.** Which spelling of each brand is the approved one (`US POLO` or `U. S. POLO`, `BLACKBERRYS`, `GOCOLORS`, `KILLER JUNIOR` or `JUNIOR KILLER`)? May the alias groups in the vocabulary note be merged by KDPS-approved mapping rules?
  - Answerer: Booking (P-BKG), with Accounts (P-ACC).
  - Why it matters: One brand under two spellings splits its sales and stock.
  - Blocks: Stage 1 (shared foundation): brand master.
  - Sources: [item-master-vocabulary](item-master-vocabulary.md).
- **Q-20.** What does `BARCODE` = YES or NO per Supplier mean? Who prints tickets and barcodes for the NO Suppliers (the 7-digit codes starting with 1), and who maintains the brand-to-Supplier map? Is a barcode that fails the EAN-13 check an in-house code?
  - Answerer: Booking (P-BKG) and Operations (P-OPS).
  - Why it matters: Label printing and barcode verification depend on who owns the barcode.
  - Blocks: Stage 2 (goods-in): labels.
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [item-master-vocabulary](item-master-vocabulary.md), [purchases-and-supplier-notes](purchases-and-supplier-notes.md), [data-quality-and-import-rules](data-quality-and-import-rules.md).
- **Q-21.** For files with no usable barcode (`AS INNERWEAR.csv`, `XERICS`, `BANJARAN`, `ZILU`, `HYPHEN`, `SUVIDHI`) or with an internal code: does KDPS print its own barcode, and what does the earlier POS use?
  - Answerer: Booking (P-BKG) and Operations (P-OPS).
  - Why it matters: A piece cannot be sold without a verified barcode.
  - Blocks: Stage 2 (goods-in): labels.
  - Sources: [PT FILE](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md), [pt-file-layouts](pt-file-layouts.md).

#### Goods in and PT files

- **Q-22.** Is one PT file one invoice (or one goods receipt), or can it span invoices (`kidcity` has 2, `Peter England.CSV` 5, the Madura file a whole month for 176 customers)? Which Madura rows are KDPS goods (the nine sold-to accounts; bill types `ZINV`, `ZREU`, `ZPOR`), and what do `ZREU` and `ZPOR` mean? Is the monthly Madura extract a goods receipt, a check on goods already received, or both?
  - Answerer: Booking (P-BKG), with Madura.
  - Why it matters: The import must know what one goods receipt is.
  - Blocks: Stage 2 (goods-in): import design.
  - Sources: [PT FILE](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md), [pt-file-layouts](pt-file-layouts.md), [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
  - Already asked: The KDPS section asks for one real messy delivery as a sample (partly).
- **Q-23.** Who fills the vendor PT file: the vendor, KDPS Booking or the ERP team? Do vendors fill the KDPS template, or only KDPS staff (the vendor files so far use the vendors' own layouts)?
  - Answerer: KDPS Owner, with Booking (P-BKG).
  - Why it matters: It decides whether the importer reads vendor layouts or the KDPS template.
  - Blocks: Stage 2 (goods-in): goods-in design.
  - Sources: [05-reference-data](../data-from-kdps/05-reference-data/README.md), [vendor-files](../data-from-kdps/05-reference-data/vendor-files/README.md), [pt-file-layouts](pt-file-layouts.md).
- **Q-24.** Will suppliers keep their own layouts, and may KDPS ask the largest (Madura, Jockey) for a fixed export?
  - Answerer: Booking (P-BKG).
  - Why it matters: A fixed export removes the need for one adapter per supplier.
  - Blocks: Stage 2 (goods-in): adapter plan.
  - Sources: [PT FILE](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md), [pt-file-layouts](pt-file-layouts.md).
- **Q-25.** Does a quantity N on a PT row mean N price tickets to print, and may the importer split the row into N piece rows?
  - Answerer: Booking (P-BKG).
  - Why it matters: It decides how tickets and piece IDs are created from a PT row.
  - Blocks: Stage 2 (goods-in): labels.
  - Sources: [PT FILE](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md), [pt-file-layouts](pt-file-layouts.md).
- **Q-28.** Which brands deliver straight to Stores (Madura goods reach Stores directly in the data) and which go through the Ranchi warehouse?
  - Answerer: Booking (P-BKG).
  - Why it matters: It decides which Receive Goods inbox gets each delivery.
  - Blocks: Stage 2 (goods-in).
  - Sources: [transfers](transfers.md).
  - Already asked: Operations 4 asks for the Store and warehouse route matrix (partly).
- **Q-31.** What agreement sits behind `U.S POLO (SOR)` and "CONSIGNMENT" in the supplier lists?
  - Answerer: KDPS Owner, with the CA (P-CHA).
  - Why it matters: Ownership and return rights follow the agreement.
  - Blocks: Stage 2 (goods-in): brand deals.
  - Sources: [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
  - Already asked: KDPS Owner 8 asks for each brand's signed terms.

#### Transfers and stock movement

- **Q-32.** Who must count a delivery at the Store and sign for it, and against which document? Who must be told of a difference such as 443 pieces counted against 450, and who follows it up?
  - Answerer: Operations (P-OPS).
  - Why it matters: Receipt and shortage handling is the core of the transfer design.
  - Blocks: Stage 3 (stock movement): transfers.
  - Sources: [transfer-data](../data-from-kdps/transfer-data/README.md), [transfers](transfers.md).
  - Already asked: KDPS Owner 3 asks who owns exceptions such as short delivery (partly).
- **Q-36.** Do goods supplied by `OM GANPATI (DMK)`, `SANSKAR RETAIL` or `KDPS LIFESTYLE PVT LTD (DEOGHAR)` change owner? On what document and at what price?
  - Answerer: KDPS Owner, with the CA (P-CHA).
  - Why it matters: A change of owner between entities follows a different process from an ordinary transfer.
  - Blocks: Stage 3 (stock movement); Stage 5 (financial control).
  - Sources: [transfers](transfers.md).
- **Q-37.** Do Stores return goods to suppliers directly or through the warehouse (the debit notes are numbered by warehouse), and who raises the debit note?
  - Answerer: Operations (P-OPS), with Accounts.
  - Why it matters: It decides the supplier-return flow.
  - Blocks: Stage 3 (stock movement): supplier returns.
  - Sources: [transfers](transfers.md).

#### Offers and brand reports

- **Q-39.** Do any offers combine: a percentage with a bill-value offer, a brand offer with a Store or manual discount? In what order? For Van Heusen, when row 10 (buy 2, get 1,000 off) and row 11 (flat 40% on `VF`) both fit, which wins? The PRD gives the customer the largest total discount when offers may not combine (`PRD-OFR-021`) but does not say whether they may.
  - Answerer: Brand manager (P-BRM) or KDPS Owner.
  - Why it matters: No file says offers combine, and the offer engine must not guess.
  - Blocks: Stage 4 (store day): offers and price lists.
  - Sources: [BRAND OFFERS](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/README.md), [VAN HEUSEN](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/VAN%20HEUSEN/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).
  - Already asked: KDPS Owner 27, 55 and 56.
- **Q-40.** Who funds each offer (the brand or KDPS), in what shares, and how is brand support claimed? That includes the cost of a gift sold at a token price.
  - Answerer: KDPS Owner or Accounts, with the Brand manager (P-BRM).
  - Why it matters: Offer approval keeps the brand and company cost shares (`PRD-OFR-002`).
  - Blocks: Stage 4 (store day): offers.
  - Sources: [ALLEN SOLLY](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/ALLEN%20SOLLY/README.md), [LOUIS PHILLIPE](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/LOUIS%20PHILLIPE/README.md), [VAN HEUSEN](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/VAN%20HEUSEN/README.md), [BRAND OFFERS](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).
  - Already asked: KDPS Owner 27 asks for each brand agreement's cost shares.
- **Q-41.** What do these offer words stand for: `AMM`, `NOD`, `HOAS`, `HOVH`, `ATV`, `ABV`, `GWP`, `EOSS`, `FRESH`, `PE TR MBO ABV`, `PE GST benefit`, `TR`, `S&J`, `AFI`, `ROC`, `R/F`, `SOH F`, `Q code`? Which KDPS Stores are `HOAS`, `HOVH` and `MBO` for offers? What does the "Promo offers" row of Louis Philippe give for NON AMM styles? Are `AFI` and `S&J` excluded from the Blackberry duffel-bag offer?
  - Answerer: Brand manager (P-BRM); Operations (P-OPS) for the Stores.
  - Why it matters: The offer rules cannot be written until the words are defined.
  - Blocks: Stage 4 (store day): offers.
  - Sources: [BRAND OFFERS](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/README.md), [ALLEN SOLLY](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/ALLEN%20SOLLY/README.md), [LOUIS PHILLIPE](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/LOUIS%20PHILLIPE/README.md), [PETER ENGLAND](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/PETER%20ENGLAND/README.md), [VAN HEUSEN](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/VAN%20HEUSEN/README.md), [blackberry](../data-from-kdps/brand-analysis-report%20/blackberry/README.md), [offers-and-brand-reports](offers-and-brand-reports.md), [monthly-reports-april-may-2026](../data-from-kdps/monthly-reports-april-may-2026/README.md).
- **Q-42.** Who owns the AMM list (the brand or KDPS), how often is it refreshed and how is a new style added? How must a style missing from it be treated (36% of April lines, 153 of 429)? Are `TR Line` and `Core` permanent?
  - Answerer: Brand manager (P-BRM) and KDPS Owner (P-OWN).
  - Why it matters: Offer eligibility depends on the list; brand claims depend on its rule for missing styles.
  - Blocks: Stage 4 (store day): offer eligibility; brand claims in Stage 5 (financial control).
  - Sources: [2026-04](../data-from-kdps/monthly-reports-april-may-2026/2026-04/README.md), [blackberry](../data-from-kdps/brand-analysis-report%20/blackberry/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).
- **Q-43.** Which source is authoritative for each brand offer: the emailed table, the artwork, the calendar sheet or a brand portal? When a new email arrives, are the earlier months withdrawn?
  - Answerer: Brand manager (P-BRM), with the KDPS Owner.
  - Why it matters: Two sources for one offer give two prices.
  - Blocks: Stage 4 (store day): offers.
  - Sources: [ALLEN SOLLY](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/ALLEN%20SOLLY/README.md), [BRAND OFFERS](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).
- **Q-46.** Is a bill-value offer measured on MRP or on the net bill? Is the threshold per bill, per brand or per sub-brand? Does the threshold itself count ("buy 4999") or only values above it? Does a gift count towards the spend, and when two slabs fit, which applies? Is "Shop for X" at Allen Solly measured on MRP or net?
  - Answerer: Brand manager (P-BRM); KDPS Owner approves.
  - Why it matters: The wrong basis changes every bill-value offer.
  - Blocks: Stage 4 (store day): offers.
  - Sources: [ALLEN SOLLY](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/ALLEN%20SOLLY/README.md), [BRAND OFFERS](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/README.md), [offers-and-brand-reports](offers-and-brand-reports.md), [monthly-reports-april-may-2026](../data-from-kdps/monthly-reports-april-may-2026/README.md).
  - Already asked: KDPS Owner 56 asks how a basket offer reads its threshold (partly).
- **Q-47.** In "B1@20% B2@30%" does the higher rate apply to every item or only the second? In "B1G1", "B2 - G1" and "B2 - G2" which item is free, how are the free items chosen and how many items are needed? How is a tier such as `B2` or `B4 & MORE` defined: how many items on one bill, and which items qualify? What does "B2@1599" mean, and is Peter England's `Flat price Off` a price or an amount?
  - Answerer: Brand manager (P-BRM) and the brand; KDPS Owner approves.
  - Why it matters: Each reading gives a different bill.
  - Blocks: Stage 4 (store day): offers.
  - Sources: [offers-and-brand-reports](offers-and-brand-reports.md), [mufti](../data-from-kdps/brand-analysis-report%20/mufti/README.md), [brand-analysis-report](../data-from-kdps/brand-analysis-report%20/README.md).
  - Already asked: KDPS Owner 56 asks whether the free items are the cheapest or the dearest (partly).
- **Q-48.** Are the Louis Philippe Suits flat prices selling prices or amounts off? Which price applies for MRP 12,999, for MRP 18,001, at an exact band edge and before 11 Apr? Which rule decides a suit line's discount (typed amounts, flat prices or the percentage rule)?
  - Answerer: Brand manager (P-BRM).
  - Why it matters: The suit price is the largest single amount in the offer file.
  - Blocks: Stage 4 (store day): offers.
  - Sources: [LOUIS PHILLIPE](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/LOUIS%20PHILLIPE/README.md), [offers-and-brand-reports](offers-and-brand-reports.md), [2026-04](../data-from-kdps/monthly-reports-april-may-2026/2026-04/README.md), [2026-05](../data-from-kdps/monthly-reports-april-may-2026/2026-05/README.md).
- **Q-49.** What are the Mufti 20% and 30% lines before 12 Jun and the 50% lines from 12 Jun, and the Blackberry flat 200, 300 and 400 lines in May? No offer row matches them. Are they manual discounts?
  - Answerer: Brand manager (P-BRM) or KDPS Owner.
  - Why it matters: Discounts with no offer behind them need a rule or an approver.
  - Blocks: Stage 4 (store day): offers; manual discounts.
  - Sources: [brand-analysis-report](../data-from-kdps/brand-analysis-report%20/README.md), [mufti](../data-from-kdps/brand-analysis-report%20/mufti/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).
  - Already asked: KDPS Owner 55 asks about manual discounts on offer items (partly).
- **Q-50.** Do the Store names beside the first three Mufti offer lines limit those slabs to those Stores?
  - Answerer: Brand manager (P-BRM).
  - Why it matters: A Store limit changes who may sell at the slab.
  - Blocks: Stage 4 (store day): offers.
  - Sources: [2026-05/data](../data-from-kdps/monthly-reports-april-may-2026/2026-05/data/README.md).
- **Q-52.** A duffel bag is billed at ₹199 while the Blackberry `OFFER` text says ₹99 (spend of 6,995). Which terms are current, and who funds the difference?
  - Answerer: Brand manager (P-BRM) and Accounts (P-ACC).
  - Why it matters: The bill and the offer sheet disagree on a price.
  - Blocks: Stage 4 (store day): offers.
  - Sources: [blackberry](../data-from-kdps/brand-analysis-report%20/blackberry/README.md), [2026-05/data](../data-from-kdps/monthly-reports-april-may-2026/2026-05/data/README.md), [offers-and-brand-reports](offers-and-brand-reports.md), [analyses-and-metrics](analyses-and-metrics.md).
- **Q-53.** Which offers may a gift promo run alongside, and may a gift promo run in a `FRESH` period?
  - Answerer: Brand manager (P-BRM).
  - Why it matters: The offer engine must know which gift promos may overlap.
  - Blocks: Stage 4 (store day): offers.
  - Sources: [offers-and-brand-reports](offers-and-brand-reports.md).
- **Q-55.** Is the note `NSV - 24lakh 1% 28lakh 2% 34lakh 3%` / `Deo 1staff` beside the Linen Club row a staff incentive slab, and who does it pay?
  - Answerer: KDPS Owner, with HR (P-HRS).
  - Why it matters: Incentives are designed in Stage 6; the note may be the first real slab.
  - Blocks: Stage 6 (people and planning): incentives.
  - Sources: [BRAND OFFERS](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).
- **Q-56.** Should a return cancel the preceding same-style sale line when an offer is counted? Is that a brand rule or KDPS practice, and how is a returned line shown in a brand report?
  - Answerer: KDPS Owner and the brand.
  - Why it matters: Returns change offer counts and brand reports.
  - Blocks: Stage 4 (store day): offers and returns.
  - Sources: [2026-05](../data-from-kdps/monthly-reports-april-may-2026/2026-05/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).
- **Q-57.** Who receives each monthly brand report, by what channel and on what date, and what period does it cover (the whole month or the data cut-off)? Is a brand report used for reimbursement of a brand-funded offer, for an audit by the brand or for information only? How is it turned into a claim, and how is the debit-note type `EOSS CREDIT NOTES` used?
  - Answerer: KDPS Owner (P-OWN) and Accounts (P-ACC).
  - Why it matters: The report layout and any claim flow depend on the purpose.
  - Blocks: No stage yet (brand reports are not placed in a stage). Some READMEs tie brand claims to Stage 5.
  - Sources: [monthly-reports-april-may-2026](../data-from-kdps/monthly-reports-april-may-2026/README.md), [offers-and-brand-reports](offers-and-brand-reports.md), [2026-04](../data-from-kdps/monthly-reports-april-may-2026/2026-04/README.md), [brand-analysis-report](../data-from-kdps/brand-analysis-report%20/README.md), [blackberry](../data-from-kdps/brand-analysis-report%20/blackberry/README.md), [mufti](../data-from-kdps/brand-analysis-report%20/mufti/README.md).
- **Q-58.** Must Apparel OS produce a brand-facing monthly report, or is the brand report (`BRAND REPORT` and `BILL SUMMARY`) only an internal check? If it is brand-facing, how often is it refreshed, which rules must it follow (the tier counts, the cash-off placement and the `FLAT 25%` rule as the brand states them), and should its `SOH` date be the first of the reporting month (opening) or the first of the next month (closing)?
  - Answerer: KDPS Owner (P-OWN) and Brand manager (P-BRM).
  - Why it matters: It decides whether the ERP must produce a brand-facing document.
  - Blocks: No stage yet (brand reports are not placed in a stage).
  - Sources: [brand-analysis-report](../data-from-kdps/brand-analysis-report%20/README.md), [blackberry](../data-from-kdps/brand-analysis-report%20/blackberry/README.md), [mufti](../data-from-kdps/brand-analysis-report%20/mufti/README.md), [analyses-and-metrics](analyses-and-metrics.md), [2026-05](../data-from-kdps/monthly-reports-april-may-2026/2026-05/README.md).
- **Q-59.** Which layout does each brand want (Peter England, Allen Solly, Van Heusen, Banjaran, Flying Machine, Blackberry, Mufti), and which Stores report for which brand? Is "Banjaran" a brand or a Store? Which Banka brands, if any, must be reported to a brand company? Do brands expect the POS discount columns (`P` to `R`) or only `Dis %` and `Dis Amount`, and should the Store tag column `K` stay in a report sent to a brand?
  - Answerer: Brand manager (P-BRM), with the KDPS Owner.
  - Why it matters: Only the Louis Philippe layout, a Flying Machine template, Blackberry and Mufti files are in the folder.
  - Blocks: No stage yet (brand reports are not placed in a stage).
  - Sources: [monthly-reports-april-may-2026](../data-from-kdps/monthly-reports-april-may-2026/README.md), [offers-and-brand-reports](offers-and-brand-reports.md), [2026-04/DATA](../data-from-kdps/monthly-reports-april-may-2026/2026-04/DATA/README.md), [2026-05/data](../data-from-kdps/monthly-reports-april-may-2026/2026-05/data/README.md).
- **Q-60.** Which offer regime (50% and 40% tiers, or the 1,000 and 500 slabs) applies on which dates in the Flying Machine template?
  - Answerer: Brand manager (P-BRM).
  - Why it matters: The template holds both and does not say which applies when.
  - Blocks: Stage 4 (store day): offers.
  - Sources: [monthly-reports-april-may-2026](../data-from-kdps/monthly-reports-april-may-2026/README.md).

#### Items that are not stock: carry bags and gifts

- **Q-61.** Are carry bags stocked items? Which items count as gifts: the trolleys, backpacks and bags with a cost near 8% of MRP? How are gift-with-purchase and promo goods received, valued, sold, and kept out of stock value, dead stock and margin?
  - Answerer: KDPS Owner, with Accounts for cost and Operations (P-OPS).
  - Why it matters: Gifts spoil stock value, dead-stock and margin figures if they are counted as ordinary stock.
  - Blocks: Stage 1 (shared foundation): item masters; Stage 4 (store day): offers.
  - Sources: [store-analysis](../data-from-kdps/store-analysis/README.md), [VAISHNAVI](../data-from-kdps/store-analysis/VAISHNAVI/README.md), [data-quality-and-import-rules](data-quality-and-import-rules.md), [pos-exports](pos-exports.md), [store-close-cash-and-bank](store-close-cash-and-bank.md), [analyses-and-metrics](analyses-and-metrics.md), [purchases-and-supplier-notes](purchases-and-supplier-notes.md).

#### Reports, dashboards and planning

- **Q-62.** How does KDPS define the dashboard measures: sale (gross, net, tax in or out), whether returns and free carry bags count in quantity and bills, the month-to-date and year-to-date basis, average bill value, units per transaction, discount value and percentage, "known customer" and "repeat customer", "target" and "achievement"?
  - Answerer: KDPS Owner and Accounts (P-ACC).
  - Why it matters: A report is only as good as its definitions (`PRD-EXC-009`).
  - Blocks: Stage 4 (store day): reports; basic reports belong to every stage (`PRD-STG-001`).
  - Sources: [access-and-store-asks](access-and-store-asks.md), [analyses-and-metrics](analyses-and-metrics.md), [scope-dashboard-detail](../data-from-kdps/scope-dashboard-detail/README.md), [hazaribagh](../data-from-kdps/store-analysis/hazaribagh/README.md).
- **Q-63.** Which meaning of "aged stock", "dead stock", "cold stock", "months of cover", "sell-through", "stock turn" and "fast item out of stock" does KDPS want, given the PRD's terms? Is ageing counted from the date the stock was received or from the season label?
  - Answerer: KDPS Owner, with the product owner.
  - Why it matters: The dead-stock report and planning suggestions need one meaning each.
  - Blocks: Stage 3 (stock movement): dead-stock report; Stage 6 (people and planning): planning suggestions, `POL-15.01`.
  - Sources: [jsl](../data-from-kdps/store-analysis/jsl/README.md), [analyses-and-metrics](analyses-and-metrics.md), [store-analysis](../data-from-kdps/store-analysis/README.md).
- **Q-64.** Which measures does KDPS want on a Store dashboard?
  - Why it matters: The measures the earlier dashboards show are not a KDPS decision.
  - Blocks: Reports in every stage.
  - Sources: [hazaribagh](../data-from-kdps/store-analysis/hazaribagh/README.md), [analyses-and-metrics](analyses-and-metrics.md).
- **Q-65.** What basis should a winter or seasonal buying budget have? Are there October-to-February actuals from earlier years to start from? The ₹78 L winter budget in the earlier analysis is an analyst figure, not a KDPS one.
  - Answerer: KDPS Owner, with Booking (P-BKG) and Accounts.
  - Why it matters: The only budget in the data comes from an analysis, not from a KDPS policy.
  - Blocks: Stage 2 (goods-in): booking and open-to-buy configuration; Stage 6 (people and planning): planning.
  - Sources: [jsl](../data-from-kdps/store-analysis/jsl/README.md), [analyses-and-metrics](analyses-and-metrics.md).
  - Already asked: KDPS Owner 10 (buying budget) and 36 (forecast horizons) cover part.

#### People, access and HR

- **Q-67.** Who is to approve what, and up to what value: transfers, discounts, pricing, bookings, stock counts above tolerance and write-offs?
  - Why it matters: The access grid names roles for these; the policy leaves the limits open.
  - Blocks: Stage 1 (shared foundation): live approvals; Stage 3 (stock movement).
  - Sources: [access-and-store-asks](access-and-store-asks.md), [transfers](transfers.md).
  - Already asked: KDPS Owner 2, 13 and 42.
- **Q-69.** Should Admin have no Finance access (a note says "kept deliberately"), and may Owner have no billing right? Should Admin hold billing, returns, inventory, GRN and pricing approval, as the grid says, when the PRD describes Admin as users, permissions, masters, configuration and integrations?
  - Answerer: KDPS Owner, with Accounts and the product owner.
  - Why it matters: It decides how far the Admin role reaches.
  - Blocks: Stage 1 (shared foundation): access.
  - Sources: [scope-dashboard-detail](../data-from-kdps/scope-dashboard-detail/README.md), [access-and-store-asks](access-and-store-asks.md).
- **Q-70.** Which Store roles may see a customer's name and phone number (a restricted field)?
  - Why it matters: Customer search is a screen at the till.
  - Blocks: Stage 4 (store day): customer search, `PRD-ACS-008`.
  - Sources: [access-and-store-asks](access-and-store-asks.md).
- **Q-72.** Do the Stores really want a fingerprint or other biometric attendance device? The PRD allows only a photo, a location and a device (`PRD-HRM-004`); a change needs a decision entry.
  - Answerer: KDPS Owner, with HR (P-HRS).
  - Why it matters: It changes the attendance design.
  - Blocks: Stage 6 (people and planning): attendance.
  - Sources: [store-requirements-users](../data-from-kdps/store-requirements-users/README.md), [access-and-store-asks](access-and-store-asks.md).
- **Q-73.** Does "member" in the Store requirements mean staff (the 25 Jul paragraph says so), and does KDPS confirm that?
  - Why it matters: The HR design rests on the reading.
  - Blocks: Stage 6 (people and planning): HR.
  - Sources: [store-requirements-users](../data-from-kdps/store-requirements-users/README.md).
- **Q-74.** May the ERP hold staff bank and contact details (a note says "Member Details"), and who may keep and see them at a Store?
  - Answerer: KDPS Owner, with HR (P-HRS).
  - Why it matters: `PRD-HRM-002` allows them only within an authorised scope.
  - Blocks: Stage 6 (people and planning); the restricted-field rule is needed in Stage 1 (shared foundation).
  - Sources: [store-requirements-users](../data-from-kdps/store-requirements-users/README.md), [access-and-store-asks](access-and-store-asks.md).
- **Q-75.** Who sets staff and Store targets, on what basis, and where do the first values come from? What counts as achievement (bills rung by that person)?
  - Answerer: KDPS Owner, with HR (P-HRS).
  - Why it matters: Targets drive the incentive and dashboard design (`PRD-HRM-009`).
  - Blocks: Stage 6 (people and planning).
  - Sources: [store-requirements-users](../data-from-kdps/store-requirements-users/README.md), [scope-dashboard-detail](../data-from-kdps/scope-dashboard-detail/README.md), [access-and-store-asks](access-and-store-asks.md).
  - Already asked: KDPS Owner 35 asks for incentive schemes and targets by employer and staff group (partly).
- **Q-76.** What do these Store requests mean: "pie" or "pie or picture of members" (a pie chart or a picture), "growth" and "de-growth", "voucher search", "PT file generation", "booking at a Store" (do Store staff place bookings?) and "invoice upload (Madura)" at the Store rather than at the warehouse?
  - Answerer: KDPS Owner, with Operations (P-OPS), Booking (P-BKG) and HR (P-HRS).
  - Why it matters: The Store asks cannot become requirements until the words are clear.
  - Blocks: Stage 2 (goods-in): voucher search, PT, booking; Stage 6 (people and planning): members.
  - Sources: [store-requirements-users](../data-from-kdps/store-requirements-users/README.md), [access-and-store-asks](access-and-store-asks.md).
- **Q-77.** To whom is attendance sent, and how often?
  - Answerer: HR (P-HRS).
  - Why it matters: It shapes the attendance report.
  - Blocks: Stage 6 (people and planning): attendance.
  - Sources: [access-and-store-asks](access-and-store-asks.md).

#### Data and privacy on the test setup

- **Q-79.** May customer phone numbers be used for WhatsApp reminders and customer lists?
  - Answerer: KDPS Owner, with the CA (P-CHA).
  - Why it matters: Customer reports and messaging depend on consent.
  - Blocks: Stage 4 (store day): customer reports; messaging in Stage 5 (financial control).
  - Sources: [hazaribagh](../data-from-kdps/store-analysis/hazaribagh/README.md), [analyses-and-metrics](analyses-and-metrics.md).
  - Already asked: KDPS Owner 22 asks about the purpose and the consent text (partly).
- **Q-80.** May the KDPS logo be used on screens, receipts and labels, and in which version?
  - Why it matters: The UI design language has an empty logo slot.
  - Blocks: Does not block a stage; it blocks the UI design language only.
  - Sources: [05-reference-data](../data-from-kdps/05-reference-data/README.md).
  - Already asked: The KDPS section ("Logo") asks for the artwork; the permission and version are not asked (partly).

### Accounts (P-ACC)

Questions about money, books, suppliers, banks and brand claims. Several are shared with the CA and say so.

#### Cost, tax basis and the books

- **Q-82.** Which price is the cost to book: the vendor rate, the taxable value divided by quantity, or the net unit cost? The cases are Peter England's service charge, MUFTI's taxable amount 0.35% above rate times quantity, Jockey `Cost` against `Doc Rate`, and DEAL `Purchase Price` against `Item Rate`.
  - Why it matters: Receipt cost feeds every margin and stock value.
  - Blocks: Stage 2 (goods-in): costing.
  - Sources: [PT FILE](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md), [pt-file-layouts](pt-file-layouts.md).
  - Already asked: Accounts 6 asks for each brand's cost formula (partly).
- **Q-83.** What is each brand's rule from `BASIC` to `P RATE`, and will KDPS sign it as that brand's costing profile (`POL-03.06`)? In the worked example `BASIC` is 65% of `MRP` and `P RATE` 78%: is that the agreed brand margin?
  - Answerer: Accounts and the CA (P-CHA), with Booking.
  - Why it matters: The costing profile that sets `P RATE` is not signed.
  - Blocks: Stage 1 (shared foundation): costing configuration.
  - Sources: [data-from-kdps](../data-from-kdps/README.md), [pt-file-layouts](pt-file-layouts.md).
  - Already asked: Accounts 6 asks for each brand's cost formula (partly).
- **Q-84.** Must `BASIC` match the invoice rate exactly (to the paise), or may it be rounded to the rupee? How are round-off differences handled?
  - Answerer: Accounts, with the KDPS Owner.
  - Why it matters: It sets the tolerance when a PT is checked against an invoice.
  - Blocks: Stage 2 (goods-in): PT against invoice.
  - Sources: [vendor-files](../data-from-kdps/05-reference-data/vendor-files/README.md), [pt-file-layouts](pt-file-layouts.md).
  - Already asked: Accounts 4 asks how large a matching difference may be (partly).
- **Q-85.** What are `Motiya` and `Bus Fare` on the supplier invoices? Are they taxed, and are they part of the cost of the goods?
  - Answerer: Accounts and the CA (P-CHA).
  - Why it matters: They change the receipt cost.
  - Blocks: Stage 1 (shared foundation): costing profile.
  - Sources: [vendor-files](../data-from-kdps/05-reference-data/vendor-files/README.md), [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
- **Q-86.** Which running costs does KDPS charge to a Store's profit, at what values, and do they include staff salary? The earlier analyses used 7% of sales, rent ₹2.2 L, electricity ₹1.0 L and miscellaneous ₹0.4 L; those are analyst figures, not KDPS ones.
  - Answerer: Accounts, with the KDPS Owner.
  - Why it matters: These costs sit inside the earlier Store-profit analyses; they are analyst figures, not KDPS figures.
  - Blocks: Stage 5 (financial control): Store profit.
  - Sources: [hazaribagh](../data-from-kdps/store-analysis/hazaribagh/README.md), [jsl](../data-from-kdps/store-analysis/jsl/README.md), [analyses-and-metrics](analyses-and-metrics.md).
  - Already asked: KDPS Owner 34 asks how shared costs are allocated to Stores (partly).
- **Q-87.** Who pays the freight on a transfer, and how is it split between Stores (`LEE` 250 against Vaishnavi Deoghar 270)? Is it an expense of the receiving Store or an addition to stock cost?
  - Answerer: Accounts, with the CA (P-CHA).
  - Why it matters: No PRD rule covers freight on transfers.
  - Blocks: Stage 3 (stock movement); Stage 5 (financial control).
  - Sources: [transfer-data](../data-from-kdps/transfer-data/README.md), [transfers](transfers.md).
- **Q-88.** Is the Tally company "JH 24-25" the book KDPS treats as official for Jharkhand, and how are company files named for later years?
  - Answerer: Accounts and the CA (P-CHA).
  - Why it matters: Book settings must follow the official book.
  - Blocks: Stage 1 (shared foundation): book settings.
  - Sources: [vendor-files](../data-from-kdps/05-reference-data/vendor-files/README.md).
- **Q-90.** How many GST registrations does KDPS have, in which States, and which Store and warehouse uses which? Do the Bihar and Jharkhand Stores sit under different registrations?
  - Answerer: Accounts, with the CA (P-CHA).
  - Why it matters: Tax documents, transfers and bill series follow the registration.
  - Blocks: Stage 2 (goods-in): `POL-10.08`; Stage 3 (stock movement): transfers.
  - Sources: [stores-and-codes](stores-and-codes.md), [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md).
  - Already asked: Accounts 5 and CA 16.
- **Q-91.** Which legal entity invoices Peter England, Allen Solly, Louis Philippe and Van Heusen (Madura, Aditya Birla Lifestyle Brands or Aditya Birla Fashion), and from when? Is brand to Supplier one to one? Are `D Apparel` and `D D APPARELS` one business?
  - Answerer: Accounts, with the KDPS Owner.
  - Why it matters: The Supplier master needs one record per legal party.
  - Blocks: Stage 1 (shared foundation): Supplier master.
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [data-quality-and-import-rules](data-quality-and-import-rules.md), [item-master-vocabulary](item-master-vocabulary.md), [pt-file-layouts](pt-file-layouts.md).
- **Q-92.** Under which customer name and registration does Madura bill the Patna place and the Singh More Store?
  - Why it matters: The goods-in match depends on the buyer name.
  - Blocks: Stage 2 (goods-in).
  - Sources: [stores-and-codes](stores-and-codes.md).

#### Suppliers, debit notes and claims

- **Q-94.** What is the base and the rule for the cash discount (before tax, within credit days, "NET", "% in bill")? What does credit days "NO" mean (pay on delivery)? What is "Interest If Any", and which way does it move the balance?
  - Why it matters: Payment terms drive the payables design.
  - Blocks: Stage 5 (financial control): payables; inferred.
  - Sources: [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
- **Q-95.** What does an agency company do (commission, billing, collection)? Does KDPS pay the agent anything? What is "Direct"?
  - Answerer: Accounts, with Booking (P-BKG).
  - Why it matters: It decides whether an agent is a party in the Supplier master.
  - Blocks: Stage 2 (goods-in).
  - Sources: [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
- **Q-97.** Which debit-note types are brand-funded (`EOSS CREDIT NOTES`, `STAFF SALARY REIMBURSEMENT`, `FURNITURE CLAIM`, `MONTHLY TARGET INCENTIVE`), and do they exist in practice? When are the claim statuses `HOLD` and `REJECTED` used?
  - Answerer: Accounts, with the Brand manager (P-BRM).
  - Why it matters: They are never used in the data, so their meaning is unknown.
  - Blocks: Stage 5 (financial control): claims.
  - Sources: [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
- **Q-102.** Which Suppliers are MSME, and does KDPS hold the evidence for each? (A Udyam number appears on one ledger.)
  - Why it matters: The payment deadline for MSME suppliers is set by law.
  - Blocks: Stage 5 (financial control).
  - Sources: [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
  - Already asked: CA 9 asks for MSME evidence and the payment deadline.
- **Q-103.** Are Suppliers paid from one bank account or several?
  - Why it matters: Bank matching needs the list of paying accounts.
  - Blocks: Stage 5 (financial control): bank matching.
  - Sources: [purchases-and-supplier-notes](purchases-and-supplier-notes.md).

#### Tenders, cash and the bank

- **Q-104.** What is the rounding rule, and which tolerance applies to rounding differences? Accounts sets tolerance values only after reviewing real examples (`POL-09.24`).
  - Answerer: Accounts and the CA (P-CHA).
  - Why it matters: Day-close and import checks need one rule.
  - Blocks: Stage 4 (store day): tenders and rounding.
  - Sources: [data-quality-and-import-rules](data-quality-and-import-rules.md), [store-close-cash-and-bank](store-close-cash-and-bank.md).
  - Already asked: Accounts 4, 16 and 17.
- **Q-106.** Where do per-Store UPI settlement amounts come from (the PhonePe merchant report?), and is UPI settled as one credit a day for all Stores?
  - Why it matters: A Store cannot reconcile its day without its own settlement.
  - Blocks: Stage 4 (store day): day close; Stage 5 (financial control): settlement matching.
  - Sources: [bank-statement](../data-from-kdps/bank-statement/README.md), [store-close-cash-and-bank](store-close-cash-and-bank.md).
- **Q-107.** Which card terminals belong to which Store? Is a terminal ever shared between Stores? How many settle a day, and on which day does each settle?
  - Why it matters: Card settlement matching works per terminal.
  - Blocks: Stage 4 (store day); Stage 5 (financial control).
  - Sources: [store-close-cash-and-bank](store-close-cash-and-bank.md).
  - Already asked: KDPS Owner 16 asks for provider arrangements and evidence for each tender (partly).
- **Q-108.** How are dues sales approved (limit, due date), and who chases recovery? What do "Dues Sale" and "Satt" mean in KDPS's own words?
  - Answerer: Accounts, with the KDPS Owner.
  - Why it matters: Customer credit is a controlled tender.
  - Blocks: Stage 4 (store day); Customer credit goes live in Stage 5 (financial control).
  - Sources: [bank-statement](../data-from-kdps/bank-statement/README.md), [store-close-cash-and-bank](store-close-cash-and-bank.md).
  - Already asked: KDPS Owner 16 asks for Customer credit limits and due dates (partly).
- **Q-109.** Who receives cash sent to head office, and how is receipt confirmed?
  - Answerer: Accounts, with the KDPS Owner.
  - Why it matters: Cash pickup and deposit are part of the day close.
  - Blocks: Stage 4 (store day): cash pickup and deposit.
  - Sources: [store-close-cash-and-bank](store-close-cash-and-bank.md).
- **Q-110.** When will petty cash start, and which heads are allowed (what are "Wow Bill/ Incentive Expance" and "Net Charge")? What float and limits apply?
  - Answerer: Accounts, with the KDPS Owner.
  - Why it matters: `POL-09.14` says they are unset.
  - Blocks: Stage 4 (store day): petty expenses.
  - Sources: [store-close-cash-and-bank](store-close-cash-and-bank.md).
  - Already asked: Accounts 7 asks for the float and spending limit per Store (partly).
- **Q-112.** Which fees apply to the EZCASH and cash-deposit channels (the March fee of ₹19,651 and the May handling charge of ₹236), and do they follow a monthly schedule?
  - Why it matters: Bank charges need an account to post to.
  - Blocks: Stage 5 (financial control): bank matching.
  - Sources: [store-close-cash-and-bank](store-close-cash-and-bank.md).
- **Q-113.** Why is 15 Apr to 31 May missing from the bank extract? Can KDPS give the full period in the bank's own export format, with the other accounts and the account balance? Who prepares the extract, and may a sample be used in the development environment?
  - Why it matters: Bank matching cannot be tested on a partial statement.
  - Blocks: Stage 5 (financial control): bank statement import.
  - Sources: [bank-statement](../data-from-kdps/bank-statement/README.md), [store-close-cash-and-bank](store-close-cash-and-bank.md).

#### Brand reports: periods, stock dates and totals

- **Q-116.** What must a brand claim or brand report total reconcile to: the POS net, the brand's own offer calculation, receipts, bank settlement or credit notes?
  - Answerer: Accounts and the CA (P-CHA).
  - Why it matters: The totals are not receipts, and no file reconciles them.
  - Blocks: No stage yet (brand reports are not placed in a stage).
  - Sources: [2026-04](../data-from-kdps/monthly-reports-april-may-2026/2026-04/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).

### CA (P-CHA)

Tax and statutory questions. Where Accounts holds the numbers, the question says so.

#### GST and tax documents

- **Q-117.** Which GST rule is current? The data shows 5% or 12% below a threshold and 18% above (cut-offs 2,500 and 2,625; "less than" or "less than or equal"), a daily-sales-report rule of 12/112 below ₹2,500 and 18/118 from ₹2,500 on the line value, and input and output tax formulas in the PT sheets. Which value is compared (cost, MRP, net sale value; per piece or per line), is the `TAX FREE` value used, and which of the PT sheet, the daily sales report and the vendor invoices is current?
  - Why it matters: Three files give three different pictures; the tax-rule records need one.
  - Blocks: Stage 1 (shared foundation): tax-rule records; Stage 2 (goods-in): tax on receipt; Stage 4 (store day): counter tax.
  - Sources: [data-from-kdps](../data-from-kdps/README.md), [bank-statement](../data-from-kdps/bank-statement/README.md), [store-close-cash-and-bank](store-close-cash-and-bank.md), [item-master-vocabulary](item-master-vocabulary.md), [pt-file-layouts](pt-file-layouts.md), [data-quality-and-import-rules](data-quality-and-import-rules.md).
  - Already asked: CA 22 (value slabs) and Accounts 5 (rates and slabs).
- **Q-119.** When is tax charged on a transfer between KDPS places in two States, and does Deoghar to Hazaribagh (both Jharkhand) need only a delivery challan? Does the Ranchi warehouse send to Bihar Stores on a challan or on a tax invoice? When is a challan issued and when a tax invoice, is an e-way bill raised and from what value? Which entity and registration does the challan series `DCJ` belong to, and which movements get a challan?
  - Why it matters: The transfer documents and tax rules depend on the answers.
  - Blocks: Stage 3 (stock movement): `POL-10.03`, `PRD-TRF-023`.
  - Sources: [transfer-data](../data-from-kdps/transfer-data/README.md), [transfers](transfers.md), [stores-and-codes](stores-and-codes.md).
  - Already asked: CA 17 asks about the number format of documents that travel with goods (partly).
- **Q-120.** Confirm that the financial year starts on 1 April, and give the allowed length and characters of a bill number per registration (`POL-10.07`).
  - Why it matters: Bill number series restart with the financial year.
  - Blocks: Stage 4 (store day): billing.
  - Sources: [stores-and-codes](stores-and-codes.md).
  - Already asked: CA 4 and Accounts 14.
- **Q-121.** How is a brand "GST benefit" recorded in the books? That covers Peter England's `PE GST benefit` (11.02%, 6.25%, `FLAT`) and the Flying Machine `Dis Amount` (a lookup of `GST DIFF` by MRP). Is it a pass-on of a GST rate change as an offer, as brand support or as neither? What is the GST value of a gift sold at a token price?
  - Answerer: CA, with Accounts (P-ACC).
  - Why it matters: It decides whether these lines are offers, brand support or tax adjustments.
  - Blocks: Stage 5 (financial control): books; Stage 2 (goods-in): goods and rate classification.
  - Sources: [PETER ENGLAND](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/PETER%20ENGLAND/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).
- **Q-122.** How is a credit note posted to the wrong legal entity corrected, and which entity books each claim?
  - Answerer: CA, with Accounts (P-ACC).
  - Why it matters: Claims sit across several entities.
  - Blocks: Stage 5 (financial control): claims.
  - Sources: [purchases-and-supplier-notes](purchases-and-supplier-notes.md).

### KDPS data providers (Priyo, Debanjan)

Requests to send a file the design needs. The requirements checklist (MOM) in `Q&A-req-recieved` names Priyo for items 1 to 6, 8, 9, 12 and 13, and Debanjan for items 7, 10 and 11. The files themselves are also listed at the end.

#### Files and formats

- **Q-130.** Please send the complete list of probable software users and their privileges (MOM item 13): who will use the ERP, at which Store or office, with which role. The sheet `USERS` is empty.
  - Answerer: Priyo.
  - Why it matters: Roles and role assignments cannot be set up without it.
  - Blocks: Stage 1 (shared foundation): users, roles and every live operation.
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [access-and-store-asks](access-and-store-asks.md).
  - Already asked: KDPS Owner 1 (Who does what?).
- **Q-131.** Please send the brand margin file (MOM item 2, marked DONE but not in the folder).
  - Answerer: Priyo.
  - Why it matters: (guess) It holds the margin behind each brand's cost.
  - Blocks: Not stated for this item alone. The README groups items 2, 7, 8 and 9 as blocking Stage 3 (stock movement) and Stage 5 (financial control).
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [access-and-store-asks](access-and-store-asks.md).
- **Q-132.** Please send the documents for the TEN software API (MOM item 8, "processed") and the bank API (item 9). Both note "meeting done"; no document is in the folder.
  - Answerer: Priyo.
  - Why it matters: The Tally and bank connectors need them.
  - Blocks: Stage 5 (financial control): Tally and bank.
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [access-and-store-asks](access-and-store-asks.md).
- **Q-133.** Please send the complete list of places (every Store, office, warehouse and counter) with code, town, format (MBO, single-brand, family store, shop-in-shop), opening date, legal entity and tax registration. The Store list has 17 rows, but the data names more places (Ratu, Sanskar, Fashion Studio, Patna, TAS and the towns in bank narrations).
  - Answerer: Priyo.
  - Why it matters: The Store master cannot be loaded from the 17-row list.
  - Blocks: Stage 1 (shared foundation): structure and masters.
  - Sources: [stores-and-codes](stores-and-codes.md), [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md).
  - Already asked: Accounts 5 and Operations 4 ask for registrations and routes (partly).
- **Q-134.** Please send a real set for the warehouse-to-Store transfer format (MOM item 7, marked "explained", no file): the warehouse's transfer document, the packing list and the challan for one delivery, with a written note of who prepares what and when. Also say at what value a transfer is shown (349 per piece on the sample challan).
  - Answerer: Debanjan.
  - Why it matters: The transfer design starts from the real document.
  - Blocks: Stage 3 (stock movement): transfer design.
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [transfer-data](../data-from-kdps/transfer-data/README.md), [transfers](transfers.md), [access-and-store-asks](access-and-store-asks.md).

### Product owner

Questions about our own product and the earlier ERP-team work. A KDPS decision, where one is needed, is named in the question.

#### Access, screens and the earlier ERP-team work

- **Q-140.** Are the six roles of the grid in `ERP_DASHBOARD_V1.xlsx` meant to be the first six templates of policy 2 (`POL-02.01`)? Does the grid's `Store Person` match the earlier `store_person` role, which [personas.md](../design/access/personas.md) places under Store POS (P-STM, P-CSH, P-SLS)? What do the level words `Full`, `Create`, `Approve`, `Recommend`, `Override`, `Monitor`, `Configure` and `Maintain` mean?
  - Why it matters: The grid is the only role evidence in the data and has no definitions.
  - Blocks: Stage 1 (shared foundation): role design.
  - Sources: [scope-dashboard-detail](../data-from-kdps/scope-dashboard-detail/README.md), [access-and-store-asks](access-and-store-asks.md).
- **Q-141.** Whose dashboard is the landing page: one page for the Owner or one per persona (`PRD-UXP-001`)?
  - Why it matters: It decides the home screens.
  - Blocks: Stage 1 (shared foundation): home screens.
  - Sources: [access-and-store-asks](access-and-store-asks.md).
- **Q-143.** Should any analyst threshold become KDPS policy: the 14-month sold window, the 2024 / 2025 / 2026 buckets, 6 or more pieces as overstock, 3 to 4 turns a year, margin colours, sell-through bands, the 36 to 37% discount ceiling, the brand labels? None is signed. The KDPS Owner decides, and the product owner records it (see `POL-19.03` for markdown approval).
  - Why it matters: These values are analyst assumptions; the build must not treat them as policy (`POL-15.07`).
  - Blocks: Stage 3 (stock movement): dead-stock report; Stage 6 (people and planning): planning suggestions, `POL-15.01`.
  - Sources: [store-analysis](../data-from-kdps/store-analysis/README.md), [hazaribagh](../data-from-kdps/store-analysis/hazaribagh/README.md), [analyses-and-metrics](analyses-and-metrics.md).
- **Q-144.** Is a footfall counter wanted? If so it needs a PRD entry first.
  - Answerer: Product owner, with the KDPS Owner.
  - Why it matters: The earlier dashboards show a footfall idea that the PRD does not cover.
  - Blocks: Does not block.
  - Sources: [analyses-and-metrics](analyses-and-metrics.md).
- **Q-145.** Does the ERP need a "gift or promotional item" flag so dead stock, sell-through and margin can exclude gifts?
  - Why it matters: The earlier analyses had to guess which items were gifts.
  - Blocks: Stage 1 (shared foundation): item masters; Stage 3 (stock movement): reports.
  - Sources: [store-analysis](../data-from-kdps/store-analysis/README.md), [analyses-and-metrics](analyses-and-metrics.md).

#### Imports and PRD fit

- **Q-150.** Gifts at a token price, count-tier percentages, flat prices per MRP band, a price for a pair, a cash-off fallback and "X or Y" alternatives have no kind in `PRD-OFR-001`. Should the PRD add them, and does a brand report need the reward unit named?
  - Answerer: Product owner (PRD change: needs a decision entry first).
  - Why it matters: The offers in the data do not fit the PRD's offer kinds.
  - Blocks: Stage 4 (store day): offers.
  - Sources: [offers-and-brand-reports](offers-and-brand-reports.md).
- **Q-151.** Should the PRD hold a brand's eligibility list with a flag per style, a reason, an as-on date and an approval reference, and a brand-facing monthly report?
  - Answerer: Product owner (PRD change: needs a decision entry first).
  - Why it matters: The AMM list is such a list, kept outside the ERP.
  - Blocks: Stage 4 (store day) for the list; no stage for the report.
  - Sources: [offers-and-brand-reports](offers-and-brand-reports.md).

## Part B — Needed to move data in

Answers here are needed only to load opening data or to run the side-by-side test: what an old column means, which file is the stock of which Store, unrounded barcodes, the age of opening stock, totals that do not reconcile. They set no policy. The earlier POS stays the system of record during the test, and its imports never move stock (`PRD-LIF-014`).

### KDPS Owner (P-OWN)

The Owner may pass a question to the person named in its Answerer line, as in Part A.

#### Places, codes and legal entities

- **Q-1.** What do these codes stand for? Bill series and senders: `VAS`, `DEOT`, `ASVH`, `RKJ`, `KLG2`, `FS`, `SR`, `TAS`, `LBKR`, and `SBJ` against `SBG`. Bank-file and stock-source codes: `WH`, `BGP`, `VAB`, `DEO`, `DMK`, `JSL`, `KLG`, `JBNK`, `GAYA`, `SAN`, `LEEDEO`. Destination codes in PT file names: `HZB`, `FS-DEO`.
  - Answerer: Operations (P-OPS).
  - Why it matters: The earlier-POS imports cannot name a place until its code is known. The codes the new Store master keeps come from Q-3 and Q-133.
  - Blocks: Stage 1 (shared foundation): Store master, import layouts; the side-by-side test.
  - Sources: [stores-and-codes](stores-and-codes.md), [bank-statement](../data-from-kdps/bank-statement/README.md), [store-close-cash-and-bank](store-close-cash-and-bank.md), [purchases-and-supplier-notes](purchases-and-supplier-notes.md), [pos-exports](pos-exports.md).
- **Q-2.** Which town is "Singh More"? Is it the Store behind the bill code `SGMR`, is "Vaishnavi Ratu" the same Store, and is `SOH REPORT FORMAT.xlsx` (Store and date range) its stock list?
  - Why it matters: Its sales, bank and stock files cannot be tied to a Store until the town is known.
  - Blocks: The side-by-side test and the opening load for this Store. The Store itself is listed through Q-133.
  - Sources: [stores-and-codes](stores-and-codes.md), [bank-statement](../data-from-kdps/bank-statement/README.md), [store-close-cash-and-bank](store-close-cash-and-bank.md), [pos-exports](pos-exports.md), [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md).

#### The earlier POS and its exports

- **Q-9.** Which POS software and version produces each export layout at each Store (Banka, AS-DEO, Dumka, VAS-DEO, Bokaro, HZB, Sanskar, Vaishnavi, JSL)? What do the flags `CLOUD` and `RETAIL JI` mean?
  - Answerer: Operations (P-OPS).
  - Why it matters: Every import adapter and the switch plan depend on knowing which POS runs where.
  - Blocks: Stage 1 (shared foundation): Site and Store master; the side-by-side test; the switch plan.
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [stores-and-codes](stores-and-codes.md), [pos-exports](pos-exports.md), [2026-04/DATA](../data-from-kdps/monthly-reports-april-may-2026/2026-04/DATA/README.md), [2026-04](../data-from-kdps/monthly-reports-april-may-2026/2026-04/README.md), [store-analysis](../data-from-kdps/store-analysis/README.md), [VAISHNAVI](../data-from-kdps/store-analysis/VAISHNAVI/README.md).
- **Q-11.** Is the `LP2` sheet in the AS-DEO file the Louis Philippe range of the Allen Solly Store? Is Bokaro's `SOH` meant to be its own `Stock` or the AS-DEO `LP2 SOH `? Where is Sanskar's stock list?
  - Why it matters: Without this a brand report cannot say which stock belongs to which Store.
  - Blocks: Does not block the build; it blocks the side-by-side imports for these Stores.
  - Sources: [2026-04/DATA](../data-from-kdps/monthly-reports-april-may-2026/2026-04/DATA/README.md), [2026-04](../data-from-kdps/monthly-reports-april-may-2026/2026-04/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).

#### Items, brands and suppliers (masters)

- **Q-13.** What does the month in a `Season` tag mean: the month the lot arrived, the season launch or something else? What do `SPRING SUMMER(Jul-25)` and `AUTUMN WINTER(Jan-26)` mean, why do some `Season` cells hold dates, and may a "Mon-YY" text be read as a month? How old is opening stock at the switch count?
  - Answerer: Booking (P-BKG).
  - Why it matters: Stock ageing needs a real receipt date; in some exports `Season` is all there is.
  - Blocks: The opening-stock load (`PRD-LIF-006`); ageing of opening stock; Stage 2 (goods-in): PT.
  - Sources: [store-analysis](../data-from-kdps/store-analysis/README.md), [VAISHNAVI](../data-from-kdps/store-analysis/VAISHNAVI/README.md), [jsl](../data-from-kdps/store-analysis/jsl/README.md), [data-quality-and-import-rules](data-quality-and-import-rules.md), [item-master-vocabulary](item-master-vocabulary.md), [analyses-and-metrics](analyses-and-metrics.md).
- **Q-14.** What do the `Fit` codes (`LM`, `VLM`, `MM`, `HM`, `HLM`, `VHM`, `LOSS`) and the last letters `M`, `E`, `P` of category codes such as `USM`, `USE`, `USP` mean? Who assigns them? (The `PREMIUM` / `MEDIUM` / `ECONOMY` / `ASSO.` tags in `Color` are parked: staff tag goods with no clear colour or classification this way, per the product owner, 4 Oct 2026; how the product handles them is a separate discussion, and no question is asked here.)
  - Answerer: Booking (P-BKG), with Accounts for the `Fit` codes.
  - Why it matters: These codes sit in columns the ERP gives other meanings; they must not be read wrongly when old files are loaded.
  - Blocks: Stage 1 (shared foundation): vocabulary; Stage 2 (goods-in): PT, SKU identity.
  - Sources: [data-quality-and-import-rules](data-quality-and-import-rules.md), [item-master-vocabulary](item-master-vocabulary.md), [pos-exports](pos-exports.md), [VAISHNAVI](../data-from-kdps/store-analysis/VAISHNAVI/README.md).

#### Goods in and PT files

- **Q-26.** Is `ARVIND ALL BRAND & SPYKAR_PT.xlsx` (named for all Arvind brands, only `FM` rows, narration `EXTRA STOCK CORRECTION`) real goods-in or a correction document? Which of two similar codes is right for the Aditya Birla Deogarh account in the same file set?
  - Answerer: Booking (P-BKG), with the KDPS Owner.
  - Why it matters: A stock correction must never be read as goods received.
  - Blocks: Stage 2 (goods-in): import design.
  - Sources: [PT FILE](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md), [pt-file-layouts](pt-file-layouts.md).
- **Q-27.** Do the `ambreli` invoice sheet (16 lines, 76 pieces) and its hidden packing list (72 lines, 275 pieces) belong to one shipment?
  - Answerer: Booking (P-BKG).
  - Why it matters: The two disagree on lines and pieces; the import cannot use both.
  - Blocks: Stage 2 (goods-in): import design.
  - Sources: [PT FILE](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md), [pt-file-layouts](pt-file-layouts.md).
- **Q-30.** What does the supplier "KDPS LIFESTYLE PVT LTD (DEOGHAR)" in the stock export stand for: own stock or a transfer?
  - Answerer: KDPS Owner, with Accounts and Operations.
  - Why it matters: A transfer must not be loaded as a supplier receipt.
  - Blocks: Stage 2 (goods-in); Stage 3 (stock movement).
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [item-master-vocabulary](item-master-vocabulary.md).

#### Transfers and stock movement

- **Q-34.** What are the `S-` documents? Is there one per carton, brand, Store or day? Is the `Date` the dispatch date or the date keyed at the Store?
  - Answerer: Operations (P-OPS).
  - Why it matters: It decides how the old ledgers are imported beside the new transfer documents.
  - Blocks: Stage 3 (stock movement); the side-by-side import of ledgers.
  - Sources: [transfers](transfers.md).
- **Q-35.** What do the 1,576 lines with no reason, the `Stock Transferr` lines and the defective returns to the warehouse mean in the earlier-POS exports, and how must the side-by-side import treat them so they never move stock?
  - Answerer: Operations (P-OPS), with Accounts.
  - Why it matters: Transfers recorded as sales distort sales, tender and stock.
  - Blocks: The side-by-side test (`PRD-LIF-014`).
  - Sources: [bank-statement](../data-from-kdps/bank-statement/README.md), [store-close-cash-and-bank](store-close-cash-and-bank.md), [transfers](transfers.md).

#### Offers and brand reports

- **Q-44.** What are the missing offer months and dates? Peter England: April, May and after 22 Jun 2026. Louis Philippe: April, anything before 4 Feb, and the source for the year of each start date. Van Heusen: the validity of each row and the latest email. Blackberry: the year of the undated rows. Allen Solly: the "Further communication". The close dates behind the 9 `Not Disclosed Yet.` lines. The Madura offers marked `MADURA PENDING`.
  - Answerer: Brand manager (P-BRM).
  - Why it matters: Offer history and reports have gaps without them.
  - Blocks: Loading offer history for reports; Stage 4 (store day): the offers in force at the first switch.
  - Sources: [ALLEN SOLLY](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/ALLEN%20SOLLY/README.md), [LOUIS PHILLIPE](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/LOUIS%20PHILLIPE/README.md), [PETER ENGLAND](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/PETER%20ENGLAND/README.md), [VAN HEUSEN](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/VAN%20HEUSEN/README.md), [BRAND OFFERS](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/README.md), [offers-and-brand-reports](offers-and-brand-reports.md), [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md).
- **Q-51.** Which date is right for Mufti rows 6 and 7 (start 5 Jun or 5 Jul 2025), and which Mufti date cells show day and month swapped?
  - Answerer: Brand manager (P-BRM).
  - Why it matters: The dates must be confirmed before any import of offer history.
  - Blocks: Stage 4 (store day): history for reports.
  - Sources: [BRAND OFFERS](../data-from-kdps/Q&A-req-recieved/BRAND%20OFFERS/README.md).

#### Data and privacy on the test setup

- **Q-78.** Which fields are masked or left out in the side-by-side test, and may the sales sample (with customer names and phones) be used in the development setup or must it be masked first? Who may see cost columns?
  - Answerer: KDPS Owner; the product owner designs the masking.
  - Why it matters: The sample holds customer names and phones; cost columns are restricted.
  - Blocks: The side-by-side test; Stage 2 (goods-in): imports.
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [data-quality-and-import-rules](data-quality-and-import-rules.md).
  - Already asked: KDPS Owner 37 asks about customer names and phones in the import (partly).

### Accounts (P-ACC)

Questions about the figures in the old money, stock and supplier files. Several are shared with the CA and say so.

#### Cost, tax basis and the books

- **Q-81.** Is `Rate` in the stock files the purchase or landed cost, with or without GST? Does it change with a scheme or margin support? Do sales values and `Net Amount` include GST?
  - Answerer: Accounts and the CA (P-CHA).
  - Why it matters: Opening stock value and the side-by-side checks are wrong if cost or sales are read on the wrong tax basis. The cost rule for new receipts is asked in Q-82 and Q-83.
  - Blocks: The opening-stock load (`PRD-LIF-005`: valuation evidence); the side-by-side margin check.
  - Sources: [Q&A-req-recieved](../data-from-kdps/Q&A-req-recieved/README.md), [store-analysis](../data-from-kdps/store-analysis/README.md), [VAISHNAVI](../data-from-kdps/store-analysis/VAISHNAVI/README.md), [hazaribagh](../data-from-kdps/store-analysis/hazaribagh/README.md), [analyses-and-metrics](analyses-and-metrics.md), [data-quality-and-import-rules](data-quality-and-import-rules.md), [pos-exports](pos-exports.md).
  - Already asked: CA 21 asks whether MRP and price-list prices include GST (partly).

#### Suppliers, debit notes and claims

- **Q-93.** Which balance is true for a party: `SUMMARY`, `INVOICE DETAILS.`, the debit-note workbook or Tally? Which is the source of record for the side-by-side test?
  - Answerer: Accounts and the CA (P-CHA).
  - Why it matters: Opening payables must start from one figure.
  - Blocks: The opening-dues load (`PRD-LIF-009`); Stage 5 (financial control): payables opening data.
  - Sources: [data-from-kdps](../data-from-kdps/README.md), [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
- **Q-96.** Which debit notes and credit-type documents are still open at the switch? The 141 DNs (₹1.74 crore) are not on the tracking sheets and 16 credit-type documents are not on the tracker. Which of them are brand claims?
  - Answerer: Accounts.
  - Why it matters: Open claims are loaded once (`PRD-LIF-009`), and they cannot be reconciled while the tracker is incomplete.
  - Blocks: The opening-claims load; Stage 5 (financial control): claims; inferred.
  - Sources: [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
- **Q-100.** Are the Prem Clothing and Omkar Creation ledgers meant as opening dues for the switch? The Omkar Creation ledger names the Ranchi office: which Store received the goods?
  - Why it matters: Opening dues are loaded once from one confirmed figure (`PRD-LIF-009`).
  - Blocks: The opening-dues load; Stage 5 (financial control): opening dues; inferred.
  - Sources: [vendor-files](../data-from-kdps/05-reference-data/vendor-files/README.md), [purchases-and-supplier-notes](purchases-and-supplier-notes.md).
- **Q-101.** Are the day and month swaps in the debit-note summaries a typing habit, and which date is right? Are the credit-note dates in Oct to Dec 2026 a year typo?
  - Why it matters: Dates drive ageing and period checks.
  - Blocks: Does not block; it sets the import rules.
  - Sources: [data-from-kdps](../data-from-kdps/README.md), [data-quality-and-import-rules](data-quality-and-import-rules.md), [purchases-and-supplier-notes](purchases-and-supplier-notes.md).

#### Tenders, cash and the bank

- **Q-105.** Is UPI recorded inside `Card` or inside `Cash` in the earlier POS? Does `Card` include UPI?
  - Answerer: Accounts, with the Store manager (P-STM).
  - Why it matters: Tender totals mean different things in each case.
  - Blocks: Stage 4 (store day): tenders; the side-by-side test.
  - Sources: [VAISHNAVI](../data-from-kdps/store-analysis/VAISHNAVI/README.md), [store-close-cash-and-bank](store-close-cash-and-bank.md), [data-quality-and-import-rules](data-quality-and-import-rules.md), [pos-exports](pos-exports.md).
- **Q-153.** When `Bill Amount` differs from the sum of the lines in an earlier-POS export, which figure must the side-by-side import trust? What does a zero-tender bill with a value mean?
  - Answerer: Accounts, with the CA (P-CHA).
  - Why it matters: A total that does not reconcile cannot be used as evidence in the side-by-side test.
  - Blocks: The side-by-side test (`PRD-LIF-013`, `PRD-LIF-014`).
  - Sources: [data-quality-and-import-rules](data-quality-and-import-rules.md), [store-close-cash-and-bank](store-close-cash-and-bank.md).
  - Added: split out of Q-104 when the questions were sorted into parts.

#### Brand reports: periods, stock dates and totals

- **Q-115.** Which stock date and source is right for each brand's June `SOH` (Blackberry dated 1 Apr, Mufti equal to May)?
  - Answerer: Accounts and the brand.
  - Why it matters: The files differ, and a brand reads the date as the stock date.
  - Blocks: No stage yet (brand reports are not placed in a stage).
  - Sources: [2026-04](../data-from-kdps/monthly-reports-april-may-2026/2026-04/README.md), [2026-05](../data-from-kdps/monthly-reports-april-may-2026/2026-05/README.md), [2026-05/data](../data-from-kdps/monthly-reports-april-may-2026/2026-05/data/README.md), [monthly-reports-april-may-2026](../data-from-kdps/monthly-reports-april-may-2026/README.md), [brand-analysis-report](../data-from-kdps/brand-analysis-report%20/README.md), [blackberry](../data-from-kdps/brand-analysis-report%20/blackberry/README.md), [mufti](../data-from-kdps/brand-analysis-report%20/mufti/README.md), [offers-and-brand-reports](offers-and-brand-reports.md).

### CA (P-CHA)

A tax question that is needed only to read a sample file.

#### GST and tax documents

- **Q-118.** What are the unlabelled rate columns (`MUFTI.xlsx` `AA` and `AB`, `ZILU BOTTOMS.xlsx` `S` and `U`)? Why does `MUFTI.xlsx` show 12% on an invoice dated 22 Aug 2025 next to the later 5 and 18?
  - Why it matters: A receipt cannot carry tax from a guess.
  - Blocks: Stage 2 (goods-in): tax on receipt.
  - Sources: [PT FILE](../data-from-kdps/Q&A-req-recieved/PT%20FILE/README.md), [pt-file-layouts](pt-file-layouts.md).
  - Already asked: Accounts 5 asks for GST rates and slabs by goods (partly).

### Store manager (P-STM) and Store staff

Questions about what a value or a note means in a Store's own sheet. Each Store answers through the KDPS Owner.

#### Counter, cash and sheets

- **Q-126.** What does the customer value `MANUAL BILL UPDATE` mean?
  - Answerer: Vaishnavi Store, via the KDPS Owner.
  - Why it matters: It appears in the Vaishnavi sales export and may be a special bill kind.
  - Blocks: Stage 4 (store day): imports.
  - Sources: [VAISHNAVI](../data-from-kdps/store-analysis/VAISHNAVI/README.md), [pos-exports](pos-exports.md).
- **Q-127.** What do the two amount columns `N` and `O` in the Dumka sale sheets mean, and why does one line have values in both?
  - Answerer: Dumka Store, via the KDPS Owner.
  - Why it matters: The import cannot read the sheet until the columns are known.
  - Blocks: The side-by-side test.
  - Sources: [2026-04/DATA](../data-from-kdps/monthly-reports-april-may-2026/2026-04/DATA/README.md).
- **Q-128.** What does the note `NOTE: 19 PCS JEANS SHORT` on the VAS-DEO stock sheet mean?
  - Answerer: VAS-DEO Store, via the KDPS Owner.
  - Why it matters: It may be a shortage that is not in the numbers.
  - Blocks: The side-by-side test.
  - Sources: [2026-04/DATA](../data-from-kdps/monthly-reports-april-may-2026/2026-04/DATA/README.md).
- **Q-129.** Who cleaned `Sheet2` of the Vaishnavi stock file, and does the 13,375 against 13,354 total mismatch mean anything?
  - Answerer: Vaishnavi Store, via the KDPS Owner.
  - Why it matters: Stock totals should tie.
  - Blocks: The side-by-side test.
  - Sources: [store-analysis](../data-from-kdps/store-analysis/README.md), [VAISHNAVI](../data-from-kdps/store-analysis/VAISHNAVI/README.md).

### KDPS data providers (Priyo, Debanjan)

Requests to send data or to say what the earlier POS can export, for the side-by-side test and the opening load.

#### Files and formats

- **Q-135.** Can KDPS send the whole Store export instead of a brand cut? Were rows that are filtered out left out on purpose?
  - Answerer: Priyo or Debanjan.
  - Why it matters: Brand cuts hide stock and sales that the ERP must see.
  - Blocks: The side-by-side test.
  - Sources: [data-quality-and-import-rules](data-quality-and-import-rules.md).

#### What the earlier POS can export

- **Q-136.** Can the earlier POS give a one-day sales report and an end-of-day SOH in one fixed layout, on a daily schedule? Who sets the schedule? The files seen cover from one day to one financial year.
  - Answerer: Debanjan.
  - Why it matters: The side-by-side test loads a daily sales report and SOH for checking.
  - Blocks: The side-by-side test (`PRD-LIF-013`).
  - Sources: [pos-exports](pos-exports.md), [analyses-and-metrics](analyses-and-metrics.md).
- **Q-137.** Can the POS export keep the date, bill number and tender on every line? Can it give barcodes as text and unrounded 13-digit (the Allen Solly Store's exports are rounded), dates in a fixed format (which date format and locale do the exporting PCs use?), and CSV with ISO dates?
  - Answerer: Debanjan.
  - Why it matters: Rounded barcodes and shifting date formats break matching.
  - Blocks: The side-by-side test; Stage 2 (goods-in): imports.
  - Sources: [data-quality-and-import-rules](data-quality-and-import-rules.md), [pos-exports](pos-exports.md), [2026-04/DATA](../data-from-kdps/monthly-reports-april-may-2026/2026-04/DATA/README.md), [2026-04](../data-from-kdps/monthly-reports-april-may-2026/2026-04/README.md).
- **Q-138.** Can every Store export follow the JSL movement-statement layout (full stock, zero rows kept, `Season`, `Op Qty`)? What period does `Op Qty` start at, since the movement statements carry no period?
  - Answerer: Debanjan.
  - Why it matters: Stock-outs and ageing need zero rows and a period.
  - Blocks: The side-by-side test (`PRD-LIF-013`).
  - Sources: [hazaribagh](../data-from-kdps/store-analysis/hazaribagh/README.md), [jsl](../data-from-kdps/store-analysis/jsl/README.md), [pos-exports](pos-exports.md), [analyses-and-metrics](analyses-and-metrics.md).
- **Q-139.** Can the earlier POS export an inward date and receipt batch per barcode, cost at sale, time of sale and a link from a return to its original bill? Does it hold any of these?
  - Answerer: Debanjan.
  - Why it matters: None of them is in any export, and each is needed for ageing, margin and returns.
  - Blocks: The side-by-side test (`PRD-LIF-013`).
  - Sources: [pos-exports](pos-exports.md), [analyses-and-metrics](analyses-and-metrics.md), [data-quality-and-import-rules](data-quality-and-import-rules.md).

### Product owner

Questions about how the opening load and the side-by-side test read the old data.

#### Imports and PRD fit

- **Q-147.** Which earlier-POS layouts must Stage 1 support first, and which are only evidence for the design?
  - Why it matters: It sets the size of the first import adapters.
  - Blocks: Stage 1 (shared foundation): imports.
  - Sources: [pos-exports](pos-exports.md).
- **Q-148.** Does a barcode missing from a positive-only stock file mean zero stock when comparing with a count?
  - Why it matters: The switch count compares against the earlier POS's last SOH.
  - Blocks: The side-by-side test; the switch count.
  - Sources: [data-quality-and-import-rules](data-quality-and-import-rules.md).
- **Q-149.** How must the import read amount-only price changes in the earlier-POS exports (`Disc%` 0 with a rupee discount), so that reports never show a rupee discount as no discount?
  - Why it matters: Reports must not show a rupee discount as no discount.
  - Blocks: Does not block.
  - Sources: [data-quality-and-import-rules](data-quality-and-import-rules.md).

## Part C — Dropped

These questions only asked how an old sheet or habit works and have no bearing on a need, a policy value or the data move. Nothing disappears silently: each line says why it was dropped and where the need behind it is covered. Q-numbers are kept so that older references can be traced.

### Questions dropped whole

- **Q-6** — Do the town tags in the bank narrations mean Stores, brand-store staff placements or something else? — dropped because it asks how an old narration habit reads; the need, a complete list of places, is covered by Q-133 (which names the towns in the narrations).
- **Q-8** — Who owns each personal tab of the PT work sheet, and what approval limit does each hold? — dropped because it asks who uses which tab of an old sheet; the need, roles and approval limits from real owners, is covered by Q-67 (limits) and Q-130 (users and roles).
- **Q-10** — Who keeps the ledger workbooks, and how were the `Opening Stock`, `Audit Diff`, `Scan Stock` and `Audit Differance` rows created? — dropped because it asks how old ledger sheets were kept; the need, counts, differences and opening stock, is covered by `PRD-STK-008`, `PRD-STK-010`, `PRD-STK-012` and `PRD-LIF-004`.
- **Q-29** — Is the soft-copy and PT file naming convention official? — dropped because the destination is taken from the goods-in record, not from a file name (`PRD-REC-004`); the need, which Store gets each delivery, is covered by Q-28 (routes) and Q-23 (who fills the file).
- **Q-33** — Which gate-pass numbers (305 to 316) belong to which consignments? — dropped because it only ties old paper to old dispatches; the need, transfer evidence, is covered by Q-134 (a real transfer document set).
- **Q-38** — What is the `Transfer Stock PT File (USPA INNERWEAR)`, and who prepares such a file? — dropped because it asks about one old sheet; the need, price-ticket coverage for transferred pieces, is covered by Q-134 and [transfers](transfers.md).
- **Q-45** — Was `PE MAY.jpeg` meant to be the Peter England May offer? — dropped because it asks how one file was named; the need, the missing Peter England months, is covered by Q-44.
- **Q-54** — What does the stock column `OFFER` mean (`IN OFFER` on 732 stock rows of the Hazaribagh stock file)? — dropped because it asks what one old column holds; the need, which items an offer covers, is covered by Q-42 (the eligibility list) and Q-151 (a list with a flag per style).
- **Q-66** — Why is bill `26-27/JSL/2014` missing from the series, and does the earlier POS keep a cancelled bill? — dropped because it asks about one gap in an old series; the need, a complete audit trail of bills, is covered by `PRD-POS-014`, `PRD-POS-020` and [numbering-and-audit.md](../design/platform/numbering-and-audit.md).
- **Q-68** — Did KDPS ask for and sign the access rights shown in `ERP_DASHBOARD_V1.xlsx`? — dropped because it asks about the history of an earlier draft; the need, signed roles and rights, is covered by Q-130, Q-69 and Q-140 (their answers are what the KDPS Owner signs).
- **Q-71** — Who fills `Sale Person` on each sale line, and is a shared login such as `Admin` allowed at the till? — dropped because it asks about an old habit that the PRD already settles (`PRD-POS-002`: a salesperson on every line, and access by person); the need, incentives from a named salesperson, is covered by Q-75 and Q-130.
- **Q-89** — What are `TEN`, "VENUE" and "DB" in the invoice statuses, and which system produces the `SOFTWARE` sheets of the debit-note workbook? — dropped because it asks how old tracking sheets work; the need, the TEN connector and the open claims, is covered by Q-132 (TEN documents) and Q-96 (open claims at the switch).
- **Q-98** — What are the 1,048 software lines that name KDPS Lifestyle as the party? — dropped because they are lines of an old workbook that is not carried over; the need, never loading an internal movement as a supplier receipt, is covered by Q-30 and Q-96.
- **Q-99** — Who types the 538 file-name-only rows of the invoice tracker, how soon, and is the hidden sheet retired? — dropped because it asks about an old tracker that dies at the switch; the need, which supplier invoices are open, is covered by Q-93 and `PRD-LIF-009`.
- **Q-111** — Why does the `Bank Reconciliation` sheet still hold the Banka Store's 2025 data, and which Store sheets use it for real? — dropped because it asks how an old sheet is used; the need, Store-day bank reconciliation, is covered by `PRD-CSH-001`, Q-106 and Q-113.
- **Q-114** — What period is each brand report meant to cover? — dropped because it asks about old header text; the need, the period a brand report covers, is now asked in Q-57.
- **Q-123** — Do Stores physically count cash each day, where is the count written, and who approves a difference? — dropped because it asks how Stores keep cash today; the need, a denomination count with an approver for differences, is covered by `PRD-CSH-001` and the official KDPS Owner 25 in [questions-for-kdps.md](../questions-for-kdps.md).
- **Q-124** — Why are UPI and card empty for 30 May to 5 Jun in the Singh More daily sales report? — dropped because it asks how one Store completed tender later; the need, tender recorded at the sale (`PRD-POS-005`, `PRD-POS-006`), is covered by the PRD, and the gap is a data limit noted in [data-quality-and-import-rules](data-quality-and-import-rules.md) and Q-105.
- **Q-125** — Why do 8 lines carry a tender above MRP, and what happens to a return line with no refund tender? — dropped because it asks about old line quirks; the need, each tender tied to a bill and a refund, is covered by `PRD-POS-005`, `PRD-POS-006` and `PRD-POS-009`, and the quirks are checked in Q-153.
- **Q-142** — Who wrote the two skills and prepared the store dashboards, the `BRAND REPORT` and the `BILL SUMMARY`, and where are `kdps-start-report`, `audit-xls` and the `Offers` sheet? — dropped because they are analyst artefacts whose rules are analyst assumptions; the need, brand offer and report rules, is covered by Q-60, Q-42 and Q-58.
- **Q-146** — Is the 25 Jul note a second request or the same pages as the earlier Store requirements? — dropped because it asks only how to count one request; the need, what the Store asks mean, is covered by Q-76.

### Parts cut from questions that stay

The rest of each question stays in Part A or Part B under its own number.

- **Q-5 (part)** — whether the series code in an earlier-POS bill number is a device, a Store or a tax registration, and whether a Store holds more than one series today — dropped because it asks how old bill numbers were built; the need is covered by `PRD-POS-020` (an own series per device, registration and year), and the prefixes are read in Q-1.
- **Q-13 (part)** — who adds new `Season` labels, and whether `Oct-26` is the last one — dropped because it asks how an old list is kept; the need is covered by Q-12 (who approves a new master value).
- **Q-15 (part)** — why `Sub Category` prints on the first line of a bill only, and whether it is a POS setting — dropped because it asks about an old print setting; the need, a category tree, is covered by the rest of Q-15.
- **Q-32 (part)** — who keeps the hand tallies, and how a Store learns that a delivery is coming — dropped because it asks about today's habits; the need, a count at receipt and a view of what is coming, is covered by the Receive Goods inbox (`PRD-REC-001`) and Q-134.
- **Q-34 (part)** — why the warehouse ledger shows about 10 `S-` documents a day in FY 25-26 against about 4 a day from Oct 2024 to Mar 2025 — dropped because it asks about old volume and nothing is carried over; the need is covered by the rest of Q-34.
- **Q-35 (part)** — the rule for recording stock sent out of a Store (value, tender), and whether the `S-` bill series is the intended transfer document — dropped because the new transfer is its own document; the need, the value at which a transfer is shown, is covered by Q-134 and Q-36.
- **Q-42 (part)** — whether the `Offer` column of `KDPS LIFE.xlsx` is the brand's AMM list for Blackberry — dropped because it asks what one old column holds; the need, one owned eligibility list, is covered by the rest of Q-42 and Q-151.
- **Q-48 (part)** — why some suit and promo-bag lines carry typed discounts, and where the Louis Philippe rates and dates come from — dropped because they ask about an old habit and its source; the needs are covered by Q-49 (discounts with no offer behind them) and Q-43 (the authoritative source).
- **Q-61 (part)** — why carry bags are billed at ₹7 with a 100% discount and trolleys at zero tender — dropped because it asks about an old billing habit; the need, how gifts and carry bags are received, valued and sold, is covered by the rest of Q-61 and Q-145.
- **Q-64 (part)** — who asked for the "16 measures" and who approved the list — dropped because it asks about the history of an analyst list; the need, the measures KDPS wants, is covered by the rest of Q-64 and Q-62.
- **Q-65 (part)** — how the ₹78 L winter budget, its range and its split were reached — dropped because it is analyst working, not a KDPS decision; the need, a basis for the budget, is covered by the rest of Q-65.
- **Q-79 (part)** — the real phone-capture rate — dropped because it measures old practice; the need, consent to use phone numbers, is covered by the rest of Q-79 and `PRD-POS-012`.
- **Q-83 (part)** — why the `P RATE` multiplier is 1.2 in some work sheets and 1.1 in others — dropped because it asks why old tabs differ; the need, a signed costing profile per brand, is covered by the rest of Q-83, Q-82 and `POL-03.06`.
- **Q-86 (part)** — who set the Store running costs in the earlier analyses, and whether they were approved — dropped because they are analyst figures; the need, which costs are charged to a Store and at what value, is covered by the rest of Q-86.
- **Q-94 (part)** — why the cash discount is deducted on only some payment rows — dropped because it asks about old payment-row habits; the need, the cash-discount rule, is covered by the rest of Q-94.
- **Q-96 (part)** — whether the debit-note series is one per warehouse per financial year — dropped because numbering is designed, not copied; the need is covered by [numbering-and-audit.md](../design/platform/numbering-and-audit.md).
- **Q-100 (part)** — why the Prem Clothing and Omkar Creation ledgers were sent, and how supplier statements are used today — dropped because it asks about a habit; the need, opening dues, is covered by the rest of Q-100 and Q-93.
- **Q-103 (part)** — where the payment reference is kept — dropped because it asks about an old habit; the need, the paying accounts for bank matching, is covered by the rest of Q-103 and Q-113.
- **Q-106 (part)** — how a Store learns its share of the UPI settlement — dropped because it asks about an old habit; the need, per-Store settlement amounts, is covered by the rest of Q-106 and `PRD-CSH-001`.
- **Q-109 (part)** — what the column `Ac No. / Person` records — dropped because it asks what one old column holds; the need, who receives cash and how receipt is confirmed, is covered by the rest of Q-109.
- **Q-118 (part)** — which GST rate applies when a file gives none — dropped because a rate is never taken from a guess (`PRD-IMP-009`); the need, the right rate by classification and value, is covered by Q-117.
- **Q-140 (part)** — who made the grid in `ERP_DASHBOARD_V1.xlsx`, and whether it is only a proposal — dropped because it asks about the history of a draft; the need, signed roles, is covered by the rest of Q-140, Q-69 and Q-130.

### Parts moved to another question

- **Q-9 (part)** — whether single-brand Stores bill on KDPS's POS or on the brand's own software (the PRD's EBO) — moved to Q-152 (Part A).
- **Q-96 (part)** — whether a monthly brand extract (Madura) is a purchase document, a check or both — moved to Q-22 (Part A).
- **Q-104 (part)** — which figure is right when `Bill Amount` differs from the sum of the lines, and what a zero-tender bill with a value means — moved to Q-153 (Part B).
- **Q-115 (part)** — whether a report's `SOH` date is the first of the reporting month (opening) or of the next month (closing) — moved to Q-58 (Part A).

## Files KDPS still has to send

These files are missing from the data, or the data names them but does not hold them. The first column says what to ask for; the last points to the question above. The fourth column marks the items needed only for the data move (the opening load or the side-by-side test); the others are needed for design or for live use too.

| File or list | Who is asked | Why we need it | Needed only for the data move? | Question |
| --- | --- | --- | --- | --- |
| The complete list of software users and privileges (MOM item 13); the sheet `USERS` is empty | Priyo | Roles and role assignments | No | Q-130 |
| The brand margin file (MOM item 2, marked DONE, not in the folder) | Priyo | Brand terms and costing | No | Q-131 |
| The warehouse-to-Store transfer format (MOM item 7): a real transfer document, packing list and challan for one delivery, with a written note of who prepares what | Debanjan | Transfer design | No | Q-134 |
| The TEN software API documents (MOM item 8) and the bank API documents (item 9) | Priyo | Tally and bank connectors | No | Q-132 |
| The complete list of places with code, town, format, opening date, legal entity and tax registration | Priyo | Store and Site master | No | Q-133 |
| The style-code lists the offers point to: Allen Solly AMM and NOD lists, Peter England's attachment, Van Heusen's AMM list, Libas' `ACCORDING SHEET`, Blackberry's AMM list for suits, blazers and waistcoats. Only the Louis Philippe list `16_AMM List dtd 20.01.26.xlsb` (dated 20 Jan 2026) is in the folder | Brand manager (P-BRM) | Offer eligibility | No: the offers in force at the first switch are loaded from them, and the lists keep arriving | Q-42, Q-44 |
| The missing offer months: Peter England April, May and after 22 Jun 2026; Louis Philippe April and before 4 Feb; the latest Van Heusen email; the Madura offers marked `MADURA PENDING`; the artwork of the U. S. Polo SS'26 trolley offer, which reads `ARTWORK NOT RECEIVED` | Brand manager (P-BRM) | Offer history and the offer engine | Yes for the history; no for the latest offers | Q-44 |
| The two outside workbooks of the Flying Machine template (`FM APPAREL A4.xlsx`, `1. ARVIND ALL BRAND AW'25 EOSS OFFER.xlsx`) | KDPS Owner or the product owner | Which offer regime applies when | No | Q-60 |
| The brand report layout each brand wants (Peter England, Allen Solly, Van Heusen, Banjaran) | Brand manager (P-BRM) | Brand report design | No | Q-59 |
| The full bank statement: 15 Apr to 31 May 2026, in the bank's own export format, with the other accounts and the balance | Accounts (P-ACC) | Bank matching and day-close design | No | Q-113 |
| The unrounded 13-digit barcodes and exports that keep date, bill number and tender on every line | Debanjan | Side-by-side imports | Yes | Q-137 |
| The whole Store export in place of a brand cut | Priyo or Debanjan | Side-by-side imports | Yes | Q-135 |
| The movement-statement layout for every Store, with zero rows, `Season` and `Op Qty` | Debanjan | Stock-outs and ageing | Yes | Q-138 |
| Mufti's real June stock list, Blackberry's June stock list with its true date, Bokaro's own stock list and Sanskar's stock list | Accounts (P-ACC) and the KDPS Owner | Brand reports and imports | Yes | Q-115, Q-11 |
| October-to-February actuals from earlier years, for the winter buying budget | KDPS Owner, with Booking | Planning and booking | No | Q-65 |

The `Offers` sheet that the report skill expects was an input of an analyst skill; it is no longer asked for (Q-142 is in Part C).

The raw files also hold links to Google Drive files that are not in the folder: invoice soft copies, PT Excel sheets and offer artwork ([data-from-kdps](../data-from-kdps/README.md)). No README asks for them; they are noted here so that the ERP team knows the folder does not hold them.

The official list already asks for other samples (a real stock valuation sample, real Tally vouchers, one real messy delivery); they are not repeated here.
