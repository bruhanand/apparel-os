# Session handout — 5 Oct 2026

> **Not ranked.** A note to carry into the next session. It decides nothing; the [implementation plan](index.md) and the documents above it win.

## Where things stand

- **Planning package committed on `main`** as `d56cbd7`: `docs/implementation/` (index, readiness register, stage 0, stages and features, `S1-F01` in full, the proposed stock harness, requirement coverage, exit checklists, this handout) and one new row in `docs/README.md`. Doc check passed on it in CI.
- **S0-T04 part A approved by the product owner and committed on branch `s0-t04-house-rules-part-a`, not pushed or merged.** [code-house-rules.md](../design/platform/code-house-rules.md) part A was reviewed in DR-1 round 1 by independent AI reviewers over five passes: 39 findings, each verified and fixed. They are recorded as "Claude (AI review, independent reviewer, DR-1 round 1)", and none is attributed to Anand Kumar. The fixes also touched `AGENTS.md` (Document order, Planned architecture), stock-ledger 10.3 and 10.4, module-map 4.6 and 6.1, access-and-approvals 7.1, 9.7 and 13, structure-and-masters 2.2, 3.8, 5.5, 6 and 9, numbering-and-audit 3.2, books-and-posting 4.5, 5.4, 9.1, 13, 15 and 17 (new GC4-4), and shared-calculations 3.1, 10.1 and 10.3. The approval is recorded separately in [stage-0-preparation.md](stage-0-preparation.md) section 2. CH-1 to CH-7 and GC4-4 stay OPEN at their gates. The product owner then accepted independent AI reviews for DR-1, recorded under the AI reviewer's own name ([index.md](index.md) section 9), so `S0-T08` round 1 is done and start-gate conditions 3 and 6 are met; `AGENTS.md` and the house rules' Status line now call part A approved.
- **S0-T03 done and merged.** The Doc check workflow installs the pinned pnpm (12.4.1) before `setup-node`. [PR #1](https://github.com/bruhanand/apparel-os/pull/1), merged as `b6395ec` on `main`. Doc check and Code check both pass on `main`.
- **S0-T02 done.** pnpm 12.4.1 is active through corepack and Docker Desktop runs; every command in `AGENTS.md` exits 0 on this machine, including the integration test against a real PostgreSQL container. The verification note is in [stage-0-preparation.md](stage-0-preparation.md) section 1. Start-gate conditions 1 and 2 are met.
- **S0-T01 done.** Anand Kumar is a named reviewer for DR-1 and later batches (`--by "Anand Kumar"`); independent AI reviewers recorded under their own name are also accepted, with the product owner's approval of each batch ([index.md](index.md) section 9).
- **Local checkout:** on branch `s0-t04-house-rules-part-a`, one commit ahead of `main`, not pushed.
- **Kept as it is:** the extra worktree `.claude/worktrees/document-checker-improvements-c67c98`. Nothing reads into, changes or removes it.
- **Standing rule:** no Claude attribution in commits or PRs. Commit `8239c69` on `main` still carries one; it stays unless you ask for history to be rewritten.

## Next steps, in order (each needs your go-ahead)

| Step | What | Needs from you |
| --- | --- | --- |
| 1 | Push the branch and merge it into `main` once the Doc check and Code check pass | Go-ahead |
| 2 | `S0-T05`: migration runner and the two database roles, proved in CI | Go-ahead |
| 3 | `S0-T06`: synthetic fixtures and reset | Go-ahead |

When steps 1 to 3 are green, the start gate of [stage-0-preparation.md](stage-0-preparation.md) section 2 is met and `S1-F01-T01` begins.

## Decisions waiting on you (none blocks steps 1 to 4)

- **Stock harness H1 to H6** ([s1-f10-stock-harness.md](s1-f10-stock-harness.md)): needed before stock-and-posting is coded. Recommendation: test-only document driver, registered ledger callers, a test-only schema, synthetic approval types, tests only, a read-only role for checks.
- **Setup recovery** for the first feature (finished setup refused, interrupted one completed, conflicting one refused): proposed in [s1-f01-first-access.md](s1-f01-first-access.md) section 9; confirmed in `S1-F01-T01`.
- **Later, not urgent:** team size (RR-031); layouts and reader libraries (GC6-1, GC6-2) before `S1-F07`; layout confirmation by a second person (GC6-4); the group-discount question (GC7-11); whether `docs/implementation/` becomes a gated document (RR-052); before production: earlier POS selling before a switch (`DEC-067`), rollout order (SL-9), production hosting (D-1).
- **Ask Accounts and the CA early:** who approves posting-map changes (GC4-2), which holds one task of `S1-F09`.

## Facts to remember

- Nothing a KDPS person must answer blocks coding: 132 of the 192 register items block only live use.
- The stock ledger has no interface or tables design yet (RR-012), and 25 of its sections were never reviewed (RR-018).
- This machine now runs every check locally, integration tests included; start Docker Desktop before `pnpm test:integration`.
- Stale report entries (GC-10, SL-22 and SL-23 in the gaps report, the alignment report's product-owner list, the data-notes line on GC-6) are listed in the [readiness register](readiness-register.md) section 9; the reports were left unchanged.

## To start the next session

Say: "Read `docs/implementation/session-handout.md`, then do step N."
