import { z } from 'zod';
import { businessDateSchema, idSchema } from './common.js';
import { missingItemSchema } from './errors.js';
import { storedFileSchema } from './files.js';
import { fieldClassSchema, type FieldClass } from './roles.js';

// Imports: the import upload, layouts, mappings and mapping rules with their proposals, detection, batches, staged
// rows with their origins, values entered by a person, the validation report, preview, submission and publish
// (imports-and-opening-data 3.1, 3.2, 4.1, 5, 6.1 to 6.6, 7.2, 7.4, 8, 11, 13.1, 13.2; S1-F06-T01, S1-F06-T03). No
// layout, mapping, rule, code format or value is set here: the Organisation records its own (AGENTS.md "Never invent
// a value").

const asOf = z.iso.datetime({ offset: true });

/** The record type an import batch is authorised, scoped and audited on (access-and-approvals 4.1; 15.1). */
export const IMPORT_BATCH_TYPE = 'files_imports.import_batch';
/** The record types of layouts, mappings and mapping rules: proposed with create, confirmed with approve (6.4). */
export const IMPORT_LAYOUT_TYPE = 'files_imports.layout';
export const IMPORT_MAPPING_TYPE = 'files_imports.mapping';
export const MAPPING_RULE_TYPE = 'files_imports.mapping_rule';
/**
 * The approval rules of a layout version, a mapping version and a mapping rule version: each confirmed by a different
 * authorised person from its proposer (6.4; PRD-IMP-008, POL-02.07, POL-02.08; DEC-112 GC6-4).
 */
export const LAYOUT_CONFIRMATION = 'files_imports.layout.confirm';
export const MAPPING_CONFIRMATION = 'files_imports.mapping.confirm';
export const MAPPING_RULE_CONFIRMATION = 'files_imports.mapping_rule.confirm';
/**
 * The approval rule of an import batch whose handler requires an independent approval before Publish (3.1 step 8,
 * 7.2, 7.3, 13.2; PRD-ACS-006): an update batch of product masters, a governed revision that takes effect on Publish
 * itself, is approved by a different authorised person from its preparers (product owner, 11 Oct 2026).
 */
export const IMPORT_BATCH_APPROVAL = 'files_imports.import_batch.approve';
/**
 * The verification of an opening batch, one approval action per opening kind, each on a record type of its own so
 * each company assigns its verifiers through roles and a holder of one cannot decide the other (product owner, 12 Oct
 * 2026; imports-and-opening-data 10.2, 10.4): opening stock, which Operations verifies (`POL-14.02`); and opening
 * balances, the dues, advances and deposits, which Accounts verifies (`POL-14.03`). The request binds to the batch
 * version, its record the batch under the record type of its kind.
 */
export const OPENING_STOCK_TYPE = 'files_imports.opening_stock';
export const OPENING_STOCK_APPROVAL = 'files_imports.opening_stock.verify';
export const OPENING_BALANCES_TYPE = 'files_imports.opening_balances';
export const OPENING_BALANCES_APPROVAL = 'files_imports.opening_balances.verify';

/**
 * The classes encrypted in the application before they reach PostgreSQL (access-and-approvals 6): bank details,
 * identity documents, and salary and payroll data. A column of one is left out of staging unless the mapping fills a
 * target that holds the class (imports-and-opening-data 11).
 */
export const ENCRYPTED_FIELD_CLASSES: readonly FieldClass[] = [
  'bank-details',
  'identity-documents',
  'salary-and-payroll',
];

/** The five batch kinds, fixed for a batch's life (4.1; PRD-IMP-010). */
export const importKindSchema = z.enum(['create', 'update', 'opening-balance', 'historical-reference', 'transaction']);
export type ImportKind = z.infer<typeof importKindSchema>;

/** A batch's states, the DM-4 baseline (3.2; DEC-105). */
export const importBatchStateSchema = z.enum(['Staged', 'Validated', 'Published', 'Failed']);
export type ImportBatchState = z.infer<typeof importBatchStateSchema>;

/** A layout, mapping or mapping rule version's states, those of a proposal (6.4; DM-4). */
export const importVersionStateSchema = z.enum(['Proposed', 'Confirmed', 'Rejected']);
export type ImportVersionState = z.infer<typeof importVersionStateSchema>;

/** A name as layouts compare it: trimmed, with runs of spaces collapsed (6.1). */
export function normalisedName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** A column's type (6.1): text, a number, or an amount of money in rupees with up to two decimals (6.2). */
export const layoutColumnTypeSchema = z.enum(['text', 'number', 'money']);
export type LayoutColumnType = z.infer<typeof layoutColumnTypeSchema>;

/** One column of a layout version (6.1): its header name, type, whether required or explicitly ignored, its class. */
export const layoutColumnSchema = z.strictObject({
  name: z.string().regex(/\S/).max(120),
  /** A required column must be found at the header row for the version to be compatible (6.5). */
  required: z.boolean(),
  /** Text when left out. */
  type: layoutColumnTypeSchema.optional(),
  /** Explicitly ignored: known to the layout, never mapped (A-4). */
  ignored: z.boolean().optional(),
  /** The restricted field class the column holds, where it holds one (section 11). */
  restrictedClass: fieldClassSchema.optional(),
});

/**
 * A control total the file reports (6.6; G-1, K-1): the row whose label column holds the label is a total row, never
 * a line, and its value in the column is compared with the sum of the lines.
 */
export const controlTotalRuleSchema = z.strictObject({
  column: z.string().regex(/\S/),
  labelColumn: z.string().regex(/\S/),
  label: z.string().regex(/\S/).max(120),
});

