import type { PersonaId } from '@apparel-os/schemas';
import { personaMenus, screenGrantedByRoles, screenOpen, type Grant, type ScreenId } from './screens';

/**
 * The screen a person lands on after sign-in (DEC-116; personas.md section 2 "Landing"; design-language 10.18). The
 * first persona held sets it: its home screen when the person may open it, otherwise the first screen of that
 * persona's menu that a role assignment grants. So the first Admin, whose setup role grants no Policy readiness,
 * lands on Setup › Users. My work, which needs no permission, opens when nothing else applies (RR-260).
 */
export function landingScreen(personasHeld: readonly PersonaId[], grants: readonly Grant[]): ScreenId {
  const first = personasHeld[0];
  if (first === undefined) return 'my-work';
  const { home, menu } = personaMenus[first];
  if (home !== null && screenOpen(home, grants)) return home;
  return menu.find((id) => screenGrantedByRoles(id, grants)) ?? 'my-work';
}
