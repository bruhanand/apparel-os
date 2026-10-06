# Session handout — 6 Oct 2026

> **Not ranked.** A note to carry into the next session. It decides nothing; the [implementation plan](../plan/how-we-build.md) and the documents above it win.

## Where things stand

Stage 1 is being built on branch `claude/apparel-os-stage-1-4d1059` (worktree `.claude/worktrees/apparel-os-stage-1-4d1059`), one local commit per task after its independent review and checks. The product owner allows pushing this branch for CI (no PR, no merge to `main`, no deploy). Railway `dev` steps are not authorised. The run was stopped by the product owner on 6 Oct 2026 to cut review load; nothing below is in progress.

### Done on the branch

| Commit | What |
| --- | --- |
| `ea754a1` | Plan: the `DEC-112` and `S1-F01-T01` review batches approved; RR-205 decided (CSV reader in `S1-F07`, PDF text extraction in stage 2 with `S2-F05`) |
| `fc62efb` | `S1-F01-T02` directory and Organisation routing (two review rounds) |
| `359e4ce` | House rules part B drafted and reviewed; RR-202 withdrawal of a Scheduled version (house rules 7.3) |
| `6bb1ad6` | Part B approved; `DEC-113` and `DEC-114` (`PRD-INT-002`: an answer that showed a secret or a restricted value unmasked is never replayed); CH-8, CH-13, CH-14 decided; uncertain commit keeps the key; "Replay at a glance" in house rules 12.4; CH-9 retention stays OPEN |
| `8e71547` | `S1-F11` shared calculations, server half: `packages/calculations`, 38 golden cases pass on the server; GC-7 amended, GC7-12 to GC7-17 open |
| `07c8acf` | `S1-F01-T03` command context (four review rounds). CI green on this commit (Code check and Doc check) |
| last commit | DR-2: the stock ledger interface, tables and harness (stock-ledger 13 to 15, SL-24 to SL-28) reviewed in four rounds, and the 24 never-reviewed ledger sections (RR-018) reviewed. All choices marked **Proposed** await the product owner's approval of the DR-2 batch |

### Parked, not merged, not reviewed

- **`S1-F01-T04` idempotency helper:** stopped part-way; partial work in `.claude/worktrees/agent-ac4283b04ef22abff`. Restart from the brief in the T04 row of [s1-f01-first-access.md](../plan/stage-1/s1-f01-first-access/spec.md) and house rules 12.4.
- **`S1-F01-T07` audit:** stopped part-way; partial work in `.claude/worktrees/agent-a9ac93afd7240845d`.
- **GC-9 backup and restore** draft (`docs/design/platform/backup-and-restore.md`, branch `worktree-agent-a3c97e6046ec0685e`) and **GC-8 offline counter** draft with the RR-015 proposal `apps/counter` (`docs/design/pos/offline-counter.md`, branch `worktree-agent-a5deacedc517698eb`): both unreviewed (DR-3).
- **`S1-F11` counter run and bundle check:** blocked on RR-015 and Playwright (`S1-F01-T19`).

## Waiting for the product owner

- Approve the DR-2 batch (ledger design with its Proposed choices) and the review batches of part B, `DEC-113` and `DEC-114` ([index.md](../plan/how-we-build.md) section 9).
- SL-28: may a found piece be swapped with a missing piece of another owner? Until decided, treated as no match.
- GC7-15 to GC7-17 (product owner), GC7-12 to GC7-14 (Accounts, CA); SL-25 (row-level security for stock rows), SL-27 (CA); GC8-1 (lost counter's protected stock) once GC-8 is reviewed.
- Still open from before: GC6-17, GC6-18, GC3-13, RR-206; the `DEC-112` confirmations; RR-042 stays deferred; Railway `dev` steps (stage 1 exit check 4 cannot be evidenced without them).
- The register's counts and short answer need a tidy pass: several rows were decided or added in this run (RR-205, RR-207, RR-208, RR-011, RR-216 to RR-234).

## Next, if the run resumes

1. `S1-F01-T04`, `S1-F01-T07`, then T05, T08, T06, T11, T09, T10, T12, T13 by the plan's lanes.
2. DR-3 (GC-8, GC-9) and DR-1b before `S1-F01-T14`.
3. Consider lighter review: one review round per task plus a recheck of blocking findings only.

## Facts to remember

- Standing rule: no Claude attribution in commits or PRs.
- Start Docker Desktop before `pnpm test:integration`.
- `docs/reviews.json` is written only on this branch, one round at a time.

## To start the next session

Say: "Read `docs/implementation/session-handout.md`, then continue stage 1 from 'Next, if the run resumes'."
