-- The lifecycle of an approved booking (goods-in 3.4 to 3.8, 3.10, 10.1, 10.3; PRD-BKG-005, PRD-BKG-006, PRD-BKG-008,
-- PRD-BKG-009, PRD-BKG-013; POL-05.01, POL-05.03 to POL-05.07, POL-05.10; DEC-099, DEC-132; S2-F01-T04): a line's
-- identity across versions; Issued and Confirmed, with the supplier's confirmation; the supplier's communication with a
-- change, a cancellation or an extension after issue; cancellations of an undelivered balance and extensions of the
-- window, each with its decision; the receipt links that give each line its delivered quantity; the marks of an
-- overdue balance; and the open-to-buy a cancellation or a lowering change releases. Runs as aos_migration, which owns
-- everything it creates (code-house-rules 5.1). Compatible with the version running: it only adds, and widens the
-- change kinds a booking's change row accepts (code-house-rules 4.2). No value, date or limit is written here.
--
-- Every row of a booking belongs to its destination Site and its brand, under `booking.booking`, as migration 0094's
-- (code-house-rules 6.1, 6.2; goods-in 3.9). The releases belong to a budget, as its reservations do: unscoped, so
-- whoever reads a budget's remaining amount reads every release of it. References to other modules' records, a GRN, a
-- GRN line, a stored file, an attachment, an exception or a decision of `access`, keep their identifiers with no
-- foreign key; every reference inside the schema has one, with an index (code-house-rules 3.2, 3.3). Every table is
-- append-only (code-house-rules 7.1).

-- A line's identity across versions (goods-in 3.10): a line written in a version continues, where it names one, the
-- line of an earlier version of the booking as that line was first written; its key is then that line's identifier,
-- otherwise its own. Receipt links, cancellations and overdue marks name the key. No row written before is changed:
-- each continues none (code-house-rules 4.2 "Data").
alter table booking.booking_line add column first_line_id uuid references booking.booking_line (id);
create index booking_line_first on booking.booking_line (first_line_id);

-- The kinds of change a booking's change row records, widened by the lifecycle: Issued and Confirmed recorded, the
-- supplier's files attached, a cancellation or an extension proposed and decided. Each is the booking's next change,
-- numbered under its lock, so its identifier is the booking's version token (code-house-rules 12.7).
alter table booking.booking_change drop constraint booking_change_kind;
alter table booking.booking_change add constraint booking_change_kind check (change in ('draft', 'documents',
  'submission', 'approval', 'rejection', 'issue', 'confirmation', 'amendment', 'amendment-decision'));

-- The approved version sent to the supplier, on the date Booking gives, since nothing is sent from the app before
-- stage 5 (goods-in 3.4; POL-05.01; DEC-099). One per version.
create table booking.booking_issue (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  booking_version_id uuid not null references booking.booking_version (id),
  brand_id uuid not null,
  site_id uuid not null,
  issued_on date not null,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint booking_issue_once unique (booking_version_id)
);
create index booking_issue_booking on booking.booking_issue (booking_id);
create index booking_issue_brand on booking.booking_issue (brand_id);
create index booking_issue_site on booking.booking_issue (site_id);
create trigger refuse_row_change before update or delete on booking.booking_issue
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_issue
  for each statement execute function kernel.refuse_change();

-- The supplier's acceptance of the version issued, on the date Booking gives, its confirmation attached as stored files
-- (goods-in 3.4; POL-05.01). One per version.
create table booking.booking_confirmation (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  booking_version_id uuid not null references booking.booking_version (id),
  brand_id uuid not null,
  site_id uuid not null,
  confirmed_on date not null,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint booking_confirmation_once unique (booking_version_id)
);
create index booking_confirmation_booking on booking.booking_confirmation (booking_id);
create index booking_confirmation_brand on booking.booking_confirmation (brand_id);
create index booking_confirmation_site on booking.booking_confirmation (site_id);
create trigger refuse_row_change before update or delete on booking.booking_confirmation
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_confirmation
  for each statement execute function kernel.refuse_change();

-- A cancellation of an undelivered balance or an extension of the window, proposed by Booking against the approved
-- version in force, and approved by a different person (goods-in 3.5; POL-05.07, POL-05.10). An extension names the
-- window's new end; its lines, below, their new delivery dates. Frozen when proposed.
create table booking.booking_amendment (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  booking_version_id uuid not null references booking.booking_version (id),
  brand_id uuid not null,
  site_id uuid not null,
  kind text not null,
  window_to date,
  proposed_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint booking_amendment_kind check (kind in ('cancellation', 'extension')),
  constraint booking_amendment_window check ((kind = 'extension') = (window_to is not null))
);
create index booking_amendment_booking on booking.booking_amendment (booking_id);
create index booking_amendment_version on booking.booking_amendment (booking_version_id);
create index booking_amendment_brand on booking.booking_amendment (brand_id);
create index booking_amendment_site on booking.booking_amendment (site_id);
create trigger refuse_row_change before update or delete on booking.booking_amendment
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_amendment
  for each statement execute function kernel.refuse_change();

