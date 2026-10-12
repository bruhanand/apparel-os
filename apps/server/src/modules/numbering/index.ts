// Public interface of the numbering module (module-map 4.6; numbering-and-audit 3). Other code imports only from here.
export { NumberingModule } from './numbering.module.js';
export { NUMBERED_KINDS, NUMBERING } from './tokens.js';
export { Numbering } from './numbering.js';
export type { NumberingDependencies, NumberingInterface } from './numbering.js';
export type { Allocated, AllocationRequest } from './commands/allocate.js';
export type { FormatVersion } from './commands/define-format.js';
export type {
  FinancialYearDefined,
  FinancialYearDraft,
  FinancialYearRead,
  KindFormatDetail,
  KindFormatRead,
} from './commands/settings.js';
export type { SeriesDefinition } from './commands/define-series.js';
export type { FormatPart } from './domain/format.js';
// The plain check of a format's parts, for an owning module preparing a format before it is defined (3.5; S1-F12-T03).
export { checkFormat } from './domain/format.js';
export type { NumberedKind, NumberingResult } from './domain/kinds.js';
export type { SeriesKey, SeriesState } from './queries/series.js';
// Reads with no instance, for a check another module runs, such as the devices readiness check (offline-counter 11;
// S1-F12-T02): the financial year of a date, the format in force for a kind, and the live series of a key.
export { financialYearOn, kindFormatOf } from './commands/settings.js';
export { liveSeries } from './queries/series.js';
