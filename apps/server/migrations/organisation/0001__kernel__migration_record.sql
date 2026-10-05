-- The runner's own record of applied files (code-house-rules 4.3). Every set starts with this file: the runner
-- applies it, and records it in the same transaction, before the table exists anywhere else.
-- Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).

create schema kernel;

-- USAGE on each application schema (code-house-rules 5.2). Nothing on kernel.migration itself.
grant usage on schema kernel to aos_runtime;

create table kernel.migration (
  id uuid primary key,
  file_name text not null unique,
  checksum_sha256 text not null,
  applied_by text not null,
  recorded_at timestamptz not null default now()
);
