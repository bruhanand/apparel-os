import {
  businessDateSchema,
  operatingModelSchema,
  storeDraftSchema,
  storeFormatSchema,
  type DocumentPreview,
  type StoreDraft,
  type ValueSuggestion,
} from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import { knownValue, type HandlerDocument, type ImportHandler } from '../../files-imports/index.js';
import { store } from '../db/schema.js';
import { recordTypeOf } from '../domain/kinds.js';
import { structureOn } from '../queries/records.js';
import type { Organisation } from '../organisation.js';

// The `organisation` create handler for Stores (imports-and-opening-data 13.2; structure-and-masters 3.3, 7;
// module-map 4.7 "Register an import handler", section 3 rules 6 and 8; PRD-IMP-010, PRD-IMP-012, PRD-ORG-010,
// PRD-ORG-021; S1-F06-T03). A document is one Store, its reference the Store's code, from one staged row; publishing it
// calls the organisation's own Maintain operation, Prepare a Store, so the new Store's first version waits for a
// different authorised person to approve it, exactly as one prepared on screen (2.3). Its Site is found by the Site's
// code among the Sites in force today; the format and operating model must be values the organisation accepts. The
// version starts today. As built, the Stores are the first structure master the handler takes; the others follow the
// same shape (structure-and-masters 7).

const FIELDS = [
  { name: 'storeCode', required: true },
  { name: 'name', required: true },
  { name: 'format', required: true },
  { name: 'operatingModel', required: true },
  { name: 'siteCode', required: true },
  { name: 'openingDate', required: false },
] as const;

type Issue = Extract<DocumentPreview, { kind: 'issues' }>['issues'][number];

/** The target the handler serves: Stores of `organisation`. */
export const STORE_IMPORT_TARGET = 'organisation.store';

async function today(context: TransactionContext): Promise<string | undefined> {
  const date = await context.businessDate();
  return date.kind === 'set' ? date.date : undefined;
}

/** The Store draft a document stands for, or the issues that stop it. */
async function draftOf(
  context: TransactionContext,
  document: HandlerDocument,
): Promise<{ readonly draft: StoreDraft } | { readonly issues: Issue[] }> {
  const [row, ...more] = document.rows;
  if (row === undefined) return { issues: [{ code: 'organisation.import-document-empty' }] };
  const issues: Issue[] = more.map((extra) => ({
    code: 'organisation.import-one-row-per-store',
    rowNumber: extra.rowNumber,
  }));
  const value = (field: string) => knownValue(row.values[field]);
  const at = (field: string) => ({ field, rowNumber: row.rowNumber });
  const format = storeFormatSchema.safeParse(value('format'));
  if (!format.success) issues.push({ code: 'organisation.import-value-not-accepted', ...at('format') });
  const model = operatingModelSchema.safeParse(value('operatingModel'));
  if (!model.success) issues.push({ code: 'organisation.import-value-not-accepted', ...at('operatingModel') });
  const opening = value('openingDate');
  if (opening !== undefined && !businessDateSchema.safeParse(opening).success) {
    issues.push({ code: 'organisation.import-value-not-accepted', ...at('openingDate') });
  }
  const date = await today(context);
  if (date === undefined) return { issues: [{ code: 'access.business-date-not-set' }] };
  const structure = await structureOn(context, date);
  const site = structure.sites.find((each) => each.code === value('siteCode'));
  if (site === undefined) issues.push({ code: 'organisation.record-not-found', ...at('siteCode') });
  const [taken] = await context.tx.select({ id: store.id }).from(store).where(eq(store.code, document.reference));
  if (taken !== undefined) {
    issues.push({
      code: 'organisation.code-taken',
      ...at('storeCode'),
      missing: [{ kind: 'record', recordType: recordTypeOf('store'), recordId: taken.id }],
    });
  }
  if (issues.length > 0 || site === undefined || !format.success || !model.success) return { issues };
  const draft = storeDraftSchema.safeParse({
    code: document.reference,
    name: value('name'),
    format: format.data,
    operatingModel: model.data,
    siteId: site.id,
    aliases: [],
    ...(opening === undefined ? {} : { openingDate: opening }),
    validFrom: date,
  });
  if (!draft.success) return { issues: [{ code: 'organisation.import-value-not-accepted' }] };
  return { draft: draft.data };
}

