import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { setupRequestSchema, type SetupRequest } from '@apparel-os/schemas';
import { z } from 'zod';
import { syntheticCode, syntheticName, type SyntheticOrganisation } from '../fixtures/synthetic.js';

// What the local seed gives the setup step for each synthetic Organisation (code-house-rules 11.2; access-and-
// approvals 9.11; DEC-118, RR-330): its own first Admin and its own first approver, four different SYNTHETIC people,
// and labelled SYNTHETIC settings, every required security setting included. None is a KDPS value.

/** The variable naming the file of the first users' SYNTHETIC temporary passwords. */
export const FIRST_USERS_FILE_VARIABLE = 'AOS_SEED_FIRST_USERS_FILE';
/**
 * The file's name: labelled SYNTHETIC and matched by the `.gitignore` pattern `SYNTHETIC-*.secrets.json`, so its
 * temporary passwords are never committed in plain text.
 */
export const FIRST_USERS_FILE_NAME = /^SYNTHETIC-[A-Za-z0-9_-]+\.secrets\.json$/;

/** SYNTHETIC settings (GC3-5 and POL-02.18 stay OPEN; the timezone is no KDPS value, RR-250). */
const SYNTHETIC_SETTINGS = {
  origin: 'synthetic',
  timezone: 'Etc/UTC',
  passwordRules: { minimumLength: 12 },
  signInThrottling: { failureLimit: 5, windowSeconds: 600 },
  officeSessionLimits: { idleLockSeconds: 1800, absoluteSeconds: 28_800 },
} as const;

const userSecretSchema = z.strictObject({ login: z.string().min(1), temporaryPassword: z.string().min(1) });
const organisationSecretsSchema = z.strictObject({ firstAdmin: userSecretSchema, firstApprover: userSecretSchema });
const fileSchema = z.record(z.string(), organisationSecretsSchema);
type FirstUsersFile = z.infer<typeof fileSchema>;

/** The letter of a synthetic Organisation's code, `SYN-ORG-A` gives `A`, which tells its people apart. */
function letterOf(organisation: SyntheticOrganisation): string {
  return organisation.code.slice(organisation.code.lastIndexOf('-') + 1);
}

/** The two first users' logins of one synthetic Organisation: four different people across the two. */
export function firstUserLogins(organisation: SyntheticOrganisation): { firstAdmin: string; firstApprover: string } {
  const letter = letterOf(organisation);
  return {
    firstAdmin: syntheticCode(`ADMIN-${letter}`).toLowerCase(),
    firstApprover: syntheticCode(`APPROVER-${letter}`).toLowerCase(),
  };
}

/** Why the file cannot be used, or undefined: its name must be labelled and git-ignored. */
export function firstUsersFileRefusal(path: string | undefined): string | undefined {
  if (path === undefined || path === '') {
    return `${FIRST_USERS_FILE_VARIABLE} is not set; it names the file of the first users' synthetic temporary passwords`;
  }
  if (!FIRST_USERS_FILE_NAME.test(basename(path))) {
    return `${FIRST_USERS_FILE_VARIABLE} must name a file called SYNTHETIC-<name>.secrets.json, which git ignores`;
  }
  return undefined;
}

/**
 * The first users' SYNTHETIC temporary passwords: read from the file when it exists, otherwise made at random and
 * written to it, readable by its owner only, so the person running the seed can sign in and a rerun gives the same
 * request. Never logged or echoed (PRD-SEC-014).
 */
export function readOrMakeFirstUsers(path: string, organisations: readonly SyntheticOrganisation[]): FirstUsersFile {
  if (existsSync(path)) {
    const parsed = fileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    if (!parsed.success) throw new Error(`The file ${FIRST_USERS_FILE_VARIABLE} names does not hold the first users`);
    const missing = organisations.filter((organisation) => parsed.data[organisation.code] === undefined);
    if (missing.length > 0) {
      throw new Error(`The first users file holds no first users of ${missing.map((each) => each.code).join(', ')}`);
    }
    return parsed.data;
  }
  const made: FirstUsersFile = Object.fromEntries(
    organisations.map((organisation) => {
      const logins = firstUserLogins(organisation);
      return [
        organisation.code,
        {
          firstAdmin: { login: logins.firstAdmin, temporaryPassword: syntheticPassword() },
          firstApprover: { login: logins.firstApprover, temporaryPassword: syntheticPassword() },
        },
      ];
    }),
  );
  writeFileSync(path, `${JSON.stringify(made, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return made;
}

function syntheticPassword(): string {
  return `SYNTHETIC-${randomBytes(12).toString('base64url')}`;
}

/** The setup request of one synthetic Organisation, the same on every run but for nothing (DEC-112 fingerprint). */
export function seedSetupRequest(
  organisation: SyntheticOrganisation,
  databaseName: string,
  secrets: FirstUsersFile,
): SetupRequest {
  const users = secrets[organisation.code];
  if (users === undefined) throw new Error(`No first users of ${organisation.code}`);
  const logins = firstUserLogins(organisation);
  if (users.firstAdmin.login !== logins.firstAdmin || users.firstApprover.login !== logins.firstApprover) {
    throw new Error(`The first users file names other logins for ${organisation.code}`);
  }
  const letter = letterOf(organisation);
  return setupRequestSchema.parse({
    organisationCode: organisation.code,
    databaseName,
    firstAdmin: {
      login: logins.firstAdmin,
      displayName: syntheticName(`First Admin ${letter}`),
      personas: ['P-ADM'],
      temporaryPassword: users.firstAdmin.temporaryPassword,
    },
    firstApprover: {
      login: logins.firstApprover,
      displayName: syntheticName(`First Approver ${letter}`),
      personas: ['P-OWN'],
      temporaryPassword: users.firstApprover.temporaryPassword,
    },
    settings: SYNTHETIC_SETTINGS,
  });
}
