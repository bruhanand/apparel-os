-- The Organisation's own grouping kinds, and classification kinds and values of Sites and Stores, as records like the
-- other masters (structure-and-masters 3.1, 3.6, 6.1; PRD-ORG-007, PRD-ORG-008; RR-440, product owner 9 Oct 2026;
-- S1-F02-T04). Each is an identity row and versions under structure-and-masters 2.2 and code-house-rules 7.3,
-- changed through flow A by a different authorised person (2.3; GC2-2, DEC-105). No kind or value is written here: the
-- Organisation defines them (RR-440; KDPS Owner question 63). Compatible with the version running: a grouping's kind
-- stays the text it is, now the code of a grouping kind (code-house-rules 4.2).
--
-- Every table is unscoped, as the other organisation tables are (structure-and-masters 6.1): these records belong to
-- the Organisation as a whole, and their record types carry no scope fact.

-- A grouping kind, such as a region or a cluster, as the Organisation defines it (3.6; PRD-ORG-007). Its code is
-- unique in the Organisation and names it on a grouping.
create table organisation.grouping_kind (
  id uuid primary key,
  code text not null unique,
  recorded_at timestamptz not null default now(),
  constraint grouping_kind_code check (code <> '')
);
create trigger refuse_row_change before update or delete on organisation.grouping_kind
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.grouping_kind
  for each statement execute function kernel.refuse_change();

