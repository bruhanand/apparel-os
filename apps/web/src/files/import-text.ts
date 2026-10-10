import type { RowIssue, StagedValueView } from '@apparel-os/schemas';
import { codeText } from '../components/StandardStates';
import { isMessageId, t } from '../messages/catalogue';

// The words of imports on screen (imports-and-opening-data 5, 8, 16; design-language 10.10; S1-F06-T03): a target
// field's name, where a value came from, an issue's text and the correction it needs. Text comes from the catalogue
// (code-house-rules 12.13); a code the catalogue has no words for is shown as the code.

/** A target field's name as the screen writes it, or the field's code where the catalogue has none. */
export function fieldName(field: string): string {
  const id = `intake.field.${field}`;
  return isMessageId(id) ? t(id) : field;
}

/** A field class's name, as access names it. */
export function className(fieldClass: string): string {
  const id = `field-class.${fieldClass}`;
  return isMessageId(id) ? t(id) : fieldClass;
}

/** The value shown, and where it came from (section 5): Supplied, Calculated, Mapped, Entered, Unknown or masked. */
export function valueLines(value: StagedValueView | undefined): { readonly value: string; readonly origin: string } {
  if (value === undefined) return { value: t('intake.value.unknown'), origin: '' };
  switch (value.kind) {
    case 'supplied':
      return {
        value: value.value,
        origin:
          value.calculated === undefined
            ? t('intake.value.supplied', { ref: value.origin.ref, raw: value.origin.text })
            : t('intake.value.supplied-and-calculated', {
                ref: value.origin.ref,
                raw: value.origin.text,
                calculated: value.calculated.value ?? t('intake.value.unknown'),
              }),
      };
    case 'calculated':
      return {
        value: value.value,
        origin: t('intake.value.calculated', {
          name: value.calculation.name,
          cells: value.calculation.inputs.map((input) => input.ref).join(', '),
        }),
      };
    case 'mapped':
      return { value: value.value, origin: t('intake.value.mapped', { word: value.word, ref: value.origin.ref }) };
    case 'entered':
      return { value: value.value, origin: t('intake.value.entered', { reason: value.entry.reason }) };
    case 'masked':
      return { value: t('intake.value.masked'), origin: className(value.fieldClass) };
    case 'unknown': {
      const why = value.because === undefined ? undefined : `intake.value.because.${value.because}`;
      return {
        value: t('intake.value.unknown'),
        origin: why !== undefined && isMessageId(why) ? t(why, { ref: value.origin?.ref ?? '' }) : '',
      };
    }
  }
}

/** What is wrong, in words: an import check's own text, or a handler's refusal code's (8.2). */
export function issueText(code: string): string {
  const id = `issue.${code}`;
  return isMessageId(id) ? t(id) : codeText(code);
}

/** The correction an issue needs (8.2). */
export function correctionText(code: string): string {
  const id = `correction.${code}`;
  return isMessageId(id) ? t(id) : code;
}

/** Where an issue is: the sheet, row, column and field it names (8.2). */
export function placeText(issue: RowIssue): string {
  const parts = [
    issue.sheet,
    issue.rowNumber === undefined ? undefined : t('intake.place.row', { row: issue.rowNumber }),
    issue.column === undefined ? undefined : t('intake.place.column', { column: issue.column }),
    issue.field === undefined ? undefined : fieldName(issue.field),
  ];
  return parts.filter((part) => part !== undefined).join(' · ');
}
