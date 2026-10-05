-- The append-only guard (code-house-rules 7.1; PRD-MOD-011). Every append-only table calls it from a
-- BEFORE UPDATE OR DELETE row trigger and a BEFORE TRUNCATE statement trigger. It stops the owner too.
-- SQLSTATE class AO marks the refusal, so code can tell it from any other error.

create function kernel.refuse_change() returns trigger
  language plpgsql
  set search_path = pg_catalog
as $$
begin
  raise exception 'append-only: % on %.% refused', tg_op, tg_table_schema, tg_table_name
    using errcode = 'AO001';
end;
$$;

-- A trigger function is checked for EXECUTE when the trigger is created, by its owner; nobody else needs it.
revoke execute on function kernel.refuse_change() from public;
