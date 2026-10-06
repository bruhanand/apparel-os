import type { TransactionContext } from '../../kernel/index.js';
import type { AuditChange } from './domain/changes.js';

/**
 * Who made a change: a user or a service identity, and for a job carrying out a person's decision, that person too
 * (numbering-and-audit 4.1; access-and-approvals 2.3; PRD-ACS-013, PRD-SEC-018).
 */
export type AuditActor =
  | { readonly kind: 'user'; readonly id: string }
  | { readonly kind: 'service-identity'; readonly id: string; readonly onBehalfOfUserId?: string };

/**
 * The scope facts of the record, as it carries them (numbering-and-audit 4.1, 4.5; access-and-approvals 5.3). A fact
 * left out is Unknown or not declared by the record type, never zero (PRD-MOD-015).
 */
export interface AuditScope {
  readonly legalEntityId?: string;
  readonly siteId?: string;
  readonly storeId?: string;
  readonly businessUnitId?: string;
  readonly brandId?: string;
}

/** The record a change was made to: its module, type, identifier and the version, where it has versions. */
export interface AuditedRecord {
  readonly module: string;
  readonly type: string;
  readonly id: string;
  readonly versionId?: string;
}

/** Where a change came from (numbering-and-audit 4.1). `row` only for an import. */
export type AuditSource =
  | { readonly kind: 'screen' | 'job' | 'adapter' | 'device' | 'operator-command'; readonly reference?: string }
  | { readonly kind: 'import'; readonly reference: string; readonly row?: number };

/** One change, as a module records it inside its transaction (module-map 4.5 "Record"). */
export interface AuditEntry {
  readonly actor: AuditActor;
  /** The role assignment Authorise used; left out on the paths that use none (access-and-approvals 7.1). */
  readonly roleAssignmentId?: string;
  /** When it happened: the device's time for an offline action. By default the command's start (code-house-rules 9). */
  readonly occurredAt?: Date;
  readonly scope?: AuditScope;
  readonly record: AuditedRecord;
  /** What was done, such as `submit` or `decide`. */
  readonly operation: string;
  /** The changed fields only (numbering-and-audit 4.1, 4.3). */
  readonly changes: readonly AuditChange[];
  /** The reason given, where one is asked. */
  readonly reason?: string;
  readonly source: AuditSource;
  /** The approval decision, and its use when a job posted the document (access-and-approvals 9.8). */
  readonly approval?: { readonly decisionId: string; readonly useId?: string };
  /** The command's idempotency key (code-house-rules 12.4; PRD-INT-002). */
  readonly idempotencyKey?: string;
}

/** What Record returns: the audit record, for an access record that points to it (numbering-and-audit 5.1). */
export interface AuditRecordReference {
  readonly auditRecordId: string;
}

/** Fields every access record may carry (numbering-and-audit 5.2). */
interface AccessCommon {
  readonly outcome: 'succeeded' | 'refused';
  /** The user. For a failed sign-in, only when the typed login matched one; never the typed login (PRD-SEC-014). */
  readonly userId?: string;
  /** The device, where it is registered. */
  readonly deviceId?: string;
  readonly networkAddress?: string;
  readonly occurredAt?: Date;
  readonly scope?: AuditScope;
}

/** The kinds of access record that carry nothing beyond the common fields (numbering-and-audit 5.1). */
export type PlainAccessKind =
  | 'sign-in'
  | 'sign-out'
  | 'session-locked'
  | 'session-ended'
  | 'session-revoked'
  | 'second-factor-enrolled'
  | 'second-factor-reset'
  | 'password-changed'
  | 'password-reset'
  | 'device-registered'
  | 'device-revoked';

/** One access record (module-map 4.5 "Record access"; numbering-and-audit 5; PRD-SEC-007). */
export type AccessEntry =
  | (AccessCommon & { readonly kind: PlainAccessKind })
  /** The platform operator's recovery of a first user's password or authenticator (access-and-approvals 3.2; DEC-116). */
  | (AccessCommon & { readonly kind: 'operator-recovery'; readonly identityVerification: string })
  /** A permission change, pointing to its audit record written in the same transaction (access-and-approvals 9.11). */
  | (AccessCommon & { readonly kind: 'permission-changed'; readonly auditRecord: AuditRecordReference })
  /** An encrypted field shown unmasked, or an export that includes any restricted field (numbering-and-audit 5.1). */
  | (AccessCommon & {
      readonly kind: 'sensitive-access';
      readonly record: AuditedRecord;
      readonly fieldClass: string;
      readonly exposure: 'shown' | 'exported';
    });

/**
 * Where a row sits in history order: its recording time in UTC to the microsecond, as text so no precision is lost,
 * and its identifier. A page starts after (or before) a position (code-house-rules 12.1 "Reads": a cursor).
 */
