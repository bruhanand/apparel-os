# S1-F10-T02 — Ledger operations of the story

Status: blocked
Blocked by: T01; S1-F05 (approval limits), S1-F08 (numbering, exceptions)
Feature: [S1-F10 Stock ledger with balanced posting](../spec.md)

## Build

The interface of stock-ledger section 13 for the movements and status items the story of 11.1 needs: the request, movement and status items, reads and read models, refusals (13.1 to 13.8), under the lock order of 10.3 and the rechecks of 10.4

## Expected outputs

`stock` · ledger module and its `index.ts`; tests

## Done when

Each operation posts or refuses as section 13 says; rebuild-and-compare (2.1) matches the stored balances
