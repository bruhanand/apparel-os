-- Only a barcode recorded under a brand repeats across products (structure-and-masters 4.3 "As built with
-- S2-F04-T01"; PRD-MER-007 as written; RR-554, decided by the product owner, 21 Oct 2026). A supplier barcode recorded
-- under a brand may still name another SKU in that brand's scope over overlapping dates (0084); one recorded for a
-- supplier or for the whole Organisation names one target on any date again, as every other kind does (0047). So the
-- exclusion constraint of the same scope leaves out only a brand's supplier barcodes. The second constraint of 0084,
-- one unit of a SKU for every kind and scope, stays. The cross-scope case is the service's, under the code's lock.
-- Runs as aos_migration (code-house-rules 5.1).
--
-- Compatible with the version running (code-house-rules 4.2): it only narrows what is accepted, and the code deployed
-- before it answers the constraint's refusal as merchandise.code-conflict. A database that already holds a supplier's
-- or the Organisation's barcode on two SKUs over overlapping dates, which only the version of 0084 could record,
-- cannot take the constraint, and the migration fails there; 0084 and this migration were written on one branch before
-- either was deployed, so no shared environment holds such a mapping.

alter table merchandise.external_code
  drop constraint external_code_no_conflict,
  -- Every mapping but a supplier barcode recorded under a brand: another target in the same scope over overlapping
  -- dates is refused (0047).
  add constraint external_code_no_conflict exclude using gist
    (code_key_id with =, scope_kind with =, scope_key with =, valid_during with &&, target with <>)
    where (not alias and not (kind = 'supplier-barcode' and scope_kind = 'brand'));
