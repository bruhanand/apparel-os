# S1-F11-T10 — Counter test page, counter run and bundle exclusion

Status: blocked
Blocked by: S1-F01-T15 (Playwright); T07 (done)
Feature: [S1-F11 Shared calculations](../spec.md)

## Build

- In the counter app, `apps/counter` (RR-015): a test page that bundles the selling entry point as the counter does, with `test/golden-runner.ts` bundled into it, and runs every case file through that runner; a Playwright test in Chromium, in `apps/counter/e2e/`, that compares each result with `expected` and fails on any difference; costing cases reported as server-only; the job in CI beside the server run (12.2).
- A build check that fails if the counter bundle holds the costing entry point (2.3).
- The independent review of `AGENTS.md` "How we work"; the evidence of [spec](../spec.md) section 8; `AGENTS.md` "Current state" and [STATUS.md](../../../../STATUS.md) brought up to date.

## Expected outputs

Counter test page; Playwright test; CI job; build check; review record; evidence

## Done when

`S1-F11-AT06` passes in the same CI run as `S1-F11-AT01` to `S1-F11-AT05`; `S1-F11-AT11` passes, and a deliberate costing import fails it; section 8 complete; the product owner accepts

## Notes

- RR-015 was approved by the product owner on 6 Oct 2026: the counter app lives in `apps/counter`, its browser tests may sit in `apps/counter/e2e/`, and the golden runner is bundled into the page. GC-8 5.5 ([offline-counter.md](../../../../design/pos/offline-counter.md)) is to be aligned with this.
- Absorbs S1-F11-T11 (bundle exclusion on the counter bundle) and S1-F11-T12 (review and acceptance) on 6 Oct 2026 (product owner).
- Partly done (from T12): the server half was reviewed in three code-review rounds before `8e71547`. The review and acceptance of the counter half remain.
