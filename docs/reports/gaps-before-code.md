# Gaps before writing code — refreshed 4 Oct 2026

> **Not ranked.** This report decides nothing and changes nothing. Any PRD or policy change it leads to needs an entry in [decisions.md](../decisions.md) first. See [README.md](../README.md).

**What was checked.** What stage 1 needs, from [phases.md](../phases.md) stage 1 ("In scope" and "Exit checks") and the "Planned architecture" in `AGENTS.md`, against the documents that exist today in [design/](../design/).

**Why it matters.** Where no design exists, code follows the PRD and the KDPS policies directly and notes the missing design ([README.md](../README.md)). Code could start today, but every gap below would then be settled inside the code, where nobody reviews it.

## 1. Short version

1. **Six of nine stage 1 designs are written** (GC-1 to GC-5 and GC-7; section 2). GC-6, GC-8 and GC-9 are still missing.
2. The **pnpm and Turborepo workspace exists** (server, web, domain, schemas, UI). **`packages/calculations` is not created yet**; several **code house rules** are still partial (section 3).
3. **Two small decisions** wait for the product owner (section 4). Other product-owner items do not block code (section 6).
4. **UI sample values** are now labelled or removed (section 5).
5. The open KDPS, Accounts and CA values **do not block coding**: code is built and tested with labelled synthetic data (section 6).

## 2. Stage 1 designs (GC-1 … GC-9)

| # | Design | Status | Document |
| --- | --- | --- | --- |
| GC-1 | Module map | Written | [module-map.md](../design/architecture/module-map.md) |
| GC-2 | Business structure and masters | Written | [structure-and-masters.md](../design/masters/structure-and-masters.md) |
| GC-3 | Access, approvals, inbox and exceptions | Written | [access-and-approvals.md](../design/access/access-and-approvals.md) |
| GC-4 | Books and posting | Written | [books-and-posting.md](../design/finance/books-and-posting.md) |
| GC-5 | Document numbering and audit history | Written | [numbering-and-audit.md](../design/platform/numbering-and-audit.md) |
| GC-6 | Imports and opening data | **Missing** | — |
| GC-7 | Shared price, discount, tax and rounding logic | Written | [shared-calculations.md](../design/calculations/shared-calculations.md) |
| GC-8 | Offline counter | **Missing** | — |
| GC-9 | Backup, restore and export | **Missing** | — |

The table below is the original scope list (unchanged). Use it for sources and what each design must cover.

| # | Design | What it covers | Source | Needed for |
| --- | --- | --- | --- | --- |
| GC-1 | Module map | Which modules exist, which tables each owns, their public interfaces and read models | `PRD-MOD-002`–`PRD-MOD-005`; `AGENTS.md` "Planned architecture" | Every other design and all code. Write it first |
| GC-2 | Business structure and masters | Organisation, legal entities, tax registrations, books, Sites, Stores, business units, locations and their mappings; brands, suppliers and other parties; SKUs, size grids, barcodes, units and packs, tracking profiles, product proposals; effective-dated commercial terms; inbound ownership records (not stock) | `PRD-ORG-001`–`PRD-ORG-019`, `PRD-MER-001`–`PRD-MER-018`; policies 1 and 4 | Every record. Stage 1 exit check: one Site with units in different books keeps correct mappings (`PRD-ACP-013`) |
| GC-3 | Access, approvals, inbox and exceptions | Roles, scoped role assignments, field permissions, approval limits and value basis, independent approval, bulk approval, stand-ins, one inbox, the exception record, login with TOTP, sessions, row-level security, service identities (non-human actors with their own audit identity and least-privilege access), partner users on their authorised Stores. [personas.md](../design/access/personas.md) covers personas only | `PRD-ACS-001`–`PRD-ACS-019`, `PRD-EXC-001`–`PRD-EXC-003`, `PRD-SEC-001`, `PRD-SEC-005`, `PRD-SEC-017`, `PRD-SEC-018`, `PRD-FRN-007`; policy 2 | Every action. Stage 1 exit check: an operation whose policy is not configured stays unavailable |
| GC-4 | Books and posting | Chart of accounts, books, financial periods, balanced journals, posting maps, the hand-off from valued stock movements | `PRD-LED-001`–`PRD-LED-004`, `PRD-LED-009`, `PRD-MOD-013`; policy 9 | The posting half of the stage 1 golden scenarios ([stock-ledger.md](../design/stock/stock-ledger.md) section 11) |
| GC-5 | Document numbering and audit history | Number series (per device, registration and financial year for bills), business codes, the audit record | `PRD-MOD-004`, `PRD-MOD-008`, `PRD-POS-020`, `PRD-OFF-002`, `PRD-ACS-013`, `PRD-SEC-007` | Every transaction |
| GC-6 | Imports and opening data | File intake, saved versioned mappings, staging, review, publishing, duplicate control; opening-data layouts for stock, dues, advances and deposits | `PRD-IMP-001`–`PRD-IMP-013`, `PRD-LIF-003`–`PRD-LIF-011`; `POL-14.07` | PT files (stage 2) and opening data, built and tested with sample data in stage 1 |
| GC-7 | Shared price, discount, tax and rounding logic | One shared package used by server and counter, with its golden cases | `PRD-MOD-007`, `PRD-MOD-014`–`PRD-MOD-016`, `PRD-POS-004` | Stage 1 exit check: shared golden cases pass on server and counter code |
| GC-8 | Offline counter | Device registration, device bill series, the cached working set, the local commit, upload, pause and release | `PRD-OFF-001`–`PRD-OFF-019`; `AGENTS.md` "Delivery" | Designed in stage 1, switched on in stage 4 under policy 16 |
| GC-9 | Backup, restore and export | What is backed up, how a restore is proved, and the complete export. [deployment.md](../design/platform/deployment.md) covers test hosting only | `PRD-SEC-012`, `PRD-LIF-022`; policy 18 | Stage 1 exit check: a backup restores with linked records and attachments |

