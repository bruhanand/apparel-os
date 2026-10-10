import { known, paise, uuidv7 } from '@apparel-os/domain';
import { eq } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface, AuditSource } from '../../audit/index.js';
import type { PostItem, PostResult } from '../../finance/books/index.js';
import {
  acceptance,
  balance,
  costLayer,
  costPool,
  coverage,
  hold,
  holdClaim,
  holdRelease,
  holdScope,
  movement,
  movementLeg,
  movementPiece,
  piece,
  receiptOrigin,
  receiptOriginState,
  reservation,
  reservationClaim,
  reservationEvent,
  skuBalance,
  transitValue,
  transitValueLayer,
  valuation,
  valuationLayer,
} from './db/schema.js';
import { postedRecordType, refusalOf, StockRefused } from './domain/request.js';
import type { PostShare } from './domain/valuing.js';
import type { LedgerBooks } from './ports.js';
import type { ClaimState, ExpectedQuantity } from './domain/working.js';
import { countFreezeChanged, holdChanged, movementsPosted, reservationChanged } from './events.js';
import type { CheckedRequest } from './recheck.js';

// Write (stock-ledger 13.1 "Write"; S1-F10-T02): the request's records, one audit record and its events, in the
// command's transaction (PRD-INT-004, PRD-MOD-006).

/** What Write wrote (13.1 "Write"): identifiers only. */
export interface Written {
  readonly movementIds: string[];
  readonly receiptOriginIds: string[];
  readonly holdIds: string[];
  readonly reservationIds: string[];
  readonly coverageIds: string[];
  readonly acceptanceIds: string[];
  /** A count freeze's expected quantities: the balances in its scope under its locks (8.1). */
  readonly expected: ExpectedQuantity[];
  /** The valuations written (7.10). */
  readonly valuationIds: string[];
  /** What Post answered for the valued movements, or none when nothing was valued (books-and-posting 9.2). */
  readonly posting: PostResult | null;
}

/** The item key of a share: the movement, with its business unit where it is not the movement's own (8.1). */
function itemKeyOf(share: PostShare, movementUnit: string): string {
  return share.businessUnitId === movementUnit ? share.movementId : `${share.movementId}:${share.businessUnitId}`;
}

/**
 * Write (13.1): the movements and their legs and pieces, the receipt origins and their state, balances, pieces,
 * coverage, acceptance, holds, reservations, claims, releases and events of the request, set-based in the order of
 * their keys; one audit record naming them; the events of 13.7 (PRD-INT-004, PRD-MOD-006). Movements carry the
 * approval use the caller recorded first (13.3; DEC-097). A constraint refusing a row here is a defect (10.4).
 */
