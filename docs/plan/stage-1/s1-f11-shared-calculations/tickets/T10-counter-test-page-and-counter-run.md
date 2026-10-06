# S1-F11-T10 — Counter test page and counter run

Status: blocked
Blocked by: RR-015 (which package hosts the counter: the GC-8 draft proposes `apps/counter`, not yet approved); S1-F01-T19 (Playwright); T07 (done)
Feature: [S1-F11 Shared calculations](../spec.md)

## Build

In the counter build host: a test page that bundles the selling entry point as the counter does and runs every case file through `test/golden-runner.ts`; a Playwright test in Chromium that compares each result with `expected` and fails on any difference; costing cases reported as server-only; the job in CI beside the server run (12.2)

## Expected outputs

Counter test page; Playwright test; CI job

## Done when

`S1-F11-AT06` passes in the same CI run as `S1-F11-AT01` to `S1-F11-AT05`
