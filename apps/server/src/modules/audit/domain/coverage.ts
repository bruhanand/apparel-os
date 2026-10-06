/** One monthly partition of an audit table: [lower, upper) of recording time. */
export interface PartitionBound {
  readonly parent: string;
  readonly lower: Date;
  readonly upper: Date;
}

export interface Coverage {
  /** The end of the unbroken run of partitions from the current month that every table has; null if one has none. */
  readonly coveredUntil: Date | null;
  /** Whether every table can take rows through the end of next month (numbering-and-audit 4.4; CH-5). */
  readonly coversNextMonth: boolean;
}

/** The start of the UTC month `months` after the one holding `at`. Partitions are by UTC month. */
export function utcMonthStart(at: Date, months = 0): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, 1));
}

/**
 * How far the partitions reach, from the month holding `at`, for each of the parents, as the least of them. A gap
 * ends the run: a row recorded in the missing month would have nowhere to go.
 */
export function coverageFrom(parents: readonly string[], bounds: readonly PartitionBound[], at: Date): Coverage {
  const start = utcMonthStart(at);
  let least: Date | null | undefined;
  for (const parent of parents) {
    const byLower = new Map(
      bounds.filter((bound) => bound.parent === parent).map((bound) => [bound.lower.getTime(), bound.upper]),
    );
    let reach = start;
    for (let next = byLower.get(reach.getTime()); next !== undefined; next = byLower.get(reach.getTime())) {
      reach = next;
    }
    const until = reach.getTime() === start.getTime() ? null : reach;
    if (least === undefined || until === null || (least !== null && until < least)) least = until;
  }
  const coveredUntil = least ?? null;
  return {
    coveredUntil,
    coversNextMonth: coveredUntil !== null && coveredUntil.getTime() >= utcMonthStart(at, 2).getTime(),
  };
}
