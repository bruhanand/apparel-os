// Public interface of `receiving` (module-map section 5; goods-in 10.1). Other code imports only from here.
export { ReceivingModule } from './receiving.module.js';
export { RECEIVING } from './tokens.js';
export { Receiving } from './receiving.js';
export type { ReceivingDependencies, ReceivingInterface } from './receiving.js';
export { GRN_KIND, receivingStockCaller } from './domain/kinds.js';
export { RECEIVE_GOODS, RECEIVE_GOODS_STATUTORY, RECEIVING_CAPABILITY } from './domain/gate.js';
export { grnIssued } from './events.js';
export { receivingRestoreParticipant } from './restore-participant.js';
