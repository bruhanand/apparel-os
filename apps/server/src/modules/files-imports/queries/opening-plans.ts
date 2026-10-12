import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { latestRequests } from '../../access/index.js';
import type { ImportHandlers } from '../contracts/import-handlers.js';

// The opening plan read (module-map 4.16; domain-model 3.6; imports-and-opening-data 10.1, 10.2; PRD-LIF-003,
// PRD-LIF-004; DEC-117; S1-F13-T01): whether a unit at its Site has an approved, unpublished opening-stock batch. An
// opening-stock batch is one of the opening-balance kind whose handler fills opening stock; unpublished, it is
// Validated and submitted at its current version; approved, the latest approval request of that version in `access`
// is Approved. Its approval and scope are checked on their own, whatever the reader's scope of batches, and
// independently of activation, so neither waits on the other (DEC-117). It answers yes or no only. Structurally the
// `OpeningPlans` contract `site-lifecycle` defines; the composition root hands it over, so files-imports never
// depends on that module.

export function openingPlansOf(handlers: ImportHandlers): {
  approvedPlanFor(context: TransactionContext, businessUnitId: string, siteId: string): Promise<boolean>;
} {
  return {
    async approvedPlanFor(context, businessUnitId, siteId) {
      const targets = handlers.openingStockTargets();
      if (targets.length === 0) return false;
      const found = await context.tx.execute<{ batch_id: string; version_id: string }>(
        sql`select batch_id, version_id from files_imports.opening_plan_versions(${businessUnitId}, ${siteId}, array[${sql.join(
          targets.map((each) => sql`${each}`),
          sql`, `,
        )}]::text[])`,
      );
      const versions = found.rows.map((row) => row.version_id);
      const requests = await latestRequests(context, versions);
      return versions.some((version) => requests.get(version)?.state === 'Approved');
    },
  };
}
