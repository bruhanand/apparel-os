# AGENTS.md

This file guides AI coding agents working in this repository.

## Current state

Apparel OS is a retail ERP for apparel, footwear and packaged-goods businesses. The first customer is KDPS Lifestyle Pvt. Ltd. (KDPS).

The repository holds documents only. There is no code, package manifest, build, lint or test command yet. Do not invent commands; add them here once the workspace exists.

The planned toolchain, from the PRD's "Technical platform" section, is pnpm workspaces with Turborepo, strict TypeScript, Vitest, Playwright, Testcontainers with real PostgreSQL, ESLint and Prettier.

## Document order

`docs/README.md` is binding. When two documents disagree, the higher one wins:

1. `docs/prd.md`: what the product does. Source of truth for requirements and vocabulary.
2. `docs/kdps-policies.md`: what KDPS decided, within the options the PRD allows.
3. `docs/design/`: how the system implements both. Never contradicts the two above.
4. Code: implements the design.

`docs/phases.md` sets delivery order only; the PRD and policies win over it.

- Fix the lower document to match the higher one. Never edit a higher document just to fit a lower one.
- A business decision is never settled in design or code. Raise it against the PRD or the policies.
- Use words exactly as the PRD's "Words used" tables define them, in docs and code. Add a new term there first.
- When documents clash, report the clash instead of guessing.

## Working on the documents

- The PRD and policy text belong to the user. Propose edits and wait for approval unless the user asks for the change directly.
- Do not delete or reword existing PRD rules as a side effect of another edit.
- PRD style: short imperative bullets, British spelling (Organisation, colour), capitalised defined nouns (Site, Store, Organisation).
- People are described by the PRD's 14 personas, each with an ID (P-OWN … P-AUD). A person can hold several; a persona grants no access, only role assignments do. Details and the earlier-code crosswalk: `docs/design/access/personas.md`.
- UI design lives in `docs/design/ui/`: `design-language.md` (tokens, states, components), `ui-blueprint.html` (screens, menus by persona), `design-system.html` (the live visual version of the design language) and `design-system-preview.html` (visual examples only). Each names the PRD sections and KDPS policies it implements.
- `ui-blueprint.html` renders only with `support.js` beside it and an internet connection (it loads React from unpkg). Its content lives in the `<script data-dc-script>` block at the end of the file.
- `design-system.html` is a self-contained bundle that opens offline. Its page is one JSON string in `<script type="__bundler/template">`: unpack it with `json.loads`, edit, and repack with `json.dumps(page, ensure_ascii=False).replace('</', '<\\u002F')`. Leave the manifest (fonts, React, runtime) alone.
- The UI was first drawn for RetailsOps, an earlier version of this product in another repo. Its codes (G-, OQ-, R-, BP-) and decisions are not requirements; anything still wanted belongs in the PRD or the policies.

## Delivery

Build in the six stages of `docs/phases.md`: shared foundation, goods-in, stock movement, store day, financial control, people and planning. Design, development and synthetic-data testing may proceed before KDPS policy signatures. Enable each policy-dependent live operation only after the required policy is signed and its real values, authorities and evidence are configured and validated. Each live operational stage records its stock and money effects from its first enabled operation. Design offline billing in stage 1; enable it only under the signed Offline operation policy. Screens are English first; the Hindi interface and WhatsApp and SMS messaging arrive in stage 5.

During the test run, the existing POS keeps selling. Its daily sales report and stock-on-hand (SOH) are imported, and Stores switch over one at a time at a day close.

## Planned architecture

These come from the PRD's "Technical platform" section and apply to all future code.

- **Shape.** A NestJS modular monolith, a React web app, a counter PWA with IndexedDB, and a separate Python forecasting service. Python is the only language besides TypeScript.
- **Tenancy.** One PostgreSQL database per customer Organisation.
- **Modules.** Each module owns its tables and exposes a public interface. Other modules never read its tables directly. Reports read declared read models.
- **Transactions.** Synchronous economic effects run through module interfaces in one transaction. Durable follow-up goes through a PostgreSQL outbox processed by pg-boss.
- **Shared calculations.** Pricing, tax, discount allocation, rounding and incentive logic is written once in shared TypeScript and used by both server and counter.
- **Records are append-only.** Approved documents and posted stock and accounting entries are never updated or deleted. Corrections are linked reversals. Stock balances are derived from movements.
- **Money.** INR is stored as integer paise. No binary floating point for money. Unknown values stay distinct from zero.
- **Integrity.** Every write carries a scoped idempotency key. Locks are taken in a deterministic order, and authority, version, state and quantity are rechecked under the lock.
- **External systems.** Tally, GST, bank and messaging outcomes are tracked as pending, unknown, failed or succeeded, outside the local transaction. Retry only after reconciliation.

## Domain rules that cut across modules

- Only a physical count creates stock. Invoice, booking or price ticket (PT) quantities never do.
- A piece is sellable only with official PT coverage, barcode verification and physical acceptance at its selling Site, and no conflicting hold.
- Keep separate: physical custody, PT coverage, availability, ownership and accounting recognition.
- Independent approval means a different authorised person from the preparer. Approval binds to the exact document version.
- Nothing is on by default. A policy-dependent operation stays unavailable until its policy is configured.
- AI output is always a reviewable draft and never posts stock, money or tax.
