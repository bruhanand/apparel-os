import { uuidv7 } from '@apparel-os/domain';
import type { SettingOrigin } from '@apparel-os/schemas';
import { CommandDefect, isKnownTimezone, type TransactionContext } from '../../../kernel/index.js';
import type { AuditActor, AuditInterface } from '../../audit/index.js';
import { organisationTimezoneVersion } from '../db/schema.js';

/**
 * Writes a new Organisation's first timezone version, Approved, in force from the command's start (code-house-rules 9;
 * access-and-approvals 9.11; RR-250). Only the setup step calls it, under the `setup` service identity, in its one
 * transaction; every later change is prepared and approved like any setting. Refused as a defect when a timezone
 * version exists already or the timezone cannot be read. Returns the version's identifier.
 */
export async function setUpTimezone(
  context: TransactionContext,
  audit: AuditInterface,
  actor: AuditActor,
  value: { readonly timezone: string; readonly origin: SettingOrigin },
): Promise<string> {
  if (!isKnownTimezone(value.timezone)) throw new CommandDefect('The timezone given cannot be read');
  const existing = await context.tx.select({ id: organisationTimezoneVersion.id }).from(organisationTimezoneVersion);
  if (existing.length > 0) throw new CommandDefect('The Organisation already has a timezone');
  const id = uuidv7();
  await context.tx.insert(organisationTimezoneVersion).values({
    id,
    timezone: value.timezone,
    origin: value.origin,
    validDuring: `[${context.startedAt.toISOString()},)`,
    decision: 'Approved',
  });
  await audit.record(context, {
    actor,
    record: { module: 'configuration', type: 'organisation_timezone', id, versionId: id },
    operation: 'set-up-organisation',
    changes: [
      { kind: 'value', field: 'timezone', before: null, after: value.timezone },
      { kind: 'value', field: 'origin', before: null, after: value.origin },
    ],
    source: { kind: 'operator-command' },
  });
  return id;
}
