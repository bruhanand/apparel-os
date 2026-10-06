# S1-F03-T03 — Parties, agreements and bank details

Status: blocked
Blocked by: S1-F03-T01, S1-F06-T05 (stored files, for the signed agreement)
Feature: [S1-F03 Product and party masters](../../spec.md)

## Build

The parties part of `merchandise` ([structure-and-masters.md](../../../../design/masters/structure-and-masters.md) 5), every record under 2.2 and house rules 7.3.

- **Parties** (5.1; `PRD-MER-001`): one party per legal person; versioned legal name, tax identity numbers kept as text, MSME classification (verified against evidence before any payment control uses it, `POL-10.09`) and contacts; dated roles of supplier, agent, ordering party, invoicing party and goods mover, each maintained on its own. Brands stay apart from parties.
- **Brand–supplier links** (`DEC-112`, RR-047 gap 3): effective-dated and many-to-many. No exclusive supplier is inferred; each booking names its actual supplier (stage 2).
- **Agreements** (5.2, 5.3; `PRD-ORG-016`, `POL-01.01` to `POL-01.11`, `POL-01.14`): code unique in the Organisation; effective-dated versions with a brand or a supplier holding commercial model, default model, ownership-transfer event, return rights, return conditions and money terms, each a value or Unknown, none defaulted (`POL-01.11`). A version takes effect only when a different authorised person approves it (2.3, GC2-2). Margins are a restricted field (`PRD-ACS-008`). Read the terms in force on a date, with the version identifier (5.5). Emits `merchandise.agreement-changed`.
- **The signed agreement** (5.2; `PRD-ORG-016`): attached to the agreement version as evidence, a stored file through S1-F06-T05, carrying the restricted classes `merchandise` declares for that kind of evidence (margins are restricted, `PRD-ACS-008`); it opens from the agreement for an authorised reader.
- **Supplier cash-discount and interest terms** (`DEC-112`, RR-047 gap 4): structured terms on the agreement version, shaped as the RR-047 edit of 5.2 says, each a value or Unknown. Nothing here calculates, applies or posts them.
- **Bank details** (5.1; `PRD-ACS-008`, `PRD-SEC-006`): a restricted field class, encrypted in the application with the Organisation's key before PostgreSQL ([access-and-approvals.md](../../../../design/access/access-and-approvals.md) 6). Without the field grant on the assignment that grants the action, screens mask them and exports, read models, live updates, logs and audit records leave them out. Showing them unmasked asks for a fresh authenticator code, writes an access record, and is never repeated on a replay (`PRD-SEC-001`, `PRD-SEC-007`, `DEC-114`; house rules 12.4, 12.6). A change is a new version that takes effect only when a different authorised person approves it, for a supplier (`POL-02.07`) and for every other party (GC2-6), deciding with a fresh code. Read a party returns them only to a permitted reader (5.5).
- **Screens** (structure-and-masters 8): Setup › Suppliers and agreements (brands, suppliers, agents, ordering and invoicing parties, dated terms) and Setup › Agreement (commercial model, ownership event, return rights, payment terms). The costing profile shown on the Agreement screen belongs to `merchandise` · PT (stage 2).

## Expected outputs

Parties, links and agreements in `merchandise` with their migration; the bank-details and margin field classes; the two screens; tests

## Done when

- structure-and-masters 9 tests 12, 13 and 21 pass, and the agreement clause of test 16 (an agreement version approved by its preparer is refused)
- A synthetic signed agreement attached to an agreement version opens from it for an authorised reader and matches its hash; a reader without the agreement, or without a class it carries, is refused
- access-and-approvals 15 test 23 passes for bank details: no bank value in any log or live update, and no encrypted value in any audit record
- An unmasked showing asks for a fresh code and writes an access record, and its identical replay is refused (`DEC-114`); a reader without the field grant sees bank details and margins masked
- Browser journey: a user prepares a supplier's bank-detail change; a different user approves it from My work with a fresh code; the details show masked until unmasked with a fresh code; the preparer's own approval is refused, with its reason on screen

## Notes

- The signed agreement is a real stored file from the start: S1-F06-T05 is built right after S1-F01, and this ticket attaches it (product owner, 6 Oct 2026, DEC-116).
- Test 16 is listed under S1-F02 in the stage [README](../../README.md) section 5, but its agreement clause can only pass here.
- Module-map section 8 names no event for parties or brand–supplier links yet; add them there before this code emits any.
- Values stay OPEN: each brand's model and terms (V-14, RR-077), the supplier cash-discount and interest term values (RR-235), each supplier's MSME classification (V-61), and who approves bank-detail and agreement changes (V-01, RR-064). Tests use labelled synthetic terms and roles.
