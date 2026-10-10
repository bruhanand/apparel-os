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
 * The action type of approving a Site's shared readiness for an activity, which every unit's activation there then
 * needs (PRD-LIF-001; MM-8, DEC-105; product owner, 10 Oct 2026).
 */
export const SITE_READINESS_APPROVAL = 'site_lifecycle.site_readiness.approve';

/**
 * The readiness checks, in the order the screen shows them (PRD-LIF-002; domain-model 3.6; DEC-116). A Site's shared
 * readiness runs the required policies; a unit's run every other check, and the site-readiness check, that its Site is
 * ready for the activity (PRD-LIF-001; product owner, 10 Oct 2026). The devices check of offline-counter section 11
 * joins them with S1-F12-T02; until then there is none.
 */
export const readinessCheckCodes = [
  'mappings',
  'locations',
  'users-and-access',
  'required-policies',
  'site-readiness',
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
/** A Site and an activity as path parameters. */
export const siteActivityParamsSchema = z.strictObject({ siteId: idSchema, activity: activitySchema });
export const unitParamsSchema = z.strictObject({ businessUnitId: idSchema });
export const readinessRecordParamsSchema = z.strictObject({ readinessRecordId: idSchema });

const instant = z.iso.datetime({ offset: true });

/**
 * A readiness record: what was verified, when and by whom (PRD-LIF-002), and its approval request, if any. A Site's
 * shared readiness has no business unit.
 */
export const readinessRecordSchema = z.strictObject({
  readinessRecordId: idSchema,
  businessUnitId: idSchema.nullable(),
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

/** Who declared a unit holds no stock, and when (PRD-LIF-003). */
const zeroStockDeclarationViewSchema = z.strictObject({ declaredBy: z.string(), declaredAt: instant });

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
  /**
   * The Site's shared readiness, by activity: ready while its latest run is approved (PRD-LIF-001; product owner, 10
   * Oct 2026), with that run.
   */
  site: z.array(
    z.strictObject({
      activity: activitySchema,
      ready: z.boolean(),
      latest: readinessRecordSchema.nullable(),
    }),
  ),
  /** The unit's explicit zero opening-stock declaration, or null (PRD-LIF-003). */
  zeroStockDeclaration: zeroStockDeclarationViewSchema.nullable(),
});
export type UnitReadiness = z.infer<typeof unitReadinessSchema>;

/** Declaring that the unit genuinely holds no stock (PRD-LIF-003; DEC-117): stated, never a default. */
export const zeroStockDeclarationRequestSchema = z.strictObject({ holdsNoStock: z.literal(true) });
export const zeroStockDeclaredSchema = z.strictObject({ declarationId: idSchema });

export const readinessRanSchema = z.strictObject({ readinessRecordId: idSchema, passed: z.boolean() });
export const activationRequestedSchema = z.strictObject({ readinessRecordId: idSchema, requestId: idSchema });

/**
 * A readiness record as its approval panel shows it (access-and-approvals 9.3; PRD-ACS-007): the run, and the zero
 * declaration its stock plan relied on, which the approver approves with it (RR-483; product owner, 10 Oct 2026).
 */
export const readinessRecordReadSchema = z.strictObject({
  asOf: instant,
  record: readinessRecordSchema,
  zeroStockDeclaration: zeroStockDeclarationViewSchema.nullable(),
});
export type ReadinessRecordRead = z.infer<typeof readinessRecordReadSchema>;