/** The structure a layout version records (6.1): never data. */
export const layoutStructureSchema = z
  .strictObject({
    shape: z.literal('layout-version/1'),
    format: z.literal('xlsx'),
    /** The sheet, by name; names compare trimmed with spaces collapsed (6.1). */
    sheet: z.string().regex(/\S/).max(120),
    headerRow: z.number().int().positive(),
    dataStartRow: z.number().int().positive(),
    columns: z.array(layoutColumnSchema).min(1).max(200),
    /** The column whose value is the document reference (7.1); a row is data only when it is filled (6.6). */
    documentReference: z.string().regex(/\S/),
    controlTotals: z.array(controlTotalRuleSchema).max(20).optional(),
  })
  .superRefine((value, issues) => {
    const names = value.columns.map((column) => normalisedName(column.name));
    if (new Set(names).size !== names.length) {
      issues.addIssue({ code: 'custom', message: 'Each column is named once', path: ['columns'] });
    }
    const named = (name: string) => names.includes(normalisedName(name));
    if (!named(value.documentReference)) {
      issues.addIssue({ code: 'custom', message: 'The reference is a column', path: ['documentReference'] });
    }
    for (const [at, total] of (value.controlTotals ?? []).entries()) {
      if (!named(total.column) || !named(total.labelColumn)) {
        issues.addIssue({ code: 'custom', message: 'A control total names columns', path: ['controlTotals', at] });
      }
    }
    for (const [at, column] of value.columns.entries()) {
      if (column.ignored === true && column.required) {
        issues.addIssue({ code: 'custom', message: 'An ignored column is not required', path: ['columns', at] });
      }
    }
    if (value.dataStartRow <= value.headerRow) {
      issues.addIssue({ code: 'custom', message: 'Data starts below the header', path: ['dataStartRow'] });
    }
  });
export type LayoutStructure = z.infer<typeof layoutStructureSchema>;

/**
 * The transforms a mapping may name (6.2): `text`, the cell's text trimmed; `decimal`, an exact decimal; `paise`, an
 * amount in rupees to whole paise by exact decimal arithmetic, a value with more decimals than paise staying Unknown
 * (C-2; GC6-13: no rounding rule is named yet).
 */
export const mappingTransformSchema = z.enum(['text', 'decimal', 'paise']);
export type MappingTransform = z.infer<typeof mappingTransformSchema>;

/**
 * A named calculation (6.2; section 5 "Calculated"): `join` joins the columns' text with the separator given;
 * `sum` adds the columns' exact decimals, as a decimal or, `as: 'paise'`, in paise.
 */
export const calculationSchema = z.discriminatedUnion('name', [
  z.strictObject({
    name: z.literal('join'),
    columns: z.array(z.string().regex(/\S/)).min(2).max(10),
    separator: z.string().max(10).optional(),
  }),
  z.strictObject({
    name: z.literal('sum'),
    columns: z.array(z.string().regex(/\S/)).min(2).max(10),
    as: z.enum(['decimal', 'paise']).optional(),
  }),
]);
export type Calculation = z.infer<typeof calculationSchema>;

/** A field filled from one column (6.2), mapped through confirmed rules where `rules` says so (6.3). */
export const columnFieldSchema = z.strictObject({
  column: z.string().regex(/\S/),
  transform: mappingTransformSchema,
  rules: z.boolean().optional(),
  /** A calculation kept beside the supplied value, never replacing it; a disagreement is a row issue (section 5). */
  alsoCalculated: calculationSchema.optional(),
});
/** A field filled by a named calculation over several columns (6.2). */
export const calculatedFieldSchema = z.strictObject({ calculation: calculationSchema });

/** How a mapping version fills a target's fields from a layout version's columns (6.2). */
export const mappingFieldsSchema = z.strictObject({
  shape: z.literal('mapping-version/1'),
  fields: z.record(
    z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,59}$/),
    z.union([columnFieldSchema, calculatedFieldSchema]),
  ),
});
export type MappingFields = z.infer<typeof mappingFieldsSchema>;

/** A batch that read a stored file before, as the same bytes handed in again show it (7.2). */
export const earlierBatchSchema = z.strictObject({
  batchId: idSchema,
  code: z.string(),
  kind: importKindSchema,
  target: z.string(),
  state: importBatchStateSchema,
});

/**
 * Store a file for an import (13.1): the same request as Store a file, refused unless the content is XLSX (9.2). The
 * answer names the batches that read the same bytes before (7.2).
 */
export const importFileStoredSchema = z.strictObject({
  ...storedFileSchema.shape,
  earlierBatches: z.array(earlierBatchSchema),
});
export type ImportFileStored = z.infer<typeof importFileStoredSchema>;

/**
 * A proposal's decision: who proposed it, and who decided it and when, once decided (6.4); and its latest approval
 * request, for the approval panel, with its state (access-and-approvals 9.1, 9.6).
 */
const proposalFacts = {
  state: importVersionStateSchema,
  proposedByUserId: idSchema,
  decidedByUserId: idSchema.optional(),
  decidedAt: asOf.optional(),
  request: z
    .strictObject({
      id: idSchema,
      state: z.enum(['Awaiting approval', 'Approved', 'Rejected', 'Superseded', 'Withdrawn']),
    })
    .optional(),
};

/** The layout versions with their mapping versions, proposed and confirmed (6.1, 6.2, 6.4; 14). */
export const importLayoutListSchema = z.strictObject({
  asOf,
  layouts: z.array(
    z.strictObject({
      layoutId: idSchema,
      layoutVersionId: idSchema,
      layoutCode: z.string(),
      source: z.string(),
      documentType: z.string(),
      kinds: z.array(importKindSchema),
      version: z.number().int().positive(),
      ...proposalFacts,
      structure: layoutStructureSchema,
      mappings: z.array(
        z.strictObject({
          mappingId: idSchema,
          mappingVersionId: idSchema,
          mappingCode: z.string(),
          target: z.string(),
          version: z.number().int().positive(),
          ...proposalFacts,
          fields: mappingFieldsSchema,
        }),
      ),
    }),
  ),
});
export type ImportLayoutList = z.infer<typeof importLayoutListSchema>;

