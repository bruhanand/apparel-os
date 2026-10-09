-- The pg-boss queue of the exceptions job kind that escalates open exceptions past their due time
-- (access-and-approvals 11.3; S1-F08-T02), created by migration because the runtime role creates no object
-- (code-house-rules 3.2, 12.9). Kept as every queue of 0009: pg-boss deletes no job until the retention periods of
-- CH-9 are set. Runs as aos_migration (code-house-rules 5.1).
select pgboss.create_queue('exceptions.escalate-overdue', jsonb_build_object(
  'policy', 'standard',
  'retryLimit', 0,
  'deleteAfterSeconds', 0,
  'retentionSeconds', 2147483647
));
