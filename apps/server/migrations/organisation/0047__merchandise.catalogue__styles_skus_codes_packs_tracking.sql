-- The rest of the merchandise catalogue: tracking profiles and each category's dated link to one, the Site changes that
-- start piece rules after a labelling count, product proposals, styles with their attribute values, SKUs, packs and
-- external codes (structure-and-masters 2, 4.1 to 4.7, 6.2; module-map 4.12; PRD-MER-002 to PRD-MER-014,
-- PRD-MER-018, PRD-MER-019; POL-04.01 to POL-04.05; DEC-054, DEC-123; S1-F03-T02). Runs as aos_migration, which owns
-- everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules
-- 4.2). No profile, style, SKU, size, code or unit is written here.
--
-- Every master is an identity row, fixed at creation and never changed or deleted, and version rows under
-- structure-and-masters 2.2 and code-house-rules 7.3, guarded by merchandise.guard_version_change (0045); their
-- versions take effect when recorded, as no rule names an approval for them (2.3). A style and its SKUs are written
-- only by confirming a product proposal, which a different person from its proposer decides (4.2; DM-5, DEC-105).
-- Another module's record (a Site, a party, a user) is kept by its identifier with no foreign key (2.5).
--
-- Every table is unscoped: the catalogue belongs to the Organisation as a whole, its record types carry no scope fact
-- and the permission on the type decides (access-and-approvals 5.3); only merchandise code reads it (PRD-MOD-002).

-- A tracking profile (4.5, 4.6; PRD-MER-010, PRD-MER-014, POL-04.01).
create table merchandise.tracking_profile (
  id uuid primary key,
  code text not null unique,
  recorded_at timestamptz not null default now(),
  constraint tracking_profile_code check (code <> '')
);
create trigger refuse_row_change before update or delete on merchandise.tracking_profile
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.tracking_profile
  for each statement execute function kernel.refuse_change();