/**
 * Propose a layout version (6.1, 6.4): a new layout with its first version, or a next version of a layout. It changes
 * no record until a different person confirms it.
 */
export const layoutProposalSchema = z.strictObject({
  layout: z.union([
    z.strictObject({ layoutId: idSchema }),
    z.strictObject({
      code: z.string().regex(/\S/).max(60),
      source: z.string().regex(/\S/).max(120),
      documentType: z.string().regex(/\S/).max(60),
      kinds: z.array(importKindSchema).min(1),
    }),
  ]),
  structure: layoutStructureSchema,
});
export type LayoutProposal = z.infer<typeof layoutProposalSchema>;
export const layoutProposedSchema = z.strictObject({
  layoutId: idSchema,
  layoutVersionId: idSchema,
  version: z.number().int().positive(),
  requestId: idSchema,
});

/** Propose a mapping version (6.2, 6.4): a new mapping of one layout version and target, or a next version of one. */
export const mappingProposalSchema = z.strictObject({
  mapping: z.union([
    z.strictObject({ mappingId: idSchema }),
    z.strictObject({
      code: z.string().regex(/\S/).max(60),
      layoutVersionId: idSchema,
      target: z.string().min(1).max(60),
    }),
  ]),
  fields: mappingFieldsSchema,
});
export type MappingProposal = z.infer<typeof mappingProposalSchema>;
export const mappingProposedSchema = z.strictObject({
  mappingId: idSchema,
  mappingVersionId: idSchema,
  version: z.number().int().positive(),
  requestId: idSchema,
});

/** A mapping rule's scope (6.3): a layout, a supplier, a brand, or the whole Organisation. */
export const mappingRuleScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('organisation') }),
  z.strictObject({ kind: z.enum(['layout', 'supplier', 'brand']), id: idSchema }),
]);
export type MappingRuleScope = z.infer<typeof mappingRuleScopeSchema>;

/**
 * Propose a mapping rule version (6.3, 6.4): one source word of one attribute (`<target>.<field>`) in one scope to one
 * target value, from its first day to the day after its last, absent while open-ended.
 */
export const mappingRuleProposalSchema = z
  .strictObject({
    attribute: z.string().regex(/^[a-z0-9.-]+\.[A-Za-z0-9]+$/),
    scope: mappingRuleScopeSchema,
    word: z.string().regex(/\S/).max(200),
    caseSensitive: z.boolean(),
    target: z.string().regex(/\S/).max(200),
    validFrom: businessDateSchema,
    validTo: businessDateSchema.optional(),
  })
  .refine((value) => value.validTo === undefined || value.validTo > value.validFrom, {
    message: 'A rule ends after it starts',
    path: ['validTo'],
  });
export type MappingRuleProposal = z.infer<typeof mappingRuleProposalSchema>;
export const mappingRuleProposedSchema = z.strictObject({
  ruleId: idSchema,
  ruleVersionId: idSchema,
  requestId: idSchema,
});

/** The mapping rules with their versions, proposers and confirmers (14 "Layouts and mapping rules in force"). */
export const mappingRuleListSchema = z.strictObject({
  asOf,
  rules: z.array(
    z.strictObject({
      ruleId: idSchema,
      attribute: z.string(),
      scope: mappingRuleScopeSchema,
      word: z.string(),
      caseSensitive: z.boolean(),
      versions: z.array(
        z.strictObject({
          ruleVersionId: idSchema,
          target: z.string(),
          validFrom: businessDateSchema,
          validTo: businessDateSchema.optional(),
          inForce: z.boolean(),
          ...proposalFacts,
        }),
      ),
    }),
  ),
});
export type MappingRuleList = z.infer<typeof mappingRuleListSchema>;

/** Detect a layout (6.5): the stored file and the receipt it was handed in under, with a source hint where known. */
export const detectLayoutQuerySchema = z.strictObject({
  fileReceiptId: idSchema,
  hint: z.string().max(120).optional(),
});

/**
 * What detection found (6.5; PRD-IMP-004): the compatible versions, those the hint matches first; the one proposed
 * when exactly one is left; and each incompatible version with what it misses. A hint never selects an incompatible
 * version. With none compatible, the preparer proposes a new version.
 */
export const layoutDetectionSchema = z.strictObject({
  asOf,
  compatible: z.array(
    z.strictObject({
      layoutVersionId: idSchema,
      layoutCode: z.string(),
      version: z.number().int().positive(),
      state: importVersionStateSchema,
      matchesHint: z.boolean(),
    }),
  ),
  proposed: idSchema.optional(),
  incompatible: z.array(
    z.strictObject({
      layoutVersionId: idSchema,
      layoutCode: z.string(),
      version: z.number().int().positive(),
      missing: z.array(missingItemSchema),
    }),
  ),
  /**
   * Each sheet's name and the text of its first row, which a preparer proposing a new version reads as the header
   * (6.1): structure the uploader handed in, never a value the layout keeps.
   */
  sheets: z.array(z.strictObject({ name: z.string(), firstRow: z.array(z.string()) })),
});
export type LayoutDetection = z.infer<typeof layoutDetectionSchema>;

/** A batch's scope facts (15.1): a fact left out is Unknown, covered only by all-members scope (PRD-MOD-015). */
export const importScopeSchema = z.strictObject({
  legalEntityId: idSchema.optional(),
  siteId: idSchema.optional(),
  storeId: idSchema.optional(),
  businessUnitId: idSchema.optional(),
});

/**
 * Start an import (13.1): the stored file and the receipt it was handed in under, the kind, the target, the layout
 * and mapping versions, the scope facts, and the supplier or brand the file comes from, whose mapping rules apply
 * (6.3).
 */
export const startImportRequestSchema = z.strictObject({
  storedFileId: idSchema,
  fileReceiptId: idSchema,
  kind: importKindSchema,
  target: z.string().min(1).max(60),
  layoutVersionId: idSchema,
  mappingVersionId: idSchema,
  scope: importScopeSchema.optional(),
  source: z.strictObject({ supplierId: idSchema.optional(), brandId: idSchema.optional() }).optional(),
});
export type StartImportRequest = z.infer<typeof startImportRequestSchema>;

