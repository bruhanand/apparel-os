import { MAPPING_RULE_CONFIRMATION, type ApprovalRequestView } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../api';
import { readQuery } from '../api/query';
import { className, fieldName } from '../files/import-text';
import { t, type MessageId } from '../messages/catalogue';
import { useSession } from '../shell/session';

// The material facts of a layout, mapping or mapping rule version an approval request binds to (imports-and-opening-data
// 6.1 to 6.4; access-and-approvals 9.1; PRD-ACS-007; S1-F06-T03), read through the lists of Setup › File intake and
// saved layouts where the reader may view them.

function Fact({ label, children }: { label: MessageId; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label font-semibold text-text-2">{t(label)}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 rounded-card border border-border bg-raised p-3 sm:grid-cols-2">{children}</dl>;
}

function useViewable(recordType: string): boolean {
  const { session } = useSession();
  if (session.state === 'signed-out') return false;
  return session.grants.some((grant) => grant.recordType === recordType && grant.action === 'view');
}

function LayoutOrMappingFacts({ view }: { view: ApprovalRequestView }) {
  const layoutsViewable = useViewable('files_imports.layout');
  const mappingsViewable = useViewable('files_imports.mapping');
  const query = useQuery({ ...readQuery(api, 'listImportLayouts', {}), enabled: layoutsViewable || mappingsViewable });
  const layouts = query.data?.layouts ?? [];
  const layout = layouts.find((each) => each.layoutVersionId === view.document.versionId);
  if (layout !== undefined) {
    return (
      <Facts>
        <Fact label="intake.layout">
          {t('intake.layout.version', { code: layout.layoutCode, version: layout.version })}
        </Fact>
        <Fact label="intake.layout.source">{layout.source}</Fact>
        <Fact label="intake.layout.columns">
          {layout.structure.columns
            .map((column) =>
              column.restrictedClass === undefined
                ? column.name
                : `${column.name} (${className(column.restrictedClass)})`,
            )
            .join(', ')}
        </Fact>
      </Facts>
    );
  }
  for (const each of layouts) {
    const mapping = each.mappings.find((candidate) => candidate.mappingVersionId === view.document.versionId);
    if (mapping === undefined) continue;
    return (
      <Facts>
        <Fact label="intake.layout.mappings">
          {t('intake.mapping.version', { code: mapping.mappingCode, version: mapping.version })}
        </Fact>
        <Fact label="intake.mapping.target">{mapping.target}</Fact>
        <Fact label="intake.layout">
          {t('intake.layout.version', { code: each.layoutCode, version: each.version })}
        </Fact>
        <Fact label="intake.mapping.fields">{Object.keys(mapping.fields.fields).map(fieldName).join(', ')}</Fact>
      </Facts>
    );
  }
  return null;
}

function RuleFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'listMappingRules', {}),
    enabled: useViewable('files_imports.mapping_rule'),
  });
  const rule = query.data?.rules.find((each) => each.ruleId === view.document.recordId);
  const version = rule?.versions.find((each) => each.ruleVersionId === view.document.versionId);
  if (rule === undefined || version === undefined) return null;
  return (
    <Facts>
      <Fact label="intake.rule.attribute">
        <span className="font-mono">{rule.attribute}</span>
      </Fact>
      <Fact label="intake.rule.scope">{t(`intake.rule.scope.${rule.scope.kind}`)}</Fact>
      <Fact label="intake.rule.word">{rule.word}</Fact>
      <Fact label="intake.rule.target">
        <span className="font-mono">{version.target}</span>
      </Fact>
    </Facts>
  );
}

/** The facts of an import confirmation, by its action type. */
export function ImportFacts({ view }: { view: ApprovalRequestView }) {
  return view.actionType === MAPPING_RULE_CONFIRMATION ? (
    <RuleFacts view={view} />
  ) : (
    <LayoutOrMappingFacts view={view} />
  );
}
