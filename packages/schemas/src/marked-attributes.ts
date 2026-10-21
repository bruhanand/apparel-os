import { z } from 'zod';
import { approvalRequestStateSchema } from './approvals.js';
import { idSchema } from './common.js';
import { settingOriginSchema } from './settings.js';

// The Organisation's season attribute and size attribute (structure-and-masters 4.2 "As built"; goods-in GI-2, GI-3;
// RR-550, RR-556; S2-F01-T02, S2-F02-T02): two Organisation settings the catalogue keeps, each marking one list-type
// attribute, whose approved values are then the seasons a budget is for and the sizes a count line names. No attribute
// is marked by default: with none in force, what needs it is refused, naming the setting (code-house-rules 12.14). A
// marking is prepared by one person and approved by a different one, and every version keeps its history.

/** The record type the marking is read, prepared and approved under; it carries no scope fact. */
export const MARKED_ATTRIBUTE_TYPE = 'merchandise.marked_attribute';
/** The action type of a marking's approval, by a different person from its preparer (POL-02.07). */
export const MARKED_ATTRIBUTE_CHANGE = 'merchandise.marked_attribute.change';

/** What an attribute is marked as: the season or the size list. */
export const attributeMarkSchema = z.enum(['season', 'size']);
export type AttributeMark = z.infer<typeof attributeMarkSchema>;
export const attributeMarks = attributeMarkSchema.options;

/** The setting a refusal names while no attribute is marked (code-house-rules 12.3 "What is missing"). */
export const markedAttributeSetting = (mark: AttributeMark) => `merchandise.${mark}-attribute` as const;

/**
 * A version of a marking: the attribute it marks, where the choice came from (code-house-rules 12.14), and the newest
 * version it replaces, which the first version has none of (12.7).
 */
export const markedAttributeVersionDraftSchema = z.strictObject({
  mark: attributeMarkSchema,
  attributeId: idSchema,
  origin: settingOriginSchema,
  versionToken: idSchema.optional(),
});
export type MarkedAttributeVersionDraft = z.infer<typeof markedAttributeVersionDraftSchema>;

/** What preparing answers: the version waits for its approval, requested here. */
export const markedAttributePreparedSchema = z.strictObject({
  markedAttributeId: idSchema,
  versionId: idSchema,
  requestId: idSchema,
});
export type MarkedAttributePrepared = z.infer<typeof markedAttributePreparedSchema>;

/**
 * The state of one version (design-language 7): Awaiting approval; Superseded, when a newer version ended its request
 * before it was decided; In force, the attribute marked now; Ended, one a later version replaced; Rejected.
 */
export const markedAttributeVersionStateSchema = z.enum([
  'Awaiting approval',
  'Superseded',
  'In force',
  'Ended',
  'Rejected',
]);
export type MarkedAttributeVersionState = z.infer<typeof markedAttributeVersionStateSchema>;

const instantSchema = z.iso.datetime({ offset: true });

export const markedAttributeVersionSchema = z.strictObject({
  id: idSchema,
  attributeId: idSchema,
  origin: settingOriginSchema,
  state: markedAttributeVersionStateSchema,
  preparedBy: idSchema,
  preparedAt: instantSchema,
  /** While approved: the instants it was in force from and, once a later version replaced it, until. */
  inForceFrom: instantSchema.optional(),
  inForceUntil: instantSchema.optional(),
  /** The latest approval request of the version, for the approval panel. */
  request: z.strictObject({ id: idSchema, state: approvalRequestStateSchema }).optional(),
});
export type MarkedAttributeVersion = z.infer<typeof markedAttributeVersionSchema>;

/** The attribute marked now, or not set as an answer of its own (code-house-rules 12.14). */
export const markedAttributeInForceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('set'), attributeId: idSchema, versionId: idSchema }),
  z.strictObject({ kind: z.literal('not-set') }),
]);
export type MarkedAttributeInForce = z.infer<typeof markedAttributeInForceSchema>;

/** One marking as Setup › Vocabularies shows it: what is in force, and every version, oldest first. */
export const markedAttributeSchema = z.strictObject({
  mark: attributeMarkSchema,
  inForce: markedAttributeInForceSchema,
  /** The newest version's identifier, which a later version names (code-house-rules 12.7); none before the first. */
  versionToken: idSchema.optional(),
  versions: z.array(markedAttributeVersionSchema),
});
export type MarkedAttribute = z.infer<typeof markedAttributeSchema>;

/** Both markings, the season's first, at the instant read. */
export const markedAttributeListSchema = z.strictObject({
  asOf: instantSchema,
  marks: z.array(markedAttributeSchema),
});
export type MarkedAttributeList = z.infer<typeof markedAttributeListSchema>;
