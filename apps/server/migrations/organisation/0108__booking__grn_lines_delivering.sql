-- Which GRN lines deliver their pieces to a booking, for `receiving`'s recount (goods-in 3.7, 4.10, 4.11; PRD-REC-019;
-- S2-F02-T05). A recount does not change a GRN line that delivers its pieces to a booking: one linked to a booking line,
-- or waiting in a proposal of late or excess goods (goods-in 4.11 "Design choice"). Whoever proposes or approves a
-- recount may not see the booking, whose rows are scoped as the booking is, so its link would otherwise be hidden and the
-- line read as free when it is not. Runs as aos_migration, which owns the function and the tables it reads
-- (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2).

-- The narrowly authorised read (code-house-rules 6.2; DEC-117), as `stock.damage_of_grn_lines` (migration 0097): for
-- each GRN line given that has a receipt link, or a line in a proposal with no decision yet, the line and which. Never
-- the booking, its line, the quantities or who linked or proposed it.
create function booking.grn_lines_delivering(grn_line_ids uuid[])
  returns table (grn_line_id uuid, delivery text)
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select l.grn_line_id, 'linked'
  from booking.booking_receipt_link l
  where l.grn_line_id = any (grn_lines_delivering.grn_line_ids)
  union
  select p.grn_line_id, 'proposed'
  from booking.booking_receipt_link_proposal_line p
  where p.grn_line_id = any (grn_lines_delivering.grn_line_ids)
    and not exists (select 1
                      from booking.booking_receipt_link_proposal_decision d
                     where d.booking_receipt_link_proposal_id = p.booking_receipt_link_proposal_id)
$$;
revoke execute on function booking.grn_lines_delivering(uuid[]) from public;
grant execute on function booking.grn_lines_delivering(uuid[]) to aos_runtime;