export const importStartedSchema = z.strictObject({
  batchId: idSchema,
  code: z.string(),
  state: importBatchStateSchema,
  documentCount: z.number().int().nonnegative(),
  rowCount: z.number().int().nonnegative(),
});

const cellTypeSchema = z.enum(['text', 'number', 'date', 'boolean', 'error', 'empty']);
const rawSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * An original cell, as the reader read it (9.1). A cell of a class the reader is not granted is masked: its raw value
 * null and its text empty (section 11).
 */
export const gridCellSchema = z.strictObject({
  column: z.number().int().positive(),
  ref: z.string(),
  type: cellTypeSchema,
  raw: rawSchema,
  text: z.string(),
  masked: fieldClassSchema.optional(),
});

/** Where a Supplied value came from (section 5). */
export const suppliedOriginSchema = z.strictObject({
  sheet: z.string(),
  row: z.number().int().positive(),
  column: z.string(),
  ref: z.string(),
  raw: rawSchema,
  cellType: cellTypeSchema,
  text: z.string(),
});
export type SuppliedOriginView = z.infer<typeof suppliedOriginSchema>;

/** A named calculation as a Calculated value keeps it: the function, its version and its inputs (section 5). */
export const calculationOriginSchema = z.strictObject({
  name: z.enum(['join', 'sum']),
  version: z.literal(1),
  inputs: z.array(suppliedOriginSchema),
});

/** Why a value is Unknown, where a cell was there to read (8.3: A-11, C-1, C-2, J-1; 6.3). */
export const unknownBecauseSchema = z.enum([
  'not-read',
  'error-cell',
  'not-a-number',
  'finer-than-paise',
  'ambiguous-rules',
  'input-unknown',
]);

/** A suggestion a person may accept (section 5; PRD-IMP-009): an exact or close match from the handler's records. */
export const valueSuggestionSchema = z.strictObject({
  kind: z.enum(['exact', 'close']),
  value: z.string(),
  label: z.string().optional(),
});
export type ValueSuggestion = z.infer<typeof valueSuggestionSchema>;

const fileStagedValues = [
  z.strictObject({
    kind: z.literal('unknown'),
    because: unknownBecauseSchema.optional(),
    origin: suppliedOriginSchema.optional(),
    /** The confirmed rules that disagree, for an ambiguous word (6.3). */
    rules: z.array(idSchema).optional(),
  }),
  z.strictObject({
    kind: z.literal('supplied'),
    value: z.string(),
    origin: suppliedOriginSchema,
    /** A calculation kept beside it, which never replaces it: its value, or null when Unknown (section 5). */
    calculated: z.strictObject({ value: z.string().nullable(), calculation: calculationOriginSchema }).optional(),
  }),
  z.strictObject({ kind: z.literal('calculated'), value: z.string(), calculation: calculationOriginSchema }),
  z.strictObject({
    kind: z.literal('mapped'),
    value: z.string(),
    /** The original word, always kept beside the value (6.3). */
    word: z.string(),
    origin: suppliedOriginSchema,
    rule: z.strictObject({ ruleId: idSchema, ruleVersionId: idSchema }),
  }),
] as const;

/** A value as staged from the file: Unknown, Supplied, Calculated or Mapped (section 5). */
export const fileStagedValueSchema = z.discriminatedUnion('kind', [...fileStagedValues]);
export type FileStagedValue = z.infer<typeof fileStagedValueSchema>;
export type CalculationOrigin = z.infer<typeof calculationOriginSchema>;
export type UnknownBecause = z.infer<typeof unknownBecauseSchema>;

/**
 * A staged value as its reader is served it (section 5; PRD-IMP-006): from the file, Entered by a person (with who,
 * when, the reason, the suggestion it came from and the value staged from the file, which stays), or masked where the
 * reader is not granted its class (section 11). Nothing gets a default (6.2; PRD-MOD-015).
 */
export const stagedValueSchema = z.discriminatedUnion('kind', [
  ...fileStagedValues,
  z.strictObject({
    kind: z.literal('entered'),
    value: z.string(),
    entry: z.strictObject({
      entryId: idSchema,
      enteredByUserId: idSchema,
      enteredAt: asOf,
      reason: z.string(),
      suggestion: valueSuggestionSchema.optional(),
    }),
    staged: fileStagedValueSchema,
  }),
  z.strictObject({ kind: z.literal('masked'), fieldClass: fieldClassSchema }),
]);
export type StagedValueView = z.infer<typeof stagedValueSchema>;

export const stagedRowSchema = z.strictObject({
  stagedRowId: idSchema,
  sheet: z.string(),
  rowNumber: z.number().int().positive(),
  role: z.enum(['data', 'header', 'total', 'filler', 'note', 'ignored']),
  hidden: z.boolean(),
  cells: z.array(gridCellSchema),
  values: z.record(z.string(), stagedValueSchema),
});
export type StagedRow = z.infer<typeof stagedRowSchema>;

/** A problem a handler's preview found, with where it is: its code, the field and row, and what it names (13.2). */
export const importIssueSchema = z.strictObject({
  code: z.string(),
  field: z.string().optional(),
  rowNumber: z.number().int().positive().optional(),
  missing: z.array(missingItemSchema).optional(),
});

/** What the target's handler works out a document would create, without writing; or the issues that stop it (13.2). */
export const documentPreviewSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('would-create'),
    records: z.array(z.strictObject({ recordType: z.string(), codes: z.array(z.string()) })),
  }),
  z.strictObject({ kind: z.literal('issues'), issues: z.array(importIssueSchema).min(1) }),
]);
export type DocumentPreview = z.infer<typeof documentPreviewSchema>;

