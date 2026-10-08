// Public interface of the organisation module (module-map 4.11). Other code imports only from here.
export { OrganisationModule } from './organisation.module.js';
export { ORGANISATION } from './tokens.js';
export { Organisation } from './organisation.js';
export type { OrganisationDependencies, OrganisationInterface } from './organisation.js';
export { organisationApprovals } from './commands/effects.js';
export type { Prepared, Preparer } from './commands/common.js';
export type { NamedKind, PreparedVersion } from './commands/prepare.js';
export { actionTypeOf, masterKinds, organisationApprovalRules, recordTypeOf } from './domain/kinds.js';
export type { MasterKind } from './domain/kinds.js';
export type { InForce, PageRequest, RecordPage, RecordView, Structure } from './queries/records.js';
export { structureChanged } from './events.js';