export async function writeRequest(
  context: TransactionContext,
  dependencies: { readonly audit: AuditInterface; readonly books: LedgerBooks },
  checked: CheckedRequest,
  source: AuditSource = { kind: 'screen' },
): Promise<Written> {
  const { plan, working } = checked;
  const { request } = plan;
  const { entries } = working;
  const posting = await postValues(context, dependencies.books, checked);
  const lines = new Map(request.items.map((item) => [item.lineId, item]));
  const sourceColumns = (lineId: string) => ({
    sourceModule: request.source.module,
    sourceRecordType: request.source.recordType,
    sourceRecordId: request.source.recordId,
    sourceVersionId: request.source.versionId,
    sourceLineId: lineId,
    sourceImportKind: request.source.importKind,
  });
  const actor = request.actor;
  const actorColumns = {
    actorUserId: actor.kind === 'user' ? actor.userId : null,
    actorServiceIdentityId: actor.kind === 'service-identity' ? actor.serviceIdentityId : null,
    onBehalfOfUserId: actor.kind === 'service-identity' ? (actor.onBehalfOfUserId ?? null) : null,
    roleAssignmentId: actor.roleAssignmentId,
  };
  const times = { businessDate: plan.businessDate, occurredAt: plan.occurredAt };
  if (
    !entries.origins.every((origin) =>
      lines.has(entries.movements.find((m) => m.id === origin.lastStateMovementId)?.lineId ?? ''),
    )
  ) {
    throw new CommandDefect('An origin without its receipt movement');
  }

  if (entries.origins.length > 0) {
    await context.tx.insert(receiptOrigin).values(
      entries.origins.map((origin) => {
        const unit = working.unit(origin.scope.siteId, origin.scope.businessUnitId);
        const sku = working.sku(origin.skuId ?? '');
        const movementOf = entries.movements.find((each) => each.id === origin.lastStateMovementId);
        return {
          id: origin.id,
          originKind: origin.originKind ?? 'receipt',
          parentOriginId: null,
          ...sourceColumns(movementOf?.lineId ?? ''),
          skuId: origin.skuId,
          skuVersionId: sku.versionId,
          stockUnit: sku.stockUnit,
          pieceTracked: origin.pieceTracked,
          batchTracked: sku.batchTracked,
          batchCode: origin.batchCode,
          expiryDate: origin.expiryDate,
          quantity: origin.quantity,
          countDate: origin.countDate,
          ...origin.scope,
          mappingVersionId: unit.mappingVersionId,
          bookId: unit.bookId,
          occurredAt: plan.occurredAt,
        };
      }),
    );
  }
  if (entries.movements.length > 0) {
    await context.tx.insert(movement).values(
      entries.movements.map((each) => ({
        id: each.id,
        kind: each.kind,
        ...sourceColumns(each.lineId),
        ...actorColumns,
        approvalUseId: request.approval?.useId ?? null,
        reversesMovementId: each.reversesMovementId ?? null,
        returnsMovementId: each.returnsMovementId ?? null,
        correctionOfMovementId: each.correctionOfMovementId ?? null,
        ...times,
        ...each.scope,
        brandIds: each.brandIds as string[],
      })),
    );
    const legs = entries.movements.flatMap((each) =>
      each.legs.map((leg) => ({
        id: leg.id,
        movementId: each.id,
        direction: leg.direction,
        receiptOriginId: leg.receiptOriginId,
        skuId: leg.skuId,
        quantity: leg.quantity,
        acceptedQuantity: leg.accepted,
        locationId: leg.locationId,
        condition: leg.condition,
        heldAs: leg.heldAs,
        transitKind: leg.transitKind,
        transitRef: leg.transitRef,
        batchCode: leg.batchCode,
        expiryDate: leg.expiryDate,
        bookId: leg.bookId,
        ...leg.scope,
      })),
    );
    if (legs.length > 0) await context.tx.insert(movementLeg).values(legs);
  }
  // Origin states: new ones with their owner (PRD-ORG-014, PRD-ORG-019); changed ones in place, under the origin's
  // exclusive lock (14.3).
  const newStates = entries.origins.map((origin) => {
    const owner = entries.movements.find((each) => each.id === origin.lastStateMovementId)?.owner ?? {
      kind: 'unknown' as const,
    };
    return {
      id: origin.stateId,
      receiptOriginId: origin.id,
      ownerKind: owner.kind === 'unknown' ? null : owner.kind,
      ownerLegalEntityId: owner.kind === 'organisation' ? owner.legalEntityId : null,
      ownerPartyId: owner.kind === 'supplier' ? owner.partyId : null,
      ownerBrandId: owner.kind === 'brand' ? owner.brandId : null,
      agreementVersionId: owner.kind === 'unknown' ? null : (owner.agreementVersionId ?? null),
      valueKnown: false,
      pRatePaise: null,
      establishedValuePaise: null,
      originQuantity: origin.quantity,
      ptRevisionId: origin.ptRevisionId,
      coveredQuantity: origin.coveredQuantity,
      lastStateMovementId: origin.lastStateMovementId ?? '',
      ...origin.scope,
    };
  });
  if (newStates.length > 0) await context.tx.insert(receiptOriginState).values(newStates);
  for (const origin of working.origins.values()) {
    if (origin.isNew || !origin.stateChanged) continue;
    await context.tx
      .update(receiptOriginState)
      .set({
        ptRevisionId: origin.ptRevisionId,
        coveredQuantity: origin.coveredQuantity,
        valueKnown: origin.valueKnown,
        pRatePaise: origin.pRatePaise,
        establishedValuePaise: origin.establishedValuePaise,
        ...(origin.lastStateMovementId === null ? {} : { lastStateMovementId: origin.lastStateMovementId }),
      })
      .where(eq(receiptOriginState.id, origin.stateId));
  }
  for (const total of working.skuBalances.values()) {
    if (total.changed)
      await context.tx.update(skuBalance).set({ quantity: total.quantity }).where(eq(skuBalance.id, total.id));
  }
  const balances = [...working.balances.values()];
  const newBalances = balances.filter((row) => row.isNew);
  if (newBalances.length > 0) {
    await context.tx.insert(balance).values(
      newBalances.map((row) => ({
        id: row.id,
        skuBalanceId: row.skuBalanceId,
        siteId: row.siteId,
        businessUnitId: row.businessUnitId,
        locationId: row.locationId,
        condition: row.condition,
        heldAs: row.heldAs,
        transitKind: row.transitKind,
        transitRef: row.transitRef,
        skuId: row.skuId,
        batchCode: row.batchCode,
        expiryDate: row.expiryDate,
        receiptOriginId: row.receiptOriginId,
        countDate: row.countDate,
        quantity: row.quantity,
        acceptedQuantity: row.accepted,
        storeId: row.scope.storeId,
        legalEntityId: row.scope.legalEntityId,
        brandId: row.scope.brandId,
      })),
    );
  }
  for (const row of balances) {
    if (row.isNew || !row.changed) continue;
    await context.tx
      .update(balance)
      .set({ quantity: row.quantity, acceptedQuantity: row.accepted })
      .where(eq(balance.id, row.id));
  }
  const pieces = [...working.pieces.values()];
  const newPieces = pieces.filter((row) => row.isNew);
  if (newPieces.length > 0) {
    await context.tx.insert(piece).values(
      newPieces.map((row) => ({
        id: row.id,
        code: row.code,
        skuId: row.skuId,
        receiptOriginId: row.receiptOriginId,
        locationId: row.locationId,
        condition: row.condition,
        heldAs: row.heldAs,
        transitKind: row.transitKind,
        transitRef: row.transitRef,
        inCustody: row.inCustody,
        ptRevisionId: row.ptRevisionId,
        acceptedSiteId: row.acceptedSiteId,
        lastMovementId: row.lastMovementId,
        siteId: row.siteId,
        storeId: row.storeId,
        businessUnitId: row.businessUnitId,
        legalEntityId: row.legalEntityId,
        brandId: row.brandId,
      })),
    );
  }
  for (const row of pieces) {
    if (row.isNew || !row.changed) continue;
    await context.tx
      .update(piece)
      .set({
        locationId: row.locationId,
        condition: row.condition,
        heldAs: row.heldAs,
        transitKind: row.transitKind,
        transitRef: row.transitRef,
        siteId: row.siteId,
        legalEntityId: row.legalEntityId,
        inCustody: row.inCustody,
        ptRevisionId: row.ptRevisionId,
        acceptedSiteId: row.acceptedSiteId,
        lastMovementId: row.lastMovementId,
        storeId: row.storeId,
        businessUnitId: row.businessUnitId,
      })
      .where(eq(piece.id, row.id));
  }
  const movedPieces = entries.movements.flatMap((each) =>
    each.pieceIds.map((pieceId) => {
      const moved = working.pieces.get(pieceId);
      if (moved === undefined) throw new CommandDefect('A moved piece is not loaded');
      return {
        id: uuidv7(),
        movementId: each.id,
        pieceId,
        siteId: each.scope.siteId,
        storeId: each.scope.storeId,
        businessUnitId: each.scope.businessUnitId,
        legalEntityId: each.scope.legalEntityId,
        brandId: moved.brandId,
      };
    }),
  );
  if (movedPieces.length > 0) await context.tx.insert(movementPiece).values(movedPieces);
  const status = { ...actorColumns, ...times };
  if (entries.coverage.length > 0) {
    await context.tx.insert(coverage).values(
      entries.coverage.map((row) => ({
        id: row.id,
        ptRevisionId: row.ptRevisionId,
        receiptOriginId: row.receiptOriginId,
        pieceTracked: row.pieceTracked,
        pieceId: row.pieceId,
        quantity: row.quantity,
        action: row.action,
        removesCoverageId: row.removesCoverageId,
        ...sourceColumns(row.lineId),
        ...status,
        ...row.scope,
      })),
    );
  }
  if (entries.acceptances.length > 0) {
    await context.tx.insert(acceptance).values(
      entries.acceptances.map((row) => ({
        id: row.id,
        receiptOriginId: row.receiptOriginId,
        pieceId: row.pieceId,
        quantity: row.quantity,
        locationId: row.locationId,
        condition: row.condition,
        ...sourceColumns(row.lineId),
        ...status,
        ...row.scope,
      })),
    );
  }
  if (entries.reservations.length > 0) {
    await context.tx.insert(reservation).values(
      entries.reservations.map((row) => ({
        id: row.id,
        kind: row.kind,
        ...sourceColumns(row.lineId),
        ...status,
        ...row.scope,
        brandIds: row.brandIds as string[],
      })),
    );
  }
  if (entries.holds.length > 0) {
    await context.tx.insert(hold).values(
      entries.holds.map((row) => ({
        id: row.id,
        kind: row.kind,
        reason: row.reason,
        evidenceFileId: row.evidenceFileId,
        withinReservationId: row.withinReservationId,
        ...sourceColumns(row.lineId),
        ...status,
        ...row.scope,
        brandIds: row.brandIds as string[],
      })),
    );
    const scopes = entries.holds.flatMap((row) =>
      row.freezeScope.map((member) => ({
        id: uuidv7(),
        holdId: row.id,
        holdKind: row.kind,
        locationId: 'locationId' in member ? member.locationId : null,
        scopeBrandId: 'brandId' in member ? member.brandId : null,
        skuId: 'skuId' in member ? member.skuId : null,
        ...row.scope,
        brandIds: row.brandIds as string[],
      })),
    );
    if (scopes.length > 0) await context.tx.insert(holdScope).values(scopes);
  }
  const newClaims = working.claims.filter((claim) => claim.isNew);
  const claimRow = (claim: ClaimState) => ({
    id: claim.id,
    pieceId: claim.pieceId,
    balanceId: claim.balanceId,
    quantity: claim.quantity,
    claimedQuantity: claim.claimed,
    ...claim.scope,
  });
  const newHoldClaims = newClaims.filter((claim) => claim.owner === 'hold');
  if (newHoldClaims.length > 0) {
    await context.tx
      .insert(holdClaim)
      .values(newHoldClaims.map((claim) => ({ ...claimRow(claim), holdId: claim.headerId })));
  }
  const newReservationClaims = newClaims.filter((claim) => claim.owner === 'reservation');
  if (newReservationClaims.length > 0) {
    await context.tx
      .insert(reservationClaim)
      .values(newReservationClaims.map((claim) => ({ ...claimRow(claim), reservationId: claim.headerId })));
  }
  for (const claim of working.claims) {
    if (claim.isNew || !claim.changed) continue;
    const table = claim.owner === 'hold' ? holdClaim : reservationClaim;
    await context.tx.update(table).set({ quantity: claim.quantity }).where(eq(table.id, claim.id));
  }
  if (entries.holdReleases.length > 0) {
    await context.tx.insert(holdRelease).values(
      entries.holdReleases.map((row) => ({
        id: row.id,
        holdId: row.holdId,
        holdKind: row.holdKind,
        holdClaimId: row.claimId,
        releaseEvent: row.event,
        quantity: row.quantity,
        pieceId: row.pieceId,
        ...sourceColumns(row.lineId),
        ...status,
        ...row.scope,
      })),
    );
  }
  // The reservations the movements consumed (13.5 "End reservation"; 14.2 `reservation_event` `consumed`).
  for (const each of working.consumed) {
    entries.reservationEvents.push({
      id: uuidv7(),
      lineId: each.lineId,
      reservationId: each.reservationId,
      reservationKind: each.kind,
      claimId: each.claimId,
      event: 'consumed',
      quantity: each.quantity,
      pieceId: each.pieceId,
      movementId: each.movementId ?? null,
      scope: each.scope,
    });
  }
  if (entries.reservationEvents.length > 0) {
    await context.tx.insert(reservationEvent).values(
      entries.reservationEvents.map((row) => ({
        id: row.id,
        reservationId: row.reservationId,
        reservationKind: row.reservationKind,
        reservationClaimId: row.claimId,
        event: row.event,
        quantity: row.quantity,
        pieceId: row.pieceId,
        movementId: row.movementId,
        ...sourceColumns(row.lineId),
        ...status,
        ...row.scope,
      })),
    );
  }

  await writeValues(context, checked);

  const written: Written = {
    movementIds: entries.movements.map((row) => row.id),
    receiptOriginIds: entries.origins.map((row) => row.id),
    holdIds: [...new Set([...entries.holds.map((row) => row.id), ...entries.holdReleases.map((row) => row.holdId)])],
    reservationIds: [
      ...new Set([
        ...entries.reservations.map((row) => row.id),
        ...entries.reservationEvents.map((row) => row.reservationId),
      ]),
    ],
    coverageIds: entries.coverage.map((row) => row.id),
    acceptanceIds: entries.acceptances.map((row) => row.id),
    expected: working.expected,
    valuationIds: working.valuations.map((row) => row.id),
    posting,
  };
  await recordAudit(context, dependencies.audit, checked, written, source);
  await publish(context, checked, written);
  return written;
}

