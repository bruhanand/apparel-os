// The selling entry point, @apparel-os/calculations (shared-calculations 2.1, 11): price, offers, spread, tax,
// rounding, tenders and returns. The counter runs this same code (PRD-MOD-007). It imports only @apparel-os/domain and
// reads no database, network, clock, randomness or environment: the date and every rule come in as inputs. Costing and
// ticket margin are the separate entry point @apparel-os/calculations/costing, which only the server imports (2.3).

export { canonicalJson } from './canonical.js';
export { type EffectiveDates, type IsoDate, isInForce } from './dates.js';
export { type DecimalString, parseDecimal } from './numbers/decimal.js';
export {
  type RoundingMode,
  type RoundingRule,
  type TaxRoundingRule,
  ROUNDING_MODES,
  roundByRule,
  roundToInteger,
} from './numbers/rounding.js';
export { type Fraction, fraction } from './numbers/fraction.js';
export { type Refusal, type RefusalCode, type Result } from './result.js';

export { priceBill } from './pricing/price-bill.js';
export { spreadGroupDiscount } from './pricing/spread.js';
export { listApplicableOffers } from './pricing/list-offers.js';
export type { ApplicableOffer, ListOffersInput, OfferListing } from './pricing/list-offers.js';
export type {
  BillLineInput,
  CombinationRule,
  LineTax,
  ManualDiscount,
  Offer,
  OfferAmount,
  OfferRef,
  OfferTerms,
  PriceBillInput,
  PricedBill,
  PricedLine,
  PriceList,
  SlabChange,
  StartPriceSource,
  TaxComponentAmount,
} from './pricing/types.js';

export { assertApplicability, assertRateRule, assertTaxRoundingRule, versionInForce } from './tax-rules/records.js';
export type {
  BoundSide,
  ComparedValue,
  DatedVersion,
  GoodsClassification,
  PriceBasis,
  RegistrationApplicability,
  RoundingRulesInForce,
  TaxComponentShare,
  TaxRateRule,
  TaxRulesInForce,
  TaxSlab,
} from './tax-rules/records.js';

export { CASH, checkTenders, pricedBillReference } from './tenders/check-tenders.js';
export type { CheckedTenders, CheckTendersInput, TenderAllocation, TenderLine } from './tenders/check-tenders.js';

export { returnValue } from './returns/return-value.js';
export type { ReturnValue, ReturnValueInput } from './returns/return-value.js';
export { exchangeDifference } from './returns/exchange.js';
export type { CheaperReplacementRule, ExchangeDifference, ExchangeInput } from './returns/exchange.js';
export { splitRefund } from './returns/split-refund.js';
export type { OriginalTender, SplitRefund, SplitRefundInput } from './returns/split-refund.js';
