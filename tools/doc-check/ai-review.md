# AI review of flagged sections

The checker (`check.mts`) knows which sections depend on which rules and flags them when a rule changes. It cannot read meaning: a stale sentence with valid IDs and links passes every other check. This review reads the flagged sections against their sources and reports clashes. It decides nothing and edits nothing.

## When to run it

- The checker reports "Review required" for one or more sections, and no other error. Fix the other errors first: each fix can change which sections are stale.
- The checker warns "broad sweep": a stock, money or access rule changed, or a decision cites one. Run the broad sweep as well as the targeted review.
- The checker warns that a new or changed rule is cited by no section. Nothing goes stale for it, so only the sweep finds where it belongs; the packet lists it.
- Before a decision entry that changes stock, money or access rules is approved, run `impact` with the IDs it would cite to see what it would touch.

## Steps

1. Gather every decision of the round first. A section that two decisions touch is then reviewed once, not twice. `node tools/doc-check/check.mts impact <IDs>` lists the sections a set of IDs would flag.
2. Write the packet: `node tools/doc-check/check.mts packet --out <scratch>/packet.md --split <n>`. Use one part for up to about 20 sections, and add a part, up to 6, for each further 30 or so. Each part holds its sections, why each was flagged, each section's State, and the current text of the changed sources once, with any new decisions.
3. Give each reviewer one part and the rules below. For a broad sweep, also give the changed IDs from the warning. Each reviewer writes its no-clash verdicts to its own file in the scratch directory, one line per section: the section key, a tab, the State from the packet, a tab, the reason.
4. Record the verdicts of all parts together: `node tools/doc-check/check.mts record <scratch>/verdicts-1.tsv <scratch>/verdicts-2.tsv --by "<name>"`. A line is refused when its section changed after the reviewer read it, when its reason has fewer than 8 words, when the same reason is given for another section or is already recorded for one, or when it repeats the section's last record.
5. For each finding, fix the lower document to match the higher one. If the higher rule itself looks wrong, raise it: a decision entry for the PRD or the policies, or a question in `docs/questions-for-kdps.md`. Never settle a business rule in the design. A finding you judge is not a clash is recorded with `review` and a reason that says why.
6. Write the packet again. It holds only the sections that changed since they were sent: the fixed ones and any section whose sources the fixes changed. Review those the same way, then run the checker until it passes.

A packet never goes out twice for unchanged sections: the checker remembers what it sent, in the git directory, and leaves those out. `--all` sends them again, for example when a reviewer's file was lost.

## Rules for the reviewer

- Compare each flagged section with the current text of its sources and the new decisions listed in the packet. Read more of the source documents when a rule refers to another.
- When the packet says "Baseline record only", the section was never reviewed: compare all of it, not only the change.
- For a rule the packet lists as cited by no section, run the broad sweep for it and say which section should cite it, or that none needs to.
- Report a finding when a sentence in the section:
  - says something the source does not allow;
  - drops a condition, approver, stage or OPEN mark the source requires;
  - uses a term differently from the PRD's "Words used" tables.
- Never edit a file. Never choose between two business rules. Never fill an OPEN value.
- When a section has no clash, write its verdict line with the State from the packet and a reason that names what was compared and what was found. Write no line for a section with a finding.

### Broad sweep

Search every gated document (`docs/design/`, `docs/phases.md`, `docs/questions-for-kdps.md`, `AGENTS.md`) for the changed IDs and for the words of the changed rule, such as "journal", "outbox" or "approver". Report sentences that restate the old rule, including those that cite no ID. A sentence that restates a rule without citing it is an undeclared dependency: name the ID it should cite.

## Finding format

One block per finding:

```
Rule:      PRD-MOD-013 — "…quote…" (docs/prd.md:LINE); decision DEC-087 — "…quote…" (docs/decisions.md:LINE)
Sentence:  "…quote…" (docs/design/stock/stock-ledger.md:LINE)
Clash:     The section sends journals through the outbox after commit; the rule commits them with the movement.
Decides:   product owner (the PRD or policy names who decides)
```
