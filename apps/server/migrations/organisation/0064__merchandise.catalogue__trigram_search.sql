-- Trigram search for the suggestions an import handler offers from its own records (imports-and-opening-data 5
-- "Suggestions", 13.2; structure-and-masters 7; PRD Stack: Search, "PostgreSQL full-text and trigram search";
-- PRD-IMP-009; S1-F06-T03). Runs as aos_migration (code-house-rules 5.1). Compatible with the version running: it only
-- adds an extension (code-house-rules 4.2). pg_trgm is a trusted extension shipped with PostgreSQL, as btree_gist is
-- (0005); its functions keep PostgreSQL's own grants. No index is added: the masters a suggestion searches are small,
-- and an index waits for a measured need (PRD-PRF-001).

create extension if not exists pg_trgm schema public;
