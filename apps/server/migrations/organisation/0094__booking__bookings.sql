-- Bookings of the booking module: the booking, its versions and lines, its documents, the changes made to it, its
-- approval with the Agreement version it fixed, its number, and the open-to-buy each approval reserves (goods-in 3.1
-- to 3.4, 10.1, 10.3; module-map section 5; PRD-BKG-001 to PRD-BKG-004, PRD-BKG-014, PRD-MOD-010, PRD-MOD-011,
-- PRD-MOD-014; POL-05.01, POL-05.02, POL-01.04; DEC-129, DEC-130, DEC-132, DEC-136; S2-F01-T03). Runs as
-- aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the version running: it only
-- adds (code-house-rules 4.2). No price, budget or limit is written here: a line's indicative cost and MRP come from
-- the person who enters the booking, and every budget is the product owner's (V-17, RR-080).
--
-- A booking is a document (code-house-rules 7.2): a header naming its brand and its destination, fixed when it is
-- created, and versions holding its payload. Every save of a Draft writes a new version with its lines, frozen when
-- written, so a version never changes: the newest one is the Draft, submitting binds the approval request to it, and
-- an approval or a rejection is a row of its own. Each change, a version saved, documents attached, a submission, an
-- approval or a rejection, writes the booking's next change row, numbered under the booking's lock; the newest one's
-- identifier is the booking's version token (code-house-rules 12.7), and the people who saved versions or attached
-- documents since the booking's last approval are the preparers of the version submitted (access-and-approvals 9.1;
-- GC3-1). The state, Draft, Awaiting approval or Approved, is read from the newest change; nothing stores it.
--
-- Every row of a booking belongs to its destination, one Site, a Store's or a warehouse's, and to its brand, so those
-- tables are scoped under `booking.booking` (code-house-rules 6.1, 6.2; access-and-approvals 5.3): several Stores may
-- trade at one Site (PRD-ORG-021) and the business unit is chosen when the goods arrive (goods-in 3.1), so a booking
-- carries no Store, no unit and no legal entity, and a scope covering its Site covers it (structure-and-masters 3.9). The
-- reservations of open-to-buy belong to a budget, whose record type carries its brand and whose tables are unscoped
-- (migration 0086), so whoever reads a budget's remaining amount reads every reservation of it. References to other
-- modules' records keep their identifiers with no foreign key; every reference inside the schema has one, with an
-- index (code-house-rules 3.2, 3.3).

-- A booking (goods-in 3.1): its brand and its destination Site, fixed when it is created; a Draft
-- for another brand or destination is another booking. Every change of it locks this row exclusively at step 1
-- (code-house-rules 8.2).
create table booking.booking (
  id uuid primary key,
  brand_id uuid not null,
  site_id uuid not null,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now()
);
create index booking_brand on booking.booking (brand_id);
create index booking_site on booking.booking (site_id);
create trigger refuse_row_change before update or delete on booking.booking
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking
  for each statement execute function kernel.refuse_change();

-- A version of a booking, frozen when it is written (goods-in 3.1; code-house-rules 7.2): the supplier, linked to the
-- brand when it was saved (PRD-MER-021); the season, a value of the attribute marked as the season, with that marking's
-- version (structure-and-masters 4.2 "As built"; RR-550; code-house-rules 7.3, 12.14); and the delivery window
-- (POL-05.05). Numbered from one in the order saved.
create table booking.booking_version (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  version_number integer not null,
  brand_id uuid not null,
  site_id uuid not null,
  supplier_party_id uuid not null,
  season_attribute_id uuid not null,
  season_value_id uuid not null,
  season_marked_attribute_version_id uuid not null,
  window_from date not null,
  window_to date not null,
  saved_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint booking_version_number check (version_number > 0),
  constraint booking_version_once unique (booking_id, version_number),
  constraint booking_version_window check (window_from <= window_to)
);
create index booking_version_brand on booking.booking_version (brand_id);
create index booking_version_site on booking.booking_version (site_id);
create index booking_version_supplier on booking.booking_version (supplier_party_id);
create index booking_version_season on booking.booking_version (season_value_id);
create trigger refuse_row_change before update or delete on booking.booking_version
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_version
  for each statement execute function kernel.refuse_change();

-- A line of a version (goods-in 3.1; DEC-130): the style code, and the colour and size where the document gives them,
-- each as written, so a GRN line is matched against them later (goods-in 3.7); a missing size stays missing, never
-- Free Size (PRD-MER-005); whole pieces, more than zero; an indicative cost and an MRP per piece in whole paise, never
-- below zero (PRD-MOD-014), used only for the totals and the open-to-buy check, never as the receipt cost
-- (PRD-BKG-003); and a delivery date where the line arrives apart (POL-05.05).
create table booking.booking_line (
  id uuid primary key,
  booking_version_id uuid not null references booking.booking_version (id),
  line_number integer not null,
  brand_id uuid not null,
  site_id uuid not null,
  style_code text not null,
  colour text,
  size text,
  quantity integer not null,
  indicative_cost_paise bigint not null,
  mrp_paise bigint not null,
  delivery_date date,
  recorded_at timestamptz not null default now(),
  constraint booking_line_number unique (booking_version_id, line_number),
  constraint booking_line_texts check (style_code <> '' and colour <> '' and size <> ''),
  constraint booking_line_values check (line_number > 0 and quantity > 0 and indicative_cost_paise >= 0
    and mrp_paise >= 0)
);
create index booking_line_brand on booking.booking_line (brand_id);
create index booking_line_site on booking.booking_line (site_id);
create trigger refuse_row_change before update or delete on booking.booking_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_line
  for each statement execute function kernel.refuse_change();

