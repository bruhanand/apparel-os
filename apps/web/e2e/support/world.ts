import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Where the journeys find the servers, and the synthetic users the server of the journeys wrote
// (apps/server/test/browser/serve.ts). The user comes from the synthetic test fixtures, never from application code
// (code-house-rules 11.2). Every value is SYNTHETIC.

/** The port the server of the journeys listens on. */
export const SERVER_PORT = 3000;
/**
 * The origin of the server of the journeys, which serves the built web app and the API from one origin, as the `app`
 * service does (deployment.md section 3; code-house-rules 12.1; S1-F01-T27).
 */
export const WEB_ORIGIN = `http://localhost:${String(SERVER_PORT)}`;
/** Git ignores this folder. */
export const WORLD_FILE = join(import.meta.dirname, '..', '.synthetic', 'world.json');

/** A user whose first sign-in is still to come: a temporary password, no authenticator app (3.2). */
export interface FirstSignInUser {
  readonly login: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
}

/** A user already enrolled: the password and the authenticator secret, hex, as an app holding it would. */
export interface EnrolledUser {
  readonly login: string;
  readonly displayName: string;
  readonly password: string;
  readonly factorSecretHex: string;
}

export interface SyntheticWorld {
  readonly organisationCode: string;
  readonly login: string;
  readonly displayName: string;
  /** The temporary password the user signs in with the first time (access-and-approvals 3.2). */
  readonly temporaryPassword: string;
  /** In the same Organisation, a user whose first sign-in is still to come and who holds no role assignment (RR-260). */
  readonly noAccess: FirstSignInUser;
  /** The lock journey's user: enrolled already, in an Organisation with a short synthetic idle limit (RR-304). */
  readonly lock: {
    readonly organisationCode: string;
    readonly login: string;
    readonly displayName: string;
    readonly password: string;
    /** The authenticator secret, hex, as an app holding it would. */
    readonly factorSecretHex: string;
    readonly idleLockSeconds: number;
  };
  /**
   * The security settings journey's Organisation, made by the setup step, with an enrolled Admin who may prepare a
   * setting change and an enrolled approver who may approve it (S1-F01-T25).
   */
  /** The test sign-in journey's person, listed in AOS_DEMO_SIGN_IN (DEC-121). */
  readonly demo: { readonly label: string; readonly displayName: string };
  readonly settings: {
    readonly organisationCode: string;
    readonly admin: EnrolledUser;
    readonly approver: EnrolledUser;
  };
  /** The exceptions journey (S1-F08-T02): an Operations user who owns one SYNTHETIC exception, by its code. */
  readonly exceptions: {
    readonly organisationCode: string;
    readonly operations: EnrolledUser;
    readonly code: string;
  };
  /**
   * The live-update journey (S1-F08-T04): an Operations user who owns the SYNTHETIC type at a SYNTHETIC Site, a person
   * who may raise it, and the test document an exception links to.
   */
  readonly live: {
    readonly organisationCode: string;
    readonly operations: EnrolledUser;
    readonly raiser: EnrolledUser;
    readonly siteId: string;
    readonly typeCode: string;
    readonly link: { readonly module: string; readonly recordType: string; readonly recordId: string };
  };
  /** The operations view journey (S1-F08-T04): a person holding view on `kernel.job`, and the failing job's kind. */
  readonly operationsView: {
    readonly organisationCode: string;
    readonly viewer: EnrolledUser;
    readonly jobKind: string;
  };
  /**
   * The evidence journey (S1-F08-T03): an Operations user who owns one SYNTHETIC exception, by its code, and an
   * approver who decides an exception rule change with the approve reason given.
   */
  readonly evidence: {
    readonly organisationCode: string;
    readonly operations: EnrolledUser;
    readonly code: string;
    readonly approver: EnrolledUser;
    readonly reasonId: string;
  };
  /**
   * The approval limits journey (S1-F05-T01): an Admin who prepares approval limits, a person who approves them, and
   * the approver of a test-only booking action, through a role the form names as `roleOption`, with two SYNTHETIC
   * booking requests waiting; `actionOption` names the action type in the limit form.
   */
  readonly limits: {
    readonly organisationCode: string;
    readonly admin: EnrolledUser;
    readonly approver: EnrolledUser;
    readonly bookingApprover: EnrolledUser;
    readonly roleOption: string;
    readonly actionOption: string;
    readonly reasonId: string;
  };
  /**
   * The bulk approval journey (S1-F05-T02), in the security settings Organisation: an approver of a test-only action
   * type on a SYNTHETIC bulk allowlist, with a SYNTHETIC limit, three requests waiting, and the reason they give.
   */
  readonly bulk: {
    readonly organisationCode: string;
    readonly approver: EnrolledUser;
    readonly reasonId: string;
  };
  /**
   * The organisation structure journey (S1-F02-T01), in the security settings Organisation: an approved synthetic
   * Area, an Admin who may prepare the structure and an approver who may approve it.
   */
  readonly structure: {
    readonly organisationCode: string;
    readonly areaId: string;
    /** How the Site form names the Area. */
    readonly areaOption: string;
    readonly admin: EnrolledUser;
    readonly approver: EnrolledUser;
    /**
     * The business units journey (S1-F02-T02): an Accounts user who may verify mappings, an approved Site, and two
     * legal entities each with a registration in the Site's State and a book, named as the unit form offers them.
     */
    readonly accounts: EnrolledUser;
    /** The journey's own Admin and approver, since journeys run at once and a code is taken once. */
    readonly unitsAdmin: EnrolledUser;
    readonly unitsApprover: EnrolledUser;
    /** The classifications journey's own Admin and approver (S1-F02-T04). */
    readonly classifyAdmin: EnrolledUser;
    readonly classifyApprover: EnrolledUser;
    readonly siteId: string;
    readonly siteOption: string;
    readonly entities: readonly {
      readonly legalEntityOption: string;
      readonly registrationOption: string;
      readonly bookOption: string;
    }[];
  };
  /**
   * The scope journey (S1-F02-T03), in the security settings Organisation: an Admin who prepares role assignments, an
   * approver who decides them, a person with no assignment yet, the role the journey assigns, and two approved Stores
   * at one Site, the first the one the journey selects.
   */
  readonly scope: {
    readonly organisationCode: string;
    readonly admin: EnrolledUser;
    readonly approver: EnrolledUser;
    readonly reader: EnrolledUser;
    readonly readerOption: string;
    readonly roleOption: string;
    readonly stores: readonly { readonly id: string; readonly code: string; readonly name: string }[];
  };
  /**
   * The vocabularies journey (S1-F03-T01), in the security settings Organisation: a Booking user who proposes values,
   * a different person who confirms them, and the name of the SYNTHETIC list-type attribute whose tab they use.
   */
  readonly vocabularies: {
    readonly organisationCode: string;
    readonly booking: EnrolledUser;
    readonly confirmer: EnrolledUser;
    readonly attributeName: string;
  };
  /**
   * The products journey (S1-F03-T02), in the security settings Organisation: a Booking user who proposes a style, a
   * different person who confirms it, how the form names the SYNTHETIC brand and category, and the category's
   * SYNTHETIC free size.
   */
  readonly products: {
    readonly organisationCode: string;
    readonly booking: EnrolledUser;
    readonly confirmer: EnrolledUser;
    readonly brandOption: string;
    readonly categoryOption: string;
    readonly freeSize: string;
  };
  /**
   * The bank details journey (S1-F03-T03), in the security settings Organisation: a person who prepares a supplier's
   * bank-detail change, a different person who approves it and shows it, and the SYNTHETIC supplier's code.
   */
  readonly bankDetails: {
    readonly organisationCode: string;
    readonly preparer: EnrolledUser;
    readonly approver: EnrolledUser;
    readonly supplierCode: string;
  };
  /** The approval journey's Organisation, made by the setup step, and its first two users (S1-F01-AT18). */
  readonly journey: {
    readonly organisationCode: string;
    readonly admin: FirstSignInUser;
    readonly approver: FirstSignInUser;
  };
}

export function readWorld(): SyntheticWorld {
  return JSON.parse(readFileSync(WORLD_FILE, 'utf8')) as SyntheticWorld;
}
