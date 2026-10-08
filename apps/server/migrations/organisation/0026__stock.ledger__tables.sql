-- The stock ledger's tables: unit anchors, receipt origins and their state, movements with their legs and pieces,
-- balances, pieces, coverage, acceptance, holds, reservations, cost pools and layers, valuations and transit values
-- (stock-ledger 14.1 to 14.3, SL-24, SL-25; code-house-rules 3 to 7; PRD-MOD-002, PRD-MOD-008, PRD-MOD-011,
-- PRD-MOD-012, PRD-MOD-014, PRD-MOD-015, PRD-SEC-005; DEC-116, DEC-117; S1-F10-T01). Runs as aos_migration, which
-- owns everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds
-- (code-house-rules 4.2).
--
-- Entries (movements, legs, valuations, receipt origins, status records and their releases) are append-only; balances,
-- piece state, pool state, layers, transit values and claims are projections, changed only under the lock 14.3 names
-- and rebuildable from the entries (14.1; PRD-MOD-011, PRD-MOD-012). Another module's record is kept by its
-- identifier with no foreign key (14.1): Sites, Stores, business units, legal entities, brands, SKUs, books, mapping
-- and cost-setting versions, locations, PT revisions, parties, agreements, users, role assignments, approval uses and
-- stored files. An Unknown is a null in a nullable column; a link a kind does not have is null only where a CHECK on
-- the kind says so (14.1; code-house-rules 3.3).
--
-- Names (14.1): movement kinds as stock-ledger 2.3; conditions good, damaged, wrong, unidentified; held as custody,
-- in-transit, billed-retained; transit kinds dispatch, return-shipment; hold and reservation kinds and their release
-- events as stock-ledger 14.2 lists them from 6.1; import kinds as imports-and-opening-data 4.1, or none.

create schema stock;
grant usage on schema stock to aos_runtime;

-- One lock row per Site and business unit (13.1, 14.3; SL-24). It carries no brand (DEC-117).
create table stock.unit_anchor (
  id uuid primary key,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint unit_anchor_once unique (site_id, business_unit_id)
);
create index unit_anchor_store on stock.unit_anchor (store_id);
create index unit_anchor_business_unit on stock.unit_anchor (business_unit_id);
create index unit_anchor_legal_entity on stock.unit_anchor (legal_entity_id);

-- A receipt origin's fixed facts (section 4). The SKU is Unknown for goods whose identity is not resolved
-- (PRD-DMG-005); then its version is Unknown too.
create table stock.receipt_origin (
  id uuid primary key,
  origin_kind text not null,
  parent_origin_id uuid references stock.receipt_origin (id),
  source_module text not null,
  source_record_type text not null,
  source_record_id uuid not null,
  source_version_id uuid not null,
  source_line_id uuid not null,
  source_import_kind text not null,
  sku_id uuid,
  sku_version_id uuid,
  stock_unit text not null,
  piece_tracked boolean not null,
  batch_tracked boolean not null,
  batch_code text,
  expiry_date date,
  quantity integer not null,
  count_date date not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  mapping_version_id uuid not null,
  book_id uuid not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint receipt_origin_kind check (origin_kind in ('receipt', 'opening', 'surplus', 'split', 'identity-resolved')),
  constraint receipt_origin_parent check ((origin_kind in ('split', 'identity-resolved')) = (parent_origin_id is not null)),
  constraint receipt_origin_import_kind check (
    source_import_kind in ('none', 'create', 'update', 'opening-balance', 'transaction')),
  constraint receipt_origin_sku_version check ((sku_id is null) = (sku_version_id is null)),
  constraint receipt_origin_stock_unit check (stock_unit in ('piece', 'pair', 'pack')),
  constraint receipt_origin_batch check (batch_tracked = (batch_code is not null) and batch_tracked = (expiry_date is not null)),
  constraint receipt_origin_quantity check (quantity > 0),
  -- The targets of the copies other rows keep of an origin's facts (14.2): coverage's tracking, a balance's count
  -- date, an origin state's quantity. A foreign key holds each copy true, and, unlike a trigger reading the origin as
  -- the runtime role, it is not filtered by row-level security when the origin is at another place.
  constraint receipt_origin_tracking unique (id, piece_tracked),
  constraint receipt_origin_count_date unique (id, count_date),
  constraint receipt_origin_of_quantity unique (id, quantity)
);
create index receipt_origin_parent on stock.receipt_origin (parent_origin_id);
create index receipt_origin_source on stock.receipt_origin (source_module, source_record_type, source_record_id);
create index receipt_origin_sku on stock.receipt_origin (sku_id);
create index receipt_origin_site on stock.receipt_origin (site_id);
create index receipt_origin_store on stock.receipt_origin (store_id);
create index receipt_origin_business_unit on stock.receipt_origin (business_unit_id);
create index receipt_origin_legal_entity on stock.receipt_origin (legal_entity_id);
create index receipt_origin_brand on stock.receipt_origin (brand_id);
create index receipt_origin_book on stock.receipt_origin (book_id);

-- One movement, recorded at the place where it happens (2.2, 14.2). Its brand set holds the brand of every SKU it
-- moves or values, a null element for an Unknown one (14.1; SL-25 (d)).
create table stock.movement (
  id uuid primary key,
  kind text not null,
  source_module text not null,
  source_record_type text not null,
  source_record_id uuid not null,
  source_version_id uuid not null,
  source_line_id uuid not null,
  source_import_kind text not null,
  actor_user_id uuid,
  actor_service_identity_id uuid,
  on_behalf_of_user_id uuid,
  role_assignment_id uuid not null,
  approval_use_id uuid,
  reverses_movement_id uuid references stock.movement (id),
  correction_of_movement_id uuid references stock.movement (id),
  business_date date not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_ids uuid[] not null,
  constraint movement_kind check (kind in ('receipt-count', 'opening-count', 'location-move', 'condition-change',
    'identity-resolved', 'dispatch', 'arrival-count', 'failed-delivery-return', 'sale-issue', 'customer-return',
    'supplier-return-departure', 'supplier-handover', 'supplier-rejection-return', 'count-difference', 'disposal',
    'ownership-change', 'cost-established', 'cost-adjustment', 'write-off', 'nrv-write-down', 'reversal')),
  -- Never from an import of historical reference (13.2; PRD-LIF-014, PRD-IMP-010).
  constraint movement_import_kind check (
    source_import_kind in ('none', 'create', 'update', 'opening-balance', 'transaction')),
  constraint movement_actor check ((actor_user_id is null) <> (actor_service_identity_id is null)),
  constraint movement_on_behalf_of check (on_behalf_of_user_id is null or actor_service_identity_id is not null),
  constraint movement_reverses check ((kind = 'reversal') = (reverses_movement_id is not null)),
  -- One source line posts each kind once (14.2; PRD-INT-002).
  constraint movement_source_line unique nulls not distinct
    (source_module, source_record_type, source_record_id, source_line_id, kind, reverses_movement_id)
);
create index movement_source on stock.movement (source_module, source_record_type, source_record_id);
create index movement_reverses on stock.movement (reverses_movement_id);
create index movement_correction_of on stock.movement (correction_of_movement_id);
create index movement_approval_use on stock.movement (approval_use_id);
create index movement_site on stock.movement (site_id);
create index movement_store on stock.movement (store_id);
create index movement_business_unit on stock.movement (business_unit_id);
create index movement_legal_entity on stock.movement (legal_entity_id);
create index movement_brand_ids on stock.movement using gin (brand_ids);

