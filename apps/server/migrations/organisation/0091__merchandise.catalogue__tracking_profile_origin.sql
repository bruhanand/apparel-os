-- Where a tracking profile version's values came from (code-house-rules 12.14 "Where a value came from";
-- structure-and-masters 4.5 "As built"; goods-in 10.5; POL-04.01, POL-04.05; RR-480, RR-558; S2-F02-T02). The tracking
-- profiles are policy 4's values, reported to the policy gate with their origin, as every other configured value is:
-- KDPS's answer, a setting of the test setup, or synthetic. Preparing a version states it, with no default; a version
-- of an origin the environment does not accept is refused when prepared, and Available names one it finds. Runs as
-- aos_migration, which owns the table (code-house-rules 5.1).
--
-- The versions written before this migration have no origin recorded. They are labelled synthetic: every database that
-- holds rows today is a synthetic Organisation's on `dev` or a test's (the seed refuses any other, DEC-118), and
-- synthetic is the origin accepted least, only in local work, tests and `dev` on a synthetic Organisation, so a row so
-- labelled can never count as KDPS's anywhere (fail closed). The temporary default fills those rows without an update
-- (a version row changes only as its guard allows, code-house-rules 7.3) and is dropped at once: no column has a
-- default (code-house-rules 3.3).
--
-- Not compatible with the version running (code-house-rules 4.2): the code deployed before this migration writes no
-- origin, which the column refuses, so between this migration and the new version taking traffic preparing a tracking
-- profile fails. Accepted as a planned brief interruption of the test setup, which holds only synthetic data
-- (DEC-120): `dev` is the only environment with data (deployment.md section 2).

alter table merchandise.tracking_profile_version add column origin text not null default 'synthetic';
alter table merchandise.tracking_profile_version alter column origin drop default;
alter table merchandise.tracking_profile_version
  add constraint tracking_profile_version_origin check (origin in ('kdps', 'test-setup', 'synthetic'));
