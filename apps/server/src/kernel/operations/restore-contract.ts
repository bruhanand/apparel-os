import { is, sql, type SQL } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import type { Transaction } from '../command-runner/transaction-context.js';

// The restore contract (backup-and-restore 10.1; module-map section 3, rule 6). `kernel` sits at tier 0 and calls no
// module above it, so it defines the contract and keeps the registry; each module that holds records implements it and
// registers its participant at start, as a target module registers an import handler. S1-F14-T02 builds the two parts
// that read: control totals (3.2 step 2, 5.2) and checks (5.1). The after-restore steps and gap checks are S1-F14-T03's.
//
// A participant reads only its own tables, in the transaction context it is given, never in one it opens itself
// (PRD-MOD-006). A reference to another module's record is checked through that module's participant, which answers
// which identifiers it does not hold (PRD-MOD-002): no foreign key crosses schemas (code-house-rules 3.2), so this is
// how a restore proves the links across modules (5.1 "Links across modules").

/**
 * What a participant reads through: the transaction of a backup's snapshot or of a restore check. Only `execute` is
 * used, so a backup's own snapshot transaction (repeatable read, read only, as the migration role) and a command's
 * context both serve.
 */
export interface ParticipantContext {
  readonly organisationCode: string;
  readonly tx: Pick<Transaction, 'execute'>;
}

/** One named control total: a count or a sum, as an exact decimal string (integer paise for money; PRD-MOD-014). */
export interface ControlTotal {
  readonly name: string;
  readonly value: string;
}

/** The control totals of one participant, in its fixed order. */
export interface ParticipantTotals {
  readonly unit: string;
  readonly totals: readonly ControlTotal[];
}

/**
 * One check's result: counts and names only, never record data, a restricted value or a secret (PRD-SEC-014), since
 * it goes into the drill record and the operations view.
 */
export interface CheckResult {
  readonly unit: string;
  readonly check: string;
  readonly passed: boolean;
  /** How many items were checked, where the check counts them. */
  readonly checked: number;
  /** How many failed. */
  readonly failed: number;
}

/**
 * A reference held by type and identifier, as an attachment holds the record it is attached to: the row's type column
 * names a record type, and the participant that answers for that type checks the identifier.
 */
export interface TypedReference {
  readonly table: string;
  readonly typeColumn: string;
  readonly idColumn: string;
}

/**
 * A kind of record other modules refer to, and how: a reference column is `<record>_id` (code-house-rules 3.2), so
 * every column of another module named `suffix`, or ending in `_suffix`, refers to this record; `suffixes` names
 * array columns of identifiers.
 */
export interface ReferencedRecord {
  /** The record type, as the permission registry and typed references name it, such as `organisation.site`. */
  readonly recordType: string;
  /** The table whose `id` holds it. */
  readonly table: string;
  /** The column names, or name endings after `_`, that refer to it from other modules. */
  readonly suffixes?: readonly string[];
  /** The same for columns that hold an array of its identifiers. */
  readonly arraySuffixes?: readonly string[];
}

/** One key version an Organisation's data needs, and how many encrypted values or files name it. */
export interface KeyVersionUse {
  /** The identifier, or null for values written before key versions were recorded (the first version). */
  readonly identifier: string | null;
  readonly uses: number;
}

/** The latest audit seal: its block number and hash, which a restored chain must end at (3.2 step 3, 5.4). */
export interface SealFact {
  readonly blockNumber: string;
  readonly hash: string;
}

