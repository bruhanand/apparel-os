import { z } from 'zod';

// The environment the service runs in (deployment.md section 1; code-house-rules 11.1, 12.14 "Technical settings";
// RR-193; S1-F04 review H1). One definition, which `configuration` (which origins of a value it accepts) and `access`
// (the test sign-in, DEC-121) both read: the variable's name, the environments it may name, and the development ones.
// Read at start; unset, empty or any other value stops the service, and nothing falls back to a value in code.

/** The variable naming the environment (deployment.md section 1). */
export const ENVIRONMENT_VARIABLE = 'AOS_ENVIRONMENT';

/** The environments deployment.md section 1 names. Production is not designed yet, so it is none of them. */
export const deploymentEnvironmentNames = ['local', 'dev', 'kdps-test'] as const;
const nameSchema = z.enum(deploymentEnvironmentNames);
export type DeploymentEnvironmentName = z.infer<typeof nameSchema>;

/** The environments of development work, which tests run as: synthetic values and the test sign-in only here. */
const DEVELOPMENT_ENVIRONMENTS: readonly string[] = ['local', 'dev'];

/**
 * The marker every synthetic Organisation code begins with, as the seed's two codes do (DEC-118; code-house-rules
 * 11.1, 12.14): the test of whether an Organisation is synthetic.
 */
export const SYNTHETIC_ORGANISATION_PREFIX = 'SYN-';

/** The environment the service runs in, as AOS_ENVIRONMENT names it. */
export interface DeploymentEnvironment {
  readonly name: DeploymentEnvironmentName;
}

/** Reads the environment at start, or throws naming the variable (code-house-rules 12.14). */
export function deploymentEnvironmentFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): DeploymentEnvironment {
  const value = env[ENVIRONMENT_VARIABLE];
  if (value === undefined || value === '') throw new Error(`${ENVIRONMENT_VARIABLE} is not set; it has no default`);
  const parsed = nameSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${ENVIRONMENT_VARIABLE} must be one of local, dev or kdps-test (deployment.md section 1)`);
  }
  return { name: parsed.data };
}

/** Whether a named environment is one of development work: `local` or `dev`. */
export function isDevelopmentEnvironment(name: string | undefined): boolean {
  return name !== undefined && DEVELOPMENT_ENVIRONMENTS.includes(name);
}

/** Whether an Organisation is synthetic: its code begins `SYN-` (code-house-rules 11.1, 12.14; DEC-118). */
export function isSyntheticOrganisation(organisationCode: string): boolean {
  return organisationCode.startsWith(SYNTHETIC_ORGANISATION_PREFIX);
}
