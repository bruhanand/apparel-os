import {
  ACTIVITY_APPROVAL,
  BOOKING_APPROVAL,
  BOOKING_TYPE,
  OPEN_TO_BUY_APPROVAL,
  OPEN_TO_BUY_BUDGET_TYPE,
  OPEN_TO_BUY_CHECK,
  AGREEMENT_CHANGE,
  BANK_DETAILS_CHANGE,
  BILL_FORMAT_CHANGE_APPROVAL,
  BILL_FORMAT_CHANGE_TYPE,
  DAMAGE_DECISION,
  DAMAGE_REPORT_TYPE,
  DAMAGE_REVERSAL_APPROVAL,
  FINANCIAL_YEAR_CHANGE_APPROVAL,
  FINANCIAL_YEAR_CHANGE_TYPE,
  HELD_LINE_DECISION,
  ARRIVAL_TYPE,
  LAYOUT_CONFIRMATION,
  MAPPING_CONFIRMATION,
  MARKED_ATTRIBUTE_CHANGE,
  MARKED_ATTRIBUTE_TYPE,
  MAPPING_RULE_CONFIRMATION,
  PERIOD_REOPENING_APPROVAL,
  PRODUCT_CONFIRMATION,
  SITE_READINESS_APPROVAL,
  VOCABULARY_CONFIRMATION,
  type ApprovalRequestView,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../api';
import { allPagesQuery, readQuery } from '../api/query';
import { isMessageId, t, type MessageId } from '../messages/catalogue';
import { PersonaChip } from '../shell/AppShell';
import { useSession, useTimeZone } from '../shell/session';
import { limitHolderText, limitText, permissionText, scopeText } from '../setup/describe';
import { formatText } from '../setup/format-parts';
import { formatDate, formatList, formatPaise, formatQuantity } from '../setup/format';
import { stateIdOf } from '../setup/states';
import { MasterFacts } from '../organisation/MasterFacts';
import { formatDateTime } from '../history/format';
import { missingText } from '../components/UnavailableState';
import { AttributeName } from '../merchandise/AttributeName';
import { MARK_LABEL } from '../merchandise/marked';
import { OpenToBuyFacts, TermsFacts, TotalsView } from '../booking/facts';
import { useBookingNames } from '../booking/names';
import { ImportFacts } from './ImportFacts';
import { DamageReportFacts } from '../stock/DamageReport';
import { actionTitle } from './subject';

// The material facts of the version an approval request binds to (PRD-ACS-007; access-and-approvals 9.1; spec
// section 5 step 6), read through the same lists the access setup screens use, where the reader's role assignments
// grant them. Shown as read-only fields on the approval panel (design-language 10.14).

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

function dates(validFrom: string, validTo: string | undefined): string {
  return validTo === undefined
    ? t('dates.from', { from: formatDate(validFrom) })
    : t('dates.between', { from: formatDate(validFrom), to: formatDate(validTo) });
}

function useViewable(recordType: string): boolean {
  const { session } = useSession();
  if (session.state === 'signed-out') return false;
  return session.grants.some((grant) => grant.recordType === recordType && grant.action === 'view');
}

function UserFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({ ...readQuery(api, 'listUsers', {}), enabled: useViewable('access.user') });
  const user = query.data?.users.find((each) => each.id === view.document.recordId);
  const version = user?.versions.find((each) => each.id === view.document.versionId);
  if (user === undefined || version === undefined) return null;
  return (
    <Facts>
      <Fact label="user.login">
        <span className="font-mono">{user.login}</span>
      </Fact>
      <Fact label="user.display-name">{version.displayName}</Fact>
      <Fact label="user.personas">
        <span className="flex flex-wrap gap-1">
          {version.personas.map((persona) => (
            <PersonaChip key={persona} persona={persona} />
          ))}
        </span>
      </Fact>
      <Fact label="user.state">{t(`user-state.${version.userState}`)}</Fact>
    </Facts>
  );
}

function RoleFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({ ...readQuery(api, 'listRoles', {}), enabled: useViewable('access.role') });
  const role = query.data?.roles.find((each) => each.id === view.document.recordId);
  const version = role?.versions.find((each) => each.id === view.document.versionId);
  if (role === undefined || version === undefined) return null;
  return (
    <Facts>
      <Fact label="role.code">
        <span className="font-mono">{role.code}</span>
      </Fact>
      <Fact label="role.name">{version.name}</Fact>
      <Fact label="dates.label">{dates(version.validFrom, version.validTo)}</Fact>
      <Fact label="role.permissions">
        <ul className="m-0 list-none p-0">
          {version.permissions.map((permission, index) => (
            <li key={index}>{permissionText(permission)}</li>
          ))}
        </ul>
      </Fact>
    </Facts>
  );
}

function AssignmentFacts({ view, withdrawal }: { view: ApprovalRequestView; withdrawal: boolean }) {
  const query = useQuery({
    ...readQuery(api, 'listRoleAssignments', {}),
    enabled: useViewable('access.role_assignment'),
  });
  const assignment = query.data?.assignments.find((each) =>
    withdrawal ? each.withdrawal?.id === view.document.recordId : each.id === view.document.recordId,
  );
  if (assignment === undefined) return null;
  return (
    <Facts>
      <Fact label="assignment.actor">
        {assignment.actor.kind === 'user' ? (assignment.actor.name ?? assignment.actor.userId) : assignment.actor.code}
      </Fact>
      <Fact label="assignment.role">
        <span className="font-mono">{assignment.role.code}</span>
      </Fact>
      <Fact label="assignment.scope">{scopeText(assignment.scope)}</Fact>
      <Fact label="dates.label">{dates(assignment.validFrom, assignment.validTo)}</Fact>
      {withdrawal && assignment.withdrawal !== undefined && (
        <Fact label="assignment.withdrawal-reason">{assignment.withdrawal.reason}</Fact>
      )}
    </Facts>
  );
}

function ReasonFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'listApprovalReasonRecords', {}),
    enabled: useViewable('access.approval_reason'),
  });
  const reason = query.data?.reasons.find((each) => each.id === view.document.recordId);
  const version = reason?.versions.find((each) => each.id === view.document.versionId);
  if (reason === undefined || version === undefined) return null;
  return (
    <Facts>
      <Fact label="reason.code">
        <span className="font-mono">{reason.code}</span>
      </Fact>
      <Fact label="reason.kind">{t(`reason.kind.${reason.kind}`)}</Fact>
      <Fact label="reason.text">{version.text}</Fact>
      <Fact label="dates.label">{dates(version.validFrom, version.validTo)}</Fact>
    </Facts>
  );
}

/** A security setting version: the setting, its values, origin and when it takes effect (S1-F01-T25; DEC-118). */
function SettingFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({ ...readQuery(api, 'listSecuritySettings', {}), enabled: useViewable('access.setting') });
  const setting = query.data?.settings.find((each) => each.settingId === view.document.recordId);
  const version = setting?.versions.find((each) => each.id === view.document.versionId);
  if (setting === undefined || version === undefined) return null;
  const values = version.value as Record<string, number>;
  return (
    <Facts>
      <Fact label="security.setting">{t(`security.setting.${setting.setting}`)}</Fact>
      {Object.keys(values).map((field) => (
        <Fact key={field} label={`security.field.${field}` as MessageId}>
          <span className="font-mono">{String(values[field])}</span>
        </Fact>
      ))}
      <Fact label="security.origin">{t(`security.origin.${version.origin}`)}</Fact>
      <Fact label="security.takes-effect">
        {version.takesEffect.kind === 'at-decision'
          ? t('security.takes-effect.at-decision')
          : t('security.from', { from: formatDate(version.takesEffect.date) })}
      </Fact>
    </Facts>
  );
}

