-- The scheduled partition upkeep, hardened (numbering-and-audit 4.4; code-house-rules 5.2, 8.1, 12.9; DEC-118,
-- RR-240; S1-F01 review). Runs as aos_migration, which owns the function (code-house-rules 5.1).
--
-- audit.ensure_partitions runs with the migration role's rights since 0019, as SECURITY DEFINER. Its search path is now
-- pg_catalog then pg_temp, so no temporary object a caller makes can stand in for a catalog one: pg_temp is searched
-- first unless it is named, and named last it comes after every catalog name.
--
-- Two runs at once, such as two workers' jobs or a deploy's maintenance file beside a job, could both find a partition
-- missing and both try to create it, and the second failed on the name. Each run now takes a transaction advisory lock
-- first, keyed by the function's name, so a second run waits for the first to commit and then finds the partitions
-- made. The function still only creates the missing partitions of the coming months: it never drops, detaches or
-- deletes a partition or a row (PRD-SEC-007, PRD-MOD-011). CREATE OR REPLACE keeps its owner and its grants (0019).
create or replace function audit.ensure_partitions() returns void
  language plpgsql
  security definer
  set search_path = pg_catalog, pg_temp
  set timezone = 'UTC'
as $$
declare
  months_ahead constant integer := 3;
  first_month timestamptz;
  month_start timestamptz;
  partition_name text;
  parent text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    ('x' || pg_catalog.encode(pg_catalog.sha224('audit.ensure_partitions'::bytea), 'hex'))::bit(64)::bigint);
  first_month := pg_catalog.date_trunc('month', pg_catalog.now());
  foreach parent in array array['audit_record', 'access_record'] loop
    for step in 0 .. months_ahead loop
      month_start := first_month + pg_catalog.make_interval(months => step);
      partition_name := pg_catalog.format('%s_y%sm%s', parent, pg_catalog.to_char(month_start, 'YYYY'),
        pg_catalog.to_char(month_start, 'MM'));
      if pg_catalog.to_regclass(pg_catalog.format('audit.%I', partition_name)) is null then
        execute pg_catalog.format('create table audit.%I partition of audit.%I for values from (%L) to (%L)',
          partition_name, parent, month_start, month_start + interval '1 month');
        execute pg_catalog.format(
          'create trigger %I before truncate on audit.%I for each statement execute function kernel.refuse_change()',
          partition_name || '_no_truncate', partition_name);
      end if;
    end loop;
  end loop;
end;
$$;
