// The environment banner (deployment.md section 1; design-language 10.17; RR-193). One variable, AOS_ENVIRONMENT,
// names the environment for the local seed and for this banner. Vite reads it when the web app is built (vite.config.ts
// exposes that one variable), since each Railway environment builds its own app.

export const environments = ['local', 'dev', 'kdps-test'] as const;
export type Environment = (typeof environments)[number];

export interface EnvironmentBanner {
  /** The environment named, or null when AOS_ENVIRONMENT names none this app knows. */
  readonly environment: Environment | null;
  readonly message: `environment.${Environment | 'not-named'}`;
  /** The banner's tone (design-language 10.12). */
  readonly tone: 'info' | 'warning';
}

/**
 * The banner every screen shows. Local work and `dev` hold synthetic data only, so they say SYNTHETIC; `kdps-test`
 * says the earlier POS stays the system of record (PRD-LIF-014, PRD-LIF-026). A value it does not know, or none, is
 * shown as not named: never taken as one of the others. Production is not designed yet (deployment.md D-1).
 */
export function environmentBanner(value: string | undefined): EnvironmentBanner {
  const environment = environments.find((name) => name === value) ?? null;
  if (environment === null) return { environment, message: 'environment.not-named', tone: 'warning' };
  return {
    environment,
    message: `environment.${environment}`,
    tone: environment === 'kdps-test' ? 'warning' : 'info',
  };
}
