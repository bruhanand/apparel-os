// Public interface of finance · tax rules (module-map 4.14; shared-calculations 10). Other code imports only from here.
export { TaxRulesModule } from './tax-rules.module.js';
export { TAX_RULES } from './tokens.js';
export { TaxRules } from './tax-rules.js';
export type { TaxRulesDependencies, TaxRulesInterface } from './tax-rules.js';
export { taxRulesApprovals } from './commands/effects.js';
export { calculationInputs } from './queries/read.js';
export type { PageRequest, TaxRulesQuery } from './queries/read.js';
