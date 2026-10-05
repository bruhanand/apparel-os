# Session handout — 5 Oct 2026

> **Not ranked.** A note to carry into the next session. It decides nothing; the [implementation plan](index.md) and the documents above it win.

## Where things stand

- **Planning package written, not committed.** `docs/implementation/` (index, readiness register, stage 0, stages and features, `S1-F01` in full, the proposed stock harness, requirement coverage, exit checklists, this handout) and one new row in `docs/README.md`. The doc checker passes on it.
- **S0-T03 done and merged.** The Doc check workflow installs the pinned pnpm (12.4.1) before `setup-node`. [PR #1](https://github.com/bruhanand/apparel-os/pull/1), merged as `b6395ec` on `main`. Doc check and Code check both pass on `main`.
- **Local checkout:** on `main`, one commit behind `origin/main`, with the planning work uncommitted. Pull first: `git pull --ff-only` (no conflict: the merged change touches only the workflow file).
- **Kept as it is:** the extra worktree `.claude/worktrees/document-checker-improvements-c67c98`. Nothing reads into, changes or removes it.
- **Standing rule:** no Claude attribution in commits or PRs. Commit `8239c69` on `main` still carries one; it stays unless you ask for history to be rewritten.

## Next steps, in order (each needs your go-ahead)

| Step | What | Needs from you |
| --- | --- | --- |
| 1 | Commit the planning package (`docs/implementation/`, `docs/README.md`) on a branch and open a PR | Go-ahead |
| 2 | `S0-T02`: verify the toolchain: `corepack enable`, `corepack prepare pnpm@12.4.1 --activate`, a Docker-compatible runtime, then every command in `AGENTS.md` | Approval to install |
| 3 | `S0-T01`: name who records doc reviews (`--by`) | A name |
| 4 | `S0-T04` part A: write the database half of the code house rules (migrations, roles, row-level security, transactions, tests, fixtures) | Go-ahead; approve the document |
| 5 | `S0-T08` round 1: review part A and the four never-reviewed `AGENTS.md` sections | The reviewer from step 3 |
| 6 | `S0-T05`: migration runner and the two database roles, proved in CI | Go-ahead |
| 7 | `S0-T06`: synthetic fixtures and reset | Go-ahead |

When steps 2 to 7 are green, the start gate of [stage-0-preparation.md](stage-0-preparation.md) section 2 is met and `S1-F01-T01` begins.

## Decisions waiting on you (none blocks steps 1 to 7)

- **Stock harness H1 to H6** ([s1-f10-stock-harness.md](s1-f10-stock-harness.md)): needed before stock-and-posting is coded. Recommendation: test-only document driver, registered ledger callers, a test-only schema, synthetic approval types, tests only, a read-only role for checks.
- **Setup recovery** for the first feature (finished setup refused, interrupted one completed, conflicting one refused): proposed in [s1-f01-first-access.md](s1-f01-first-access.md) section 9; confirmed in `S1-F01-T01`.
- **Later, not urgent:** team size (RR-031); layouts and reader libraries (GC6-1, GC6-2) before `S1-F07`; layout confirmation by a second person (GC6-4); the group-discount question (GC7-11); whether `docs/implementation/` becomes a gated document (RR-052); before production: earlier POS selling before a switch (`DEC-067`), rollout order (SL-9), production hosting (D-1).
- **Ask Accounts and the CA early:** who approves posting-map changes (GC4-2), which holds one task of `S1-F09`.

## Facts to remember

- Nothing a KDPS person must answer blocks coding: 132 of the 192 register items block only live use.
- The stock ledger has no interface or tables design yet (RR-012), and 25 of its sections were never reviewed (RR-018).
- This machine has no `pnpm` on the PATH and no Docker; CI runs the integration tests.
- Stale report entries (GC-10, SL-22 and SL-23 in the gaps report, the alignment report's product-owner list, the data-notes line on GC-6) are listed in the [readiness register](readiness-register.md) section 9; the reports were left unchanged.

## To start the next session

Say: "Read `docs/implementation/session-handout.md`, then do step N."
