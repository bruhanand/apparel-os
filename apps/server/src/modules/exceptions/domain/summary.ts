import type { ExceptionExposure } from '@apparel-os/schemas';

// The read model of open exceptions (access-and-approvals 12.3; PRD-EXC-004, PRD-MOD-015). Plain rules only.

export interface SummaryInput {
  readonly storeId: string | null;
  readonly brandId: string | null;
  readonly typeCode: string;
  readonly exposure: ExceptionExposure;
  /** Linked to an earlier exception of its type on the same record (PRD-EXC-004). */
  readonly repeat: boolean;
}

export interface SummaryRow {
  readonly storeId: string | null;
  readonly brandId: string | null;
  readonly typeCode: string;
  readonly open: number;
  /** The sum of the known exposures, in paise; null when every exposure is Unknown, never zero for them. */
  readonly knownExposure: number | null;
  readonly unknownExposures: number;
  readonly repeats: number;
}

const order = (value: string | null): string => (value === null ? '' : `~${value}`);

/**
 * Groups open exceptions by Store, brand and type: how many, their known exposure summed, the Unknown exposures
 * counted apart and never added as zero (PRD-MOD-015), and the repeats. Ordered by Store, brand and type, the
 * exceptions with none of a fact first.
 */
export function summarise(inputs: readonly SummaryInput[]): SummaryRow[] {
  const groups = new Map<string, { -readonly [K in keyof SummaryRow]: SummaryRow[K] }>();
  for (const input of inputs) {
    const key = JSON.stringify([input.storeId, input.brandId, input.typeCode]);
    const group = groups.get(key) ?? {
      storeId: input.storeId,
      brandId: input.brandId,
      typeCode: input.typeCode,
      open: 0,
      knownExposure: null,
      unknownExposures: 0,
      repeats: 0,
    };
    group.open += 1;
    if (input.exposure.kind === 'known') group.knownExposure = (group.knownExposure ?? 0) + input.exposure.amount;
    else group.unknownExposures += 1;
    if (input.repeat) group.repeats += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      order(a.storeId).localeCompare(order(b.storeId), 'en') ||
      order(a.brandId).localeCompare(order(b.brandId), 'en') ||
      a.typeCode.localeCompare(b.typeCode, 'en'),
  );
}
