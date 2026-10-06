-- The pg-boss queue of the access job kind that rebuilds effective grants when a start or end date passes
-- (access-and-approvals 7.2; S1-F01-T11), created by migration because the runtime role creates no object
-- (code-house-rules 3.2, 12.9). Kept as every queue of 0009: pg-boss deletes no job until the retention periods of
-- CH-9 are set. Runs as aos_migration (code-house-rules 5.1).
select pgboss.create_queue('access.rebuild-grants', jsonb_build_object(
  'policy', 'standard',
  'retryLimit', 0,
  'deleteAfterSeconds', 0,
  'retentionSeconds', 2147483647
));
