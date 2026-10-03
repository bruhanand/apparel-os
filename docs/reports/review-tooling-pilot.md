# Review tooling pilot

**Not ranked.** This report decides nothing about the product. It records why the doc review gate ran so often, what was changed in the doc checker on 4 Oct 2026, how it was tested, and the evaluation of Graphify. The rules for the gate are in [AGENTS.md](../../AGENTS.md) ("Checking the documents") and [ai-review.md](../../tools/doc-check/ai-review.md).

## 1. Why the reviewers ran again and again

- **Nothing starts a reviewer by itself.** The pre-commit hook and GitHub run only the checker: about 0.2 seconds, no model. The repository has no Claude Code hooks. Every review was started by hand at step 4 of the change gate.
- **The gate ran once per batch of answers.** The session of 3–4 Oct ran it four times: for DEC-097 to DEC-100, DEC-101 and DEC-102, DEC-103 and DEC-104, and DEC-105. The packets held 150, 71, 72 and 162 sections. After the fixes, 6, 2, 0 and 10 more were flagged.
- **The same sections came back each round.** Those four rounds made 473 section reviews of 231 different sections. 134 of 326 sections have had their record written three or more times, counting the baseline as one.
- **Most sections came back with unchanged text.** In each round, the sections recorded again whose own text had not changed:

| Round | Recorded | Text unchanged | Main trigger for the unchanged ones |
| --- | --- | --- | --- |
| DEC-097 to DEC-100 | 156, of which 69 new (GC-3, GC-5) | 38 | DEC-097 touching rules they cite (26) |
| DEC-101, DEC-102 | 73 | 53 | DEC-101's Choice line cites `POL-02.07` and `PRD-ACS-023` (45) |
| DEC-103, DEC-104 | 72 | 63 | Their Choice lines cite `PRD-ACS-023`, `POL-02.11`, `POL-02.23`, `PRD-ACS-010` and DEC-071, though neither changed a rule's text |
| DEC-105 | 172 | 42 | DEC-105 newly cited in a section one hop away (35) |

- These flags are right under the rules. A decision that reads a rule a certain way can make a section that applies the rule wrong. The waste was elsewhere:
  - the gate ran once per batch, so a section two batches touched was reviewed twice;
  - each packet repeated the changed rule and decision text under every section;
  - a verdict was not tied to what the reviewer read. `review` recorded the section as it was at recording time, even if it had changed since;
  - a packet could be written while other errors were open, such as an ID missing from a header. Fixing them later flagged sections again.
- Edits to a decision entry's other lines (its Why or its list of changed documents) flag every section that cites it. That happened 4 times in the session, so the decision fingerprint was left as it is.

## 2. What changed in the checker

- **`impact <ID> ...`** lists the sections a change would flag before it is made: direct citations, one hop, whole-policy citations, and the PRD or policy headings a reworded rule sits in. A decision ID also counts the IDs its Choice and Changed lines cite.
- **`packet` runs the cheap checks first.** It refuses to write while any error other than "Review required" is open. A record left by a renamed or removed section does not block it. `--force` overrides.
- **Smaller packets.** Each changed source is printed once at the top of a part, not under every section. `--split <n>` cuts the packet into parts of about equal size, keeping each document's sections together.
- **Each section carries its State**, a fingerprint of its text and all its dependencies.
- **`record <file> ... --by <name>`** records many verdicts, one line per section with its own reason. It refuses a line when the section changed after the reviewer read it, when the reason has fewer than 8 words, when the same reason is given for another section in the files or is already recorded for one, or when it repeats the section's last record word for word. `review` takes `--state` for the same check.
- **No resending.** `packet` remembers which sections it sent and in what State, in the git directory (never committed). An unchanged section is left out of the next packet; `--all` sends it again.
- **Header check.** A design document that lists its IDs in its header must list every ID its sections cite, outside comments. An ownership table is marked `<!-- header: not listed — reason -->`. It found `POL-10.08`, which the module map cites in 4.11, missing from that document's header. That is now fixed.
- **New-rule warning.** A rule added since the base that no section cites gets a warning to run the broad sweep. Before, a new rule flagged nothing.

The rules for staleness, the one-hop dependency rule and `docs/reviews.json` are unchanged. All 256 recorded reviews were kept.

## 3. Test evidence

The tests were run in a scratch copy of the repository at commit 7b56a02, with synthetic edits and a synthetic decision entry.

| Test | Old checker | New checker |
| --- | --- | --- |
| Rule text changed (`PRD-ACS-023`), no decision entry | 31 sections flagged, decision-log error | Same 31 sections and error; `packet` refuses until the entry exists |
| Same, with a decision entry | 31 flagged | 31 flagged; `impact` had predicted 31 |
| `packet` run twice with no change | Same packet again | "Nothing new to review" |
| One flagged section edited after the packet | Whole packet again | Packet of 1 section; 30 left out |
| Decision entry's Why line edited (DEC-104) | 10 flagged | Same 10 |
| One hop (`PRD-INT-005`, cited in stock-ledger 10.4) | access-and-approvals 9.7 flagged via 10.4 | Same |
| New rule cited nowhere | 0 errors, 0 warnings | 0 errors, 1 warning naming the rule |
| Section renamed | Old record reported, renamed section flagged | Same; `packet` still writes |
| Section deleted | 2 sections that pointed at it flagged | Same 2 |
| Verdict file: short reason, repeated reason, changed section, unknown key | No such command | Each refused, with its reason |

