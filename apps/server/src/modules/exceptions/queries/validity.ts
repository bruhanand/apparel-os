import type { SettingOrigin } from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { CommandDefect } from '../../../kernel/index.js';
import type { ValidityCheck } from '../../configuration/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import { routingInForce, today } from '../commands/common.js';
import { codeSeriesTarget } from '../commands/raise.js';
import { exceptionRoutingVersion } from '../db/schema.js';
import { missingRouting } from '../domain/types.js';

// The exceptions module's answers to the Available check (module-map 4.4, 4.13, section 3 rule 6; DEC-116; POL-02.16;
// S1-F08-T02, registered by S1-F04-T01). An operation that would raise a numbered exception names them among its
// validity checks: with no open exception-code series, or no routing in force for the exception's type at the Site,
// it stays unavailable and the answer names what is missing, so no exception is lost.

/** Whether an Open exception-code series exists. The series is no policy's value, so it reports none (DM-6). */
export function exceptionCodeSeriesCheck(numbering: NumberingInterface): ValidityCheck {
  return {
    code: 'exceptions.exception-code-series',
    policy: null,
    async check(context) {
      const series = await codeSeriesTarget(context, numbering);
      return series.kind === 'refused' ? { kind: 'invalid', missing: series.refusal.missing } : { kind: 'valid' };
    },
    values: () => Promise.resolve([]),
  };
}

/**
 * Whether the exception type the operation raises, its subject, has routing in force at the Site today (POL-02.16):
 * the owner, the due-time rule and the escalation. Routing is policy 2's value (POL-02.16), so it reports each
 * Approved version in force now or later, with its origin and its preparer, who cannot validate it (DM-6).
 */
export const exceptionRoutingCheck: ValidityCheck = {
  code: 'exceptions.exception-routing',
  policy: 2,
  async check(context, subject) {
    if (subject.subject === null) throw new CommandDefect('The routing check is asked about no exception type');
    const date = await today(context);
    if (date.kind === 'refused') return { kind: 'invalid', missing: date.refusal.missing };
    const routing = await routingInForce(context, subject.subject, subject.siteId, date.value);
    return routing === undefined
      ? { kind: 'invalid', missing: [missingRouting(subject.subject, subject.siteId)] }
      : { kind: 'valid' };
  },
  async values(context) {
    const date = await today(context);
    if (date.kind === 'refused') return [];
    const rows = await context.tx
      .select({
        id: exceptionRoutingVersion.id,
        origin: exceptionRoutingVersion.origin,
        preparedBy: exceptionRoutingVersion.preparedByUserId,
      })
      .from(exceptionRoutingVersion)
      .where(
        and(
          eq(exceptionRoutingVersion.decision, 'Approved'),
          sql`(pg_catalog.upper_inf(${exceptionRoutingVersion.validDuring})
               or pg_catalog.upper(${exceptionRoutingVersion.validDuring}) > ${date.value}::date)`,
        ),
      );
    return rows.map((row) => ({ key: row.id, origin: row.origin as SettingOrigin, enteredBy: [row.preparedBy] }));
  },
};
