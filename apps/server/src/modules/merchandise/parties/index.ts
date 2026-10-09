// Public interface of merchandise · parties (module-map 4.12). Other code imports only from here.
export { PartiesModule } from './parties.module.js';
export { PARTIES } from './tokens.js';
export { Parties } from './parties.js';
export type { PartiesDependencies, PartiesInterface } from './parties.js';
export { partiesApprovals } from './commands/effects.js';
export { agreementChanged } from './events.js';
export { partiesSupplierRoles } from './queries/supplier-roles.js';
export type { Page, PageRequest } from './queries/records.js';
