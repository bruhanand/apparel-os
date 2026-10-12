-- The access record of a device's retirement (offline-counter 3.5; numbering-and-audit 5.1; PRD-ACS-013, PRD-SEC-007;
-- S1-F12-T02): a device taken out of use, not lost, is recorded beside its registration, enrolment and revocation, as
-- a device event, read under `audit.device_access_record` like them. Additive: the code running before this migration
-- never writes the new kind, so it stays compatible with the version running (code-house-rules 4.2). Runs as
-- aos_migration, which owns the table (code-house-rules 5.1). On the partitioned table the constraint and the policy
-- reach every partition.

alter table audit.access_record drop constraint access_record_kind_check;
alter table audit.access_record add constraint access_record_kind_check check (kind in (
  'sign-in', 'sign-out', 'session-locked', 'session-ended', 'session-revoked',
  'second-factor-enrolled', 'second-factor-reset', 'password-changed', 'password-reset', 'operator-recovery',
  'device-registered', 'device-enrolled', 'device-revoked', 'device-ended', 'permission-changed', 'sensitive-access',
  'demo-sign-in'));

alter policy read_in_scope on audit.access_record
  using (
    access.row_visible(
      case kind
        when 'sensitive-access' then 'audit.sensitive_access_record'
        when 'device-registered' then 'audit.device_access_record'
        when 'device-enrolled' then 'audit.device_access_record'
        when 'device-revoked' then 'audit.device_access_record'
        when 'device-ended' then 'audit.device_access_record'
        else 'audit.access_record'
      end,
      site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));
