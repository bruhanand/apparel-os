import type { DueRule, ExceptionCategory, ExceptionLink, FieldClass, MissingItem } from '@apparel-os/schemas';
import { dueRuleSchema, exceptionCategorySchema, exceptionTypeCodeSchema } from '@apparel-os/schemas';
import type { NumberedKind } from '../../numbering/index.js';
import type { TransactionContext } from '../../../kernel/index.js';

// The exception types modules register, the resolution-check contract, the exception-code kind and the due-time rule
// (access-and-approvals 12.1 to 12.3; module-map section 3, rule 6; numbering-and-audit 3.1). Plain types and rules
// only (code-house-rules 2).

/** What a resolution check is shown of the exception it checks (12.3; PRD-EXC-002). */
export interface ResolutionSubject {
  readonly exceptionId: string;
  readonly typeCode: string;
  readonly links: readonly ExceptionLink[];
}

/**
 * A resolution check's answer: the linked business outcome is verified, or not, naming what is still missing as
 * identifiers and codes (code-house-rules 12.3; PRD-UXP-003).
 */
export type ResolutionAnswer =
  { readonly kind: 'verified' } | { readonly kind: 'not-verified'; readonly missing: readonly MissingItem[] };

/**
 * An exception type as its raising module registers it (12.1; module-map section 3, rule 6): its code
 * `<module>.<name>`, its category among the kinds of `PRD-EXC-001` and source conflict (`POL-03.04`), the record types
 * it links to, and the resolution check the module implements, which closing waits for (PRD-EXC-002). The check reads
 * the module's own records through the module's own code, in the closing command's transaction. It declares the
 * restricted field classes its evidence files carry, which a reader of them needs (imports-and-opening-data 11;
 * S1-F08-T03): declared for every type, so none is left out by a default.
 */
export interface ExceptionTypeRegistration {
  readonly code: string;
  readonly category: ExceptionCategory;
  readonly module: string;
  readonly linksTo: readonly string[];
  readonly evidenceClasses: readonly FieldClass[];
  readonly resolutionCheck: (context: TransactionContext, subject: ResolutionSubject) => Promise<ResolutionAnswer>;
}

/**
 * Checks the registrations once, when `exceptions` is built: each code in form, under its own module, registered once,
 * of a declared category, linking to at least one record type.
 */
export function checkTypes(
  types: readonly ExceptionTypeRegistration[],
): ReadonlyMap<string, ExceptionTypeRegistration> {
  const byCode = new Map<string, ExceptionTypeRegistration>();
  for (const type of types) {
    if (!exceptionTypeCodeSchema.safeParse(type.code).success || !type.code.startsWith(`${type.module}.`)) {
      throw new Error(`An exception type is named <module>.<name> under its own module: ${type.code}`);
    }
    if (!exceptionCategorySchema.safeParse(type.category).success) {
      throw new Error(`Exception type ${type.code} has no category of PRD-EXC-001 or POL-03.04`);
    }
    if (type.linksTo.length === 0) throw new Error(`Exception type ${type.code} links to no record type`);
    if (byCode.has(type.code)) throw new Error(`Exception type ${type.code} is registered twice`);
    byCode.set(type.code, type);
  }
  return byCode;
}

/**
 * The exception-code kind (access-and-approvals 12.1; numbering-and-audit 3.1; S1-F08-T02). **Design choice:** one
 * series for the Organisation as a whole, never restarting each financial year, since the year's dates are OPEN
 * (GC5-1) and an exception's code needs no year to be unique; its texts are unique in the Organisation. Its format is
 * the Organisation's choice, with no default (numbering-and-audit 3.5).
 */
export const EXCEPTION_CODE_KIND: NumberedKind = {
  kind: 'exceptions.exception-code',
  yearly: false,
  scopeKeyStandsFor: 'the Organisation as a whole: one exception-code series',
  displayScope: { standsFor: 'the Organisation as a whole', perYear: false },
};

/** The one scope key of the exception-code kind: the Organisation itself (one database per Organisation). */
export const EXCEPTION_CODE_SCOPE_KEY = 'organisation';

/** The document type of an exception's allocation. */
export const EXCEPTION_RECORD_TYPE = 'exceptions.exception';

/** The due time a rule gives an exception raised at an instant (12.2). Only `elapsed-minutes-v1` exists. */
export function dueAtOf(rule: DueRule, raisedAt: Date): Date {
  return new Date(raisedAt.getTime() + rule.minutes * 60_000);
}

/** A stored rule, read back through its format's schema; anything else is a defect of the row. */
export function storedDueRule(format: string, rule: unknown): DueRule {
  return dueRuleSchema.parse({ ...(rule as object), format });
}

/** The missing item that names the exception-code series (DEC-116). */
export const MISSING_SERIES: MissingItem = { kind: 'number-series', numberedKind: EXCEPTION_CODE_KIND.kind };

/** The missing item that names a type and Site with no routing in force (POL-02.16). */
export function missingRouting(typeCode: string, siteId: string | null): MissingItem {
  return siteId === null
    ? { kind: 'exception-routing', exceptionType: typeCode }
    : { kind: 'exception-routing', exceptionType: typeCode, siteId };
}
