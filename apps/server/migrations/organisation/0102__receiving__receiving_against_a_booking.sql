-- Receiving against a booking (goods-in 3.7, 4.1, 4.2, 4.5, 4.10, 10.3; PRD-REC-002, PRD-BKG-007, PRD-BKG-008;
-- POL-05.08; DEC-130; S2-F02-T04). Runs as aos_migration, which owns everything it changes and creates
-- (code-house-rules 5.1). Compatible with the version running: it only adds (code-house-rules 4.2). No value is
-- written here.
--
-- An Arrival may name the one booking the goods come against ("Receive against booking"), or none ("Goods arrived"),
-- fixed when it is recorded, as its other details are (goods-in 4.8). A booking is `booking`'s record: its identifier is
-- kept with no foreign key (code-house-rules 3.2), with an index (3.3). The rows written before this migration name
-- none: Arrivals could not name a booking before it.
--
-- At its GRN's issue each GRN line of an Arrival against a booking that delivers pieces either links to the booking
-- line it matches, through `booking`'s receipt link, or goes to Booking for review, with why (goods-in 3.7). Its
-- outcome is a fact of the GRN's issue, kept here so that the GRN shows it to whoever reads it; the link itself is
-- `booking`'s, and a later link is `booking`'s alone. The row belongs to the place, legal entity and brand of its
-- Arrival, under the Arrival's record type, as every row of `receiving` is (code-house-rules 6.1, 6.2). Append-only
-- (7.1).

alter table receiving.arrival add column booking_id uuid;
create index arrival_booking on receiving.arrival (booking_id);

create table receiving.grn_line_booking (
  id uuid primary key,
  grn_id uuid not null references receiving.grn (id),
  grn_line_id uuid not null references receiving.grn_line (id),
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  booking_id uuid not null,
  outcome text not null,
  reason text,
  booking_line_key uuid,
  receipt_link_id uuid,
  recorded_at timestamptz not null default now(),
  constraint grn_line_booking_once unique (grn_line_id),
  constraint grn_line_booking_outcome check (outcome in ('linked', 'review')),
  constraint grn_line_booking_reason check (
    (outcome = 'linked' and reason is null and booking_line_key is not null and receipt_link_id is not null)
    or (outcome = 'review' and receipt_link_id is null
      and reason in ('no-match', 'ambiguous', 'other-site', 'other-supplier', 'not-approved', 'late', 'excess')
      and ((reason in ('late', 'excess')) = (booking_line_key is not null))))
);
create index grn_line_booking_grn on receiving.grn_line_booking (grn_id);
create index grn_line_booking_booking on receiving.grn_line_booking (booking_id);
create index grn_line_booking_site on receiving.grn_line_booking (site_id);
create index grn_line_booking_store on receiving.grn_line_booking (store_id);
create index grn_line_booking_unit on receiving.grn_line_booking (business_unit_id);
create index grn_line_booking_legal_entity on receiving.grn_line_booking (legal_entity_id);
create index grn_line_booking_brand on receiving.grn_line_booking (brand_id);
create trigger refuse_row_change before update or delete on receiving.grn_line_booking
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.grn_line_booking
  for each statement execute function kernel.refuse_change();

-- Row-level security (code-house-rules 6.2): under the Arrival's record type, with every scope fact.
alter table receiving.grn_line_booking enable row level security;
create policy row_scope on receiving.grn_line_booking for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));

grant select, insert on receiving.grn_line_booking to aos_runtime;
