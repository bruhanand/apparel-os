import { normalisedName } from '@apparel-os/schemas';
import type { DetectableVersion } from './detection.js';
import type { Grid } from './grid.js';
import { compatibility } from './staging.js';

// The customer-contact check of the test setup (imports-and-opening-data 3.1 step 1, section 11; DEC-052; DEC-112
// GC6-6; RR-203; S1-F06-T02). On `kdps-test` imports keep no customer name or phone number until KDPS answers
// question 37, and the stored original keeps every column (PRD-IMP-002), so a file with such columns is refused before
// it is stored. Intake finds them in memory with the Confirmed layout versions: each sheet that holds a cell must be
// the sheet of a Confirmed version the file fits (6.5: its required columns, no column the version does not know), and
// no such version may mark a column the sheet holds as customer contact. A sheet no Confirmed version recognises
// cannot be known to hold none, so the file is refused, asking for its layout to be proposed and confirmed first.
// Proposed versions count for nothing: their classes are not yet confirmed by a second person (6.4). Nothing is
// guessed from a column's name, and intake never removes a column itself. Pure: no database.

export type CustomerContactCheck =
  | { readonly kind: 'accepted' }
  | {
      readonly kind: 'refused';
      readonly code: 'files-imports.customer-contact-columns' | 'files-imports.layout-needed-on-test-setup';
      readonly missing: readonly { readonly kind: string; readonly [field: string]: string }[];
    };

export function checkCustomerContact(grid: Grid, versions: readonly DetectableVersion[]): CustomerContactCheck {
  const confirmed = versions.filter((each) => each.state === 'Confirmed');
  const contact: { kind: string; sheet: string; column: string }[] = [];
  const unrecognised: { kind: string; sheet: string }[] = [];
  for (const sheet of grid.sheets) {
    if (!sheet.rows.some((row) => row.cells.some((cell) => cell.type !== 'empty'))) continue;
    const fitting = confirmed.flatMap((version) => {
      if (normalisedName(version.structure.sheet) !== normalisedName(sheet.name)) return [];
      const found = compatibility({ sheets: [sheet], notes: [] }, version.structure);
      return 'kind' in found ? [] : [{ version, columns: found.columns }];
    });
    if (fitting.length === 0) {
      unrecognised.push({ kind: 'unrecognised-sheet', sheet: sheet.name });
      continue;
    }
    for (const { version, columns } of fitting) {
      for (const column of version.structure.columns) {
        const named = normalisedName(column.name);
        const already = contact.some((each) => each.sheet === sheet.name && each.column === column.name);
        if (column.restrictedClass === 'customer-contact' && columns.has(named) && !already) {
          contact.push({ kind: 'customer-contact-column', sheet: sheet.name, column: column.name });
        }
      }
    }
  }
  if (contact.length > 0) return { kind: 'refused', code: 'files-imports.customer-contact-columns', missing: contact };
  if (unrecognised.length > 0) {
    return { kind: 'refused', code: 'files-imports.layout-needed-on-test-setup', missing: unrecognised };
  }
  return { kind: 'accepted' };
}
