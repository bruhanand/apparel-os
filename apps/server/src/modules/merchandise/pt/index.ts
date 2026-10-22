// Public interface of `merchandise` · PT (module-map section 5; goods-in 5, 6, 10.1). Other code imports only from here.
export { PtModule } from './pt.module.js';
export { PT, PT_POSTING_QUEUE } from './tokens.js';
export { Pt } from './pt.js';
export type { PtDependencies, PtInterface } from './pt.js';
export { ptApprovals } from './commands/pt-decision.js';
export type { PtPostingQueue } from './commands/pt-decision.js';
// The PT number kind, the stock caller, the gate's operations and the posting job of a large PT (goods-in 6.3, 6.6,
// 10.4, 10.5; stock-ledger 13.2; S2-F06-T01), which the composition roots hand to the modules below.
export { PT_KIND, PT_POSTED_WITH_DECISION_ROWS, PT_SCOPE_KEY, ptStockCaller } from './domain/kinds.js';
export {
  APPROVE_PT,
  APPROVE_PT_POSTING,
  APPROVE_PT_STATUTORY,
  APPROVE_PT_TERMS,
  PT_APPROVAL_CAPABILITY,
  PT_OPERATIONS,
} from './domain/gate.js';
export { PT_POSTING_IDENTITY, ptPostingConsumer } from './jobs/posting.js';
export { ptApproved, ptPostRequested } from './events.js';
export { ptRestoreParticipant } from './restore-participant.js';
