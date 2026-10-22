import { uuidv7 } from '@apparel-os/domain';
import { sql } from 'drizzle-orm';
import type { TransactionContext } from '../../src/kernel/index.js';
import type { AuditActor, AuditInterface } from '../../src/modules/audit/index.js';
import type { ConfigurationInterface } from '../../src/modules/configuration/index.js';
import {
  SYNTHETIC_PT_LAYOUT,
  SYNTHETIC_PT_LAYOUT_CODE,
  SYNTHETIC_PT_MAPPING,
  SYNTHETIC_PT_MAPPING_CODE,
} from './pt.js';
import { syntheticName } from './synthetic.js';

// The SYNTHETIC PT template of the local seed (goods-in 5.2, 5.8; imports-and-opening-data 6.4; DEC-144, as the
// product owner asked in code review 6 of stage 2): the layout version and mapping version the tests use (fixtures/
// pt.ts), so a PT file can be uploaded on `dev` without a person to propose them and another to confirm them. Each is
// written Confirmed, as a labelled SYNTHETIC setting, as the setup step writes its settings (DEC-118): the first Admin
// its proposer and the `setup` identity its decider, since neither first user holds the right or an authenticator to
// confirm it, with no approval request; each with an audit record. Never a KDPS layout, never a default.

export interface TemplateDependencies {
  readonly audit: Pick<AuditInterface, 'record'>;
  readonly origins: Pick<ConfigurationInterface, 'originRefusal'>;
}

export interface TemplateInput {
  /** The proposer of both versions, a person: the first Admin. */
  readonly proposedBy: string;
  /** Who writes them, named in their audit records and as their decider: the seed's `setup` identity. */
  readonly writer: AuditActor & { readonly kind: 'service-identity' };
}

/**
 * Writes the SYNTHETIC PT template's layout version and mapping version, Confirmed, unless a layout of its code exists
 * already, which is left as it is. Answers whether it wrote them.
 */
export async function addSyntheticPtTemplate(
  context: TransactionContext,
  dependencies: TemplateDependencies,
  input: TemplateInput,
): Promise<'written' | 'unchanged'> {
  const origin = dependencies.origins.originRefusal(context, 'synthetic');
  if (origin !== undefined) throw new Error(`A SYNTHETIC PT template is refused here: ${origin.code}`);
  const taken = await context.tx.execute(
    sql`select 1 from files_imports.layout where code = ${SYNTHETIC_PT_LAYOUT_CODE}`,
  );
  if (taken.rows.length > 0) return 'unchanged';
  const at = context.startedAt.toISOString();
  const layoutId = uuidv7();
  const layoutVersionId = uuidv7();
  const mappingId = uuidv7();
  const mappingVersionId = uuidv7();
  await context.tx.execute(sql`
    insert into files_imports.layout (id, code, source, document_type, kinds)
    values (${layoutId}, ${SYNTHETIC_PT_LAYOUT_CODE}, ${syntheticName('PT template')}, 'pt', array['transaction'])`);
  await context.tx.execute(sql`
    insert into files_imports.layout_version
      (id, layout_id, version, structure, state, proposed_by_user_id, decided_by_user_id, decided_at)
    values (${layoutVersionId}, ${layoutId}, 1, ${JSON.stringify(SYNTHETIC_PT_LAYOUT)}::jsonb, 'Confirmed',
            ${input.proposedBy}, ${input.writer.id}, ${at}::timestamptz)`);
  await context.tx.execute(sql`
    insert into files_imports.mapping (id, code, layout_version_id, target)
    values (${mappingId}, ${SYNTHETIC_PT_MAPPING_CODE}, ${layoutVersionId}, 'merchandise.pt')`);
  await context.tx.execute(sql`
    insert into files_imports.mapping_version
      (id, mapping_id, version, fields, state, proposed_by_user_id, decided_by_user_id, decided_at)
    values (${mappingVersionId}, ${mappingId}, 1, ${JSON.stringify(SYNTHETIC_PT_MAPPING)}::jsonb, 'Confirmed',
            ${input.proposedBy}, ${input.writer.id}, ${at}::timestamptz)`);
  for (const written of [
    { type: 'layout', id: layoutId, versionId: layoutVersionId, operation: 'seed-layout-version' },
    { type: 'mapping', id: mappingId, versionId: mappingVersionId, operation: 'seed-mapping-version' },
  ]) {
    await dependencies.audit.record(context, {
      actor: input.writer,
      record: { module: 'files-imports', type: written.type, id: written.id, versionId: written.versionId },
      operation: written.operation,
      changes: [
        { kind: 'value', field: 'version', before: null, after: 1 },
        { kind: 'value', field: 'state', before: null, after: 'Confirmed' },
        { kind: 'value', field: 'proposedBy', before: null, after: input.proposedBy },
      ],
      source: { kind: 'operator-command' },
    });
  }
  return 'written';
}
