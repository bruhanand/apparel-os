import { uuidv7 } from '@apparel-os/domain';
import {
  EXTERNAL_CODE_TYPE,
  PRODUCT_PROPOSAL_TYPE,
  type AttributeValue,
  type MissingItem,
  type ProposedSku,
} from '@apparel-os/schemas';
import { and, eq, inArray, not, sql } from 'drizzle-orm';
import {
  CommandDefect,
  EXCLUSION_VIOLATION,
  insertInParts,
  lockTable,
  partsOf,
  UNIQUE_VIOLATION,
  withSavepoint,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AuditActor, AuditInterface, AuditSource } from '../../../audit/index.js';
import {
  externalCode,
  externalCodeKey,
  productProposal,
  sku,
  skuIdentityValue,
  skuVersion,
  style,
  styleVersion,
  vocabularyValue,
} from '../db/schema.js';
import { identityKey, identityOf, type IdentityValue, type StoredProposal } from '../domain/products.js';
import { codeMappingChanged, productConfirmed } from '../events.js';
import { trackingOn } from '../queries/sku.js';
import { inForceOn, recordItem } from './common.js';
import { writeStyleAttributes } from './maintain.js';
import { attributeValuesRefusal, categoryOn } from './product-rules.js';

// The new products a PT approval confirms, and the barcodes of its rows it records (goods-in 5.5, 6.3 step 2, 6.6;
// structure-and-masters 4.2, 4.3 "As built with S2-F06-T01"; PRD-MER-007, PRD-MER-013; DEC-135; S2-F06-T01). The PT
// approver confirms the products the upload proposed with the PT, a different person from its uploader (DM-5, DEC-105),
// so each is a product proposal Confirmed in the approval's transaction, the uploader its proposer and the approver its
// decider, kept with the PT file's batch, document and staged rows (imports-and-opening-data 5), with no request of its
// own: the PT's approval decides it. By the rule the product owner decided on 22 Oct 2026 (RR-585), each new SKU takes a
// code drawn from the SKU code series (numbering-and-audit 2), the stock unit Piece and the purpose Merchandise; they
// change later only through the product master. A new style takes the style code, the Sub category, the HSN and the
// season, gender, type, item and fit of the first row proposing it, in the file's order; a SKU takes the row's colour
// as its identity value of the colour list, and its size is the row's size code, which must be in its category's size
// set in force, as the upload compares a SKU's size with a row's (goods-in 5.5 "As built"). **Design choice**
// throughout, the rule's own parts excepted. Every row's barcode not yet mapped to its product is recorded under the
// GRN's brand, where only a barcode may repeat (RR-554), so the scan-in resolves it (goods-in 7.2).

/** A new product a PT proposes, with what the PT's rows give it (goods-in 5.5). */
export interface PtProductRequest {
  /** The PT's proposal it is (`merchandise.pt_proposed_sku`). */
  readonly key: string;
  /** The first row proposing it, which a refusal names. */
  readonly rowNumber: number;
  readonly stagedRowIds: readonly string[];
  readonly styleCode: string;
  /** The brand's style of that code, or null for a new style. */
  readonly existingStyleId: string | null;
  readonly brandId: string;
  readonly categoryId: string;
  readonly hsn: string;
  /** The row's values of the style-level lists: season, gender, type, item, fit. */
  readonly styleValueIds: readonly string[];
  readonly colourValueId: string;
  /** The row's size code (goods-in 5.3). */
  readonly size: string;
}

/** A new style a PT approval makes. */
export interface CheckedPtStyle {
  readonly styleId: string;
  readonly versionId: string;
  readonly code: string;
  readonly brandId: string;
  readonly categoryId: string;
  readonly hsn: string;
  readonly attributes: readonly AttributeValue[];
  /** The products of it, the first row's the style's values. */
  readonly keys: readonly string[];
}

/** A new SKU a PT approval makes, its identifiers made now so the stock ledger can name it (stock-ledger 13.19). */
export interface CheckedPtProduct {
  readonly key: string;
  readonly rowNumber: number;
  readonly stagedRowIds: readonly string[];
  readonly styleId: string;
  readonly newStyle: boolean;
  readonly skuId: string;
  readonly skuVersionId: string;
  readonly size: string;
  readonly identity: readonly IdentityValue[];
  readonly identityKey: string;
  /** The SKU as the stock ledger reads one at the GRN's Site on the date (stock-ledger 13.1 Plan, 13.9). */
  readonly facts: {
    readonly skuId: string;
    readonly versionId: string;
    readonly brandId: string;
    readonly stockUnit: 'piece';
    readonly pieceTracked: boolean;
    readonly batchTracked: boolean;
  };
}

