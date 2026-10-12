import type { ImportKind } from '@apparel-os/schemas';
import { CommandDefect, type CommandRefusal, type TransactionContext } from '../../../kernel/index.js';
import { unavailableRefusal } from '../../configuration/index.js';
import type { ImportHandler, ImportPlace } from '../contracts/import-handlers.js';
import { OPENING_PUBLISHING, openingGate, type OpeningGate } from '../domain/opening-gate.js';
import type { ImportDependencies } from './import-common.js';

// The publish gate of an opening batch, as Publish, its queued job and the batch's read ask it
// (imports-and-opening-data 4.2, 10.1; module-map 4.4; access-and-approvals 7.1 step 2; PRD-SEC-017, PRD-UXP-003,
// PRD-LIF-011; S1-F13-T03): Available for the opening-publishing operation at the batch's unit, the environment, and
// the unit's switch as the handler answers it.

/** What the gate reads: Available, the environment's name. */
export type GateDependencies = Pick<ImportDependencies, 'configuration' | 'environment'>;

/** The gate for an opening batch of the handler at the place. */
export async function openingGateOf(
  deps: GateDependencies,
  context: TransactionContext,
  handler: ImportHandler,
  place: ImportPlace,
): Promise<OpeningGate> {
  const answer = await deps.configuration.checkAvailability(context, OPENING_PUBLISHING.code, {
    siteId: place.siteId,
    businessUnitId: place.businessUnitId,
  });
  if (answer === undefined) throw new CommandDefect(`${OPENING_PUBLISHING.code} is not declared`);
  const opening = handler.switchOf === undefined ? { kind: 'none' as const } : await handler.switchOf(context, place);
  return openingGate({
    environment: deps.environment.name,
    organisationCode: context.organisationCode,
    availability: answer.missing,
    opening,
    unitId: place.businessUnitId,
  });
}

/** The refusal of a gate that does not allow publishing: unavailable naming what is missing, or the cutover complete. */
export function gateRefusal(gate: OpeningGate): CommandRefusal | undefined {
  switch (gate.kind) {
    case 'available':
      return undefined;
    case 'cutover-complete':
      return cutoverComplete(gate.switchId);
    case 'unavailable':
      return unavailableRefusal({
        operation: OPENING_PUBLISHING.code,
        policy: OPENING_PUBLISHING.policy,
        state: 'unavailable',
        missing: gate.missing,
      });
  }
}

const cutoverComplete = (switchId: string): CommandRefusal => ({
  kind: 'refused',
  code: 'files-imports.cutover-complete',
  missing: [{ kind: 'opening-switch', switchId, cutover: 'complete' }],
});

/**
 * Start an import's refusal of an opening batch for a unit whose cutover is complete (10.1; PRD-LIF-011), or undefined.
 */
export async function cutoverRefusal(
  context: TransactionContext,
  handler: ImportHandler,
  kind: ImportKind,
  place: ImportPlace,
): Promise<CommandRefusal | undefined> {
  if (kind !== 'opening-balance' || handler.switchOf === undefined) return undefined;
  const opening = await handler.switchOf(context, place);
  return opening.kind === 'approved' && opening.cutover === 'complete' ? cutoverComplete(opening.switchId) : undefined;
}
