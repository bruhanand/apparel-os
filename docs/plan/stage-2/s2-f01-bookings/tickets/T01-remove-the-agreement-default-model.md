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

No route, screen or stored version carries the default model; existing synthetic agreement versions read back with every other term unchanged; every check passes; RR-545 closed in open-items.

## Notes

- The shape change is a migration (provisional number `0090` in the Organisation set; the merger renumbers it): `agreement-terms/2` is `agreement-terms/1` without the term, and every stored version was brought to it, approved ones included, with every other term unchanged (structure-and-masters 5.2 "The default model retired, as built").
- Tests: the routes refuse a draft naming the term and no read carries it (`parties-routes.int.test.ts`); versions stored in `/1` before the migration read back through the parties interface with every other term as stored (`agreement-terms-shape.int.test.ts`); the Agreement form and terms (`agreement.test.tsx`); the agreement journey, Booking preparing and a different person approving from My work (`agreement.spec.ts`, with its synthetic supplier and two people in the journeys' world).
