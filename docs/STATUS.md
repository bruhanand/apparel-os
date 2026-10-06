# Status

Updated 6 Oct 2026.

## Where we are

- **Stage 0 (preparation): done.** Tools, house rules, database roles and test data are in place.
- **Stage 1 (shared foundation): started, about a tenth built.** Details in [stage-1/README.md](plan/stage-1/README.md).
  - **First access (`S1-F01`):** 3 of 21 tickets done. Ticket 4 (idempotency) is half-built on a side branch with no tests. Ticket 7 (audit) is ready to start.
  - **Shared calculations (`S1-F11`):** the server half is done; 38 test cases pass. The counter half waits for item 2 below.
  - **Stock ledger (`S1-F10`):** designed and reviewed, waiting for your approval (item 1 below).
  - **The other 11 features:** not started.
- **The documents were reorganised on 6 Oct 2026.** The doc checker and its review gate are gone. A small link check replaces it, and the plan now lives in [plan/](plan/roadmap.md).
- **On GitHub.** The stage 1 work and this reorganisation were merged into `main` and pushed on 6 Oct 2026.

## What's next

1. `S1-F01` ticket 4 (idempotency helper), from the half-built branch.
2. `S1-F01` ticket 7 (audit records).
3. Then tickets 5, 8, 6, 11, 9, 10, 12 and 13, and the screens (14 to 18) once their APIs exist.

## Waiting on you

| # | What | Unblocks |
| --- | --- | --- |
| 1 | Approve the stock ledger design choices (RR-012) | Stock with balanced posting (`S1-F10`) |
| 2 | Approve the two draft designs: [offline counter](design/pos/offline-counter.md) (including where the counter app lives) and [backup and restore](design/platform/backup-and-restore.md) (RR-014, RR-015, RR-010) | The counter half of `S1-F11`; `S1-F12`; `S1-F14` |
| 3 | Set up and check Railway `dev`, and pick its starting database pool size (RR-187, RR-216) | The first demo on `dev` |
| 4 | Ten product questions, such as how the first Admin recovers a lost login (RR-206) and a policy on cost methods worded wider than the PRD | See [open-items.md](plan/open-items.md) section 1 |

KDPS's own answers are in [questions-for-kdps.md](questions-for-kdps.md). None of them blocks building stage 1; almost all of them block only going live.

## Where things are

- [docs/README.md](README.md): the folder map and what each code means (RR-, GC-, SL- …).
- [plan/roadmap.md](plan/roadmap.md): all six stages and their features.
- [plan/stage-1/](plan/stage-1/README.md): the current stage, one folder per feature with its spec and tickets.
