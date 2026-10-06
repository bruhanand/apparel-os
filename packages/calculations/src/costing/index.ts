// The costing entry point, @apparel-os/calculations/costing (shared-calculations 2.1, section 8). Only the server
// imports it; the counter bundle never holds it (2.3; PRD-OFF-004). Nothing in the selling entry point imports this
// folder, and the module check refuses an import into it from anywhere else in the package.

export { costLine, matchCost, ticketMargin } from './costing.js';
export type { CostingProfile, CostingStep, CostLine, CostLineInput, CostMatch, MatchingTolerance } from './costing.js';
