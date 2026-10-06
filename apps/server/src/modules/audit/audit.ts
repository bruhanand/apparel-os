import type { StructuredLogger, TransactionContext } from '../../kernel/index.js';
import { recordAccess } from './commands/record-access.js';
import { recordChange } from './commands/record.js';
import type {
  AccessEntry,
  AccessHistoryEntry,
  AccessHistoryQuery,
  AuditEntry,
  AuditHistoryEntry,
  AuditInterface,
  AuditRecordReference,
  HistoryQuery,
  PartitionCoverage,
  SealProblem,
} from './contracts.js';
import { checkPartitionCoverage } from './jobs/partition-coverage.js';
import { applyRetention } from './jobs/retention.js';
import { checkSeals, sealClosedBlock } from './jobs/seals.js';
import { readAccessHistory } from './queries/read-access-history.js';
import { readHistory } from './queries/read-history.js';

/** The audit module's interface (module-map 4.5; numbering-and-audit 4 and 5). */
export class Audit implements AuditInterface {
  constructor(private readonly logger: StructuredLogger) {}

  record(context: TransactionContext, entry: AuditEntry): Promise<AuditRecordReference> {
    return recordChange(context, entry);
  }

  recordAccess(context: TransactionContext, entry: AccessEntry): Promise<void> {
    return recordAccess(context, entry);
  }

  readHistory(context: TransactionContext, query: HistoryQuery): Promise<readonly AuditHistoryEntry[]> {
    return readHistory(context, query);
  }

  readAccessHistory(context: TransactionContext, query: AccessHistoryQuery): Promise<readonly AccessHistoryEntry[]> {
    return readAccessHistory(context, query);
  }

  sealClosedBlock(context: TransactionContext): Promise<number | null> {
    return sealClosedBlock(context);
  }

  checkSeals(context: TransactionContext): Promise<readonly SealProblem[]> {
    return checkSeals(context);
  }

  applyRetention(context: TransactionContext): Promise<number> {
    return applyRetention(context);
  }

  checkPartitionCoverage(context: TransactionContext): Promise<PartitionCoverage> {
    return checkPartitionCoverage(context, this.logger);
  }
}