/**
 * The classes of a row issue (8.2, 8.3): the 60 problem classes of 8.3, `A-1` to `L-n`, and the import classes that
 * stand beside them (8 "As built"; 7.4 "As built"). One list for the request that marks a class seen, the validation
 * report and the database's check of `files_imports.row_issue`, which a test compares with it.
 */
export const IMPORT_ISSUE_CLASSES = [
  'handler',
  'required',
  'rule',
  'calculation',
  'duplicate',
  'conflict',
  'revision',
] as const;
export type ImportIssueClass = (typeof IMPORT_ISSUE_CLASSES)[number];
/** A problem class of 8.3, `A-1` to `L-n`, or an import class. */
export const ISSUE_CLASS_PATTERN = `^(?:[A-L]-[0-9]+|${IMPORT_ISSUE_CLASSES.join('|')})$`;
export const issueClassSchema = z.string().regex(new RegExp(ISSUE_CLASS_PATTERN));
export type IssueClass =
  `${'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L'}-${number}` | ImportIssueClass;

/** A row issue's severity (8.2). */
export const issueSeveritySchema = z.enum(['Blocking', 'Warning', 'Note']);
export type IssueSeverity = z.infer<typeof issueSeveritySchema>;

/**
 * A row issue of the validation report (8.2; PRD-IMP-007): its class (8.3), severity, place, the original value (or
 * masked, section 11), what is wrong, the correction needed, the rule applied, and, for a Warning, who marked it seen.
 */
export const rowIssueSchema = z.strictObject({
  issueId: idSchema,
  class: z.string(),
  severity: issueSeveritySchema,
  code: z.string(),
  correction: z.string(),
  rule: z.string(),
  documentId: idSchema.optional(),
  stagedRowId: idSchema.optional(),
  sheet: z.string().optional(),
  rowNumber: z.number().int().positive().optional(),
  column: z.string().optional(),
  field: z.string().optional(),
  original: z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('value'), text: z.string() }),
      z.strictObject({ kind: z.literal('masked'), fieldClass: fieldClassSchema }),
    ])
    .optional(),
  missing: z.array(missingItemSchema),
  seen: z.strictObject({ byUserId: idSchema, at: asOf }).optional(),
});
export type RowIssue = z.infer<typeof rowIssueSchema>;

/** A control total reported by the file against the sum of its lines (8.1; G-1, K-1). Null is Unknown. */
export const controlTotalSchema = z.strictObject({
  sheet: z.string(),
  rowNumber: z.number().int().positive(),
  column: z.string(),
  reported: z.string().nullable(),
  summed: z.string().nullable(),
  agrees: z.boolean().nullable(),
  /** The class it is masked under for this reader, its values then null (section 11). */
  masked: fieldClassSchema.optional(),
});

/**
 * The validation report (8.1, 8.2): the sheets read and left aside with their row counts, the rows read, ignored and
 * hidden, the issues by document and for the file, the control totals, and the classes masked for this reader. Kept
 * from the last validation of the batch's current version; none until it is validated.
 */
export const validationReportSchema = z.strictObject({
  runAt: asOf,
  batchVersionId: idSchema,
  issues: z.array(rowIssueSchema),
  controlTotals: z.array(controlTotalSchema),
  counts: z.strictObject({
    blocking: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    warningsNotSeen: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
  }),
});
export type ValidationReport = z.infer<typeof validationReportSchema>;

const outcomeCountsSchema = z.strictObject({
  rowsRead: z.number().int().nonnegative(),
  rowsIgnored: z.number().int().nonnegative(),
  rowsAccepted: z.number().int().nonnegative(),
  rowsRejected: z.number().int().nonnegative(),
  rowsPending: z.number().int().nonnegative(),
  rowsDuplicate: z.number().int().nonnegative(),
});

/**
 * What became of one document at an attempt (7.2, 7.4; S1-F06-T04): published, refused by its handler, a conflict, a
 * duplicate, excluded, or not attempted.
 */
export const documentResultSchema = z.enum([
  'published',
  'refused',
  'conflict',
  'duplicate',
  'excluded',
  'not-attempted',
]);
export type DocumentResult = z.infer<typeof documentResultSchema>;

/** The sums of one measure the handler names, by result; null is Unknown (7.4; PRD-MOD-015). */
export const outcomeMeasureSchema = z.strictObject({
  field: z.string(),
  kind: z.enum(['quantity', 'value']),
  accepted: z.string().nullable(),
  rejected: z.string().nullable(),
  pending: z.string().nullable(),
  duplicate: z.string().nullable(),
  /** The class it is masked under for this reader, its sums then null (section 11; PRD-ACS-008). */
  masked: fieldClassSchema.optional(),
});

/** A control total as reported, summed and accepted (7.4; PRD-EBO-004); null is Unknown. */
export const outcomeControlTotalSchema = z.strictObject({
  sheet: z.string(),
  rowNumber: z.number().int().positive(),
  column: z.string(),
  reported: z.string().nullable(),
  summed: z.string().nullable(),
  accepted: z.string().nullable(),
  /** The class it is masked under for this reader, its values then null (section 11; PRD-ACS-008). */
  masked: fieldClassSchema.optional(),
});

/** What one publish attempt did, for the batch and each document, kept for a failure too (7.4). */
export const importOutcomeSchema = z.strictObject({
  outcomeId: idSchema,
  result: z.enum(['published', 'failed']),
  refusalCode: z.string().optional(),
  attemptedAt: asOf,
  attemptedByUserId: idSchema,
  /** The batch version attempted; absent for an attempt kept before S1-F06-T04. */
  batchVersionId: idSchema.optional(),
  counts: outcomeCountsSchema,
  measures: z.array(outcomeMeasureSchema),
  controlTotals: z.array(outcomeControlTotalSchema),
  documents: z.array(
    z.strictObject({
      documentId: idSchema,
      result: documentResultSchema,
      records: z.array(z.strictObject({ recordType: z.string(), recordId: idSchema })),
      refusalCode: z.string().optional(),
      /** The published document it duplicates or conflicts with (7.2). */
      publishedDocumentId: idSchema.optional(),
      /** The published document it revised (7.3). */
      revisesDocumentId: idSchema.optional(),
      rows: z.number().int().nonnegative().optional(),
    }),
  ),
});
export type ImportOutcome = z.infer<typeof importOutcomeSchema>;

