# Session handout — 6 Oct 2026

> **Not ranked.** A note to carry into the next session. It decides nothing; the [implementation plan](index.md) and the documents above it win.

## Where things stand

- **Stage 1 baseline reconciled, committed on branch `claude/apparel-os-s1-reconcile-07f799`; not pushed or merged.** `DEC-112` in [decisions.md](../decisions.md) logs your baseline of 5 Oct 2026 ([apparel-os-s1-baseline-decisions.md](../reports/apparel-os-s1-baseline-decisions.md)): the setup step (CH-1, RR-017 setup states and the two first users' duties), role-assignment overlap (CH-7), PostgreSQL 17 and the development time limits (CH-2, CH-3), the read-only test role and audit partitions (CH-4, CH-5), harness decisions H1 to H6, the import picks (GC6-1 to GC6-6, GC6-8), the posting-map workflow (GC4-2), one journal series per book and year (GC4-4), and the five master proposals of RR-047. No PRD or policy bullet changed.
- **Documents updated to match:** access-and-approvals, code-house-rules, imports-and-opening-data, books-and-posting, numbering-and-audit, questions-for-kdps (KDPS Owner 4, 37, new 59; new Accounts 21; CA 18), `AGENTS.md` "Code workspace", the reports index, and this plan (readiness register, `S1-F01`, the harness, stages and features, exit checklists, index).
- **Reviewed:** six rounds by independent AI reviewers, every finding fixed and re-reviewed, recorded as "Claude (AI review, independent reviewer, DEC-112 round n)". Doc check: 0 errors, 0 warnings. The batch counts as reviewed once you approve it ([index.md](index.md) section 9).
- **Kept as they were:** RR-042 (which lines earn a group discount) stays deferred, with its `S1-F11` case and `S4-F02` gate. [apparel-os-discount-patterns-research.md](../reports/apparel-os-discount-patterns-research.md) is reference only. Every policy signature, KDPS value, Accounts and CA approval, real-data permission and live gate stays open.
- **`S1-F01-T01` not started.** Work begun on it on 6 Oct was reverted at your request; nothing of it remains.
- **Stage 0 is complete.** `S0-T01` to `S0-T06` are done and merged; all six start-gate conditions of [stage-0-preparation.md](stage-0-preparation.md) section 2 are met.
- **Local checkout:** the main checkout still holds untracked copies of the two report files in `docs/reports/`. Delete them before pulling this branch into it, or git refuses to overwrite them; the committed copies differ only in their link paths. The worktrees `.claude/worktrees/document-checker-improvements-c67c98` (RR-050) and `.claude/worktrees/s0-t06-task-baa912` are untouched.
- **Standing rule:** no Claude attribution in commits or PRs.

## Next steps, in order (each needs your go-ahead)

| Step | What | Needs from you |
| --- | --- | --- |
| 1 | Approve the `DEC-112` review batch; push and merge the branch | Your approval and go-ahead |
| 2 | Answer the questions the reviews raised: ordinary hyperlinks in KDPS sheets (GC6-17, RR-201; refused until you decide); whether the synthetic opening-count handler may run on `dev` (GC6-18; tests only until you decide); withdrawing an approved assignment before it starts (RR-202, before `S1-F01-T11`) | Decisions |
| 3 | `S1-F01-T01`: design check and contract sketch ([s1-f01-first-access.md](s1-f01-first-access.md)). `DEC-112` already settles the setup states and the two first users' duties; T01 derives their exact permission matrix, has it independently reviewed, and settles how a session finds its Organisation's database. Found in the reverted attempt: how a new user's first temporary password is issued is not designed, so check it in T01 | Go-ahead; then agree the design edit |
| 4 | Apply the roles runbook on Railway `dev`: verify PostgreSQL 17 (CH-2, RR-187) and set the development time limits (CH-3, RR-200) | You run it |
| 5 | PRD bullets for the five RR-047 picks, each through a decision entry citing `DEC-112`, before the `S1-F03` code | Approve the wording |

## Decisions and confirmations waiting (none blocks steps 1 to 4)

- **Confirmations of `DEC-112` picks:** KDPS Owner for the two first users' roles (V-01, question 4), the layout confirmers, the customer-contact refusal and the opening rehearsal on `kdps-test` (RR-197; questions 37, 59); Accounts and the CA for the posting-map workflow and the journal series (RR-198; Accounts 21, CA 18); KDPS Owner and Booking for the season order and the "old" cutoff (RR-199).
- **Design follow-ups from the reviews:** how intake finds customer-contact columns before storing (RR-203) and the `import_batch` code source (RR-204), both in `S1-F06`.
- **Still open from before:** the S0-T06 follow-ups RR-193 to RR-196 at their tasks; team size (RR-031); whether `docs/implementation/` becomes gated (RR-052); before production: earlier POS selling before a switch (`DEC-067`), rollout order (SL-9), production hosting (D-1).

## Facts to remember

- 134 of the 198 register items block only live use; nothing a KDPS person must answer blocks coding.
- The stock ledger still has no interface or tables design (RR-012), and 25 of its sections were never reviewed (RR-018); both come before `S1-F10` in DR-2.
- The register still lists stage 0 items (RR-006, RR-020, RR-185, RR-186) as active although the start gate is met; tidy them in a later register update.
- This machine runs every check locally; start Docker Desktop before `pnpm test:integration`.

## To start the next session

Say: "Read `docs/implementation/session-handout.md`, then do step N."
