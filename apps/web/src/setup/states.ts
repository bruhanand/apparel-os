import { stateFamilies, type StateId } from '../components/states';

/**
 * The state identifier of a state name the server answers, such as "Awaiting approval" or "In force"
 * (design-language 7; DM-4, DEC-105). The server's names are the design language's, so the identifier is the name in
 * lower case with hyphens; a name the design language does not have shows as Unknown.
 */
export function stateIdOf(name: string): StateId {
  const id = name.toLowerCase().replace(/ /g, '-');
  return Object.hasOwn(stateFamilies, id) ? (id as StateId) : 'unknown';
}