/**
 * A document against the published document of its source identity (7.2, 7.3): a duplicate, which has no effect; a
 * conflict, refused unless imported as a governed revision; or a governed revision of it.
 */
export const documentIdentitySchema = z.strictObject({
  kind: z.enum(['duplicate', 'conflict', 'revision']),
  publishedDocumentId: idSchema,
});

/** A sheet the reader found (8.1; A-7, A-8): imported, or listed with its row count. */
export const importSheetSchema = z.strictObject({
  name: z.string(),
  position: z.number().int().positive(),
  state: z.enum(['visible', 'hidden', 'very-hidden']),
  rows: z.number().int().nonnegative(),
  imported: z.boolean(),
});

/** The review a handler requires (3.1 step 8; 13.2): the preparer's submission, or an approval in `access`. */
export const importReviewSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('submission') }),
  z.strictObject({
    kind: z.literal('approval'),
    actionType: z.string(),
    /** The record type whose approve permission decides it (13.2; product owner, 12 Oct 2026). */
    recordType: z.string(),
    requestId: idSchema.optional(),
  }),
]);

/**
 * A batch as its reader is served it: the batch with its version and submission, its documents with their staged
 * rows and preview, the validation report, and its outcomes. Values and cells of a class the reader is not granted are
 * masked; while the layout version is not Confirmed every column counts as holding every class (section 11).
 */
export const importBatchReadSchema = z.strictObject({
  asOf,
  batch: z.strictObject({
    batchId: idSchema,
    code: z.string(),
    kind: importKindSchema,
    target: z.string(),
    state: importBatchStateSchema,
    /** The batch version: a new one each time a value is entered or a document excluded or put back (3.2). */
    versionId: idSchema,
    submittedVersionId: idSchema.optional(),
    review: importReviewSchema,
    storedFileId: idSchema,
    /** The attachment through which the file is read (section 11). */
    attachmentId: idSchema,
    layoutVersionId: idSchema,
    layoutState: importVersionStateSchema,
    mappingVersionId: idSchema,
    mappingState: importVersionStateSchema,
    /** The classes the file is held to carry: every class while its layout version is not Confirmed (section 11). */
    restrictedClasses: z.array(fieldClassSchema),
    /** The classes masked for this reader (section 11; 8.1 "the fields masked or left out"). */
    maskedClasses: z.array(fieldClassSchema),
    startedByUserId: idSchema,
    startedAt: asOf,
    sheets: z.array(importSheetSchema),
    /** What the reader noted it could not read (9.1, A-11). */
    readerNotes: z.array(z.strictObject({ sheet: z.string(), ref: z.string().optional(), note: z.string() })),
  }),
  documents: z.array(
    z.strictObject({
      documentId: idSchema,
      /** The document reference; empty, with the class, where the reader is not granted its column's class. */
      reference: z.string(),
      referenceMasked: fieldClassSchema.optional(),
      state: z.enum(['Staged', 'Published']),
      excluded: z.boolean(),
      rows: z.array(stagedRowSchema),
      /** The handler's preview, worked out at reading while the document is Staged and not excluded. */
      preview: documentPreviewSchema.optional(),
      /** What a Staged document is against the published document of its source identity (7.2; S1-F06-T04). */
      identity: documentIdentitySchema.optional(),
      /** The published document it revised, once published as a governed revision (7.3). */
      revisesDocumentId: idSchema.optional(),
    }),
  ),
  ignoredRows: z.array(stagedRowSchema),
  report: validationReportSchema.optional(),
  outcomes: z.array(importOutcomeSchema),
});
export type ImportBatchRead = z.infer<typeof importBatchReadSchema>;

/** Validate's answer: Validated when no Blocking issue is found, else still Staged (3.2). */
export const importValidatedSchema = z.strictObject({ batchId: idSchema, state: importBatchStateSchema });

/** A batch step's answer: the state and version it left the batch in (3.2). */
export const importBatchChangedSchema = z.strictObject({
  batchId: idSchema,
  state: importBatchStateSchema,
  versionId: idSchema,
});

/**
 * Enter a value in a staged row (section 5 "Entered by a person"; PRD-IMP-009): the field, the value, the reason, and
 * the suggestion it came from, if any. An AI suggestion is unavailable while the AI gateway's capability is off
 * (DEC-105).
 */
export const stagedValueEntryRequestSchema = z.strictObject({
  /** The batch version the screen read (code-house-rules 12.7). */
  versionId: idSchema,
  field: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,59}$/),
  value: z.string().regex(/\S/).max(500),
  reason: z.string().regex(/\S/).max(500),
  suggestion: z
    .discriminatedUnion('kind', [valueSuggestionSchema, z.strictObject({ kind: z.literal('ai') })])
    .optional(),
});
export const stagedValueEnteredSchema = importBatchChangedSchema.extend({ entryId: idSchema });

/** The suggestions for one field of one staged row (section 5): exact or close matches, for a person to accept. */
export const valueSuggestionsQuerySchema = z.strictObject({ field: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,59}$/) });
export const valueSuggestionsSchema = z.strictObject({ asOf, suggestions: z.array(valueSuggestionSchema) });

/** Exclude a document from publishing, or put it back (3.2), with the batch version the screen read (12.7). */
export const documentExclusionRequestSchema = z.strictObject({ versionId: idSchema, excluded: z.boolean() });

/**
 * Mark Warnings seen (8.2): those named, or every Warning of one class, of the batch's current report, with the batch
 * version the screen read (code-house-rules 12.7).
 */
