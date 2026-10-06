# Status

Updated 7 Oct 2026.

## Where we are

- **Stage 0 (preparation): done.** Tools, house rules, database roles and test data are in place.
- **Stage 1 (shared foundation): started.** Details in [stage-1/README.md](plan/stage-1/README.md); the whole stage in one [spec](plan/stage-1/spec.md).
  - **42 open tickets** (52 before `S1-F01` was built).
  - **Sign-in and access control (`S1-F01`): built.** It is on the local branch `s1/f01-first-access`, with the review fixes merged in; it is not pushed and not merged into `main`. Setup, sign-in with an authenticator code, sessions and the lock screen, roles and assignments, approvals by a second person from My work, the access screens and history all work on synthetic data. Every check passes locally (build, lint, typecheck, unit, integration, module, link and format checks), and so do the three browser journeys (sign-in, lock, approval).
  - 13 of its tickets are done. Three wait on you: the lock screen's check by hand (T09), the acceptance evidence (T20), and the Demo 0 deploy (T14).
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
| 1 | Check the lock screen and the other new screens by hand against the design language (RR-304) | `S1-F01-T09` |
| 2 | Accept `S1-F01`: let the branch be pushed so CI runs every check and the browser journeys, review the design edits it made, and watch Demo 1 on `dev` (setup, sign-in, permissions, a second person's approval) (RR-350) | `S1-F01-T20`; `S1-F01` accepted |
| 3 | Authorise the Railway `dev` setup and the deploy for Demo 0 (RR-187) | Demo 0 (`S1-F01-T14`), Demo 1 |
| 4 | On `dev`, add the `worker` service (RR-276) and set the server's new variables: the public origin, the proxy hops and the Organisation keys (RR-254) | The first deploy to `dev` |
| 5 | Set up the inbox's access and its retry settings on `dev` for the first worker deploy (RR-322) | The worker on `dev` |
| 6 | Approve or change the proposed worker settings for synthetic work: how often it checks for jobs, retries and delays (RR-270) | The worker on `dev` |
| 7 | Choose how the audit partitions are created on a schedule between deploys on Railway (RR-240) | `kdps-test` first deploy |
| 8 | Decide what to do with the seed's two Organisations, which nobody can sign in to: set up others with the setup step, move the seed onto it, or drop its Organisation part (RR-330) | The first sign-in on `dev` |
| 9 | Confirm that a person whose first persona has no granted screen, or who has no persona, lands on My work (RR-260) | The web shell, as built |
| 10 | Choose how the app's fonts are bundled: font files committed to the repository, or a package (RR-262) | The screens' check by hand |
| 11 | Decide whether to show a QR code on the enrolment screen, and how; typing the key works meanwhile (RR-280) | Before KDPS users enrol |
| 12 | Decide whether screens show times in the device's time zone (as built) or the Organisation's (RR-310) | Before KDPS users read history |
| 13 | Decide whether disabling a user must take effect the same day; today a user approved today can be disabled only from tomorrow (RR-321) | Live use of stage 1 |
| 14 | Confirm that sign-in stays unavailable, naming what is missing, when the setup step leaves out the sign-in settings (throttling, office session limits), which have no default (house rule 12.14, RR-334) | The settings screens (`S1-F04`) |
| 15 | Decide whether the role joins the first locking step, so a role change and a command relying on that role cannot pass each other (RR-360) | Approval authority (`S1-F05`), stock ledger (`S1-F10`) |
| 16 | Approve the PRD bullets for the stage 1 master picks, drafted during `S1-F02` (RR-047) | Product and party masters (`S1-F03`) |
| 17 | Name who keeps the `dev` backup key, before the restore drill (RR-236) | The restore drill (`S1-F14`) |

Before stage 1 ends you also decide the offline counter's sections 6 to 10 and approve the rest of backup and restore; the full list is [open-items.md](plan/open-items.md) section 1. KDPS's own answers are in [questions-for-kdps.md](questions-for-kdps.md); none blocks building, and almost all block only going live.