-- A booking document the brand gave, a photo or PDF kept as a stored file attached to the booking (goods-in 3.1;
-- PRD-IMP-002; DEC-136); each file once.
create table booking.booking_document (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  brand_id uuid not null,
  site_id uuid not null,
  stored_file_id uuid not null,
  attachment_id uuid not null,
  attached_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint booking_document_once unique (booking_id, stored_file_id)
);
create index booking_document_brand on booking.booking_document (brand_id);
create index booking_document_site on booking.booking_document (site_id);
create trigger refuse_row_change before update or delete on booking.booking_document
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_document
  for each statement execute function kernel.refuse_change();

-- Each change of a booking, numbered from one in the order made under its lock, naming the version it made or
-- concerned and who made it. The newest one's identifier is the booking's version token (code-house-rules 12.7).
create table booking.booking_change (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  change_number integer not null,
  change text not null,
  booking_version_id uuid not null references booking.booking_version (id),
  brand_id uuid not null,
  site_id uuid not null,
  changed_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint booking_change_number check (change_number > 0),
  constraint booking_change_kind check (change in ('draft', 'documents', 'submission', 'approval', 'rejection')),
  constraint booking_change_once unique (booking_id, change_number)
);
create index booking_change_version on booking.booking_change (booking_version_id);
create index booking_change_brand on booking.booking_change (brand_id);
create index booking_change_site on booking.booking_change (site_id);
create trigger refuse_row_change before update or delete on booking.booking_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_change
  for each statement execute function kernel.refuse_change();

-- The approval of a version (goods-in 3.2 to 3.4; DEC-132): the brand's Agreement version in force on the approval's
-- business date, which the booking keeps (POL-01.04); the booking's value at cost that the approval reserved
-- (POL-05.02; DM-8); the decision of `access` that approved it and who approved it, when. One per version.
create table booking.booking_approval (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  booking_version_id uuid not null references booking.booking_version (id),
  brand_id uuid not null,
  site_id uuid not null,
  agreement_id uuid not null,
  agreement_version_id uuid not null,
  value_paise bigint not null,
  approval_decision_id uuid not null,
  approved_by_user_id uuid not null,
  approved_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint booking_approval_once unique (booking_version_id),
  constraint booking_approval_value check (value_paise >= 0)
);
create index booking_approval_booking on booking.booking_approval (booking_id);
create index booking_approval_brand on booking.booking_approval (brand_id);
create index booking_approval_site on booking.booking_approval (site_id);
create trigger refuse_row_change before update or delete on booking.booking_approval
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_approval
  for each statement execute function kernel.refuse_change();

-- The booking's number from the booking series, given once, by its first approval (goods-in 3.1; numbering-and-audit
-- 3.2); a draft carries its identifier as its internal reference.
create table booking.booking_number (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  brand_id uuid not null,
  site_id uuid not null,
  number text not null,
  number_allocation_id uuid not null,
  booking_approval_id uuid not null references booking.booking_approval (id),
  recorded_at timestamptz not null default now(),
  constraint booking_number_once unique (booking_id),
  constraint booking_number_unique unique (number),
  constraint booking_number_text check (number <> '')
);
create index booking_number_approval on booking.booking_number (booking_approval_id);
create index booking_number_brand on booking.booking_number (brand_id);
create index booking_number_site on booking.booking_number (site_id);
create trigger refuse_row_change before update or delete on booking.booking_number
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_number
  for each statement execute function kernel.refuse_change();

-- What an approved booking reserves of its brand and season's budget (goods-in 3.3; POL-05.02): the booking's value at
-- cost, written by the approval under the budget's lock, so two approvals never reserve the same remaining amount.
-- The remaining open-to-buy is the approved budget less every reservation of it. A release, when a balance is
-- cancelled or an approved change lowers the value, is a row of its own (S2-F01-T04).
create table booking.open_to_buy_reservation (
  id uuid primary key,
  open_to_buy_budget_id uuid not null references booking.open_to_buy_budget (id),
  booking_id uuid not null references booking.booking (id),
  booking_approval_id uuid not null references booking.booking_approval (id),
  amount_paise bigint not null,
  recorded_at timestamptz not null default now(),
  constraint open_to_buy_reservation_once unique (booking_approval_id),
  constraint open_to_buy_reservation_amount check (amount_paise >= 0)
);
create index open_to_buy_reservation_budget on booking.open_to_buy_reservation (open_to_buy_budget_id);
create index open_to_buy_reservation_booking on booking.open_to_buy_reservation (booking_id);
create trigger refuse_row_change before update or delete on booking.open_to_buy_reservation
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.open_to_buy_reservation
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): every row of a booking through `access.row_visible` with its destination
-- and brand, under the booking's record type.
alter table booking.booking enable row level security;
create policy row_scope on booking.booking for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_version enable row level security;
create policy row_scope on booking.booking_version for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_line enable row level security;
create policy row_scope on booking.booking_line for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_document enable row level security;
create policy row_scope on booking.booking_document for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_change enable row level security;
create policy row_scope on booking.booking_change for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_approval enable row level security;
create policy row_scope on booking.booking_approval for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_number enable row level security;
create policy row_scope on booking.booking_number for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));

grant select, insert on booking.booking to aos_runtime;
grant update (id) on booking.booking to aos_runtime;
grant select, insert on booking.booking_version to aos_runtime;
grant select, insert on booking.booking_line to aos_runtime;
grant select, insert on booking.booking_document to aos_runtime;
grant select, insert on booking.booking_change to aos_runtime;
grant select, insert on booking.booking_approval to aos_runtime;
grant select, insert on booking.booking_number to aos_runtime;
grant select, insert on booking.open_to_buy_reservation to aos_runtime;
