# Status

Updated 7 Oct 2026.

## Where we are

- **Stage 0 (preparation): done.** Tools, house rules, database roles and test data are in place.
- **Stage 1 (shared foundation): started.** Details in [stage-1/README.md](plan/stage-1/README.md); the whole stage in one [spec](plan/stage-1/spec.md).
  - **42 open tickets** (52 before `S1-F01` was built; four added and built on 7 Oct 2026).
  - **Sign-in and access control (`S1-F01`): built.** It is on the local branch `s1/f01-first-access`, with both rounds of review fixes merged in; it is not pushed and not merged into `main`. Setup, sign-in with an authenticator code, sessions and the lock screen, roles and assignments, approvals by a second person from My work, the access screens and history all work on synthetic data. Every check passes locally (build, lint, typecheck, unit, integration, module, link and format checks), and so do the five browser journeys (sign-in, no access, lock, approval, security settings).
  - **T22 to T25 are built and reviewed**, from your answers of 7 Oct 2026 (`DEC-118`): disabling a user or locking a role takes effect the same moment (T22); the no-access page, the company's time zone on screens, the enrolment QR code and the fonts (T23); worker retries, history upkeep and the two test companies set up properly (T24); and changing the security settings after setup, prepared by one person and approved by another (T25).
  - 17 of its tickets are done. Three wait on you: the lock screen's check by hand (T09), the acceptance evidence (T20), and the Demo 0 deploy (T14).
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
| 1 | The first Admin and the first approver cannot change the security settings: the setup step gives neither of them that right, so someone must first be given a role to prepare a change and another to approve it. Keep it that way, or give the first Admin the right to prepare and the first approver the right to approve (RR-402; KDPS's Owner confirms) | Changing security settings on `kdps-test` |
| 2 | Two database changes (migrations 0018 and 0020) switch dates to exact times in place. On the first `dev` update after each, sign-in stops working for the moment between the database change and the new version starting (only test data is there). Accept that short outage once, or ask for each change to be split over two updates (RR-370, RR-400) | The first `dev` update after T22 and after T25 |
| 3 | How often the system rechecks the start and end dates of role assignments. It uses one hour for now, marked as test data; approve that for test work and `dev`, or choose another (RR-390) | The worker on `dev` |
| 4 | For awareness only: the QR code library is mature but has had no release since December 2024. We will recheck it is still maintained before production (RR-380) | Nothing now; production |
| 5 | Check the lock screen and the other new screens by hand against the design language (RR-304) | `S1-F01-T09` |
| 6 | Accept `S1-F01`: let the branch be pushed so CI runs every check and the browser journeys, review the design edits it made, and watch Demo 1 on `dev` (setup, sign-in, permissions, a second person's approval) (RR-350) | `S1-F01-T20`; `S1-F01` accepted |
| 7 | Go-ahead to push the branch and merge it into `main`, which also deploys it to `dev` | CI on the branch; Demo 1 |
| 8 | Authorise the Railway `dev` setup and the deploy for Demo 0 (RR-187) | Demo 0 (`S1-F01-T14`), Demo 1 |
| 9 | On `dev`, add the `worker` service (RR-276) and set the server's new variables: the public origin, the proxy hops and the Organisation keys (RR-254) | The first deploy to `dev` |
| 10 | Set up the inbox's access and its retry settings on `dev` for the first worker deploy (RR-322) | The worker on `dev` |
| 11 | Preparing a security setting does not yet refuse test values outside the test setups; that check comes with the availability check (`S1-F04`) or sooner. Agree to that timing (RR-401) | The first setting change on `kdps-test` |
| 12 | Approve the PRD bullets for the stage 1 master picks, drafted during `S1-F02` (RR-047) | Product and party masters (`S1-F03`) |
| 13 | Name who keeps the `dev` backup key, before the restore drill (RR-236) | The restore drill (`S1-F14`) |

Before stage 1 ends you also decide the offline counter's sections 6 to 10 and approve the rest of backup and restore; the full list is [open-items.md](plan/open-items.md) section 1. KDPS's own answers are in [questions-for-kdps.md](questions-for-kdps.md); none blocks building, and almost all block only going live.
