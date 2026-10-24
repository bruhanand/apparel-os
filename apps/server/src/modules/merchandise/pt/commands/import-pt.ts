import { GRN_TYPE, PT_IMPORT_TARGET, PT_TYPE, type DocumentPreview } from '@apparel-os/schemas';
import { CommandDefect, type CommandRefusal } from '../../../../kernel/index.js';
import type { ImportHandler } from '../../../files-imports/index.js';
import { PT_HEADER_ROWS, PT_PROPOSED_SKU_TYPE } from '../domain/kinds.js';
import { BUSINESS_DATE_NOT_SET } from '../domain/refusals.js';
import { listOf, PT_FIELDS, PT_HINT_FIELDS, type PtIssue } from '../domain/rows.js';
import { listsOf, ptPlanOf, uploadBlock } from '../queries/plan.js';
import { submitLockTargets, submitPt, type SubmitDependencies } from './submit-pt.js';

// The PT import handler of `merchandise` · PT (goods-in 5, 10.1; imports-and-opening-data 4.1, 13.2 and its "As
// built" with S2-F04-T02; module-map 4.7 "Register an import handler"; DEC-134 to DEC-138, DEC-140). A transaction
// batch about one GRN (its subject): Start an import refuses a file for a GRN whose held lines wait for their decision
// or that has a PT already (5.1), and takes the batch's place from the GRN; every data row of the file is in one
// document. Every check of 5.3 and the match of 5.4 run even beside a value the file leaves Unknown (checksUnknown), so
// every problem is listed at once by row and column (5.6; PRD-IMP-007); the preview finds each row's product (5.5). The
// review is the preparer's submission: the draft PT it publishes asks its own approval of a different person
// (PRD-REC-017). Publishing is the submit: in one transaction the draft revision, its approval request and the GRN's
// mark (submit-pt.ts). A draft has no stock or money effect. The handler offers no suggestions: a value off its list is
// corrected in the file (DEC-134); a mapping rule may still map a word of a list column to a code on its list (6.3).

/** The one source scope of a PT's documents, each of whose references is its batch's own code (7.1). */
const PT_SCOPE = PT_TYPE;

const issueOf = (issue: PtIssue) => ({
  code: issue.code,
  ...(issue.field === undefined ? {} : { field: issue.field }),
  ...(issue.rowNumber === undefined ? {} : { rowNumber: issue.rowNumber }),
  ...(issue.missing === undefined ? {} : { missing: issue.missing.map((item) => ({ ...item })) }),
});

/** A refusal of any file for the GRN now, as the one issue of the document's report (5.1; PRD-UXP-003). */
const issueOfRefusal = (refusal: CommandRefusal) => ({
  code: refusal.code,
  missing: refusal.missing.map((item) => ({ ...item })),
});

export function ptImportHandler(dependencies: SubmitDependencies): ImportHandler {
  const { receiving } = dependencies;
  return {
    target: PT_IMPORT_TARGET,
    recordType: PT_TYPE,
    kinds: ['transaction'],
    effects: 'none',
    headerRows: PT_HEADER_ROWS,
    subject: {
      recordType: GRN_TYPE,
      async read(context, grnId) {
        const grn = await receiving.grnForPt(context, grnId);
        if (grn === undefined) return undefined;
        const { siteId, storeId, businessUnitId, legalEntityId } = grn.facts;
        const block = await uploadBlock(context, receiving, grnId);
        return {
          place: { siteId, businessUnitId, legalEntityId, ...(storeId === undefined ? {} : { storeId }) },
          need: { action: 'create', recordType: PT_TYPE, facts: grn.facts },
          ...(block === undefined ? {} : { refusal: block }),
        };
      },
    },
    fields: PT_FIELDS.map((name) => ({ name, required: !PT_HINT_FIELDS.includes(name) })),
    measures: [{ field: 'qty', kind: 'quantity' }],
    sourceScope: () => PT_SCOPE,
    revisions: 'none',
    // Create on the PT with the GRN's facts, as Start an import authorised it; a GRN the person may no longer see is not
    // found, never authorised with other facts (code-house-rules 12.3).
    async publishNeeds(context, document) {
      const grnId = document.subject?.recordId;
      if (grnId === undefined) throw new CommandDefect('A PT document names no GRN');
      const grn = await receiving.grnForPt(context, grnId);
      return grn === undefined ? undefined : { action: 'create', recordType: PT_TYPE, facts: grn.facts };
    },
    lockTargets: (context, document) => submitLockTargets(context, receiving, document),
    review: () => ({ kind: 'submission' }),
    suggestions: () => Promise.resolve([]),
    async checkRuleTarget(context, field, target): Promise<CommandRefusal | undefined> {
      const list = listOf(field as (typeof PT_FIELDS)[number]);
      if (field !== 'brand' && field !== 'subCategory' && list === undefined) {
        return { kind: 'refused', code: 'files-imports.rule-attribute-unknown', missing: [{ kind: 'field', field }] };
      }
      const date = await context.businessDate();
      if (date.kind === 'not-set') return BUSINESS_DATE_NOT_SET;
      const listed = await listsOf(context, date.date);
      if (listed.kind === 'refused') return listed.refusal;
      const entries =
        field === 'brand'
          ? listed.lists.brands
          : field === 'subCategory'
            ? listed.lists.categories
            : list === undefined
              ? new Map<string, string>()
              : listed.lists.attributes[list];
      return entries.has(target)
        ? undefined
        : { kind: 'refused', code: 'files-imports.rule-target-refused', missing: [{ kind: 'field', field }] };
    },
    // Beside a value the file leaves Unknown, every other problem of the file, so all are listed at once (5.6).
    async checksUnknown(context, document) {
      const plan = await ptPlanOf(context, receiving, document);
      if (plan.kind === 'refused') return [issueOfRefusal(plan.refusal)];
      return plan.kind === 'issues' ? plan.issues.map(issueOf) : [];
    },
    async preview(context, document): Promise<DocumentPreview> {
      const plan = await ptPlanOf(context, receiving, document);
      if (plan.kind === 'refused') return { kind: 'issues', issues: [issueOfRefusal(plan.refusal)] };
      if (plan.kind === 'issues') {
        const [first, ...rest] = plan.issues;
        return { kind: 'issues', issues: [issueOf(first), ...rest.map(issueOf)] };
      }
      // The pipeline previews a document only once every required value of it is known (import-common `previewOf`).
      if (plan.kind === 'unknown') throw new CommandDefect('A PT file was previewed with a required value Unknown');
      return {
        kind: 'would-create',
        records: [
          { recordType: PT_TYPE, codes: [plan.draft.grn.number] },
          ...(plan.draft.proposals.length === 0
            ? []
            : [{ recordType: PT_PROPOSED_SKU_TYPE, codes: plan.draft.proposals.map((each) => each.key) }]),
        ],
      };
    },
    publish: (context, publisher, document, source) => submitPt(context, dependencies, publisher, document, source),
  };
}
