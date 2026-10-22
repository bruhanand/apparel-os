-- A proposal to link late or excess goods into a booking, and its decision (goods-in 3.7, 4.10, 10.3; PRD-BKG-008;
-- POL-05.08; S2-F02-T04): "Late or excess goods may be recorded into physical custody, but require approval before
-- acceptance into the booking". Booking proposes linking GRN lines whose goods arrived after the delivery window, as
-- extended, or beyond the booking line's outstanding balance; a different authorised person approves it through
-- `access`, and the approval writes the receipt links, each naming the proposal it came from (the product owner, 22 Oct
-- 2026; RR-577). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the
-- version running: it only adds (code-house-rules 4.2). No value, date or limit is written here.
--
-- Every row belongs to the booking's destination Site and its brand, under `booking.booking`, as migration 0098's
-- (code-house-rules 6.1, 6.2; goods-in 3.9). A GRN and a GRN line are `receiving`'s records: their identifiers are kept
-- with no foreign key (code-house-rules 3.2); every reference inside the schema has one, with an index (3.3). Every
-- table is append-only (code-house-rules 7.1).

-- A proposal: the booking, the approved version in force when it was proposed, and who proposed it. One proposal of a
-- booking waits for its decision at a time (goods-in 4.10), checked under the booking's lock.
create table booking.booking_receipt_link_proposal (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  booking_version_id uuid not null references booking.booking_version (id),
  brand_id uuid not null,
  site_id uuid not null,
  proposed_by_user_id uuid not null,
  recorded_at timestamptz not null default now()
);
create index booking_receipt_link_proposal_booking on booking.booking_receipt_link_proposal (booking_id);
create index booking_receipt_link_proposal_version on booking.booking_receipt_link_proposal (booking_version_id);
create index booking_receipt_link_proposal_brand on booking.booking_receipt_link_proposal (brand_id);
create index booking_receipt_link_proposal_site on booking.booking_receipt_link_proposal (site_id);
create trigger refuse_row_change before update or delete on booking.booking_receipt_link_proposal
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_receipt_link_proposal
  for each statement execute function kernel.refuse_change();

-- A GRN line a proposal links, to the booking line it names by its key, with the goods the GRN line counted, the pieces
-- it delivers, its arrival date, and why it needs approval: late, excess or both, as when proposed.
create table booking.booking_receipt_link_proposal_line (
  id uuid primary key,
  booking_receipt_link_proposal_id uuid not null references booking.booking_receipt_link_proposal (id),
  booking_line_id uuid not null references booking.booking_line (id),
  brand_id uuid not null,
  site_id uuid not null,
  grn_id uuid not null,
  grn_number text not null,
  grn_line_id uuid not null,
  grn_site_id uuid not null,
  style_code text not null,
  colour text,
  size text,
  quantity integer not null,
  arrival_date date not null,
  late boolean not null,
  excess boolean not null,
  recorded_at timestamptz not null default now(),
  constraint booking_receipt_link_proposal_line_once unique (booking_receipt_link_proposal_id, grn_line_id),
  constraint booking_receipt_link_proposal_line_quantity check (quantity > 0),
  constraint booking_receipt_link_proposal_line_why check (late or excess)
);
create index booking_receipt_link_proposal_line_line on booking.booking_receipt_link_proposal_line (booking_line_id);
create index booking_receipt_link_proposal_line_grn_line
  on booking.booking_receipt_link_proposal_line (grn_line_id);
create index booking_receipt_link_proposal_line_brand on booking.booking_receipt_link_proposal_line (brand_id);
create index booking_receipt_link_proposal_line_site on booking.booking_receipt_link_proposal_line (site_id);
create trigger refuse_row_change before update or delete on booking.booking_receipt_link_proposal_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_receipt_link_proposal_line
  for each statement execute function kernel.refuse_change();

-- A proposal's decision, made once through `access` by a different person from its proposer (POL-02.07): Approved,
-- which wrote its receipt links, or Rejected, on the business date it was made.
create table booking.booking_receipt_link_proposal_decision (
  id uuid primary key,
  booking_receipt_link_proposal_id uuid not null references booking.booking_receipt_link_proposal (id),
  brand_id uuid not null,
  site_id uuid not null,
  decision text not null,
  approval_decision_id uuid not null,
  decided_by_user_id uuid not null,
  decided_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint booking_receipt_link_proposal_decision_once unique (booking_receipt_link_proposal_id),
  constraint booking_receipt_link_proposal_decision_kind check (decision in ('Approved', 'Rejected'))
);
create index booking_receipt_link_proposal_decision_brand on booking.booking_receipt_link_proposal_decision (brand_id);
create index booking_receipt_link_proposal_decision_site on booking.booking_receipt_link_proposal_decision (site_id);
create trigger refuse_row_change before update or delete on booking.booking_receipt_link_proposal_decision
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_receipt_link_proposal_decision
  for each statement execute function kernel.refuse_change();

-- A receipt link an approved proposal wrote names it; a link made at issue, or later with no approval, names none.
alter table booking.booking_receipt_link
  add column booking_receipt_link_proposal_id uuid references booking.booking_receipt_link_proposal (id);
create index booking_receipt_link_of_proposal on booking.booking_receipt_link (booking_receipt_link_proposal_id);

-- Row-level security (code-house-rules 6.2): under the booking's record type, by its Site and its brand.
alter table booking.booking_receipt_link_proposal enable row level security;
create policy row_scope on booking.booking_receipt_link_proposal for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_receipt_link_proposal_line enable row level security;
create policy row_scope on booking.booking_receipt_link_proposal_line for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_receipt_link_proposal_decision enable row level security;
create policy row_scope on booking.booking_receipt_link_proposal_decision for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));

grant select, insert on booking.booking_receipt_link_proposal to aos_runtime;
grant select, insert on booking.booking_receipt_link_proposal_line to aos_runtime;
grant select, insert on booking.booking_receipt_link_proposal_decision to aos_runtime;
