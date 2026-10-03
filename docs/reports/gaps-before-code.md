# Gaps before writing code — 3 Oct 2026

> **Not ranked.** This report decides nothing and changes nothing. Any PRD or policy change it leads to needs an entry in [decisions.md](../decisions.md) first. See [README.md](../README.md).

**What was checked.** What stage 1 needs, from [phases.md](../phases.md) stage 1 ("In scope" and "Exit checks") and the "Planned architecture" in `AGENTS.md`, against the documents that exist today in [design/](../design/).

**Why it matters.** Where no design exists, code follows the PRD and the KDPS policies directly and notes the missing design ([README.md](../README.md)). Code could start today, but every gap below would then be settled inside the code, where nobody reviews it.

## 1. Short version

1. Four designs exist: personas, test hosting, the stock ledger and the user interface. **Nine stage 1 designs are missing** (section 2).
2. **There is no code workspace yet**, and no house rules for code (section 3).
3. **Two small decisions** wait for the product owner (section 4). Other product-owner items do not block code (section 6).
4. **Two UI files** still show sample values without an example label (section 5).
5. The open KDPS, Accounts and CA values **do not block coding**: code is built and tested with labelled synthetic data (section 6).

## 2. Missing stage 1 designs

| # | Design | What it covers | Source | Needed for |
| --- | --- | --- | --- | --- |
| GC-1 | Module map | Which modules exist, which tables each owns, their public interfaces and read models | `PRD-MOD-002`–`PRD-MOD-005`; `AGENTS.md` "Planned architecture" | Every other design and all code. Write it first |
| GC-2 | Business structure and masters | Organisation, legal entities, tax registrations, books, Sites, Stores, business units, locations and their mappings; brands, suppliers and other parties; SKUs, size grids, barcodes, units and packs, tracking profiles, product proposals; effective-dated commercial terms; inbound ownership records (not stock) | `PRD-ORG-001`–`PRD-ORG-019`, `PRD-MER-001`–`PRD-MER-017`; policies 1 and 4 | Every record. Stage 1 exit check: one Site with units in different books keeps correct mappings (`PRD-ACP-013`) |
| GC-3 | Access, approvals, inbox and exceptions | Roles, scoped role assignments, field permissions, approval limits and value basis, independent approval, bulk approval, stand-ins, one inbox, the exception record, login with TOTP, sessions, row-level security. [personas.md](../design/access/personas.md) covers personas only | `PRD-ACS-001`–`PRD-ACS-019`, `PRD-EXC-001`–`PRD-EXC-003`, `PRD-SEC-001`, `PRD-SEC-005`, `PRD-SEC-017`; policy 2 | Every action. Stage 1 exit check: an operation whose policy is not configured stays unavailable |
| GC-4 | Books and posting | Chart of accounts, books, financial periods, balanced journals, posting maps, the hand-off from valued stock movements | `PRD-LED-001`–`PRD-LED-004`, `PRD-LED-009`, `PRD-MOD-013`; policy 9 | The posting half of the stage 1 golden scenarios ([stock-ledger.md](../design/stock/stock-ledger.md) section 11) |
| GC-5 | Document numbering and audit history | Number series (per device, registration and financial year for bills), business codes, the audit record | `PRD-MOD-004`, `PRD-MOD-008`, `PRD-POS-020`, `PRD-OFF-002`, `PRD-ACS-013`, `PRD-SEC-007` | Every transaction |
| GC-6 | Imports and opening data | File intake, saved versioned mappings, staging, review, publishing, duplicate control; opening-data layouts for stock, dues, advances and deposits | `PRD-IMP-001`–`PRD-IMP-013`, `PRD-LIF-003`–`PRD-LIF-011`; `POL-14.07` | PT files (stage 2) and opening data, built and tested with sample data in stage 1 |
| GC-7 | Shared price, discount, tax and rounding logic | One shared package used by server and counter, with its golden cases | `PRD-MOD-007`, `PRD-MOD-014`–`PRD-MOD-016`, `PRD-POS-004` | Stage 1 exit check: shared golden cases pass on server and counter code |
| GC-8 | Offline counter | Device registration, device bill series, the cached working set, the local commit, upload, pause and release | `PRD-OFF-001`–`PRD-OFF-019`; `AGENTS.md` "Delivery" | Designed in stage 1, switched on in stage 4 under policy 16 |
| GC-9 | Backup, restore and export | What is backed up, how a restore is proved, and the complete export. [deployment.md](../design/platform/deployment.md) covers test hosting only | `PRD-SEC-012`, `PRD-LIF-022`; policy 18 | Stage 1 exit check: a backup restores with linked records and attachments |

**Suggested order.** GC-1 first. Then GC-2, GC-3 and GC-5, which everything else uses. GC-4 and GC-7 before the golden scenarios. GC-6, GC-8 and GC-9 can follow.

## 3. No code workspace

- **Workspace.** The pnpm and Turborepo workspace (server, web, shared domain, schemas and UI packages) does not exist. `AGENTS.md` says to add build, lint and test commands only once it does.
- **House rules for code**, not written anywhere yet:
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

- The bill number `B01C1/2627/04381` is shown as the format in [design-language.md](../design/ui/design-language.md) §8 and in `design-system.html`. The format is still OPEN (V-40, `POL-10.07`). Alignment report E-1.
- `design-system.html` shows "Day close due 21:30" and "Shift 10:00–19:00" with no example label. Alignment report E-3.

## 6. Not gaps for coding

- **Open KDPS, Accounts and CA values** ([alignment-report.md](alignment-report.md) section 5, [questions-for-kdps.md](../questions-for-kdps.md)). They are needed before live use, not before building. Until then, code uses labelled synthetic data, which never becomes a default.
- **Production hosting** ([deployment.md](../design/platform/deployment.md) D-1). It is needed before the first Store switch.
- **Other product-owner items** that do not block code: the custom domain or Railway address (D-3), the rollout order on production (stock-ledger SL-9), returns with no sale in the app (SL-10) and the chunked-posting fallback (SL-11, only if a performance test fails). Their owners and stages are in [deployment.md](../design/platform/deployment.md) section 10, [stock-ledger.md](../design/stock/stock-ledger.md) section 12 and [alignment-report.md](alignment-report.md) section 1.
- **Stock-ledger open questions** ([stock-ledger.md](../design/stock/stock-ledger.md) section 12). None blocks the stage 1 build. The golden scenarios avoid any amount that needs the open rounding rule (SL-2).
