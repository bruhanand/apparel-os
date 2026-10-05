-- The directory of Organisations (DEC-093, PRD-MOD-001, PRD-ACS-020; code-house-rules 3.1; deployment.md section 4;
-- access-and-approvals 3.1, 3.3). It holds only each Organisation's code and where its database is: the name of
-- that database on the same PostgreSQL server. No user, session, identifier hash or business record is ever kept
-- here; they live in the Organisation's own database.
-- Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).

create table kernel.directory_entry (
  id uuid primary key,
  -- The code a person types at sign-in, compared exactly (structure-and-masters 2.1).
  organisation_code text not null unique check (organisation_code <> ''),
  -- One database per Organisation, so no two codes share one. A plain name of at most 63 characters, PostgreSQL's
  -- limit, as kernel routing accepts it (src/kernel/db/connection.ts): it needs no escaping to be reached.
  database_name text not null unique check (database_name ~ '^[A-Za-z0-9_]{1,63}$')
);

-- Organisation routing reads it as the runtime role (module-map 4.1). Nothing else: only the setup step, the
-- fixtures and the local seed register a code, and none of them as the runtime role yet (code-house-rules 11.2).
grant select on kernel.directory_entry to aos_runtime;
