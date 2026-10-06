# S1-F11-T01 — Package and numbers

Status: done
Blocked by: —
Feature: [S1-F11 Shared calculations](../spec.md)

## Build

The workspace package `@apparel-os/calculations` with its two entry points (`.` and `./costing`); exact fractions, decimal strings, the four rounding modes and named rounding steps; amounts in and out as `Paise`; results and refusal codes; the canonical serialisation; rule 4 of the module check (only `@apparel-os/domain`, selling never imports costing); the `AGENTS.md` "Code workspace" row (GC-7 2.1, 3, 5.10)

## Expected outputs

`packages/calculations`; `tools/module-check` rule 4

## Done when

Build, lint, typecheck, module check and format pass; number tests pass

## Notes

- Done: built in `87847ea`, merged in `8e71547`, 6 Oct 2026.
