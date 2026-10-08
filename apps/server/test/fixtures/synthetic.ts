// Synthetic labels and the synthetic Organisations (code-house-rules 11.1, 11.2; AGENTS.md "Never invent a value").
// Every fixture and the local seed build their codes, names and file names through these helpers, so nothing
// synthetic can pass for a KDPS value (PRD-SEC-017). Code under src/ never imports this folder (code-house-rules 11.2;
// a lint rule refuses it, and synthetic.test.ts checks that no application source holds a value from here).

/** The marker every synthetic code carries. */
export const SYNTHETIC_CODE_MARKER = 'SYN';
/** The word every synthetic name and generated file name says. */
export const SYNTHETIC_NAME_MARKER = 'SYNTHETIC';

const CODE_PART = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const FILE_STEM = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/;
const FILE_EXTENSION = /^[a-z0-9]+$/;

/** A synthetic code: `ORG-A` becomes `SYN-ORG-A`. */
export function syntheticCode(code: string): string {
  if (!CODE_PART.test(code)) throw new Error(`Synthetic code part ${code} must be upper-case letters and digits`);
  if (code.split('-').includes(SYNTHETIC_CODE_MARKER)) throw new Error(`Code ${code} already carries the marker`);
  return `${SYNTHETIC_CODE_MARKER}-${code}`;
}

const IDENTIFIER_PART = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * A synthetic identifier in lower case, such as a test-only module, record type or action type: `stock-ledger` becomes
 * `test-syn-stock-ledger`. It begins `test-`, as access requires of a synthetic approval rule's action type
 * (stock-ledger 15.3), and carries the synthetic marker in lower case (code-house-rules 11.1).
 */
export function syntheticIdentifier(name: string): string {
  if (!IDENTIFIER_PART.test(name)) throw new Error(`Synthetic identifier part ${name} must be lower-case words`);
  if (name.split('-').includes(SYNTHETIC_CODE_MARKER.toLowerCase())) {
    throw new Error(`Identifier ${name} already carries the marker`);
  }
  return `test-${SYNTHETIC_CODE_MARKER.toLowerCase()}-${name}`;
}

/** A synthetic name: `Organisation A` becomes `SYNTHETIC Organisation A`. */
export function syntheticName(name: string): string {
  if (name.trim() === '' || name !== name.trim()) throw new Error(`Synthetic name "${name}" is empty or padded`);
  if (name.includes(SYNTHETIC_NAME_MARKER)) throw new Error(`Name ${name} already carries the marker`);
  return `${SYNTHETIC_NAME_MARKER} ${name}`;
}

/**
 * A generated file's name: `opening-stock`, `xlsx` becomes `SYNTHETIC-opening-stock.xlsx`. The file also says
 * SYNTHETIC in a document property (imports-and-opening-data 17); the first file generator sets it, with its format
 * library, when it arrives.
 */
export function syntheticFileName(stem: string, extension: string): string {
  if (!FILE_STEM.test(stem)) throw new Error(`File name stem ${stem} must be letters, digits, - and _`);
  if (!FILE_EXTENSION.test(extension)) throw new Error(`File extension ${extension} must be lower-case`);
  return `${SYNTHETIC_NAME_MARKER}-${stem}.${extension}`;
}

/** A synthetic database name, derived from a synthetic code: `SYN-ORG-A` becomes `syn_org_a`. */
export function syntheticDatabaseName(code: string): string {
  if (!isSyntheticCode(code)) throw new Error(`Database names come from a synthetic code, not ${code}`);
  return code.toLowerCase().replaceAll('-', '_');
}

export function isSyntheticCode(code: string): boolean {
  return code.startsWith(`${SYNTHETIC_CODE_MARKER}-`) && CODE_PART.test(code);
}

export function isSyntheticName(name: string): boolean {
  return name.startsWith(`${SYNTHETIC_NAME_MARKER} `);
}

export interface SyntheticOrganisation {
  /** The Organisation code a person gives at sign-in (access-and-approvals 3.1). */
  readonly code: string;
  readonly name: string;
}

/**
 * The two synthetic Organisations every database test and the local seed create, so that one Organisation not
 * seeing the other is always testable (code-house-rules 11.2; deployment.md section 4; PRD-MOD-001, PRD-ACS-020).
 */
export const SYNTHETIC_ORGANISATIONS: readonly [SyntheticOrganisation, SyntheticOrganisation] = [
  { code: syntheticCode('ORG-A'), name: syntheticName('Organisation A') },
  { code: syntheticCode('ORG-B'), name: syntheticName('Organisation B') },
];
