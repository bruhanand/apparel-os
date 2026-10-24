-- The goods a PT revision covers, for `receiving`'s scan-in and `merchandise` · PT's reversal (goods-in 6.7, 7.2, 7.3,
-- 7.5; stock-ledger 13.20; S2-F07-T01, S2-F09-T01; code review 8 of stage 2). Runs as aos_migration, which owns the
-- function and the tables it reads (code-house-rules 5.1). Compatible with the version running: it only adds
-- (code-house-rules 4.2).
--
-- Every read a person sees of these goods, the inbox's, the scan-in's and the reversal's refusals naming the receipt
-- origins, reads the ledger's rows under the reader's own actor, so row-level security keeps out what the reader may
-- not see (code-house-rules 6.2; goods-in 9.1; PRD-SEC-005). A PT's reversal must still respect goods its actor cannot
-- see: the narrowly authorised recheck below answers only whether any piece the revision covers is no longer waiting
-- where its approval left it, never which piece, where, how many or why, so the reversal refuses generically
-- (code-house-rules 6.2; DEC-117).

-- An origin is found by the revision covering it (code-house-rules 3.3).
create index receipt_origin_state_pt_revision on stock.receipt_origin_state (pt_revision_id);

-- Whether any piece the PT revision covers is no longer waiting where its approval left it, whatever the actor may see
-- (goods-in 6.4, 6.7, 8.4; RR-614): an origin the revision covers with none of its units in custody, or with a balance
-- in custody holding accepted units, units in another condition than good, or units a hold outside reservations
-- claims. Asked only by a PT reversal's checks, under the PT's and the GRN's row locks at step 1, and again under the
-- ledger's locks at its approval, after the actor's own rows found none: true then means only goods the actor may not
-- see block it. It answers only that, never a row or a count (DEC-117). SECURITY DEFINER, owned by the migration role,
-- with a fixed search path, executable only by the runtime role (code-house-rules 5.2).
create function stock.pt_goods_not_waiting(pt_revision_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from stock.receipt_origin_state s
    where s.pt_revision_id = pt_goods_not_waiting.pt_revision_id and s.covered_quantity > 0
      and (
        not exists (select 1 from stock.balance b
                     where b.receipt_origin_id = s.receipt_origin_id and b.held_as = 'custody' and b.quantity > 0)
        or exists (
          select 1 from stock.balance b
          where b.receipt_origin_id = s.receipt_origin_id and b.held_as = 'custody' and b.quantity > 0
            and (b.accepted_quantity > 0 or b.condition <> 'good'
                 or exists (select 1 from stock.hold_claim c join stock.hold h on h.id = c.hold_id
                             where c.balance_id = b.id and c.quantity > 0 and h.within_reservation_id is null))
        )
      )
  )
$$;
revoke execute on function stock.pt_goods_not_waiting(uuid) from public;
grant execute on function stock.pt_goods_not_waiting(uuid) to aos_runtime;
