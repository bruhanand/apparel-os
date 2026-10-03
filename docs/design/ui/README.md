# UI design documents

**Rank 3 of 4: design.** These files describe presentation and screen behaviour only. The [PRD](../../prd.md) is authoritative for product requirements and vocabulary; the [KDPS policy answers](../../kdps-policies.md) are authoritative for customer-specific choices within the PRD. The [delivery stages](../../phases.md) set order only.

**PRD sections implemented:** Product; Organisation, sites and ownership; People, access and approvals; Merchandise and identifiers; Source conversion and imports; Booking and buying; Receiving and price tickets; Stock and warehouse control; Transfers and physical movement; Damage, quarantine and disposal; Counter sales and payments; Customer returns, exchanges and credit; EBO sales and external billing; Offers, prices and supplier returns; Finance and accounting; Franchise and partner accounts; HRMS and payroll; Exceptions, reports and planning; Opening, closure, migration and export; Operator experience; Offline counter; AI, security and operational reliability; Performance.

**PRD IDs implemented** (every ID in each range): `PRD-PRO-001`–`PRD-PRO-010`, `PRD-STG-001`–`PRD-STG-002`, `PRD-ORG-001`–`PRD-ORG-021`, `PRD-ACS-001`–`PRD-ACS-022` (`PRD-ACS-023` is a setup step with no screen, [access-and-approvals.md](../access/access-and-approvals.md) 9.11), `PRD-MER-001`–`PRD-MER-018`, `PRD-IMP-001`–`PRD-IMP-013`, `PRD-BKG-001`–`PRD-BKG-013`, `PRD-REC-001`–`PRD-REC-022`, `PRD-PTW-001`–`PRD-PTW-013`, `PRD-STK-001`–`PRD-STK-017`, `PRD-TRF-001`–`PRD-TRF-026`, `PRD-DMG-001`–`PRD-DMG-017`, `PRD-POS-001`–`PRD-POS-022`, `PRD-RET-001`–`PRD-RET-023`, `PRD-EBO-001`–`PRD-EBO-011`, `PRD-OFR-001`–`PRD-OFR-020`, `PRD-LED-001`–`PRD-LED-018`, `PRD-CSH-001`–`PRD-CSH-011`, `PRD-PAY-001`–`PRD-PAY-014`, `PRD-TAX-001`–`PRD-TAX-009`, `PRD-NAV-001`–`PRD-NAV-017`, `PRD-FRN-001`–`PRD-FRN-007`, `PRD-HRM-001`–`PRD-HRM-019`, `PRD-EXC-001`–`PRD-EXC-021`, `PRD-LIF-001`–`PRD-LIF-029`, `PRD-UXP-001`–`PRD-UXP-010`, `PRD-OFF-001`–`PRD-OFF-019`, `PRD-SEC-001`–`PRD-SEC-018`, `PRD-PRF-001`–`PRD-PRF-004`. Retired IDs inside a range are not implemented. The files cite the IDs they apply beside each rule.

**Policies represented:** `POL-01`–`POL-19` (every answer bullet except the retired `POL-13.16`). Answers remain Open/unsigned. Missing production values and authority do not block design, development or synthetic-data tests; they do gate the affected live operation.

- [Design language](design-language.md): visual tokens, accessibility and data/state presentation.
- [UI blueprint](ui-blueprint.html): current navigation, screen contracts and user workflows. It needs [support.js](support.js) in the same folder and an internet connection, because it loads React from unpkg. `support.js` is a pre-built runtime copied in from elsewhere. Its source folder and build command are not in this repository, so do not rebuild or hand-edit it here.
- [Design system](design-system.html): the live visual version of the design language: tokens, states, components and the four shells. A self-contained file that opens offline.
- [Component preview](design-system-preview.html): standalone visual examples only; it defines no business behaviour.
- [Personas](../access/personas.md): the 14 PRD personas with IDs, how several personas combine on screen, and the earlier-code crosswalk.

Screens are English first and ready for Hindi; Hindi for stages 1–5 arrives in stage 5 and for stage 6 in stage 6 (`DEC-058`). Email, WhatsApp and SMS messaging arrive in stage 5; before then nothing is sent (`DEC-099`).

Each file’s workflow details defer to the PRD and KDPS policy answers. No workflow decisions, approvals or configurations are implied by the examples.
