// Public interface of `receiving` (module-map section 5; goods-in 10.1). Other code imports only from here.
export { ReceivingModule } from './receiving.module.js';
export { RECEIVING } from './tokens.js';
export { Receiving } from './receiving.js';
export type { IssueNeeds, ReceivingDependencies, ReceivingInterface } from './receiving.js';
export { GRN_KIND, GRN_SCOPE_KEY, receivingStockCaller } from './domain/kinds.js';
export { HELD_LINE_DECISIONS, RECEIVE_GOODS, RECEIVE_GOODS_STATUTORY, RECEIVING_CAPABILITY } from './domain/gate.js';
export { receivingApprovals } from './approvals.js';
export { receivingExceptionTypes } from './exception-types.js';
export type { GoodPiecesPart, PtBasis, ReceiptProblem, ReceiptProblemsQuery } from './queries/held-lines.js';
// The GRN's "PT attached" mark, which `merchandise` · PT reads, sets and clears (goods-in 5.8; S2-F04-T02).
export type { GrnForPt, PtMark, PtMarkChangeView } from './queries/pt-mark.js';
export { grnIssued, heldLineDecided } from './events.js';
export { receivingRestoreParticipant } from './restore-participant.js';
// The read models of the stage 2 reports, served through the read-model gateway (goods-in 9.5; S2-F11-T02).
export {
  RECEIVING_GRN_NAMES,
  RECEIVING_RECEIPT_PROBLEMS,
  RECEIVING_REPORT_LINES,
  receivingReadModels,
} from './queries/report-reads.js';
export type { ReportGrnLine } from './queries/report-reads.js';
