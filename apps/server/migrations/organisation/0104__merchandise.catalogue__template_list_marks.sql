-- The lists of the Organisation's PT template as marked attributes (structure-and-masters 4.2 "As built" with
-- S2-F04-T02; goods-in 5.2, 5.3; PRD-IMP-008, DEC-134). Beside the season and the size list, the Organisation marks
-- which of its list-type attributes holds the colours, genders, types, items, fits and GST rates a PT file's values must
-- be on, each an Organisation setting prepared by one person and approved by a different one, as the season and the
-- size list are (migration 0091). Runs as aos_migration (code-house-rules 5.1). Compatible with the version running: it
-- only widens the marks a row may hold and adds a table (code-house-rules 4.2). No attribute is marked here: the
-- Organisation marks its own, and while a list is not marked a PT file is refused, naming the setting (code-house-rules
-- 12.14).

alter table merchandise.marked_attribute drop constraint marked_attribute_mark;
alter table merchandise.marked_attribute add constraint marked_attribute_mark
  check (mark in ('season', 'size', 'colour', 'gender', 'type', 'item', 'fit', 'gst-rate'));

-- The master sheet's item map (goods-in 5.2, 5.3; the product owner, 22 Oct 2026, RR-583): each item's sub category,
-- a category, and its type, a value of the type list, kept with the version of the item marking it belongs to, frozen
-- with it, so a PT file's ITEM is checked against the map of the item attribute marked when it is checked. An item the
-- map does not hold has no sub category or type: nothing is given by default. Each item once in a version. Unscoped, as
-- the markings are (structure-and-masters 6.2). Append-only: a change of the map is the item marking's next version.
create table merchandise.item_map_entry (
  id uuid primary key,
  marked_attribute_version_id uuid not null references merchandise.marked_attribute_version (id),
  item_value_id uuid not null references merchandise.vocabulary_value (id),
  category_id uuid not null references merchandise.category (id),
  type_value_id uuid not null references merchandise.vocabulary_value (id),
  recorded_at timestamptz not null default now(),
  constraint item_map_entry_once unique (marked_attribute_version_id, item_value_id)
);
create index item_map_entry_item_value on merchandise.item_map_entry (item_value_id);
create index item_map_entry_category on merchandise.item_map_entry (category_id);
create index item_map_entry_type_value on merchandise.item_map_entry (type_value_id);
create trigger refuse_row_change before update or delete on merchandise.item_map_entry
  for each row execute function kernel.refuse_change();
create trigger refuse_truncate before truncate on merchandise.item_map_entry
  for each statement execute function kernel.refuse_change();

-- Runtime grants (code-house-rules 5.2): the map is written with its version and only read after.
grant select, insert on merchandise.item_map_entry to aos_runtime;
