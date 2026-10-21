import {
  MARKED_ATTRIBUTE_TYPE,
  markedAttributeSetting,
  type AttributeMark,
  type MarkedAttributeVersionState,
  type MissingItem,
} from '@apparel-os/schemas';
import type { CommandRefusal } from '../../../../kernel/index.js';
import type { LatestRequest } from '../../../access/index.js';
import type { Decision } from '../db/schema.js';

// The rules of the season attribute and the size attribute (structure-and-masters 4.2 "As built"; RR-550, RR-556).

/** The document a marking's version is approved as (access-and-approvals 9.1): the marking, at that version. */
export const markDocument = (markedAttributeId: string, versionId: string) =>
  ({ module: 'merchandise', recordType: MARKED_ATTRIBUTE_TYPE, recordId: markedAttributeId, versionId }) as const;

/** The record a marking's audit record names (numbering-and-audit 4.1). */
export const markAuditRecord = (markedAttributeId: string, versionId: string) =>
  ({ module: 'merchandise', type: 'marked_attribute', id: markedAttributeId, versionId }) as const;

/** A marking named in a refusal (PRD-UXP-003). */
export const markItem = (markedAttributeId: string): MissingItem => ({
  kind: 'record',
  recordType: MARKED_ATTRIBUTE_TYPE,
  recordId: markedAttributeId,
});

/**
 * The refusal while no attribute is marked in force (code-house-rules 12.14 "Not set is a stated answer"): what needs
 * the season or the size list is unavailable, naming the setting, and nothing falls back to another attribute.
 */
export const attributeNotMarked = (mark: AttributeMark): CommandRefusal => ({
  kind: 'unavailable',
  code: 'merchandise.attribute-not-marked',
  missing: [{ kind: 'setting', setting: markedAttributeSetting(mark) }],
});

/**
 * The state a version shows (design-language 7; code-house-rules 7.3): an approved version is In force while
 * open-ended and Ended once a later one replaced it; a version still waiting is Superseded once its request is;
 * otherwise its decision.
 */
export function markVersionState(version: {
  readonly decision: Decision;
  readonly openEnded: boolean;
  readonly requestState?: LatestRequest['state'] | undefined;
}): MarkedAttributeVersionState {
  switch (version.decision) {
    case 'Rejected':
      return 'Rejected';
    case 'Approved':
      return version.openEnded ? 'In force' : 'Ended';
    case 'Awaiting approval':
      return version.requestState === 'Superseded' ? 'Superseded' : 'Awaiting approval';
  }
}
