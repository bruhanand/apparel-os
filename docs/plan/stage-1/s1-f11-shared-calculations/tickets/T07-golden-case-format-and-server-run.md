# S1-F11-T07 — Golden-case format and server run

Status: done
Blocked by: —
Feature: [S1-F11 Shared calculations](../spec.md)

## Build

One JSON file per case in `golden/` in the format of 12.1, with its `runs`, refusal lists, `$pricedBill`, `$billReference` and `$billLine` pointers and `pending`; a pure runner the counter page can share; the Vitest suite that loads every file and runs it through `@apparel-os/calculations` and `@apparel-os/calculations/costing` imported by package name, as the server imports them, comparing whole results, versions included, exactly (12.2); pending cases reported as skipped with their reason, never as passed

## Expected outputs

`golden/`, `test/golden-runner.ts`, `test/golden.test.ts`; the package's `turbo.json` builds it before its tests

## Done when

Every case of 12.4 present, labelled synthetic, covering its IDs; all pass or are pending with a reason

## Notes

- Done: built in `87847ea`, merged in `8e71547`, 6 Oct 2026.
- 38 golden cases in `packages/calculations/golden/` pass on the server.
