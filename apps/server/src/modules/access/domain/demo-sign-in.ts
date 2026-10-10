import { z } from 'zod';
import {
  ENVIRONMENT_VARIABLE,
  isDevelopmentEnvironment,
  isSyntheticOrganisation,
  SYNTHETIC_ORGANISATION_PREFIX,
} from '../../../kernel/index.js';

// The test sign-in of the development environments (access-and-approvals 3.4; deployment.md section 3; DEC-121). One
// button per listed SYNTHETIC person signs in without the password or the authenticator code. POL-02.17 allows an
// easier test path only in development and never one that weakens production authentication, and PRD-ACS-017 keeps
// development test access apart from it: so it is on only where AOS_ENVIRONMENT is `local` or `dev`, only for the
// people this variable lists, only in SYNTHETIC Organisations, and the server refuses to start with the list set
// anywhere else (code-house-rules 12.14 "Technical settings"). Nothing in it has a default.

/** The variable listing the people a test sign-in may sign in: a JSON array of `{organisationCode, login, label}`. */
export const DEMO_SIGN_IN_VARIABLE = 'AOS_DEMO_SIGN_IN';
// The environment's variable, the development environments (POL-02.17: development only) and the synthetic marker are
// the kernel's one definition, which `configuration` reads too (S1-F04 review H1).

const personSchema = z.strictObject({
  organisationCode: z.string().min(1),
  login: z.string().min(1),
  label: z.string().min(1),
});
const listSchema = z.array(personSchema).min(1);

/** One person a test sign-in may sign in. */
export type DemoPerson = z.infer<typeof personSchema>;

export interface DemoSignInSettings {
  readonly enabled: boolean;
  readonly people: readonly DemoPerson[];
}

/** Reads the test sign-in setting at start, or throws naming the variable (code-house-rules 12.14). */
export function demoSignInFromEnvironment(env: Readonly<Record<string, string | undefined>>): DemoSignInSettings {
  const value = env[DEMO_SIGN_IN_VARIABLE];
  if (value === undefined || value === '') return { enabled: false, people: [] };
  const environment = env[ENVIRONMENT_VARIABLE];
  if (!isDevelopmentEnvironment(environment)) {
    throw new Error(
      `${DEMO_SIGN_IN_VARIABLE} is set but ${ENVIRONMENT_VARIABLE} is not local or dev: a test sign-in is for development only (POL-02.17)`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${DEMO_SIGN_IN_VARIABLE} must be a JSON array of {organisationCode, login, label}`);
  }
  const people = listSchema.safeParse(parsed);
  if (!people.success) {
    throw new Error(`${DEMO_SIGN_IN_VARIABLE} must be a non-empty JSON array of {organisationCode, login, label}`);
  }
  const notSynthetic = people.data.find((person) => !isSyntheticOrganisation(person.organisationCode));
  if (notSynthetic !== undefined) {
    throw new Error(
      `${DEMO_SIGN_IN_VARIABLE} lists a person of an Organisation whose code does not begin ${SYNTHETIC_ORGANISATION_PREFIX}: a test sign-in is for SYNTHETIC Organisations only`,
    );
  }
  return { enabled: true, people: people.data };
}

/** The listed person with this Organisation code and login, compared exactly as listed. */
export function findDemoPerson(
  settings: DemoSignInSettings,
  organisationCode: string,
  login: string,
): DemoPerson | undefined {
  return settings.people.find((person) => person.organisationCode === organisationCode && person.login === login);
}
