-- The products a stock search names by a text (goods-in 9.2, 9.4; structure-and-masters 4.1; PRD-STK-006; PRD Stack:
-- Search, "PostgreSQL full-text and trigram search"; S2-F11-T01). A person types part of a style code, a SKU code or a
-- brand's article number, and the catalogue finds it with `ilike`, ignoring case; a trigram index serves that search
-- as the catalogue grows, where a b-tree cannot serve a part of a code. pg_trgm is installed already (0064). Runs as
-- aos_migration, which owns the tables (code-house-rules 5.1). Compatible with the version running: it only adds
-- (code-house-rules 4.2).

create index style_code_trigram on merchandise.style using gin (code public.gin_trgm_ops);
create index sku_code_trigram on merchandise.sku using gin (code public.gin_trgm_ops);
create index style_version_article_number_trigram
  on merchandise.style_version using gin (brand_article_number public.gin_trgm_ops);
