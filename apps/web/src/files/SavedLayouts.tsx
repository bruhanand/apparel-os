import {
  layoutStructureSchema,
  mappingFieldsSchema,
  type ImportLayoutList,
  type LayoutStructure,
  type MappingFields,
  type MappingRuleList,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { t, type MessageId } from '../messages/catalogue';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { className, fieldName } from './import-text';

// Layouts, mappings and mapping rules in force (imports-and-opening-data 6.1 to 6.4, 14, 16; PRD-IMP-003,
// PRD-IMP-008, POL-02.07; S1-F06-T03): each layout version with its structure and its mapping versions, each mapping
// rule with its versions, their proposers and confirmers, and the forms that propose a new one. A proposal changes no
// record: a different authorised person confirms it from My work, or from its drawer here (6.4). A layout or mapping
// version's structure is written as its JSON (6.1, 6.2), filled in from the version it follows or from the header of
// the file a preparer uploaded.

type LayoutRow = ImportLayoutList['layouts'][number];
type MappingRow = LayoutRow['mappings'][number];

const LIST_READS = ['listImportLayouts', 'listMyWork'] as const;

/** A JSON text area for a version's structure or fields, checked against its schema before it is sent. */
function JsonField({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: MessageId;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-body-sm font-semibold">{t(label)}</span>
      <textarea
        id={id}
        rows={16}
        spellCheck={false}
        aria-invalid={invalid}
        className="rounded-control border border-control bg-surface p-2 font-mono text-caption"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {invalid && (
        <span role="alert" className="text-caption text-d-fg">
          {t('intake.propose.json-invalid')}
        </span>
      )}
    </label>
  );
}

function parsed<T>(text: string, schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }) {
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

/** Propose a layout version: a new layout, or the next version of one (6.1). */
export function ProposeLayoutForm({
  layoutId,
  start,
  onDone,
}: {
  layoutId?: string;
  start: LayoutStructure;
  onDone?: () => void;
}) {
  const submission = useSubmission('proposeLayoutVersion', LIST_READS);
  const [code, setCode] = useState('');
  const [source, setSource] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [text, setText] = useState(JSON.stringify(start, null, 2));
  const [tried, setTried] = useState(false);
  const structure = parsed<LayoutStructure>(text, layoutStructureSchema);
  const formId = 'layout-proposal-form';
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (structure === undefined) return;
        void (async () => {
          const done = await submission.submit({
            body: {
              layout: layoutId === undefined ? { code, source, documentType, kinds: ['create'] } : { layoutId },
              structure,
            },
          });
          if (done !== undefined) onDone?.();
        })();
      }}
    >
      <SubmissionBanner state={submission.state} />
      <p className="m-0 text-body-sm text-text-2">{t('intake.propose.layout.help')}</p>
      {layoutId === undefined && (
        <>
          <TextInput id={`${formId}-code`} label="organisation.field.code" value={code} onChange={setCode} mono />
          <TextInput id={`${formId}-source`} label="intake.layout.source" value={source} onChange={setSource} />
          <TextInput
            id={`${formId}-type`}
            label="intake.layout.document-type"
            value={documentType}
            onChange={setDocumentType}
          />
        </>
      )}
      <JsonField
        id={`${formId}-structure`}
        label="intake.layout.structure"
        value={text}
        onChange={setText}
        invalid={tried && structure === undefined}
      />
      <FormActions form={formId} pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** Propose a mapping version: a new mapping of a layout version, or the next version of one (6.2). */
function ProposeMappingForm({
  layoutVersionId,
  mappingId,
  start,
  onDone,
}: {
  layoutVersionId: string;
  mappingId?: string;
  start: MappingFields;
  onDone: () => void;
}) {
  const submission = useSubmission('proposeMappingVersion', LIST_READS);
  const [code, setCode] = useState('');
  const [target, setTarget] = useState('merchandise');
  const [text, setText] = useState(JSON.stringify(start, null, 2));
  const [tried, setTried] = useState(false);
  const fields = parsed<MappingFields>(text, mappingFieldsSchema);
  const formId = 'mapping-proposal-form';
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (fields === undefined) return;
        void (async () => {
          const done = await submission.submit({
            body: { mapping: mappingId === undefined ? { code, layoutVersionId, target } : { mappingId }, fields },
          });
          if (done !== undefined) onDone();
        })();
      }}
    >
      <SubmissionBanner state={submission.state} />
      <p className="m-0 text-body-sm text-text-2">{t('intake.propose.mapping.help')}</p>
      {mappingId === undefined && (
        <>
          <TextInput id={`${formId}-code`} label="organisation.field.code" value={code} onChange={setCode} mono />
          <TextInput id={`${formId}-target`} label="intake.mapping.target" value={target} onChange={setTarget} mono />
        </>
      )}
      <JsonField
        id={`${formId}-fields`}
        label="intake.mapping.fields"
        value={text}
        onChange={setText}
        invalid={tried && fields === undefined}
      />
      <FormActions form={formId} pending={submission.state.kind === 'pending'} />
    </form>
  );
}

