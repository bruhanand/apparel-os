// Public interface of `stock` · documents (module-map section 5; goods-in 10.1). Other code imports only from here.
export { StockDocumentsModule } from './stock-documents.module.js';
export { STOCK_DOCUMENTS } from './tokens.js';
export { StockDocuments, damageExceptionType } from './documents.js';
export type {
  DamageActor,
  DamageReportOptions,
  StockDocumentsDependencies,
  StockDocumentsInterface,
} from './documents.js';
export type { CountDamageReady } from './commands/count-damage-ready.js';
export type { CountDamagePlace, CountDamageWritten } from './commands/record-count-damage.js';
export type { GrnLineDamage } from './queries/grn-lines.js';
export {
  DAMAGE_CAPABILITY,
  DAMAGE_EXCEPTION_TYPE,
  DAMAGE_REPORT_KIND,
  DAMAGE_REPORT_SCOPE_KEY,
  DAMAGE_REPORTS,
  stockDocumentsStockCaller,
} from './domain/kinds.js';
export { stockDocumentsApprovals } from './commands/effects.js';
export type { EffectServices as DamageEffectServices } from './commands/effects.js';
export { damageConfirmed, damageRejected, damageReported, damageReversed } from './events.js';
export { stockDocumentsRestoreParticipant } from './restore-participant.js';
// The damage reports' states, served through the read-model gateway for the stage 2 reports (goods-in 9.5; S2-F11-T02).
export { STOCK_DAMAGE_REPORT_STATES, stockDocumentsReadModels } from './queries/report-states.js';
export type { DamageReportStateRow } from './queries/report-states.js';
