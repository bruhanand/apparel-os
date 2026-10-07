-- The scheduled upkeep of the audit partitions between deploys (numbering-and-audit 4.4; code-house-rules 3.2, 5.2,
-- 12.9; DEC-118, RR-240; S1-F01-T24). Runs as aos_migration (code-house-rules 5.1).
--
-- The worker sends the job kind audit.ensure-partitions for each Organisation under the audit-jobs service identity,
-- and its step calls audit.ensure_partitions as the runtime role. The function stays owned by the migration role and
-- now runs with its rights, as SECURITY DEFINER; it already sets its own search_path (pg_catalog) and timezone (0003).
-- The runtime role holds EXECUTE on this function alone, and still cannot create, drop or detach a partition itself.
-- The function only creates the missing partitions of the coming months: it never drops, detaches or deletes a
-- partition or a row, so the upkeep never deletes history (PRD-SEC-007, PRD-MOD-011).
alter function audit.ensure_partitions() security definer;
revoke execute on function audit.ensure_partitions() from public;
grant execute on function audit.ensure_partitions() to aos_runtime;

-- Its pg-boss queue, created by migration because the runtime role creates no object (code-house-rules 3.2, 12.9).
-- Kept as every queue of 0009: pg-boss deletes no job until the retention periods of CH-9 are set, so a failed run
-- stays failed and visible (PRD-SEC-013). retryLimit 0 is only the queue's fallback: every job is sent with the job
-- kind's own retry settings, read by the worker at start (CH-10).
select pgboss.create_queue('audit.ensure-partitions', jsonb_build_object(
  'policy', 'standard',
  'retryLimit', 0,
  'deleteAfterSeconds', 0,
  'retentionSeconds', 2147483647
));
