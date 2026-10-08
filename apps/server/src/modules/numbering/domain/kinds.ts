import type { CommandRefusal } from '../../../kernel/index.js';

// The kinds numbering serves and its answers (numbering-and-audit 3.1, 3.7). Plain types and rules only
// (code-house-rules 2).

/**
 * A document kind an owning module numbers, as that module declares it (numbering-and-audit 3.1): whether it restarts
 * each financial year, what its scope key stands for, and its display scope, the scope in which its texts are unique
 * (3.5). The scope key and the display scope key are opaque to `numbering`: the owning module validates the scope and
 * supplies them, and for a yearly kind the financial year its document's business date falls in under the
 * Organisation's timezone (3.3; PRD-MOD-009).
 */
export interface NumberedKind {
  /** `<module>.<kind>`, in lower case, such as `files-imports.import-batch`. */
  readonly kind: string;
  readonly yearly: boolean;
  readonly scopeKeyStandsFor: string;
  /** For a bill, the tax registration and financial year: `perYear` true. Only a yearly kind can be per year. */
  readonly displayScope: { readonly standsFor: string; readonly perYear: boolean };
}

const KIND = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

/** Checks the declarations once, when numbering is built: each kind named once, in form, per year only if yearly. */
export function checkKinds(kinds: readonly NumberedKind[]): ReadonlyMap<string, NumberedKind> {
  const byName = new Map<string, NumberedKind>();
  for (const kind of kinds) {
    if (!KIND.test(kind.kind)) throw new Error(`A numbered kind is named <module>.<kind>: ${kind.kind}`);
    if (byName.has(kind.kind)) throw new Error(`Numbered kind ${kind.kind} is declared twice`);
    if (kind.displayScope.perYear && !kind.yearly) {
      throw new Error(`Numbered kind ${kind.kind} has a display scope per year but no year`);
    }
    if (kind.scopeKeyStandsFor.trim() === '' || kind.displayScope.standsFor.trim() === '') {
      throw new Error(`Numbered kind ${kind.kind} must say what its scope key and display scope stand for`);
    }
    byName.set(kind.kind, kind);
  }
  return byName;
}

/** The refusals of numbering's operations (packages/schemas errors.ts `numberingCodes`). */
export type NumberingReason =
  | 'kind-not-declared'
  | 'financial-year-mismatch'
  | 'invalid-series'
  | 'format-not-found'
  | 'format-invalid'
  | 'format-not-for-kind'
  | 'scope-text-missing'
  | 'format-could-repeat'
  | 'live-series-exists'
  | 'series-not-found'
  | 'series-paused'
  | 'series-closed'
  | 'series-not-open'
  | 'series-not-paused'
  | 'series-exhausted'
  | 'document-numbered-elsewhere';

const NOT_FOUND: readonly NumberingReason[] = ['format-not-found', 'series-not-found'];

/** An operation's answer: its value, or the refusal (code-house-rules 12.3). */
export type NumberingResult<Value> =
  { readonly kind: 'done'; readonly value: Value } | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

export function refused<Value>(reason: NumberingReason): NumberingResult<Value> {
  return {
    kind: 'refused',
    refusal: { kind: NOT_FOUND.includes(reason) ? 'not-found' : 'refused', code: `numbering.${reason}`, missing: [] },
  };
}

export function answered<Value>(value: Value): NumberingResult<Value> {
  return { kind: 'done', value };
}
