-- What the ledger's quantity operations need beyond the tables of 0026 (stock-ledger 13.1 to 13.6, 14.2, 14.3;
-- code-house-rules 5.2, 6.2; PRD-MOD-011, PRD-MOD-012, PRD-STK-008, PRD-STK-009; DEC-117; S1-F10-T02). Runs as
-- aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the version running: it
-- only relaxes a constraint, adds columns to tables no command writes yet, and adds a function (code-house-rules 4.2).

-- 1. A count freeze claims everything in its scope through its scope rows, not through claims (6.2, 8.1), so its
-- release names no claim and no quantity: one release row, by `count-closed`, ends the whole freeze, once
-- (13.5 "End count freeze"; S1-F10-T01 Notes). Every other hold kind still releases one claim, by a quantity.
alter table stock.hold_release alter column hold_claim_id drop not null;
alter table stock.hold_release alter column quantity drop not null;
alter table stock.hold_release drop constraint hold_release_quantity;
alter table stock.hold_release add constraint hold_release_claim check (case
  when hold_kind = 'count-freeze' then hold_claim_id is null and quantity is null and piece_id is null
  else hold_claim_id is not null and quantity > 0 and (piece_id is null or quantity = 1) end);
create unique index hold_release_freeze_once on stock.hold_release (hold_id) where hold_kind = 'count-freeze';

-- 2. Projections rebuildable from the entries (2.1, 14.1; PRD-MOD-012). A claim keeps the quantity it claimed when its
-- hold or reservation was made, never changed, so Rebuild and compare finds what it holds now: what it claimed less its
-- releases or events. A leg keeps how many of its units were accepted, so a balance's accepted quantity is rebuilt
-- from the acceptance records and the legs that carried acceptance with the goods (13.4 "Location move").
alter table stock.hold_claim add column claimed_quantity integer not null;
alter table stock.hold_claim add constraint hold_claim_claimed check (
  claimed_quantity >= quantity and (piece_id is null or claimed_quantity = 1));
alter table stock.reservation_claim add column claimed_quantity integer not null;
alter table stock.reservation_claim add constraint reservation_claim_claimed check (
  claimed_quantity >= quantity and (piece_id is null or claimed_quantity = 1));
alter table stock.movement_leg add column accepted_quantity integer not null;
alter table stock.movement_leg add constraint movement_leg_accepted check (
  accepted_quantity >= 0 and accepted_quantity <= quantity);
-- An acceptance keeps the location and condition of the balance it accepted units at, so the balance's accepted
-- quantity is rebuilt from it (14.2 `acceptance`, with its place).
alter table stock.acceptance add column location_id uuid not null;
alter table stock.acceptance add column condition text not null;
alter table stock.acceptance add constraint acceptance_condition check (
  condition in ('good', 'damaged', 'wrong', 'unidentified'));
create index acceptance_location on stock.acceptance (location_id);

-- 3. The narrowly authorised recheck of what the actor cannot see (14.1, 14.3; code-house-rules 6.2; DEC-117). A
-- command's rechecks under the locks must respect holds, reservations and count freezes whose header rows row-level
-- security hides from its actor, such as a hold or freeze recording a brand the actor is not scoped to. This function
-- sees every such row at the command's Site and unit, and answers only:
--   - ('count-freeze', id) for each count freeze not yet ended whose scope covers a location, SKU or brand given and
--     whose header the actor can see, so the command names it (13.8 `count-freeze-active`);
--   - one ('hidden', null) row when a count freeze the actor cannot see covers any of them, or when claims of holds
--     outside reservations and of reservations whose rows the actor cannot see take a piece given, or take more units
--     of a balance given than the spare the command left on it after its own visible arithmetic (6.2).
-- It never answers a hidden row's identifier, kind, brand or quantity: the command refuses generically (13.8
-- `blocked`). It reads under the locks the command holds: freezes start and end only under the unit anchor held
-- exclusively, and claims change only under their balance's lock (14.3). SECURITY DEFINER, owned by the migration
-- role, with a fixed search path, executable only by the runtime role (code-house-rules 5.2).
create function stock.recheck_hidden(
  site_id uuid, business_unit_id uuid, location_ids uuid[], sku_ids uuid[], brand_ids uuid[],
  balance_ids uuid[], balance_spares integer[], piece_ids uuid[]
) returns table (blocker text, hold_id uuid)
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  with freeze_hold as (
    select h.id,
           access.row_visible_brand_set('stock.hold', h.site_id, h.store_id, h.business_unit_id, h.legal_entity_id,
             h.brand_ids, null) as visible
    from stock.hold h
    where h.kind = 'count-freeze'
      and h.site_id = recheck_hidden.site_id
      and h.business_unit_id = recheck_hidden.business_unit_id
      and not exists (select 1 from stock.hold_release r where r.hold_id = h.id)
      and exists (
        select 1 from stock.hold_scope s
        where s.hold_id = h.id
          and (s.location_id = any (recheck_hidden.location_ids) or s.sku_id = any (recheck_hidden.sku_ids)
               or s.scope_brand_id = any (recheck_hidden.brand_ids)))
  ),
  hidden_claim as (
    select c.balance_id, c.piece_id, c.quantity
    from stock.hold_claim c
    join stock.hold h on h.id = c.hold_id
    where c.quantity > 0
      and h.within_reservation_id is null
      and (c.balance_id = any (recheck_hidden.balance_ids) or c.piece_id = any (recheck_hidden.piece_ids))
      and not (access.row_visible('stock.hold', c.site_id, c.store_id, c.business_unit_id, c.legal_entity_id,
                 c.brand_id, null)
               and access.row_visible_brand_set('stock.hold', h.site_id, h.store_id, h.business_unit_id,
                 h.legal_entity_id, h.brand_ids, null))
    union all
    select c.balance_id, c.piece_id, c.quantity
    from stock.reservation_claim c
    join stock.reservation v on v.id = c.reservation_id
    where c.quantity > 0
      and (c.balance_id = any (recheck_hidden.balance_ids) or c.piece_id = any (recheck_hidden.piece_ids))
      and not (access.row_visible('stock.reservation', c.site_id, c.store_id, c.business_unit_id,
                 c.legal_entity_id, c.brand_id, null)
               and access.row_visible_brand_set('stock.reservation', v.site_id, v.store_id, v.business_unit_id,
                 v.legal_entity_id, v.brand_ids, null))
  ),
  spare as (
    select s.balance_id, s.spare
    from unnest(recheck_hidden.balance_ids, recheck_hidden.balance_spares) as s (balance_id, spare)
  )
  select 'count-freeze'::text, f.id from freeze_hold f where f.visible
  union all
  select 'hidden'::text, null::uuid
  where exists (select 1 from freeze_hold f where not f.visible)
     or exists (select 1 from hidden_claim c where c.piece_id is not null)
     or exists (
       select 1
       from (select c.balance_id, sum(c.quantity) as quantity
             from hidden_claim c where c.balance_id is not null group by c.balance_id) t
       join spare s on s.balance_id = t.balance_id
       where t.quantity > s.spare)
$$;
revoke execute on function stock.recheck_hidden(uuid, uuid, uuid[], uuid[], uuid[], uuid[], integer[], uuid[])
  from public;
grant execute on function stock.recheck_hidden(uuid, uuid, uuid[], uuid[], uuid[], uuid[], integer[], uuid[])
  to aos_runtime;
