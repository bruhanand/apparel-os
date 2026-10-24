# S2-F01-T01 — Remove the Agreement's default model for new bookings

Status: done
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

## Notes

- The shape change is a migration, `0087` in the Organisation set (the merger fixes any collision): new versions are written in `agreement-terms/2`, `agreement-terms/1` without the term, and a check refuses `/1` and the term for every row written from then on. Versions already stored in `/1` are kept as stored, approved ones included, and the versions guard is never switched off; reading one drops the term, every other term unchanged (structure-and-masters 5.2 "The default model retired, as built").
- Tests: the routes refuse a draft naming the term and no read carries it (`parties-routes.int.test.ts`); versions stored in `/1` before the migration are untouched in storage and read back through the parties interface without the term, every other term as stored, and a new version with the term is refused (`agreement-terms-shape.int.test.ts`); the Agreement form and terms (`agreement.test.tsx`); the agreement journey, Booking preparing and a different person approving from My work (`agreement.spec.ts`, with its synthetic supplier and two people in the journeys' world).
- Code review 1 of stage 2 (21 Oct 2026): for one deploy a draft may still name the default model; it is accepted and ignored, never stored and never answered, so a client of the earlier deploy still saves (code-house-rules 12.1 "Compatible changes"; structure-and-masters 5.2). `parties-routes.int.test.ts` now proves that, in place of the refusal. Its removal is RR-552 (open-items section 4).
- Beyond the ticket: the agreement browser journey `apps/web/e2e/agreement.spec.ts`, Booking preparing an agreement with a supplier and a different person approving it from My work, and its two SYNTHETIC journey users in `apps/server/test/browser/serve.ts` (`BROWSER-AGREEMENT-PREPARER` and the approver) with their persona grants.
- Closed 21 Oct 2026 on `s2/goods-in-first-version`: commits `9f6ac00` and `3800238` (stored versions kept untouched), merged as `3d2095b`; reviewed with `/code-review`, its fixes merged as `aa55bb2`; no blocking finding left.