-- A line a cancellation or an extension names, by its key: the quantity a cancellation cancels, the line's whole
-- outstanding balance when proposed (goods-in 3.6), or the new delivery date an extension gives it.
create table booking.booking_amendment_line (
  id uuid primary key,
  booking_amendment_id uuid not null references booking.booking_amendment (id),
  booking_line_id uuid not null references booking.booking_line (id),
  brand_id uuid not null,
  site_id uuid not null,
  quantity integer,
  delivery_date date,
  recorded_at timestamptz not null default now(),
  constraint booking_amendment_line_once unique (booking_amendment_id, booking_line_id),
  constraint booking_amendment_line_value check (num_nonnulls(quantity, delivery_date) = 1 and quantity > 0)
);
create index booking_amendment_line_line on booking.booking_amendment_line (booking_line_id);
create index booking_amendment_line_brand on booking.booking_amendment_line (brand_id);
create index booking_amendment_line_site on booking.booking_amendment_line (site_id);
create trigger refuse_row_change before update or delete on booking.booking_amendment_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_amendment_line
  for each statement execute function kernel.refuse_change();

-- The decision of a cancellation or an extension, made through `access` by a different person from its proposer
-- (goods-in 3.5; POL-02.07): once, Approved or Rejected, on the business date it was made.
create table booking.booking_amendment_decision (
  id uuid primary key,
  booking_amendment_id uuid not null references booking.booking_amendment (id),
  brand_id uuid not null,
  site_id uuid not null,
  decision text not null,
  approval_decision_id uuid not null,
  decided_by_user_id uuid not null,
  decided_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint booking_amendment_decision_once unique (booking_amendment_id),
  constraint booking_amendment_decision_kind check (decision in ('Approved', 'Rejected'))
);
create index booking_amendment_decision_brand on booking.booking_amendment_decision (brand_id);
create index booking_amendment_decision_site on booking.booking_amendment_decision (site_id);
create trigger refuse_row_change before update or delete on booking.booking_amendment_decision
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_amendment_decision
  for each statement execute function kernel.refuse_change();

-- A file from the supplier, stored first and attached to the booking: the confirmation of the version issued, or the
-- communication with a change, a cancellation or an extension after issue (goods-in 3.4, 3.5; POL-05.04). It belongs
-- to exactly one of them.
create table booking.booking_supplier_file (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  brand_id uuid not null,
  site_id uuid not null,
  booking_confirmation_id uuid references booking.booking_confirmation (id),
  booking_version_id uuid references booking.booking_version (id),
  booking_amendment_id uuid references booking.booking_amendment (id),
  stored_file_id uuid not null,
  attachment_id uuid not null,
  attached_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint booking_supplier_file_of check (num_nonnulls(booking_confirmation_id, booking_version_id,
    booking_amendment_id) = 1)
);
create index booking_supplier_file_booking on booking.booking_supplier_file (booking_id);
create index booking_supplier_file_confirmation on booking.booking_supplier_file (booking_confirmation_id);
create index booking_supplier_file_version on booking.booking_supplier_file (booking_version_id);
create index booking_supplier_file_amendment on booking.booking_supplier_file (booking_amendment_id);
create index booking_supplier_file_brand on booking.booking_supplier_file (brand_id);
create index booking_supplier_file_site on booking.booking_supplier_file (site_id);
create trigger refuse_row_change before update or delete on booking.booking_supplier_file
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_supplier_file
  for each statement execute function kernel.refuse_change();

-- A GRN line linked to a booking line, by its key, at the GRN's issue or later by Booking, dated and signed (goods-in
-- 3.6, 3.7; PRD-BKG-006 to PRD-BKG-008): the pieces counted on it that are delivered, which the caller gives. A GRN
-- line links once; the link never changes the GRN. The GRN, its line and its Site are `receiving`'s.
create table booking.booking_receipt_link (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  booking_line_id uuid not null references booking.booking_line (id),
  brand_id uuid not null,
  site_id uuid not null,
  grn_id uuid not null,
  grn_line_id uuid not null,
  grn_site_id uuid not null,
  quantity integer not null,
  kind text not null,
  linked_by_user_id uuid not null,
  linked_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint booking_receipt_link_once unique (grn_line_id),
  constraint booking_receipt_link_quantity check (quantity >= 0),
  constraint booking_receipt_link_kind check (kind in ('at-issue', 'later'))
);
create index booking_receipt_link_booking on booking.booking_receipt_link (booking_id);
create index booking_receipt_link_line on booking.booking_receipt_link (booking_line_id);
create index booking_receipt_link_grn on booking.booking_receipt_link (grn_id);
create index booking_receipt_link_brand on booking.booking_receipt_link (brand_id);
create index booking_receipt_link_site on booking.booking_receipt_link (site_id);
create trigger refuse_row_change before update or delete on booking.booking_receipt_link
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_receipt_link
  for each statement execute function kernel.refuse_change();