-- A grouping kind's name, effective-dated (2.2).
create table organisation.grouping_kind_version (
  id uuid primary key,
  grouping_kind_id uuid not null references organisation.grouping_kind (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint grouping_kind_version_name check (name <> ''),
  constraint grouping_kind_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint grouping_kind_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint grouping_kind_version_no_overlap exclude using gist (grouping_kind_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index grouping_kind_version_grouping_kind on organisation.grouping_kind_version (grouping_kind_id);
create index grouping_kind_version_prepared_by on organisation.grouping_kind_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.grouping_kind_version
  for each row execute function organisation.guard_version_change();

-- The groupings made before grouping kinds were records (migration 0028, region or cluster) keep their kind: each kind
-- they name becomes a grouping kind with that code and no version, so nothing is approved here that no person
-- approved; the Organisation names it through flow A when it wants it named (structure-and-masters 3.6). A fresh
-- Organisation has no grouping, so none is written. The identifier is a UUIDv7 of the migration's time (2.1).
insert into organisation.grouping_kind (id, code)
select pg_catalog.encode(
         pg_catalog.set_bit(
           pg_catalog.set_bit(
             pg_catalog.overlay(
               pg_catalog.uuid_send(pg_catalog.gen_random_uuid()),
               pg_catalog.substr(
                 pg_catalog.int8send(
                   pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) * 1000)::bigint),
                 3),
               1, 6),
             52, 1),
           53, 1),
         'hex')::uuid,
       kind
from (select distinct kind from organisation.grouping) as earlier;

-- A grouping's kind is one of the Organisation's grouping kinds, by its code, which is never changed or reused (2.1).
alter table organisation.grouping drop constraint grouping_kind;
alter table organisation.grouping
  add constraint grouping_kind_recorded foreign key (kind) references organisation.grouping_kind (code);

-- A classification kind: what it classifies, Sites or Stores, fixed at creation (3.1; PRD-ORG-008). The pair
-- (id, applies_to) is unique so a value and a Site's or Store's classification can name it with what it classifies.
create table organisation.classification_kind (
  id uuid primary key,
  code text not null unique,
  applies_to text not null,
  recorded_at timestamptz not null default now(),
  constraint classification_kind_code check (code <> ''),
  constraint classification_kind_applies_to check (applies_to in ('site', 'store')),
  constraint classification_kind_classifies unique (id, applies_to)
);
create trigger refuse_row_change before update or delete on organisation.classification_kind
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.classification_kind
  for each statement execute function kernel.refuse_change();

-- A classification kind's name, effective-dated (2.2).
create table organisation.classification_kind_version (
  id uuid primary key,
  classification_kind_id uuid not null references organisation.classification_kind (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint classification_kind_version_name check (name <> ''),
  constraint classification_kind_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint classification_kind_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint classification_kind_version_no_overlap
    exclude using gist (classification_kind_id with =, valid_during with &&) where (decision = 'Approved')
);
create index classification_kind_version_kind on organisation.classification_kind_version (classification_kind_id);
create index classification_kind_version_prepared_by on organisation.classification_kind_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.classification_kind_version
  for each row execute function organisation.guard_version_change();

-- A value of a classification kind, fixed to it, its code unique in its kind (2.1, 3.1). It keeps what its kind
-- classifies, held to the kind's by the foreign key, so a Site names only a Site kind's values. The triple
-- (id, kind, applies_to) is unique so a Site's or Store's classification can name the value with its kind.
create table organisation.classification_value (
  id uuid primary key,
  classification_kind_id uuid not null,
  applies_to text not null,
  code text not null,
  recorded_at timestamptz not null default now(),
  constraint classification_value_code check (code <> ''),
  constraint classification_value_code_in_kind unique (classification_kind_id, code),
  constraint classification_value_classifies unique (id, classification_kind_id, applies_to),
  constraint classification_value_kind foreign key (classification_kind_id, applies_to)
    references organisation.classification_kind (id, applies_to)
);
create trigger refuse_row_change before update or delete on organisation.classification_value
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.classification_value
  for each statement execute function kernel.refuse_change();

-- A classification value's name, effective-dated (2.2).
create table organisation.classification_value_version (
  id uuid primary key,
  classification_value_id uuid not null references organisation.classification_value (id),
  name text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint classification_value_version_name check (name <> ''),
  constraint classification_value_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint classification_value_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint classification_value_version_no_overlap
    exclude using gist (classification_value_id with =, valid_during with &&) where (decision = 'Approved')
);
create index classification_value_version_value on organisation.classification_value_version (classification_value_id);
create index classification_value_version_prepared_by
  on organisation.classification_value_version (prepared_by_user_id);
create trigger guard_version_change before update on organisation.classification_value_version
  for each row execute function organisation.guard_version_change();

-- A classification a Site version carries, frozen with it, as its aliases are (3.1, 6.1): a value of a kind that
-- classifies Sites, held by the foreign key on (value, its kind, 'site'). A version holds at most one value of each
-- kind, as it holds one value of a field (product owner, 9 Oct 2026).
create table organisation.site_classification (
  id uuid primary key,
  site_version_id uuid not null references organisation.site_version (id),
  classification_value_id uuid not null,
  classification_kind_id uuid not null,
  applies_to text not null,
  recorded_at timestamptz not null default now(),
  constraint site_classification_site check (applies_to = 'site'),
  constraint site_classification_one_per_kind unique (site_version_id, classification_kind_id),
  constraint site_classification_value foreign key (classification_value_id, classification_kind_id, applies_to)
    references organisation.classification_value (id, classification_kind_id, applies_to)
);
create index site_classification_value on organisation.site_classification (classification_value_id);
create trigger refuse_row_change before update or delete on organisation.site_classification
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.site_classification
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_decision before insert on organisation.site_classification
  for each row execute function organisation.refuse_after_decision('site_version', 'site_version_id');

-- A classification a Store version carries, frozen with it: a value of a kind that classifies Stores, at most one of
-- each kind.
create table organisation.store_classification (
  id uuid primary key,
  store_version_id uuid not null references organisation.store_version (id),
  classification_value_id uuid not null,
  classification_kind_id uuid not null,
  applies_to text not null,
  recorded_at timestamptz not null default now(),
  constraint store_classification_store check (applies_to = 'store'),
  constraint store_classification_one_per_kind unique (store_version_id, classification_kind_id),
  constraint store_classification_value foreign key (classification_value_id, classification_kind_id, applies_to)
    references organisation.classification_value (id, classification_kind_id, applies_to)
);
create index store_classification_value on organisation.store_classification (classification_value_id);
create trigger refuse_row_change before update or delete on organisation.store_classification
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on organisation.store_classification
  for each statement execute function kernel.refuse_change();
create trigger refuse_after_decision before insert on organisation.store_classification
  for each row execute function organisation.refuse_after_decision('store_version', 'store_version_id');

-- Runtime grants (code-house-rules 5.2), as for the other masters (migration 0028).
grant select, insert on organisation.grouping_kind to aos_runtime;
grant update (id) on organisation.grouping_kind to aos_runtime;
grant select, insert, update on organisation.grouping_kind_version to aos_runtime;
grant select, insert on organisation.classification_kind to aos_runtime;
grant update (id) on organisation.classification_kind to aos_runtime;
grant select, insert, update on organisation.classification_kind_version to aos_runtime;
grant select, insert on organisation.classification_value to aos_runtime;
grant update (id) on organisation.classification_value to aos_runtime;
grant select, insert, update on organisation.classification_value_version to aos_runtime;
grant select, insert on organisation.site_classification to aos_runtime;
grant select, insert on organisation.store_classification to aos_runtime;
