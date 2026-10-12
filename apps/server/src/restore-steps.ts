import { RESTORE_IDENTITY, type JobAuthority, type RestoreStep } from './kernel/index.js';
import {
  accessRestoreSteps,
  attachmentReaderCheck,
  type OrganisationKeys,
  type ServiceIdentityGrant,
} from './modules/access/index.js';
import { auditRestoreSteps, type AuditInterface } from './modules/audit/index.js';
import { Exceptions, exceptionsRestoreSteps } from './modules/exceptions/index.js';
import { filesImportsRestoreChecks } from './modules/files-imports/index.js';
import { Inbox } from './modules/inbox/index.js';
import { Numbering, numberingRestoreSteps } from './modules/numbering/index.js';
import { numberedKinds } from './numbered-kinds.js';

// The after-restore steps of the modules (backup-and-restore 4.2 step 7, 4.5, 10.1, 10.2; S1-F14-T03), as the
// composition lists them for the restore command: `access` ends every session; `numbering` pauses every series;
// `files-imports` checks every stored file and attachment and lists the objects with no record; `audit` records every
// outcome last; and `exceptions` raises each recovery gap and failure still standing as an exception, once the
// exception-code series is reconciled (`restore --raise-gaps`; product owner, 12 Oct 2026). Every module's own
// invariants and references, and the control totals, are checked through the restore registry
// (restore-participants.ts). A module that adds an after-restore step adds it here, and what its identity must hold to
// RESTORE_IDENTITY_AUTHORITIES.

export interface RestoreStepDependencies {
  readonly audit: AuditInterface;
  /** The Organisations' data keys from the custodian's kept copies (2.4), to open stored files. */
  readonly keys: OrganisationKeys;
}

export function restoreStepsOf(dependencies: RestoreStepDependencies): RestoreStep[] {
  const exceptions = new Exceptions({
    numbering: new Numbering({ kinds: numberedKinds }),
    inbox: new Inbox(),
    audit: dependencies.audit,
    types: [],
  });
  return [
    ...accessRestoreSteps(dependencies.audit),
    ...numberingRestoreSteps,
    ...filesImportsRestoreChecks({ keys: dependencies.keys, readerCheck: attachmentReaderCheck }),
    ...exceptionsRestoreSteps(exceptions),
    ...auditRestoreSteps,
  ];
}

/**
 * What the restore's internal service identity holds, named here once (access-and-approvals 2.3, 9.11, 9.11a;
 * PRD-SEC-018): exactly what its command and raise steps declare, which a unit test proves: edit on `access.session`
 * to end every session, edit on `numbering.series` to pause every series, and create on `exceptions.exception` to
 * raise the recovery gaps.
 */
export const RESTORE_IDENTITY_AUTHORITIES: readonly JobAuthority[] = [
  { action: 'edit', recordType: 'access.session' },
  { action: 'edit', recordType: 'numbering.series' },
  { action: 'create', recordType: 'exceptions.exception' },
];

/**
 * The restore's internal service identity: the setup step creates it with a new Organisation, and the command that
 * adds service identities gives it to one that lacks it, like the worker's.
 */
export function restoreIdentityGrant(): ServiceIdentityGrant {
  return { code: RESTORE_IDENTITY, authorities: [...RESTORE_IDENTITY_AUTHORITIES] };
}
