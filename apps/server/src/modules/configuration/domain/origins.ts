import type { MissingItem, SettingOrigin } from '@apparel-os/schemas';

// Where a value came from, and where each origin is accepted (code-house-rules 12.14 "Where a value came from", 11.1;
// deployment.md section 1; DEC-071, DEC-116; RR-252, RR-401; S1-F04-T01). A synthetic value is for local work, tests
// and `dev`, on a synthetic Organisation; a setting of the test setup is for `kdps-test`; KDPS's own answer is for
// every environment. So nothing synthetic passes for a KDPS value, and nothing of the test setup reaches production.

/** The variable naming the environment (deployment.md section 1; RR-193). Read at start, never a business value. */
export const ENVIRONMENT_VARIABLE = 'AOS_ENVIRONMENT';

/** The environments where synthetic values are accepted: local work, which tests run as, and `dev`. */
const SYNTHETIC_ENVIRONMENTS: readonly string[] = ['local', 'dev'];
/** The one environment of the test setup (DEC-102, DEC-103, DEC-105). */
const TEST_SETUP_ENVIRONMENT = 'kdps-test';
/** The marker every synthetic Organisation code begins with (code-house-rules 11.1). */
const SYNTHETIC_ORGANISATION_PREFIX = 'SYN-';

/** The environment the server runs in, as AOS_ENVIRONMENT names it, or null when it names none. */
export interface DeploymentEnvironment {
  readonly name: string | null;
}

/** Reads the environment at start. Unset or empty names none, so no synthetic or test-setup value is accepted. */
export function deploymentEnvironmentOf(env: Readonly<Record<string, string | undefined>>): DeploymentEnvironment {
  const name = env[ENVIRONMENT_VARIABLE];
  return { name: name === undefined || name === '' ? null : name };
}

/**
 * Whether a value of the origin is accepted in this environment for this Organisation (code-house-rules 12.14): KDPS's
 * anywhere; the test setup's only on `kdps-test`; synthetic only in local work, tests and `dev`, and only on a
 * synthetic Organisation (DEC-116).
 */
export function originAccepted(environment: DeploymentEnvironment, origin: SettingOrigin, organisationCode: string) {
  switch (origin) {
    case 'kdps':
      return true;
    case 'test-setup':
      return environment.name === TEST_SETUP_ENVIRONMENT;
    case 'synthetic':
      return (
        environment.name !== null &&
        SYNTHETIC_ENVIRONMENTS.includes(environment.name) &&
        organisationCode.startsWith(SYNTHETIC_ORGANISATION_PREFIX)
      );
  }
}

/** The missing item naming an origin this environment does not accept (code-house-rules 12.3 "What is missing"). */
export function originMissing(environment: DeploymentEnvironment, origin: SettingOrigin): MissingItem {
  return { kind: 'origin', origin, environment: environment.name ?? 'not-named' };
}
