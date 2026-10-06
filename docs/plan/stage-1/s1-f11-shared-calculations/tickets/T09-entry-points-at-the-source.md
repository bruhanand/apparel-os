# S1-F11-T09 — Entry points at the source

Status: done
Blocked by: —
Feature: [S1-F11 Shared calculations](../spec.md)

## Build

The proof, short of a bundle, that the selling entry point never reaches costing and that the package reads no clock, randomness or environment (2.1, 2.3); a test that runs the module check on a scratch workspace and shows rule 4 fails on a selling import of costing or of another package

## Expected outputs

`test/entry-points.test.ts`, `test/module-check.test.ts`; module check rule 4

## Done when

`S1-F11-AT10` passes

## Notes

- Done: built in `87847ea`, merged in `8e71547`, 6 Oct 2026.
