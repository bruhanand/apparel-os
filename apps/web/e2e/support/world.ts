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

/** How the Receive Goods screens name one SYNTHETIC world's records ("CODE · Name"). */
export interface ReceivingOptions {
  readonly site: string;
  readonly wholeStore: string;
  readonly otherStoreUnit: string;
  readonly warehouse: string;
  readonly storeLocation: string;
  readonly otherStoreLocation: string;
  readonly supplier: string;
  readonly brand: string;
  readonly sizes: readonly string[];
  readonly batchSku: string;
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
  /**
   * The operations view journey (S1-F08-T04, S1-F14-T02): a person holding view on `kernel.job` and
   * `kernel.backup_record`, the failing job's kind, and the SYNTHETIC complete backup recorded for the Organisation.
   */
  readonly operationsView: {
    readonly organisationCode: string;
    readonly viewer: EnrolledUser;
    readonly jobKind: string;
    readonly backupId: string;
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
   * The season and size attributes journey (structure-and-masters 4.2 "As built"; RR-556), in the security settings
   * Organisation: an Admin who marks the SYNTHETIC size list, the Owner who approves it, and how the form names it.
   */
  readonly markedAttributes: {
    readonly organisationCode: string;
    readonly admin: EnrolledUser;
    readonly owner: EnrolledUser;
    readonly attributeOption: string;
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
    /** A SYNTHETIC list-type attribute, how the form names its one confirmed value, and a text attribute. */
    readonly seasonName: string;
    readonly seasonValueOption: string;
    readonly fitName: string;
  };
  /**
   * The open-to-buy journey (S2-F01-T02), in the security settings Organisation: a Booking user who prepares a budget,
   * Accounts who checks it and the Owner who approves it, the approve reason, and how the budget form names the
   * products journey's SYNTHETIC brand, season list and season.
   */
  /**
   * The Receive Goods journeys (S2-F02-T02), in an Organisation of its own, each in a world of its own: a Warehouse
   * receiver (P-WHS) and a Store's staff (P-STM), who receives at their Store only, and how the screens name each
   * world's SYNTHETIC Site, units, locations, supplier, brand, size list, sizes and batch-tracked product ("CODE ·
   * Name"); and the style code of the Store's batch-tracked product.
   */
  readonly receiving: {
    readonly organisationCode: string;
    readonly receiver: EnrolledUser;
    readonly options: ReceivingOptions;
    readonly storeStaff: EnrolledUser;
    readonly storeOptions: ReceivingOptions;
    readonly storeBatchStyleCode: string;
  };
  readonly openToBuy: {
    readonly organisationCode: string;
    readonly booking: EnrolledUser;
    readonly accounts: EnrolledUser;
    readonly owner: EnrolledUser;
    readonly reasonId: string;
    readonly brandOption: string;
    readonly seasonOption: string;
  };
  /**
   * The booking journey (S2-F01-T03), in the receiving Organisation: Booking, who records and submits a booking; the
   * Owner, who approves it within a SYNTHETIC limit; the approve reason; and how the form names the SYNTHETIC brand,
   * Site, supplier and season, whose approved SYNTHETIC budget the booking reserves.
   */
  readonly booking: {
    readonly organisationCode: string;
    readonly booker: EnrolledUser;
    readonly owner: EnrolledUser;
    readonly reasonId: string;
    readonly brandOption: string;
    readonly siteOption: string;
    readonly supplierOption: string;
    readonly seasonOption: string;
  };
  /**
   * The file intake journey (S1-F06-T01), in the posting maps journey's Organisation: a Booking user who imports the
   * SYNTHETIC product file the server of the journeys wrote, the saved layout's option as the screen names it, and the
   * style and SKU codes the file holds.
   */
  readonly fileIntake: {
    readonly organisationCode: string;
    readonly booking: EnrolledUser;
    readonly filePath: string;
    readonly layoutOption: string;
    readonly styleCode: string;
    readonly skuCode: string;
    /** A Booking user of the mapping rule journey, apart from the intake one, so each signs in on its own. */
    readonly ruleBooking: EnrolledUser;
    /** A different person who confirms layouts, mappings and mapping rules (S1-F06-T03). */
    readonly confirmer: EnrolledUser;
    /** The SYNTHETIC brand code a mapping rule may target, and today as a business date. */
    readonly brandCode: string;
    readonly today: string;
    /** The duplicate journey's own Booking user and two files: one style, then it again with a new one (S1-F06-T04). */
    readonly duplicate: {
      readonly booking: EnrolledUser;
      readonly firstFile: string;
      readonly secondFile: string;
      readonly style: string;
      readonly newStyle: string;
    };
    /** A reader scoped to one Store, and the codes of a batch in that Store and of one in another (S1-F06-T04). */
    readonly outcomes: {
      readonly reader: EnrolledUser;
      readonly storeBatchCode: string;
      readonly otherBatchCode: string;
    };
    /**
     * The intake refusal journey (S1-F06-T02): a Booking user of its own, a SYNTHETIC workbook holding a macro project
     * and its clean copy.
     */
    readonly refusal: {
      readonly booking: EnrolledUser;
      readonly macroFilePath: string;
      readonly cleanFilePath: string;
    };
    /**
     * The opening publish journey (S1-F13-T03): a preparer of opening batches, and the code of an opening batch of a
     * unit with no approved switch, in an Organisation where policy 14 is not signed.
     */
    readonly opening: {
      readonly preparer: EnrolledUser;
      readonly batchCode: string;
    };
    /**
     * The masked cost journey (S1-F06-T02): a Booking user not granted the class cost, a SYNTHETIC file of the
     * Confirmed costed layout, how the screen names that layout, the file's style code and its cost value.
     */
    readonly cost: {
      readonly reader: EnrolledUser;
      readonly filePath: string;
      readonly layoutOption: string;
      readonly styleCode: string;
      readonly costValue: string;
    };
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
  /**
   * The agreement journey (S2-F01-T01), in the security settings Organisation: Booking, who prepares an agreement, a
   * different person who approves it from My work, and the SYNTHETIC supplier with no agreement yet.
   */
  readonly agreement: {
    readonly organisationCode: string;
    readonly preparer: EnrolledUser;
    readonly approver: EnrolledUser;
    readonly supplierCode: string;
    readonly supplierName: string;
  };
  /**
   * The policy readiness journey (S1-F04-T01), in the security settings Organisation: the Admin who records policy 14
   * as Signed and switches its capability on, the person who validates its values without having entered them, and
   * the SYNTHETIC operation it governs, with its capability.
   */
  readonly policyReadiness: {
    readonly organisationCode: string;
    readonly admin: EnrolledUser;
    readonly validator: EnrolledUser;
    readonly operation: string;
    readonly capability: string;
  };
  /** S1-F12-T01: the devices journey's Admin, and how Setup › Devices names the two Stores and their units. */
  readonly devices: {
    readonly organisationCode: string;
    readonly admin: EnrolledUser;
    /** S1-F12-T02: a second Admin for the lifecycle journey, so the two journeys never share authenticator steps. */
    readonly lifecycleAdmin: EnrolledUser;
    /** S1-F12-T03: the bill numbering journey's Admin, who prepares, and the different person who approves. */
    readonly numberingAdmin: EnrolledUser;
    readonly numberingApprover: EnrolledUser;
    readonly storeOption: string;
    readonly otherStoreOption: string;
    readonly units: readonly { readonly code: string; readonly name: string; readonly store: number }[];
  };
  /** S1-F04-T02: the readiness journey's Operations user and approver, the approve reason, and the unit's option. */
  readonly readiness: {
    readonly organisationCode: string;
    readonly operations: EnrolledUser;
    readonly approver: EnrolledUser;
    readonly reasonId: string;
    readonly unitOption: string;
  };
  /**
   * The posting maps journey (S1-F09-T02), in the security settings Organisation: an Accounts user who prepares a map
   * version and attaches the CA's evidence, a different Accounts user who decides it from My work with the reason
   * given, a journal reader scoped to one Store, and how the screens name the SYNTHETIC book, kind and period.
   */
  readonly postingMaps: {
    readonly organisationCode: string;
    readonly preparer: EnrolledUser;
    readonly approver: EnrolledUser;
    readonly storeReader: EnrolledUser;
    readonly reasonId: string;
    readonly bookOption: string;
    readonly eventKind: string;
    readonly periodCode: string;
    readonly periodId: string;
  };
  /**
   * The period close journey (S1-F09-T03): an Accounts user who locks and requests, a different one who approves, the
   * approve reason, the SYNTHETIC book and periods as the screen names them, the correction a reopening names, and the
   * harness of the server of the journeys that posts it, as the module owning it would.
   */
  readonly periodClose: {
    readonly organisationCode: string;
    readonly requester: EnrolledUser;
    readonly approver: EnrolledUser;
    readonly reasonId: string;
    readonly bookOption: string;
    readonly periodCodes: readonly string[];
    readonly correction: { readonly module: string; readonly recordType: string; readonly recordId: string };
    readonly harnessUrl: string;
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
