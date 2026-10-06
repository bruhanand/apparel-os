# Domain docs

How the engineering skills use this repo's domain documentation. This repo does not use `GLOSSARY.md` or `docs/adr/`; its existing documents fill those roles, under the document order of `AGENTS.md`.

## Before exploring, read these

- **The glossary:** the "Words used" tables of [prd.md](../prd.md). Use their terms exactly, in docs, tickets and code.
- **The decisions:** [decisions.md](../decisions.md), the `DEC-nnn` entries that changed the PRD or the policies. Read those that touch the area.
- **The rules:** [prd.md](../prd.md) (rank 1) and [kdps-policies.md](../kdps-policies.md) (rank 2), by their `PRD-` and `POL-` IDs.
- **The design of the area** in [design/](../design/README.md), starting with the [module map](../design/architecture/module-map.md) and [domain model](../design/architecture/domain-model.md). Each design lists its open questions (`SL-n`, `MM-n`, `GC3-n` …).
- **Where the work stands:** [STATUS.md](../STATUS.md) and the current stage's folder in [plan/](../plan/roadmap.md).

## Never create GLOSSARY.md, GLOSSARY-MAP.md or docs/adr/

Where a skill (such as `/domain-modeling`, `/grill-with-docs` or `/triage`) would write a glossary entry or an ADR, do this instead:

- **A new or sharper term:** propose a row for the PRD's "Words used" table, as a `DEC-nnn` entry in `decisions.md`. The PRD belongs to the product owner: propose, then wait for approval unless the product owner decides directly.
- **A product or policy decision:** propose a `DEC-nnn` entry (date, who decided, question, options, choice and why, IDs changed). The entry comes first; the PRD or policy edit follows it.
- **A technical design decision:** write it in the design document of its area, marked **Proposed** until the product owner approves it, and list it in that design's open questions.
- **A KDPS value:** never decide it. Mark it OPEN, add it to [questions-for-kdps.md](../questions-for-kdps.md) and track it in [kdps-values.md](../plan/kdps-values.md).

## Flag conflicts

If your output contradicts a `DEC-nnn` entry, a PRD or policy rule, or a design, say so and cite the ID or section, rather than overriding it silently. When two documents disagree, the higher one wins (`AGENTS.md`, "Document order"); report the clash instead of guessing.
