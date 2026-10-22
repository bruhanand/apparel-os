-- The GRN's "PT attached" mark (goods-in 4.7, 5.1, 5.6, 10.3 "As built" with S2-F04-T02; PRD-REC-019, DEC-137):
-- `merchandise` · PT sets it when a PT file is submitted for the GRN and clears it when that draft is withdrawn (and,
-- with S2-F06-T01 and S2-F09-T01, when the PT is rejected or reversed); a recount is refused while it is set
-- (S2-F02-T05). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible with the
-- version running: it only adds a table and a privilege (code-house-rules 4.2).
--
-- Each set and clear is a dated, attributable change, append-only (code-house-rules 7.1), numbered from one per GRN in
-- the order made, so the newest is the mark now; it names the PT revision it was made for, another module's record
-- kept by its identifier with no foreign key (code-house-rules 3.2), why it was made, who made it under which
-- assignment, and when, with the business date. Every change locks the GRN's row at step 1 (code-house-rules 8.2), so a
-- PT submitted and a recount approved never pass each other: the GRN is now locked, so it grants the runtime role
-- UPDATE (id), the guard refusing the update itself (5.2). Scoped by the GRN's facts under `receiving.arrival`, as
-- every receiving table is, so whoever sees a GRN sees its mark (code-house-rules 6.1, 6.2).

grant update (id) on receiving.grn to aos_runtime;

create table receiving.grn_pt_mark (
  id uuid primary key,
  grn_id uuid not null references receiving.grn (id),
  change_number integer not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  legal_entity_id uuid not null,
  brand_id uuid not null,
  change text not null,
  pt_revision_id uuid not null,
  reason text not null,
  changed_by_user_id uuid not null,
  role_assignment_id uuid not null,
  occurred_at timestamptz not null,
  business_date date not null,
  recorded_at timestamptz not null default now(),
  constraint grn_pt_mark_number check (change_number > 0),
  constraint grn_pt_mark_once unique (grn_id, change_number),
  constraint grn_pt_mark_change check (change in ('set', 'cleared')),
  constraint grn_pt_mark_reason check (reason in ('pt-submitted', 'pt-withdrawn', 'pt-rejected', 'pt-reversed')
    and (change = 'set') = (reason = 'pt-submitted'))
);
create index grn_pt_mark_site on receiving.grn_pt_mark (site_id);
create index grn_pt_mark_store on receiving.grn_pt_mark (store_id);
create index grn_pt_mark_unit on receiving.grn_pt_mark (business_unit_id);
create index grn_pt_mark_legal_entity on receiving.grn_pt_mark (legal_entity_id);
create index grn_pt_mark_brand on receiving.grn_pt_mark (brand_id);
create trigger refuse_row_change before update or delete on receiving.grn_pt_mark
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on receiving.grn_pt_mark
  for each statement execute function kernel.refuse_change();

alter table receiving.grn_pt_mark enable row level security;
create policy row_scope on receiving.grn_pt_mark for all to aos_runtime
  using (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null))
  with check (access.row_visible('receiving.arrival', site_id, store_id, business_unit_id, legal_entity_id, brand_id,
    null));

grant select, insert on receiving.grn_pt_mark to aos_runtime;
