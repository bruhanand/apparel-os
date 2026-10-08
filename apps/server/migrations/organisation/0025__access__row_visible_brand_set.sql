-- The every-brand function of code-house-rules 6.2: the policy function for a row that records a brand set instead
-- of one brand, such as the stock ledger's header rows (`movement`, `hold`, `hold_scope`, `reservation`) and its
-- unit anchor (stock-ledger 14.1, 14.3; SL-25 (d); access-and-approvals 5.3; DEC-117; PRD-SEC-005, PRD-ACS-004;
-- S1-F10-T01). Runs as aos_migration, which owns the function (code-house-rules 5.1). Compatible with the version
-- running: it only adds (code-house-rules 4.2).
--
-- It answers as access.row_visible (0022) does, with the brand set in place of the one brand, and checks every
-- dimension inside the same effective grant, so one assignment covers the place, the legal entity and every brand of
-- the set together (PRD-ACS-004; access-and-approvals 7.2). Two calls, one to row_visible for the place and one for
-- the brands, could each be met by a different assignment, which is why the set is a parameter here. Its body repeats
-- row_visible's on purpose: sharing it would mean redefining access.row_visible, the policy function of every scoped
-- table already deployed, or adding a nested function call per row to every policy check; a change to one is made to
-- both (S1-F10 review).
--
-- The brand set: a null element is a brand that is Unknown, such as the brand of goods of Unknown SKU, covered only by
-- all-members brand scope (access-and-approvals 5.3; PRD-MOD-015); a brand-limited grant covers the row only when it
-- names every brand of the set. An empty set records no brand, so only the place and the legal entity are checked:
-- that is how the unit anchor, which carries no brand, is matched by place only (DEC-117). A record type that does not
-- declare brand ignores the set, as row_visible ignores a brand it does not declare.
create function access.row_visible_brand_set(
  record_type text, site_id uuid, store_id uuid, business_unit_id uuid, legal_entity_id uuid, brand_ids uuid[],
  subject_id uuid
) returns boolean
  language sql
  stable
  security invoker
  set search_path = pg_catalog
as $$
  select coalesce(bool_or(
    case when g.own_records then row_visible_brand_set.subject_id = g.actor_id
    else (not g.declares_legal_entity or g.legal_entity_all
          or row_visible_brand_set.legal_entity_id = any (g.legal_entity_ids))
     and (not g.declares_place or g.place_all or row_visible_brand_set.business_unit_id = any (g.business_unit_ids)
          or row_visible_brand_set.store_id = any (g.store_ids) or row_visible_brand_set.site_id = any (g.site_ids))
     and (not g.declares_brand or g.brand_all
          or (pg_catalog.array_position(row_visible_brand_set.brand_ids, null) is null
              and row_visible_brand_set.brand_ids <@ g.brand_ids))
    end), false)
  from access.effective_grant g
  where g.actor_id = nullif(pg_catalog.current_setting('aos.actor_id', true), '')::uuid
    and g.record_type = row_visible_brand_set.record_type
    and g.valid_during @> nullif(pg_catalog.current_setting('aos.business_date', true), '')::date
$$;

revoke execute on function access.row_visible_brand_set(text, uuid, uuid, uuid, uuid, uuid[], uuid) from public;
grant execute on function access.row_visible_brand_set(text, uuid, uuid, uuid, uuid, uuid[], uuid) to aos_runtime;
