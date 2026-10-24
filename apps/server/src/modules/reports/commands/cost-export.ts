import { uuidv7 } from '@apparel-os/domain';
import { STOCK_BALANCE_TYPE, type ReportExport } from '@apparel-os/schemas';
import type {
  CommandOutcome,
  CommandRefusal,
  IdempotencyHelper,
  IdempotentAnswer,
  JsonValue,
  ReadModelGateway,
  ReplayAuthorisation,
  RequestContent,
  RoutedOrganisation,
  TransactionContext,
} from '../../../kernel/index.js';
import { replayRefusal, type AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { Shown } from '../queries/authority.js';
import { auditScopeOf, heldNeedsOf } from '../domain/export-authority.js';
import { asReader, type Reading } from '../queries/reading.js';
import type { Sheet } from '../domain/export.js';
import { EXPORT_TOO_LARGE } from '../domain/refusals.js';
import { workbookOf } from '../writers/xlsx.js';

// The export of a list of stock that may carry cost, as XLSX, as it is shown (goods-in 9.1, 9.4, 9.5; code-house-rules
// 8.2, 12.1 "Reads", 12.4; numbering-and-audit 5.1, 5.2; PRD-SEC-007, PRD-ACS-008; S2-F11-T01, S2-F11-T02; code reviews
// 8 and 9 of stage 2), one step the stock search's and the stock report's exports share. A command, since a file with
// cost is an export of a restricted field: it reads the list through the read-model gateway in its own transaction
// under the exporter's own actor and grants, as the screen reads it, at most its cap of rows and refused past them;
// then, at step 0, holds every grant that shows a row in the file, of view on each stock record type it is read from at
// the row's facts, and of the cost field class where its cost is shown, rechecked under the lock (8.2 "Authority
// first"); then writes one sensitive-access record for each place and brand whose cost the file carries, all naming
// the export by an identifier made for it, which keeps no row of its own, before the bytes are given. Cost is not
// encrypted, so it asks for no fresh authenticator code (access-and-approvals 3.3, 6). Its answer is never kept under
// the key: a replay is not repeatable (12.4; DEC-114), as a file's download.

export interface ExportDependencies {
  readonly helper: IdempotencyHelper;
  readonly gateway: ReadModelGateway;
  readonly access: AccessInterface;
  readonly audit: AuditInterface;
}

export interface Exporter {
  readonly organisation: RoutedOrganisation;
  readonly userId: string;
  readonly correlationId: string;
  readonly networkAddress: string;
}

/** What one export reads and writes: its command, the record its access records name, and its list. */
export interface CostExport {
  readonly commandName: string;
  /** The record the access records name: the export itself, of its own type (numbering-and-audit 5.2). */
  readonly record: { readonly module: 'reports'; readonly type: string };
  /** The file's name before its business date. */
  readonly fileStem: string;
  /** The list as its screen reads it, at most its cap: whether more follow, each row shown and the file's sheets. */
  readonly read: (reading: Reading) => Promise<{
    readonly more: boolean;
    readonly shown: readonly Shown[];
    readonly sheets: readonly Sheet[];
  }>;
}

/**
 * Step 0 (code-house-rules 8.2): every grant that shows a row of the file, each once, held and rechecked under the lock;
 * answers the refusal, or none while each still holds.
 */
async function holdShown(
  access: Pick<AccessInterface, 'holdAuthority'>,
  context: TransactionContext,
  exporter: Exporter,
  shown: readonly Shown[],
): Promise<CommandRefusal | undefined> {
  const [first, ...further] = heldNeedsOf(shown);
  if (first === undefined) return undefined;
  return access.holdAuthority(
    context,
    { kind: 'user', id: exporter.userId },
    first.roleAssignmentId,
    first.need,
    [],
    further,
  );
}

/** One sensitive-access record for each place and brand whose cost the file carries, naming the export (5.1, 5.2). */
async function recordCostAccess(
  audit: AuditInterface,
  context: TransactionContext,
  exporter: Exporter,
  record: CostExport['record'],
  shown: readonly Shown[],
): Promise<void> {
  const scopes = new Map(
    shown.flatMap((row) => {
      if (row.costAssignmentId === undefined) return [];
      const scope = auditScopeOf(row.facts);
      return [[JSON.stringify(scope), scope] as const];
    }),
  );
  const exportId = uuidv7();
  for (const scope of scopes.values()) {
    await audit.recordAccess(context, {
      kind: 'sensitive-access',
      outcome: 'succeeded',
      userId: exporter.userId,
      networkAddress: exporter.networkAddress,
      scope,
      record: { ...record, id: exportId },
      fieldClass: 'cost',
      exposure: 'exported',
    });
  }
}

export async function exportWithCost(
  deps: ExportDependencies,
  exporter: Exporter,
  spec: CostExport,
  key: string,
  content: RequestContent,
): Promise<IdempotentAnswer<JsonValue>> {
  // A replay is answered only while the exporter may still read stock balances at all (CH-14).
  const authoriseReplay: ReplayAuthorisation = async (context) => {
    const checked = await deps.access.authoriseEach(
      context,
      { actorId: exporter.userId, action: 'view', recordType: STOCK_BALANCE_TYPE },
      [],
    );
    return checked.kind === 'refused'
      ? { kind: 'refused', refusal: replayRefusal(checked.refusal) }
      : { kind: 'allowed' };
  };
  return deps.helper.run(
    {
      commandName: spec.commandName,
      organisation: exporter.organisation,
      correlationId: exporter.correlationId,
      actor: { kind: 'actor', actorId: exporter.userId },
    },
    {
      key,
      content,
      authoriseReplay,
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const read = await asReader(
          { gateway: deps.gateway, access: deps.access, context, actorId: exporter.userId },
          async (reading) => ({ reading, list: await spec.read(reading) }),
        );
        if ('refused' in read) return { kind: 'refusal', refusal: read.refused, causedBySecret: false };
        const { reading, list } = read.answer;
        if (list.more) return { kind: 'refusal', refusal: EXPORT_TOO_LARGE, causedBySecret: false };
        const held = await holdShown(deps.access, context, exporter, list.shown);
        if (held !== undefined) return { kind: 'refusal', refusal: held, causedBySecret: false };
        await recordCostAccess(deps.audit, context, exporter, spec.record, list.shown);
        const bytes = await workbookOf(list.sheets);
        const answer: ReportExport = {
          fileName: `${spec.fileStem}-${reading.today}.xlsx`,
          contentBase64: bytes.toString('base64'),
        };
        return { kind: 'success', answer: { ...answer }, shows: 'restricted-value' };
      },
    },
  );
}