/** One audit record naming what the request wrote (13.1 "Write"; PRD-ACS-013), with its approval evidence. */
async function recordAudit(
  context: TransactionContext,
  audit: AuditInterface,
  checked: CheckedRequest,
  written: Written,
  source: AuditSource,
) {
  const { request } = checked.plan;
  const entries = checked.working.entries;
  const first = entries.movements[0] ?? entries.holds[0] ?? entries.reservations[0];
  const record =
    written.movementIds[0] !== undefined
      ? { type: 'movement', id: written.movementIds[0] }
      : written.holdIds[0] !== undefined
        ? { type: 'hold', id: written.holdIds[0] }
        : written.reservationIds[0] !== undefined
          ? { type: 'reservation', id: written.reservationIds[0] }
          : written.coverageIds[0] !== undefined
            ? { type: 'coverage', id: written.coverageIds[0] }
            : { type: 'acceptance', id: written.acceptanceIds[0] ?? '' };
  const brands = new Set(entries.movements.flatMap((each) => each.brandIds));
  const scope = first?.scope;
  const brandId = brands.size === 1 ? [...brands][0] : undefined;
  await audit.record(context, {
    actor:
      request.actor.kind === 'user'
        ? { kind: 'user', id: request.actor.userId }
        : {
            kind: 'service-identity',
            id: request.actor.serviceIdentityId,
            ...(request.actor.onBehalfOfUserId === undefined
              ? {}
              : { onBehalfOfUserId: request.actor.onBehalfOfUserId }),
          },
    roleAssignmentId: request.actor.roleAssignmentId,
    occurredAt: checked.plan.occurredAt,
    ...(scope === undefined
      ? {}
      : {
          scope: {
            siteId: scope.siteId,
            ...(scope.storeId === null ? {} : { storeId: scope.storeId }),
            businessUnitId: scope.businessUnitId,
            legalEntityId: scope.legalEntityId,
            ...(brandId == null ? {} : { brandId }),
          },
        }),
    record: { module: 'stock', type: record.type, id: record.id, versionId: request.source.versionId },
    operation: 'post-stock',
    changes: [
      { kind: 'value', field: 'source', before: null, after: { ...request.source } },
      { kind: 'value', field: 'movements', before: null, after: written.movementIds },
      { kind: 'value', field: 'holds', before: null, after: written.holdIds },
      { kind: 'value', field: 'reservations', before: null, after: written.reservationIds },
      { kind: 'value', field: 'coverage', before: null, after: written.coverageIds },
      { kind: 'value', field: 'acceptances', before: null, after: written.acceptanceIds },
      { kind: 'value', field: 'valuations', before: null, after: written.valuationIds },
      {
        kind: 'value',
        field: 'journals',
        before: null,
        after: written.posting?.kind === 'posted' ? written.posting.journals.map((each) => each.journalId) : [],
      },
    ],
    source,
    ...(request.approval === undefined ? {} : { approval: { ...request.approval } }),
    ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
  });
}

