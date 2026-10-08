// Public interface of the numbering module (module-map 4.6; numbering-and-audit 3). Other code imports only from here.
export { NumberingModule } from './numbering.module.js';
export { NUMBERED_KINDS, NUMBERING } from './tokens.js';
export { Numbering } from './numbering.js';
export type { NumberingDependencies, NumberingInterface } from './numbering.js';
export type { Allocated, AllocationRequest } from './commands/allocate.js';
export type { FormatVersion } from './commands/define-format.js';
export type { SeriesDefinition } from './commands/define-series.js';
export type { FormatPart } from './domain/format.js';
export type { NumberedKind, NumberingResult } from './domain/kinds.js';
export type { SeriesKey, SeriesState } from './queries/series.js';
