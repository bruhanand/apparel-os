-- A brand's barcode on more than one SKU (structure-and-masters 4.3 "As built with S2-F04-T01"; PRD-MER-007 as
-- reworded by DEC-135; RR-547). A brand's tags may repeat one barcode across products, so an active mapping of a
-- supplier barcode may name another SKU in an overlapping scope over overlapping dates: it is kept, flagged as
-- repeated when read, and Resolve answers every candidate for the person to choose from, never one silently. Every
-- other kind keeps the rule of 0047: one target per code, kind and scope on any date. For every kind, one code never
-- names two units of one SKU in one scope, since choosing a product could not tell them apart. Runs as aos_migration
-- (code-house-rules 5.1).
--
-- Each mapping keeps its code's kind, held equal to its code row's by a foreign key, so the exclusion constraints can
-- tell a supplier barcode from the other kinds. The rows already mapped take their code row's kind: the guard of 0047
-- is set aside for that one fill, as it refuses any change but an earlier end, and set back at once.
--
-- Not compatible with the version running (code-house-rules 4.2): the code deployed before this migration writes a
-- mapping without its kind, so between this migration and the new version taking traffic Map a code fails. Accepted
-- as a planned brief interruption of the test setup, which holds only synthetic data (DEC-120).

alter table merchandise.external_code_key
  add constraint external_code_key_id_kind unique (id, kind);

alter table merchandise.external_code disable trigger guard_external_code_change;
alter table merchandise.external_code add column kind text;
update merchandise.external_code c set kind = k.kind
  from merchandise.external_code_key k
  where k.id = c.code_key_id;
alter table merchandise.external_code enable trigger guard_external_code_change;

alter table merchandise.external_code
  alter column kind set not null,
  add constraint external_code_kind foreign key (code_key_id, kind)
    references merchandise.external_code_key (id, kind),
  drop constraint external_code_no_conflict,
  -- Every kind but a supplier barcode: another target in the same scope over overlapping dates is refused (0047).
  add constraint external_code_no_conflict exclude using gist
    (code_key_id with =, scope_kind with =, scope_key with =, valid_during with &&, target with <>)
    where (not alias and kind <> 'supplier-barcode'),
  -- Every kind: the same SKU in another unit, in the same scope over overlapping dates, is refused.
  add constraint external_code_one_unit exclude using gist
    (code_key_id with =, scope_kind with =, scope_key with =, valid_during with &&, sku_id with =, target with <>)
    where (not alias);
create index external_code_code_key_kind on merchandise.external_code (code_key_id, kind);
