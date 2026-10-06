import type { CommandRoute } from '@apparel-os/schemas';

/** What a command route declares about its body's secret and restricted fields (code-house-rules 12.2). */
export type DeclaredFields = Pick<CommandRoute, 'secretFields' | 'restrictedFields'>;

/**
 * The unsaved input a screen keeps while its session is locked or after it ends (access-and-approvals 3.3;
 * PRD-ACS-017, PRD-UXP-003): a copy of the form's values without any field the command's route declares as a secret
 * or as restricted, which the person enters again (PRD-SEC-006, PRD-SEC-014). A `*` in a path stands for every
 * element of a list, as in the route table.
 */
export function keptInput(route: DeclaredFields, values: unknown): unknown {
  let kept: unknown = structuredClone(values);
  for (const field of [...route.secretFields, ...route.restrictedFields]) kept = without(kept, field.path);
  return kept;
}

function without(value: unknown, path: readonly string[]): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (head === '*') return Array.isArray(value) ? value.map((item: unknown) => without(item, rest)) : value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!(head in record)) return value;
  if (rest.length === 0) {
    return Object.fromEntries(Object.entries(record).filter(([key]) => key !== head));
  }
  return { ...record, [head]: without(record[head], rest) };
}
