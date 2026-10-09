-- What My work needs for exceptions (access-and-approvals 11.1, 11.3, 12.2, 13.2; S1-F08-T02). Runs as
-- aos_migration (code-house-rules 5.1).
--
-- An actor may now be a role: its holders whose assignment covers the item's facts, as the item's record type declares
-- them, may act on it (12.2: "a role within the Site's scope, in the My work of each holder until one takes it");
-- `access` answers who holds it when My work is read, so an item drops out as soon as its reader no longer does.
alter table inbox.work_item_actor add column role_id uuid;
alter table inbox.work_item_actor drop constraint work_item_actor_one;
alter table inbox.work_item_actor add constraint work_item_actor_one
  check (num_nonnulls(user_id, eligibility, role_id) = 1);
create index work_item_actor_role on inbox.work_item_actor (role_id);

-- An escalation of a work item (11.3; PRD-ACS-010): the recipient added, a named user or a role, the owner kept, and
-- when. Append-only.
create table inbox.work_item_escalation (
  id uuid primary key,
  work_item_id uuid not null references inbox.work_item (id),
  recipient_user_id uuid,
  recipient_role_id uuid,
  escalated_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint work_item_escalation_recipient check (num_nonnulls(recipient_user_id, recipient_role_id) = 1)
);
create index work_item_escalation_item on inbox.work_item_escalation (work_item_id);

create trigger refuse_row_change before update or delete on inbox.work_item_escalation
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on inbox.work_item_escalation
  for each statement execute function kernel.refuse_change();

grant select, insert on inbox.work_item_escalation to aos_runtime;
