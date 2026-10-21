# S2-F01-T01 — Remove the Agreement's default model for new bookings

Status: ready-for-agent
Blocked by: —
Feature: [Stage 2 first version](../../spec.md)

## Build

- Remove the agreement version's term "default model for new bookings": every booking takes the brand Agreement's commercial model (`DEC-129`, `POL-01.02`; RR-545; [structure-and-masters.md](../../../../design/masters/structure-and-masters.md) 5.2).
- Take it out of the stored terms shape, the shared schema, the Agreement screen and their tests, with the shape change existing versions need; every other term reads back unchanged.
- Bring structure-and-masters 5.2 "As built" in line in the same change.

## Expected outputs

The shape change (a migration if the stored shape changes), schema and OpenAPI, the Agreement screen, tests.

## Done when

No route or screen carries the default model and no new version can store it; versions already stored are never rewritten (approved records stay as stored, code-house-rules part A): they keep the term as stored, it is ignored when they are read, and every other term reads back unchanged; every check passes; RR-545 closed in open-items.

## Comments

- 21 Oct 2026: the builder's first version rewrote the stored synthetic agreement versions in a migration. Reworked to keep approved versions untouched, the recommended option put to the product owner; the product owner may still choose the one-off rewrite instead.
