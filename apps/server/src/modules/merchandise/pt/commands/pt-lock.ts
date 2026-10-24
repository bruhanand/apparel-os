import { lockTable, type LockTarget } from '../../../../kernel/index.js';

/**
 * The PT's identity row as a lock target (goods-in 5.8; code-house-rules 8.2): every submit and withdrawal of it, and
 * its revisions' decisions, lock it exclusively at step 1.
 */
export const ptLock = (ptId: string): LockTarget => ({
  table: lockTable('merchandise', 'pt'),
  id: ptId,
  mode: 'exclusive',
});
