import type { ApprovalRequestView } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ApiFailure } from '../api/query';
import { t } from '../messages/catalogue';
import { useGranted } from '../setup/parts';
import { formatDate } from '../setup/format';
import { fields, kindOfActionType, kindRoutes, recordTypeOf, type Kind } from './kinds';
import { Facts, type MasterRecord } from './MasterTab';

// The material facts of the master version an approval request binds to (PRD-ACS-007; access-and-approvals 9.1;
// structure-and-masters 8; S1-F02-T01), read as that one record where the reader may view it (code-house-rules 12.1),
// as read-only fields on the approval panel (design-language 10.14).

/** One record with every version, or the refusal thrown as ApiFailure. */
async function readRecord(kind: Kind, recordId: string): Promise<MasterRecord> {
  const result = await api.call(kindRoutes[kind].read, { params: { recordId } });
  if (result.ok) return result.data.record;
  throw new ApiFailure(result.status, result.error);
}

function KindFacts({ kind, view }: { kind: Kind; view: ApprovalRequestView }) {
  const recordId = view.document.recordId;
  const query = useQuery({
    queryKey: [kindRoutes[kind].read, recordId],
    queryFn: () => readRecord(kind, recordId),
    enabled: useGranted(recordTypeOf(kind), 'view'),
  });
  const record = query.data;
  const version = record?.versions.find((each) => each.id === view.document.versionId);
  if (record === undefined || version === undefined) return null;
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-raised p-3">
      <Facts specs={fields[kind]} values={{ ...record, ...version }} />
      <p className="m-0 text-body-sm text-text-2">{t('dates.from', { from: formatDate(version.validFrom) })}</p>
    </div>
  );
}

/** The facts of an organisation master's version, or nothing for another action type. */
export function MasterFacts({ view }: { view: ApprovalRequestView }) {
  const kind = kindOfActionType(view.actionType);
  return kind === undefined ? null : <KindFacts kind={kind} view={view} />;
}
