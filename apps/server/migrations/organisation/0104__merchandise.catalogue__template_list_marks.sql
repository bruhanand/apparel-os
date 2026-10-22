-- The lists of the Organisation's PT template as marked attributes (structure-and-masters 4.2 "As built" with
-- S2-F04-T02; goods-in 5.2, 5.3; PRD-IMP-008, DEC-134). Beside the season and the size list, the Organisation marks
-- which of its list-type attributes holds the colours, genders, types, items, fits and GST rates a PT file's values must
-- be on, each an Organisation setting prepared by one person and approved by a different one, as the season and the
-- size list are (migration 0091). Runs as aos_migration (code-house-rules 5.1). Compatible with the version running: it
-- only widens the marks a row may hold (code-house-rules 4.2). No attribute is marked here: the Organisation marks its
-- own, and while a list is not marked a PT file is refused, naming the setting (code-house-rules 12.14).

alter table merchandise.marked_attribute drop constraint marked_attribute_mark;
alter table merchandise.marked_attribute add constraint marked_attribute_mark
  check (mark in ('season', 'size', 'colour', 'gender', 'type', 'item', 'fit', 'gst-rate'));