/** An approval limit: its action, holder, limit on its basis, Unknown authority and dates (9.2; S1-F05-T01). */
function LimitFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...allPagesQuery(api, 'listApprovalLimits'),
    enabled: useViewable('access.approval_limit'),
  });
  const limit = query.data?.limits.find((each) => each.id === view.document.recordId);
  if (limit === undefined) return null;
  return (
    <Facts>
      <Fact label="limits.action-type">{actionTitle(limit.actionType)}</Fact>
      <Fact label="limits.holder">{limitHolderText(limit)}</Fact>
      <Fact label="limits.limit">{limitText(limit)}</Fact>
      <Fact label="limits.unknown-value">
        {t(limit.coversUnknown ? 'limits.unknown.covered' : 'limits.unknown.not-covered')}
      </Fact>
      <Fact label="dates.label">{dates(limit.validFrom, limit.validTo)}</Fact>
      <Fact label="rules.origin">{t(`rules.origin.${limit.origin}`)}</Fact>
    </Facts>
  );
}

/**
 * A vocabulary proposal: the attribute, the proposed code and name, and its state; its proposer is never its
 * confirmer (structure-and-masters 4.2; PRD-IMP-008; S1-F03-T01).
 */
function ProposalFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'readVocabularyProposal', { params: { proposalId: view.document.recordId } }),
    enabled: useViewable('merchandise.vocabulary_proposal'),
  });
  const attributes = useQuery({
    ...readQuery(api, 'readAttribute', { params: { recordId: query.data?.proposal.attributeId ?? '' } }),
    enabled: useViewable('merchandise.attribute') && query.data !== undefined,
  });
  const proposal = query.data?.proposal;
  if (proposal === undefined) return null;
  const attributeName = attributes.data?.record.versions[0]?.name;
  return (
    <Facts>
      <Fact label="merchandise.field.attributeId">
        {attributeName ?? attributes.data?.record.code ?? t('organisation.unknown')}
      </Fact>
      <Fact label="organisation.field.code">
        <span className="font-mono">{proposal.code}</span>
      </Fact>
      <Fact label="organisation.field.name">{proposal.name}</Fact>
      <Fact label="merchandise.proposal.state">{t(`state.${stateIdOf(proposal.state)}`)}</Fact>
    </Facts>
  );
}

/**
 * A product proposal: the style it makes or adds to, and each SKU with its size, stock unit and purpose, Unknown shown
 * as Unknown; and the original source words. Its proposer is never its confirmer (structure-and-masters 4.2; DM-5,
 * DEC-105; S1-F03-T02).
 */
function ProductProposalFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'readProductProposal', { params: { proposalId: view.document.recordId } }),
    enabled: useViewable('merchandise.product_proposal'),
  });
  const proposal = query.data?.proposal;
  if (proposal === undefined) return null;
  return (
    <Facts>
      <Fact label="products.style">
        <span className="font-mono">{proposal.style?.code ?? proposal.styleId}</span>
      </Fact>
      <Fact label="products.proposal.skus">
        <ul className="m-0 list-none p-0">
          {proposal.skus.map((sku) => (
            <li key={sku.code}>
              <span className="font-mono">{sku.code}</span> · {sku.size ?? t('organisation.unknown')} ·{' '}
              {t(`merchandise.stock-unit.${sku.stockUnit}`)} · {t(`merchandise.purpose.${sku.purpose}`)}
            </li>
          ))}
        </ul>
      </Fact>
      <Fact label="products.source-words">{proposal.sourceWords ?? t('organisation.unknown')}</Fact>
      <Fact label="merchandise.proposal.state">{t(`state.${stateIdOf(proposal.state)}`)}</Fact>
    </Facts>
  );
}

/**
 * A bank-detail change: the party, the dates, and the new details masked, as they stay on every read; Show on the
 * party opens them with a fresh code (structure-and-masters 5.1; access-and-approvals 6; S1-F03-T03).
 */
function BankDetailsFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'readParty', { params: { partyId: view.document.recordId } }),
    enabled: useViewable('merchandise.party'),
  });
  const party = query.data?.record;
  const version = party?.bankDetails.versions.find((each) => each.id === view.document.versionId);
  if (party === undefined || version === undefined) return null;
  return (
    <Facts>
      <Fact label="parties.facts.party">
        <span className="font-mono">{party.code}</span> {party.versions[0]?.legalName}
      </Fact>
      <Fact label="dates.label">{dates(version.validFrom, version.validTo)}</Fact>
      <Fact label="parties.bank.title">{t('parties.facts.bank')}</Fact>
    </Facts>
  );
}

