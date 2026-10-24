-- The Arrivals of a supplier found by their supplier (code-house-rules 3.3; goods-in 9.5; S2-F11-T02; code review 9 of
-- stage 2): the supplier report and the receipt problems report filter `receiving`'s GRN lines by the supplier of
-- their Arrival. Runs as aos_migration, which owns the table (code-house-rules 5.1). Compatible with the version
-- running: it only adds an index (code-house-rules 4.2).
create index arrival_supplier on receiving.arrival (supplier_party_id);
