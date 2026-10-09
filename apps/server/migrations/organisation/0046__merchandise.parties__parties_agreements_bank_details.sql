-- The parties part of merchandise: parties with their versions and dated roles, bank details kept encrypted, brand–
-- supplier links and agreements with a brand or a supplier (structure-and-masters 2, 5, 6.2; module-map 4.12;
-- PRD-MER-001, PRD-MER-021, PRD-ORG-016, PRD-PAY-015, PRD-ACS-008, PRD-SEC-006; POL-01, POL-02.07, POL-10.09; GC2-2,
-- GC2-6, DEC-105, DEC-123; S1-F03-T03). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).
-- Compatible with the version running: it only adds (code-house-rules 4.2). No party, term, margin or bank detail is
-- written here.
--
-- Every master is an identity row, fixed at creation and never changed or deleted, and version rows under
-- structure-and-masters 2.2 and code-house-rules 7.3, guarded by merchandise.guard_version_change (migration 0045):
-- approved versions never overlap, Scheduled ones included. A party's versions, its roles and the brand–supplier links
-- are recorded Approved, as no rule names an approval for them (2.3); a bank-detail version and an agreement version
-- wait for a different authorised person (POL-02.07; GC2-2, GC2-6, DEC-105). Another module's record (a user, an
-- attachment) is kept by its identifier with no foreign key (2.5); a brand is merchandise's own, so it is referenced.
--
-- Every table is unscoped: parties and agreements belong to the Organisation as a whole, their record types carry no
-- scope fact and the permission on the type decides (access-and-approvals 5.3); only merchandise code reads them
-- (PRD-MOD-002). Bank details are kept only encrypted, in the application, under the Organisation's key held outside
-- the database (access-and-approvals 6): no column holds them in plain.

-- A party: one legal person the Organisation deals with on the supply side, its code unique (5.1; PRD-MER-001).
create table merchandise.party (
  id uuid primary key,
  code text not null unique,
  recorded_at timestamptz not null default now(),
  constraint party_code check (code <> '')
);
create trigger refuse_row_change before update or delete on merchandise.party
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.party
  for each statement execute function kernel.refuse_change();

