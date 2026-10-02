# Apparel OS documents

All project documents live in this folder. When two of them disagree, the one higher in this order wins.

| Rank | Document | What it says |
| --- | --- | --- |
| 1 | [prd.md](prd.md) | What the product does. The source of truth for requirements and for vocabulary, through its "Words used" tables. |
| 2 | [kdps-policies.md](kdps-policies.md) | What KDPS has decided, within the options the PRD allows. |
| 3 | [design/](design/) | How the system implements the PRD and the KDPS policies. A design document may never contradict either of them. |
| 4 | Code | Implements the design. |

[phases.md](phases.md) is the delivery plan. It sets the order of the work only. If it disagrees with the PRD or the KDPS policies, they win.

[decisions.md](decisions.md) logs each change to the PRD or the KDPS policies: the question, the options, the choice and why, and the IDs it changed. The entry comes first; the edit follows it. [review/](review/) holds reports and open questions. Neither is ranked; they decide nothing on their own.

## When two documents disagree

- The higher document wins straight away. Treat the lower one as wrong until it is fixed.
- Fix the lower document to match. Never change a higher document only to make a lower one fit.
- If the higher document is the one that is wrong, change it first. Then update everything below it.
- A KDPS policy answer that falls outside the options the PRD allows is not a valid policy. It is a request to change the PRD.
- A design question that needs a business decision is not settled in the design. It goes up to the PRD or the KDPS policies.
- Code that differs from its design is a defect. Fix the code, or change the design first and then the code.
- Where no design document exists yet, code follows the PRD and the KDPS policies directly, and the missing design is noted.

## Words

- Use words exactly as the PRD's "Words used" tables define them, in every document and in the code.
- A new term is added to "Words used" first, before any other document or code uses it.
- A lower document cannot give an existing word a different meaning.

## Design documents

- Design documents live in [design/](design/), one folder per area. The user interface design is in [design/ui/](design/ui/). Personas, roles and access are in [design/access/](design/access/). Hosting and environments are in [design/platform/](design/platform/). The stock ledger, which every stage posts stock through, is in [design/stock/](design/stock/).
- Each design document starts by naming the PRD sections and KDPS policies it implements.
- A design document lists its open questions. A question that needs a business decision is raised against the PRD or the KDPS policies.
