// PRD-MOD-015: an Unknown value stays distinct from zero (and from empty, false or any other default).

export interface KnownValue<T> {
  readonly kind: 'known';
  readonly value: T;
}

export interface UnknownValue {
  readonly kind: 'unknown';
}

/** A value that may be Unknown. */
export type MaybeKnown<T> = KnownValue<T> | UnknownValue;

const UNKNOWN: UnknownValue = Object.freeze({ kind: 'unknown' });

export function known<T>(value: T): KnownValue<T> {
  return { kind: 'known', value };
}

export function unknownValue(): UnknownValue {
  return UNKNOWN;
}

export function isKnown<T>(x: MaybeKnown<T>): x is KnownValue<T> {
  return x.kind === 'known';
}
