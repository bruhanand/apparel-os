-- The access record of a test sign-in (access-and-approvals 3.4; numbering-and-audit 5.2; deployment.md section 3;
-- POL-02.17, PRD-ACS-017, PRD-SEC-007; DEC-121; S1-F01-T28). A test sign-in signs a listed SYNTHETIC person in without
-- the password or the authenticator code, on `local` and `dev` only; each one is recorded as its own kind, so the
-- sign-in history never shows it as an ordinary sign-in. Additive: the code running before this migration never
-- writes the new kind, so it stays compatible with the version running (code-house-rules 4.2).
-- Runs as aos_migration, which owns the table (code-house-rules 5.1). On the partitioned table the constraint
-- reaches every partition.

alter table audit.access_record drop constraint access_record_kind_check;
alter table audit.access_record add constraint access_record_kind_check check (kind in (
  'sign-in', 'sign-out', 'session-locked', 'session-ended', 'session-revoked',
  'second-factor-enrolled', 'second-factor-reset', 'password-changed', 'password-reset', 'operator-recovery',
  'device-registered', 'device-revoked', 'permission-changed', 'sensitive-access', 'demo-sign-in'));
