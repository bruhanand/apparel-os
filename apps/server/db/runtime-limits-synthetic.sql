-- The runtime role's starting time limits for runtime work on synthetic data (code-house-rules 5.1; DEC-112, CH-3;
-- RR-200): a lock wait of 1 s and a statement of 5 s. A command that reaches one rolls back and reports the failure.
-- Both are tuned after measurement.
--
-- Run after roles.sql, as a superuser, only where the data is synthetic: by the integration-test helper, on a local
-- server, and on Railway `dev` through railway-roles-runbook.md. Never on `kdps-test` or production: their limits are
-- OPEN (CH-3), and none is set there until the product owner decides them.
--
-- Set on the role, not on a database, so they hold in every database and every copy (code-house-rules 5.1). They
-- reach only sessions that start afterwards. Longer limits for migration and maintenance, and any server-wide
-- setting, are not set here.
alter role aos_runtime set lock_timeout = '1s';
alter role aos_runtime set statement_timeout = '5s';
