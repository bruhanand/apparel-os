import {
  fieldClassSchema,
  normalisedName,
  type FieldClass,
  type ImportOutcome,
  type LayoutStructure,
  type MappingFields,
  type RowIssue,
  type StagedRow,
} from '@apparel-os/schemas';

// Masking a batch for its reader (imports-and-opening-data 11, 8.1; access-and-approvals 6; PRD-ACS-008, PRD-SEC-005;
// S1-F06-T03). In a preview, a validation report or a staged row, a value of a class the reader's assignment does not
// grant is masked: the reader knows it is there, never what it is. A column holds the class its layout version
// declares once that version is Confirmed; while it is not, every column counts as holding every class, so a reader
// without every class sees every cell and value masked. Pure: no database.

export type MaskPlan =
  | { readonly kind: 'none' }
  | { readonly kind: 'all'; readonly fieldClass: FieldClass }
  | {
      readonly kind: 'columns';
      /** The masked class of each column, by its number in the sheet. */
      readonly columns: ReadonlyMap<number, FieldClass>;
      /** The masked class of each field, from the columns it is read from. */
      readonly fields: ReadonlyMap<string, FieldClass>;
      /** The masked classes, by column name. */
      readonly names: ReadonlyMap<string, FieldClass>;
    };

/**
 * What to mask for a reader granted only some classes: nothing when no class is masked; everything while the layout
 * version is not Confirmed; otherwise the columns of the masked classes, and the fields read from them.
 */
export function maskPlan(input: {
  readonly layoutConfirmed: boolean;
  readonly masked: readonly FieldClass[];
  readonly layout: LayoutStructure;
  readonly mapping: MappingFields;
  /** The header row's cells, to find each column's number. */
  readonly header: readonly { readonly column: number; readonly text: string }[];
}): MaskPlan {
  if (input.masked.length === 0) return { kind: 'none' };
  const [first] = [...input.masked].sort(
    (a, b) => fieldClassSchema.options.indexOf(a) - fieldClassSchema.options.indexOf(b),
  );
  if (!input.layoutConfirmed && first !== undefined) return { kind: 'all', fieldClass: first };
  const masked = new Set(input.masked);
  const names = new Map<string, FieldClass>();
  for (const column of input.layout.columns) {
    if (column.restrictedClass !== undefined && masked.has(column.restrictedClass)) {
      names.set(normalisedName(column.name), column.restrictedClass);
    }
  }
  const columns = new Map<number, FieldClass>();
  for (const cell of input.header) {
    const fieldClass = names.get(normalisedName(cell.text));
    if (fieldClass !== undefined) columns.set(cell.column, fieldClass);
  }
  const fields = new Map<string, FieldClass>();
  for (const [field, source] of Object.entries(input.mapping.fields)) {
    // Every column the field is read from: its own, the columns of its calculation, and those of a calculation kept
    // beside a supplied value, so a value worked out from a masked column is masked too (section 5; PRD-ACS-008).
    const read =
      'calculation' in source ? source.calculation.columns : [source.column, ...(source.alsoCalculated?.columns ?? [])];
    const fieldClass = read.map((name) => names.get(normalisedName(name))).find((each) => each !== undefined);
    if (fieldClass !== undefined) fields.set(field, fieldClass);
  }
  return { kind: 'columns', columns, fields, names };
}

/**
 * The masked class of a field, from the columns it is read from, or undefined when the reader may see it (section 11).
 */
export function maskedField(plan: MaskPlan, field: string): FieldClass | undefined {
  if (plan.kind === 'none') return undefined;
  if (plan.kind === 'all') return plan.fieldClass;
  return plan.fields.get(field);
}

/** The class a column's value is masked under, by its name, or undefined when the reader may see it. */
export function maskedColumn(plan: MaskPlan, name: string | undefined): FieldClass | undefined {
  if (plan.kind === 'none') return undefined;
  if (plan.kind === 'all') return plan.fieldClass;
  return name === undefined ? undefined : plan.names.get(normalisedName(name));
}

/** A staged row as its reader is served it: every cell and value of a masked class masked. */
export function maskRow(row: StagedRow, plan: MaskPlan): StagedRow {
  if (plan.kind === 'none') return row;
  const classOfColumn = (column: number) => (plan.kind === 'all' ? plan.fieldClass : plan.columns.get(column));
  const classOfField = (field: string) => (plan.kind === 'all' ? plan.fieldClass : plan.fields.get(field));
  return {
    ...row,
    cells: row.cells.map((cell) => {
      const fieldClass = classOfColumn(cell.column);
      return fieldClass === undefined || cell.type === 'empty'
        ? cell
        : { column: cell.column, ref: cell.ref, type: cell.type, raw: null, text: '', masked: fieldClass };
    }),
    values: Object.fromEntries(
      Object.entries(row.values).map(([field, value]) => {
        const fieldClass = classOfField(field);
        return [field, fieldClass === undefined ? value : { kind: 'masked' as const, fieldClass }];
      }),
    ),
  };
}

/**
 * The original value of a row issue as its reader is served it (8.1, section 11): masked where the class of the column
 * it comes from is masked for the reader, and every one while the layout version is not Confirmed.
 */
export function maskIssueOriginal(
  original: string | null,
  fieldClass: FieldClass | null,
  plan: MaskPlan,
): RowIssue['original'] {
  if (original === null) return undefined;
  if (plan.kind === 'all') return { kind: 'masked', fieldClass: plan.fieldClass };
  if (plan.kind === 'columns' && fieldClass !== null && [...plan.names.values()].includes(fieldClass)) {
    return { kind: 'masked', fieldClass };
  }
  return { kind: 'value', text: original };
}

/**
 * An outcome as its reader is served it (7.4, 14, section 11; PRD-ACS-008): the control totals of a masked column and
 * the measures of a masked field left out, each naming the class it is masked under, and every one while the layout
 * version is not Confirmed. The counts of rows hold no value of a class and are kept.
 */
export function maskOutcome(outcome: ImportOutcome, plan: MaskPlan): ImportOutcome {
  if (plan.kind === 'none') return outcome;
  return {
    ...outcome,
    controlTotals: outcome.controlTotals.map((total) => {
      const masked = maskedColumn(plan, total.column);
      return masked === undefined ? total : { ...total, reported: null, summed: null, accepted: null, masked };
    }),
    measures: outcome.measures.map((measure) => {
      const masked = maskedField(plan, measure.field);
      return masked === undefined
        ? measure
        : { ...measure, accepted: null, rejected: null, pending: null, duplicate: null, masked };
    }),
  };
}