function TextInput({
  id,
  label,
  value,
  onChange,
  mono = false,
  type = 'text',
}: {
  id: string;
  label: MessageId;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  type?: 'text' | 'date';
}) {
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-body-sm font-semibold">{t(label)}</span>
      <input
        id={id}
        type={type}
        className={mono ? `${inputClass} font-mono` : inputClass}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
}

/** A starting point for a mapping: each named column to a field of the same name, as text, for a person to edit. */
function mappingStart(structure: LayoutStructure): MappingFields {
  return {
    shape: 'mapping-version/1',
    fields: Object.fromEntries(
      structure.columns
        .filter((column) => column.ignored !== true && column.restrictedClass === undefined)
        .map((column) => [
          column.name.replace(/[^A-Za-z0-9]/g, '') || 'field',
          { column: column.name, transform: 'text' },
        ]),
    ),
  };
}

/** A version's proposer and decision, and its approval panel while it waits (6.4; access-and-approvals 9.5). */
function Decision({ row, children }: { row: LayoutRow | MappingRow; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-body-sm text-text-2">
        {row.decidedAt === undefined
          ? t('intake.version.proposed')
          : t('intake.version.decided', { on: formatDate(row.decidedAt.slice(0, 10)) })}
      </p>
      {children}
      {row.request !== undefined && <ApprovalPanel requestId={row.request.id} />}
    </div>
  );
}

