import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import { listOf, PT_FIELDS } from '../domain/rows.js';
import { listsOf } from './plan.js';

// The lists the blank PT template carries (goods-in 5.2, section 11 "Template download"; S2-F04-T02): for each field
// of the template with a list, the codes on it today, in the template's order: the brands and categories in force, and
// the approved values of each marked attribute. A list not marked yet refuses the template, naming the setting
// (code-house-rules 12.14). The codes are the Organisation's own; nothing here is a value of the app's.

export async function templateListsOf(
  context: TransactionContext,
  date: string,
): Promise<{ readonly field: string; readonly values: string[] }[] | CommandRefusal> {
  const listed = await listsOf(context, '', date);
  if (listed.kind === 'refused') return listed.refusal;
  const { lists } = listed;
  const sorted = (codes: Iterable<string>) => [...codes].sort();
  return PT_FIELDS.flatMap((field): { field: string; values: string[] }[] => {
    if (field === 'brand') return [{ field, values: sorted(lists.brands.keys()) }];
    if (field === 'subCategory') return [{ field, values: sorted(lists.categories.keys()) }];
    const list = listOf(field);
    return list === undefined ? [] : [{ field, values: sorted(lists.attributes[list].keys()) }];
  });
}