**Suggested order for what remains.** GC-6 next (imports and opening data; KDPS sample files can inform layouts). Then GC-8 and GC-9. Implement `packages/calculations` from GC-7 in parallel with module work.

## 3. Code workspace and house rules

- **Workspace.** The pnpm and Turborepo workspace exists: `apps/server`, `apps/web`, `packages/domain`, `packages/schemas`, `packages/ui`, and `tools/module-check`. Commands are in `AGENTS.md` ("Code workspace").
- **House rules for code**, partly started (module check, `@Inject`, Turbo pipeline) but not complete:
  - coding style and folder layout per package;
  - API conventions: REST/JSON, shared Zod schemas, generated OpenAPI, error shape, the idempotency key on every write (`PRD-INT-002`);
  - database migrations: reviewed SQL, and the migration and runtime roles in [deployment.md](../design/platform/deployment.md) section 4;
  - test plan: Vitest, Playwright, Testcontainers with real PostgreSQL, and which checks must pass (`PRD-SEC-016`);
  - the automatic checks that run on every change.

## 4. Decisions for the product owner

This section lists only the decisions that hold up code or its division. The other product-owner items are in section 6 and in [deployment.md](../design/platform/deployment.md) section 10.

| # | Decision | Source | Needed by |
| --- | --- | --- | --- |
| GC-10 | File storage provider for the test setup. A Railway bucket is one S3-compatible option; DEC-028 does not cover file storage | [deployment.md](../design/platform/deployment.md) D-2 | Stage 1 build |
| GC-11 | Who builds, and how many people or agents | [phases.md](../phases.md): "Dates depend on team size, which is not yet set" | Task division |

## 5. Sample values in the UI files

These do not block code, but a builder could copy them as real values. Fix them, or label them as examples, at the next design edit.

- Fixed: the bill number `B01C1/2627/04381` in [design-language.md](../design/ui/design-language.md) §8 and `design-system.html` is labelled a synthetic layout. The format is still OPEN (V-40, `POL-10.07`). Alignment report E-1.
- Fixed: `design-system.html` no longer shows "Day close due 21:30" or "Shift 10:00–19:00", and the page labels its sample values as synthetic. Alignment report E-3.

## 6. Not gaps for coding

- **Open KDPS, Accounts and CA values** ([alignment-report.md](alignment-report.md) section 5, [questions-for-kdps.md](../questions-for-kdps.md)). They are needed before live use, not before building. Until then, code uses labelled synthetic data, which never becomes a default.
- **Production hosting** ([deployment.md](../design/platform/deployment.md) D-1). It is needed before the first Store switch.
- **Other product-owner items** that do not block code: the custom domain or Railway address (D-3), the rollout order on production (stock-ledger SL-9), returns with no sale in the app (SL-10) and the chunked-posting fallback (SL-11, only if a performance test fails). Their owners and stages are in [deployment.md](../design/platform/deployment.md) section 10, [stock-ledger.md](../design/stock/stock-ledger.md) section 12 and [alignment-report.md](alignment-report.md) section 1.
- **Stock-ledger open questions** ([stock-ledger.md](../design/stock/stock-ledger.md) section 12). SL-22 and SL-23 block stage 1: they belong to the financial posting design (GC-4). The rest do not block the stage 1 build. The golden scenarios avoid any amount that needs the open rounding rule (SL-2).
