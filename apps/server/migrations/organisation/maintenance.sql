-- Restricted maintenance the runner runs as the migration role after the set's files, on every run, in its own
-- transaction (code-house-rules 4.3). Everything here is safe to run any number of times.

-- The audit partitions of the coming months (numbering-and-audit 4.4; DEC-112, CH-5).
select audit.ensure_partitions();
