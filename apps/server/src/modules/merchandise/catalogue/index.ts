// Public interface of merchandise · catalogue (module-map 4.12). Other code imports only from here.
export { CatalogueModule } from './catalogue.module.js';
export { CATALOGUE } from './tokens.js';
export { Catalogue } from './catalogue.js';
export type { CatalogueDependencies, CatalogueInterface } from './catalogue.js';
export { catalogueApprovals } from './commands/effects.js';
export { catalogueScopeMembers } from './queries/scope.js';
export type { CataloguePage, CatalogueRecord, PageRequest } from './queries/records.js';
// Whether a brand exists and is in force, not retired, on a date: for the parties part's links and agreements
// (structure-and-masters 5.1, 5.2; module-map 4.12; S1-F03-T03).
export { brandExists, brandInForce, unitBrandsOn } from './queries/brands.js';
// The contracts the catalogue defines and others implement (module-map section 3, rule 6; S1-F03-T02): stock presence,
// which `stock` · ledger answers, and supplier roles, which the parties part answers.
export { STOCK_PRESENCE } from './contracts/stock-presence.js';
export type { StockPresence } from './contracts/stock-presence.js';
export { SUPPLIER_ROLES } from './contracts/supplier-roles.js';
export type { SupplierRoles } from './contracts/supplier-roles.js';
// Read a SKU as of a date at a Site (structure-and-masters 4.7), for the stock ledger's SKU read (stock-ledger 13.9).
export { skuOn } from './queries/sku.js';
export type { SiteChangeActor, SiteChangeRequest } from './commands/tracking.js';
export { codeMappingChanged, productConfirmed, trackingProfileChanged } from './events.js';
