import type { TransactionContext } from '../../../../kernel/index.js';
import { exists, inForceOn } from '../commands/common.js';

/** Whether the brand exists (structure-and-masters 4.1). */
export function brandExists(context: TransactionContext, brandId: string): Promise<boolean> {
  return exists(context, 'brand', brandId);
}

/** Whether the brand has an approved version in force on the date that does not retire it (2.2, 2.5). */
export function brandInForce(context: TransactionContext, brandId: string, date: string): Promise<boolean> {
  return inForceOn(context, 'brand', brandId, date);
}
