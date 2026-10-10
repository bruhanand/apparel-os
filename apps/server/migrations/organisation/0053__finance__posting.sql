-- The posting half of finance · books: financial periods (all Open here), posting maps with their versions and lines,
-- the CA's approval evidence for a map version, journals, their lines and the posting-source rows that say where each
-- line came from (books-and-posting 4.1, 4.5, 5, 6, 8, 9, 12, 13.1; module-map 4.14; PRD-LED-001, PRD-LED-003,
-- PRD-LED-004, PRD-MOD-011, PRD-MOD-013, PRD-SEC-005; POL-09.01, POL-09.11, POL-09.12, POL-09.13; DEC-087, DEC-105,
-- DEC-112, DEC-116; S1-F09-T02). Runs as aos_migration, which owns everything it creates (code-house-rules 5.1).
-- Compatible with the version running: it only adds, and widens one check of 0051 (code-house-rules 4.2). No period,
-- financial year, account, map or number format is written here: they are Accounts' and the CA's (GC4-1, GC5-1, V-10).
-- Lock and reopening (period_event, period_reopening and their kin) come with S1-F09-T03.

-- A financial period of a book (4.1): its code unique in the book, a date range inside the one financial year it
-- names, never overlapping another period of the book and leaving no gap after the book's first period. The financial
-- year's dates are OPEN (GC5-1), so the period names its year by the label its journal series is kept under
-- (numbering-and-audit 3.3); the label is Accounts'. **Design choice** (books-and-posting 4.1 "As built"). The row holds
-- only identity and dates; its state is a projection (Open until S1-F09-T03 adds its events). A posting holds it in
-- shared mode at lock step 7 (4.5), so the runtime role holds UPDATE (id) for the row lock.
create table finance.financial_period (
  id uuid primary key,
  book_id uuid not null,
  code text not null,
  financial_year text not null,
  dates daterange not null,
  defined_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint financial_period_code check (code <> ''),
  constraint financial_period_year check (financial_year <> ''),
  constraint financial_period_dates
    check (not pg_catalog.lower_inf(dates) and not pg_catalog.upper_inf(dates) and not pg_catalog.isempty(dates)),
  constraint financial_period_code_in_book unique (book_id, code),
  constraint financial_period_no_overlap exclude using gist (book_id with =, dates with &&)
);
create index financial_period_defined_by on finance.financial_period (defined_by_user_id);
create trigger refuse_row_change before update or delete on finance.financial_period
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.financial_period
  for each statement execute function kernel.refuse_change();

-- No gap after the book's first period (4.1): a new period of a book that has periods meets one of them end to start.
-- One that overlaps another is left to the exclusion constraint, which names the overlap.
create function finance.check_period_gap() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if exists (select 1 from finance.financial_period p where p.book_id = new.book_id and p.id <> new.id)
     and not exists (select 1 from finance.financial_period p
                     where p.book_id = new.book_id and p.id <> new.id and p.dates && new.dates)
     and not exists (select 1 from finance.financial_period p
                     where p.book_id = new.book_id and p.id <> new.id and p.dates operator(pg_catalog.-|-) new.dates) then
    raise exception 'a period of a book leaves no gap after its first period (books-and-posting 4.1)'
      using errcode = 'AO010';
  end if;
  return new;
end;
$$;
revoke execute on function finance.check_period_gap() from public;
create trigger check_period_gap before insert on finance.financial_period
  for each row execute function finance.check_period_gap();

