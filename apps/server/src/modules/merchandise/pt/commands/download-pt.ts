import { PT_TYPE, type FieldClass } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { FilesImportsInterface } from '../../../files-imports/index.js';
import { PT_FIELD_CLASSES, PT_MODULE } from '../domain/kinds.js';
import { revisionNotFound } from '../domain/refusals.js';
import { ptDownloadOf } from '../queries/download.js';
import { revisionFacts } from '../queries/pt-records.js';

// Download an Official PT (goods-in 6.5, 6.6; numbering-and-audit 5.1, 5.2; access-and-approvals 6; PRD-SEC-007,
// PRD-ACS-008; S2-F06-T01, code review 7): an export that includes a restricted field writes one sensitive-access record
// for each class it carries, in the command's own transaction before the file is given, as a restricted file's download
// does (imports-and-opening-data 13.1). The file carries BASIC and P RATE only for a reader granted cost, MARGIN only for
// one granted margin (queries/download.ts), so it writes the records of the classes the reader holds and no other. The
// caller has authorised view on the PT with the revision's facts and holds it at step 0; downloading changes nothing
// else. **Design choice**: it asks no fresh authenticator code, since cost and margin are restricted but not encrypted
// fields, and access-and-approvals 3.3 makes showing or exporting an encrypted field the protected action.

export interface DownloadReader {
  readonly userId: string;
  readonly networkAddress: string;
}

export async function downloadPt(
  context: TransactionContext,
  dependencies: { readonly audit: AuditInterface; readonly files: Pick<FilesImportsInterface, 'filledTemplate'> },
  reader: DownloadReader,
  revisionId: string,
  masked: ReadonlySet<FieldClass>,
): Promise<{ readonly fileName: string; readonly bytes: Buffer } | CommandRefusal> {
  const found = await revisionFacts(context, revisionId);
  if (found === undefined) return revisionNotFound(revisionId);
  const file = await ptDownloadOf(context, dependencies.files, revisionId, masked);
  if ('code' in file) return file;
  for (const fieldClass of PT_FIELD_CLASSES.filter((each) => !masked.has(each))) {
    await dependencies.audit.recordAccess(context, {
      kind: 'sensitive-access',
      outcome: 'succeeded',
      userId: reader.userId,
      networkAddress: reader.networkAddress,
      scope: found.facts,
      record: { module: PT_MODULE, type: PT_TYPE, id: found.ptId },
      fieldClass,
      exposure: 'exported',
    });
  }
  return file;
}
