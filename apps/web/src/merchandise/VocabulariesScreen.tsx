import { routes, type VocabularyProposal } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { useRouteForm } from '../forms/use-route-form';
import { t, type MessageId } from '../messages/catalogue';
import { MasterTab, useAllRecords, type MasterRecord } from '../organisation/MasterTab';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';

// Setup › Vocabularies (structure-and-masters 4.2, 8; ui-blueprint Setup › Vocabularies; S1-F03-T01): Brand edits the
// brand records, Sub category the category tree and Size the size sets; each list-type attribute the Organisation
// configures, such as a season or a colour, has a tab of its own with its approved values and its proposals, each
// confirmed by a different person from My work (PRD-IMP-008, POL-02.07); Attributes configures them. No attribute or
// value is set in the app: the tabs are the Organisation's own. Each master shows its version history and the version
// in force on a chosen date.

type Tab =
  | {
      readonly kind: 'master';
      readonly master: 'brand' | 'category' | 'size_set' | 'attribute';
      readonly label: string;
    }
  | { readonly kind: 'values'; readonly attribute: MasterRecord; readonly label: string };

const latestName = (record: MasterRecord): string => {
  const name = record.versions[0]?.name;
  return typeof name === 'string' ? name : record.code;
};

/** The approval panel of a proposal, opened in a drawer: its confirmer decides it there or from My work (9.5). */
function ProposalDrawer({ proposal, onClose }: { proposal: VocabularyProposal; onClose: () => void }) {
  return (
    <RecordDrawer
      reference={proposal.code}
      title={proposal.name}
      state={proposal.state}
      onClose={onClose}
      details={
        proposal.request === undefined ? (
          <p className="m-0 text-body-sm text-text-2">{t('merchandise.proposal.no-request')}</p>
        ) : (
          <ApprovalPanel requestId={proposal.request.id} />
        )
      }
    />
  );
}

/** Propose a value of the attribute (4.2): it is no value until a different person confirms it. */
function ProposeForm({ attributeId }: { attributeId: string }) {
  const route = routes.proposeVocabularyValue;
  const submission = useSubmission('proposeVocabularyValue', [
    'listVocabularyProposals',
    'listVocabularyValues',
    'listMyWork',
  ]);
  const form = useRouteForm(route, { attributeId, code: '', name: '' });
  const formId = 'vocabulary-proposal-form';
  const codeError = form.formState.errors.code;
  const nameError = form.formState.errors.name;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          await submission.submit({ body: values });
        })(event);
      }}
    >
      <SubmissionBanner state={submission.state} />
      <p className="m-0 text-body-sm text-text-2">{t('merchandise.proposal.help')}</p>
      <FormField id={`${formId}-code`} label="organisation.field.code" required error={codeError}>
        <input
          id={`${formId}-code`}
          className={`${inputClass} font-mono`}
          {...describedBy(`${formId}-code`, { invalid: codeError !== undefined, help: false })}
          {...form.register('code')}
        />
      </FormField>
      <FormField id={`${formId}-name`} label="organisation.field.name" required error={nameError}>
        <input
          id={`${formId}-name`}
          className={inputClass}
          {...describedBy(`${formId}-name`, { invalid: nameError !== undefined, help: false })}
          {...form.register('name')}
        />
      </FormField>
      <FormActions form={formId} pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** An attribute's approved values and its proposals (4.2). */
