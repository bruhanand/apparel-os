// Which module ids belong to the costing entry point of @apparel-os/calculations (shared-calculations 2.1, 2.3;
// PRD-OFF-004). One predicate for the build guard, its test and the Playwright run, so they cannot drift apart.
export const COSTING_ENTRY = '@apparel-os/calculations/costing';

/** True for a module of the costing folder, whether the package is read from `dist` or from `src`. */
export function isCostingModule(id: string, costingFolder?: string): boolean {
  return (
    (costingFolder !== undefined && id.startsWith(`${costingFolder}/`)) ||
    /\/calculations\/(?:dist|src)\/costing\//.test(id)
  );
}
