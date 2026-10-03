# AI review of flagged sections

The checker (`check.mts`) knows which sections depend on which rules and flags them when a rule changes. It cannot read meaning: a stale sentence with valid IDs and links passes every other check. This review reads the flagged sections against their sources and reports clashes. It decides nothing and edits nothing.

## When to run it

- The checker reports "Review required" for one or more sections.
- The checker warns "broad sweep": a stock, money or access rule changed. Run the broad sweep as well as the targeted review.
- Before a decision entry that changes stock, money or access rules is approved, to see what it would touch.

## Steps

1. Write the packet: `node tools/doc-check/check.mts packet --out <scratch>/packet.md`. It holds each flagged section, why it was flagged, and the current text of the sources that changed, with any new decisions.
2. Give the reviewer the packet and the rules below. For a broad sweep, also give it the changed IDs from the warning.
3. For each finding, fix the lower document to match the higher one. If the higher rule itself looks wrong, raise it: a decision entry for the PRD or the policies, or a question in `docs/questions-for-kdps.md`. Never settle a business rule in the design.
4. Record each section once it is right: `node tools/doc-check/check.mts review "<section>" --by "<name>" --reason "<what was compared>"`.

## Rules for the reviewer

- Compare each flagged section with the current text of its sources and the new decisions listed in the packet. Read more of the source documents when a rule refers to another.
- Report a finding when a sentence in the section:
  - says something the source does not allow;
  - drops a condition, approver, stage or OPEN mark the source requires;
  - uses a term differently from the PRD's "Words used" tables.
- Never edit a file. Never choose between two business rules. Never fill an OPEN value.
- When a section has no clash, say "No clash" and name what was compared. That line can become the review reason.

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