function ValuesTab({ attribute }: { attribute: MasterRecord }) {
  const [proposing, setProposing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const query = useQuery(readQuery(api, 'listVocabularyProposals', { query: {} }));
  return (
    <div className="flex flex-col gap-4">
      <Card title="merchandise.values">
        <MasterTab kind="vocabulary_value" where={{ field: 'attributeId', equals: attribute.id }} />
      </Card>
      <Card title="merchandise.proposals">
        <Toolbar>
          <GrantedButton
            label="merchandise.propose"
            recordType="merchandise.vocabulary_proposal"
            action="create"
            variant="primary"
            onClick={() => {
              setProposing(true);
            }}
          />
          <span className="flex-1" />
          <Button
            label="setup.refresh"
            onClick={() => {
              void query.refetch();
            }}
          />
        </Toolbar>
        <ListRead query={query} what="merchandise.what.vocabulary_proposal">
          {(page) => {
            const proposals = page.records.filter((each) => each.attributeId === attribute.id);
            const shown = proposals.find((each) => each.id === open);
            return proposals.length === 0 ? (
              <EmptyState title="merchandise.proposals.empty.title" body="merchandise.proposals.empty.body" />
            ) : (
              <div className="overflow-x-auto rounded-card border border-border bg-surface">
                <table className="w-full border-collapse text-body" aria-label={t('merchandise.proposals')}>
                  <thead>
                    <tr>
                      <Th label="organisation.field.code" />
                      <Th label="organisation.field.name" />
                      <Th label="merchandise.proposal.proposed-on" />
                      <Th label="merchandise.proposal.state" />
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((proposal) => (
                      <tr key={proposal.id} className="h-10 border-t border-border hover:bg-hover">
                        <td className="px-3">
                          <button
                            type="button"
                            className="font-mono text-accent underline"
                            onClick={() => {
                              setOpen(proposal.id);
                            }}
                          >
                            {proposal.code}
                          </button>
                        </td>
                        <td className="px-3">{proposal.name}</td>
                        <td className="px-3">{formatDate(proposal.proposedAt.slice(0, 10))}</td>
                        <td className="px-3">
                          <StatusBadge state={stateIdOf(proposal.state)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shown !== undefined && (
                  <ProposalDrawer
                    proposal={shown}
                    onClose={() => {
                      setOpen(null);
                    }}
                  />
                )}
              </div>
            );
          }}
        </ListRead>
      </Card>
      {proposing && (
        <RecordDrawer
          title={t('merchandise.propose')}
          onClose={() => {
            setProposing(false);
          }}
          details={<ProposeForm attributeId={attribute.id} />}
        />
      )}
    </div>
  );
}

const MASTER_TABS: readonly { master: 'brand' | 'category' | 'size_set'; label: MessageId }[] = [
  { master: 'brand', label: 'merchandise.tab.brand' },
  { master: 'category', label: 'merchandise.tab.category' },
  { master: 'size_set', label: 'merchandise.tab.size_set' },
];

/** Setup › Vocabularies. */
export function VocabulariesScreen() {
  const attributes = useAllRecords('attribute');
  const tabs: Tab[] = [
    ...MASTER_TABS.map((each): Tab => ({ kind: 'master', master: each.master, label: t(each.label) })),
    ...attributes
      .filter((record) => record.valueKind === 'list')
      .map((record): Tab => ({ kind: 'values', attribute: record, label: latestName(record) })),
    { kind: 'master', master: 'attribute', label: t('merchandise.tab.attribute') },
  ];
  const keyOf = (tab: Tab) => (tab.kind === 'master' ? tab.master : tab.attribute.id);
  const [current, setCurrent] = useState<string>('brand');
  const shown = tabs.find((tab) => keyOf(tab) === current) ?? tabs[0];
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={t('screen.setup.vocabularies')}
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {tabs.map((tab) => {
          const key = keyOf(tab);
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`vocabulary-tab-${key}`}
              aria-selected={shown !== undefined && keyOf(shown) === key}
              aria-controls="vocabulary-tab-panel"
              className={
                shown !== undefined && keyOf(shown) === key
                  ? 'h-9 border-b-2 border-accent px-3 font-semibold text-text'
                  : 'h-9 px-3 text-text-2 hover:text-accent'
              }
              onClick={() => {
                setCurrent(key);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {shown !== undefined && (
        <div id="vocabulary-tab-panel" role="tabpanel" aria-labelledby={`vocabulary-tab-${keyOf(shown)}`}>
          {shown.kind === 'master' ? (
            <MasterTab key={shown.master} kind={shown.master} />
          ) : (
            <ValuesTab key={shown.attribute.id} attribute={shown.attribute} />
          )}
        </div>
      )}
    </div>
  );
}