- **Replay of the four rounds.** Each round's state was checked out again: the decisions logged, the designs not yet updated. The new packet held the same sections as the old one (68, 69, 72, 52). `impact` with that round's decision IDs predicted exactly the flagged set, with none missed and none extra.
- **Known contradictions are still found.** In the scratch copy, three edits were planted:
  - a synthetic decision changed `POL-02.24` so that counted items may be sold during a count;
  - a stand-in was allowed to approve their own work (against `POL-02.20` and `PRD-ACS-018`);
  - a harmless rewording was made as a decoy.

  One Sonnet reviewer read the 10-section packet in 92 seconds, using about 108,000 tokens and 10 tool calls. It found both planted clashes. It also found a third real one: the stage 3 KDPS question still described the full freeze. It passed the decoy and made no false finding. `record` then recorded 6 verdicts and refused the decoy's, because the decoy had been edited after the review.

- **The changes in this report went through the new workflow.**
  - The first packet held the 5 sections they changed. One Sonnet reviewer took 5.4 minutes. It found 3 wording faults in AGENTS.md and a code gap: `impact` did not accept `prd.md#…`.
  - After the fixes, `record` kept the 2 still-valid verdicts and refused 1 whose section had been edited.
  - The second packet held only the 3 edited sections. The same reviewer cleared them in 45 seconds.

## 4. Measured benefit

| Measure | Before | After |
| --- | --- | --- |
| Packet size, four replayed rounds | 256k, 280k, 284k, 203k characters | 184k, 192k, 191k, 149k (26–33% smaller) |
| Sections reviewed if the four rounds had been one | 473 | 231 (51% fewer) |
| Same, for DEC-101 to DEC-105 only | 317 | 194 (39% fewer) |
| Unchanged sections sent again after fixes | Whole packet | None |
| Checker run time | 0.18 s | 0.18 s |
| Accuracy of the flagged set | — | Identical in every test and replay |

The fewer section reviews come from batching decisions. `impact` and the workflow make that easy to do, but the checker does not enforce it.

## 5. Graphify

Graphify 0.9.74 (`graphifyy` on PyPI, commit 0b60d47, Apache-2.0 and MIT, no telemetry) builds a graph from code and documents.

- **Where it processes content.**
  - Code is parsed on the machine, with no model.
  - Markdown and HTML are "documents". Its full extraction sends them to a model provider: Gemini, Kimi, Claude, OpenAI, DeepSeek, Azure, Bedrock, the claude command line, or a local Ollama.
  - A line-by-line Markdown quick-scan runs locally. It was run in a scratch folder on a copy of `docs/` and `AGENTS.md`, with no API keys and no network. Nothing was sent anywhere.
- **What the local graph holds.** 855 nodes and 1,106 edges:
  - 24 pages and 744 headings, with 812 "contains" edges;
  - 134 page-to-page links, with the anchors dropped;
  - 87 nodes from `support.js`.

  It has no rule IDs, no pointers such as "stock-ledger 10.4" and no links between sections. It skips the HTML pages.
- **Impact.**
  - `graphify affected "PRD-ACS-023"` finds no node.
  - For the `POL-02.24` change, it marks the 19 files that link to `kdps-policies.md` as affected. That is 287 of the 325 tracked sections. The checker flags 8.
- **Not run.** The model-based extraction was not run. It needs approval to send the private documents to a provider. Its links are inferred concepts that would each need checking, and they do not carry the PRD, policy or decision IDs the gate rests on.
- **Two hops.** Graphify walks two hops by default. In this repository, a second hop would add up to 78% more sections per change: `PRD-ACS-023` from 25 to 32, `PRD-INT-005` from 23 to 41, `PRD-STK-001` from 30 to 49.
- **Decision.** Not integrated. Locally it is less precise than the checker. Its useful part, the model extraction, would move private text to a new service and still need checking. Look at it again once there is business code: its local code graph needs no model.

## 6. Limits

- The checker follows one hop. A sentence that restates a rule two hops away without citing it is found only by the broad sweep.
- A decision whose Choice line cites a rule still flags every section that cites that rule, even when no rule text changes. Most of a round's sections come from this.
- The pre-commit hook checked the working tree, not only the staged files. Fixed later the same day: it now checks the staged snapshot (`--staged`, AGENTS.md "Checking the documents").
- The memory of sent sections is per clone. A new clone sends everything once.
- `record` checks the form of a reason: its length, repetition and State. It cannot tell a careful review from a careless one.

## 7. The review workflow from now on

1. Collect all the decisions of a round. Run `impact` with their IDs to see the size of the round.
2. Log the entries and edit the PRD or the policies. Run the checker and fix every error that is not "Review required".
3. `packet --split <n>`: one part for up to about 20 sections, up to 6 parts for a wide change. One Sonnet reviewer per part, writing a verdict file with the States.
4. `record` each verdict file. Fix the findings.
5. Write the packet again. It holds only what the fixes changed. Review it, record it, then run the checker until it passes and commit.
