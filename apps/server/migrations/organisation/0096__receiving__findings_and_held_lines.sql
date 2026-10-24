-- What the count finds and the held lines Booking decides (goods-in 4.4 to 4.6, 4.9, 10.3; PRD-REC-006, PRD-REC-012,
-- PRD-REC-013, PRD-DMG-001, POL-17.02, POL-17.11; S2-F02-T03). Runs as aos_migration, which owns everything it changes
-- and creates (code-house-rules 5.1). No value is written here: a GRN holds quantities, never a price, tax or value.
--
-- A count line now says what it counts (goods-in 4.4): goods on the invoice; wrong goods, a known product the invoice
-- does not list; or unidentified goods, which match no product and carry no identity, only what they look like. The
-- receiver records a line's extra pieces, counted beyond the invoice or not on it at all, as received and held or as
-- not received, and the pieces found damaged with what is wrong and one photo. The GRN line freezes the same, and the
-- damage report the count raised (`stock` · documents, another module's record: no foreign key, structure-and-masters
-- 2.5). A held line is the part of a GRN line Booking decides, its excess, wrong or unidentified goods received and
-- held: its identity row is locked at step 1 by every change of it (code-house-rules 8.2); its versions are what an
-- approval binds to, the first as issued and each later one naming the product of unidentified goods (goods-in 4.6);
-- its decision takes them in or leaves them held, once.
--
-- The rows written before this migration are lines of goods on the invoice: the count could record no other kind, and
-- a GRN was issued only when every line's counted quantity equalled its invoice quantity (S2-F02-T02), so each GRN
-- line had no extra pieces, no damage and every counted piece received. The temporary default fills the new kind
-- without an update (an append-only row never changes, code-house-rules 7.1) and is dropped at once: no column has a
-- default (code-house-rules 3.3). So the code deployed before this migration, which writes no kind, could no longer
-- save a count line or issue a GRN until the new version takes traffic (code-house-rules 4.2). No running code does:
-- the receiving routes have never been deployed to any environment (goods-in 10.4), so nothing is interrupted.
--
-- Every row of the new tables belongs to the place where the goods are, the legal entity of the unit's mapping and the
-- Arrival's brand, under the Arrival's record type, as every row of `receiving` is (code-house-rules 6.1, 6.2): whoever
-- sees an Arrival sees its held lines and how each was decided. Every reference inside the schema has a foreign key;
-- every foreign key and scope column has an index (code-house-rules 3.2, 3.3). Every row is append-only (7.1).

-- The count's lines (goods-in 4.3, 4.4).
alter table receiving.count_entry alter column style_code drop not null;
alter table receiving.count_entry add column goods text not null default 'on-invoice';
alter table receiving.count_entry alter column goods drop default;
alter table receiving.count_entry
  add column description text,
  add column extra text,
  add column damaged_quantity integer,
  add column damage_description text,
  add column damage_photo_stored_file_id uuid,
  add column damage_photo_file_receipt_id uuid;
alter table receiving.count_entry add constraint count_entry_goods check (goods in ('on-invoice', 'wrong', 'unidentified'));
-- Goods on the invoice and wrong goods are named by their style code, wrong goods by their product too; unidentified
-- goods by nothing but what they look like. Goods not on the invoice are counted, with nothing on the invoice, and
-- received or not, since every one of their pieces is extra (goods-in 4.4).
alter table receiving.count_entry add constraint count_entry_kind check (
  case goods
    when 'unidentified' then style_code is null and colour is null and size_value_id is null and sku_id is null
      and batch_code is null and description is not null and invoice_quantity = 0 and counted_quantity > 0
      and extra is not null
    when 'wrong' then style_code is not null and sku_id is not null and description is null and invoice_quantity = 0
      and counted_quantity > 0 and extra is not null
    else style_code is not null and description is null
  end);