/** The events of 13.7, identifiers only, in the request's transaction (PRD-MOD-006). */
async function publish(context: TransactionContext, checked: CheckedRequest, written: Written) {
  const { request } = checked.plan;
  const subject = (recordType: string, recordId: string) => ({
    module: 'stock',
    recordType,
    recordId,
    versionId: request.source.versionId,
  });
  const freezes = new Set([
    ...checked.working.entries.holds.filter((row) => row.kind === 'count-freeze').map((row) => row.id),
    ...checked.working.entries.holdReleases.filter((row) => row.holdKind === 'count-freeze').map((row) => row.holdId),
  ]);
  const holds = written.holdIds.filter((id) => !freezes.has(id));
  const [movementId] = written.movementIds;
  if (movementId !== undefined) {
    await context.publish(movementsPosted, {
      subject: subject('stock.movement', movementId),
      payload: { movementIds: written.movementIds },
    });
  }
  const [holdId] = holds;
  if (holdId !== undefined)
    await context.publish(holdChanged, { subject: subject('stock.hold', holdId), payload: { holdIds: holds } });
  const [reservationId] = written.reservationIds;
  if (reservationId !== undefined) {
    await context.publish(reservationChanged, {
      subject: subject('stock.reservation', reservationId),
      payload: { reservationIds: written.reservationIds },
    });
  }
  const [freezeId] = freezes;
  if (freezeId !== undefined) {
    await context.publish(countFreezeChanged, {
      subject: subject('stock.hold', freezeId),
      payload: { holdIds: [...freezes] },
    });
  }
}

