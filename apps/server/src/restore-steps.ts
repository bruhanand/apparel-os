import { PinoLoggerService, RESTORE_IDENTITY, restoreIdentityAuthorities, type RestoreStep } from './kernel/index.js';
import {
  accessRestoreSteps,
  attachmentReaderCheck,
  OrganisationKeys,
  ORGANISATION_KEYS_VARIABLE,
  type ServiceIdentityGrant,
} from './modules/access/index.js';
import { Audit, auditRestoreSteps, type AuditInterface } from './modules/audit/index.js';
import { filesImportsRestoreChecks } from './modules/files-imports/index.js';
import { numberingRestoreSteps } from './modules/numbering/index.js';

// The after-restore steps of the modules (backup-and-restore 4.2 step 7, 10.1, 10.2; S1-F14-T03), as the composition
// lists them for the restore command: `access` ends every session; `numbering` pauses every series; `files-imports`
// checks every stored file and attachment and lists the objects with no record; `audit` records every outcome last.
// Every module's own invariants and references, and the control totals, are checked through the restore registry
// (restore-participants.ts). A module that adds an after-restore step adds it here.

export interface RestoreStepDependencies {
  readonly audit: AuditInterface;
  /** The Organisations' data keys from the custodian's kept copies (2.4), to open stored files. */
  readonly keys: OrganisationKeys;
}

export function restoreStepsOf(dependencies: RestoreStepDependencies): RestoreStep[] {
  return [
    ...accessRestoreSteps(dependencies.audit),
    ...numberingRestoreSteps,
    ...filesImportsRestoreChecks({ keys: dependencies.keys, readerCheck: attachmentReaderCheck }),
    ...auditRestoreSteps,
  ];
}

/**
 * The restore's internal service identity, holding exactly what its command steps declare (access-and-approvals 2.3,
 * 9.11, 9.11a; PRD-SEC-018): the setup step creates it with a new Organisation, and the command that adds service
 * identities gives it to one that lacks it, like the worker's.
 */
export function restoreIdentityGrant(): ServiceIdentityGrant {
  const declared = restoreStepsOf({
    audit: new Audit(new PinoLoggerService()),
    keys: OrganisationKeys.fromEnvironment({ [ORGANISATION_KEYS_VARIABLE]: '{}' }),
  });
  return { code: RESTORE_IDENTITY, authorities: restoreIdentityAuthorities(declared) };
}
