import { and, eq } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { BookHeldStock } from '../contracts/book-held-stock.js';
import { bookSettingVersion } from '../db/schema.js';
import { changesCostMethod } from '../domain/kinds.js';
import type { CostFormula, CostPoolMode } from '@apparel-os/schemas';

/**
 * The refusal of a cost version that changes the formula or the pool mode of a book that has held stock, until the CA
 * has said how value is divided at the change (books-and-posting 2.2; stock-ledger 7.12, SL-6): asked through the
 * "has this book held stock?" contract, and refused while no implementation answers (DEC-116). Checked when the version
 * is prepared and again under the setting's lock when it is decided. Undefined when the version may go on.
 */
export async function costChangeRefusal(
  context: TransactionContext,
  heldStock: BookHeldStock | undefined,
  setting: { readonly id: string; readonly bookId: string },
  proposed: { readonly formula: CostFormula; readonly poolMode: CostPoolMode },
): Promise<CommandRefusal | undefined> {
  const approved = await context.tx
    .select({ formula: bookSettingVersion.formula, poolMode: bookSettingVersion.poolMode })
    .from(bookSettingVersion)
    .where(and(eq(bookSettingVersion.bookSettingId, setting.id), eq(bookSettingVersion.decision, 'Approved')));
  if (!changesCostMethod(proposed, approved)) return undefined;
  const sl6 = { kind: 'open-question', question: 'SL-6' };
  if (heldStock === undefined) {
    return { kind: 'unavailable', code: 'finance.book-stock-unanswered', missing: [sl6] };
  }
  if (await heldStock.hasHeldStock(context, setting.bookId)) {
    return {
      kind: 'refused',
      code: 'finance.cost-change-after-stock',
      missing: [sl6, { kind: 'record', recordType: 'organisation.accounting_book', recordId: setting.bookId }],
    };
  }
  return undefined;
}