-- One side of a movement at one place. Its book is the book of the unit's mapping the leg used (PRD-ORG-005), kept so
-- that "has this book held stock?" is answered from the ledger's own rows (13.7).
create table stock.movement_leg (
  id uuid primary key,
  movement_id uuid not null references stock.movement (id),
  direction text not null,
  receipt_origin_id uuid not null references stock.receipt_origin (id),
  sku_id uuid,
  quantity integer not null,
  location_id uuid,
  condition text not null,
  held_as text not null,
  transit_kind text,
  transit_ref uuid,
  batch_code text,
  expiry_date date,
  book_id uuid not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint movement_leg_direction check (direction in ('out', 'in')),
  constraint movement_leg_quantity check (quantity > 0),
  constraint movement_leg_condition check (condition in ('good', 'damaged', 'wrong', 'unidentified')),
  constraint movement_leg_held_as check (held_as in ('custody', 'in-transit', 'billed-retained')),
  constraint movement_leg_transit check (
    (held_as = 'in-transit') = (transit_kind is not null) and (held_as = 'in-transit') = (transit_ref is not null)
    and (transit_kind is null or transit_kind in ('dispatch', 'return-shipment'))),
  constraint movement_leg_location check ((held_as = 'in-transit') = (location_id is null))
);
create index movement_leg_movement on stock.movement_leg (movement_id);
create index movement_leg_receipt_origin on stock.movement_leg (receipt_origin_id);
create index movement_leg_unit_sku_time on stock.movement_leg (business_unit_id, sku_id, recorded_at);
create index movement_leg_site_time on stock.movement_leg (site_id, recorded_at);
create index movement_leg_location on stock.movement_leg (location_id);
create index movement_leg_book on stock.movement_leg (book_id);
create index movement_leg_store on stock.movement_leg (store_id);
create index movement_leg_legal_entity on stock.movement_leg (legal_entity_id);
create index movement_leg_brand on stock.movement_leg (brand_id);

-- Total quantity per Site, business unit and SKU: the lock row of 10.3 step 3. An Unknown SKU counts as one value.
create table stock.sku_balance (
  id uuid primary key,
  site_id uuid not null,
  business_unit_id uuid not null,
  sku_id uuid,
  stock_unit text not null,
  quantity integer not null,
  store_id uuid,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint sku_balance_once unique nulls not distinct (site_id, business_unit_id, sku_id),
  constraint sku_balance_stock_unit check (stock_unit in ('piece', 'pair', 'pack')),
  constraint sku_balance_quantity check (quantity >= 0)
);
create index sku_balance_site on stock.sku_balance (site_id);
create index sku_balance_business_unit on stock.sku_balance (business_unit_id);
create index sku_balance_sku on stock.sku_balance (sku_id);
create index sku_balance_store on stock.sku_balance (store_id);
create index sku_balance_legal_entity on stock.sku_balance (legal_entity_id);
create index sku_balance_brand on stock.sku_balance (brand_id);

-- Quantity at one balance key (6.2), changed only under its SKU balance's lock (14.3).
create table stock.balance (
  id uuid primary key,
  sku_balance_id uuid not null references stock.sku_balance (id),
  site_id uuid not null,
  business_unit_id uuid not null,
  location_id uuid,
  condition text not null,
  held_as text not null,
  transit_kind text,
  transit_ref uuid,
  sku_id uuid,
  batch_code text,
  expiry_date date,
  receipt_origin_id uuid not null,
  count_date date not null,
  quantity integer not null,
  accepted_quantity integer not null,
  store_id uuid,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint balance_key unique nulls not distinct (site_id, business_unit_id, location_id, condition, held_as,
    transit_kind, transit_ref, sku_id, batch_code, expiry_date, receipt_origin_id),
  -- Its count date is its origin's, for the oldest-first choice (14.3; PRD-STK-013).
  constraint balance_count_date_of_origin foreign key (receipt_origin_id, count_date)
    references stock.receipt_origin (id, count_date),
  constraint balance_condition check (condition in ('good', 'damaged', 'wrong', 'unidentified')),
  constraint balance_held_as check (held_as in ('custody', 'in-transit', 'billed-retained')),
  constraint balance_transit check (
    (held_as = 'in-transit') = (transit_kind is not null) and (held_as = 'in-transit') = (transit_ref is not null)
    and (transit_kind is null or transit_kind in ('dispatch', 'return-shipment'))),
  constraint balance_location check ((held_as = 'in-transit') = (location_id is null)),
  constraint balance_quantity check (quantity >= 0),
  constraint balance_accepted check (accepted_quantity >= 0 and accepted_quantity <= quantity)
);
create index balance_oldest_first on stock.balance (sku_balance_id, expiry_date, count_date);
create index balance_receipt_origin on stock.balance (receipt_origin_id, count_date);
create index balance_site on stock.balance (site_id);
create index balance_store on stock.balance (store_id);
create index balance_business_unit on stock.balance (business_unit_id);
create index balance_location on stock.balance (location_id);
create index balance_legal_entity on stock.balance (legal_entity_id);
create index balance_brand on stock.balance (brand_id);

