-- The pg-boss queue of the posting consumers' deliveries (stock-ledger 10.6; access-and-approvals 9.8;
-- code-house-rules 12.9; S1-F10-T07), created by migration because the runtime role creates no object (3.2). Its
-- policy is pg-boss's `singleton`: a delivery is sent with its accounting book as the singleton key, so a second
-- delivery of the same book stays created and unfetched until the first completes or fails, and is never dropped
-- (checked with pg-boss 12.35.1 in job-queue.int.test.ts). Kept as every queue of 0009: pg-boss deletes no job until
-- the retention periods of CH-9 are set. Runs as aos_migration (code-house-rules 5.1). Compatible with the version
-- running, which sends nothing to it (code-house-rules 4.2).
select pgboss.create_queue('kernel.posting-delivery', jsonb_build_object(
  'policy', 'singleton',
  'retryLimit', 0,
  'deleteAfterSeconds', 0,
  'retentionSeconds', 2147483647
));