/** An agreement version: its code, model and dates (structure-and-masters 5.2; S1-F03-T03). */
function AgreementFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'readAgreement', { params: { agreementId: view.document.recordId } }),
    enabled: useViewable('merchandise.agreement'),
  });
  const agreement = query.data?.record;
  const version = agreement?.versions.find((each) => each.id === view.document.versionId);
  if (agreement === undefined || version === undefined) return null;
  return (
    <Facts>
      <Fact label="organisation.field.code">
        <span className="font-mono">{agreement.code}</span>
      </Fact>
      <Fact label="agreement.field.commercialModel">
        {version.terms.commercialModel === null
          ? t('agreement.option.unknown')
          : t(`agreement.model.${version.terms.commercialModel}`)}
      </Fact>
      <Fact label="dates.label">{dates(version.validFrom, version.validTo)}</Fact>
    </Facts>
  );
}

/**
 * A readiness run put forward for approval: a Site's shared readiness or a unit's activity, each check with its state
 * and what it lacked, and the zero opening-stock declaration its stock plan relied on, which the approver approves
 * with it (module-map 4.16; PRD-LIF-001 to PRD-LIF-003; RR-483; product owner, 10 Oct 2026).
 */
function ReadinessFacts({ view }: { view: ApprovalRequestView }) {
  const timeZone = useTimeZone();
  const query = useQuery({
    ...readQuery(api, 'readReadinessRecord', { params: { readinessRecordId: view.document.versionId } }),
    enabled: useViewable('site_lifecycle.readiness_record'),
  });
  const read = query.data;
  if (read === undefined) return null;
  const { record } = read;
  const activity = `activity.${record.activity}`;
  return (
    <Facts>
      <Fact label="readiness.facts.activity">{isMessageId(activity) ? t(activity) : record.activity}</Fact>
      <Fact label="readiness.facts.place">
        {t(record.businessUnitId === null ? 'readiness.facts.place.site' : 'readiness.facts.place.unit')}
      </Fact>
      <Fact label="readiness.facts.checks">
        <ul className="m-0 list-none p-0">
          {record.checks.map((check) => {
            const name = `readiness.check.${check.check}`;
            return (
              <li key={check.check}>
                {isMessageId(name) ? t(name) : check.check} · {t(`readiness.state.${check.state}`)}
                {check.missing.length > 0 && ` · ${check.missing.map(missingText).join(' ')}`}
              </li>
            );
          })}
        </ul>
      </Fact>
      {record.businessUnitId !== null && (
        <Fact label="readiness.facts.zero-stock">
          {read.zeroStockDeclaration === null
            ? t('readiness.facts.zero-stock.none')
            : t('readiness.stock-plan.declared', {
                name: read.zeroStockDeclaration.declaredBy,
                at: formatDateTime(read.zeroStockDeclaration.declaredAt, timeZone),
              })}
        </Fact>
      )}
    </Facts>
  );
}

/**
 * A reopening of a Locked period as requested: its period, reason and named corrections, which the approval binds to
 * (books-and-posting 4.3; PRD-LED-019, PRD-LED-020, PRD-ACS-007; S1-F09-T03).
 */
function ReopeningFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'readReopening', { params: { reopeningId: view.document.recordId } }),
    enabled: useViewable('finance.period_reopening'),
  });
  const read = query.data;
  if (read === undefined) return null;
  return (
    <Facts>
      <Fact label="reopening.period">
        {t('finance.period.option', {
          code: read.period.code,
          first: formatDate(read.period.firstDay),
          last: formatDate(read.period.lastDay),
        })}
      </Fact>
      <Fact label="reopening.reason">{read.reopening.reason}</Fact>
      <Fact label="reopening.corrections">
        <ul className="m-0 list-none p-0">
          {read.reopening.corrections.map((each) => (
            <li key={`${each.module}|${each.recordType}|${each.recordId}`} className="font-mono">
              {each.module} · {each.recordType} · {each.recordId}
            </li>
          ))}
        </ul>
      </Fact>
    </Facts>
  );
}

