-- The damage reports of `stock` · documents (goods-in 8, 10.1, 10.3, 10.4; module-map section 5; stock-ledger 13.15;
-- PRD-DMG-001 to PRD-DMG-006, PRD-DMG-010, PRD-STK-017, PRD-ACP-005; S2-F08-T01), in the schema `stock`, which the
-- ledger's part shares (stock-ledger 14.1; code-house-rules 3.2): only `stock` · documents writes these tables. Runs as
-- aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the version running: it only
-- adds (code-house-rules 4.2). No value is written here: a report holds goods and quantities, never a cost, which the
-- decision's request in `access` and the exception's exposure carry (access-and-approvals 9.1, 12.1).
--
-- Every row belongs to the place where the goods are, the legal entity of the unit's mapping and the goods' brand, so
-- every table is scoped (code-house-rules 6.1, 6.2), each under `stock.damage_report`: whoever sees a report sees its
-- photos, the rounds of its decision, the decisions and the reversals. Every row is append-only (code-house-rules 7.1):
-- a decision, a reversal and a renewed request are rows of their own, and the report's state is read from them. The
-- report's identity row is locked by every change of it (code-house-rules 8.2, step 1). References inside the schema
-- have their foreign keys, the ledger's hold, origin and movement rows included (code-house-rules 3.2); references to
-- other modules' records keep their identifiers with no foreign key; every foreign key and scope column has an index.

-- A damage report (goods-in 8.2): its number from the damage-report series (10.4), where the goods are, which goods (a
-- GRN line's, whose receipt origin it names, or a product's at the location), the condition they were in when reported
-- (good, or for damage found at the count also held wrong or unidentified: goods-in 4.9; RR-571), how many, what is
-- wrong, and who reported it when, from their sign-in. The unit's mapping version in force when it was reported gives
-- its legal entity (PRD-MOD-010).
create table stock.damage_report (
  id uuid primary key,
  number text not null,
  number_allocation_id uuid not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  mapping_version_id uuid not null,
  location_id uuid not null,
  goods_kind text not null,
  grn_line_id uuid,
  sku_id uuid,
  receipt_origin_id uuid references stock.receipt_origin (id),
  goods_condition text not null,
  quantity integer not null,
  description text not null,
  reported_by_user_id uuid not null,
  role_assignment_id uuid not null,
  reported_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint damage_report_number_once unique (number),
  constraint damage_report_goods check (goods_kind in ('grn-line', 'product')
    and (goods_kind = 'grn-line') = (grn_line_id is not null)
    and (goods_kind = 'grn-line') = (receipt_origin_id is not null)
    and (goods_kind = 'grn-line' or sku_id is not null)),
  constraint damage_report_goods_condition check (goods_condition in ('good', 'wrong', 'unidentified')
    and (goods_kind = 'grn-line' or goods_condition = 'good')),
  constraint damage_report_quantity check (quantity > 0),
  constraint damage_report_texts check (number <> '' and description <> '')
);
create index damage_report_origin on stock.damage_report (receipt_origin_id);
create index damage_report_site on stock.damage_report (site_id, reported_at);
create index damage_report_store on stock.damage_report (store_id);
create index damage_report_unit on stock.damage_report (business_unit_id);
create index damage_report_legal_entity on stock.damage_report (legal_entity_id);
create index damage_report_brand on stock.damage_report (brand_id);
create trigger refuse_row_change before update or delete on stock.damage_report
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.damage_report
  for each statement execute function kernel.refuse_change();