-- One piece's current state (section 5). A piece is in one place by construction: one set of place columns (11.7).
create table stock.piece (
  id uuid primary key,
  code text not null,
  sku_id uuid,
  receipt_origin_id uuid not null references stock.receipt_origin (id),
  location_id uuid,
  condition text not null,
  held_as text not null,
  transit_kind text,
  transit_ref uuid,
  in_custody boolean not null,
  pt_revision_id uuid,
  accepted_site_id uuid,
  last_movement_id uuid references stock.movement (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint piece_code unique (code),
  constraint piece_code_form check (code <> ''),
  constraint piece_condition check (condition in ('good', 'damaged', 'wrong', 'unidentified')),
  constraint piece_held_as check (held_as in ('custody', 'in-transit', 'billed-retained')),
  constraint piece_transit check (
    (held_as = 'in-transit') = (transit_kind is not null) and (held_as = 'in-transit') = (transit_ref is not null)
    and (transit_kind is null or transit_kind in ('dispatch', 'return-shipment'))),
  constraint piece_location check ((held_as = 'in-transit') = (location_id is null))
);
create index piece_receipt_origin on stock.piece (receipt_origin_id);
create index piece_last_movement on stock.piece (last_movement_id);
create index piece_sku on stock.piece (sku_id);
create index piece_location on stock.piece (location_id);
create index piece_site on stock.piece (site_id);
create index piece_store on stock.piece (store_id);
create index piece_business_unit on stock.piece (business_unit_id);
create index piece_legal_entity on stock.piece (legal_entity_id);
create index piece_brand on stock.piece (brand_id);

create table stock.movement_piece (
  id uuid primary key,
  movement_id uuid not null references stock.movement (id),
  piece_id uuid not null references stock.piece (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint movement_piece_once unique (movement_id, piece_id)
);
create index movement_piece_piece on stock.movement_piece (piece_id);
create index movement_piece_site on stock.movement_piece (site_id);
create index movement_piece_store on stock.movement_piece (store_id);
create index movement_piece_business_unit on stock.movement_piece (business_unit_id);
create index movement_piece_legal_entity on stock.movement_piece (legal_entity_id);
create index movement_piece_brand on stock.movement_piece (brand_id);

-- What changes on an origin, changed only by a command holding the origin exclusively (14.3). No per-unit cost is
-- stored, so no rounding hides in it (PRD-MOD-014; SL-2).
create table stock.receipt_origin_state (
  id uuid primary key,
  receipt_origin_id uuid not null,
  owner_kind text,
  owner_legal_entity_id uuid,
  owner_party_id uuid,
  owner_brand_id uuid,
  agreement_version_id uuid,
  value_known boolean not null,
  p_rate_paise bigint,
  established_value_paise bigint,
  origin_quantity integer not null,
  pt_revision_id uuid,
  covered_quantity integer not null,
  last_state_movement_id uuid not null references stock.movement (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint receipt_origin_state_once unique (receipt_origin_id),
  -- Its quantity is its origin's (14.2).
  constraint receipt_origin_state_quantity_of_origin foreign key (receipt_origin_id, origin_quantity)
    references stock.receipt_origin (id, quantity),
  -- Exactly the owner column its kind names, or none while the owner is Unknown (PRD-ORG-014).
  constraint receipt_origin_state_owner check (case
    when owner_kind is null
      then num_nonnulls(owner_legal_entity_id, owner_party_id, owner_brand_id, agreement_version_id) = 0
    when owner_kind = 'organisation'
      then owner_legal_entity_id is not null and owner_party_id is null and owner_brand_id is null
    when owner_kind = 'supplier'
      then owner_party_id is not null and owner_legal_entity_id is null and owner_brand_id is null
    when owner_kind = 'brand'
      then owner_brand_id is not null and owner_legal_entity_id is null and owner_party_id is null
    else false end),
  constraint receipt_origin_state_value check (
    value_known = (p_rate_paise is not null) and value_known = (established_value_paise is not null)),
  constraint receipt_origin_state_covered check (covered_quantity >= 0 and covered_quantity <= origin_quantity)
);
create index receipt_origin_state_last_movement on stock.receipt_origin_state (last_state_movement_id);
create index receipt_origin_state_site on stock.receipt_origin_state (site_id);
create index receipt_origin_state_store on stock.receipt_origin_state (store_id);
create index receipt_origin_state_business_unit on stock.receipt_origin_state (business_unit_id);
create index receipt_origin_state_legal_entity on stock.receipt_origin_state (legal_entity_id);
create index receipt_origin_state_brand on stock.receipt_origin_state (brand_id);

-- PT coverage records (section 3; PRD-REC-015, PRD-REC-017, PRD-REC-019).
create table stock.coverage (
  id uuid primary key,
  pt_revision_id uuid not null,
  receipt_origin_id uuid not null,
  piece_tracked boolean not null,
  piece_id uuid references stock.piece (id),
  quantity integer not null,
  action text not null,
  removes_coverage_id uuid references stock.coverage (id),
  source_module text not null,
  source_record_type text not null,
  source_record_id uuid not null,
  source_version_id uuid not null,
  source_line_id uuid not null,
  source_import_kind text not null,
  actor_user_id uuid,
  actor_service_identity_id uuid,
  on_behalf_of_user_id uuid,
  role_assignment_id uuid not null,
  business_date date not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  constraint coverage_origin_tracking foreign key (receipt_origin_id, piece_tracked)
    references stock.receipt_origin (id, piece_tracked),
  constraint coverage_piece check ((piece_id is not null) = piece_tracked),
  constraint coverage_quantity check (quantity > 0 and (not piece_tracked or quantity = 1)),
  constraint coverage_action check (action in ('cover', 'remove')),
  constraint coverage_removes check ((action = 'remove') = (removes_coverage_id is not null)),
  constraint coverage_removed_once unique (removes_coverage_id),
  constraint coverage_import_kind check (
    source_import_kind in ('none', 'create', 'update', 'opening-balance', 'transaction')),
  constraint coverage_actor check ((actor_user_id is null) <> (actor_service_identity_id is null)),
  constraint coverage_on_behalf_of check (on_behalf_of_user_id is null or actor_service_identity_id is not null)
);
create index coverage_receipt_origin on stock.coverage (receipt_origin_id, piece_tracked);
create index coverage_piece on stock.coverage (piece_id);
create index coverage_pt_revision on stock.coverage (pt_revision_id);
create index coverage_source on stock.coverage (source_module, source_record_type, source_record_id);
create index coverage_site on stock.coverage (site_id);
create index coverage_store on stock.coverage (store_id);
create index coverage_business_unit on stock.coverage (business_unit_id);
create index coverage_legal_entity on stock.coverage (legal_entity_id);
create index coverage_brand on stock.coverage (brand_id);

-- Acceptance records: barcode verified and physically accepted at a Site (PRD-REC-021, PRD-REC-022).
create table stock.acceptance (
  id uuid primary key,
  receipt_origin_id uuid not null references stock.receipt_origin (id),
  piece_id uuid references stock.piece (id),
  quantity integer not null,
  source_module text not null,
  source_record_type text not null,
  source_record_id uuid not null,
  source_version_id uuid not null,
  source_line_id uuid not null,
  source_import_kind text not null,
  actor_user_id uuid,
  actor_service_identity_id uuid,
  on_behalf_of_user_id uuid,
  role_assignment_id uuid not null,
  business_date date not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  constraint acceptance_quantity check (quantity > 0 and (piece_id is null or quantity = 1)),
  constraint acceptance_import_kind check (
    source_import_kind in ('none', 'create', 'update', 'opening-balance', 'transaction')),
  constraint acceptance_actor check ((actor_user_id is null) <> (actor_service_identity_id is null)),
  constraint acceptance_on_behalf_of check (on_behalf_of_user_id is null or actor_service_identity_id is not null)
);
create index acceptance_receipt_origin on stock.acceptance (receipt_origin_id);
create index acceptance_piece on stock.acceptance (piece_id);
create index acceptance_source on stock.acceptance (source_module, source_record_type, source_record_id);
create index acceptance_site on stock.acceptance (site_id);
create index acceptance_store on stock.acceptance (store_id);
create index acceptance_business_unit on stock.acceptance (business_unit_id);
create index acceptance_legal_entity on stock.acceptance (legal_entity_id);
create index acceptance_brand on stock.acceptance (brand_id);

-- A reservation (6.1), with its brand set as the movement's.
create table stock.reservation (
  id uuid primary key,
  kind text not null,
  source_module text not null,
  source_record_type text not null,
  source_record_id uuid not null,
  source_version_id uuid not null,
  source_line_id uuid not null,
  source_import_kind text not null,
  actor_user_id uuid,
  actor_service_identity_id uuid,
  on_behalf_of_user_id uuid,
  role_assignment_id uuid not null,
  business_date date not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_ids uuid[] not null,
  constraint reservation_kind check (kind in ('transfer', 'supplier-return', 'held-goods', 'offline-protected')),
  constraint reservation_import_kind check (
    source_import_kind in ('none', 'create', 'update', 'opening-balance', 'transaction')),
  constraint reservation_actor check ((actor_user_id is null) <> (actor_service_identity_id is null)),
  constraint reservation_on_behalf_of check (on_behalf_of_user_id is null or actor_service_identity_id is not null),
  -- The target of the event's copy of the kind (14.2).
  constraint reservation_of_kind unique (id, kind)
);
create index reservation_source on stock.reservation (source_module, source_record_type, source_record_id);
create index reservation_site on stock.reservation (site_id);
create index reservation_store on stock.reservation (store_id);
create index reservation_business_unit on stock.reservation (business_unit_id);
create index reservation_legal_entity on stock.reservation (legal_entity_id);
create index reservation_brand_ids on stock.reservation using gin (brand_ids);

-- A hold (6.1), with its brand set as the movement's; a count freeze, an inspection hold and a write-off hold are
-- kinds of hold (DEC-069).
create table stock.hold (
  id uuid primary key,
  kind text not null,
  reason text not null,
  evidence_file_id uuid,
  within_reservation_id uuid references stock.reservation (id),
  source_module text not null,
  source_record_type text not null,
  source_record_id uuid not null,
  source_version_id uuid not null,
  source_line_id uuid not null,
  source_import_kind text not null,
  actor_user_id uuid,
  actor_service_identity_id uuid,
  on_behalf_of_user_id uuid,
  role_assignment_id uuid not null,
  business_date date not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_ids uuid[] not null,
  constraint hold_kind check (kind in ('damage', 'quarantine', 'excess', 'source-conflict', 'expiry', 'ordinary',
    'count-freeze', 'inspection', 'write-off')),
  constraint hold_reason check (reason <> ''),
  constraint hold_import_kind check (
    source_import_kind in ('none', 'create', 'update', 'opening-balance', 'transaction')),
  constraint hold_actor check ((actor_user_id is null) <> (actor_service_identity_id is null)),
  constraint hold_on_behalf_of check (on_behalf_of_user_id is null or actor_service_identity_id is not null),
  -- The target of the scope's and the release's copies of the kind (14.2).
  constraint hold_of_kind unique (id, kind)
);
create index hold_within_reservation on stock.hold (within_reservation_id);
create index hold_evidence_file on stock.hold (evidence_file_id);
create index hold_source on stock.hold (source_module, source_record_type, source_record_id);
create index hold_site on stock.hold (site_id);
create index hold_store on stock.hold (store_id);
create index hold_business_unit on stock.hold (business_unit_id);
create index hold_legal_entity on stock.hold (legal_entity_id);
create index hold_brand_ids on stock.hold using gin (brand_ids);

-- A count freeze's scope: one location, brand or SKU per row (8.1).
create table stock.hold_scope (
  id uuid primary key,
  hold_id uuid not null,
  hold_kind text not null,
  location_id uuid,
  scope_brand_id uuid,
  sku_id uuid,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_ids uuid[] not null,
  recorded_at timestamptz not null default now(),
  constraint hold_scope_of_freeze foreign key (hold_id, hold_kind) references stock.hold (id, kind),
  constraint hold_scope_kind check (hold_kind = 'count-freeze'),
  constraint hold_scope_one check (num_nonnulls(location_id, scope_brand_id, sku_id) = 1)
);
create index hold_scope_hold on stock.hold_scope (hold_id, hold_kind);
create index hold_scope_location on stock.hold_scope (location_id);
create index hold_scope_scope_brand on stock.hold_scope (scope_brand_id);
create index hold_scope_sku on stock.hold_scope (sku_id);
create index hold_scope_site on stock.hold_scope (site_id);
create index hold_scope_store on stock.hold_scope (store_id);
create index hold_scope_business_unit on stock.hold_scope (business_unit_id);
create index hold_scope_legal_entity on stock.hold_scope (legal_entity_id);
create index hold_scope_brand_ids on stock.hold_scope using gin (brand_ids);

-- What a hold covers now, changed only under the hold's lock (14.3): a piece, or a quantity at a balance key.
create table stock.hold_claim (
  id uuid primary key,
  hold_id uuid not null references stock.hold (id),
  piece_id uuid references stock.piece (id),
  balance_id uuid references stock.balance (id),
  quantity integer not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint hold_claim_one check (num_nonnulls(piece_id, balance_id) = 1),
  constraint hold_claim_quantity check (quantity >= 0 and (piece_id is null or quantity <= 1))
);
create index hold_claim_hold on stock.hold_claim (hold_id);
create index hold_claim_piece on stock.hold_claim (piece_id);
create index hold_claim_balance on stock.hold_claim (balance_id);
create index hold_claim_site on stock.hold_claim (site_id);
create index hold_claim_store on stock.hold_claim (store_id);
create index hold_claim_business_unit on stock.hold_claim (business_unit_id);
create index hold_claim_legal_entity on stock.hold_claim (legal_entity_id);
create index hold_claim_brand on stock.hold_claim (brand_id);

-- The release of one claim, by an event that is the hold kind's own (6.1, 6.2; PRD-DMG-003).
create table stock.hold_release (
  id uuid primary key,
  hold_id uuid not null,
  hold_kind text not null,
  hold_claim_id uuid not null references stock.hold_claim (id),
  release_event text not null,
  quantity integer not null,
  piece_id uuid references stock.piece (id),
  source_module text not null,
  source_record_type text not null,
  source_record_id uuid not null,
  source_version_id uuid not null,
  source_line_id uuid not null,
  source_import_kind text not null,
  actor_user_id uuid,
  actor_service_identity_id uuid,
  on_behalf_of_user_id uuid,
  role_assignment_id uuid not null,
  business_date date not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  constraint hold_release_of_hold foreign key (hold_id, hold_kind) references stock.hold (id, kind),
  constraint hold_release_event check (case hold_kind
    when 'damage' then release_event in ('report-rejected', 'damage-confirmed')
    when 'quarantine' then release_event in ('approved-decision')
    when 'excess' then release_event in ('pt-route', 'loss-link')
    when 'source-conflict' then release_event in ('conflict-resolved')
    when 'expiry' then release_event in ('rule-change', 'supplier-return', 'write-off', 'disposal')
    when 'ordinary' then release_event in ('released')
    when 'count-freeze' then release_event in ('count-closed')
    when 'inspection' then release_event in ('inspected')
    when 'write-off' then release_event in ('disposal', 'write-off-reversed')
    else false end),
  constraint hold_release_quantity check (quantity > 0 and (piece_id is null or quantity = 1)),
  constraint hold_release_import_kind check (
    source_import_kind in ('none', 'create', 'update', 'opening-balance', 'transaction')),
  constraint hold_release_actor check ((actor_user_id is null) <> (actor_service_identity_id is null)),
  constraint hold_release_on_behalf_of check (on_behalf_of_user_id is null or actor_service_identity_id is not null)
);
create index hold_release_hold on stock.hold_release (hold_id, hold_kind);
create index hold_release_claim on stock.hold_release (hold_claim_id);
create index hold_release_piece on stock.hold_release (piece_id);
create index hold_release_source on stock.hold_release (source_module, source_record_type, source_record_id);
create index hold_release_site on stock.hold_release (site_id);
create index hold_release_store on stock.hold_release (store_id);
create index hold_release_business_unit on stock.hold_release (business_unit_id);
create index hold_release_legal_entity on stock.hold_release (legal_entity_id);
create index hold_release_brand on stock.hold_release (brand_id);

-- What a reservation covers now, changed only under the reservation's lock (14.3).
create table stock.reservation_claim (
  id uuid primary key,
  reservation_id uuid not null references stock.reservation (id),
  piece_id uuid references stock.piece (id),
  balance_id uuid references stock.balance (id),
  quantity integer not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint reservation_claim_one check (num_nonnulls(piece_id, balance_id) = 1),
  constraint reservation_claim_quantity check (quantity >= 0 and (piece_id is null or quantity <= 1))
);
create index reservation_claim_reservation on stock.reservation_claim (reservation_id);
create index reservation_claim_piece on stock.reservation_claim (piece_id);
create index reservation_claim_balance on stock.reservation_claim (balance_id);
create index reservation_claim_site on stock.reservation_claim (site_id);
create index reservation_claim_store on stock.reservation_claim (store_id);
create index reservation_claim_business_unit on stock.reservation_claim (business_unit_id);
create index reservation_claim_legal_entity on stock.reservation_claim (legal_entity_id);
create index reservation_claim_brand on stock.reservation_claim (brand_id);

-- The end of one claim: consumed by the movement that consumed it, or cancelled, withdrawn or released, each only for
-- the kinds 6.1 gives it; never by time (PRD-TRF-022, PRD-OFR-016, PRD-OFF-011).
create table stock.reservation_event (
  id uuid primary key,
  reservation_id uuid not null,
  reservation_kind text not null,
  reservation_claim_id uuid not null references stock.reservation_claim (id),
  event text not null,
  quantity integer not null,
  piece_id uuid references stock.piece (id),
  movement_id uuid references stock.movement (id),
  source_module text not null,
  source_record_type text not null,
  source_record_id uuid not null,
  source_version_id uuid not null,
  source_line_id uuid not null,
  source_import_kind text not null,
  actor_user_id uuid,
  actor_service_identity_id uuid,
  on_behalf_of_user_id uuid,
  role_assignment_id uuid not null,
  business_date date not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  constraint reservation_event_of_reservation foreign key (reservation_id, reservation_kind)
    references stock.reservation (id, kind),
  constraint reservation_event_event check (case reservation_kind
    when 'transfer' then event in ('consumed', 'cancelled')
    when 'supplier-return' then event in ('consumed', 'withdrawn')
    when 'held-goods' then event in ('consumed', 'cancelled')
    when 'offline-protected' then event in ('consumed', 'released')
    else false end),
  constraint reservation_event_movement check ((event = 'consumed') = (movement_id is not null)),
  constraint reservation_event_quantity check (quantity > 0 and (piece_id is null or quantity = 1)),
  constraint reservation_event_import_kind check (
    source_import_kind in ('none', 'create', 'update', 'opening-balance', 'transaction')),
  constraint reservation_event_actor check ((actor_user_id is null) <> (actor_service_identity_id is null)),
  constraint reservation_event_on_behalf_of check (on_behalf_of_user_id is null or actor_service_identity_id is not null)
);
create index reservation_event_reservation on stock.reservation_event (reservation_id, reservation_kind);
create index reservation_event_claim on stock.reservation_event (reservation_claim_id);
create index reservation_event_piece on stock.reservation_event (piece_id);
create index reservation_event_movement on stock.reservation_event (movement_id);
create index reservation_event_source on stock.reservation_event (source_module, source_record_type, source_record_id);
create index reservation_event_site on stock.reservation_event (site_id);
create index reservation_event_store on stock.reservation_event (store_id);
create index reservation_event_business_unit on stock.reservation_event (business_unit_id);
create index reservation_event_legal_entity on stock.reservation_event (legal_entity_id);
create index reservation_event_brand on stock.reservation_event (brand_id);

-- One cost pool (7.1). A whole-book pool has no Site (SL-25 (c)); a Site pool names its Site. Neither names a Store or
-- a unit (SL-25 (e)). Its brand is its SKU's.
create table stock.cost_pool (
  id uuid primary key,
  book_id uuid not null,
  sku_id uuid not null,
  pool_mode text not null,
  site_id uuid,
  formula text not null,
  cost_setting_version_id uuid not null,
  quantity integer not null,
  value_paise bigint not null,
  last_sequence bigint not null,
  closed_at timestamptz,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint cost_pool_mode check (pool_mode in ('book', 'site')),
  constraint cost_pool_site check ((pool_mode = 'site') = (site_id is not null)),
  constraint cost_pool_formula check (formula in ('moving-average', 'fifo')),
  constraint cost_pool_quantity check (quantity >= 0),
  constraint cost_pool_value check (value_paise >= 0),
  constraint cost_pool_sequence check (last_sequence >= 0),
  -- The target of the layer's copy of the formula (14.2).
  constraint cost_pool_of_formula unique (id, formula)
);
-- One open pool per book, SKU and Site; a book pool's empty Site counts as one value (14.2; product owner, 6 Oct 2026).
create unique index cost_pool_open on stock.cost_pool (book_id, sku_id, site_id) nulls not distinct
  where closed_at is null;
create index cost_pool_book on stock.cost_pool (book_id);
create index cost_pool_sku on stock.cost_pool (sku_id);
create index cost_pool_site on stock.cost_pool (site_id);
create index cost_pool_cost_setting_version on stock.cost_pool (cost_setting_version_id);
create index cost_pool_legal_entity on stock.cost_pool (legal_entity_id);
create index cost_pool_brand on stock.cost_pool (brand_id);

-- Value held on a dispatch between pools or on a supplier-return shipment (7.8): one row per SKU, so one brand.
create table stock.transit_value (
  id uuid primary key,
  transit_kind text not null,
  transit_ref uuid not null,
  book_id uuid not null,
  sku_id uuid not null,
  quantity integer not null,
  value_paise bigint not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint transit_value_once unique (transit_kind, transit_ref, book_id, sku_id),
  constraint transit_value_kind check (transit_kind in ('dispatch', 'return-shipment')),
  constraint transit_value_quantity check (quantity >= 0),
  constraint transit_value_value check (value_paise >= 0)
);
create index transit_value_book on stock.transit_value (book_id);
create index transit_value_sku on stock.transit_value (sku_id);
create index transit_value_site on stock.transit_value (site_id);
create index transit_value_store on stock.transit_value (store_id);
create index transit_value_business_unit on stock.transit_value (business_unit_id);
create index transit_value_legal_entity on stock.transit_value (legal_entity_id);
create index transit_value_brand on stock.transit_value (brand_id);

-- One valued movement's effect on one pool or one transit value, in posting order (7.10). A pool row carries the
-- pool's scope, with no Store or unit (SL-25 (e)); a transit row the source place's. `event_kind` is the posting event
-- kind of books-and-posting 7.2, or `none` where stock-ledger 13.4 says none.
create table stock.valuation (
  id uuid primary key,
  movement_id uuid not null references stock.movement (id),
  receipt_origin_id uuid not null references stock.receipt_origin (id),
  cost_pool_id uuid references stock.cost_pool (id),
  transit_value_id uuid references stock.transit_value (id),
  sequence bigint,
  quantity_delta integer not null,
  value_delta_paise bigint not null,
  quantity_before integer not null,
  quantity_after integer not null,
  value_before_paise bigint not null,
  value_after_paise bigint not null,
  event_kind text not null,
  component text not null,
  business_date date not null,
  accounting_date date not null,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint valuation_target check (num_nonnulls(cost_pool_id, transit_value_id) = 1),
  constraint valuation_sequence check ((cost_pool_id is null) = (sequence is null) and (sequence is null or sequence > 0)),
  constraint valuation_pool_sequence unique (cost_pool_id, sequence),
  constraint valuation_quantity check (quantity_after = quantity_before + quantity_delta),
  constraint valuation_value check (value_after_paise = value_before_paise + value_delta_paise),
  constraint valuation_names check (event_kind <> '' and component <> ''),
  constraint valuation_place check (
    (cost_pool_id is not null and store_id is null and business_unit_id is null)
    or (transit_value_id is not null and site_id is not null and business_unit_id is not null))
);
create index valuation_pool_sequence_order on stock.valuation (cost_pool_id, sequence);
create index valuation_recorded on stock.valuation (recorded_at);
create index valuation_movement on stock.valuation (movement_id);
create index valuation_receipt_origin on stock.valuation (receipt_origin_id);
create index valuation_transit_value on stock.valuation (transit_value_id);
create index valuation_site on stock.valuation (site_id);
create index valuation_store on stock.valuation (store_id);
create index valuation_business_unit on stock.valuation (business_unit_id);
create index valuation_legal_entity on stock.valuation (legal_entity_id);
create index valuation_brand on stock.valuation (brand_id);

-- One FIFO layer (7.4), changed only under its pool's lock (14.3).
create table stock.cost_layer (
  id uuid primary key,
  cost_pool_id uuid not null,
  pool_formula text not null,
  entered_sequence bigint not null,
  entered_at timestamptz not null,
  quantity_in integer not null,
  quantity_left integer not null,
  value_in_paise bigint not null,
  value_left_paise bigint not null,
  from_layer_id uuid references stock.cost_layer (id),
  receipt_origin_id uuid references stock.receipt_origin (id),
  from_valuation_id uuid references stock.valuation (id),
  site_id uuid,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint cost_layer_of_fifo foreign key (cost_pool_id, pool_formula) references stock.cost_pool (id, formula),
  constraint cost_layer_formula check (pool_formula = 'fifo'),
  constraint cost_layer_left check (quantity_left >= 0 and value_left_paise >= 0)
);
create index cost_layer_pool on stock.cost_layer (cost_pool_id, pool_formula);
create index cost_layer_from_layer on stock.cost_layer (from_layer_id);
create index cost_layer_receipt_origin on stock.cost_layer (receipt_origin_id);
create index cost_layer_from_valuation on stock.cost_layer (from_valuation_id);
create index cost_layer_site on stock.cost_layer (site_id);
create index cost_layer_legal_entity on stock.cost_layer (legal_entity_id);
create index cost_layer_brand on stock.cost_layer (brand_id);

-- The layers a valuation took or made, per piece for piece-tracked goods (7.4).
create table stock.valuation_layer (
  id uuid primary key,
  valuation_id uuid not null references stock.valuation (id),
  cost_layer_id uuid not null references stock.cost_layer (id),
  piece_id uuid references stock.piece (id),
  quantity integer not null,
  value_paise bigint not null,
  site_id uuid,
  store_id uuid,
  business_unit_id uuid,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint valuation_layer_quantity check (quantity > 0 and (piece_id is null or quantity = 1))
);
create index valuation_layer_valuation on stock.valuation_layer (valuation_id);
create index valuation_layer_cost_layer on stock.valuation_layer (cost_layer_id);
create index valuation_layer_piece on stock.valuation_layer (piece_id);
create index valuation_layer_site on stock.valuation_layer (site_id);
create index valuation_layer_store on stock.valuation_layer (store_id);
create index valuation_layer_business_unit on stock.valuation_layer (business_unit_id);
create index valuation_layer_legal_entity on stock.valuation_layer (legal_entity_id);
create index valuation_layer_brand on stock.valuation_layer (brand_id);

-- Under FIFO, the source layers a transit value holds (7.7, 7.8), changed only under its lock (14.3).
create table stock.transit_value_layer (
  id uuid primary key,
  transit_value_id uuid not null references stock.transit_value (id),
  source_layer_id uuid not null references stock.cost_layer (id),
  quantity integer not null,
  value_paise bigint not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid,
  recorded_at timestamptz not null default now(),
  constraint transit_value_layer_left check (quantity >= 0 and value_paise >= 0)
);
create index transit_value_layer_transit_value on stock.transit_value_layer (transit_value_id);
create index transit_value_layer_source_layer on stock.transit_value_layer (source_layer_id);
create index transit_value_layer_site on stock.transit_value_layer (site_id);
create index transit_value_layer_store on stock.transit_value_layer (store_id);
create index transit_value_layer_business_unit on stock.transit_value_layer (business_unit_id);
create index transit_value_layer_legal_entity on stock.transit_value_layer (legal_entity_id);
create index transit_value_layer_brand on stock.transit_value_layer (brand_id);

-- Rules on one row that never changes, held by triggers (14.2). Each sets its own search_path and names every schema.

-- A pool's formula never changes (7.12: a change closes the pool and opens a new one).
create function stock.keep_pool_formula() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.formula is distinct from old.formula then
    raise exception 'a cost pool keeps its formula' using errcode = 'AO004';
  end if;
  return new;
end;
$$;
revoke execute on function stock.keep_pool_formula() from public;
create trigger keep_formula before update on stock.cost_pool
  for each row execute function stock.keep_pool_formula();

-- A piece's code never changes (PRD-MER-003).
create function stock.keep_piece_code() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.code is distinct from old.code then
    raise exception 'a piece keeps its code' using errcode = 'AO004';
  end if;
  return new;
end;
$$;
revoke execute on function stock.keep_piece_code() from public;
create trigger keep_code before update on stock.piece
  for each row execute function stock.keep_piece_code();

-- Append-only guards (code-house-rules 7.1).
create trigger refuse_row_change before update or delete on stock.unit_anchor
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.unit_anchor
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.receipt_origin
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.receipt_origin
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.movement
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.movement
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.movement_leg
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.movement_leg
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.movement_piece
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.movement_piece
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.coverage
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.coverage
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.acceptance
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.acceptance
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.hold
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.hold
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.hold_scope
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.hold_scope
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.hold_release
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.hold_release
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.reservation
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.reservation
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.reservation_event
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.reservation_event
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.valuation
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.valuation
  for each statement execute function kernel.refuse_change();
create trigger refuse_row_change before update or delete on stock.valuation_layer
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on stock.valuation_layer
  for each statement execute function kernel.refuse_change();

-- Row-level security: the one policy of code-house-rules 6.2 on every table (14.3; SL-25). A table passes the facts
-- of 14.1 under the record type it belongs to (stock-ledger 14.3): `stock.balance` for unit anchors and balances,
-- `stock.receipt_origin` for origins and their state, `stock.movement` for movements, legs and moved pieces,
-- `stock.piece`, `stock.coverage`, `stock.acceptance`, `stock.hold` for holds with their scope, claims and releases,
-- `stock.reservation` for reservations with their claims and events, `stock.cost_pool` for pools and layers,
-- `stock.valuation` for valuations and their layers, `stock.transit_value` for transit values and their layers. A
-- header row with a brand set, and the unit anchor with an empty set, use access.row_visible_brand_set (0025;
-- DEC-117). Cost and value columns are masked, not filtered (access-and-approvals 6).
alter table stock.unit_anchor enable row level security;
create policy row_scope on stock.unit_anchor for all to aos_runtime
  using (access.row_visible_brand_set('stock.balance', site_id, store_id, business_unit_id, legal_entity_id, '{}', null))
  with check (access.row_visible_brand_set('stock.balance', site_id, store_id, business_unit_id, legal_entity_id, '{}', null));

alter table stock.receipt_origin enable row level security;
create policy row_scope on stock.receipt_origin for all to aos_runtime
  using (access.row_visible('stock.receipt_origin', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.receipt_origin', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.receipt_origin_state enable row level security;
create policy row_scope on stock.receipt_origin_state for all to aos_runtime
  using (access.row_visible('stock.receipt_origin', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.receipt_origin', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.movement enable row level security;
create policy row_scope on stock.movement for all to aos_runtime
  using (access.row_visible_brand_set('stock.movement', site_id, store_id, business_unit_id, legal_entity_id, brand_ids, null))
  with check (access.row_visible_brand_set('stock.movement', site_id, store_id, business_unit_id, legal_entity_id, brand_ids, null));

alter table stock.movement_leg enable row level security;
create policy row_scope on stock.movement_leg for all to aos_runtime
  using (access.row_visible('stock.movement', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.movement', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.movement_piece enable row level security;
create policy row_scope on stock.movement_piece for all to aos_runtime
  using (access.row_visible('stock.movement', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.movement', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.sku_balance enable row level security;
create policy row_scope on stock.sku_balance for all to aos_runtime
  using (access.row_visible('stock.balance', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.balance', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.balance enable row level security;
create policy row_scope on stock.balance for all to aos_runtime
  using (access.row_visible('stock.balance', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.balance', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.piece enable row level security;
create policy row_scope on stock.piece for all to aos_runtime
  using (access.row_visible('stock.piece', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.piece', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.coverage enable row level security;
create policy row_scope on stock.coverage for all to aos_runtime
  using (access.row_visible('stock.coverage', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.coverage', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.acceptance enable row level security;
create policy row_scope on stock.acceptance for all to aos_runtime
  using (access.row_visible('stock.acceptance', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.acceptance', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.hold enable row level security;
create policy row_scope on stock.hold for all to aos_runtime
  using (access.row_visible_brand_set('stock.hold', site_id, store_id, business_unit_id, legal_entity_id, brand_ids, null))
  with check (access.row_visible_brand_set('stock.hold', site_id, store_id, business_unit_id, legal_entity_id, brand_ids, null));

alter table stock.hold_scope enable row level security;
create policy row_scope on stock.hold_scope for all to aos_runtime
  using (access.row_visible_brand_set('stock.hold', site_id, store_id, business_unit_id, legal_entity_id, brand_ids, null))
  with check (access.row_visible_brand_set('stock.hold', site_id, store_id, business_unit_id, legal_entity_id, brand_ids, null));

alter table stock.hold_claim enable row level security;
create policy row_scope on stock.hold_claim for all to aos_runtime
  using (access.row_visible('stock.hold', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.hold', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.hold_release enable row level security;
create policy row_scope on stock.hold_release for all to aos_runtime
  using (access.row_visible('stock.hold', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.hold', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.reservation enable row level security;
create policy row_scope on stock.reservation for all to aos_runtime
  using (access.row_visible_brand_set('stock.reservation', site_id, store_id, business_unit_id, legal_entity_id, brand_ids, null))
  with check (access.row_visible_brand_set('stock.reservation', site_id, store_id, business_unit_id, legal_entity_id, brand_ids, null));

alter table stock.reservation_claim enable row level security;
create policy row_scope on stock.reservation_claim for all to aos_runtime
  using (access.row_visible('stock.reservation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.reservation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.reservation_event enable row level security;
create policy row_scope on stock.reservation_event for all to aos_runtime
  using (access.row_visible('stock.reservation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.reservation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.cost_pool enable row level security;
create policy row_scope on stock.cost_pool for all to aos_runtime
  using (access.row_visible('stock.cost_pool', site_id, null, null, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.cost_pool', site_id, null, null, legal_entity_id, brand_id, null));

alter table stock.cost_layer enable row level security;
create policy row_scope on stock.cost_layer for all to aos_runtime
  using (access.row_visible('stock.cost_pool', site_id, null, null, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.cost_pool', site_id, null, null, legal_entity_id, brand_id, null));

alter table stock.valuation enable row level security;
create policy row_scope on stock.valuation for all to aos_runtime
  using (access.row_visible('stock.valuation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.valuation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.valuation_layer enable row level security;
create policy row_scope on stock.valuation_layer for all to aos_runtime
  using (access.row_visible('stock.valuation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.valuation', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.transit_value enable row level security;
create policy row_scope on stock.transit_value for all to aos_runtime
  using (access.row_visible('stock.transit_value', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.transit_value', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

alter table stock.transit_value_layer enable row level security;
create policy row_scope on stock.transit_value_layer for all to aos_runtime
  using (access.row_visible('stock.transit_value', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('stock.transit_value', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));

-- "Has this book held stock?" (13.7; module-map section 3, rule 6; DEC-116): the contract finance · books asks before
-- a cost-setting version changes a book's formula or pool mode (books-and-posting 2.2). A book has held stock when any
-- stock row of it was ever written: a receipt origin of the book, a leg at a unit of the book or a cost pool of it.
-- The answer must not depend on what the asker may see, so the function is SECURITY DEFINER, owned by the migration
-- role (code-house-rules 5.2), and returns only a yes or no, never a row (stock-ledger 14.3).
create function stock.book_has_held_stock(book_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select exists (select 1 from stock.receipt_origin o where o.book_id = book_has_held_stock.book_id)
      or exists (select 1 from stock.movement_leg l where l.book_id = book_has_held_stock.book_id)
      or exists (select 1 from stock.cost_pool p where p.book_id = book_has_held_stock.book_id)
$$;
revoke execute on function stock.book_has_held_stock(uuid) from public;
grant execute on function stock.book_has_held_stock(uuid) to aos_runtime;

-- Runtime grants (code-house-rules 5.2): append-only tables SELECT and INSERT, and UPDATE (id) where locked;
-- projections SELECT, INSERT and UPDATE; no DELETE anywhere.
grant select, insert on stock.unit_anchor to aos_runtime;
grant update (id) on stock.unit_anchor to aos_runtime;
grant select, insert on stock.receipt_origin to aos_runtime;
grant update (id) on stock.receipt_origin to aos_runtime;
grant select, insert, update on stock.receipt_origin_state to aos_runtime;
grant select, insert on stock.movement to aos_runtime;
grant select, insert on stock.movement_leg to aos_runtime;
grant select, insert on stock.movement_piece to aos_runtime;
grant select, insert, update on stock.sku_balance to aos_runtime;
grant select, insert, update on stock.balance to aos_runtime;
grant select, insert, update on stock.piece to aos_runtime;
grant select, insert on stock.coverage to aos_runtime;
grant select, insert on stock.acceptance to aos_runtime;
grant select, insert on stock.hold to aos_runtime;
grant update (id) on stock.hold to aos_runtime;
grant select, insert on stock.hold_scope to aos_runtime;
grant select, insert, update on stock.hold_claim to aos_runtime;
grant select, insert on stock.hold_release to aos_runtime;
grant select, insert on stock.reservation to aos_runtime;
grant update (id) on stock.reservation to aos_runtime;
grant select, insert, update on stock.reservation_claim to aos_runtime;
grant select, insert on stock.reservation_event to aos_runtime;
grant select, insert, update on stock.cost_pool to aos_runtime;
grant select, insert, update on stock.cost_layer to aos_runtime;
grant select, insert on stock.valuation to aos_runtime;
grant select, insert on stock.valuation_layer to aos_runtime;
grant select, insert, update on stock.transit_value to aos_runtime;
grant select, insert, update on stock.transit_value_layer to aos_runtime;