export interface CheckedPtProducts {
  readonly styles: readonly CheckedPtStyle[];
  readonly products: readonly CheckedPtProduct[];
}

/** A row named in a refusal by its number in the file (code-house-rules 12.3 "What is missing"). */
const rowItem = (rowNumber: number): MissingItem => ({ kind: 'pt-row', rowNumber: String(rowNumber) });

const refusal = (code: string, missing: MissingItem[]): CommandRefusal => ({ kind: 'refused', code, missing });

/** The stock unit and purpose every new product of a PT takes (RR-585, product owner, 22 Oct 2026). */
const PT_STOCK_UNIT = 'piece';
const PT_PURPOSE = 'merchandise';

/** The attribute of each approved value given, which the row's list values are (structure-and-masters 4.2). */
async function attributesOf(context: TransactionContext, valueIds: readonly string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const part of partsOf([...new Set(valueIds)], 1)) {
    const rows = await context.tx
      .select({ id: vocabularyValue.id, attributeId: vocabularyValue.attributeId })
      .from(vocabularyValue)
      .where(inArray(vocabularyValue.id, part));
    for (const row of rows) found.set(row.id, row.attributeId);
  }
  return found;
}

/**
 * Checks the new products of a PT under the PT approval's locks (structure-and-masters 4.1, 4.2): a new style's code
 * free, its category in force and its values from their lists; each SKU's size in its category's size set, its colour
 * an identity value the category names, its category's tracking profile in force at the Site, and no SKU of the style
 * with the same size and identity. Writes nothing; answers the identifiers it will write and the SKUs' facts.
 */