export interface HistoryPosition {
  readonly recordedAt: string;
  readonly id: string;
}

/** How much of a history to read: at most `limit` rows, from after `after` (code-house-rules 12.1). */
interface HistoryPage {
  readonly after?: HistoryPosition;
  readonly limit?: number;
}

/** Whose history to read (numbering-and-audit 4.5). */
export type HistoryQuery = (
  | { readonly of: 'record'; readonly module: string; readonly type: string; readonly id: string }
  | { readonly of: 'actor'; readonly actorId: string }
) &
  HistoryPage;

/**
 * Which access records to read, newest first (numbering-and-audit 4.5, 5.1): each group is the record type its kinds
 * are read under, `audit.access_record`, `audit.sensitive_access_record` or `audit.device_access_record`.
 */
export interface AccessHistoryQuery {
  readonly group: AccessRecordGroup;
  readonly userId?: string;
  /** Read only rows older than this position. */
  readonly before?: HistoryPosition;
  readonly limit?: number;
}

export type AccessRecordGroup = 'access' | 'sensitive-access' | 'device';

/** One access record as Read access history returns it (numbering-and-audit 5.2). */
export interface AccessHistoryEntry {
  readonly id: string;
  readonly position: HistoryPosition;
  readonly recordedAt: Date;
  readonly occurredAt: Date;
  readonly kind: string;
  readonly outcome: 'succeeded' | 'refused';
  readonly userId: string | null;
  readonly deviceId: string | null;
  readonly networkAddress: string | null;
  readonly identityVerification: string | null;
  readonly auditRecordId: string | null;
  readonly record: AuditedRecord | null;
  readonly fieldClass: string | null;
  readonly exposure: 'shown' | 'exported' | null;
  readonly scope: AuditScope;
  readonly correlationId: string;
}

/** One audit record as Read history returns it, oldest first. */
export interface AuditHistoryEntry {
  readonly id: string;
  readonly position: HistoryPosition;
  readonly recordedAt: Date;
  readonly occurredAt: Date;
  /** Null when the Organisation's timezone was not set (PRD-MOD-015). */
  readonly businessDate: string | null;
  readonly actor: AuditActor;
  readonly roleAssignmentId: string | null;
  readonly scope: AuditScope;
  readonly record: AuditedRecord;
  readonly operation: string;
  readonly changes: readonly AuditChange[];
  readonly reason: string | null;
  readonly source: AuditSource;
  readonly approval: { readonly decisionId: string; readonly useId?: string } | null;
  readonly correlationId: string;
}

/** A difference the seal check found (numbering-and-audit 4.4). It names the block, never a row's content. */
export interface SealProblem {
  readonly blockNumber: number;
  readonly problem: 'chain-broken' | 'rows-differ' | 'hash-differs';
}

/** How far ahead the audit partitions reach (numbering-and-audit 4.4; DEC-112, CH-5). */
export interface PartitionCoverage {
  /** The end of the last month both tables can take rows for, in UTC. Null when either has no partition. */
  readonly coveredUntil: Date | null;
  /** Whether both tables can take rows through the end of next month. False raises the alert. */
  readonly coversNextMonth: boolean;
}

/**
 * The audit module's interface (module-map 4.5). Every operation joins the command's transaction through its context
 * (code-house-rules 8.1; PRD-INT-004): an audit record commits with its change, or neither does.
 */
export interface AuditInterface {
  /** Appends an audit record of one change (PRD-ACS-013). */
  record(context: TransactionContext, entry: AuditEntry): Promise<AuditRecordReference>;
  /** Appends an access record (PRD-SEC-007). Works on the paths with no actor too (code-house-rules 6.3). */
  recordAccess(context: TransactionContext, entry: AccessEntry): Promise<void>;
  /** The history of a record or an actor inside the reader's scope, oldest first (PRD-SEC-005). */
  readHistory(context: TransactionContext, query: HistoryQuery): Promise<readonly AuditHistoryEntry[]>;
  /** The access records of one group, of every user or of one, newest first, inside the reader's scope (PRD-SEC-007). */
  readAccessHistory(context: TransactionContext, query: AccessHistoryQuery): Promise<readonly AccessHistoryEntry[]>;
  /** The sealing job's step: seals the block closed so far, if it holds any row. Returns its number, or null. */
  sealClosedBlock(context: TransactionContext): Promise<number | null>;
  /** The seal check: recomputes the chain and returns every difference (PRD-SEC-007). */
  checkSeals(context: TransactionContext): Promise<readonly SealProblem[]>;
  /** The retention step. Deletes nothing while no retention period is set (V-13, POL-18.05); returns rows deleted. */
  applyRetention(context: TransactionContext): Promise<number>;
  /** Reads the partitions' reach, and logs the alert when it does not cover next month (CH-5). */
  checkPartitionCoverage(context: TransactionContext): Promise<PartitionCoverage>;
}
