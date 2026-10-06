# Session handout — 6 Oct 2026

> **Not ranked.** A note to carry into the next session. It decides nothing; the [implementation plan](index.md) and the documents above it win.

## Where things stand

Stage 1 is being built on branch `claude/apparel-os-stage-1-4d1059` (worktree `.claude/worktrees/apparel-os-stage-1-4d1059`), one local commit per task after its independent review and checks. The product owner allows pushing this branch for CI (no PR, no merge to `main`, no deploy). Railway `dev` steps are not authorised, so the `dev` restore drill and RR-187 stay open. `S1-F01-T01` (PR #5) is merged to `main`; the branch started from it (`eb81f53`).

### Done on the branch

| Commit | What |
| --- | --- |
| `ea754a1` | Plan: the `DEC-112` and `S1-F01-T01` review batches approved by the product owner; RR-205 decided (CSV reader in `S1-F07`, PDF text extraction in stage 2 with `S2-F05`) |
| `fc62efb` | `S1-F01-T02` directory and Organisation routing: reviewed in two rounds, 97 integration tests; RR-195 done, RR-216 (pool size OPEN, deployment D-7) |
| `359e4ce` | Code house rules part B (section 12) drafted and reviewed in five rounds; RR-202 withdrawal of a Scheduled version (house rules 7.3) |

### In progress (uncommitted in the worktree unless said)

- **Part B approval round.** The product owner approved part B on 6 Oct 2026, answered CH-8 (an unverifiable password replay is refused as changed content; an authenticator code is proof, not content), and approved `DEC-113` (a shown-once secret is never replayed) and `DEC-114` (nor is a restricted value shown unmasked), both editing `PRD-INT-002`. Also decided: a replay is answered only after Authenticate and Authorise pass again; every restricted value kept for investigation is encrypted and no secret is ever kept; the key belongs to Organisation, actor, operation and key across sessions; an uncertain commit keeps the key (`kernel.outcome-unknown`); CH-9 retention stays OPEN (nothing is deleted yet only as a temporary safeguard). House rules 12.4 has a "Replay at a glance" table. Review of the 99 sections `PRD-INT-002` flags, with the broad sweep, is running.
- **`S1-F01-T03` command context:** built, independently reviewed, blocking findings fixed (silent rollback on a caught error, kept handle after the command); the uncertain-commit report is being added; then recheck and commit.
- **`S1-F11` shared calculations (server half):** on branch `worktree-agent-a945704b9d4e02c9a` at `31c28f4`, rebased on `359e4ce`; three code review rounds, no blocking finding left. Waiting for the doc gate on its GC-7 edits (new GC7-12 to GC7-16; RR-219 to RR-224) before merging. Its counter run and bundle check are blocked on RR-015 and Playwright (`S1-F01-T19`).
- **Designs drafted, awaiting their review batches:** the stock ledger interface, tables and harness (stock-ledger 13 to 15; RR-012, RR-013; branch `worktree-agent-a13586bcf47ee714e`, `fcadbe8`) for DR-2 with the 25 never-reviewed ledger sections (RR-018); GC-9 backup and restore (`docs/design/platform/backup-and-restore.md`; branch `worktree-agent-a3c97e6046ec0685e`, `c725e23`) and GC-8 offline counter with the RR-015 proposal `apps/counter` (`docs/design/pos/offline-counter.md`; branch `worktree-agent-a5deacedc517698eb`, `0bb6852`) for DR-3.

## Next, in order

1. Finish the `PRD-INT-002` review round; record; commit part B approval with `DEC-113` and `DEC-114`.
2. `S1-F01-T03`: recheck, final checks, commit.
3. `S1-F11`: doc gate on GC-7, merge, commit.
4. `S1-F01-T04` (idempotency helper, with the uncertain-commit test) and `S1-F01-T07` (audit) next; then T05, T08, T06, T11, T09, T10, T12, T13 by the plan's lanes.
5. DR-2 (ledger design), DR-3 (GC-8, GC-9) and DR-1b (design-language sections for `S1-F01-T14`) as review batches, each needing the product owner's approval.

## Open items for the product owner

- GC8-1: `PRD-OFF-011` releases a lost counter's protected stock only after a pause on that counter, which a lost counter cannot give (stage 4).
- Still open from before: GC6-17 (hyperlinks in KDPS sheets), GC6-18 (opening-count handler on `dev`), GC3-13 (first users' credential recovery), RR-206; the `DEC-112` confirmations by KDPS, Accounts and the CA; RR-042 stays deferred.
- Not authorised in this run: Railway `dev` steps (roles runbook, restore drill), so stage 1 exit check 4 cannot be evidenced on `dev`.

## Facts to remember

- Standing rule: no Claude attribution in commits or PRs.
- Start Docker Desktop before `pnpm test:integration`.
- `docs/reviews.json` is written only on this branch, one round at a time; design drafts in other worktrees are reviewed after they are merged here.

## To start the next session

Say: "Read `docs/implementation/session-handout.md`, then continue stage 1 from 'Next, in order'."
