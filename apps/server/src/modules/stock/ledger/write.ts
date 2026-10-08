import { uuidv7 } from '@apparel-os/domain';
import { eq } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface, AuditSource } from '../../audit/index.js';
import {
  acceptance,
  balance,
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
} from './db/schema.js';
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
}

/**
 * Write (13.1): the movements and their legs and pieces, the receipt origins and their state, balances, pieces,
 * coverage, acceptance, holds, reservations, claims, releases and events of the request, set-based in the order of
 * their keys; one audit record naming them; the events of 13.7 (PRD-INT-004, PRD-MOD-006). Movements carry the
 * approval use the caller recorded first (13.3; DEC-097). A constraint refusing a row here is a defect (10.4).
 */
export async function writeRequest(
  context: TransactionContext,
  audit: AuditInterface,
  checked: CheckedRequest,
  source: AuditSource = { kind: 'screen' },
): Promise<Written> {
  const { plan, working } = checked;
  const { request } = plan;
  const { entries } = working;
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
          originKind: 'receipt',
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
        reversesMovementId: null,
        correctionOfMovementId: null,
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
        heldAs: 'custody',
        transitKind: null,
        transitRef: null,
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
      .set({ ptRevisionId: origin.ptRevisionId, coveredQuantity: origin.coveredQuantity })
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
        heldAs: 'custody',
        transitKind: null,
        transitRef: null,
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
        transitKind: null,
        transitRef: null,
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
  };
  await recordAudit(context, audit, checked, written, source);
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
