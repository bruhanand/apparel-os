import { sql } from 'drizzle-orm';
import { declareReadModel, serveReadModel, type TransactionContext } from '../../../../kernel/index.js';

// The names of the parties a report shows, such as a booking's or an Arrival's supplier (goods-in 9.3, 9.5;
// structure-and-masters 5.1; module-map section 3 rule 5; S2-F11-T02), served through the kernel's read-model gateway:
// each party by its identifier, with its code and its legal name in force on the date. The masters are unscoped
// (structure-and-masters 6.1): a reader learns of a party only through the records its own grants show it. One that
// does not exist, or has no version in force on the date, is not answered, so its reader sees it Unknown
// (PRD-MOD-015).

export interface PartyNamesQuery {
  readonly partyIds: readonly string[];
  readonly date: string;
}

export interface PartyName {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export async function partyNames(context: TransactionContext, query: PartyNamesQuery): Promise<readonly PartyName[]> {
  if (query.partyIds.length === 0) return [];
  const rows = await context.tx.execute<{ id: string; code: string; name: string }>(sql`
    select p.id::text as id, p.code, v.legal_name as name
    from merchandise.party p
    join merchandise.party_version v on v.party_id = p.id
    where p.id = any(${sql.param([...new Set(query.partyIds)])}::uuid[]) and v.decision = 'Approved'
      and v.valid_during @> ${query.date}::date
    order by p.id`);
  return rows.rows;
}

/** The read model of party names, declared for the read-model gateway (module-map section 3, rule 5). */
export const PARTY_NAMES = declareReadModel<PartyNamesQuery, readonly PartyName[]>('merchandise.party-names');

/** The parties' read models as they serve them, handed to the gateway by the composition root. */
export const partiesReadModels = [serveReadModel(PARTY_NAMES, partyNames)];
