-- The row that serialises a change of `numbering`'s Organisation settings (numbering-and-audit 3.3, 3.5; code-house-rules
-- 8.1, 8.2; offline-counter 4.3b; S1-F12-T03 review). Runs as aos_migration, which owns everything it creates
-- (code-house-rules 5.1). It only adds (4.2).
--
-- Approving a financial year or a kind's number format rechecks what is defined (the years, the formats, the format in
-- force) and then gives every Active billing device its missing series. Those rows are only ever added, so no row a
-- recheck reads can be locked; with no billing device nothing else serialises two such approvals. Each holds this one
-- row exclusively at step 1, so the second waits for the first and rechecks what it wrote (code-house-rules 8.1). One
-- row for both settings, since a year's approval reads the format in force and a format's approval reads the years.
-- It holds no value: only its identifier, which the lock call names.
create table numbering.settings_lock (
  id uuid primary key,
  one_row boolean not null,
  constraint settings_lock_one_row check (one_row),
  constraint settings_lock_one_row_unique unique (one_row)
);
insert into numbering.settings_lock (id, one_row) values (gen_random_uuid(), true);
create trigger refuse_row_change before update or delete on numbering.settings_lock
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on numbering.settings_lock
  for each statement execute function kernel.refuse_change();

-- Runtime grants (code-house-rules 5.2): read the row, and the row lock's update on its identifier only (7.1).
grant select on numbering.settings_lock to aos_runtime;
grant update (id) on numbering.settings_lock to aos_runtime;
