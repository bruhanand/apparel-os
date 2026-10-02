# UI design documents

**Rank 3 of 4: design.** These files describe presentation and screen behaviour only. The [PRD](../../prd.md) is authoritative for product requirements and vocabulary; the [KDPS policy answers](../../kdps-policies.md) are authoritative for customer-specific choices within the PRD. The [delivery stages](../../phases.md) set order only.

**PRD sections implemented:** Product; Organisation, sites and ownership; People, access and approvals; Merchandise and identifiers; Source conversion and imports; Booking and buying; Receiving and price tickets; Stock and warehouse control; Transfers and physical movement; Damage, quarantine and disposal; Counter sales and payments; Customer returns, exchanges and credit; EBO sales and external billing; Offers, prices and supplier returns; Finance and accounting; Franchise and partner accounts; HRMS and payroll; Exceptions, reports and planning; Opening, closure, migration and export; Operator experience; Offline counter; AI, security and operational reliability.

**Policies represented:** 1–19. Answers remain Open/unsigned. Missing production values and authority do not block design, development or synthetic-data tests; they do gate the affected live operation.

- [Design language](design-language.md): visual tokens, accessibility and data/state presentation.
- [UI blueprint](ui-blueprint.html): current navigation, screen contracts and user workflows. It needs [support.js](support.js) in the same folder and an internet connection, because it loads React from unpkg.
- [Design system](design-system.html): the live visual version of the design language: tokens, states, components and the four shells. A self-contained file that opens offline.
- [Component preview](design-system-preview.html): standalone visual examples only; it defines no business behaviour.
- [Personas](../access/personas.md): the 14 PRD personas with IDs, how several personas combine on screen, and the earlier-code crosswalk.

Screens are English first and ready for Hindi; the Hindi interface and WhatsApp and SMS messaging arrive in stage 5.

Each file’s workflow details defer to the PRD and KDPS policy answers. No workflow decisions, approvals or configurations are implied by the examples.