-- A posting map (6.1): one per book and posting event kind, revised by its versions. Its row a change locks.
create table finance.posting_map (
  id uuid primary key,
  book_id uuid not null,
  event_kind text not null,
  recorded_at timestamptz not null default now(),
  constraint posting_map_event_kind check (event_kind ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  constraint posting_map_once unique (book_id, event_kind)
);
create trigger refuse_row_change before update or delete on finance.posting_map
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.posting_map
  for each statement execute function kernel.refuse_change();

-- A posting map's version (6.1 to 6.3; PRD-MOD-010, POL-09.12): frozen when prepared, in force only when approved
-- with the CA's evidence, approved versions never overlapping, none starting on a past date (the command checks it),
-- with where its accounts and lines came from (code-house-rules 12.14).
create table finance.posting_map_version (
  id uuid primary key,
  posting_map_id uuid not null references finance.posting_map (id),
  origin text not null,
  valid_during daterange not null,
  decision text not null,
  prepared_by_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint posting_map_version_origin check (origin in ('kdps', 'test-setup', 'synthetic')),
  constraint posting_map_version_decision check (decision in ('Awaiting approval', 'Approved', 'Rejected')),
  constraint posting_map_version_starts
    check (not pg_catalog.lower_inf(valid_during) and not pg_catalog.isempty(valid_during)),
  constraint posting_map_version_no_overlap exclude using gist (posting_map_id with =, valid_during with &&)
    where (decision = 'Approved')
);
create index posting_map_version_map on finance.posting_map_version (posting_map_id);
create index posting_map_version_prepared_by on finance.posting_map_version (prepared_by_user_id);
create trigger guard_version_change before update on finance.posting_map_version
  for each row execute function finance.guard_version_change();

-- A line of a map version (6.1; POL-09.11): a component of the event kind, a side, an account of the map's book and
-- the dimensions it requires. The business unit is on every line; Store and brand are required where the line says.
create table finance.posting_map_line (
  id uuid primary key,
  posting_map_version_id uuid not null references finance.posting_map_version (id),
  component text not null,
  side text not null,
  account_id uuid not null references finance.account (id),
  requires_store boolean not null,
  requires_brand boolean not null,
  recorded_at timestamptz not null default now(),
  constraint posting_map_line_component check (component ~ '^[a-z][a-z0-9-]*$'),
  constraint posting_map_line_side check (side in ('debit', 'credit'))
);
create index posting_map_line_version on finance.posting_map_line (posting_map_version_id);
create index posting_map_line_account on finance.posting_map_line (account_id);
create trigger refuse_row_change before update or delete on finance.posting_map_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.posting_map_line
  for each statement execute function kernel.refuse_change();

-- A line is written only while its version awaits its decision, so nothing joins an approved version (code-house-rules
-- 7.2, 7.3), and only with an account of the map's book (6.1).
create function finance.check_map_line() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if not exists (select 1 from finance.posting_map_version v
                 join finance.posting_map m on m.id = v.posting_map_id
                 join finance.account a on a.book_id = m.book_id
                 where v.id = new.posting_map_version_id and v.decision = 'Awaiting approval'
                   and a.id = new.account_id) then
    raise exception 'a map line names an account of the map''s book, on a version awaiting its decision'
      using errcode = 'AO011';
  end if;
  return new;
end;
$$;
revoke execute on function finance.check_map_line() from public;
create trigger check_map_line before insert on finance.posting_map_line
  for each row execute function finance.check_map_line();

-- The CA's approval evidence covers a map version too (6.3; POL-09.01; DEC-112, GC4-2): exactly one version a cover.
alter table finance.ca_approval_evidence_cover
  add column posting_map_version_id uuid references finance.posting_map_version (id);
alter table finance.ca_approval_evidence_cover drop constraint ca_approval_evidence_cover_one;
alter table finance.ca_approval_evidence_cover add constraint ca_approval_evidence_cover_one
  check (pg_catalog.num_nonnulls(account_version_id, book_setting_version_id, posting_map_version_id) = 1);
alter table finance.ca_approval_evidence_cover add constraint ca_approval_evidence_cover_map
  unique (ca_approval_evidence_id, posting_map_version_id);
create index ca_approval_evidence_cover_map_version on finance.ca_approval_evidence_cover (posting_map_version_id);

-- A journal (5.1; PRD-LED-001, PRD-LED-004, PRD-MOD-008 to PRD-MOD-011, PRD-ACP-013): one book, its accounting and
-- business dates, the event kind, the source document, the map version applied, its number from the book's journal
-- series, the actor and the journal it reverses. Never changed (5.3): insert only, a trigger refuses every change. A
-- reversal names the journal it reverses, once, in the same book. Its period guard refuses a date in no period of the
-- book (S1-F09-T03 adds Locked). Unscoped: it carries no amount and is read only by finance code, through its lines,
-- which carry the scope facts (12; books-and-posting 13.1 "As built").
create table finance.journal (
  id uuid primary key,
  book_id uuid not null,
  legal_entity_id uuid not null,
  financial_period_id uuid not null references finance.financial_period (id),
  accounting_date date not null,
  business_date date not null,
  event_kind text not null,
  source_module text not null,
  source_record_type text not null,
  source_record_id uuid not null,
  source_version_id uuid,
  posting_map_version_id uuid not null references finance.posting_map_version (id),
  number_allocation_id uuid not null,
  number text not null,
  reverses_journal_id uuid references finance.journal (id),
  actor_user_id uuid,
  actor_service_identity_id uuid,
  on_behalf_of_user_id uuid,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint journal_number check (number <> ''),
  constraint journal_number_in_book unique (book_id, number),
  constraint journal_allocation_once unique (number_allocation_id),
  constraint journal_reversed_once unique (reverses_journal_id),
  constraint journal_actor check (pg_catalog.num_nonnulls(actor_user_id, actor_service_identity_id) = 1)
);
create index journal_book_date on finance.journal (book_id, accounting_date);
create index journal_period on finance.journal (financial_period_id);
create index journal_map_version on finance.journal (posting_map_version_id);
create index journal_source on finance.journal (source_module, source_record_type, source_record_id);
create index journal_actor_user on finance.journal (actor_user_id);
create trigger refuse_row_change before update or delete on finance.journal
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.journal
  for each statement execute function kernel.refuse_change();

-- The last guard on a journal (13.1): its accounting date lies in the period it names, of its own book; a reversal
-- reverses a journal of the same book. S1-F09-T03 adds the Locked period.
create function finance.guard_journal() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if not exists (select 1 from finance.financial_period p
                 where p.id = new.financial_period_id and p.book_id = new.book_id
                   and p.dates @> new.accounting_date) then
    raise exception 'a journal''s accounting date lies in a period of its book (books-and-posting 4.1, 13.1)'
      using errcode = 'AO012';
  end if;
  if new.reverses_journal_id is not null
     and not exists (select 1 from finance.journal j where j.id = new.reverses_journal_id and j.book_id = new.book_id) then
    raise exception 'a reversal reverses a journal of the same book (books-and-posting 5.3, 13.1)'
      using errcode = 'AO013';
  end if;
  return new;
end;
$$;
revoke execute on function finance.guard_journal() from public;
create trigger guard_journal before insert on finance.journal
  for each row execute function finance.guard_journal();

-- A journal line (5.1; PRD-LED-001, POL-09.11, PRD-MOD-014): an account of the journal's book, a side, an amount in
-- paise above zero, and the line's scope facts: the book's legal entity, the business unit with its Site and Store,
-- and the brand (12; PRD-SEC-005), with the unit's mapping version Post read (PRD-ACP-013). Insert only.
create table finance.journal_line (
  id uuid primary key,
  journal_id uuid not null references finance.journal (id),
  account_id uuid not null references finance.account (id),
  side text not null,
  amount_paise bigint not null,
  legal_entity_id uuid not null,
  site_id uuid not null,
  store_id uuid,
  business_unit_id uuid not null,
  brand_id uuid,
  mapping_version_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint journal_line_side check (side in ('debit', 'credit')),
  constraint journal_line_amount check (amount_paise > 0)
);
create index journal_line_journal on finance.journal_line (journal_id);
create index journal_line_account on finance.journal_line (account_id);
create index journal_line_legal_entity on finance.journal_line (legal_entity_id);
create index journal_line_site on finance.journal_line (site_id);
create index journal_line_store on finance.journal_line (store_id);
create index journal_line_business_unit on finance.journal_line (business_unit_id);
create index journal_line_brand on finance.journal_line (brand_id);
create trigger refuse_row_change before update or delete on finance.journal_line
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.journal_line
  for each statement execute function kernel.refuse_change();

-- A line's account belongs to its journal's book (13.1).
create function finance.check_journal_line_account() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if not exists (select 1 from finance.journal j join finance.account a on a.book_id = j.book_id
                 where j.id = new.journal_id and a.id = new.account_id) then
    raise exception 'a journal line''s account belongs to the journal''s book (books-and-posting 13.1)'
      using errcode = 'AO014';
  end if;
  return new;
end;
$$;
revoke execute on function finance.check_journal_line_account() from public;
create trigger check_journal_line_account before insert on finance.journal_line
  for each row execute function finance.check_journal_line_account();

-- Balanced at commit (5.2; PRD-LED-004, PRD-MOD-013, POL-09.13): each journal has at least two lines and its debits
-- equal its credits, checked by a deferred constraint trigger, so a journal that does not balance never commits, even
-- written past the service. SECURITY DEFINER, named here and in books-and-posting 5.2 (code-house-rules 5.2): a
-- poster's row-level security may hide lines of other places, and the balance is of every line of the journal.
create function finance.check_journal_balanced() returns trigger
  language plpgsql
  security definer
  set search_path = pg_catalog, pg_temp
as $$
declare
  -- The trigger's argument names the row's column that names the journal.
  journal uuid := (pg_catalog.to_jsonb(new) ->> tg_argv[0])::uuid;
  lines bigint;
  debits numeric;
  credits numeric;
begin
  select count(*),
         coalesce(sum(l.amount_paise) filter (where l.side = 'debit'), 0),
         coalesce(sum(l.amount_paise) filter (where l.side = 'credit'), 0)
    into lines, debits, credits
    from finance.journal_line l where l.journal_id = journal;
  if lines < 2 or debits <> credits then
    raise exception 'a journal has at least two lines and its debits equal its credits (books-and-posting 5.2)'
      using errcode = 'AO015';
  end if;
  return null;
end;
$$;
revoke execute on function finance.check_journal_balanced() from public;
create constraint trigger check_journal_balanced after insert on finance.journal
  deferrable initially deferred
  for each row execute function finance.check_journal_balanced('id');
create constraint trigger check_journal_balanced after insert on finance.journal_line
  deferrable initially deferred
  for each row execute function finance.check_journal_balanced('journal_id');

-- Where each line came from (8.3; PRD-LED-004, PRD-LED-008): one row per source module, item key and component, its
-- signed amount, the journal line it went into, and the hash of the item's whole content, by which a replay is the
-- same item or a changed one (9.3; PRD-INT-002, PRD-INT-008). A correction's row names the row it replaces (9.4).
-- Unscoped: Post reads it to answer a replay whatever the poster may see; only finance code reads it (13.1 "As built").
create table finance.posting_source (
  id uuid primary key,
  source_module text not null,
  item_key text not null,
  component text not null,
  amount_paise bigint not null,
  journal_id uuid not null references finance.journal (id),
  journal_line_id uuid not null references finance.journal_line (id),
  item_hash text not null,
  replaces_posting_source_id uuid references finance.posting_source (id),
  recorded_at timestamptz not null default now(),
  constraint posting_source_amount check (amount_paise <> 0),
  constraint posting_source_replaces_once unique (replaces_posting_source_id)
);
create unique index posting_source_once on finance.posting_source (source_module, item_key, component)
  where replaces_posting_source_id is null;
create index posting_source_journal on finance.posting_source (journal_id);
create index posting_source_line on finance.posting_source (journal_line_id);
create trigger refuse_row_change before update or delete on finance.posting_source
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.posting_source
  for each statement execute function kernel.refuse_change();

-- Row-level security on the lines (12; code-house-rules 6.2; PRD-SEC-005): reading through access.row_visible on the
-- line's facts. Inserting is admitted for any row: Post writes the lines of a money effect for the place the caller
-- posts for, whatever the posting actor may read of `finance.journal` (a cashier's sale posts its journal), so the
-- table names its own write rule (code-house-rules 6.2; books-and-posting 12 "As built"). Post is the only writer.
alter table finance.journal_line enable row level security;
create policy read_in_scope on finance.journal_line for select to aos_runtime
  using (access.row_visible('finance.journal', site_id, store_id, business_unit_id, legal_entity_id, brand_id, null));
create policy insert_any on finance.journal_line for insert to aos_runtime with check (true);

-- Whether a book's lines in a date range include any the actor cannot see, so the trial balance says it is partial
-- (12; PRD-PRF-004). SECURITY DEFINER, named in books-and-posting 12 (code-house-rules 5.2, 6.2): it answers only
-- that, never a hidden line's details.
create function finance.lines_hidden(book uuid, from_date date, to_date date) returns boolean
  language sql
  stable
  security definer
  set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from finance.journal_line l join finance.journal j on j.id = l.journal_id
    where j.book_id = lines_hidden.book and j.accounting_date < lines_hidden.to_date
      and (lines_hidden.from_date is null or j.accounting_date >= lines_hidden.from_date)
      and not access.row_visible('finance.journal', l.site_id, l.store_id, l.business_unit_id, l.legal_entity_id,
                                 l.brand_id, null))
$$;
revoke execute on function finance.lines_hidden(uuid, date, date) from public;
grant execute on function finance.lines_hidden(uuid, date, date) to aos_runtime;

-- Runtime grants (code-house-rules 5.2). Identity rows a change or a posting locks grant UPDATE (id) only; version
-- rows take the changes their guard allows; everything else is insert only.
grant select, insert on finance.financial_period to aos_runtime;
grant update (id) on finance.financial_period to aos_runtime;
grant select, insert on finance.posting_map to aos_runtime;
grant update (id) on finance.posting_map to aos_runtime;
grant select, insert, update on finance.posting_map_version to aos_runtime;
grant select, insert on finance.posting_map_line to aos_runtime;
grant select, insert on finance.journal to aos_runtime;
grant select, insert on finance.journal_line to aos_runtime;
grant select, insert on finance.posting_source to aos_runtime;