/**
 * A financial year as it is to be defined: its label, dates and origin, which the approval binds to (offline-counter
 * 4.3b; numbering-and-audit 3.3; PRD-ACS-007; S1-F12-T03).
 */
function FinancialYearFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'listFinancialYears', {}),
    enabled: useViewable(FINANCIAL_YEAR_CHANGE_TYPE),
  });
  const change = query.data?.changes.find((each) => each.changeId === view.document.recordId);
  if (change === undefined) return null;
  return (
    <Facts>
      <Fact label="numbering.year.label">{change.label}</Fact>
      <Fact label="numbering.year.first">{formatDate(change.firstDay)}</Fact>
      <Fact label="numbering.year.last">{formatDate(change.lastDay)}</Fact>
      <Fact label="numbering.origin">{t(`security.origin.${change.origin}`)}</Fact>
    </Facts>
  );
}

/** A bill-number format as it is to be set: its code, parts and origin (offline-counter 4.3b; 3.5; S1-F12-T03). */
function BillFormatFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({ ...readQuery(api, 'readBillFormat', {}), enabled: useViewable(BILL_FORMAT_CHANGE_TYPE) });
  const change = query.data?.changes.find((each) => each.changeId === view.document.recordId);
  if (change === undefined) return null;
  return (
    <Facts>
      <Fact label="numbering.format.code">{change.formatCode}</Fact>
      <Fact label="numbering.format.parts">
        <span className="font-mono">{formatText(change.parts)}</span>
      </Fact>
      <Fact label="numbering.origin">{t(`security.origin.${change.origin}`)}</Fact>
    </Facts>
  );
}

/**
 * An open-to-buy budget version, for Accounts' check and for its approval: the brand and season, the amount of the
 * version decided, where it came from, and, at the approval, when Accounts checked it (goods-in 3.3; POL-05.09;
 * S2-F01-T02). The budget is read with view on its own type, within the reader's brand scope.
 */
function BudgetFacts({ view }: { view: ApprovalRequestView }) {
  const timeZone = useTimeZone();
  const query = useQuery({
    ...readQuery(api, 'readOpenToBuyBudget', { params: { budgetId: view.document.recordId } }),
    enabled: useViewable(OPEN_TO_BUY_BUDGET_TYPE),
  });
  const budget = query.data?.budget;
  const version = budget?.versions.find((each) => each.id === view.document.versionId);
  if (budget === undefined || version === undefined) return null;
  return (
    <Facts>
      <Fact label="budget.brand">
        <span className="font-mono">{budget.brand.code}</span> {budget.brand.name}
      </Fact>
      <Fact label="budget.season">
        <span className="font-mono">{budget.season.code ?? t('organisation.unknown')}</span> {budget.season.name}
      </Fact>
      <Fact label="budget.amount">
        <span className="tabular-nums">{formatPaise(version.amount)}</span>
      </Fact>
      <Fact label="rules.origin">{t(`rules.origin.${version.origin}`)}</Fact>
      <Fact label="budget.check">
        {version.check === undefined
          ? t('budget.awaiting.check')
          : t('budget.checked-at', { at: formatDateTime(version.check.checkedAt, timeZone) })}
      </Fact>
    </Facts>
  );
}

/**
 * A booking version, for its approval (goods-in 3.4; S2-F01-T03): its brand, season, supplier, destination and window,
 * its totals at cost and MRP by style, its documents, the brand's Agreement terms and the remaining open-to-buy of its
 * brand and season, so the approver decides on what was entered and on what the budget leaves. The booking is read with
 * view on its own type, within the reader's scope.
 */
