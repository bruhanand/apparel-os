# Session handout — 5 Oct 2026

> **Not ranked.** A note to carry into the next session. It decides nothing; the [implementation plan](index.md) and the documents above it win.

## Where things stand

- **Planning package committed on `main`** as `d56cbd7`: `docs/implementation/` (index, readiness register, stage 0, stages and features, `S1-F01` in full, the proposed stock harness, requirement coverage, exit checklists, this handout) and one new row in `docs/README.md`. Doc check passed on it in CI.
- **New default for code tasks, merged** ([PR #3](https://github.com/bruhanand/apparel-os/pull/3), squash-merged into `main`; you approved its review on 5 Oct 2026). `AGENTS.md` gains "Completing a code task": build; independent review against the task, requirements, designs, house rules and `AGENTS.md`; triage, with every rejection seen by the reviewer and disputes going to you; recheck until no blocking finding remains; final checks on the final revision, with follow-ups recorded in the readiness register. It applies only to tasks that change code; document-only tasks keep the document gate. The section itself passed the document gate with an independent AI reviewer ("AGENTS task completion"). `S0-T06` is the first task to follow it.
- **S0-T05 done and merged** ([PR #2](https://github.com/bruhanand/apparel-os/pull/2), squash-merged into `main`). Migration runner, the two database roles, `pnpm migrate` (directory-only until `S1-F01-T02`), the Railway runbook and 33 integration tests; your three review issues were fixed before the merge (directory-only label with a command test, role and owner check, strict set reader). You approved the DR-1 S0-T05 review of `AGENTS.md` "Code workspace". Start-gate condition 4 is met ([stage-0-preparation.md](stage-0-preparation.md) section 2). `doc-check.yml` no longer caches pnpm in `setup-node`. No Railway service was changed.
- **S0-T04 part A approved and merged on `main`** (`7567e90`, `7455d75`). [code-house-rules.md](../design/platform/code-house-rules.md) part A was reviewed in DR-1 round 1 by independent AI reviewers and approved by you ([stage-0-preparation.md](stage-0-preparation.md) section 2); `S0-T08` round 1 is done and start-gate conditions 3 and 6 are met. CH-1 to CH-7 and GC4-4 stay OPEN at their gates.
- **S0-T03 done and merged.** The Doc check workflow installs the pinned pnpm (12.4.1) before `setup-node`. [PR #1](https://github.com/bruhanand/apparel-os/pull/1), merged as `b6395ec` on `main`. Doc check and Code check both pass on `main`.
- **S0-T02 done.** pnpm 12.4.1 is active through corepack and Docker Desktop runs; every command in `AGENTS.md` exits 0 on this machine, including the integration test against a real PostgreSQL container. The verification note is in [stage-0-preparation.md](stage-0-preparation.md) section 1. Start-gate conditions 1 and 2 are met.
- **S0-T01 done.** Anand Kumar is a named reviewer for DR-1 and later batches (`--by "Anand Kumar"`); independent AI reviewers recorded under their own name are also accepted, with the product owner's approval of each batch ([index.md](index.md) section 9).
- **Local checkout:** on `main` after the merge. The local branches `s0-t04-house-rules-part-a`, `s0-t05-migration-runner` and `agents-task-completion` are merged in content and can be deleted when you say so.
- **Kept as it is:** the extra worktree `.claude/worktrees/document-checker-improvements-c67c98`. Nothing reads into, changes or removes it.
- **Standing rule:** no Claude attribution in commits or PRs. Commit `8239c69` on `main` still carries one; it stays unless you ask for history to be rewritten.

## Next steps, in order (each needs your go-ahead)

| Step | What | Needs from you |
| --- | --- | --- |
| 1 | `S0-T06`: synthetic fixtures and reset (template database cloned per test file, two synthetic Organisations, labelling, local seed) | Go-ahead |
| 2 | Apply the roles runbook `apps/server/db/railway-roles-runbook.md` on Railway `dev`, checking CH-2 on the way; needed before the first deploy that migrates, not before `S1-F01-T01` | You run it |

When step 1 is green, the start gate of [stage-0-preparation.md](stage-0-preparation.md) section 2 is met and `S1-F01-T01` begins.

## Decisions waiting on you (none blocks steps 1 and 2)

- **Stock harness H1 to H6** ([s1-f10-stock-harness.md](s1-f10-stock-harness.md)): needed before stock-and-posting is coded. Recommendation: test-only document driver, registered ledger callers, a test-only schema, synthetic approval types, tests only, a read-only role for checks.
- **Setup recovery** for the first feature (finished setup refused, interrupted one completed, conflicting one refused): proposed in [s1-f01-first-access.md](s1-f01-first-access.md) section 9; confirmed in `S1-F01-T01`.
- **Catalogue test (house rules 10.4):** no task names it yet; proposed for the first `S1-F01` task that adds a business table.
- **Later, not urgent:** team size (RR-031); layouts and reader libraries (GC6-1, GC6-2) before `S1-F07`; layout confirmation by a second person (GC6-4); the group-discount question (GC7-11); whether `docs/implementation/` becomes a gated document (RR-052); before production: earlier POS selling before a switch (`DEC-067`), rollout order (SL-9), production hosting (D-1).
- **Ask Accounts and the CA early:** who approves posting-map changes (GC4-2), which holds one task of `S1-F09`.

## Facts to remember

- Nothing a KDPS person must answer blocks coding: 132 of the 192 register items block only live use.
- The stock ledger has no interface or tables design yet (RR-012), and 25 of its sections were never reviewed (RR-018).
- This machine now runs every check locally, integration tests included; start Docker Desktop before `pnpm test:integration`.
- Stale report entries (GC-10, SL-22 and SL-23 in the gaps report, the alignment report's product-owner list, the data-notes line on GC-6) are listed in the [readiness register](readiness-register.md) section 9; the reports were left unchanged.

## To start the next session

Say: "Read `docs/implementation/session-handout.md`, then do step N."