export const issuesSeenRequestSchema = z.union([
  z.strictObject({ versionId: idSchema, issueIds: z.array(idSchema).min(1).max(500) }),
  z.strictObject({ versionId: idSchema, class: issueClassSchema }),
]);
export const issuesSeenSchema = z.strictObject({ batchId: idSchema, marked: z.number().int().nonnegative() });

/** Submit for review: the batch version the screen read, the one submitted (13.1; code-house-rules 12.7). */
export const submitImportRequestSchema = z.strictObject({ versionId: idSchema });

/** Submit for review's answer (13.1): the version submitted, and the approval request where one is required. */
export const importSubmittedSchema = z.strictObject({
  batchId: idSchema,
  state: importBatchStateSchema,
  submittedVersionId: idSchema,
  requestId: idSchema.optional(),
});

/**
 * Publish: the batch version the screen read (code-house-rules 12.7), and the approval decision where its handler
 * requires one (3.1 step 9; 13.1).
 */
export const publishImportRequestSchema = z.strictObject({
  versionId: idSchema,
  approvalDecisionId: idSchema.optional(),
});

/**
 * Publish's answer (3.2, 7.4; S1-F06-T04): the outcome it wrote, published when every document chosen posted or is a
 * duplicate, and the batch Published; failed when a document was refused or conflicts, the others published and the
 * batch still Validated; and what became of each document.
 */
export const importPublishedSchema = z.strictObject({
  batchId: idSchema,
  state: importBatchStateSchema,
  outcomeId: idSchema,
  result: z.enum(['published', 'failed']),
  documents: z.array(
    z.strictObject({ documentId: idSchema, result: documentResultSchema, refusalCode: z.string().optional() }),
  ),
});

/** Withdraw (3.2, 13.1; S1-F06-T04): the batch version the screen read; the batch becomes Failed. */
export const withdrawImportRequestSchema = z.strictObject({ versionId: idSchema });

/**
 * The import outcomes report's filters (14; S1-F06-T04): a Store, a kind, a state, and the dates the batches were
 * started on, from and to, both included, in the Organisation's timezone.
 */
export const importOutcomesQuerySchema = z.strictObject({
  storeId: idSchema.optional(),
  kind: importKindSchema.optional(),
  state: importBatchStateSchema.optional(),
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
});
export type ImportOutcomesQuery = z.infer<typeof importOutcomesQuerySchema>;

/**
 * The import outcomes report (14; PRD-IMP-013, PRD-MOD-003, PRD-EXC-010, PRD-EXC-011, PRD-SEC-005; S1-F06-T04): each
 * batch the reader may see, newest first, with its kind, target, scope, layout and mapping versions, who started it
 * and when, its state, its last attempt's counts, quantities, values and control totals, and each document with what
 * became of it; drilled to through the batch, which holds its rows, issues and stored file. Its as-of time. A document
 * reference of a class the reader is not granted is masked (section 11).
 */
export const importOutcomesSchema = z.strictObject({
  asOf,
  batches: z.array(
    z.strictObject({
      batchId: idSchema,
      code: z.string(),
      kind: importKindSchema,
      target: z.string(),
      state: importBatchStateSchema,
      legalEntityId: idSchema.optional(),
      siteId: idSchema.optional(),
      storeId: idSchema.optional(),
      businessUnitId: idSchema.optional(),
      layout: z.strictObject({ layoutVersionId: idSchema, code: z.string(), version: z.number().int().positive() }),
      mapping: z.strictObject({ mappingVersionId: idSchema, code: z.string(), version: z.number().int().positive() }),
      startedByUserId: idSchema,
      startedAt: asOf,
      /** The rows the reader read from the imported sheet (8.1). */
      rowsRead: z.number().int().nonnegative(),
      attempts: z.number().int().nonnegative(),
      lastOutcome: importOutcomeSchema.optional(),
      documents: z.array(
        z.strictObject({
          documentId: idSchema,
          reference: z.string(),
          referenceMasked: fieldClassSchema.optional(),
          state: z.enum(['Staged', 'Published']),
          excluded: z.boolean(),
          rows: z.number().int().nonnegative(),
          revisesDocumentId: idSchema.optional(),
          replacedByDocumentId: idSchema.optional(),
        }),
      ),
    }),
  ),
});
export type ImportOutcomes = z.infer<typeof importOutcomesSchema>;

/** The record type of a comparison run (2, 10.3, 15.1; S1-F13-T01): its two sides' places are its scope facts. */
export const COMPARISON_RUN_TYPE = 'files_imports.comparison_run';
/** The stock module's balances, on which a run with a count side needs view at the unit (10.3; stock-ledger 13.6). */
export const STOCK_BALANCE_TYPE = 'stock.balance';
/** The most runs one page of the comparison runs read holds (14). */
export const COMPARISON_RUN_PAGE = 50;

/**
 * The comparison runs of 10.3 (PRD-LIF-027, POL-14.07): the manifest, and the count, against the earlier POS's last
 * SOH by barcode, then SKU; the count against the manifest by SKU and location. The run kind names its key. With
 * S1-F13-T02, the run of 10.4 (POL-14.03): an opening batch of dues, advances or deposits against the closed-books
 * balances, per party and per account.
 */
export const comparisonRunKindSchema = z.enum([
  'manifest-against-soh',
  'count-against-manifest',
  'count-against-soh',
  'balances-against-closed-books',
]);
export type ComparisonRunKind = z.infer<typeof comparisonRunKindSchema>;
export const comparisonKeySchema = z.enum(['barcode-then-sku', 'sku-and-location', 'party-and-account']);
export type ComparisonKeyName = z.infer<typeof comparisonKeySchema>;

/** A batch side: the batch, at the version it has when the run reads it. */
const comparedBatchSchema = z.strictObject({ batchId: idSchema });
/** A count side (10.3): the unit at its Site, read from the stock ledger's read model as of the run. */
const comparedCountSchema = z.strictObject({ siteId: idSchema, businessUnitId: idSchema });

