-- The stock harness's further document kinds (stock-ledger 15.2; S1-F10 spec 3.2; S1-F10-T06): a damage report, a
-- disposal, a count, a correction (reversal) and an earlier POS's report loaded for checking only (PRD-LIF-014). A
-- test-only migration set, applied by test setup only; every row is SYNTHETIC. Runs as aos_migration.
alter table test_stock_harness.document drop constraint document_kind;
alter table test_stock_harness.document add constraint document_kind check (kind in
  ('receipt', 'pt-approval', 'transfer', 'sale', 'customer-return', 'cost-change', 'supplier-return', 'damage',
   'disposal', 'count', 'reversal', 'earlier-pos-report'));
