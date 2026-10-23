-- Goods of a product not yet set up found by a stock search's text (goods-in 9.2, 9.4; stock-ledger 13.22; S2-F11-T01).
-- Before PT approval such goods carry only their style code as counted (13.14), which a person finds by typing part
-- of it, ignoring case, with `ilike`; a trigram index serves that search, as it serves the catalogue's codes (migration
-- `merchandise.catalogue__product_search`). Runs as aos_migration, which owns the table (code-house-rules 5.1).
-- Compatible with the version running: it only adds (code-house-rules 4.2).

create index receipt_origin_described_style_trigram
  on stock.receipt_origin using gin (described_style_code public.gin_trgm_ops);
