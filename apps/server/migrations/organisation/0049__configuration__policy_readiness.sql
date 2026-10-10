-- The policy gate of configuration: the status of each policy, the validation of its real values, the capability
-- controls and the activity grants (module-map 4.4; domain-model 3.6, DM-6; access-and-approvals 7.1 step 2;
-- code-house-rules 7.1, 12.14; PRD "Required policy configuration", PRD-SEC-017, PRD-LIF-001; DEC-092, DEC-105,
-- DEC-116; S1-F04-T01). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible
-- with the version running: it only adds (code-house-rules 4.2).
--
-- No row is written here: every policy is Open until a Signed record exists, every capability is off until a change
-- switches it on, no value is validated and no activity is granted (AGENTS.md "Never invent a value"). Every table is
-- append-only: a status is the latest record, never an edit (PRD-MOD-011). Another module's record (a user, an
-- attachment) is kept by its identifier with no foreign key.
--
-- Every table is unscoped. The policy status, the validations and the capabilities belong to the Organisation as a
-- whole: their record types carry no scope fact and the permission on the type decides (access-and-approvals 5.3).
-- The activity grants name a Site or business unit, but the gate reads them for every request of every actor, as
-- Authorise reads its own tables, so no actor's scope may hide one (code-house-rules 6.3); only configuration code
-- reads them (PRD-MOD-002).

-- A policy recorded as Signed: its "Signed by, date" line of kdps-policies.md, complete, with the signed evidence
-- attached through files-imports (DEC-092). The latest record of a policy is its signature. A synthetic record is for
-- tests and demos on a synthetic Organisation, outside kdps-test and production (code-house-rules 12.14).
create table configuration.policy_signature (
  id uuid primary key,
  policy_number smallint not null,
  signatory text not null,
  signed_on date not null,
  origin text not null,
  evidence_attachment_ids uuid[] not null,
  recorded_by_user_id uuid not null,
  role_assignment_id uuid not null,
  recorded_at timestamptz not null,
  constraint policy_signature_policy check (policy_number between 1 and 19),
  constraint policy_signature_signatory check (signatory <> ''),
  constraint policy_signature_origin check (origin in ('kdps', 'synthetic')),
  constraint policy_signature_evidence check (pg_catalog.cardinality(evidence_attachment_ids) >= 1)
);
create index policy_signature_policy on configuration.policy_signature (policy_number, id);
create trigger refuse_row_change before update or delete on configuration.policy_signature
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on configuration.policy_signature
  for each statement execute function kernel.refuse_change();

-- A policy's real values recorded as validated, with the evidence, by a person holding the validate permission who
-- did not enter them (DM-6; DEC-105, DEC-116). `validated_values` names each configured value it covers, as
-- `<check>:<key>`, sorted: once the values configured differ, it no longer covers them and a new one is needed.
create table configuration.policy_validation (
  id uuid primary key,
  policy_number smallint not null,
  origin text not null,
  validated_values text[] not null,
  evidence_attachment_ids uuid[] not null,
  validated_by_user_id uuid not null,
  role_assignment_id uuid not null,
  validated_at timestamptz not null,
  constraint policy_validation_policy check (policy_number between 1 and 19),
  constraint policy_validation_origin check (origin in ('kdps', 'synthetic')),
  constraint policy_validation_evidence check (pg_catalog.cardinality(evidence_attachment_ids) >= 1)
);
create index policy_validation_policy on configuration.policy_validation (policy_number, id);
create trigger refuse_row_change before update or delete on configuration.policy_validation
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on configuration.policy_validation
  for each statement execute function kernel.refuse_change();

-- A capability switched on or off for the Organisation (PRD-SEC-017). With no row a capability is off; the latest row
-- of a capability is its state. Switching one on never bypasses a missing policy or an invariant.
create table configuration.capability_change (
  id uuid primary key,
  capability text not null,
  switched_on boolean not null,
  changed_by_user_id uuid not null,
  role_assignment_id uuid not null,
  changed_at timestamptz not null,
  constraint capability_change_capability check (capability <> '')
);
create index capability_change_capability on configuration.capability_change (capability, id);
create trigger refuse_row_change before update or delete on configuration.capability_change
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on configuration.capability_change
  for each statement execute function kernel.refuse_change();

-- An activity granted to, or withdrawn from, a Site or a business unit at its Site (PRD-LIF-001; module-map 4.4,
-- 4.16). Only site-lifecycle writes it, from S1-F04-T02; it is created here empty. The latest row of an activity at a
-- place is its state; a business unit's row names its Site too. Every grant names the approval decision it was written
-- in, kept in access by its identifier (module-map 4.4 "As built").
create table configuration.activity_grant (
  id uuid primary key,
  activity text not null,
  site_id uuid not null,
  business_unit_id uuid,
  granted boolean not null,
  readiness_record_id uuid not null,
  approval_decision_id uuid not null,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null,
  constraint activity_grant_activity check (activity in ('receiving', 'movement', 'selling'))
);
create index activity_grant_place on configuration.activity_grant (activity, site_id, business_unit_id, id);
create trigger refuse_row_change before update or delete on configuration.activity_grant
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on configuration.activity_grant
  for each statement execute function kernel.refuse_change();

-- Runtime grants (code-house-rules 5.2): append-only rows, so insert and select only (7.1).
grant select, insert on configuration.policy_signature to aos_runtime;
grant select, insert on configuration.policy_validation to aos_runtime;
grant select, insert on configuration.capability_change to aos_runtime;
grant select, insert on configuration.activity_grant to aos_runtime;
