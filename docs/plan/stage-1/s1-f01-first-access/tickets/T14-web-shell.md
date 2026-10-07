# S1-F01-T14 — Web shell

Status: done
Blocked by: none
Feature: [S1-F01 First access](../spec.md)

## Build

Router, data layer, forms with Zod, components themed from the reviewed design-language tokens, back-office shell, environment banner, message catalogue for every screen string, the lock overlay that keeps unsaved input without restricted fields, the standard empty, loading, error and unavailable states (design-language 6, 10.13, 10.17); the landing rule: a person lands on their persona's home screen when their roles grant it, otherwise on the first screen their roles grant in the persona's menu (ui-blueprint, menus by persona), so the first Admin lands on Setup › Users (product owner, 6 Oct 2026, DEC-116)

## Expected outputs

`apps/web` shell

## Done when

- Builds and typechecks; every string comes from the catalogue; the unavailable state names what is missing
- With labelled synthetic grants, the landing rule picks the persona's home screen when granted, otherwise the first granted screen of the persona's menu; the first Admin's setup role lands on Setup › Users
- Demo 0 is possible: a deploy, its migrations and the web shell with its environment banner on Railway `dev`, once the product owner authorises Railway (RR-187; RR-216, with `AOS_DATABASE_POOL_MAX` at 5 per pool)

## Notes

- Before building: check the design-language tokens, shells and components these screens use against [design-language.md](../../../../design/ui/design-language.md).
- RR-193: one environment variable names the environment for the seed and the screen banner.
- RR-212 answered (product owner, 6 Oct 2026, DEC-116): the landing rule of Build.
- RR-030: proposed state names in design-language 7.
- Built 7 Oct 2026 on branch `s1/f01-t14` (commit named in the merge): `apps/web` shell with TanStack Router and Query, React Hook Form with Zod (`useRouteForm`, `FormField`), tokens of design-language 2 to 5 and 7 in `index.css`, the components `Button`, `StatusBadge`, `Banner`, the empty, loading, error and unavailable states, the back-office `AppShell` with the environment banner, persona chips and theme switch, the lock overlay with `keptInput` (drops declared secret and restricted fields), and the catalogue `messages/en-IN.ts` with tests for every refusal code, every design-language 7 state and every identifier the code names. Landing rule in `shell/landing.ts`.
- RR-193 done: `AOS_ENVIRONMENT`, read at build (deployment.md section 1). The error reference's display form is settled in code-house-rules 12.3.
- Demo 0 done 7 Oct 2026: `main` (`86f08ce`) deployed to Railway `dev`, the pre-deploy `pnpm migrate` ran, and `https://app-dev-53bf.up.railway.app/` serves the web shell with the banner `dev · SYNTHETIC data only` (runbook "At the merge"; RR-187). Follow-ups RR-260 to RR-264.