-- A photo of the damage, as a stored file attached to the report (goods-in 8.2; S1-F06-T05).
create table stock.damage_report_photo (
  id uuid primary key,
  damage_report_id uuid not null references stock.damage_report (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  stored_file_id uuid not null,
  attachment_id uuid not null,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint damage_report_photo_once unique (damage_report_id, stored_file_id)
);
create index damage_report_photo_report on stock.damage_report_photo (damage_report_id);
create index damage_report_photo_site on stock.damage_report_photo (site_id);
create index damage_report_photo_store on stock.damage_report_photo (store_id);
create index damage_report_photo_unit on stock.damage_report_photo (business_unit_id);
create index damage_report_photo_legal_entity on stock.damage_report_photo (legal_entity_id);
create index damage_report_photo_brand on stock.damage_report_photo (brand_id);
create trigger refuse_row_change before update or delete on stock.damage_report_photo
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.damage_report_photo
  for each statement execute function kernel.refuse_change();

-- One round of a report's decision (goods-in 8.5): the version the decision's request binds to (PRD-ACS-007), numbered
-- from one under the report's lock, with the damage hold the decision ends. The first is the report as reported; a
-- renewal asks again on the goods' cost now; a restoration follows an approved reversal of a confirmation, whose
-- restored damage hold it names. The newest one's identifier is the report's version token (code-house-rules 12.7).
create table stock.damage_round (
  id uuid primary key,
  damage_report_id uuid not null references stock.damage_report (id),
  round_number integer not null,
  kind text not null,
  hold_id uuid not null references stock.hold (id),
  damage_reversal_id uuid,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  requested_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint damage_round_number unique (damage_report_id, round_number),
  constraint damage_round_kind check (kind in ('reported', 'renewed', 'restored') and round_number > 0
    and (kind = 'reported') = (round_number = 1)
    and (kind = 'restored') = (damage_reversal_id is not null))
);
create index damage_round_hold on stock.damage_round (hold_id);
create index damage_round_reversal on stock.damage_round (damage_reversal_id);
create index damage_round_site on stock.damage_round (site_id);
create index damage_round_store on stock.damage_round (store_id);
create index damage_round_unit on stock.damage_round (business_unit_id);
create index damage_round_legal_entity on stock.damage_round (legal_entity_id);
create index damage_round_brand on stock.damage_round (brand_id);
create trigger refuse_row_change before update or delete on stock.damage_round
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.damage_round
  for each statement execute function kernel.refuse_change();

-- The decision of a round (goods-in 8.3): confirmed, with the condition change that made the goods damaged and the
-- quarantine that holds them; or rejected, releasing only the round's damage hold (PRD-DMG-003). The approval decision
-- of `access` that made it, by a different person from the reporter (PRD-DMG-002), and who decided when.
create table stock.damage_decision (
  id uuid primary key,
  damage_report_id uuid not null references stock.damage_report (id),
  damage_round_id uuid not null references stock.damage_round (id),
  outcome text not null,
  approval_decision_id uuid not null,
  decided_by_user_id uuid not null,
  role_assignment_id uuid not null,
  decided_at timestamptz not null,
  movement_id uuid references stock.movement (id),
  quarantine_hold_id uuid references stock.hold (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint damage_decision_once unique (damage_round_id),
  constraint damage_decision_outcome check (outcome in ('Confirmed', 'Rejected')
    and (outcome = 'Confirmed') = (movement_id is not null)
    and (outcome = 'Confirmed') = (quarantine_hold_id is not null))
);
create index damage_decision_report on stock.damage_decision (damage_report_id);
create index damage_decision_movement on stock.damage_decision (movement_id);
create index damage_decision_quarantine on stock.damage_decision (quarantine_hold_id);
create index damage_decision_site on stock.damage_decision (site_id);
create index damage_decision_store on stock.damage_decision (store_id);
create index damage_decision_unit on stock.damage_decision (business_unit_id);
create index damage_decision_legal_entity on stock.damage_decision (legal_entity_id);
create index damage_decision_brand on stock.damage_decision (brand_id);
create trigger refuse_row_change before update or delete on stock.damage_decision
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.damage_decision
  for each statement execute function kernel.refuse_change();

-- A reversal of a confirmation, proposed with a reason (goods-in 8.3; PRD-STK-017): the confirmation is never edited.
create table stock.damage_reversal (
  id uuid primary key,
  damage_report_id uuid not null references stock.damage_report (id),
  damage_decision_id uuid not null references stock.damage_decision (id),
  reason text not null,
  proposed_by_user_id uuid not null,
  role_assignment_id uuid not null,
  proposed_at timestamptz not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint damage_reversal_reason check (reason <> '')
);
create index damage_reversal_report on stock.damage_reversal (damage_report_id);
create index damage_reversal_confirmation on stock.damage_reversal (damage_decision_id);
create index damage_reversal_site on stock.damage_reversal (site_id);
create index damage_reversal_store on stock.damage_reversal (store_id);
create index damage_reversal_unit on stock.damage_reversal (business_unit_id);
create index damage_reversal_legal_entity on stock.damage_reversal (legal_entity_id);
create index damage_reversal_brand on stock.damage_reversal (brand_id);
create trigger refuse_row_change before update or delete on stock.damage_reversal
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.damage_reversal
  for each statement execute function kernel.refuse_change();

alter table stock.damage_round
  add constraint damage_round_reversal_fk foreign key (damage_reversal_id) references stock.damage_reversal (id);

-- The decision on a reversal, by a different person from its proposer: approved, with the reversal movement that
-- returned the goods to good condition and the damage hold it restored; or rejected, changing nothing.
create table stock.damage_reversal_decision (
  id uuid primary key,
  damage_reversal_id uuid not null references stock.damage_reversal (id),
  outcome text not null,
  approval_decision_id uuid not null,
  decided_by_user_id uuid not null,
  role_assignment_id uuid not null,
  decided_at timestamptz not null,
  movement_id uuid references stock.movement (id),
  restored_hold_id uuid references stock.hold (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint damage_reversal_decision_once unique (damage_reversal_id),
  constraint damage_reversal_decision_outcome check (outcome in ('Approved', 'Rejected')
    and (outcome = 'Approved') = (movement_id is not null)
    and (outcome = 'Approved') = (restored_hold_id is not null))
);
create index damage_reversal_decision_movement on stock.damage_reversal_decision (movement_id);
create index damage_reversal_decision_hold on stock.damage_reversal_decision (restored_hold_id);
create index damage_reversal_decision_site on stock.damage_reversal_decision (site_id);
create index damage_reversal_decision_store on stock.damage_reversal_decision (store_id);
create index damage_reversal_decision_unit on stock.damage_reversal_decision (business_unit_id);
create index damage_reversal_decision_legal_entity on stock.damage_reversal_decision (legal_entity_id);
create index damage_reversal_decision_brand on stock.damage_reversal_decision (brand_id);
create trigger refuse_row_change before update or delete on stock.damage_reversal_decision
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.damage_reversal_decision
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): every table through `access.row_visible` with its scope facts, under the
-- report's record type.
alter table stock.damage_report enable row level security;
create policy row_scope on stock.damage_report for all to aos_runtime
  using (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null))
  with check (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id,
    brand_id, null));