/** Run a comparison (13.1): two sets; the run kind names the key. Neither set is changed. */
export const runComparisonRequestSchema = z.discriminatedUnion('run', [
  z.strictObject({
    run: z.literal('manifest-against-soh'),
    manifest: comparedBatchSchema,
    stockOnHand: comparedBatchSchema,
  }),
  z.strictObject({
    run: z.literal('count-against-manifest'),
    count: comparedCountSchema,
    manifest: comparedBatchSchema,
  }),
  z.strictObject({ run: z.literal('count-against-soh'), count: comparedCountSchema, stockOnHand: comparedBatchSchema }),
  z.strictObject({
    run: z.literal('balances-against-closed-books'),
    balances: comparedBatchSchema,
    closedBooks: comparedBatchSchema,
  }),
]);
export type RunComparisonRequest = z.infer<typeof runComparisonRequestSchema>;

/** One side of a run as the run keeps it (10.3): a batch at its version, or a count read as of a time. */
export const comparisonSideSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('batch'),
    set: z.enum(['manifest', 'stock-on-hand', 'opening-balances', 'closed-books']),
    batchId: idSchema,
    /** The batch's code; left out where the reader may not see the batch, which the screen says. */
    batchCode: z.string().optional(),
    batchVersionId: idSchema,
  }),
  z.strictObject({
    kind: z.literal('count'),
    set: z.literal('count'),
    siteId: idSchema,
    businessUnitId: idSchema,
    asOf,
  }),
]);
export type ComparisonSide = z.infer<typeof comparisonSideSchema>;

/** One side's quantity of a key: listed, listed with an Unknown quantity, or not listed, never zero (I-1). */
export const sideQuantitySchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('listed'), quantity: z.number().int() }),
  z.strictObject({ state: z.literal('unknown') }),
  z.strictObject({ state: z.literal('not-listed') }),
]);

export const comparisonResultSchema = z.enum([
  'same',
  'different',
  'not-listed-left',
  'not-listed-right',
  'unknown',
  'unresolved',
]);
export type ComparisonResultName = z.infer<typeof comparisonResultSchema>;

/** One line of a run: a key either side holds, with both sides' quantities and the rows they came from. */
export const comparisonLineSchema = z.strictObject({
  lineNumber: z.number().int().positive(),
  keyedBy: z.enum(['barcode', 'sku', 'sku-and-location', 'unresolved']),
  barcode: z.string().optional(),
  skuId: idSchema.optional(),
  locationId: idSchema.optional(),
  left: sideQuantitySchema,
  right: sideQuantitySchema,
  result: comparisonResultSchema,
  leftRows: z.array(z.string()),
  rightRows: z.array(z.string()),
});
export type ComparisonLine = z.infer<typeof comparisonLineSchema>;

/** One side's total of a balance line in paise: listed, listed with an Unknown amount, or not listed, never zero. */
export const sideAmountSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('listed'), paise: z.number().int().refine(Number.isSafeInteger) }),
  z.strictObject({ state: z.literal('unknown') }),
  z.strictObject({ state: z.literal('not-listed') }),
]);

/**
 * One line of a run of opening balances against the closed books (10.4; S1-F13-T02): a party of a book and account,
 * or an account's total, with both sides' totals in paise (PRD-MOD-014) and the rows they came from.
 */
export const comparisonBalanceLineSchema = z.strictObject({
  lineNumber: z.number().int().positive(),
  keyedBy: z.enum(['party', 'account', 'unresolved']),
  accountingBookId: idSchema.optional(),
  account: z.string().optional(),
  party: z.string().optional(),
  left: sideAmountSchema,
  right: sideAmountSchema,
  result: comparisonResultSchema,
  leftRows: z.array(z.string()),
  rightRows: z.array(z.string()),
});
export type ComparisonBalanceLine = z.infer<typeof comparisonBalanceLineSchema>;

/** A run's lines counted by result. */
export const comparisonCountsSchema = z.strictObject({
  same: z.number().int().nonnegative(),
  different: z.number().int().nonnegative(),
  'not-listed-left': z.number().int().nonnegative(),
  'not-listed-right': z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(),
});
export type ComparisonCounts = z.infer<typeof comparisonCountsSchema>;

const comparisonRunFields = {
  runId: idSchema,
  run: comparisonRunKindSchema,
  key: comparisonKeySchema,
  left: comparisonSideSchema,
  right: comparisonSideSchema,
  runByUserId: idSchema,
  runAt: asOf,
  counts: comparisonCountsSchema,
};

/** A comparison run as its reader sees it (14): both sides, the key, who ran it and when, and every line. */
export const comparisonRunReadSchema = z.strictObject({
  asOf,
  ...comparisonRunFields,
  lines: z.array(comparisonLineSchema),
  /** The lines of a run of opening balances against the closed books; none for a stock run (S1-F13-T02). */
  balanceLines: z.array(comparisonBalanceLineSchema),
});
export type ComparisonRunRead = z.infer<typeof comparisonRunReadSchema>;

/** One page of the comparison runs read (14): after the run named, newest first. */
export const comparisonRunListQuerySchema = z.strictObject({ after: idSchema.optional() });
export type ComparisonRunListQuery = z.infer<typeof comparisonRunListQuerySchema>;

/**
 * The runs the reader may see, newest first, with their counts (14), at most `COMPARISON_RUN_PAGE` of them; `next` names
 * the last run of a full page, from which the next page reads, or is null.
 */
export const comparisonRunListSchema = z.strictObject({
  asOf,
  runs: z.array(z.strictObject(comparisonRunFields)),
  next: idSchema.nullable(),
});
export type ComparisonRunList = z.infer<typeof comparisonRunListSchema>;

export const comparisonRunStartedSchema = z.strictObject({ runId: idSchema, counts: comparisonCountsSchema });