export async function checkPtProducts(
  context: TransactionContext,
  request: { readonly products: readonly PtProductRequest[]; readonly siteId: string; readonly date: string },
): Promise<{ readonly kind: 'checked'; readonly checked: CheckedPtProducts } | { readonly kind: 'refused'; readonly refusal: CommandRefusal }> {
  const { date } = request;
  const attributeOf = await attributesOf(
    context,
    request.products.flatMap((each) => [each.colourValueId, ...each.styleValueIds]),
  );
  const valuesOf = (ids: readonly string[]): AttributeValue[] =>
    ids.map((valueId) => {
      const attributeId = attributeOf.get(valueId);
      if (attributeId === undefined) throw new CommandDefect(`A PT row names value ${valueId}, which has no attribute`);
      return { attributeId, valueId };
    });
  const styles = new Map<string, CheckedPtStyle & { keys: string[] }>();
  const existing = new Map<string, { brandId: string; categoryId: string }>();
  for (const product of request.products) {
    if (product.existingStyleId !== null) {
      if (!existing.has(product.existingStyleId)) {
        const [row] = await context.tx
          .select({ brandId: style.brandId, categoryId: style.categoryId })
          .from(style)
          .where(eq(style.id, product.existingStyleId));
        if (row === undefined) {
          return {
            kind: 'refused',
            refusal: {
              kind: 'not-found',
              code: 'merchandise.record-not-found',
              missing: [rowItem(product.rowNumber), recordItem('style', product.existingStyleId)],
            },
          };
        }
        existing.set(product.existingStyleId, row);
      }
      continue;
    }
    const made = styles.get(product.styleCode);
    if (made !== undefined) {
      made.keys.push(product.key);
      continue;
    }
    // The style code is unique in the Organisation (4.1): another brand's style may hold it.
    const [taken] = await context.tx.select({ id: style.id }).from(style).where(eq(style.code, product.styleCode));
    if (taken !== undefined) {
      return {
        kind: 'refused',
        refusal: refusal('merchandise.code-taken', [rowItem(product.rowNumber), recordItem('style', taken.id)]),
      };
    }
    for (const reference of [
      { kind: 'brand' as const, id: product.brandId },
      { kind: 'category' as const, id: product.categoryId },
    ]) {
      if (!(await inForceOn(context, reference.kind, reference.id, date))) {
        return {
          kind: 'refused',
          refusal: refusal('merchandise.reference-not-in-force', [
            rowItem(product.rowNumber),
            recordItem(reference.kind, reference.id),
          ]),
        };
      }
    }
    const attributes = valuesOf(product.styleValueIds);
    const values = await attributeValuesRefusal(context, attributes, date);
    if (values !== undefined) {
      return { kind: 'refused', refusal: { ...values, missing: [rowItem(product.rowNumber), ...values.missing] } };
    }
    styles.set(product.styleCode, {
      styleId: uuidv7(),
      versionId: uuidv7(),
      code: product.styleCode,
      brandId: product.brandId,
      categoryId: product.categoryId,
      hsn: product.hsn,
      attributes,
      keys: [product.key],
    });
  }
  const categories = new Map<string, Awaited<ReturnType<typeof categoryOn>>>();
  const tracking = new Map<string, Awaited<ReturnType<typeof trackingOn>>>();
  const seen = new Set<string>();
  const products: CheckedPtProduct[] = [];
  for (const product of request.products) {
    const newStyle = product.existingStyleId === null ? styles.get(product.styleCode) : undefined;
    const styleId = newStyle?.styleId ?? product.existingStyleId;
    const ofStyle = newStyle ?? (styleId === null ? undefined : existing.get(styleId));
    if (styleId === null || ofStyle === undefined) throw new CommandDefect('A PT product lost its style');
    const { categoryId, brandId } = ofStyle;
    if (!categories.has(categoryId)) categories.set(categoryId, await categoryOn(context, categoryId, date));
    const category = categories.get(categoryId);
    const named = [rowItem(product.rowNumber), recordItem('category', categoryId)];
    if (category === undefined) {
      return { kind: 'refused', refusal: refusal('merchandise.reference-not-in-force', named) };
    }
    if (!(category.sizes ?? []).includes(product.size)) {
      return {
        kind: 'refused',
        refusal: refusal('merchandise.pt-size-not-in-size-set', [...named, { kind: 'size', size: product.size }]),
      };
    }
    const [colour] = valuesOf([product.colourValueId]);
    if (colour === undefined || !category.identityAttributeIds.includes(colour.attributeId)) {
      return { kind: 'refused', refusal: refusal('merchandise.pt-colour-not-identity', named) };
    }
    const values = await attributeValuesRefusal(context, [colour], date, category.identityAttributeIds);
    if (values !== undefined) {
      return { kind: 'refused', refusal: { ...values, missing: [rowItem(product.rowNumber), ...values.missing] } };
    }
    if (!tracking.has(categoryId)) tracking.set(categoryId, await trackingOn(context, categoryId, request.siteId, date));
    const profile = tracking.get(categoryId);
    if (profile === undefined) {
      return { kind: 'refused', refusal: refusal('merchandise.pt-tracking-unknown', named) };
    }
    const identity = identityOf(category.identityAttributeIds, [colour]);
    const key = identityKey(identity);
    const seenKey = JSON.stringify([styleId, product.size, key]);
    if (seen.has(seenKey)) return { kind: 'refused', refusal: refusal('merchandise.sku-exists', [rowItem(product.rowNumber)]) };
    seen.add(seenKey);
    if (newStyle === undefined) {
      const [same] = await context.tx
        .select({ id: sku.id })
        .from(sku)
        .where(and(eq(sku.styleId, styleId), eq(sku.size, product.size), eq(sku.identityKey, key)));
      if (same !== undefined) {
        return {
          kind: 'refused',
          refusal: refusal('merchandise.sku-exists', [rowItem(product.rowNumber), recordItem('sku', same.id)]),
        };
      }
    }
    const skuId = uuidv7();
    const skuVersionId = uuidv7();
    products.push({
      key: product.key,
      rowNumber: product.rowNumber,
      stagedRowIds: product.stagedRowIds,
      styleId,
      newStyle: newStyle !== undefined,
      skuId,
      skuVersionId,
      size: product.size,
      identity,
      identityKey: key,
      facts: {
        skuId,
        versionId: skuVersionId,
        brandId,
        stockUnit: PT_STOCK_UNIT,
        pieceTracked: profile.pieceTracked,
        batchTracked: profile.batchExpiryRequired,
      },
    });
  }
  return { kind: 'checked', checked: { styles: [...styles.values()], products } };
}

/** The code row of each barcode, made the first time a barcode is mapped (4.3 "As built"); answers code → key row. */
async function barcodeKeys(context: TransactionContext, codes: readonly string[]): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  const read = async (part: readonly string[]) => {
    const rows = await context.tx
      .select({ id: externalCodeKey.id, code: externalCodeKey.code })
      .from(externalCodeKey)
      .where(and(inArray(externalCodeKey.code, [...part]), eq(externalCodeKey.kind, 'supplier-barcode')));
    for (const row of rows) keys.set(row.code, row.id);
  };
  const distinct = [...new Set(codes)];
  for (const part of partsOf(distinct, 1)) await read(part);
  const missing = distinct.filter((code) => !keys.has(code));
  for (const part of partsOf(missing, 3)) {
    // A code row another command makes at the same moment meets the unique key; it is read again after.
    await context.tx
      .insert(externalCodeKey)
      .values(part.map((code) => ({ id: uuidv7(), code, kind: 'supplier-barcode' as const })))
      .onConflictDoNothing();
  }
  for (const part of partsOf(missing, 1)) await read(part);
  if (missing.some((code) => !keys.has(code))) throw new CommandDefect('A barcode row was made and not found after');
  return keys;
}