function BookingFacts({ view }: { view: ApprovalRequestView }) {
  const names = useBookingNames();
  const query = useQuery({
    ...readQuery(api, 'readBooking', { params: { bookingId: view.document.recordId } }),
    enabled: useViewable(BOOKING_TYPE),
  });
  const booking = query.data?.booking;
  if (booking?.version.id !== view.document.versionId) return null;
  const { version } = booking;
  return (
    <div className="flex flex-col gap-3">
      <Facts>
        <Fact label="booking.brand">{names.brand.field(booking.brandId)}</Fact>
        <Fact label="booking.season">{names.season.field(version.season.valueId)}</Fact>
        <Fact label="booking.supplier">{names.party.field(version.supplierPartyId)}</Fact>
        <Fact label="booking.destination">{names.site.field(booking.destinationSiteId)}</Fact>
        <Fact label="booking.window">
          {t('booking.window.range', {
            from: formatDate(version.deliveryWindow.from),
            to: formatDate(version.deliveryWindow.to),
          })}
        </Fact>
        <Fact label="booking.documents">{t('booking.documents.count', { count: booking.documents.length })}</Fact>
      </Facts>
      <TotalsView lines={version.lines} />
      <section aria-label={t('booking.open-to-buy')} className="flex flex-col gap-1">
        <h4 className="text-label font-semibold text-text-2">{t('booking.open-to-buy')}</h4>
        <OpenToBuyFacts remaining={booking.openToBuy} />
      </section>
      <section aria-label={t('booking.terms')} className="flex flex-col gap-1">
        <h4 className="text-label font-semibold text-text-2">{t('booking.terms')}</h4>
        <TermsFacts terms={booking.terms} />
      </section>
    </div>
  );
}

/**
 * A version of the season or size attribute: which it marks, the attribute it names and what is in force now, and
 * where the choice came from (structure-and-masters 4.2 "As built"; RR-550, RR-556).
 */
function MarkedAttributeFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'readMarkedAttributeVersion', { params: { versionId: view.document.versionId } }),
    enabled: useViewable(MARKED_ATTRIBUTE_TYPE),
  });
  if (query.data === undefined) return null;
  const { mark, inForce, version } = query.data;
  return (
    <Facts>
      <Fact label="marked.title">{t(MARK_LABEL[mark])}</Fact>
      <Fact label="marked.attribute">
        <AttributeName attributeId={version.attributeId} />
      </Fact>
      <Fact label="marked.in-force">
        {inForce.kind === 'set' ? <AttributeName attributeId={inForce.attributeId} /> : t('marked.not-set')}
      </Fact>
      <Fact label="rules.origin">{t(`rules.origin.${version.origin}`)}</Fact>
    </Facts>
  );
}

/**
 * A damage report, for its decision, or the report a reversal of its confirmation belongs to, for the reversal's
 * approval: the goods and quantity, what is wrong, the photos and the decisions so far (goods-in 8.3, 8.5; S2-F08-T01).
 * The report is read with view on its own type, within the reader's scope.
 */
function DamageFacts({ view, reversal }: { view: ApprovalRequestView; reversal: boolean }) {
  const viewable = useViewable(DAMAGE_REPORT_TYPE);
  const report = useQuery({
    ...readQuery(api, 'readDamageReport', { params: { damageReportId: view.document.recordId } }),
    enabled: viewable && !reversal,
  });
  const ofReversal = useQuery({
    ...readQuery(api, 'readDamageReversal', { params: { damageReversalId: view.document.recordId } }),
    enabled: viewable && reversal,
  });
  const read = (reversal ? ofReversal : report).data?.report;
  if (read === undefined) return null;
  const proposed = read.reversals.find((each) => each.id === view.document.recordId);
  return (
    <Facts>
      <Fact label="damage.number">{read.number}</Fact>
      {proposed !== undefined && <Fact label="damage.reversal.reason">{proposed.reason}</Fact>}
      <div className="sm:col-span-2">
        <DamageReportFacts report={read} />
      </div>
    </Facts>
  );
}

/**
 * A held line, for its decision (goods-in 4.6, section 11; S2-F02-T03): the GRN and its line as counted, with what the
 * count found, how many pieces are held and how, and the product Booking named for unidentified goods. Read with view
 * on the Arrival, within the reader's scope.
 */
function HeldLineFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'readHeldLine', { params: { heldLineId: view.document.recordId } }),
    enabled: useViewable(ARRIVAL_TYPE),
  });
  const read = query.data;
  const held = read?.line.heldLine;
  if (read === undefined || held === undefined || held === null) return null;
  const { line } = read;
  const counted = formatList(
    line.countedBy.map((userId) => read.people.find((each) => each.userId === userId)?.name ?? t('receive.unknown')),
  );
  const identity = (parts: readonly (string | null | undefined)[]) =>
    formatList(parts.filter((part): part is string => part !== null && part !== undefined));
  return (
    <Facts>
      <Fact label="held.grn">{read.grnNumber}</Fact>
      <Fact label="held.kind">{t(`held.kind.${held.kind}`)}</Fact>
      <Fact label="held.quantity">{formatQuantity(held.quantity)}</Fact>
      <Fact label="held.line">{identity([line.styleCode ?? line.description, line.colour, line.size])}</Fact>
      <Fact label="receive.invoice-quantity">{formatQuantity(line.invoiceQuantity)}</Fact>
      <Fact label="receive.counted-quantity">{formatQuantity(line.countedQuantity)}</Fact>
      {held.named !== null && (
        <Fact label="held.named">{identity([held.named.styleCode, held.named.colour, held.named.size?.code])}</Fact>
      )}
      <Fact label="held.counted-by">{counted}</Fact>
    </Facts>
  );
}

/** The facts of the request's version, by its action type; nothing where the reader may not read them. */
export function DocumentFacts({ view }: { view: ApprovalRequestView }) {
  switch (view.actionType) {
    case 'access.user.change':
      return <UserFacts view={view} />;
    case 'access.role.change':
      return <RoleFacts view={view} />;
    case 'access.role_assignment.change':
      return <AssignmentFacts view={view} withdrawal={false} />;
    case 'access.role_assignment.withdrawal':
      return <AssignmentFacts view={view} withdrawal />;
    case 'access.approval_reason.change':
      return <ReasonFacts view={view} />;
    case 'access.setting.change':
      return <SettingFacts view={view} />;
    case 'access.approval_limit.change':
      return <LimitFacts view={view} />;
    case VOCABULARY_CONFIRMATION:
      return <ProposalFacts view={view} />;
    case PRODUCT_CONFIRMATION:
      return <ProductProposalFacts view={view} />;
    case BANK_DETAILS_CHANGE:
      return <BankDetailsFacts view={view} />;
    case AGREEMENT_CHANGE:
      return <AgreementFacts view={view} />;
    case SITE_READINESS_APPROVAL:
    case ACTIVITY_APPROVAL:
      return <ReadinessFacts view={view} />;
    case PERIOD_REOPENING_APPROVAL:
      return <ReopeningFacts view={view} />;
    case FINANCIAL_YEAR_CHANGE_APPROVAL:
      return <FinancialYearFacts view={view} />;
    case BILL_FORMAT_CHANGE_APPROVAL:
      return <BillFormatFacts view={view} />;
    // An open-to-buy budget version's check and approval (goods-in 3.3; S2-F01-T02).
    case OPEN_TO_BUY_CHECK:
    case OPEN_TO_BUY_APPROVAL:
      return <BudgetFacts view={view} />;
    // A booking version's approval (goods-in 3.4; S2-F01-T03).
    case BOOKING_APPROVAL:
      return <BookingFacts view={view} />;
    // A damage report's decision and a reversal's approval (goods-in 8.3; S2-F08-T01).
    case DAMAGE_DECISION:
      return <DamageFacts view={view} reversal={false} />;
    case DAMAGE_REVERSAL_APPROVAL:
      return <DamageFacts view={view} reversal />;
    // A held line's decision (goods-in 4.6; S2-F02-T03).
    case HELD_LINE_DECISION:
      return <HeldLineFacts view={view} />;
    // The season or size attribute (structure-and-masters 4.2 "As built"; RR-550, RR-556).
    case MARKED_ATTRIBUTE_CHANGE:
      return <MarkedAttributeFacts view={view} />;
    // Layout, mapping and mapping rule versions (imports-and-opening-data 6.4; S1-F06-T03).
    case LAYOUT_CONFIRMATION:
    case MAPPING_CONFIRMATION:
    case MAPPING_RULE_CONFIRMATION:
      return <ImportFacts view={view} />;
    default:
      // A master of the organisation structure (S1-F02-T01), or nothing.
      return <MasterFacts view={view} />;
  }
}
