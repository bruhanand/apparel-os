-- Lock and reopening of financial periods (books-and-posting 4.1 to 4.5, 9.1, 13.1; module-map 4.14; PRD-LED-009,
-- PRD-LED-019, PRD-LED-020, PRD-INT-003; DEC-106, DEC-107; S1-F09-T03). Runs as aos_migration, which owns everything it
-- creates (code-house-rules 5.1). Compatible with the version running: it adds tables and replaces the journal's
-- period guard with one that also refuses a Locked period, which no period is until this version locks one
-- (code-house-rules 4.2). Who may lock, request, approve and withdraw is KDPS's (V-01); nothing here names anyone.

-- A request to reopen a Locked period (4.3 step 1; PRD-LED-019): the period, its reason and its requester, frozen when
-- made, since adding a correction is a new request. Its decision and its withdrawal are period events (below), so the
-- request itself is append-only (code-house-rules 7.1). Decide locks it at step 1, so the runtime role holds UPDATE (id).
create table finance.period_reopening (
  id uuid primary key,
  financial_period_id uuid not null references finance.financial_period (id),
  reason text not null,
  requested_by_user_id uuid not null,
  role_assignment_id uuid not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint period_reopening_reason check (reason ~ '\S')
);
create index period_reopening_period on finance.period_reopening (financial_period_id);
create index period_reopening_requested_by on finance.period_reopening (requested_by_user_id);
create trigger refuse_row_change before update or delete on finance.period_reopening
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.period_reopening
  for each statement execute function kernel.refuse_change();

