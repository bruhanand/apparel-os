# S1-F01-T14 — Web shell

Status: blocked
Blocked by: T05
Feature: [S1-F01 First access](../spec.md)

## Build

Router, data layer, forms with Zod, components themed from the reviewed design-language tokens, back-office shell, environment banner, message catalogue for every screen string, the lock overlay that keeps unsaved input without restricted fields, the standard empty, loading, error and unavailable states (design-language 6, 10.13, 10.17)

## Expected outputs

`apps/web` shell

## Done when

Builds and typechecks; every string comes from the catalogue; the unavailable state names what is missing

## Notes

- Before building: check the design-language tokens, shells and components these screens use against [design-language.md](../../../../design/ui/design-language.md).
- RR-193: one environment variable names the environment for the seed and the screen banner.
- RR-212: P-ADM lands on Setup › Policy readiness, which the first Admin's setup role does not grant; settle the landing page or its unavailable state.
- RR-030: proposed state names in design-language 7.
