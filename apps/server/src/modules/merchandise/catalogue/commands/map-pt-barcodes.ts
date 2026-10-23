import { uuidv7 } from '@apparel-os/domain';
import { EXTERNAL_CODE_TYPE } from '@apparel-os/schemas';
import { and, inArray, not, sql } from 'drizzle-orm';
import {
  CommandDefect,
  EXCLUSION_VIOLATION,
  insertInParts,
  partsOf,
  withSavepoint,
  type CommandRefusal,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AuditInterface, AuditSource } from '../../../audit/index.js';
import { externalCode } from '../db/schema.js';
import { ptProductRefusal as refusal, ptRowItem as rowItem, type PtConfirmer } from '../domain/pt-products.js';
import { codeMappingChanged } from '../events.js';
import { barcodeKeys } from './pt-barcode-keys.js';

// The barcodes of a PT's rows recorded with its approval (goods-in 5.5, 6.6; structure-and-masters 4.3 "As built with
// S2-F06-T01"; PRD-MER-007; DEC-135; RR-554; S2-F06-T01).

/**
 * Records each barcode the PT's rows give a product, where no mapping in force names that product already, under the
 * brand, from the date (4.3 "As built with S2-F06-T01"; PRD-MER-007, DEC-135; RR-554): a barcode repeated across the
 * brand's products is a repeat, kept for each; one the whole Organisation maps to another product is refused,
 * `merchandise.code-conflict`, naming the mapping. Under the code rows' locks taken at step 1 (ptProductLockTargets).
 * One audit record names every mapping written; each publishes `merchandise.code-mapping-changed`.
 */
export async function mapPtBarcodes(
  context: TransactionContext,
  audit: AuditInterface,
  request: {
    readonly brandId: string;
    readonly date: string;
    readonly mappings: readonly { readonly code: string; readonly skuId: string; readonly rowNumber: number }[];
    readonly preparedBy: PtConfirmer;
    readonly source: AuditSource;
  },
): Promise<{ readonly kind: 'done' } | { readonly kind: 'refused'; readonly refusal: CommandRefusal }> {
  const wanted = new Map<string, { code: string; skuId: string; rowNumber: number }>();
  for (const each of request.mappings) {
    const key = `${each.code}|${each.skuId}`;
    if (!wanted.has(key)) wanted.set(key, each);
  }
  if (wanted.size === 0) return { kind: 'done' };
  const keys = await barcodeKeys(
    context,
    [...wanted.values()].map((each) => each.code),
  );
  // The mappings in force today of these codes, active, under the brand or the whole Organisation.
  const inForce: { keyId: string; skuId: string; scopeKind: string; id: string }[] = [];
  for (const part of partsOf([...new Set(keys.values())], 1)) {
    const rows = await context.tx
      .select({
        keyId: externalCode.codeKeyId,
        skuId: externalCode.skuId,
        scopeKind: externalCode.scopeKind,
        id: externalCode.id,
      })
      .from(externalCode)
      .where(
        and(
          inArray(externalCode.codeKeyId, part),
          not(externalCode.alias),
          sql`${externalCode.validDuring} && daterange(${request.date}::date, null)`,
          sql`(${externalCode.scopeKind} = 'organisation' or (${externalCode.scopeKind} = 'brand' and ${externalCode.scopeBrandId} = ${request.brandId}::uuid))`,
        ),
      );
    inForce.push(...rows);
  }
  const values: (typeof externalCode.$inferInsert)[] = [];
  for (const each of wanted.values()) {
    const keyId = keys.get(each.code);
    if (keyId === undefined) throw new CommandDefect('A barcode lost its code row');
    const ofCode = inForce.filter((row) => row.keyId === keyId);
    if (ofCode.some((row) => row.skuId === each.skuId)) continue;
    const other = ofCode.find((row) => row.scopeKind === 'organisation');
    if (other !== undefined) {
      return {
        kind: 'refused',
        refusal: refusal('merchandise.code-conflict', [
          rowItem(each.rowNumber),
          { kind: 'record', recordType: EXTERNAL_CODE_TYPE, recordId: other.id },
        ]),
      };
    }
    values.push({
      id: uuidv7(),
      codeKeyId: keyId,
      kind: 'supplier-barcode',
      scopeKind: 'brand',
      scopePartyId: null,
      scopeBrandId: request.brandId,
      skuId: each.skuId,
      packId: null,
      alias: false,
      validDuring: `[${request.date},)`,
      preparedByUserId: request.preparedBy.userId,
    });
  }
  if (values.length === 0) return { kind: 'done' };
  const written = await withSavepoint(context, 'merchandise_map_pt_barcodes', [EXCLUSION_VIOLATION], () =>
    insertInParts(context, externalCode, values),
  );
  // The same-scope conflict, held by the exclusion constraints behind the service (6.2).
  if (written.kind === 'caught') return { kind: 'refused', refusal: refusal('merchandise.code-conflict', []) };
  const mappingIds = values.map((each) => each.id);
  const [first] = mappingIds;
  if (first === undefined) throw new CommandDefect('A PT mapped no barcode');
  await audit.record(context, {
    actor: request.preparedBy.actor,
    roleAssignmentId: request.preparedBy.roleAssignmentId,
    approval: { decisionId: request.preparedBy.approvalDecisionId },
    record: { module: 'merchandise', type: 'external_code', id: first },
    operation: 'map-pt-barcodes',
    changes: [
      { kind: 'value', field: 'scope', before: null, after: { kind: 'brand', brandId: request.brandId } },
      { kind: 'value', field: 'validFrom', before: null, after: request.date },
      { kind: 'value', field: 'mappingIds', before: null, after: mappingIds },
    ],
    source: request.source,
  });
  for (const value of values) {
    await context.publish(codeMappingChanged, {
      subject: { module: 'merchandise', recordType: EXTERNAL_CODE_TYPE, recordId: value.id },
      payload: { mappingId: value.id, skuId: value.skuId },
    });
  }
  return { kind: 'done' };
}
