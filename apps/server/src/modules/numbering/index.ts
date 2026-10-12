// Public interface of the numbering module (module-map 4.6; numbering-and-audit 3). Other code imports only from here.
export { NumberingModule } from './numbering.module.js';
export { NUMBERED_KINDS, NUMBERING } from './tokens.js';
export { Numbering } from './numbering.js';
export type { NumberingDependencies, NumberingInterface } from './numbering.js';
export type { Allocated, AllocationRequest } from './commands/allocate.js';
export type { FormatVersion } from './commands/define-format.js';
export type {
  FinancialYearDraft,
  FinancialYearRead,
  KindFormatRead,
  SettingOrigin as NumberingSettingOrigin,
} from './commands/settings.js';
export type { SeriesDefinition } from './commands/define-series.js';
export type { FormatPart } from './domain/format.js';
export type { NumberedKind, NumberingResult } from './domain/kinds.js';
export type { SeriesKey, SeriesState } from './queries/series.js';
// Reads with no instance, for a check another module runs, such as the devices readiness check (offline-counter 11;
// S1-F12-T02): the financial year of a date, the format in force for a kind, and the live series of a key.
export { financialYearOn, kindFormatOf } from './commands/settings.js';
export { liveSeries } from './queries/series.js';
export { numberingRestoreParticipant, numberingRestoreSteps } from './restore-participant.js';
// Series after a restore (numbering-and-audit 3.6, 3.7; backup-and-restore 5.3; S1-F14-T03): the pause numbering's
// own after-restore step runs, and the reconciliation `configuration`'s recovery command calls (GC9-8), with no
// instance, as the reads above.
export {
  pauseEverySeriesAfterRestore,
  reconcileAfterRestore,
  reconciliationsAfterRestore,
  seriesAwaitingReconciliation,
} from './commands/after-restore.js';
export type { Reconciled, ReconciliationInput, SeriesAwaitingReconciliation } from './commands/after-restore.js';
export { seriesLockTarget } from './commands/lock-target.js';
