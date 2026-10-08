import type { ApprovalRequestView } from '@apparel-os/schemas';
import { t } from '../messages/catalogue';
import { useGranted } from '../setup/parts';
import { formatDate } from '../setup/format';
import { fields, kindOfActionType, recordTypeOf, type Kind } from './kinds';
import { Facts, useMasterList } from './MasterTab';

// The material facts of the master version an approval request binds to (PRD-ACS-007; access-and-approvals 9.1;
// structure-and-masters 8; S1-F02-T01), read through the master's own list where the reader may view it, as
// read-only fields on the approval panel (design-language 10.14).

function KindFacts({ kind, view }: { kind: Kind; view: ApprovalRequestView }) {
  const query = useMasterList(kind, useGranted(recordTypeOf(kind), 'view'));
  const record = query.data?.records.find((each) => each.id === view.document.recordId);
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
