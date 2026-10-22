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
// The approved values of an attribute in force on a date (4.2), for `receiving`'s size of a count line (goods-in 4.3;
// S2-F02-T02).
export { vocabularyOn } from './queries/records.js';
// The attribute marked as the season or the size list at the command's start, or not set with its refusal (4.2 "As
// built"; RR-550, RR-556), for a budget's season and a count line's size (goods-in 3.3, 4.3).
export { markedAttributeAt } from './queries/marks.js';
export type { MarkedAttributeAt } from './queries/marks.js';
// What `merchandise` · PT reads for a PT file (goods-in 5.2, 5.3, 5.5; S2-F04-T02): the brands and categories in force
// by code, the item map of the item marking in force (RR-583), the brand's styles and SKUs the file names, and the
// SKUs its barcodes name under the brand.
export { barcodeSkusOn, brandProductsOn, brandsAndCategoriesOn, itemMapOf } from './queries/pt-file.js';
export type { BarcodeSku, BrandSku, BrandStyle } from './queries/pt-file.js';
export type { SiteChangeActor, SiteChangeRequest } from './commands/tracking.js';
export { codeMappingChanged, productConfirmed, trackingProfileChanged } from './events.js';
export { catalogueRestoreParticipant } from './restore-participant.js';
// The tracking profiles as policy 4's values, for the policy gate (module-map 4.4; goods-in 10.5; RR-558).
export { TRACKING_PROFILES_CHECK, trackingProfilesCheck } from './queries/validity.js';
// The new products a PT approval confirms, with the barcodes of its rows, and the SKU code kind it draws their codes
// from (goods-in 6.3 step 2, 6.6; structure-and-masters 4.2, 4.3 "As built with S2-F06-T01"; RR-585).
export { checkPtProducts, confirmPtProducts, mapPtBarcodes, ptProductLockTargets } from './commands/pt-products.js';
export type { CheckedPtProducts, PtConfirmer, PtProductRequest } from './commands/pt-products.js';
export { SKU_CODE_KIND, SKU_CODE_SCOPE_KEY } from './domain/kinds.js';
