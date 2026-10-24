-- A PT's origin found by the receipt origin it made, for `reports`' stock report (goods-in 9.5; S2-F11-T02; code
-- review 8 of stage 2). The stock report's MRP value reads the MRP of a piece from the PT whose approval made its
-- receipt origin (`pt_origin`, goods-in 6.6), under the reader's own actor, so row-level security shows it only to a
-- reader who may see the PT, and it is Unknown to anyone else (code-house-rules 6.2; DEC-117; PRD-MOD-015). Runs as
-- aos_migration, which owns the table (code-house-rules 5.1). Compatible with the version running: it only adds an
-- index (code-house-rules 4.2).

-- A PT's origin is found by the receipt origin it made (code-house-rules 3.3).
create index pt_origin_receipt_origin on merchandise.pt_origin (receipt_origin_id);
