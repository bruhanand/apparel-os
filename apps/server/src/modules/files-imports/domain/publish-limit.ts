import type { CommandRefusal } from '../../../kernel/index.js';
import { isDevelopmentEnvironment } from '../../../kernel/index.js';

// The publishing limit of S1-F06-T01 (product owner, 6 Oct 2026): publishing an import is reachable only where the
// Organisations are synthetic, in local work, tests and `dev` (deployment.md section 1). Anywhere else, `kdps-test`
// included, Publish answers unavailable naming the publishing controls still missing and writes nothing
// (PRD-SEC-017, PRD-UXP-003). The gate reads the environment's name, as the simulator gate of code-house-rules 12.10
// does; no code tests for a synthetic Organisation code (11.1). The ticket that closes last of S1-F06-T02, T03 and T04
// removes it (S1-F06-T04 Notes). The confirmed layouts and mappings with the validation report (S1-F06-T03) and
// duplicate control (S1-F06-T04) are built, so only the intake refusals and caps of S1-F06-T02 are still named.

/** The publishing controls not yet built, each named with the ticket that builds it. */
const MISSING_CONTROLS = [
  { kind: 'publishing-control', control: 'intake-refusals-and-caps', ticket: 'S1-F06-T02' },
] as const;

/** The refusal of Publish in an environment that is not local work, tests or `dev`; undefined where it may run. */
export function publishLimitRefusal(environmentName: string): CommandRefusal<'unavailable'> | undefined {
  if (isDevelopmentEnvironment(environmentName)) return undefined;
  return {
    kind: 'unavailable',
    code: 'files-imports.publishing-limited',
    missing: MISSING_CONTROLS.map((each) => ({ ...each })),
  };
}
