import type { LockTarget, TransactionContext } from '../../kernel/index.js';
import { allocate, type Allocated, type AllocationRequest } from './commands/allocate.js';
import { changeState } from './commands/change-state.js';
import { defineFormatVersion, type FormatVersion } from './commands/define-format.js';
import { defineSeries, type SeriesDefinition } from './commands/define-series.js';
import { seriesLockTarget } from './commands/lock-target.js';
import type { FormatPart } from './domain/format.js';
import { checkKinds, type NumberedKind, type NumberingResult } from './domain/kinds.js';
import { liveSeries, seriesRow, stateOf, type SeriesKey, type SeriesState } from './queries/series.js';

export interface NumberingDependencies {
  /** The kinds the owning modules declare, handed over by the composition root (module-map section 3, rule 6). */
  readonly kinds: readonly NumberedKind[];
}

/**
 * The numbering module's interface (module-map 4.6; numbering-and-audit 3.7), as built by S1-F08-T01. Every operation
 * joins the owning module's transaction through its context (code-house-rules 8.1); the owning module has validated
 * the scope and authorised the action. `numbering` calls no other module. Record used numbers arrives with the offline
 * upload (GC-8); the pause after a restore with S1-F14 (3.6).
 */
export interface NumberingInterface {
  /** Adds the next version of a format, creating the format on its first version (3.5). */
  defineFormatVersion(
    context: TransactionContext,
    code: string,
    parts: readonly FormatPart[],
  ): Promise<NumberingResult<FormatVersion>>;
  /** Define a series (3.7). */
  defineSeries(context: TransactionContext, definition: SeriesDefinition): Promise<NumberingResult<SeriesState>>;
  /** The open or paused series of a kind, scope key and year, to lock and draw from (3.1, 3.2). */
  liveSeries(context: TransactionContext, key: SeriesKey): Promise<SeriesState | undefined>;
  /** The lock target of a series row, for the command's lock call at step 8 (stock-ledger 10.3; code-house-rules 8.2). */
  seriesLockTarget(seriesId: string): LockTarget;
  /** Allocate, from a series the command holds (3.2). */
  allocate(context: TransactionContext, request: AllocationRequest): Promise<NumberingResult<Allocated>>;
  pause(context: TransactionContext, seriesId: string): Promise<NumberingResult<SeriesState>>;
  release(context: TransactionContext, seriesId: string): Promise<NumberingResult<SeriesState>>;
  /** Final: a closed series is never reopened or continued (PRD-LIF-015, PRD-OFF-010). */
  close(context: TransactionContext, seriesId: string): Promise<NumberingResult<SeriesState>>;
  /** Read series state: the financial year and the next sequence number (PRD-OFF-012). */
  seriesState(context: TransactionContext, seriesId: string): Promise<SeriesState | undefined>;
}

export class Numbering implements NumberingInterface {
  private readonly kinds: ReadonlyMap<string, NumberedKind>;

  constructor(dependencies: NumberingDependencies) {
    this.kinds = checkKinds(dependencies.kinds);
  }

  defineFormatVersion(context: TransactionContext, code: string, parts: readonly FormatPart[]) {
    return defineFormatVersion(context, code, parts);
  }

  defineSeries(context: TransactionContext, definition: SeriesDefinition) {
    return defineSeries(context, this.kinds, definition);
  }

  liveSeries(context: TransactionContext, key: SeriesKey) {
    return liveSeries(context, key);
  }

  seriesLockTarget(seriesId: string): LockTarget {
    return seriesLockTarget(seriesId);
  }

  allocate(context: TransactionContext, request: AllocationRequest) {
    return allocate(context, request);
  }

  pause(context: TransactionContext, seriesId: string) {
    return changeState(context, seriesId, 'pause');
  }

  release(context: TransactionContext, seriesId: string) {
    return changeState(context, seriesId, 'release');
  }

  close(context: TransactionContext, seriesId: string) {
    return changeState(context, seriesId, 'close');
  }

  async seriesState(context: TransactionContext, seriesId: string) {
    const row = await seriesRow(context, seriesId);
    return row === undefined ? undefined : stateOf(row);
  }
}
