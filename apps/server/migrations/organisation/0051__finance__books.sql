-- The books part of finance, its first records: each book's cost setting and voucher-model setting, the chart of
-- accounts, and the CA's approval evidence that lets a version of either take effect (books-and-posting 2.2, 2.3, 3.1,
-- 6.3, 13.1; module-map 4.14; PRD-LED-001, PRD-LED-014, PRD-LED-015; POL-09.01; DEC-004, DEC-031, DEC-105, DEC-112,
-- DEC-116; S1-F09-T01). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1). Compatible
-- with the version running: it only adds (code-house-rules 4.2). No formula, pool mode, voucher model or account is
-- written here: they are KDPS's, Accounts' and the CA's (V-08, V-09, V-10, V-46; SL-1).
--
-- Every master or setting is an identity row, fixed at creation and never changed or deleted, and version rows under
-- structure-and-masters 2.2 and code-house-rules 7.3, frozen when prepared: approved versions never overlap,
-- Scheduled ones included, and a version waits for a different authorised Accounts user, with the CA's evidence
-- (6.3). A book is organisation's record, kept by its identifier with no foreign key (13; structure-and-masters 2.5).
--
-- Every table is unscoped for now: the record types carry no scope fact and the permission on the type decides
-- (access-and-approvals 5.3); only finance code reads them (PRD-MOD-002). The journal lines that carry the book's
-- legal entity and the line's place and brand as scope facts come with posting (books-and-posting 12; S1-F09-T02).

create schema finance;
grant usage on schema finance to aos_runtime;

-- The guard of an effective-dated version row (code-house-rules 7.3), as merchandise's: a version Awaiting approval
-- changes only by its decision being recorded, once, taking an end where an approved version starts after it; an
-- Approved version only by moving the end of valid_during earlier, never to or before its start; a Rejected one never.
create function finance.guard_version_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
declare
  old_rest jsonb := pg_catalog.to_jsonb(old) - 'valid_during' - 'decision';
  new_rest jsonb := pg_catalog.to_jsonb(new) - 'valid_during' - 'decision';
begin
  if old.decision = 'Awaiting approval' and new.decision in ('Approved', 'Rejected') and new_rest = old_rest
     and pg_catalog.lower(new.valid_during) is not distinct from pg_catalog.lower(old.valid_during)
     and (new.valid_during = old.valid_during
          or (new.decision = 'Approved' and pg_catalog.upper_inf(old.valid_during)
              and pg_catalog.upper(new.valid_during) > pg_catalog.lower(new.valid_during))) then
    return new;
  end if;
  if old.decision = 'Approved' and new.decision = 'Approved' and new_rest = old_rest
     and pg_catalog.lower(new.valid_during) is not distinct from pg_catalog.lower(old.valid_during)
     and (new.valid_during = old.valid_during
          or (pg_catalog.upper(new.valid_during) > pg_catalog.lower(new.valid_during)
              and (pg_catalog.upper_inf(old.valid_during)
                   or pg_catalog.upper(new.valid_during) < pg_catalog.upper(old.valid_during)))) then
    return new;
  end if;
  raise exception 'a version of %.% changes only as code-house-rules 7.3 allows', tg_table_schema, tg_table_name
    using errcode = 'AO003';
end;
$$;
revoke execute on function finance.guard_version_change() from public;

-- A book setting (2.2, 2.3): one cost setting and one voucher-model setting per book, each revised by its versions.
-- Its row a change locks. The kind is fixed at creation.
create table finance.book_setting (
  id uuid primary key,
  book_id uuid not null,
  kind text not null,
  recorded_at timestamptz not null default now(),
  constraint book_setting_kind check (kind in ('cost', 'voucher-model')),
  constraint book_setting_once unique (book_id, kind),
  -- The target of the version's copy of the kind.
  constraint book_setting_of_kind unique (id, kind)
);
create trigger refuse_row_change before update or delete on finance.book_setting
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.book_setting
  for each statement execute function kernel.refuse_change();

