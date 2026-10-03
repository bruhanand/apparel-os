# Design documents
<!-- deps: none — folder index and reading guide -->

**Rank 3 of 4: design.** These documents say how the system implements the [PRD](../prd.md) and the [KDPS policies](../kdps-policies.md). They never contradict either. See [../README.md](../README.md) for the order.

Each document starts by naming the PRD sections and the requirement and policy IDs it implements, cites the ID next to each rule it applies, and lists its open questions. A question that needs a business decision goes up to the PRD or the policies.

| Folder | What it holds |
| --- | --- |
| [access/](access/) | [personas.md](access/personas.md): the 14 personas, how they combine, and the earlier-code crosswalk. [access-and-approvals.md](access/access-and-approvals.md): sign-in and sessions, roles, role assignments and scope, restricted fields, approvals, stand-ins, My work and the exception record. |
| [architecture/](architecture/) | [module-map.md](architecture/module-map.md): the modules, what each owns, their interfaces, events and transaction boundaries. [domain-model.md](architecture/domain-model.md): the records, their identities, lifecycles and invariants. Every other design and all code follow them. |
| [masters/](masters/) | [structure-and-masters.md](masters/structure-and-masters.md): the business structure (legal entities, registrations, books, Sites, Stores, business units, locations) and the masters (brands, SKUs, codes, units, tracking profiles, parties, agreements): fields, codes, versions, checks and tables. |
| [platform/](platform/) | [deployment.md](platform/deployment.md): test hosting on Railway. Production hosting is not designed yet. [numbering-and-audit.md](platform/numbering-and-audit.md): business codes, number series and the bill series per device, the audit record and the access record. |
| [stock/](stock/) | [stock-ledger.md](stock/stock-ledger.md): movements, holds, cost pools, counts and locking. Every stage posts stock through it. |
| [ui/](ui/) | Screens, design language and design system. Start with [ui/README.md](ui/README.md). |