/** A module's part in backup and restore (10.1). */
export interface RestoreParticipant {
  /** The module or part, as module-map names it: `finance.books`, `stock.ledger`, `organisation`. */
  readonly unit: string;
  /** Its tier in module-map section 3: participants run in tier order. */
  readonly tier: number;
  /** Every table it owns, schema-qualified. Its generic totals cover each: rows, and every amount and quantity. */
  readonly tables: readonly string[];
  /** The records others refer to, which it answers for. Every table it owns answers under its own name too. */
  readonly records?: readonly ReferencedRecord[];
  /** References it holds by type and identifier. */
  readonly typedReferences?: readonly TypedReference[];
  /** Columns that look like references by their name and are not, with the reason, such as an actor that may be a user or a service identity. */
  readonly notReferences?: Readonly<Record<string, string>>;
  /** Totals beyond the generic ones, such as the highest number of each series (3.2 step 2). */
  totals?(context: ParticipantContext): Promise<ControlTotal[]>;
  /** Its own invariants, such as every journal balancing (5.1 "Module invariants"). */
  invariants?(context: ParticipantContext): Promise<Omit<CheckResult, 'unit'>[]>;
  /** The object keys of the file store its records name (3.2 step 6, 3.3). */
  objectKeys?(context: ParticipantContext): Promise<string[]>;
  /** The key versions its encrypted values and files name (2.3). */
  keyVersions?(context: ParticipantContext): Promise<KeyVersionUse[]>;
  /** The latest audit seal, offered by `audit` alone (3.2 step 3); null while no block is sealed. */
  latestSeal?(context: ParticipantContext): Promise<SealFact | null>;
}

/**
 * The schema-qualified names of the tables a unit's Drizzle definitions name (code-house-rules 3.4), sorted: how a
 * participant lists the tables it owns without repeating them.
 */
export function tablesOf(definitions: Readonly<Record<string, unknown>>): string[] {
  return Object.values(definitions)
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => {
      const config = getTableConfig(table);
      return `${config.schema ?? 'public'}.${config.name}`;
    })
    .sort();
}

const TABLE = /^[a-z_]+\.[a-z_]+$/;
const COLUMN = /^[a-z_]+$/;

function identifier(qualified: string): SQL {
  if (!TABLE.test(qualified)) throw new Error(`Not a schema-qualified table name: ${qualified}`);
  const [schema = '', table = ''] = qualified.split('.');
  return sql`${sql.identifier(schema)}.${sql.identifier(table)}`;
}

function column(name: string): SQL {
  if (!COLUMN.test(name)) throw new Error(`Not a column name: ${name}`);
  return sql`${sql.identifier(name)}`;
}

/** Every value is an exact decimal string; a sum of nothing is zero, never null. */
async function rowsOf<T extends Record<string, unknown>>(context: ParticipantContext, query: SQL): Promise<T[]> {
  return (await context.tx.execute<T>(query)).rows as T[];
}

/** A column of one table, as the catalogue gives it in the participant's own transaction. */
interface CatalogueColumn extends Record<string, unknown> {
  table_name: string;
  column_name: string;
  type_name: string;
  is_array: boolean;
  /** A foreign key covers it, so PostgreSQL checks it; it is a link inside the module (5.1). */
  has_foreign_key: boolean;
}

async function columnsOf(context: ParticipantContext, tables: readonly string[]): Promise<CatalogueColumn[]> {
  return rowsOf<CatalogueColumn>(
    context,
    sql`select n.nspname || '.' || c.relname as table_name, a.attname::text as column_name,
               pg_catalog.format_type(coalesce(nullif(t.typelem, 0), a.atttypid), null) as type_name,
               t.typcategory = 'A' as is_array,
               exists (select 1 from pg_catalog.pg_constraint k
                        where k.conrelid = c.oid and k.contype = 'f' and a.attnum = any(k.conkey)) as has_foreign_key
          from pg_catalog.pg_attribute a
          join pg_catalog.pg_class c on c.oid = a.attrelid
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          join pg_catalog.pg_type t on t.oid = a.atttypid
         where a.attnum > 0 and not a.attisdropped
           and (n.nspname || '.' || c.relname) = any(pg_catalog.string_to_array(${tables.join(',')}, ','))
         order by (n.nspname || '.' || c.relname) collate "C", a.attname::text collate "C"`,
  );
}

/** A money or quantity column, summed by the generic totals: `_paise` and `_minor` amounts and quantities. */
function isSummed(name: string, type: string): boolean {
  if (/_(paise|minor)$/.test(name)) return type === 'bigint';
  return /(^|_)quantity$/.test(name) && ['bigint', 'integer', 'numeric'].includes(type);
}

/**
 * The generic control totals of a set of tables (3.2 step 2): for each table in name order, its rows; for each amount
 * column (`_paise`, `_minor`) and quantity column, its sum and how many values are Unknown (null), counted apart and
 * never as zero (PRD-MOD-014, PRD-MOD-015).
 */
