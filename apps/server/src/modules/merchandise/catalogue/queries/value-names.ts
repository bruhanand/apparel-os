import { sql } from 'drizzle-orm';
import { declareReadModel, serveReadModel, type TransactionContext } from '../../../../kernel/index.js';

// The names of vocabulary values a report shows, such as a booking's season (goods-in 9.3, 9.5; structure-and-masters
// 4.2; module-map section 3 rule 5; S2-F11-T02), served through the kernel's read-model gateway: each value by its
// identifier, with its code and its name in force on the date. The masters are unscoped (structure-and-masters 6.1):
// a reader learns of a value only through the records its own grants show it. One that does not exist, or has no name
// in force on the date, is not answered, so its reader sees it Unknown (PRD-MOD-015).

export interface ValueNamesQuery {
  readonly valueIds: readonly string[];
  readonly date: string;
}

export interface ValueName {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export async function valueNames(context: TransactionContext, query: ValueNamesQuery): Promise<readonly ValueName[]> {
  if (query.valueIds.length === 0) return [];
  const rows = await context.tx.execute<{ id: string; code: string; name: string }>(sql`
    select v.id::text as id, v.code, n.name
    from merchandise.vocabulary_value v
    join merchandise.vocabulary_value_version n on n.vocabulary_value_id = v.id
    where v.id = any(${sql.param([...new Set(query.valueIds)])}::uuid[]) and n.decision = 'Approved'
      and n.valid_during @> ${query.date}::date
    order by v.id`);
  return rows.rows;
}

/** The read model of value names, declared for the read-model gateway (module-map section 3, rule 5). */
export const CATALOGUE_VALUE_NAMES = declareReadModel<ValueNamesQuery, readonly ValueName[]>('merchandise.value-names');

/** The catalogue's read models of the stage 2 reports as it serves them, handed to the gateway by the composition root. */
export const catalogueNameReadModels = [serveReadModel(CATALOGUE_VALUE_NAMES, valueNames)];
