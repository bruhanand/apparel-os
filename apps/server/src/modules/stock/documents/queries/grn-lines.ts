import type { DamageReportState } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../../kernel/index.js';

// Where the damage reports on a GRN's lines stand (goods-in 4.6, 4.9, 5.1, 5.4; S2-F02-T03), for `receiving`: whether
// each is decided and how many pieces a confirmed one keeps out of the GRN's good pieces. Read through the narrowly
// authorised function `stock.damage_of_grn_lines` (migration 0097; DEC-117), so the answer does not depend on whether
// the reader may see the reports themselves; it carries no detail of them.

/** One report on a GRN line: its identifier, its quantity and its state (goods-in 8.5). */
export interface GrnLineDamage {
  readonly damageReportId: string;
  readonly grnLineId: string;
  readonly quantity: number;
  readonly state: DamageReportState;
}

const STATES: readonly string[] = ['Submitted', 'Confirmed', 'Rejected'];

export async function damageOfGrnLines(
  context: TransactionContext,
  grnLineIds: readonly string[],
): Promise<readonly GrnLineDamage[]> {
  if (grnLineIds.length === 0) return [];
  const rows = await context.tx.execute<{
    damage_report_id: string;
    grn_line_id: string;
    quantity: number;
    state: string;
  }>(sql`select * from stock.damage_of_grn_lines(${`{${grnLineIds.join(',')}}`}::uuid[])`);
  return rows.rows.map((row) => {
    if (!STATES.includes(row.state)) throw new CommandDefect(`A damage report in no known state: ${row.state}`);
    return {
      damageReportId: row.damage_report_id,
      grnLineId: row.grn_line_id,
      quantity: row.quantity,
      state: row.state as DamageReportState,
    };
  });
}