export async function tableTotals(context: ParticipantContext, tables: readonly string[]): Promise<ControlTotal[]> {
  const columns = await columnsOf(context, tables);
  const totals: ControlTotal[] = [];
  for (const table of [...tables].sort()) {
    const summed = columns.filter(
      (each) => each.table_name === table && !each.is_array && isSummed(each.column_name, each.type_name),
    );
    const parts: SQL[] = [sql`count(*)::text as rows`];
    summed.forEach((each, index) => {
      parts.push(sql`coalesce(sum(${column(each.column_name)}), 0)::text as ${sql.identifier(`s${String(index)}`)}`);
      parts.push(
        sql`count(*) filter (where ${column(each.column_name)} is null)::text as ${sql.identifier(`u${String(index)}`)}`,
      );
    });
    const [row] = await rowsOf<Record<string, string>>(
      context,
      sql`select ${sql.join(parts, sql`, `)} from ${identifier(table)}`,
    );
    totals.push({ name: `${table}.rows`, value: row?.rows ?? '0' });
    summed.forEach((each, index) => {
      totals.push({ name: `${table}.${each.column_name}.sum`, value: row?.[`s${String(index)}`] ?? '0' });
      totals.push({ name: `${table}.${each.column_name}.unknown`, value: row?.[`u${String(index)}`] ?? '0' });
    });
  }
  return totals;
}

/** The registry of participants (10.1), checked when it is built. */
export class RestoreRegistry {
  readonly participants: readonly RestoreParticipant[];
  readonly #owners: ReadonlyMap<string, { readonly participant: RestoreParticipant; readonly table: string }>;

  constructor(participants: readonly RestoreParticipant[]) {
    const units = new Set<string>();
    const tables = new Map<string, string>();
    const owners = new Map<string, { participant: RestoreParticipant; table: string }>();
    for (const participant of participants) {
      if (units.has(participant.unit)) throw new Error(`Two restore participants for ${participant.unit}`);
      units.add(participant.unit);
      for (const table of participant.tables) {
        identifier(table);
        const other = tables.get(table);
        if (other !== undefined) throw new Error(`${table} is owned by both ${other} and ${participant.unit}`);
        tables.set(table, participant.unit);
        owners.set(table, { participant, table });
      }
    }
    for (const participant of participants) {
      for (const record of participant.records ?? []) {
        if (!participant.tables.includes(record.table)) {
          throw new Error(`${participant.unit} answers for ${record.recordType} from a table it does not own`);
        }
        const other = owners.get(record.recordType);
        if (other !== undefined && other.table !== record.table) {
          throw new Error(`Two participants answer for ${record.recordType}`);
        }
        owners.set(record.recordType, { participant, table: record.table });
      }
    }
    this.participants = [...participants].sort((a, b) => a.tier - b.tier || (a.unit < b.unit ? -1 : 1));
    this.#owners = owners;
  }

  /** The latest audit seal, read in the same snapshot as everything else (3.2 step 3). */
  async latestSeal(context: ParticipantContext): Promise<SealFact | null> {
    const offering = this.participants.filter((participant) => participant.latestSeal !== undefined);
    if (offering.length > 1) throw new Error('Only one restore participant offers the latest audit seal');
    return (await offering[0]?.latestSeal?.(context)) ?? null;
  }

  /** Every table some participant owns. */
  tables(): string[] {
    return this.participants.flatMap((participant) => participant.tables).sort();
  }

  /** Every participant's control totals, in tier order, each in its fixed order (3.2 step 2, 5.2). */
  async controlTotals(context: ParticipantContext): Promise<ParticipantTotals[]> {
    const answer: ParticipantTotals[] = [];
    for (const participant of this.participants) {
      const totals = await tableTotals(context, participant.tables);
      if (participant.totals !== undefined) totals.push(...(await participant.totals(context)));
      answer.push({ unit: participant.unit, totals });
    }
    return answer;
  }

  /** The object keys every participant's records name, sorted and once each (3.2 step 6). */
  async objectKeys(context: ParticipantContext): Promise<string[]> {
    const keys = new Set<string>();
    for (const participant of this.participants) {
      for (const key of (await participant.objectKeys?.(context)) ?? []) keys.add(key);
    }
    return [...keys].sort();
  }