alter table receiving.count_entry add constraint count_entry_extra check (extra is null
  or (extra in ('received', 'not-received') and (goods <> 'on-invoice' or counted_quantity > invoice_quantity)));
-- Damage at the count is of any piece received, excess, wrong or unidentified goods held too (goods-in 4.4, 4.9;
-- PRD-REC-006; RR-571, decided by the product owner on 22 Oct 2026): at most the pieces counted less the extra pieces
-- recorded as not received; with what is wrong, and at most one photo, as a stored file and the receipt it was stored
-- with.
alter table receiving.count_entry add constraint count_entry_damage check (
  num_nulls(damaged_quantity, damage_description) in (0, 2)
  and (damaged_quantity is null or (damaged_quantity > 0
    and damaged_quantity <= counted_quantity - case when extra = 'not-received' then
      case goods when 'on-invoice' then greatest(0, counted_quantity - invoice_quantity) else counted_quantity end
      else 0 end))
  and num_nulls(damage_photo_stored_file_id, damage_photo_file_receipt_id) in (0, 2)
  and (damage_photo_stored_file_id is null or damaged_quantity is not null));
alter table receiving.count_entry add constraint count_entry_finding_texts
  check (description <> '' and damage_description <> '');

-- The GRN's lines, as their count lines stood at issue (goods-in 4.5).
alter table receiving.grn_line alter column style_code drop not null;
alter table receiving.grn_line add column goods text not null default 'on-invoice';
alter table receiving.grn_line alter column goods drop default;
alter table receiving.grn_line
  add column description text,
  add column extra text,
  add column damaged_quantity integer,
  add column damage_description text,
  add column damage_report_id uuid;
alter table receiving.grn_line add constraint grn_line_goods check (goods in ('on-invoice', 'wrong', 'unidentified'));
alter table receiving.grn_line add constraint grn_line_kind check (
  case goods
    when 'unidentified' then style_code is null and colour is null and size_code is null and sku_id is null
      and batch_code is null and description is not null and invoice_quantity = 0 and counted_quantity > 0
      and extra is not null
    when 'wrong' then style_code is not null and sku_id is not null and description is null and invoice_quantity = 0
      and counted_quantity > 0 and extra is not null
    else style_code is not null and description is null and (extra is not null) = (counted_quantity > invoice_quantity)
  end);
alter table receiving.grn_line add constraint grn_line_extra check (extra in ('received', 'not-received'));
-- The damage the count found was reported at issue, one report a line, so a line names a report exactly when it holds
-- damage (stock-ledger 14.1 "Unknown and none").
alter table receiving.grn_line add constraint grn_line_damage check (
  num_nulls(damaged_quantity, damage_description, damage_report_id) in (0, 3)
  and (damaged_quantity is null or (damaged_quantity > 0
    and damaged_quantity <= counted_quantity - case when extra = 'not-received' then
      case goods when 'on-invoice' then greatest(0, counted_quantity - invoice_quantity) else counted_quantity end
      else 0 end)));
alter table receiving.grn_line add constraint grn_line_finding_texts check (description <> '' and damage_description <> '');

