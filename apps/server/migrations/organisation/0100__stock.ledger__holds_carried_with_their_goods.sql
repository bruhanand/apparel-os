-- Held goods may become damaged (stock-ledger 2.3, 13.17; goods-in 4.4, 4.9; PRD-REC-006; RR-571, decided by the product
-- owner on 22 Oct 2026): a condition change to damaged takes units an excess hold or a quarantine holds too, and carries
-- those holds' claims with them, so each hold stays on its goods (6.2 "A hold moves with its goods"; POL-17.01). A
-- claim's units carried to another balance end where they were by a `hold_release` row of the event `moved`, naming
-- the movement that carried them, and the hold claims them at the balance they moved to by a new `hold_claim` row; so a
-- claim's quantity is still what it claimed less its release rows, which Rebuild and compare checks (2.1, 14.2), and a
-- reversal of the change finds what it carried. Only the excess hold and the quarantine are carried. Runs as
-- aos_migration, which owns the table. Compatible with the version running: it adds a nullable column and widens a
-- check every existing row meets (code-house-rules 4.2).

alter table stock.hold_release add column movement_id uuid references stock.movement (id);
create index hold_release_movement on stock.hold_release (movement_id);

alter table stock.hold_release drop constraint hold_release_event;
alter table stock.hold_release add constraint hold_release_event check (
  (release_event = 'moved' and hold_kind in ('excess', 'quarantine'))
  or case hold_kind
    when 'damage' then release_event in ('report-rejected', 'damage-confirmed')
    when 'quarantine' then release_event in ('approved-decision')
    when 'excess' then release_event in ('pt-route', 'loss-link')
    when 'source-conflict' then release_event in ('conflict-resolved')
    when 'expiry' then release_event in ('rule-change', 'supplier-return', 'write-off', 'disposal')
    when 'ordinary' then release_event in ('released')
    when 'count-freeze' then release_event in ('count-closed')
    when 'inspection' then release_event in ('inspected')
    when 'write-off' then release_event in ('disposal', 'write-off-reversed')
    else false end);
alter table stock.hold_release add constraint hold_release_moved
  check ((release_event = 'moved') = (movement_id is not null));
