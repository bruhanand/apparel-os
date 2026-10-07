# S1-F11-T10 — Counter test page, counter run and bundle exclusion

Status: in-progress
Blocked by: none (S1-F01-T15 and T07 done). Remaining: the independent review, the evidence of spec section 8 and the product owner's acceptance
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
- Built (commit subject `S1-F11-T10:`): `apps/counter` (Vite build, base `/counter/`, entries `index.html` and `golden/index.html`, a shared selling chunk), `build-guard.ts` (fails the build on any costing module, writes `.build-report/bundled-modules.json`), `test/build-guard.test.ts` (S1-F11-AT11, fails on a deliberate costing import), `e2e/golden.spec.ts` (S1-F11-AT06: every case file through the page; pending and costing cases reported skipped, never passed; outcome count equals file count; module list has no costing module), module check rule 5 with tests, root script `pnpm test:counter`, the `counter-run` job in the code-check workflow, the `AGENTS.md` "Code workspace" entries.
- Kept minimal: no React, Dexie, Workbox or PWA yet (they arrive with the first counter screen, `S4-F11`); the counter entry only imports the selling entry point. The rule that the deployed `app` service does not serve `golden/` (offline-counter.md 5.2) is for the deployment ticket to apply to `apps/counter/dist`. code-house-rules 2 and 10.1 were already amended.
