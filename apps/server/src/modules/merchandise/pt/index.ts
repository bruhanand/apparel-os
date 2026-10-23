// Public interface of `merchandise` · PT (module-map section 5; goods-in 5, 6, 10.1). Other code imports only from here.
export { PtModule } from './pt.module.js';
export { PT, PT_POSTING_QUEUE } from './tokens.js';
export { Pt } from './pt.js';
export type { PtDependencies, PtInterface } from './pt.js';
export { ptApprovals } from './commands/pt-decision.js';
export type { PtPostingQueue } from './commands/pt-decision.js';
// What the composition roots hand to the modules below (goods-in 6.3, 6.6, 10.4; stock-ledger 13.2; S2-F06-T01): the
// PT number kind, the stock caller, the rows above which an approval posts through the queued job, the posting
// consumers the worker composes, and the exception type a refused posting raises.
export { PT_KIND, PT_POSTED_WITH_DECISION_ROWS, ptStockCaller } from './domain/kinds.js';
export { ptPostingConsumers } from './jobs/posting.js';
export { ptExceptionTypes } from './exception-types.js';
export { ptApproved, ptPostingFailed, ptPostRequested } from './events.js';
export { ptRestoreParticipant } from './restore-participant.js';
// The MRP of the goods a PT established, through the read-model gateway, for the stage 2 stock report (goods-in 9.5;
// S2-F11-T02).
export { PT_ORIGIN_MRP, ptReadModels } from './queries/origin-mrp.js';
