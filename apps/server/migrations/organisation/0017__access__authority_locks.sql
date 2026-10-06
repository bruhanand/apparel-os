-- The authority rows of step 0 (code-house-rules 7.1, 8.2 "Authority first"; access-and-approvals 7.1 step 4;
-- stock-ledger 10.3; RR-325). A command locks the user or service identity it relies on in shared mode, and a command
-- that disables or ends one locks it exclusively, at step 0. A row lock needs the UPDATE privilege on a column of the
-- row, so the runtime role gets UPDATE on the identifier column only: the rows stay append-only, the refuse_change
-- triggers still refuse every UPDATE, and taking a row lock fires no trigger (code-house-rules 7.1). Runs as
-- aos_migration, which owns both tables (code-house-rules 5.1).

grant update (id) on access.app_user to aos_runtime;
grant update (id) on access.service_identity to aos_runtime;