-- A book setting's version: the cost formula and pool mode (PRD-LED-014, PRD-LED-015, DEC-004, DEC-031), or the
-- voucher model (MM-12, DEC-105), none defaulted, with where the value came from (code-house-rules 12.14). The kind
-- is copied from the setting, held by the composite foreign key, so the check below sees which fields it holds.
create table finance.book_setting_version (
  id uuid primary key,
  book_setting_id uuid not null,
  kind text not null,
  formula text,
  pool_mode text,
  voucher_model text,
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint book_setting_version_of_setting foreign key (book_setting_id, kind)
    references finance.book_setting (id, kind),
  constraint book_setting_version_fields check (
    (kind = 'cost' and formula in ('moving-average', 'fifo') and pool_mode in ('book', 'site')
       and voucher_model is null)
    or (kind = 'voucher-model' and voucher_model in ('with-items', 'without-items') and formula is null
       and pool_mode is null)),
  constraint book_setting_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint book_setting_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint book_setting_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint book_setting_version_no_overlap exclude using gist (book_setting_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index book_setting_version_setting on finance.book_setting_version (book_setting_id, kind);
create index book_setting_version_prepared_by on finance.book_setting_version (prepared_by_user_id);
create trigger guard_version_change before update on finance.book_setting_version
  for each row execute function finance.guard_version_change();

-- An account of a book's chart (3.1; PRD-LED-001): its code unique in the book and its nature fixed at creation.
-- Retired, never deleted.
create table finance.account (
  id uuid primary key,
  book_id uuid not null,
  code text not null,
  nature text not null,
  recorded_at timestamptz not null default now(),
  constraint account_code check (code <> ''),
  constraint account_nature check (nature in ('asset', 'liability', 'equity', 'income', 'expense')),
  constraint account_code_in_book unique (book_id, code)
);
create trigger refuse_row_change before update or delete on finance.account
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.account
  for each statement execute function kernel.refuse_change();

-- An account's version: its name, and whether it is retired from the version's start; a retired account takes no new
-- line (3.1; structure-and-masters 2.5).
create table finance.account_version (
  id uuid primary key,
  account_id uuid not null references finance.account (id),
  name text not null,
  retired boolean not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint account_version_name check (name <> ''),
  constraint account_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint account_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint account_version_no_overlap exclude using gist (account_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index account_version_account on finance.account_version (account_id);
create index account_version_prepared_by on finance.account_version (prepared_by_user_id);
create trigger guard_version_change before update on finance.account_version
  for each row execute function finance.guard_version_change();

-- One piece of the CA's approval evidence (6.3; POL-09.01; DEC-112, GC4-2): a stored file of files-imports, attached
-- to each version it covers (S1-F06-T05), or a reference naming what it is, who gave it, its date and where it is
-- kept. Recorded by an authorised Accounts user; never changed.
create table finance.ca_approval_evidence (
  id uuid primary key,
  kind text not null,
  stored_file_id uuid,
  file_receipt_id uuid,
  reference_what text,
  reference_given_by text,
  reference_given_on date,
  reference_kept_at text,
  recorded_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint ca_approval_evidence_kind check (
    (kind = 'file' and stored_file_id is not null and file_receipt_id is not null and reference_what is null
       and reference_given_by is null and reference_given_on is null and reference_kept_at is null)
    or (kind = 'reference' and stored_file_id is null and file_receipt_id is null
       and reference_what <> '' and reference_given_by <> '' and reference_given_on is not null
       and reference_kept_at <> ''))
);
create index ca_approval_evidence_recorded_by on finance.ca_approval_evidence (recorded_by_user_id);
create trigger refuse_row_change before update or delete on finance.ca_approval_evidence
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.ca_approval_evidence
  for each statement execute function kernel.refuse_change();

-- A version the evidence names (6.3: "one piece of evidence may cover a named set of versions if it says which"): an
-- account version or a book-setting version, each named once by a piece, with the file's attachment to that version.
create table finance.ca_approval_evidence_cover (
  id uuid primary key,
  ca_approval_evidence_id uuid not null references finance.ca_approval_evidence (id),
  account_version_id uuid references finance.account_version (id),
  book_setting_version_id uuid references finance.book_setting_version (id),
  attachment_id uuid,
  recorded_at timestamptz not null default now(),
  constraint ca_approval_evidence_cover_one check ((account_version_id is null) <> (book_setting_version_id is null)),
  constraint ca_approval_evidence_cover_account unique (ca_approval_evidence_id, account_version_id),
  constraint ca_approval_evidence_cover_setting unique (ca_approval_evidence_id, book_setting_version_id)
);
create index ca_approval_evidence_cover_evidence on finance.ca_approval_evidence_cover (ca_approval_evidence_id);
create index ca_approval_evidence_cover_account_version on finance.ca_approval_evidence_cover (account_version_id);
create index ca_approval_evidence_cover_setting_version
  on finance.ca_approval_evidence_cover (book_setting_version_id);
create trigger refuse_row_change before update or delete on finance.ca_approval_evidence_cover
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.ca_approval_evidence_cover
  for each statement execute function kernel.refuse_change();

-- Runtime grants (code-house-rules 5.2). An identity row is append-only and locked: a change locks it at step 1, so two
-- changes to one record never pass each other (8.2), hence UPDATE on its identifier only (7.1). A version row takes the
-- changes its guard allows. The evidence rows are append-only.
grant select, insert on finance.book_setting to aos_runtime;
grant update (id) on finance.book_setting to aos_runtime;
grant select, insert, update on finance.book_setting_version to aos_runtime;
grant select, insert on finance.account to aos_runtime;
grant update (id) on finance.account to aos_runtime;
grant select, insert, update on finance.account_version to aos_runtime;
grant select, insert on finance.ca_approval_evidence to aos_runtime;
grant select, insert on finance.ca_approval_evidence_cover to aos_runtime;