/**
 * The hand-off to the books (7.11; books-and-posting 8.1 to 8.3; PRD-MOD-013, DEC-087): `finance` Post, once for the
 * request, with one item per valued movement and business unit, keyed by the movement (8.1), carrying each component's
 * signed amount in paise. Post rechecks under the caller's locks and writes the journals in this transaction; a
 * refusal is `posting-refused` and the command rolls back (SL-23 Outcome A; DEC-105). Nothing valued, nothing posted.
 */
async function postValues(
  context: TransactionContext,
  books: LedgerBooks,
  checked: CheckedRequest,
): Promise<PostResult | null> {
  const { plan, working } = checked;
  const { request } = plan;
  if (working.shares.length === 0) return null;
  const movements = new Map(working.entries.movements.map((each) => [each.id, each]));
  const items = new Map<string, { item: Omit<PostItem, 'components'>; amounts: Map<string, number>; lineId: string }>();
  for (const each of working.shares) {
    const movement = movements.get(each.movementId);
    if (movement === undefined) throw new CommandDefect('A share of a movement the request did not write');
    const itemKey = itemKeyOf(each, movement.scope.businessUnitId);
    const found = items.get(itemKey) ?? {
      item: {
        itemKey,
        eventKind: each.eventKind,
        businessUnitId: each.businessUnitId,
        brandId: each.brandId,
        businessDate: plan.businessDate,
      },
      amounts: new Map<string, number>(),
      lineId: movement.lineId,
    };
    found.amounts.set(each.component, (found.amounts.get(each.component) ?? 0) + each.amount);
    items.set(itemKey, found);
  }
  const actor = request.actor;
  const result = await books.post(context, {
    sourceModule: request.source.module,
    document: {
      recordType: postedRecordType(request.source),
      recordId: request.source.recordId,
      versionId: request.source.versionId,
    },
    actor:
      actor.kind === 'user' ? { kind: 'user', id: actor.userId } : { kind: 'service', id: actor.serviceIdentityId },
    ...(actor.kind === 'service-identity' && actor.onBehalfOfUserId !== undefined
      ? { onBehalfOfUserId: actor.onBehalfOfUserId }
      : {}),
    items: [...items.values()].map(({ item, amounts }) => ({
      ...item,
      components: [...amounts].map(([component, amount]) => ({ component, amount: known(paise(amount)) })),
    })),
  });
  if (result.kind === 'refused') {
    const [first] = result.items;
    throw new StockRefused(
      refusalOf('posting-refused', first === undefined ? undefined : items.get(first.itemKey)?.lineId, [
        { kind: 'posting', code: first?.refusal.code ?? 'finance.refused' },
        ...(first?.refusal.missing ?? []),
      ]),
    );
  }
  return result;
}

