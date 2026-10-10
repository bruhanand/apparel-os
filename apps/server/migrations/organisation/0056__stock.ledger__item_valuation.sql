-- One valuation for an item under moving average (stock-ledger 7.3, 7.5, 13.10, 14.2; PRD-LED-014, PRD-MOD-014;
-- S1-F10-T04). Under moving average the pool's value is one blend, so an outflow, a transfer leg or a customer return
-- of units of several receipt origins is one valuation of the item: its value is the formula's, and the movement's
-- legs name each origin's units. Splitting that value between origins would need a rounding rule (SL-2), which 7.3
-- does not ask for. Such a valuation names no origin. A cost established or a cost adjustment always names the one
-- origin whose cost it is. Runs as aos_migration (code-house-rules 5.1). Compatible with the version running: it
-- only lets a column be null, and every existing row names its origin (code-house-rules 4.2).
alter table stock.valuation alter column receipt_origin_id drop not null;
alter table stock.valuation add constraint valuation_origin_named
  check (receipt_origin_id is not null or event_kind not like 'stock.cost-%');
