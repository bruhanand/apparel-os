// Public interface of the pos module (module-map 4.17; offline-counter 12.1). Other code imports only from here.
export { PosModule } from './pos.module.js';
export { POS } from './tokens.js';
export { Pos } from './pos.js';
export type { PosInterface } from './pos.js';
export type { Actor as PosActor, Enrolment, PosDependencies } from './commands/devices.js';
export { BILL_KIND, BILLING_DEVICE_TYPE } from './domain/kinds.js';
export { deviceEnded, deviceEnrolled, deviceRegistered } from './events.js';
// The devices readiness check, a read with no instance, for `site-lifecycle` (offline-counter 11; S1-F12-T02).
export { unitDevicesCheck } from './queries/devices-check.js';
export { POS_IDENTITY, posConsumers } from './jobs/consumers.js';
export { posRestoreParticipant } from './restore-participant.js';
// The approval rules and decision effects of the financial-year and bill-format changes, for the composition root
// (access-and-approvals 9.8b; offline-counter 4.3b; S1-F12-T03).
export { posApprovals } from './commands/numbering-changes.js';
