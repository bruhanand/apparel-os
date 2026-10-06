-- The two database roles (code-house-rules 5.1; deployment.md section 4; PRD-SEC-005).
-- Run once per PostgreSQL server as a superuser: by the integration-test helper, on a local server, and on Railway
-- through railway-roles-runbook.md. Passwords are never in this file: set them afterwards, outside the repository.

-- Owns every directory and Organisation database and every object in them. Used only by the migration runner,
-- the setup step (CH-1) and test setup. CREATEDB so that the setup step can create an Organisation's database.
create role aos_migration with login nosuperuser createdb nocreaterole noreplication nobypassrls;

-- Used by app and worker. Owns nothing, creates nothing, never bypasses row-level security.
create role aos_runtime with login nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

-- Set on the role, not on a database, so it holds in every database and every copy (code-house-rules 5.1).
-- No application schema is on the path: every name in SQL is schema-qualified (code-house-rules 3.2).
-- The time limits of CH-3 are not set here, because this file also runs on `kdps-test`, whose limits are OPEN: the
-- starting limits for synthetic work are in runtime-limits-synthetic.sql, run only locally, in tests and on `dev`.
alter role aos_runtime set search_path = public;