  /** The key versions the Organisation's encrypted values and files name, with their uses (2.3, 3.2 step 6). */
  async keyVersions(context: ParticipantContext): Promise<KeyVersionUse[]> {
    const uses = new Map<string | null, number>();
    for (const participant of this.participants) {
      for (const use of (await participant.keyVersions?.(context)) ?? []) {
        uses.set(use.identifier, (uses.get(use.identifier) ?? 0) + use.uses);
      }
    }
    return [...uses]
      .map(([identifier, count]) => ({ identifier, uses: count }))
      .sort((a, b) => (a.identifier ?? '').localeCompare(b.identifier ?? ''));
  }

  /**
   * Every participant's checks (5.1): its own invariants, and that every reference it holds to another module's
   * record resolves, through the participant that answers for that record (PRD-MOD-002, PRD-ACP-019).
   */
  async check(context: ParticipantContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const named = this.namedReferences();
    for (const participant of this.participants) {
      for (const result of (await participant.invariants?.(context)) ?? []) {
        results.push({ unit: participant.unit, ...result });
      }
      const columns = await columnsOf(context, participant.tables);
      const schemas = new Set(participant.tables.map((table) => table.split('.')[0]));
      for (const each of columns) {
        const qualifiedColumn = `${each.table_name}.${each.column_name}`;
        if (each.has_foreign_key || participant.notReferences?.[qualifiedColumn] !== undefined) continue;
        const target = named.find(
          (candidate) =>
            candidate.array === each.is_array &&
            (each.column_name === candidate.suffix || each.column_name.endsWith(`_${candidate.suffix}`)),
        );
        if (target === undefined || schemas.has(target.table.split('.')[0])) continue;
        const ids = sql`select distinct ${each.is_array ? sql`pg_catalog.unnest(${column(each.column_name)})` : column(each.column_name)} as id from ${identifier(each.table_name)}`;
        results.push(
          await this.resolve(
            context,
            participant.unit,
            `${qualifiedColumn} -> ${target.recordType}`,
            ids,
            target.table,
          ),
        );
      }
      for (const typed of participant.typedReferences ?? []) {
        const types = await rowsOf<{ type: string }>(
          context,
          sql`select distinct ${column(typed.typeColumn)} as type from ${identifier(typed.table)} order by 1`,
        );
        for (const { type } of types) {
          const name = `${typed.table}.${typed.idColumn} -> ${type}`;
          const owner = this.#owners.get(type);
          if (owner === undefined) {
            // No participant answers for the type, so the reference cannot be proved: a failure, never skipped.
            const [count] = await rowsOf<{ n: string }>(
              context,
              sql`select count(*)::text as n from ${identifier(typed.table)} where ${column(typed.typeColumn)} = ${type}`,
            );
            const failed = Number(count?.n ?? 0);
            results.push({ unit: participant.unit, check: name, passed: false, checked: failed, failed });
            continue;
          }
          const ids = sql`select distinct ${column(typed.idColumn)} as id from ${identifier(typed.table)} where ${column(typed.typeColumn)} = ${type}`;
          results.push(await this.resolve(context, participant.unit, name, ids, owner.table));
        }
      }
    }
    return results;
  }

  private namedReferences(): { recordType: string; table: string; suffix: string; array: boolean }[] {
    return this.participants.flatMap((participant) =>
      (participant.records ?? []).flatMap((record) => [
        ...(record.suffixes ?? []).map((suffix) => ({ ...record, suffix, array: false })),
        ...(record.arraySuffixes ?? []).map((suffix) => ({ ...record, suffix, array: true })),
      ]),
    );
  }

  private async resolve(
    context: ParticipantContext,
    unit: string,
    check: string,
    ids: SQL,
    table: string,
  ): Promise<CheckResult> {
    const [row] = await rowsOf<{ checked: string; failed: string }>(
      context,
      sql`select count(*)::text as checked,
                 count(*) filter (where not exists (select 1 from ${identifier(table)} t where t.id = r.id))::text as failed
            from (${ids}) r where r.id is not null`,
    );
    const failed = Number(row?.failed ?? 0);
    return { unit, check, passed: failed === 0, checked: Number(row?.checked ?? 0), failed };
  }
}