-- A profile's versioned fields: piece-tracked or quantity; batch and expiry required; the identifiers it requires, as
-- written; minimum remaining shelf life for receiving and for selling in days, null while Unknown (POL-04.05, V-05).
create table merchandise.tracking_profile_version (
  id uuid primary key,
  tracking_profile_id uuid not null references merchandise.tracking_profile (id),
  name text not null,
  piece_tracked boolean not null,
  batch_expiry_required boolean not null,
  required_identifiers text[] not null,
  receiving_shelf_life_days integer,
  selling_shelf_life_days integer,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint tracking_profile_version_name check (name <> ''),
  constraint tracking_profile_version_identifiers check (array_position(required_identifiers, '') is null
    and array_position(required_identifiers, null) is null),
  constraint tracking_profile_version_receiving check (receiving_shelf_life_days >= 0),
  constraint tracking_profile_version_selling check (selling_shelf_life_days >= 0),
  constraint tracking_profile_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint tracking_profile_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint tracking_profile_version_no_overlap exclude using gist (tracking_profile_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index tracking_profile_version_profile on merchandise.tracking_profile_version (tracking_profile_id);
create index tracking_profile_version_prepared_by on merchandise.tracking_profile_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.tracking_profile_version
  for each row execute function merchandise.guard_version_change();

-- A change to piece-tracked in force at a Site (4.6; PRD-MER-018, DEC-054): recorded by the operation the Site's
-- labelling count calls when it is complete, naming the profile version that made the change, once per Site. Piece
-- rules for that change start at the Site from its business date. Append-only.
create table merchandise.tracking_profile_site_change (
  id uuid primary key,
  tracking_profile_version_id uuid not null references merchandise.tracking_profile_version (id),
  site_id uuid not null,
  labelling_count_id uuid not null,
  effective_date date not null,
  actor_user_id uuid,
  actor_service_identity_id uuid,
  recorded_at timestamptz not null default now(),
  constraint tracking_profile_site_change_once unique (tracking_profile_version_id, site_id),
  constraint tracking_profile_site_change_actor check ((actor_user_id is null) <> (actor_service_identity_id is null))
);
create index tracking_profile_site_change_site on merchandise.tracking_profile_site_change (site_id);
create trigger refuse_row_change before update or delete on merchandise.tracking_profile_site_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.tracking_profile_site_change
  for each statement execute function kernel.refuse_change();

-- A category's tracking profile, effective-dated (4.6; POL-04.01, PRD-MER-014): its identity is the category's, the
-- row a change locks.
create table merchandise.category_tracking_profile (
  id uuid primary key,
  category_id uuid not null references merchandise.category (id),
  tracking_profile_id uuid not null references merchandise.tracking_profile (id),
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint category_tracking_profile_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint category_tracking_profile_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint category_tracking_profile_no_overlap exclude using gist (category_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index category_tracking_profile_category on merchandise.category_tracking_profile (category_id);
create index category_tracking_profile_profile on merchandise.category_tracking_profile (tracking_profile_id);
create index category_tracking_profile_prepared_by on merchandise.category_tracking_profile (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.category_tracking_profile
  for each row execute function merchandise.guard_version_change();

-- A product proposal (4.2; PRD-MER-013, PRD-IMP-009): the proposed style or the existing one, and its SKUs, kept as
-- the shape `product-proposal/1` with the original source words, apart from the catalogue. Its state moves once, from
-- Proposed to Confirmed or Rejected, decided by a different person from its proposer (DM-4, DM-5, DEC-105).
create table merchandise.product_proposal (
  id uuid primary key,
  style_id uuid,
  proposal jsonb not null,
  source_words text,
  proposed_by_user_id uuid not null,
  state text not null,
  decided_by_user_id uuid,
  decided_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint product_proposal_shape check (proposal ->> 'shape' = 'product-proposal/1'),
  constraint product_proposal_source_words check (source_words <> ''),
  constraint product_proposal_state check (state in ('Proposed', 'Confirmed', 'Rejected')),
  constraint product_proposal_decided
    check ((state = 'Proposed') = (decided_by_user_id is null) and (decided_by_user_id is null) = (decided_at is null)),
  constraint product_proposal_independent check (decided_by_user_id is distinct from proposed_by_user_id)
);
create index product_proposal_proposed_by on merchandise.product_proposal (proposed_by_user_id);

-- A product proposal changes only by its decision, once, nothing else changed.
create function merchandise.guard_product_proposal_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if old.state = 'Proposed' and new.state in ('Confirmed', 'Rejected')
     and (pg_catalog.to_jsonb(new) - 'state' - 'decided_by_user_id' - 'decided_at')
       = (pg_catalog.to_jsonb(old) - 'state' - 'decided_by_user_id' - 'decided_at') then
    return new;
  end if;
  raise exception 'a product proposal changes only by its decision, once' using errcode = 'AO003';
end;
$$;
revoke execute on function merchandise.guard_product_proposal_change() from public;
create trigger guard_product_proposal_change before update on merchandise.product_proposal
  for each row execute function merchandise.guard_product_proposal_change();

-- A style (4.1; PRD-MER-002): brand and category fixed, made by confirming its proposal.
create table merchandise.style (
  id uuid primary key,
  code text not null unique,
  brand_id uuid not null references merchandise.brand (id),
  category_id uuid not null references merchandise.category (id),
  proposal_id uuid not null references merchandise.product_proposal (id),
  recorded_at timestamptz not null default now(),
  constraint style_code check (code <> '')
);
create index style_brand on merchandise.style (brand_id);
create index style_category on merchandise.style (category_id);
create index style_proposal on merchandise.style (proposal_id);
create trigger refuse_row_change before update or delete on merchandise.style
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.style
  for each statement execute function kernel.refuse_change();

alter table merchandise.product_proposal
  add constraint product_proposal_style foreign key (style_id) references merchandise.style (id);
create index product_proposal_style on merchandise.product_proposal (style_id);

-- A style's versioned fields (4.1; PRD-MER-004, PRD-MER-005): brand article number, launch date and HSN, each null while
-- Unknown; its attribute values, through style_attribute_value.
create table merchandise.style_version (
  id uuid primary key,
  style_id uuid not null references merchandise.style (id),
  brand_article_number text,
  launch_date date,
  hsn text,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint style_version_article check (brand_article_number <> ''),
  constraint style_version_hsn check (hsn <> ''),
  constraint style_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint style_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint style_version_no_overlap exclude using gist (style_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index style_version_style on merchandise.style_version (style_id);
create index style_version_prepared_by on merchandise.style_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.style_version
  for each row execute function merchandise.guard_version_change();

-- An attribute's value on a style version, frozen with it: an approved vocabulary value of a list-type attribute, or
-- text for a text attribute (4.2; GC2-9). An attribute with no row is Unknown (2.4).
create table merchandise.style_attribute_value (
  id uuid primary key,
  style_version_id uuid not null references merchandise.style_version (id),
  attribute_id uuid not null references merchandise.attribute (id),
  vocabulary_value_id uuid references merchandise.vocabulary_value (id),
  text_value text,
  recorded_at timestamptz not null default now(),
  constraint style_attribute_value_one check ((vocabulary_value_id is null) <> (text_value is null)),
  constraint style_attribute_value_text check (text_value <> ''),
  constraint style_attribute_value_once unique (style_version_id, attribute_id)
);
create index style_attribute_value_attribute on merchandise.style_attribute_value (attribute_id);
create index style_attribute_value_value on merchandise.style_attribute_value (vocabulary_value_id);
create trigger refuse_row_change before update or delete on merchandise.style_attribute_value
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.style_attribute_value
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_version before insert on merchandise.style_attribute_value
  for each row execute function merchandise.refuse_after_version('style_version', 'style_version_id');

-- A SKU (4.1; PRD-MER-002, PRD-MER-005, POL-04.02): its style, size and the identity attributes its category names, as
-- an object of attribute to value, vocabulary value or text, or null while Unknown, fixed at creation. One SKU per
-- style, size and identity, an Unknown counting as one value, so Unknown size and Free Size are two SKUs.
create table merchandise.sku (
  id uuid primary key,
  code text not null unique,
  style_id uuid not null references merchandise.style (id),
  size text,
  identity jsonb not null,
  proposal_id uuid not null references merchandise.product_proposal (id),
  recorded_at timestamptz not null default now(),
  constraint sku_code check (code <> ''),
  constraint sku_size check (size <> ''),
  constraint sku_identity_object check (pg_catalog.jsonb_typeof(identity) = 'object'),
  constraint sku_identity_once unique nulls not distinct (style_id, size, identity)
);
create index sku_proposal on merchandise.sku (proposal_id);
create trigger refuse_row_change before update or delete on merchandise.sku
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.sku
  for each statement execute function kernel.refuse_change();

-- A SKU's versioned fields (4.1, 4.4; POL-04.03, POL-04.04, PRD-MER-019): its one stock unit and its purpose.
create table merchandise.sku_version (
  id uuid primary key,
  sku_id uuid not null references merchandise.sku (id),
  stock_unit text not null,
  purpose text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint sku_version_stock_unit check (stock_unit in ('piece', 'pair', 'pack')),
  constraint sku_version_purpose check (purpose in ('merchandise', 'gift-with-purchase', 'promotional', 'packaging')),
  constraint sku_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint sku_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint sku_version_no_overlap exclude using gist (sku_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index sku_version_sku on merchandise.sku_version (sku_id);
create index sku_version_prepared_by on merchandise.sku_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.sku_version
  for each row execute function merchandise.guard_version_change();

-- A purchasing or selling pack of a SKU, its code unique in the SKU (4.4; POL-04.03).
create table merchandise.pack (
  id uuid primary key,
  sku_id uuid not null references merchandise.sku (id),
  code text not null,
  recorded_at timestamptz not null default now(),
  constraint pack_code check (code <> ''),
  constraint pack_code_in_sku unique (sku_id, code),
  constraint pack_of_sku unique (id, sku_id)
);
create trigger refuse_row_change before update or delete on merchandise.pack
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pack
  for each statement execute function kernel.refuse_change();

-- A pack's versioned fields (4.4; POL-04.03, POL-04.04): its conversion to the SKU's stock units, or, for a mixed pack,
-- none and its contents SKU by SKU; whether it is a purchasing pack, a selling pack or both. Past quantities keep the
-- version they used.
create table merchandise.pack_version (
  id uuid primary key,
  pack_id uuid not null references merchandise.pack (id),
  units integer,
  mixed boolean not null,
  for_purchasing boolean not null,
  for_selling boolean not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint pack_version_conversion check (mixed = (units is null) and (units is null or units > 0)),
  constraint pack_version_use check (for_purchasing or for_selling),
  constraint pack_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint pack_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint pack_version_no_overlap exclude using gist (pack_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index pack_version_pack on merchandise.pack_version (pack_id);
create index pack_version_prepared_by on merchandise.pack_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.pack_version
  for each row execute function merchandise.guard_version_change();

-- A mixed pack's contents, SKU by SKU, frozen with its version (4.4; POL-04.03).
create table merchandise.pack_content (
  id uuid primary key,
  pack_version_id uuid not null references merchandise.pack_version (id),
  sku_id uuid not null references merchandise.sku (id),
  quantity integer not null,
  recorded_at timestamptz not null default now(),
  constraint pack_content_quantity check (quantity > 0),
  constraint pack_content_once unique (pack_version_id, sku_id)
);
create index pack_content_sku on merchandise.pack_content (sku_id);
create trigger refuse_row_change before update or delete on merchandise.pack_content
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.pack_content
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_version before insert on merchandise.pack_content
  for each row execute function merchandise.refuse_after_version('pack_version', 'pack_version_id');

-- A code and its kind, kept as text exactly as supplied, leading zeros included (4.3; PRD-MER-006, PRD-MER-007): the
-- row a mapping of it locks, so the cross-scope check never passes another mapping of the same code.
create table merchandise.external_code_key (
  id uuid primary key,
  code text not null,
  kind text not null,
  recorded_at timestamptz not null default now(),
  constraint external_code_key_code check (code <> ''),
  constraint external_code_key_kind check (kind in ('supplier-barcode', 'supplier-style-code', 'other', 'internal')),
  constraint external_code_key_once unique (code, kind)
);
create trigger refuse_row_change before update or delete on merchandise.external_code_key
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.external_code_key
  for each statement execute function kernel.refuse_change();

-- A code's mapping to a SKU and a unit, the stock unit or one of the SKU's packs, in one scope (a supplier, a brand or
-- the Organisation), over its validity dates, as an active mapping or a historical alias (4.3; PRD-MER-006 to
-- PRD-MER-008). An active mapping of the same code, kind and scope over overlapping dates to another target is refused
-- by the exclusion constraint; the cross-scope case is the service's, under the code's lock. A mapping changes only by
-- its end moving earlier.
create table merchandise.external_code (
  id uuid primary key,
  code_key_id uuid not null references merchandise.external_code_key (id),
  scope_kind text not null,
  scope_party_id uuid,
  scope_brand_id uuid references merchandise.brand (id),
  scope_key uuid not null generated always as
    (coalesce(scope_party_id, scope_brand_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  sku_id uuid not null references merchandise.sku (id),
  pack_id uuid,
  target text not null generated always as (sku_id::text || '/' || coalesce(pack_id::text, '')) stored,
  alias boolean not null,
  valid_during daterange not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint external_code_scope check (
    (scope_kind = 'supplier' and scope_party_id is not null and scope_brand_id is null)
    or (scope_kind = 'brand' and scope_brand_id is not null and scope_party_id is null)
    or (scope_kind = 'organisation' and scope_party_id is null and scope_brand_id is null)),
  constraint external_code_pack foreign key (pack_id, sku_id) references merchandise.pack (id, sku_id),
  constraint external_code_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint external_code_no_conflict exclude using gist
    (code_key_id with =, scope_kind with =, scope_key with =, valid_during with &&, target with <>)
    where (not alias)
);
create index external_code_code_key on merchandise.external_code (code_key_id);
create index external_code_sku on merchandise.external_code (sku_id);
create index external_code_pack on merchandise.external_code (pack_id, sku_id);
create index external_code_brand on merchandise.external_code (scope_brand_id);
create index external_code_prepared_by on merchandise.external_code (prepared_by_user_id);

-- A mapping changes only by its end moving earlier, never to or before its start (4.3; code-house-rules 7.3). The
-- generated columns are left out: a BEFORE trigger sees them before they are computed.
create function merchandise.guard_external_code_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if (pg_catalog.to_jsonb(new) - 'valid_during' - 'scope_key' - 'target')
       = (pg_catalog.to_jsonb(old) - 'valid_during' - 'scope_key' - 'target')
     and pg_catalog.lower(new.valid_during) = pg_catalog.lower(old.valid_during)
     and not pg_catalog.upper_inf(new.valid_during)
     and pg_catalog.upper(new.valid_during) > pg_catalog.lower(new.valid_during)
     and (pg_catalog.upper_inf(old.valid_during) or pg_catalog.upper(new.valid_during) < pg_catalog.upper(old.valid_during)) then
    return new;
  end if;
  raise exception 'a code mapping changes only by its end moving earlier' using errcode = 'AO003';
end;
$$;
revoke execute on function merchandise.guard_external_code_change() from public;
create trigger guard_external_code_change before update on merchandise.external_code
  for each row execute function merchandise.guard_external_code_change();

-- Runtime grants (code-house-rules 5.2), as 0045's: an identity row is append-only and locked, hence UPDATE on its
-- identifier only (7.1, 8.2); a version row takes the changes its guard allows, a proposal its decision, a mapping its
-- end. The rows frozen with a version, and the Site changes, are append-only.
grant select, insert on merchandise.tracking_profile to aos_runtime;
grant update (id) on merchandise.tracking_profile to aos_runtime;
grant select, insert, update on merchandise.tracking_profile_version to aos_runtime;
grant select, insert on merchandise.tracking_profile_site_change to aos_runtime;
grant select, insert, update on merchandise.category_tracking_profile to aos_runtime;
grant select, insert, update on merchandise.product_proposal to aos_runtime;
grant select, insert on merchandise.style to aos_runtime;
grant update (id) on merchandise.style to aos_runtime;
grant select, insert, update on merchandise.style_version to aos_runtime;
grant select, insert on merchandise.style_attribute_value to aos_runtime;
grant select, insert on merchandise.sku to aos_runtime;
grant update (id) on merchandise.sku to aos_runtime;
grant select, insert, update on merchandise.sku_version to aos_runtime;
grant select, insert on merchandise.pack to aos_runtime;
grant update (id) on merchandise.pack to aos_runtime;
grant select, insert, update on merchandise.pack_version to aos_runtime;
grant select, insert on merchandise.pack_content to aos_runtime;
grant select, insert on merchandise.external_code_key to aos_runtime;
grant update (id) on merchandise.external_code_key to aos_runtime;
grant select, insert, update on merchandise.external_code to aos_runtime;
