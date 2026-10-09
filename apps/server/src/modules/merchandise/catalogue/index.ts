// Public interface of merchandise · catalogue (module-map 4.12). Other code imports only from here.
export { CatalogueModule } from './catalogue.module.js';
export { CATALOGUE } from './tokens.js';
export { Catalogue } from './catalogue.js';
export type { CatalogueDependencies, CatalogueInterface } from './catalogue.js';
export { catalogueApprovals } from './commands/effects.js';
export { catalogueScopeMembers } from './queries/scope.js';
export type { CataloguePage, CatalogueRecord, PageRequest } from './queries/records.js';
