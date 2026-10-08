// Public interface of the organisation module (module-map 4.11). Other code imports only from here.
export { OrganisationModule } from './organisation.module.js';
export { ORGANISATION } from './tokens.js';
export { Organisation } from './organisation.js';
export type { MasterList, NamedKind, OrganisationDependencies, OrganisationInterface } from './organisation.js';
export { organisationApprovals } from './commands/changes.js';
export type { Prepared, PreparedVersion, Preparer } from './commands/changes.js';
export { actionTypeOf, masterKinds, organisationApprovalRules, recordTypeOf } from './domain/kinds.js';
export type { MasterKind } from './domain/kinds.js';
export type { Structure } from './queries/records.js';
export { structureChanged } from './events.js';
