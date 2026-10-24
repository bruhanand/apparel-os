-- A receipt origin found by the source line that made it (stock-ledger 13.6, 13.16; goods-in 4.9, 5.4; S2-F02-T03).
-- `receiving` reads the origin each GRN line's count made, once a line, for what the PT reads of a GRN (`ptBasis`),
-- and a damage report on a GRN line names its goods by it (goods-in 8.5), so the lookup by `source_line_id` has an
-- index (code-house-rules 3.3). Runs as aos_migration, which owns the table. Compatible with the version running: it
-- only adds (code-house-rules 4.2).

create index receipt_origin_source_line on stock.receipt_origin (source_line_id);
