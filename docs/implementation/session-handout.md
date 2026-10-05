# Session handout — 6 Oct 2026

> **Not ranked.** A note to carry into the next session. It decides nothing; the [implementation plan](index.md) and the documents above it win.

## Where things stand

- **`DEC-112` is merged to `main`** (`1c20267`): the stage 1 baseline of 5 Oct 2026 and the documents updated to match. Its review batch counts as reviewed once you approve it ([index.md](index.md) section 9).
- **`S1-F01-T01` is complete**: built on branch `claude/apparel-os-s1-f01-t01-2b257b` from `1c20267`, reviewed, and its design edit agreed by you on 6 Oct 2026, R1 included.
  - [access-and-approvals.md](../design/access/access-and-approvals.md): the two setup roles' permission matrix (9.11, baseline of `DEC-112`, KDPS confirms under V-01); the setup states across the directory and the Organisation database; reruns of an interrupted setup are identical only when the non-secret fingerprint matches and both temporary passwords verify against the credentials the first run wrote, with no form of a password kept for the check; the fingerprint's canonical-form version; how a session cookie finds its Organisation's database (3.3); how a first temporary password is issued and handed over, and what a first sign-in may reach (3.2, 7.1); users prepared and approved like other access changes, as `DEC-112` reads (2.1, 4.3, 9.11); tests 3d, 3e, 19e, 19f; GC3-13 new, GC3-5 extended.
  - `packages/schemas`: the contract sketch as Zod schemas and types (setup, sign-in, roles and scope, approvals, work items, a `Secret` wrapper), with 35 new unit tests.
  - [s1-f01-first-access.md](s1-f01-first-access.md) aligned; `S1-F01-AT01` now covers identical and conflicting reruns, a different temporary password, a changed fingerprint version and a user without a setup record.
  - Readiness register: RR-017 updated; RR-205 (the CSV and PDF scheduling mismatch for `S1-F06` and `S1-F07`, tracked, not resolved); RR-206 (GC3-13); RR-207 to RR-215, the review follow-ups, each with its owner and gate.
  - Reviewed: two rounds by an independent AI reviewer, every blocking finding fixed and rechecked, recorded as "Claude (AI review, independent reviewer, S1-F01-T01 round n)". Doc check 0 errors, 0 warnings.
- **Agreed with T01 (round 2, R1):** following `DEC-112`, every user change after setup, disabling included, is prepared and independently approved. There is no one-person emergency cut-off: revoking sessions ends them but bars no new sign-in, and neither setup role may revoke other users' sessions.
- **Stage 0 is complete.** `S0-T01` to `S0-T06` are done and merged.
- **Local checkout:** the main checkout may still hold untracked copies of the two `DEC-112` report files in `docs/reports/`; delete them before pulling `main` into it. The worktrees `.claude/worktrees/document-checker-improvements-c67c98` (RR-050) and `.claude/worktrees/s0-t06-task-baa912` are untouched.
- **Standing rule:** no Claude attribution in commits or PRs.

## Next steps, in order (each needs your go-ahead)

| Step | What | Needs from you |
| --- | --- | --- |
| 1 | Approve the `DEC-112` and `S1-F01-T01` AI review batches ([index.md](index.md) section 9) | Approval |
| 2 | Answer the open questions: ordinary hyperlinks in KDPS sheets (GC6-17, RR-201); the synthetic opening-count handler on `dev` (GC6-18); withdrawing an approved assignment before it starts (RR-202, before `S1-F01-T11`); first-user credential recovery (GC3-13, RR-206, before live use) | Decisions |
| 3 | `S1-F01-T02`: directory and Organisation routing ([s1-f01-first-access.md](s1-f01-first-access.md) section 13) | Go-ahead |
| 4 | Apply the roles runbook on Railway `dev`: verify PostgreSQL 17 (CH-2, RR-187) and set the development time limits (CH-3, RR-200) | You run it |
| 5 | Write house rules part B before `S1-F01-T04`, including the replay rule for requests that carry a secret (RR-207) | Review and approval |
| 6 | PRD bullets for the five RR-047 picks, each through a decision entry citing `DEC-112`, before the `S1-F03` code | Approve the wording |

## Decisions and confirmations waiting (none blocks step 3)

- **Confirmations of `DEC-112` picks:** KDPS Owner for the two first users' roles (V-01, question 4), the layout confirmers, the customer-contact refusal and the opening rehearsal on `kdps-test` (RR-197; questions 37, 59); Accounts and the CA for the posting-map workflow and the journal series (RR-198; Accounts 21, CA 18); KDPS Owner and Booking for the season order and the "old" cutoff (RR-199).
- **Tracked for `S1-F06` and `S1-F07`, not blocking T01:** the CSV reader is OPEN (GC6-2) while `S1-F06` acceptance cites CSV; `S1-F07` builds a PDF text reader in stage 1 while GC-6 9.2 proposes extraction in stage 2 (RR-205; PDF.js pin in RR-033). Also RR-203 and RR-204 in `S1-F06`.
- **Still open from before:** the S0-T06 follow-ups RR-193 to RR-196 at their tasks; team size (RR-031); whether `docs/implementation/` becomes gated (RR-052); before production: earlier POS selling before a switch (`DEC-067`), rollout order (SL-9), production hosting (D-1).

## Facts to remember

- 135 of the 209 register items block only live use; nothing a KDPS person must answer blocks coding.
- The stock ledger still has no interface or tables design (RR-012), and 25 of its sections were never reviewed (RR-018); both come before `S1-F10` in DR-2.
- The register still lists stage 0 items (RR-006, RR-020, RR-185, RR-186) as active although the start gate is met; tidy them in a later register update.
- This machine runs every check locally; start Docker Desktop before `pnpm test:integration`.

## To start the next session

Say: "Read `docs/implementation/session-handout.md`, then do step N."
