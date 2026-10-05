# Reports

**Not ranked.** Reports decide nothing and change nothing. A report is a snapshot of one check. Any change it suggests to the [PRD](../prd.md) or the [KDPS policies](../kdps-policies.md) needs an entry in [decisions.md](../decisions.md) first.

| Report | What it holds |
| --- | --- |
| [alignment-report.md](alignment-report.md) | The PRD checked against the KDPS policies, the stage plan and the design files: what is settled, what is still open (section 4), and the open values with their owners and stages (section 5). |
| [gaps-before-code.md](gaps-before-code.md) | What stage 1 still needs before code is written: missing designs, the code workspace and house rules, small product-owner decisions, and UI sample values to label. |
| [alignment-sweep.md](alignment-sweep.md) | The sweep of 3 Oct 2026 across every document: clashes C-01 to C-13, the new findings N-01 to N-109 with quotes, owner and stage, and the critic's extras. Items needing a PRD or policy change go to [decision-pack.md](decision-pack.md). |
| [decision-pack.md](decision-pack.md) | One question per PRD or policy change the sweep found, with two options and a recommendation, for the product owner to answer in one pass. Not a decision record: answers are logged in decisions.md first. |
| [decision-walkthrough-log.md](decision-walkthrough-log.md) | The product owner's answer to each decision-pack item and the `DEC-` entry that logs it (DEC-036 to DEC-092). |
| [review-tooling-pilot.md](review-tooling-pilot.md) | Why the doc review gate ran so often, the checker changes of 4 Oct 2026 (`impact`, smaller packets, `record` with States, no resending, the header check), their tests and measured benefit, and the evaluation of Graphify. |
| [apparel-os-s1-baseline-decisions.md](apparel-os-s1-baseline-decisions.md) | The product owner's stage 1 baseline of 5 Oct 2026: the setup step, the test harness, import safeguards and readers, the posting-map workflow, journal numbering and time limits, approved picks for five master proposals (RR-047), and the gates left open. Not a decision record: `DEC-112` logs it and binds. |
| [apparel-os-discount-patterns-research.md](apparel-os-discount-patterns-research.md) | Research on retail discount patterns (5 Oct 2026), kept as reference for the later discount-module design. Nonbinding: it approves nothing and leaves RR-042 (GC7-11) open. |

The questions for KDPS and the CA are in [../questions-for-kdps.md](../questions-for-kdps.md). They point to section 5 of the alignment report by `V-` number.

The earlier audit of 2 Oct 2026 was removed once the alignment report replaced it. It is in git history.