alter table stock.damage_report_photo enable row level security;
create policy row_scope on stock.damage_report_photo for all to aos_runtime
  using (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null))
  with check (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id,
    brand_id, null));
alter table stock.damage_round enable row level security;
create policy row_scope on stock.damage_round for all to aos_runtime
  using (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null))
  with check (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id,
    brand_id, null));
alter table stock.damage_decision enable row level security;
create policy row_scope on stock.damage_decision for all to aos_runtime
  using (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null))
  with check (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id,
    brand_id, null));
alter table stock.damage_reversal enable row level security;
create policy row_scope on stock.damage_reversal for all to aos_runtime
  using (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null))
  with check (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id,
    brand_id, null));
alter table stock.damage_reversal_decision enable row level security;
create policy row_scope on stock.damage_reversal_decision for all to aos_runtime
  using (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null))
  with check (access.row_visible('stock.damage_report', site_id, store_id, business_unit_id, legal_entity_id,
    brand_id, null));

grant select, insert on stock.damage_report to aos_runtime;
grant update (id) on stock.damage_report to aos_runtime;
grant select, insert on stock.damage_report_photo to aos_runtime;
grant select, insert on stock.damage_round to aos_runtime;
grant select, insert on stock.damage_decision to aos_runtime;
grant select, insert on stock.damage_reversal to aos_runtime;
grant select, insert on stock.damage_reversal_decision to aos_runtime;
