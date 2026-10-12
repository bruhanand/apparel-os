-- The test-only stand-in for a Store's switch and its day-close cutover (imports-and-opening-data 10.1, 12; GC-6 12;
-- code-house-rules 11.4; POL-14.07, PRD-LIF-011, PRD-LIF-026; S1-F13-T03). The switch flow is the stage 4
-- `site-lifecycle` design; until then the opening-stock test handler answers the switch of a unit from this stand-in.
-- A test-only migration set: only test setup applies it; the pre-deploy runner never reads it. Every row is SYNTHETIC.
-- Runs as aos_migration, which owns everything it creates.
create schema test_opening_stock;
grant usage on schema test_opening_stock to aos_runtime;

-- One approved switch of a unit: its Site and business unit, and when it was approved. Written by the test directly, as
-- the switch flow would; never changed.
create table test_opening_stock.switch (
  id uuid primary key,
  site_id uuid not null,
  business_unit_id uuid not null,
  approved_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
create trigger refuse_row_change before update or delete on test_opening_stock.switch
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on test_opening_stock.switch
  for each statement execute function kernel.refuse_change();

-- The day-close cutover of a switch, once complete: after it, no opening batch is started or published for the unit
-- (PRD-LIF-011). Written by the test directly; never changed.
create table test_opening_stock.cutover (
  id uuid primary key,
  switch_id uuid not null unique references test_opening_stock.switch (id),
  completed_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
create trigger refuse_row_change before update or delete on test_opening_stock.cutover
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on test_opening_stock.cutover
  for each statement execute function kernel.refuse_change();

grant select on test_opening_stock.switch to aos_runtime;
grant select on test_opening_stock.cutover to aos_runtime;
