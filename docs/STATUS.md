# Status

Updated 6 Oct 2026.

## Where we are

- **Stage 0 (preparation): done.** Tools, house rules, database roles and test data are in place.
- **Stage 1 (shared foundation): started.** Details in [stage-1/README.md](plan/stage-1/README.md); the whole stage in one [spec](plan/stage-1/spec.md).
  - **52 open tickets.** The remaining work was regrouped into 50 vertical slices, plus two new ones: stored files and evidence attachments (`S1-F06-T05`) and live updates with the failed-jobs view (`S1-F08-T04`).
  - **Sign-in and access control (`S1-F01`):** 3 tickets done. Ticket 4 (idempotency and API conventions) is half-built on a side branch with no tests. Ticket 7 (audit) is ready to start.
  - **Shared calculations (`S1-F11`):** the server half is done; 38 test cases pass. The counter half waits for the first browser tests (`S1-F01-T15`).
  - **Moved to stage 2:** the sample layouts, the other file readers and the 10,000-line PT test, now `S2-F13` (`DEC-115`).
- **Today's decisions are written in.** Your answers to the stage 1 questions are `DEC-116`. The designs now carry them: the stock ledger is approved, the offline counter's stage 1 sections are approved, and two backup choices are approved.
- **How we work.** Building now runs through the skills (`/implement`, `/implement-spec`, `/tdd`, `/code-review`); see "How we work" in `AGENTS.md`.

## What's next

1. `S1-F01-T04` (idempotency and API conventions), from the half-built branch.
2. `S1-F01-T07` (audit and access records).
3. Then sign-in (T08), the web shell (T14, shown on `dev` as Demo 0) and the sign-in screens (T15). The full order is in the [stage spec](plan/stage-1/spec.md).

## Waiting on you

| # | What | Unblocks |
| --- | --- | --- |
| 1 | Approve the PRD bullets for the stage 1 master picks, drafted during `S1-F02` (RR-047) | Product and party masters (`S1-F03`) |
| 2 | Authorise the Railway `dev` setup and the deploy for Demo 0 (RR-187) | Demo 0 |
| 3 | Name who keeps the `dev` backup key, before the restore drill (RR-236) | The restore drill (`S1-F14`) |
| 4 | Merge the `docs/stage-1-spec` branch | Building from these documents on `main` |

Before stage 1 ends you also decide the offline counter's sections 6 to 10 and approve the rest of backup and restore; the full list is [open-items.md](plan/open-items.md) section 1. KDPS's own answers are in [questions-for-kdps.md](questions-for-kdps.md); none blocks building, and almost all block only going live.
