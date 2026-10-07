# Status

Updated 7 Oct 2026.

## Where we are

- **Stage 0 (preparation): done.** Tools, house rules, database roles and test data are in place.
- **Stage 1 (shared foundation): started.** Details in [stage-1/README.md](plan/stage-1/README.md); the whole stage in one [spec](plan/stage-1/spec.md).
  - **42 open tickets** (52 before `S1-F01` was built; six added and built on 7 Oct 2026).
  - **Sign-in and access control (`S1-F01`): built.** It is on the branch `s1/f01-first-access`, with both rounds of review fixes merged in; the branch is pushed to GitHub so CI can run, but it is not merged into `main`. Setup, sign-in with an authenticator code, sessions and the lock screen, roles and assignments, approvals by a second person from My work, the access screens and history all work on synthetic data. Every check passes locally (build, lint, typecheck, unit, integration, module, link and format checks), and so do the six browser journeys (sign-in, no access, lock, approval, security settings, one address).
  - **T22 to T25 are built and reviewed**, from your answers of 7 Oct 2026 (`DEC-118`): disabling a user or locking a role takes effect the same moment (T22); the no-access page, the company's time zone on screens, the enrolment QR code and the fonts (T23); worker retries, history upkeep and the two test companies set up properly (T24); and changing the security settings after setup, prepared by one person and approved by another (T25).
  - **T26 and T27 are built and reviewed.** From your answers (`DEC-120`): the starting Admin can now prepare a security settings change and the starting approver can approve it, never both (T26); and the dates on a role assignment are checked at every request, so an expired one stops working at once, without waiting for a background job (T26). The server now serves the screens and the API at one address, as the `dev` setup needs (T27); the counter's address waits for the counter app.
  - **Railway `dev` is set up, with no code deployed.** The project `apparel-os` has the `dev` environment only: the database (PostgreSQL 17, matching the tests), the `app` and `worker` services with their settings, and the file bucket. Merging into `main` deploys the code to it for the first time.
  - 19 of its tickets are done. Three wait on you: the lock screen's check by hand (T09), the acceptance evidence (T20), and the Demo 0 deploy (T14).
  - **Shared calculations (`S1-F11`):** the server half is done; 38 test cases pass. The counter half can now start, since the browser tests arrived with `S1-F01-T15`.
  - **Moved to stage 2:** the sample layouts, the other file readers and the 10,000-line PT test, now `S2-F13` (`DEC-115`).
- **How we work.** Building runs through the skills (`/implement`, `/implement-spec`, `/tdd`, `/code-review`); see "How we work" in `AGENTS.md`.

## What's next

1. The counter run of shared calculations (`S1-F11-T10`).
2. Stored files and evidence attachments (`S1-F06-T05`).
3. Stock ledger part 1, stock quantities and movements (`S1-F10`).
4. Then organisation structure (`S1-F02`) and the rest, in the order of the [stage spec](plan/stage-1/spec.md).

## Waiting on you

| # | What | Unblocks |
| --- | --- | --- |
| 1 | Check the lock screen and the other new screens by hand against the design language (RR-304). This is the last thing before the merge | `S1-F01-T09`; the merge |
| 2 | Go-ahead to merge the branch into `main`. The merge also deploys it to `dev` for the first time; then the database is set up there and the two test companies are created | Demo 0 (`S1-F01-T14`), Demo 1 |
| 3 | Accept `S1-F01`: look at the CI run of the pushed branch, review the design edits it made, and watch Demo 1 on `dev` (setup, sign-in, permissions, a second person's approval) (RR-350) | `S1-F01-T20`; `S1-F01` accepted |
| 4 | Preparing a security setting does not yet refuse test values outside the test setups; that check comes with the availability check (`S1-F04`) or sooner. Agree to that timing (RR-401) | The first setting change on `kdps-test` |
| 5 | For awareness only: the QR code library is mature but has had no release since December 2024. We will recheck it is still maintained before production (RR-380) | Nothing now; production |
| 6 | Approve the PRD bullets for the stage 1 master picks, drafted during `S1-F02` (RR-047) | Product and party masters (`S1-F03`) |
| 7 | Name who keeps the `dev` backup key, before the restore drill (RR-236) | The restore drill (`S1-F14`) |

Before stage 1 ends you also decide the offline counter's sections 6 to 10 and approve the rest of backup and restore; the full list is [open-items.md](plan/open-items.md) section 1. KDPS's own answers are in [questions-for-kdps.md](questions-for-kdps.md); none blocks building, and almost all block only going live.
