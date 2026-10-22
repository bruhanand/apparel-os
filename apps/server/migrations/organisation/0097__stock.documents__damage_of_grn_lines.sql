-- Where the damage reports on a GRN's lines stand, for `receiving` (goods-in 4.6, 4.9, 5.1, 5.4; S2-F02-T03). A GRN's
-- PT is uploaded only once every held line is decided, damage reported on its goods among them, and covers its good
-- pieces, those under a confirmed damage report left out (goods-in 5.1, 5.4; DEC-137). Whoever reads that may not see
-- the damage reports themselves, which belong to Operations' record type, so their decision would otherwise be hidden
-- and a GRN read as ready that is not. Runs as aos_migration, which owns the function and the tables it reads
-- (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).

-- The narrowly authorised read (code-house-rules 6.2; DEC-117): for each report naming one of the GRN lines given, its
-- identifier, the line, its quantity and its state, Submitted while its latest round waits, else that round's
-- outcome, Confirmed or Rejected (goods-in 8.5). Never what is wrong, the photos or who reported or decided it.
create function stock.damage_of_grn_lines(grn_line_ids uuid[])
  returns table (damage_report_id uuid, grn_line_id uuid, quantity integer, state text)
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select r.id, r.grn_line_id, r.quantity,
         coalesce((select d.outcome
                     from stock.damage_round ro
                     left join stock.damage_decision d on d.damage_round_id = ro.id
                    where ro.damage_report_id = r.id
                    order by ro.round_number desc
                    limit 1), 'Submitted')
  from stock.damage_report r
  where r.goods_kind = 'grn-line'
    and r.grn_line_id = any (damage_of_grn_lines.grn_line_ids)
$$;
revoke execute on function stock.damage_of_grn_lines(uuid[]) from public;
grant execute on function stock.damage_of_grn_lines(uuid[]) to aos_runtime;

-- A report is found by the GRN line it names (code-house-rules 3.3).
create index damage_report_grn_line on stock.damage_report (grn_line_id);