-- A line's balance marked overdue by the overdue job once its due date passed with something outstanding, with the
-- exception it raised to Booking (goods-in 3.8; PRD-BKG-009; POL-05.06): once per line and due date, so an extended
-- line is marked again only if its new date passes too. Nothing is cancelled by it.
create table booking.booking_overdue (
  id uuid primary key,
  booking_id uuid not null references booking.booking (id),
  booking_line_id uuid not null references booking.booking_line (id),
  brand_id uuid not null,
  site_id uuid not null,
  due_date date not null,
  outstanding integer not null,
  exception_id uuid not null,
  marked_by_service_identity_id uuid not null,
  marked_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint booking_overdue_once unique (booking_line_id, due_date),
  constraint booking_overdue_outstanding check (outstanding > 0)
);
create index booking_overdue_booking on booking.booking_overdue (booking_id);
create index booking_overdue_exception on booking.booking_overdue (exception_id);
create index booking_overdue_brand on booking.booking_overdue (brand_id);
create index booking_overdue_site on booking.booking_overdue (site_id);
create trigger refuse_row_change before update or delete on booking.booking_overdue
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.booking_overdue
  for each statement execute function kernel.refuse_change();

-- What a cancellation, or an approved change that lowers the booking's value, releases of the open-to-buy the booking
-- reserves (goods-in 3.3, 3.5; POL-05.02): written under the budget's lock. The remaining open-to-buy is the approved
-- budget less every reservation of it, plus every release; received goods keep their share reserved.
create table booking.open_to_buy_release (
  id uuid primary key,
  open_to_buy_budget_id uuid not null references booking.open_to_buy_budget (id),
  booking_id uuid not null references booking.booking (id),
  booking_approval_id uuid references booking.booking_approval (id),
  booking_amendment_id uuid references booking.booking_amendment (id),
  amount_paise bigint not null,
  recorded_at timestamptz not null default now(),
  constraint open_to_buy_release_of check (num_nonnulls(booking_approval_id, booking_amendment_id) = 1),
  constraint open_to_buy_release_amount check (amount_paise > 0)
);
create index open_to_buy_release_budget on booking.open_to_buy_release (open_to_buy_budget_id);
create index open_to_buy_release_booking on booking.open_to_buy_release (booking_id);
create index open_to_buy_release_approval on booking.open_to_buy_release (booking_approval_id);
create index open_to_buy_release_amendment on booking.open_to_buy_release (booking_amendment_id);
create trigger refuse_row_change before update or delete on booking.open_to_buy_release
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on booking.open_to_buy_release
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): every row of a booking through `access.row_visible` with its destination
-- and brand, under the booking's record type.
alter table booking.booking_issue enable row level security;
create policy row_scope on booking.booking_issue for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_confirmation enable row level security;
create policy row_scope on booking.booking_confirmation for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_amendment enable row level security;
create policy row_scope on booking.booking_amendment for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_amendment_line enable row level security;
create policy row_scope on booking.booking_amendment_line for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_amendment_decision enable row level security;
create policy row_scope on booking.booking_amendment_decision for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_supplier_file enable row level security;
create policy row_scope on booking.booking_supplier_file for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_receipt_link enable row level security;
create policy row_scope on booking.booking_receipt_link for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));
alter table booking.booking_overdue enable row level security;
create policy row_scope on booking.booking_overdue for all to aos_runtime
  using (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null))
  with check (access.row_visible('booking.booking', site_id, null, null, null, brand_id, null));

grant select, insert on booking.booking_issue to aos_runtime;
grant select, insert on booking.booking_confirmation to aos_runtime;
grant select, insert on booking.booking_amendment to aos_runtime;
grant select, insert on booking.booking_amendment_line to aos_runtime;
grant select, insert on booking.booking_amendment_decision to aos_runtime;
grant select, insert on booking.booking_supplier_file to aos_runtime;
grant select, insert on booking.booking_receipt_link to aos_runtime;
grant select, insert on booking.booking_overdue to aos_runtime;
grant select, insert on booking.open_to_buy_release to aos_runtime;

-- The pg-boss queue of the job kind that marks overdue balances and raises their exceptions to Booking (goods-in 3.8;
-- POL-05.06), created by migration because the runtime role creates no object (code-house-rules 3.2, 12.9). Kept as
-- every queue of 0009: pg-boss deletes no job until the retention periods of CH-9 are set.
select pgboss.create_queue('booking.mark-overdue', jsonb_build_object(
  'policy', 'standard',
  'retryLimit', 0,
  'deleteAfterSeconds', 0,
  'retentionSeconds', 2147483647
));
