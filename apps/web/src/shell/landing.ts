import type { PersonaId } from '@apparel-os/schemas';
import { personaMenus, screenGrantedByRoles, screenOpen, type Grant, type ScreenId } from './screens';

/** Where a person lands: a screen of the registry, or the "No access assigned" page (design-language 10.20). */
export type Landing = ScreenId | 'no-access-assigned';

/**
 * The screen a person lands on after sign-in (DEC-116; personas.md section 2 "Landing"; design-language 10.18). A
 * person who holds no role assignment in force lands on "No access assigned" (DEC-118; RR-260; PRD-ACS-002). Otherwise
 * the first persona held sets it: its home screen when the person may open it, otherwise the first screen of that
 * persona's menu that a role assignment grants. So the first Admin, whose setup role grants no Policy readiness, lands
 * on Setup › Users. My work, which needs no permission, opens when nothing else applies.
 */
export function landingScreen(
  roleAssignmentInForce: boolean,
  personasHeld: readonly PersonaId[],
  grants: readonly Grant[],
): Landing {
  if (!roleAssignmentInForce) return 'no-access-assigned';
  const first = personasHeld[0];
  if (first === undefined) return 'my-work';
  const { home, menu } = personaMenus[first];
  if (home !== null && screenOpen(home, grants)) return home;
  return menu.find((id) => screenGrantedByRoles(id, grants)) ?? 'my-work';
}
