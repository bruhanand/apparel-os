-- The pg-boss queues of stage 1, created by migration because the runtime role creates no object
-- (code-house-rules 3.2, 12.9). Each queue's rows live in pg-boss's shared job table; none is partitioned.
-- Runs as aos_migration (code-house-rules 5.1).
--
-- What every queue keeps (code-house-rules 12.9, CH-9): until the retention periods of CH-9 are set, pg-boss deletes
-- no job. deleteAfterSeconds 0 is pg-boss's "never" for a completed, cancelled or failed job, so a failed job is
-- never removed before an operator has dealt with it; retentionSeconds, how long a job may wait in created or retry
-- before pg-boss deletes it, has no "never" in pg-boss, so it is the largest value its integer column holds
-- (about 68 years). retryLimit 0 here is only the queue's fallback: every job is sent with its own job kind's retry
-- settings, read by the worker at start (CH-10), and a job sent without them is never retried.
--
-- kernel.outbox-delivery: one job per event and consumer, made by the outbox processor (code-house-rules 12.8).
-- The audit queues: the sealing job, the seal check and the partition coverage check (numbering-and-audit 4.4;
-- RR-241), each sent by the worker for each Organisation at the interval of its worker setting.
select pgboss.create_queue(name, jsonb_build_object(
  'policy', 'standard',
  'retryLimit', 0,
  'deleteAfterSeconds', 0,
  'retentionSeconds', 2147483647
))
from (values
  ('kernel.outbox-delivery'),
  ('audit.seal-closed-block'),
  ('audit.check-seals'),
  ('audit.check-partition-coverage')
) as queue (name);
