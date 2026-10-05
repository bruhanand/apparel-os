// Business dates and effective dating. The package reads no clock: the business date always comes in as an input
// (shared-calculations 2.1). A version is in force from its start date up to its end date or open-ended; a new
// version ends the one before on its own start date, so the end date is the first day it is no longer in force
// (structure-and-masters 2.2, PRD-MOD-010).

/** An ISO calendar date, `YYYY-MM-DD`, under the Organisation's timezone (PRD-MOD-009). */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertIsoDate(date: IsoDate, what: string): void {
  const match = ISO_DATE.exec(date);
  if (match === null) throw new RangeError(`${what} must be an ISO date (YYYY-MM-DD), got "${date}"`);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new RangeError(`${what} is not a calendar date: ${date}`);
}

/** The dates a version or an offer is in force: from `effectiveFrom`, up to but not including `effectiveTo`. */
export interface EffectiveDates {
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo?: IsoDate;
}

export function isInForce(dates: EffectiveDates, on: IsoDate): boolean {
  assertIsoDate(on, 'The business date');
  assertIsoDate(dates.effectiveFrom, 'effectiveFrom');
  if (dates.effectiveTo !== undefined) assertIsoDate(dates.effectiveTo, 'effectiveTo');
  // ISO dates of one fixed width order as text.
  return dates.effectiveFrom <= on && (dates.effectiveTo === undefined || on < dates.effectiveTo);
}