function optionSuggestions(options: readonly string[], value: string | undefined): ValueSuggestion[] {
  if (value === undefined || value === '') return [];
  const said = value.toLowerCase();
  const exact = options.filter((option) => option === said);
  if (exact.length > 0) return exact.map((option) => ({ kind: 'exact', value: option }));
  return options
    .filter((option) => option.includes(said) || said.includes(option))
    .map((option) => ({ kind: 'close', value: option }));
}

/** The handler `organisation` registers with files-imports at start, for Stores. */
export function storeImportHandler(organisation: Organisation): ImportHandler {
  return {
    target: STORE_IMPORT_TARGET,
    recordType: recordTypeOf('store'),
    kinds: ['create'],
    effects: 'master-records',
    fields: FIELDS,
    publishNeeds: { action: 'create', recordType: recordTypeOf('store') },
    // Each Store's first version waits for a different authorised person (2.3), so the submission is the review.
    review: { kind: 'submission' },
    async suggestions(context, field, value) {
      switch (field) {
        case 'format':
          return optionSuggestions(storeFormatSchema.options, value);
        case 'operatingModel':
          return optionSuggestions(operatingModelSchema.options, value);
        case 'siteCode': {
          const date = await today(context);
          if (date === undefined || value === undefined) return [];
          const sites = (await structureOn(context, date)).sites;
          const exact = sites.filter((site) => site.code === value);
          if (exact.length > 0) return exact.map((site) => ({ kind: 'exact', value: site.code, label: site.name }));
          const said = value.toLowerCase();
          return sites
            .filter((site) => site.code.toLowerCase().includes(said) || site.name.toLowerCase().includes(said))
            .slice(0, 5)
            .map((site) => ({ kind: 'close', value: site.code, label: site.name }));
        }
        default:
          return [];
      }
    },
    async checkRuleTarget(context, field, target): Promise<CommandRefusal | undefined> {
      const missing = [{ kind: 'rule-target', field, target }];
      switch (field) {
        case 'format':
          return storeFormatSchema.safeParse(target).success
            ? undefined
            : { kind: 'refused', code: 'organisation.import-value-not-accepted', missing };
        case 'operatingModel':
          return operatingModelSchema.safeParse(target).success
            ? undefined
            : { kind: 'refused', code: 'organisation.import-value-not-accepted', missing };
        case 'siteCode': {
          const date = await today(context);
          const sites = date === undefined ? [] : (await structureOn(context, date)).sites;
          return sites.some((site) => site.code === target)
            ? undefined
            : { kind: 'refused', code: 'organisation.record-not-found', missing };
        }
        default:
          return {
            kind: 'refused',
            code: 'files-imports.rule-attribute-unknown',
            missing: [{ kind: 'rule-attribute', field }],
          };
      }
    },
    async preview(context, document) {
      const drafted = await draftOf(context, document);
      if ('issues' in drafted) return { kind: 'issues', issues: drafted.issues };
      return { kind: 'would-create', records: [{ recordType: recordTypeOf('store'), codes: [drafted.draft.code] }] };
    },
    async publish(context, publisher, document) {
      const drafted = await draftOf(context, document);
      if ('issues' in drafted) {
        const [issue] = drafted.issues;
        return {
          kind: 'refused',
          refusal: { kind: 'refused', code: issue?.code ?? 'organisation.import-value-not-accepted', missing: [] },
        };
      }
      // Prepare a Store, the organisation's own Maintain operation (module-map section 3, rule 8).
      const prepared = await organisation.prepareStore(context, publisher, drafted.draft);
      if (prepared.kind !== 'success') return { kind: 'refused', refusal: prepared.refusal };
      return {
        kind: 'published',
        records: [{ recordType: recordTypeOf('store'), recordId: prepared.answer.recordId }],
      };
    },
  };
}