/** The pools, layers, transit values and valuations the request changed (7; 14.2), under the step 6 locks. */
async function writeValues(context: TransactionContext, checked: CheckedRequest): Promise<void> {
  const { working, plan } = checked;
  const times = { businessDate: plan.businessDate, accountingDate: plan.businessDate };
  if (working.valuations.length > 0) {
    await context.tx.insert(valuation).values(
      working.valuations.map((row) => ({
        id: row.id,
        movementId: row.movementId,
        receiptOriginId: row.receiptOriginId,
        costPoolId: row.poolId,
        transitValueId: row.transitId,
        sequence: row.sequence,
        quantityDelta: row.quantityDelta,
        valueDeltaPaise: row.valueDelta,
        quantityBefore: row.quantityBefore,
        quantityAfter: row.quantityBefore + row.quantityDelta,
        valueBeforePaise: row.valueBefore,
        valueAfterPaise: row.valueBefore + row.valueDelta,
        eventKind: row.eventKind,
        component: row.component,
        ...times,
        ...row.scope,
      })),
    );
  }
  for (const pool of working.pools.values()) {
    if (pool.changed) {
      await context.tx
        .update(costPool)
        .set({ quantity: pool.quantity, valuePaise: pool.value, lastSequence: pool.lastSequence })
        .where(eq(costPool.id, pool.id));
    }
    const scope = { siteId: pool.siteId, legalEntityId: pool.legalEntityId, brandId: pool.brandId };
    const added = pool.layers.filter((layer) => layer.isNew);
    if (added.length > 0) {
      await context.tx.insert(costLayer).values(
        added.map((layer) => ({
          id: layer.id,
          costPoolId: pool.id,
          poolFormula: pool.formula,
          enteredSequence: layer.enteredSequence,
          enteredAt: layer.enteredAt,
          quantityIn: layer.quantityIn,
          quantityLeft: layer.quantityLeft,
          valueInPaise: layer.valueIn,
          valueLeftPaise: layer.valueLeft,
          fromLayerId: layer.fromLayerId,
          receiptOriginId: layer.receiptOriginId,
          fromValuationId: layer.fromValuationId,
          ...scope,
        })),
      );
    }
    for (const layer of pool.layers) {
      if (layer.isNew || !layer.changed) continue;
      await context.tx
        .update(costLayer)
        .set({ quantityLeft: layer.quantityLeft, valueLeftPaise: layer.valueLeft })
        .where(eq(costLayer.id, layer.id));
    }
  }
  const valuationLayers = working.valuations.flatMap((row) =>
    row.layers.map((layer) => ({
      id: uuidv7(),
      valuationId: row.id,
      costLayerId: layer.layerId,
      pieceId: layer.pieceId,
      quantity: layer.quantity,
      valuePaise: layer.value,
      ...row.scope,
    })),
  );
  if (valuationLayers.length > 0) await context.tx.insert(valuationLayer).values(valuationLayers);
  for (const transit of working.transits.values()) {
    if (transit.changed) {
      await context.tx
        .update(transitValue)
        .set({ quantity: transit.quantity, valuePaise: transit.value })
        .where(eq(transitValue.id, transit.id));
    }
    const added = transit.layers.filter((layer) => layer.isNew);
    if (added.length > 0) {
      await context.tx.insert(transitValueLayer).values(
        added.map((layer) => ({
          id: layer.id,
          transitValueId: transit.id,
          sourceLayerId: layer.sourceLayerId,
          quantity: layer.quantity,
          valuePaise: layer.value,
          siteId: transit.scope.siteId,
          storeId: transit.scope.storeId,
          businessUnitId: transit.scope.businessUnitId,
          legalEntityId: transit.scope.legalEntityId,
          brandId: transit.scope.brandId,
        })),
      );
    }
    for (const layer of transit.layers) {
      if (layer.isNew || !layer.changed) continue;
      await context.tx
        .update(transitValueLayer)
        .set({ quantity: layer.quantity, valuePaise: layer.value })
        .where(eq(transitValueLayer.id, layer.id));
    }
  }
}
