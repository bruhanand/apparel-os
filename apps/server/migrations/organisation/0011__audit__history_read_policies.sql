-- The read policies of the audit and access records (numbering-and-audit 4.5, 5; code-house-rules 6.2, 6.3;
-- access-and-approvals 9.11; RR-242; S1-F01-T11). Until now the tables carried only the insert policy of 6.3, so the
-- runtime role read no row. Runs as aos_migration (code-house-rules 5.1).
--
-- An audit record is the history of one record. It is read only by a reader who holds view on `audit.audit_record`
-- and whose grants on the audited record's own type, `<record_module>.<record_type>` in the permission registry,
-- cover the row's facts: so history never reaches past the records the reader's grants cover (access-and-approvals
-- 9.11, "the audit records of the record types above"). Row-level security is the backstop; the read itself is
-- authorised through one assignment (access-and-approvals 7.2; PRD-ACS-004).
--
-- An access record is read under the type its kind belongs to: sensitive access and device events are types apart,
-- which the first two roles do not hold (9.11); every other kind is `audit.access_record`. Its facts are those of the
-- place where it happened; a sign-in carries none, so only all-members scope reads it, the Organisation-wide view of
-- 9.11.
create policy read_in_scope on audit.audit_record for select to aos_runtime
  using (
    access.row_visible('audit.audit_record', null, null, null, null, null, null)
    and access.row_visible(record_module || '.' || record_type, site_id, store_id, business_unit_id, legal_entity_id,
      brand_id, null));

create policy read_in_scope on audit.access_record for select to aos_runtime
  using (
    access.row_visible(
      case kind
        when 'sensitive-access' then 'audit.sensitive_access_record'
        when 'device-registered' then 'audit.device_access_record'
        when 'device-revoked' then 'audit.device_access_record'
        else 'audit.access_record'
      end,
      site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));