/** One layout version in its drawer: its columns, its mappings, and the forms that propose what follows it. */
function LayoutDrawer({ row, onClose }: { row: LayoutRow; onClose: () => void }) {
  const [proposing, setProposing] = useState<'layout' | 'mapping' | null>(null);
  const [mapping, setMapping] = useState<MappingRow | null>(null);
  return (
    <RecordDrawer
      reference={row.layoutCode}
      title={t('intake.layout.version', { code: row.layoutCode, version: row.version })}
      state={row.state}
      onClose={onClose}
      details={
        proposing === 'layout' ? (
          <ProposeLayoutForm
            layoutId={row.layoutId}
            start={row.structure}
            onDone={() => {
              setProposing(null);
            }}
          />
        ) : proposing === 'mapping' ? (
          <ProposeMappingForm
            layoutVersionId={row.layoutVersionId}
            {...(mapping === null ? {} : { mappingId: mapping.mappingId })}
            start={mapping === null ? mappingStart(row.structure) : mapping.fields}
            onDone={() => {
              setProposing(null);
            }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Decision row={row} />
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full border-collapse text-body" aria-label={t('intake.layout.columns')}>
                <thead>
                  <tr>
                    <Th label="intake.layout.column" />
                    <Th label="intake.layout.column-type" />
                    <Th label="intake.layout.column-use" />
                    <Th label="intake.layout.column-class" />
                  </tr>
                </thead>
                <tbody>
                  {row.structure.columns.map((column) => (
                    <tr key={column.name} className="h-10 border-t border-border">
                      <td className="px-3">{column.name}</td>
                      <td className="px-3">{t(`intake.column-type.${column.type ?? 'text'}`)}</td>
                      <td className="px-3">
                        {t(
                          column.ignored === true
                            ? 'intake.column-use.ignored'
                            : column.required
                              ? 'intake.column-use.required'
                              : 'intake.column-use.mapped',
                        )}
                      </td>
                      <td className="px-3">
                        {column.restrictedClass === undefined ? '' : className(column.restrictedClass)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Toolbar>
              <GrantedButton
                label="intake.propose.layout.next"
                recordType="files_imports.layout"
                action="create"
                onClick={() => {
                  setProposing('layout');
                }}
              />
              <GrantedButton
                label="intake.propose.mapping"
                recordType="files_imports.mapping"
                action="create"
                onClick={() => {
                  setMapping(null);
                  setProposing('mapping');
                }}
              />
            </Toolbar>
            {row.mappings.map((each) => (
              <Card key={each.mappingVersionId}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-h3 font-semibold">
                    {t('intake.mapping.version', { code: each.mappingCode, version: each.version })}
                  </h3>
                  <StatusBadge state={stateIdOf(each.state)} />
                </div>
                <p className="m-0 text-body-sm text-text-2">{t('intake.mapping.into', { target: each.target })}</p>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
                  {Object.entries(each.fields.fields).map(([field, source]) => (
                    <li key={field}>
                      {fieldName(field)}:{' '}
                      {'calculation' in source
                        ? t('intake.mapping.calculated', {
                            name: source.calculation.name,
                            columns: source.calculation.columns.join(', '),
                          })
                        : t(source.rules === true ? 'intake.mapping.column-with-rules' : 'intake.mapping.column', {
                            column: source.column,
                            transform: source.transform,
                          })}
                    </li>
                  ))}
                </ul>
                <Decision row={each}>
                  <div>
                    <GrantedButton
                      label="intake.propose.mapping.next"
                      recordType="files_imports.mapping"
                      action="create"
                      onClick={() => {
                        setMapping(each);
                        setProposing('mapping');
                      }}
                    />
                  </div>
                </Decision>
              </Card>
            ))}
          </div>
        )
      }
    />
  );
}

/** The layouts in force, with their versions, and Propose a layout (14). */
export function SavedLayouts() {
  const query = useQuery(readQuery(api, 'listImportLayouts', {}));
  const [open, setOpen] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  return (
    <Card title="intake.layouts">
      <Toolbar>
        <GrantedButton
          label="intake.propose.layout"
          recordType="files_imports.layout"
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
      <ListRead query={query} what="intake.layouts.what">
        {(list) => {
          const shown = list.layouts.find((each) => each.layoutVersionId === open);
          return list.layouts.length === 0 ? (
            <EmptyState title="intake.layouts.none.title" body="intake.layouts.none.body" />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full border-collapse text-body" aria-label={t('intake.layouts')}>
                <thead>
                  <tr>
                    <Th label="intake.layout" />
                    <Th label="intake.layout.source" />
                    <Th label="intake.layout.mappings" />
                    <Th label="intake.layout.state" />
                  </tr>
                </thead>
                <tbody>
                  {list.layouts.map((row) => (
                    <tr key={row.layoutVersionId} className="h-10 border-t border-border hover:bg-hover">
                      <td className="px-3">
                        <button
                          type="button"
                          className="font-mono text-accent underline"
                          onClick={() => {
                            setOpen(row.layoutVersionId);
                          }}
                        >
                          {t('intake.layout.version', { code: row.layoutCode, version: row.version })}
                        </button>
                      </td>
                      <td className="px-3">{row.source}</td>
                      <td className="px-3">
                        {row.mappings
                          .map((each) => t('intake.mapping.version', { code: each.mappingCode, version: each.version }))
                          .join(', ')}
                      </td>
                      <td className="px-3">
                        <StatusBadge state={stateIdOf(row.state)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown !== undefined && (
                <LayoutDrawer
                  row={shown}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              )}
            </div>
          );
        }}
      </ListRead>
      {proposing && (
        <RecordDrawer
          title={t('intake.propose.layout')}
          onClose={() => {
            setProposing(false);
          }}
          details={
            <ProposeLayoutForm
              start={{
                shape: 'layout-version/1',
                format: 'xlsx',
                sheet: '',
                headerRow: 1,
                dataStartRow: 2,
                columns: [{ name: '', required: true }],
                documentReference: '',
              }}
            />
          }
        />
      )}
    </Card>
  );
}

type RuleRow = MappingRuleList['rules'][number];

/** Propose a mapping rule (6.3): one source word of one attribute, in one scope, to one approved value. */
function ProposeRuleForm() {
  const submission = useSubmission('proposeMappingRule', ['listMappingRules', 'listMyWork']);
  const [attribute, setAttribute] = useState('merchandise.brandCode');
  const [scope, setScope] = useState<'organisation' | 'layout' | 'supplier' | 'brand'>('organisation');
  const [scopeId, setScopeId] = useState('');
  const [word, setWord] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [target, setTarget] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const formId = 'mapping-rule-proposal-form';
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submission.submit({
          body: {
            attribute,
            scope: scope === 'organisation' ? { kind: 'organisation' } : { kind: scope, id: scopeId },
            word,
            caseSensitive,
            target,
            validFrom,
            ...(validTo === '' ? {} : { validTo }),
          },
        });
      }}
    >
      <SubmissionBanner state={submission.state} />
      <p className="m-0 text-body-sm text-text-2">{t('intake.propose.rule.help')}</p>
      <TextInput
        id={`${formId}-attribute`}
        label="intake.rule.attribute"
        value={attribute}
        onChange={setAttribute}
        mono
      />
      <label className="flex flex-col gap-1" htmlFor={`${formId}-scope`}>
        <span className="text-body-sm font-semibold">{t('intake.rule.scope')}</span>
        <select
          id={`${formId}-scope`}
          className={inputClass}
          value={scope}
          onChange={(event) => {
            setScope(event.target.value as typeof scope);
          }}
        >
          {(['organisation', 'layout', 'supplier', 'brand'] as const).map((each) => (
            <option key={each} value={each}>
              {t(`intake.rule.scope.${each}`)}
            </option>
          ))}
        </select>
      </label>
      {scope !== 'organisation' && (
        <TextInput id={`${formId}-scope-id`} label="intake.rule.scope-id" value={scopeId} onChange={setScopeId} mono />
      )}
      <TextInput id={`${formId}-word`} label="intake.rule.word" value={word} onChange={setWord} />
      <label className="flex items-center gap-2" htmlFor={`${formId}-case`}>
        <input
          id={`${formId}-case`}
          type="checkbox"
          checked={caseSensitive}
          onChange={(event) => {
            setCaseSensitive(event.target.checked);
          }}
        />
        <span className="text-body-sm">{t('intake.rule.case-sensitive')}</span>
      </label>
      <TextInput id={`${formId}-target`} label="intake.rule.target" value={target} onChange={setTarget} mono />
      <TextInput
        id={`${formId}-from`}
        label="intake.rule.valid-from"
        value={validFrom}
        onChange={setValidFrom}
        type="date"
      />
      <TextInput id={`${formId}-to`} label="intake.rule.valid-to" value={validTo} onChange={setValidTo} type="date" />
      <FormActions form={formId} pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** The mapping rules with their versions (14), and Propose a rule. */
export function MappingRules() {
  const query = useQuery(readQuery(api, 'listMappingRules', {}));
  const [proposing, setProposing] = useState(false);
  const [open, setOpen] = useState<{ rule: RuleRow; version: RuleRow['versions'][number] } | null>(null);
  return (
    <Card title="intake.rules">
      <Toolbar>
        <GrantedButton
          label="intake.propose.rule"
          recordType="files_imports.mapping_rule"
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
      <ListRead query={query} what="intake.rules.what">
        {(list) =>
          list.rules.length === 0 ? (
            <EmptyState title="intake.rules.none.title" body="intake.rules.none.body" />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full border-collapse text-body" aria-label={t('intake.rules')}>
                <thead>
                  <tr>
                    <Th label="intake.rule.attribute" />
                    <Th label="intake.rule.scope" />
                    <Th label="intake.rule.word" />
                    <Th label="intake.rule.target" />
                    <Th label="intake.rule.dates" />
                    <Th label="intake.layout.state" />
                  </tr>
                </thead>
                <tbody>
                  {list.rules.flatMap((rule) =>
                    rule.versions.map((version) => (
                      <tr key={version.ruleVersionId} className="h-10 border-t border-border hover:bg-hover">
                        <td className="px-3 font-mono">{rule.attribute}</td>
                        <td className="px-3">{t(`intake.rule.scope.${rule.scope.kind}`)}</td>
                        <td className="px-3">
                          <button
                            type="button"
                            className="text-accent underline"
                            onClick={() => {
                              setOpen({ rule, version });
                            }}
                          >
                            {rule.word}
                          </button>
                        </td>
                        <td className="px-3 font-mono">{version.target}</td>
                        <td className="px-3">
                          {version.validTo === undefined
                            ? t('dates.from', { from: formatDate(version.validFrom) })
                            : t('dates.between', {
                                from: formatDate(version.validFrom),
                                to: formatDate(version.validTo),
                              })}
                        </td>
                        <td className="px-3">
                          <StatusBadge state={stateIdOf(version.inForce ? 'In force' : version.state)} />
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )
        }
      </ListRead>
      {proposing && (
        <RecordDrawer
          title={t('intake.propose.rule')}
          onClose={() => {
            setProposing(false);
          }}
          details={<ProposeRuleForm />}
        />
      )}
      {open !== null && (
        <RecordDrawer
          reference={open.rule.attribute}
          title={open.rule.word}
          state={open.version.state}
          onClose={() => {
            setOpen(null);
          }}
          details={
            open.version.request === undefined ? (
              <Banner tone="info" role="status" message="intake.version.no-request" />
            ) : (
              <ApprovalPanel requestId={open.version.request.id} />
            )
          }
        />
      )}
    </Card>
  );
}