-- The corrections a reopening names (4.3 step 1; PRD-LED-020): each a source record by owning module, record type and
-- identifier, once per reopening. A posting whose source is one of them may enter the reopened period.
create table finance.period_reopening_source (
  id uuid primary key,
  period_reopening_id uuid not null references finance.period_reopening (id),
  source_module text not null,
  source_record_type text not null,
  source_record_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint period_reopening_source_module check (source_module ~ '^[a-z][a-z0-9-]*$'),
  constraint period_reopening_source_type check (source_record_type ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*$'),
  constraint period_reopening_source_once unique (period_reopening_id, source_module, source_record_type, source_record_id)
);
create index period_reopening_source_record
  on finance.period_reopening_source (source_module, source_record_type, source_record_id);
create trigger refuse_row_change before update or delete on finance.period_reopening_source
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.period_reopening_source
  for each statement execute function kernel.refuse_change();

-- What happens to a period (4.1, 4.2, 4.3): it is locked, once; a reopening of it is approved or rejected, once; an
-- approved one is withdrawn, once. With the reopenings and their uses, the source of the state projection (Open,
-- Locked, Reopened; DM-4). Append-only. The approver of a reopening is never its requester (PRD-LED-019), which access
-- checks before the decision and the trigger below checks again as the last guard.
create table finance.period_event (
  id uuid primary key,
  financial_period_id uuid not null references finance.financial_period (id),
  kind text not null,
  period_reopening_id uuid references finance.period_reopening (id),
  by_user_id uuid not null,
  role_assignment_id uuid,
  approval_decision_id uuid,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint period_event_kind
    check (kind in ('locked', 'reopening-approved', 'reopening-rejected', 'reopening-withdrawn')),
  constraint period_event_reopening check ((kind = 'locked') = (period_reopening_id is null)),
  constraint period_event_decision
    check ((kind in ('reopening-approved', 'reopening-rejected')) = (approval_decision_id is not null))
);
create unique index period_event_locked_once on finance.period_event (financial_period_id) where kind = 'locked';
create unique index period_event_decided_once on finance.period_event (period_reopening_id)
  where kind in ('reopening-approved', 'reopening-rejected');
create unique index period_event_withdrawn_once on finance.period_event (period_reopening_id)
  where kind = 'reopening-withdrawn';
create index period_event_period on finance.period_event (financial_period_id);
create index period_event_by on finance.period_event (by_user_id);
create trigger refuse_row_change before update or delete on finance.period_event
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.period_event
  for each statement execute function kernel.refuse_change();

-- A reopening's event names a reopening of the same period; its approval is by someone other than its requester
-- (PRD-LED-019, DEC-106); only an approved reopening is withdrawn (4.3 step 4).
create function finance.check_period_event() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  if new.period_reopening_id is null then
    return new;
  end if;
  if not exists (select 1 from finance.period_reopening r
                 where r.id = new.period_reopening_id and r.financial_period_id = new.financial_period_id) then
    raise exception 'a reopening''s event names a reopening of its period (books-and-posting 4.3)'
      using errcode = 'AO017';
  end if;
  if new.kind = 'reopening-approved'
     and exists (select 1 from finance.period_reopening r
                 where r.id = new.period_reopening_id and r.requested_by_user_id = new.by_user_id) then
    raise exception 'a reopening is approved by someone other than its requester (PRD-LED-019)'
      using errcode = 'AO017';
  end if;
  if new.kind = 'reopening-withdrawn'
     and not exists (select 1 from finance.period_event e
                     where e.period_reopening_id = new.period_reopening_id and e.kind = 'reopening-approved') then
    raise exception 'only an approved reopening is withdrawn (books-and-posting 4.3)'
      using errcode = 'AO017';
  end if;
  return new;
end;
$$;
revoke execute on function finance.check_period_event() from public;
create trigger check_period_event before insert on finance.period_event
  for each row execute function finance.check_period_event();

-- The use of a named correction (4.3 step 4, 4.5; PRD-LED-020): one row per named correction, unique, written in the
-- posting transaction after its journals, naming the first journal it went into. It needs no lock of its own: a second
-- posting of the same correction meets the unique key.
create table finance.period_reopening_use (
  id uuid primary key,
  period_reopening_source_id uuid not null references finance.period_reopening_source (id),
  journal_id uuid not null references finance.journal (id),
  recorded_at timestamptz not null default now(),
  constraint period_reopening_use_once unique (period_reopening_source_id)
);
create index period_reopening_use_journal on finance.period_reopening_use (journal_id);
create trigger refuse_row_change before update or delete on finance.period_reopening_use
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on finance.period_reopening_use
  for each statement execute function kernel.refuse_change();

-- The last guard on a journal (13.1), as 0053 wrote it, and now: a journal into a Locked period is refused unless an
-- approved reopening of the period, not withdrawn, names its source as a correction not yet used (PRD-LED-009,
-- PRD-LED-020). Post writes a correction's use after its journals, so every journal of that posting passes here.
create or replace function finance.guard_journal() returns trigger
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
  if exists (select 1 from finance.period_event e
             where e.financial_period_id = new.financial_period_id and e.kind = 'locked')
     and not exists (
       select 1 from finance.period_reopening_source s
       join finance.period_reopening r on r.id = s.period_reopening_id
       where r.financial_period_id = new.financial_period_id
         and s.source_module = new.source_module
         and s.source_record_type = new.source_record_type
         and s.source_record_id = new.source_record_id
         and exists (select 1 from finance.period_event a
                     where a.period_reopening_id = r.id and a.kind = 'reopening-approved')
         and not exists (select 1 from finance.period_event w
                         where w.period_reopening_id = r.id and w.kind = 'reopening-withdrawn')
         and not exists (select 1 from finance.period_reopening_use u where u.period_reopening_source_id = s.id)) then
    raise exception 'a journal enters a Locked period only as a correction a reopening names (PRD-LED-009, PRD-LED-020)'
      using errcode = 'AO016';
  end if;
  return new;
end;
$$;

-- Runtime grants (code-house-rules 5.2): insert and read only; UPDATE (id) on the reopening, which Decide and a
-- withdrawal lock.
grant select, insert on finance.period_reopening to aos_runtime;
grant update (id) on finance.period_reopening to aos_runtime;
grant select, insert on finance.period_reopening_source to aos_runtime;
grant select, insert on finance.period_event to aos_runtime;
grant select, insert on finance.period_reopening_use to aos_runtime;
