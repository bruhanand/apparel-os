# Design documents

**Rank 3 of 4: design.** These documents say how the system implements the [PRD](../prd.md) and the [KDPS policies](../kdps-policies.md). They never contradict either. See [../README.md](../README.md) for the order.

Each document starts by naming the PRD sections and policy IDs it implements, and lists its open questions. A question that needs a business decision goes up to the PRD or the policies.

| Folder | What it holds |
| --- | --- |
| [access/](access/) | [personas.md](access/personas.md): the 14 personas, how they combine, and the earlier-code crosswalk. |
| [platform/](platform/) | [deployment.md](platform/deployment.md): test hosting on Railway. Production hosting is not designed yet. |
| [stock/](stock/) | [stock-ledger.md](stock/stock-ledger.md): movements, holds, cost pools, counts and locking. Every stage posts stock through it. |
| [ui/](ui/) | Screens, design language and design system. Start with [ui/README.md](ui/README.md). |