/**
 * The rows a PT approval locks at step 1 for its products (code-house-rules 8.2): each existing style a new SKU is
 * added to, as a product proposal's confirmation does (4.2 "As built"), and the code row of each barcode the PT's rows
 * name, as mapping a code does (4.3), each exclusively. A barcode's code row is made first when it has none, as Map a
 * code makes it.
 */
export async function ptProductLockTargets(
  context: TransactionContext,
  request: { readonly existingStyleIds: readonly string[]; readonly barcodes: readonly string[] },
): Promise<LockTarget[]> {
  const keys = await barcodeKeys(context, request.barcodes);
  return [
    ...[...new Set(request.existingStyleIds)].map((id) => ({
      table: lockTable('merchandise', 'style'),
      id,
      mode: 'exclusive' as const,
    })),
    ...[...keys.values()].map((id) => ({
      table: lockTable('merchandise', 'external_code_key'),
      id,
      mode: 'exclusive' as const,
    })),
  ];
}

/** The unique constraints a confirmation can meet when another committed first, and the refusal each is (4.1). */
const CONFLICTS: Readonly<Record<string, string>> = {
  style_code_key: 'merchandise.code-taken',
  sku_code_key: 'merchandise.code-taken',
  sku_identity_once: 'merchandise.sku-exists',
};

/**
 * Who confirms: the PT's approver, the approval decision, and who writes it, the approver in the decision's transaction
 * or a posting job's service identity on their behalf, with the assignment relied on (access-and-approvals 9.5, 9.8).
 */
export interface PtConfirmer {
  readonly userId: string;
  readonly approvalDecisionId: string;
  readonly actor: AuditActor;
  readonly roleAssignmentId: string;
}

/**
 * Confirms the checked products under every lock of the PT approval (4.2; PRD-MER-013): one product proposal per new
 * style, with its SKUs, and one per existing style given new SKUs, each Confirmed by the approver with the uploader its
 * proposer and kept with the PT file's batch and staged rows; the styles, the SKUs with their identity and their first
 * versions in force from the date, each SKU's code drawn by the caller from the SKU code series (RR-585); the audit
 * record and `merchandise.product-confirmed` of each.
 */
