import { z } from 'zod';
import { idSchema } from './common.js';
import { missingItemSchema } from './errors.js';
import { activitySchema } from './policy-readiness.js';

// Readiness checks and unit activation (module-map 4.16; domain-model 3.6, section 5, section 6 "Granting an
// activity", invariant 7; structure-and-masters 3.7; PRD-LIF-001 to PRD-LIF-003; DEC-116, DEC-117; S1-F04-T02). No
// check here has a threshold, a default or a business prerequisite beyond those the product owner named (RR-016).

/** The record type a readiness record is, and an activation's approval binds to (access-and-approvals 4.1). */
export const READINESS_RECORD_TYPE = 'site_lifecycle.readiness_record';
/** The record type of a unit's explicit zero opening-stock declaration (PRD-LIF-003). */
export const ZERO_STOCK_DECLARATION_TYPE = 'site_lifecycle.zero_stock_declaration';
/** The action type of approving an activity for a business unit (PRD-LIF-001; MM-8, DEC-105). */
export const ACTIVITY_APPROVAL = 'site_lifecycle.activity.grant';

/**
 * The readiness checks, in the order the screen shows them (PRD-LIF-002; domain-model 3.6; DEC-116). The devices check
 * of offline-counter section 11 joins them with S1-F12-T02; until then there is none.
 */
export const readinessCheckCodes = [
  'mappings',
  'locations',
  'users-and-access',
  'required-policies',
  'stock-plan',
  'brand-coverage',
] as const;
export const readinessCheckCodeSchema = z.enum(readinessCheckCodes);
export type ReadinessCheckCode = z.infer<typeof readinessCheckCodeSchema>;

/**
 * One check's answer: passed; failed, naming what is missing; or not needed for the unit, as a stock plan is not for an
 * office unit (PRD-LIF-003) and brand coverage only for a brand counter (PRD-ORG-006).
 */
export const readinessCheckSchema = z.strictObject({
  check: readinessCheckCodeSchema,
  state: z.enum(['passed', 'failed', 'not-needed']),
  missing: z.array(missingItemSchema),
});
export type ReadinessCheck = z.infer<typeof readinessCheckSchema>;

/** A unit and an activity as path parameters. */
export const unitActivityParamsSchema = z.strictObject({ businessUnitId: idSchema, activity: activitySchema });
export const unitParamsSchema = z.strictObject({ businessUnitId: idSchema });
export const readinessRecordParamsSchema = z.strictObject({ readinessRecordId: idSchema });

const instant = z.iso.datetime({ offset: true });

/** A readiness record: what was verified, when and by whom (PRD-LIF-002), and its activation request, if any. */
export const readinessRecordSchema = z.strictObject({
  readinessRecordId: idSchema,
  businessUnitId: idSchema,
  siteId: idSchema,
  activity: activitySchema,
  passed: z.boolean(),
  ranBy: z.string(),
  ranAt: instant,
  checks: z.array(readinessCheckSchema),
  /** The approval request of its activation, with its state, or null while none was asked for. */
  request: z.strictObject({ requestId: idSchema, state: z.string() }).nullable(),
});
export type ReadinessRecord = z.infer<typeof readinessRecordSchema>;

/** The state of a Site or unit as readiness shows it: Active once it holds an activity grant (structure-and-masters 3.7). */
export const lifecycleStateSchema = z.enum(['Setting up', 'Active']);

/** A unit's readiness, by activity (ui-blueprint Setup › Site opening and closure › Readiness). */
export const unitReadinessSchema = z.strictObject({
  asOf: instant,
  businessUnitId: idSchema,
  siteId: idSchema,
  state: lifecycleStateSchema,
  siteState: lifecycleStateSchema,
  activities: z.array(
    z.strictObject({
      activity: activitySchema,
      granted: z.boolean(),
      latest: readinessRecordSchema.nullable(),
    }),
  ),
  /** The unit's explicit zero opening-stock declaration, or null (PRD-LIF-003). */
  zeroStockDeclaration: z.strictObject({ declaredBy: z.string(), declaredAt: instant }).nullable(),
});
export type UnitReadiness = z.infer<typeof unitReadinessSchema>;

/** Declaring that the unit genuinely holds no stock (PRD-LIF-003; DEC-117): stated, never a default. */
export const zeroStockDeclarationRequestSchema = z.strictObject({ holdsNoStock: z.literal(true) });
export const zeroStockDeclaredSchema = z.strictObject({ declarationId: idSchema });

export const readinessRanSchema = z.strictObject({ readinessRecordId: idSchema, passed: z.boolean() });
export const activationRequestedSchema = z.strictObject({ readinessRecordId: idSchema, requestId: idSchema });
