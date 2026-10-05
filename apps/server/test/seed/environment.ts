// Where the local seed may run (code-house-rules 11.2): only where the environment says it is local or dev, the two
// places that hold synthetic data only (deployment.md section 1). Anything else, kdps-test included, is refused.

/** The variable that says which environment this is. */
export const ENVIRONMENT_VARIABLE = 'AOS_ENVIRONMENT';
/** The environments the seed accepts. */
export const SEED_ENVIRONMENTS: readonly string[] = ['local', 'dev'];
// Railway sets these on every service; the newer name first. Their environment must be dev, whatever AOS_ENVIRONMENT
// says, so a variable copied into another environment cannot open the seed there.
const RAILWAY_VARIABLES = ['RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT'] as const;

/** Returns why the seed must not run here, or undefined when it may. */
export function seedRefusal(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const stated = env[ENVIRONMENT_VARIABLE];
  if (stated === undefined || stated === '') {
    return `${ENVIRONMENT_VARIABLE} is not set; the seed runs only where it is ${SEED_ENVIRONMENTS.join(' or ')}`;
  }
  if (!SEED_ENVIRONMENTS.includes(stated)) {
    return `${ENVIRONMENT_VARIABLE} is ${stated}; the seed runs only where it is ${SEED_ENVIRONMENTS.join(' or ')}`;
  }
  for (const variable of RAILWAY_VARIABLES) {
    const railway = env[variable];
    if (railway !== undefined && railway !== '' && (railway !== 'dev' || stated !== 'dev')) {
      return `${variable} is ${railway} and ${ENVIRONMENT_VARIABLE} is ${stated}; on Railway the seed runs only in dev`;
    }
  }
  return undefined;
}
