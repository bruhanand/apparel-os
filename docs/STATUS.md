# Status

Updated 8 Oct 2026.

## Where we are

- **Stage 0 (preparation): done.** Tools, house rules, database roles and test data are in place.
- **Stage 1 (shared foundation): started.** Details in [stage-1/README.md](plan/stage-1/README.md); the whole stage in one [spec](plan/stage-1/spec.md).
  - **39 open tickets** (52 before `S1-F01` was built; thirteen added and built on 7 Oct 2026).
  - **Sign-in and access control (`S1-F01`): done and accepted (7 Oct 2026).** It is on the branch `s1/f01-first-access`, with both rounds of review fixes merged in; it was merged into `main` and deployed to `dev` on 7 Oct 2026, on your go-ahead. Setup, sign-in with an authenticator code, sessions and the lock screen, roles and assignments, approvals by a second person from My work, the access screens and history all work on synthetic data. Every check passes locally (build, lint, typecheck, unit, integration, module, link and format checks), and so do the six browser journeys (sign-in, no access, lock, approval, security settings, one address). The hands-on test ([test-report.md](plan/stage-1/s1-f01-first-access/test-report.md)) passed all 32 cases; its seven findings were fixed as `S1-F01-T29` to `T35`, merged into `main` and deployed to `dev`. You watched Demo 1 on `dev` and accepted `S1-F01` on 7 Oct 2026.
  - **T22 to T25 are built and reviewed**, from your answers of 7 Oct 2026 (`DEC-118`): disabling a user or locking a role takes effect the same moment (T22); the no-access page, the company's time zone on screens, the enrolment QR code and the fonts (T23); worker retries, history upkeep and the two test companies set up properly (T24); and changing the security settings after setup, prepared by one person and approved by another (T25).
  - **T26 and T27 are built and reviewed.** From your answers (`DEC-120`): the starting Admin can now prepare a security settings change and the starting approver can approve it, never both (T26); and the dates on a role assignment are checked at every request, so an expired one stops working at once, without waiting for a background job (T26). The server now serves the screens and the API at one address, as the `dev` setup needs (T27); the counter's address waits for the counter app.
  - **Railway `dev` is running the code.** Since 7 Oct 2026 every push to `main` deploys `app` and `worker` there. The web app is at https://app-dev-53bf.up.railway.app/ with the `dev` banner, the database is set up, and the two test companies (`SYN-ORG-A`, `SYN-ORG-B`) exist, each with its own first Admin and first approver. Their temporary sign-in details are only on your machine, in `SYNTHETIC-dev-first-users.secrets.json` (never committed).
  - All its tickets are done, Demo 0 on `dev` (T14) included. You approved the screens from their screenshots on 7 Oct 2026, and CI is green (run 37603828723, browser journeys included). T20 closed with your acceptance on 7 Oct 2026.
  - **Shared calculations (`S1-F11`):** done and accepted on 8 Oct 2026: 38 test cases pass on the server and in Chromium on the counter build, the counter build refuses costing code, and CI is green (`S1-F11-T10`; evidence in the feature folder).
  - **Stored files (`S1-F06-T05`): built and reviewed, 8 Oct 2026**, merged into `main` and deployed to `dev` on 8 Oct 2026, on your go-ahead (CI run 37759003713 green, browser journeys included). Evidence files (PDF, JPEG, PNG, up to 10 MiB) are checked by their content, encrypted with the company's key, kept once and never overwritten or deleted, attached to records and served only to people allowed to see them. Every check passes locally. Your two answers of 8 Oct 2026 are built and reviewed as `S1-F06-T06`: a restricted file download asks for a fresh authenticator code, and original file names and references are encrypted (RR-432, RR-433). File storage on `dev` waits on your go-ahead for the bucket (RR-187). The other `S1-F06` tickets wait on organisation structure, masters, policy readiness and number series.
  - **Moved to stage 2:** the sample layouts, the other file readers and the 10,000-line PT test, now `S2-F13` (`DEC-115`).
- **How we work.** Building runs through the skills (`/implement`, `/implement-spec`, `/tdd`, `/code-review`); see "How we work" in `AGENTS.md`.

## What's next

1. Stock ledger part 1, stock quantities and movements (`S1-F10`).
2. Then organisation structure (`S1-F02`) and the rest, in the order of the [stage spec](plan/stage-1/spec.md).

## Waiting on you

| # | What | Unblocks |
| --- | --- | --- |
| 1 | Done 7 Oct 2026: merged into `main` and deployed to `dev`, with the two test companies created | — |
| 2 | Done 7 Oct 2026: Demo 1 watched on `dev` and `S1-F01` accepted (RR-350) | — |
| 3 | Preparing a security setting does not yet refuse test values outside the test setups; that check comes with the availability check (`S1-F04`) or sooner. Agree to that timing (RR-401) | The first setting change on `kdps-test` |
| 4 | For awareness only: the QR code library is mature but has had no release since December 2024. We will recheck it is still maintained before production (RR-380) | Nothing now; production |
| 5 | Approve the PRD bullets for the stage 1 master picks, drafted during `S1-F02` (RR-047) | Product and party masters (`S1-F03`) |
| 6 | Name who keeps the `dev` backup key, before the restore drill (RR-236) | The restore drill (`S1-F14`) |

Before stage 1 ends you also decide the offline counter's sections 6 to 10 and approve the rest of backup and restore; the full list is [open-items.md](plan/open-items.md) section 1. KDPS's own answers are in [questions-for-kdps.md](questions-for-kdps.md); none blocks building, and almost all block only going live.