-- A held line (goods-in 4.6): the extra pieces of a GRN line received and held, excess under an excess hold, wrong or
-- unidentified goods in quarantine, with the receipt origin the count made and the hold (the ledger's records, no
-- foreign key); one a GRN line.
create table receiving.held_line (
  id uuid primary key,
  grn_id uuid not null references receiving.grn (id),
  grn_line_id uuid not null references receiving.grn_line (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  kind text not null,
  quantity integer not null,
  receipt_origin_id uuid not null,
  hold_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint held_line_once unique (grn_line_id),
  constraint held_line_kind check (kind in ('excess', 'wrong', 'unidentified')),
  constraint held_line_quantity check (quantity > 0)
);
create index held_line_grn on receiving.held_line (grn_id);
create index held_line_site on receiving.held_line (site_id);
create index held_line_store on receiving.held_line (store_id);
create index held_line_unit on receiving.held_line (business_unit_id);
create index held_line_legal_entity on receiving.held_line (legal_entity_id);
create index held_line_brand on receiving.held_line (brand_id);
create trigger refuse_row_change before update or delete on receiving.held_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.held_line
  for each statement execute function kernel.refuse_change();

-- A version of a held line, numbered from one under its lock, which its decision's approval binds to (PRD-ACS-007):
-- the first as the GRN issued it; each later one, of unidentified goods, naming their product as Booking names it, by
-- style code, colour, size from the size list (with its code and the version of the size list's marking it was read
-- under, as a count line keeps it) and product where one is set up (goods-in 4.6).
create table receiving.held_line_version (
  id uuid primary key,
  held_line_id uuid not null references receiving.held_line (id),
  version_number integer not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  kind text not null,
  named_style_code text,
  named_colour text,
  named_size_attribute_id uuid,
  named_size_value_id uuid,
  named_size_code text,
  named_size_marked_attribute_version_id uuid,
  named_sku_id uuid,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint held_line_version_once unique (held_line_id, version_number),
  constraint held_line_version_number check (version_number > 0),
  constraint held_line_version_kind check (
    (kind = 'issued' and version_number = 1 and num_nonnulls(named_style_code, named_colour, named_size_attribute_id,
      named_size_value_id, named_size_code, named_size_marked_attribute_version_id, named_sku_id) = 0)
    or (kind = 'named' and version_number > 1 and named_style_code is not null)),
  constraint held_line_version_size check (num_nulls(named_size_attribute_id, named_size_value_id, named_size_code,
    named_size_marked_attribute_version_id) in (0, 4)),
  constraint held_line_version_texts check (named_style_code <> '' and named_colour <> '' and named_size_code <> '')
);
create index held_line_version_site on receiving.held_line_version (site_id);
create index held_line_version_store on receiving.held_line_version (store_id);
create index held_line_version_unit on receiving.held_line_version (business_unit_id);
create index held_line_version_legal_entity on receiving.held_line_version (legal_entity_id);
create index held_line_version_brand on receiving.held_line_version (brand_id);
create trigger refuse_row_change before update or delete on receiving.held_line_version
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.held_line_version
  for each statement execute function kernel.refuse_change();

-- A held line's decision, by a Booking approver through `access` (goods-in 4.6; PRD-REC-013, POL-17.02, POL-17.11):
-- taken in, or left held, bound to the version decided; once a held line. The finding stays as the GRN line froze it.
create table receiving.held_line_decision (
  id uuid primary key,
  held_line_id uuid not null references receiving.held_line (id),
  held_line_version_id uuid not null references receiving.held_line_version (id),
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
  constraint held_line_decision_once unique (held_line_id),
  constraint held_line_decision_version_once unique (held_line_version_id),
  constraint held_line_decision_outcome check (outcome in ('taken-in', 'left-held'))
);
create index held_line_decision_site on receiving.held_line_decision (site_id);
create index held_line_decision_store on receiving.held_line_decision (store_id);
create index held_line_decision_unit on receiving.held_line_decision (business_unit_id);
create index held_line_decision_legal_entity on receiving.held_line_decision (legal_entity_id);
create index held_line_decision_brand on receiving.held_line_decision (brand_id);
create trigger refuse_row_change before update or delete on receiving.held_line_decision
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.held_line_decision
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): under the Arrival's record type, with every scope fact.
alter table receiving.held_line enable row level security;
create policy row_scope on receiving.held_line for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.held_line_version enable row level security;
create policy row_scope on receiving.held_line_version for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));
alter table receiving.held_line_decision enable row level security;
create policy row_scope on receiving.held_line_decision for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));

grant select, insert on receiving.held_line to aos_runtime;
grant update (id) on receiving.held_line to aos_runtime;
grant select, insert on receiving.held_line_version to aos_runtime;
grant select, insert on receiving.held_line_decision to aos_runtime;