export async function confirmPtProducts(
  context: TransactionContext,
  audit: AuditInterface,
  request: {
    readonly checked: CheckedPtProducts;
    readonly codes: ReadonlyMap<string, string>;
    readonly proposedBy: string;
    readonly confirmer: PtConfirmer;
    /** The PT file's batch and document the products came from (imports-and-opening-data 5). */
    readonly importedFrom: { readonly batchId: string; readonly documentId: string };
    readonly source: AuditSource;
    readonly date: string;
  },
): Promise<{ readonly kind: 'done' } | { readonly kind: 'refused'; readonly refusal: CommandRefusal }> {
  const { checked, date, confirmer } = request;
  if (checked.products.length === 0) return { kind: 'done' };
  const validDuring = `[${date},)`;
  const common = { validDuring, decision: 'Approved' as const, preparedByUserId: request.proposedBy };
  const codeOf = (key: string) => {
    const code = request.codes.get(key);
    if (code === undefined) throw new CommandDefect(`A PT product ${key} was given no SKU code`);
    return code;
  };
  // One proposal per style: a new style with its SKUs, or an existing style with the new SKUs it is given.
  const groups = new Map<string, CheckedPtProduct[]>();
  for (const product of checked.products) groups.set(product.styleId, [...(groups.get(product.styleId) ?? []), product]);
  const proposals = [...groups].map(([styleId, products]) => ({
    id: uuidv7(),
    styleId,
    newStyle: checked.styles.find((each) => each.styleId === styleId),
    products,
  }));
  const written = await withSavepoint(context, 'merchandise_confirm_pt_products', [UNIQUE_VIOLATION], async () => {
    for (const proposal of proposals) {
      const skus: ProposedSku[] = proposal.products.map((product) => ({
        code: codeOf(product.key),
        size: product.size,
        identity: product.identity.map((each) => ({
          attributeId: each.attributeId,
          ...(each.valueId === undefined ? {} : { valueId: each.valueId }),
          ...(each.text === undefined ? {} : { text: each.text }),
        })),
        stockUnit: PT_STOCK_UNIT,
        purpose: PT_PURPOSE,
      }));
      const { newStyle } = proposal;
      const stored: StoredProposal = {
        shape: 'product-proposal/1',
        ...(newStyle === undefined
          ? { styleId: proposal.styleId }
          : {
              style: {
                code: newStyle.code,
                brandId: newStyle.brandId,
                categoryId: newStyle.categoryId,
                hsn: newStyle.hsn,
                attributes: [...newStyle.attributes],
              },
            }),
        skus,
      };
      // Proposed by the PT's uploader and confirmed with the PT by its approver, never the same person (DM-5): the
      // table's check holds it behind `access`'s refusal of a preparer (access-and-approvals 9.3).
      await context.tx.insert(productProposal).values({
        id: proposal.id,
        styleId: newStyle === undefined ? proposal.styleId : null,
        proposal: stored,
        sourceWords: null,
        proposedByUserId: request.proposedBy,
        state: 'Confirmed',
        decidedByUserId: confirmer.userId,
        decidedAt: context.startedAt,
        importBatchId: request.importedFrom.batchId,
        importDocumentId: request.importedFrom.documentId,
        importStagedRowIds: [...new Set(proposal.products.flatMap((product) => product.stagedRowIds))],
      });
      if (newStyle !== undefined) {
        await context.tx.insert(style).values({
          id: newStyle.styleId,
          code: newStyle.code,
          brandId: newStyle.brandId,
          categoryId: newStyle.categoryId,
          proposalId: proposal.id,
        });
        await context.tx.insert(styleVersion).values({
          ...common,
          id: newStyle.versionId,
          styleId: newStyle.styleId,
          brandArticleNumber: null,
          launchDate: null,
          hsn: newStyle.hsn,
        });
        await writeStyleAttributes(context, newStyle.versionId, newStyle.attributes);
      }
      for (const [index, product] of proposal.products.entries()) {
        await context.tx.insert(sku).values({
          id: product.skuId,
          code: skus[index]?.code ?? codeOf(product.key),
          styleId: proposal.styleId,
          size: product.size,
          identityKey: product.identityKey,
          proposalId: proposal.id,
        });
        // Every identity attribute of the category has its row, Unknown included (4.1 as built).
        if (product.identity.length > 0) {
          await context.tx.insert(skuIdentityValue).values(
            product.identity.map((each) => ({
              id: uuidv7(),
              skuId: product.skuId,
              attributeId: each.attributeId,
              vocabularyValueId: each.valueId ?? null,
              textValue: each.text ?? null,
            })),
          );
        }
        await context.tx.insert(skuVersion).values({
          ...common,
          id: product.skuVersionId,
          skuId: product.skuId,
          stockUnit: PT_STOCK_UNIT,
          purpose: PT_PURPOSE,
        });
      }
    }
  });
  if (written.kind === 'caught') {
    // A code or an identity made by another confirmation that committed first (4.1), told apart by the constraint.
    const code = CONFLICTS[written.violation.constraint ?? ''];
    if (code === undefined) {
      throw new CommandDefect(`Unexpected unique violation on ${written.violation.constraint ?? 'no constraint'}`);
    }
    return { kind: 'refused', refusal: refusal(code, []) };
  }
  for (const proposal of proposals) {
    const skuIds = proposal.products.map((product) => product.skuId);
    await audit.record(context, {
      actor: confirmer.actor,
      roleAssignmentId: confirmer.roleAssignmentId,
      approval: { decisionId: confirmer.approvalDecisionId },
      record: { module: 'merchandise', type: 'product_proposal', id: proposal.id },
      operation: 'confirm-pt-product',
      changes: [
        { kind: 'value', field: 'state', before: null, after: 'Confirmed' },
        { kind: 'value', field: 'styleId', before: null, after: proposal.styleId },
        { kind: 'value', field: 'skuIds', before: null, after: skuIds },
        { kind: 'value', field: 'skuCodes', before: null, after: proposal.products.map((each) => codeOf(each.key)) },
      ],
      source: request.source,
    });
    await context.publish(productConfirmed, {
      subject: { module: 'merchandise', recordType: PRODUCT_PROPOSAL_TYPE, recordId: proposal.id },
      payload: { proposalId: proposal.id, styleId: proposal.styleId, skuIds },
    });
  }
  return { kind: 'done' };
}

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