-- A party's versioned fields (5.1): its legal name and MSME classification, Unknown as null (2.4; POL-10.09).
create table merchandise.party_version (
  id uuid primary key,
  party_id uuid not null references merchandise.party (id),
  legal_name text not null,
  msme_classification text,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint party_version_legal_name check (legal_name <> ''),
  constraint party_version_msme check (msme_classification in ('micro', 'small', 'medium', 'not-msme')),
  constraint party_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint party_version_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint party_version_no_overlap exclude using gist (party_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index party_version_party on merchandise.party_version (party_id);
create index party_version_prepared_by on merchandise.party_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.party_version
  for each row execute function merchandise.guard_version_change();

-- A tax identity number of a party version, kept as text with its kind (5.1), frozen with the version.
create table merchandise.party_tax_identity (
  id uuid primary key,
  party_version_id uuid not null references merchandise.party_version (id),
  kind text not null,
  number text not null,
  recorded_at timestamptz not null default now(),
  constraint party_tax_identity_text check (kind <> '' and number <> ''),
  constraint party_tax_identity_once unique (party_version_id, kind, number)
);
create trigger refuse_row_change before update or delete on merchandise.party_tax_identity
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.party_tax_identity
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_version before insert on merchandise.party_tax_identity
  for each row execute function merchandise.refuse_after_version('party_version', 'party_version_id');

-- A contact of a party version, in its place in the order (5.1), frozen with the version.
create table merchandise.party_contact (
  id uuid primary key,
  party_version_id uuid not null references merchandise.party_version (id),
  position integer not null,
  contact text not null,
  recorded_at timestamptz not null default now(),
  constraint party_contact_text check (contact <> ''),
  constraint party_contact_position check (position >= 0),
  constraint party_contact_place unique (party_version_id, position)
);
create trigger refuse_row_change before update or delete on merchandise.party_contact
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.party_contact
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_version before insert on merchandise.party_contact
  for each row execute function merchandise.refuse_after_version('party_version', 'party_version_id');

-- A role of a party, each its own dated record, so each is maintained independently (5.1; PRD-MER-001): whether the
-- party holds the role while the version is in force. Its record is the party's row, which a change locks.
create table merchandise.party_role (
  id uuid primary key,
  party_id uuid not null references merchandise.party (id),
  role text not null,
  held boolean not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint party_role_role
    check (role in ('supplier', 'agent', 'ordering-party', 'invoicing-party', 'goods-mover')),
  constraint party_role_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint party_role_starts check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint party_role_no_overlap exclude using gist (party_id with =, role with =, valid_during with &&)
    where (decision = 'Approved')
);
create index party_role_party on merchandise.party_role (party_id, role);
create index party_role_prepared_by on merchandise.party_role (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.party_role
  for each row execute function merchandise.guard_version_change();

-- A party's bank details, a restricted field class (PRD-ACS-008), effective-dated: each version holds them only as
-- the application encrypted them, bound to the version (access-and-approvals 6; PRD-SEC-006). A version is in force
-- only once a different authorised person approved it (POL-02.07 for a supplier; GC2-6 for every other party).
create table merchandise.party_bank_details (
  id uuid primary key,
  party_id uuid not null references merchandise.party (id),
  sealed text not null,
  scheme text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint party_bank_details_sealed check (sealed <> '' and scheme <> ''),
  constraint party_bank_details_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint party_bank_details_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint party_bank_details_no_overlap exclude using gist (party_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index party_bank_details_party on merchandise.party_bank_details (party_id);
create index party_bank_details_prepared_by on merchandise.party_bank_details (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.party_bank_details
  for each row execute function merchandise.guard_version_change();

-- A brand–supplier link (PRD-MER-021; DEC-123): one pair, many-to-many, never exclusive; its row a change locks.
create table merchandise.brand_supplier_link (
  id uuid primary key,
  brand_id uuid not null references merchandise.brand (id),
  party_id uuid not null references merchandise.party (id),
  recorded_at timestamptz not null default now(),
  constraint brand_supplier_link_pair unique (brand_id, party_id)
);
create index brand_supplier_link_party on merchandise.brand_supplier_link (party_id);
create trigger refuse_row_change before update or delete on merchandise.brand_supplier_link
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.brand_supplier_link
  for each statement execute function kernel.refuse_change();

-- Whether the pair is linked while the version is in force (PRD-MER-021).
create table merchandise.brand_supplier_link_version (
  id uuid primary key,
  link_id uuid not null references merchandise.brand_supplier_link (id),
  linked boolean not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint brand_supplier_link_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint brand_supplier_link_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint brand_supplier_link_version_no_overlap exclude using gist (link_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index brand_supplier_link_version_link on merchandise.brand_supplier_link_version (link_id);
create index brand_supplier_link_version_prepared_by on merchandise.brand_supplier_link_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.brand_supplier_link_version
  for each row execute function merchandise.guard_version_change();

-- An agreement with a brand or a supplier, its code unique (5.2; PRD-ORG-016), its counterparty fixed. A brand or a
-- supplier has one agreement, revised by its versions, so Read the terms in force finds one (5.5). **Design choice.**
create table merchandise.agreement (
  id uuid primary key,
  code text not null unique,
  brand_id uuid unique references merchandise.brand (id),
  party_id uuid unique references merchandise.party (id),
  recorded_at timestamptz not null default now(),
  constraint agreement_code check (code <> ''),
  constraint agreement_one_counterparty check ((brand_id is null) <> (party_id is null))
);
create trigger refuse_row_change before update or delete on merchandise.agreement
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.agreement
  for each statement execute function kernel.refuse_change();

-- An agreement version (5.2): its terms, each a value or Unknown, none defaulted (POL-01.11), under the versioned
-- shape `terms_format` names (code-house-rules 3.3); margins apart, a restricted field class (PRD-ACS-008); and the
-- signed agreement's attachments in files-imports (S1-F06-T05), named by identifier (2.5).
create table merchandise.agreement_version (
  id uuid primary key,
  agreement_id uuid not null references merchandise.agreement (id),
  terms jsonb not null,
  terms_format text not null,
  margins text,
  signed_agreement_attachment_ids uuid[] not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint agreement_version_terms check (pg_catalog.jsonb_typeof(terms) = 'object'),
  constraint agreement_version_terms_format check (terms_format = 'agreement-terms/1'),
  constraint agreement_version_margins check (margins <> ''),
  constraint agreement_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint agreement_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint agreement_version_no_overlap exclude using gist (agreement_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index agreement_version_agreement on merchandise.agreement_version (agreement_id);
create index agreement_version_prepared_by on merchandise.agreement_version (prepared_by_user_id);
create trigger guard_version_change before update on merchandise.agreement_version
  for each row execute function merchandise.guard_version_change();

-- Runtime grants (code-house-rules 5.2). An identity row is append-only and locked: a change locks it at step 1, so two
-- changes to one master never pass each other (8.2), hence UPDATE on its identifier only (7.1). A version row takes the
-- changes its guard allows. The rows frozen with a version are append-only.
grant select, insert on merchandise.party to aos_runtime;
grant update (id) on merchandise.party to aos_runtime;
grant select, insert, update on merchandise.party_version to aos_runtime;
grant select, insert on merchandise.party_tax_identity to aos_runtime;
grant select, insert on merchandise.party_contact to aos_runtime;
grant select, insert, update on merchandise.party_role to aos_runtime;
grant select, insert, update on merchandise.party_bank_details to aos_runtime;
grant select, insert on merchandise.brand_supplier_link to aos_runtime;
grant update (id) on merchandise.brand_supplier_link to aos_runtime;
grant select, insert, update on merchandise.brand_supplier_link_version to aos_runtime;
grant select, insert on merchandise.agreement to aos_runtime;
grant update (id) on merchandise.agreement to aos_runtime;
grant select, insert, update on merchandise.agreement_version to aos_runtime;
