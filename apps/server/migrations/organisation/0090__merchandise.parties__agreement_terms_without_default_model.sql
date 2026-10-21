-- The agreement's default model for new bookings retired (structure-and-masters 5.2 as built; DEC-129, POL-01.02;
-- RR-545; S2-F01-T01). Every booking takes its brand Agreement's commercial model, so an agreement version no longer
-- holds a model for new bookings: the shape `agreement-terms/2` is `agreement-terms/1` without `defaultModel`, every
-- other term as it was (code-house-rules 3.3). Every version stored so far is brought to it: the term is taken out of
-- its terms and nothing else in the row changes, its decision, dates, margins and attachments included. The audit
-- record of each version's preparation keeps its terms as they were prepared, so the history of what was recorded
-- stays (numbering-and-audit 4; PRD-MOD-011). The versions' guard (code-house-rules 7.3) admits no change to the terms
-- of a version, so it is off for this one statement and on again before the file ends; the file runs in one
-- transaction (4.3). Runs as aos_migration, which owns the table (code-house-rules 5.1).
--
-- Not compatible with the version running (code-house-rules 4.2): the code deployed before this migration writes
-- versions in `agreement-terms/1`, which the new check refuses, and reads versions without the term its schema
-- expects, so between this migration and the new version taking traffic preparing an agreement version fails and the
-- Agreement screen shows no default model. Accepted as a planned brief interruption of the test setup, which holds
-- only synthetic data (DEC-120): `dev` is the only environment with data (deployment.md section 2).

alter table merchandise.agreement_version disable trigger guard_version_change;
alter table merchandise.agreement_version drop constraint agreement_version_terms_format;
update merchandise.agreement_version
   set terms = terms - 'defaultModel',
       terms_format = 'agreement-terms/2'
 where terms_format = 'agreement-terms/1';
alter table merchandise.agreement_version
  add constraint agreement_version_terms_format check (terms_format = 'agreement-terms/2'),
  add constraint agreement_version_no_default_model check (not (terms ? 'defaultModel'));
alter table merchandise.agreement_version enable trigger guard_version_change;
