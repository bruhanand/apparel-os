# S1-F10-T06 — Scenarios G2 to G13 with G10a

Status: blocked
Blocked by: T04; S1-F08-T02
Feature: [S1-F10 Stock ledger with balanced posting](../spec.md)

## Build

The further scenarios of stock-ledger 11.8, with G10a only: no rounding rule set, an outflow that does not divide into whole paise is refused (7.10); an emptying outflow takes all remaining value (7.3). G10b waits for the real rounding rule (RR-124)

## Expected outputs

Scenario files; tests

## Done when

G2 to G13 and G10a pass; the 11.7 checks hold after every step ([spec](../spec.md) 3.5, 3.7)
