-- A recount of a GRN's lines (goods-in 4.7, 4.11, 10.3; PRD-REC-019; S2-F02-T05). Runs as aos_migration, which owns
-- everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds tables (code-house-rules
-- 4.2). No value is written here: a recount, as a GRN, holds quantities, never a price, tax or value.
--
-- A GRN is never edited. A miscount is corrected by a linked recount of the lines concerned, proposed with a reason and
-- approved by a different person through `access`; its approval adds receipt counts, or reverses them, for the
-- difference, and the GRN keeps its original count. Each line of a recount keeps the count it was proposed against and
-- the count recounted; its decision is made once; and each stock effect of an approved recount is a row of its own,
-- whose identifier is the ledger request's line, naming the receipt origin it made or the receipt count it reversed
-- (the ledger's records, no foreign key: code-house-rules 3.2), so `receiving` knows the origins of a GRN line's goods
-- and how many pieces each still holds (goods-in 4.11).
--
-- Every row belongs to the place where the goods are, the legal entity of the unit's mapping and the Arrival's brand,
-- under the Arrival's record type, as every row of `receiving` is (code-house-rules 6.1, 6.2): whoever sees an Arrival
-- sees its recounts and how each was decided. Every reference inside the schema has a foreign key; every foreign key and
-- scope column has an index (code-house-rules 3.2, 3.3). Every row is append-only (7.1). A recount is decided under the
-- GRN's row lock, which migration 0105 grants, so its rows take no lock of their own.

-- A recount: the GRN, why, and who proposed it when.
create table receiving.recount (
  id uuid primary key,
  grn_id uuid not null references receiving.grn (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  reason text not null,
  proposed_by_user_id uuid not null,
  role_assignment_id uuid not null,
  proposed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint recount_reason check (reason <> '' and length(reason) <= 500)
);
create index recount_grn on receiving.recount (grn_id);
create index recount_site on receiving.recount (site_id);
create index recount_store on receiving.recount (store_id);
create index recount_unit on receiving.recount (business_unit_id);
create index recount_legal_entity on receiving.recount (legal_entity_id);
create index recount_brand on receiving.recount (brand_id);

-- A line of a recount: the GRN line, its count when the recount was proposed, and its count as recounted.
create table receiving.recount_line (
  id uuid primary key,
  recount_id uuid not null references receiving.recount (id),
  grn_line_id uuid not null references receiving.grn_line (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  counted_before integer not null,
  counted_after integer not null,
  recorded_at timestamptz not null default now(),
  constraint recount_line_once unique (recount_id, grn_line_id),
  constraint recount_line_counts check (counted_before >= 0 and counted_after >= 0 and counted_before <> counted_after)
);
create index recount_line_grn_line on receiving.recount_line (grn_line_id);
create index recount_line_site on receiving.recount_line (site_id);
create index recount_line_store on receiving.recount_line (store_id);
create index recount_line_unit on receiving.recount_line (business_unit_id);
create index recount_line_legal_entity on receiving.recount_line (legal_entity_id);
create index recount_line_brand on receiving.recount_line (brand_id);

-- A recount's decision, by a different person through `access` (PRD-REC-019, POL-02.07): approved or rejected, once.
create table receiving.recount_decision (
  id uuid primary key,
  recount_id uuid not null references receiving.recount (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  outcome text not null,
  approval_decision_id uuid not null,
  decided_by_user_id uuid not null,
  role_assignment_id uuid not null,
  decided_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint recount_decision_once unique (recount_id),
  constraint recount_decision_outcome check (outcome in ('approved', 'rejected'))
);
create index recount_decision_site on receiving.recount_decision (site_id);
create index recount_decision_store on receiving.recount_decision (store_id);
create index recount_decision_unit on receiving.recount_decision (business_unit_id);
create index recount_decision_legal_entity on receiving.recount_decision (legal_entity_id);
create index recount_decision_brand on receiving.recount_decision (brand_id);

-- Each stock effect of an approved recount, its identifier the line of the ledger request that made it: a receipt count
-- of the pieces found (`added`), naming the origin it made, or the reversal of pieces of a receipt count (`reversed`),
-- naming the origin they leave and the receipt count reversed; with the movement written and the pieces.
create table receiving.recount_movement (
  id uuid primary key,
  recount_id uuid not null references receiving.recount (id),
  recount_line_id uuid not null references receiving.recount_line (id),
  grn_line_id uuid not null references receiving.grn_line (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  kind text not null,
  receipt_origin_id uuid not null,
  reverses_movement_id uuid,
  movement_id uuid not null,
  quantity integer not null,
  recorded_at timestamptz not null default now(),
  constraint recount_movement_kind check (kind in ('added', 'reversed')
    and (kind = 'reversed') = (reverses_movement_id is not null)),
  constraint recount_movement_quantity check (quantity > 0)
);
create index recount_movement_recount on receiving.recount_movement (recount_id);
create index recount_movement_recount_line on receiving.recount_movement (recount_line_id);
create index recount_movement_grn_line on receiving.recount_movement (grn_line_id);
create index recount_movement_site on receiving.recount_movement (site_id);
create index recount_movement_store on receiving.recount_movement (store_id);
create index recount_movement_unit on receiving.recount_movement (business_unit_id);
create index recount_movement_legal_entity on receiving.recount_movement (legal_entity_id);
create index recount_movement_brand on receiving.recount_movement (brand_id);

create trigger refuse_row_change before update or delete on receiving.recount
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.recount
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on receiving.recount_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.recount_line
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on receiving.recount_decision
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.recount_decision
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on receiving.recount_movement
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.recount_movement
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): under the Arrival's record type, with every scope fact.
alter table receiving.recount enable row level security;
create policy row_scope on receiving.recount for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.recount_line enable row level security;
create policy row_scope on receiving.recount_line for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.recount_decision enable row level security;
create policy row_scope on receiving.recount_decision for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.recount_movement enable row level security;
create policy row_scope on receiving.recount_movement for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));

grant select, insert on receiving.recount to aos_runtime;
grant select, insert on receiving.recount_line to aos_runtime;
grant select, insert on receiving.recount_decision to aos_runtime;
grant select, insert on receiving.recount_movement to aos_runtime;
