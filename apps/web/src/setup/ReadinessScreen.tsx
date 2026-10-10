import type { ReadinessCheck, ReadinessRecord, UnitReadiness } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { missingText } from '../components/UnavailableState';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { isMessageId, t } from '../messages/catalogue';
import { useTimeZone } from '../shell/session';
import { RefusalBanner } from '../sign-in/RefusalBanner';
import { Card, GrantedButton, inputClass, ListRead, Toolbar } from './parts';

// Setup › Site opening and closure › Readiness (ui-blueprint; module-map 4.16; domain-model 3.6; structure-and-masters
// 3.7; design-language 7; PRD-LIF-001 to PRD-LIF-003, PRD-UXP-003; DEC-116, DEC-117; S1-F04-T02). For a business unit:
// each activity's checks with their state and what is missing, the request for its approval, which a different person
// decides from My work, and the unit's zero opening-stock declaration. The unit and its Site show Active once they hold
// a grant. Nothing is declared or asked for on the person's behalf.

const READS = ['readUnitReadiness'] as const;

function named(prefix: string, code: string): string {
  const id = `${prefix}.${code}`;
  return isMessageId(id) ? t(id) : code;
}

/** One check: its name and state, and what it names as missing (PRD-UXP-003). */
function CheckRow({ check }: { check: ReadinessCheck }) {
  const name = named('readiness.check', check.check);
  return (
    <li className="flex flex-col gap-1 border-b border-border pb-2 last:border-b-0" aria-label={name}>
      <span className="flex items-center gap-2">
        <span className="font-semibold">{name}</span>
        <span className="text-body-sm">{t(`readiness.state.${check.state}`)}</span>
      </span>
      {check.missing.length > 0 && (
        <ul className="m-0 list-disc pl-5 text-body-sm">
          {check.missing.map((item, index) => (
            <li key={index}>{missingText(item)}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ActivityCard({
  unitId,
  activity,
  granted,
  latest,
  timeZone,
}: {
  unitId: string;
  activity: UnitReadiness['activities'][number]['activity'];
  granted: boolean;
  latest: ReadinessRecord | null;
  timeZone: string;
}) {
  const running = useSubmission('runReadinessChecks', READS);
  const requesting = useSubmission('requestActivation', READS);
  const title = named('activity', activity);
  const open = latest?.request?.state === 'Awaiting approval';
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <h3 className="text-h3 font-semibold">{title}</h3>
      {granted && <Banner tone="success" role="status" message="readiness.granted" />}
      {running.state.kind === 'refused' && <RefusalBanner refusal={running.state.refusal} />}
      {requesting.state.kind === 'refused' && <RefusalBanner refusal={requesting.state.refusal} />}
      {latest === null ? (
        <p className="m-0 text-body-sm text-text-2">{t('readiness.never-run')}</p>
      ) : (
        <>
          <p className="m-0 text-body-sm text-text-2">
            {t('readiness.ran', { name: latest.ranBy, at: formatDateTime(latest.ranAt, timeZone) })}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {latest.checks.map((check) => (
              <CheckRow key={check.check} check={check} />
            ))}
          </ul>
          {latest.request !== null && (
            <p className="m-0 text-body-sm">{t('readiness.request.state', { state: latest.request.state })}</p>
          )}
        </>
      )}
      {open && <Banner tone="info" role="status" message="readiness.requested" />}
      {!granted && (
        <div className="flex flex-wrap gap-2">
          <GrantedButton
            label="readiness.run"
            recordType="site_lifecycle.readiness_record"
            action="create"
            onClick={() => {
              void running.submit({ params: { businessUnitId: unitId, activity }, body: {} });
            }}
          />
          {latest !== null && latest.passed && !open && (
            <GrantedButton
              label="readiness.request"
              variant="primary"
              recordType="site_lifecycle.readiness_record"
              action="create"
              onClick={() => {
                void requesting.submit({ params: { readinessRecordId: latest.readinessRecordId }, body: {} });
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}

/** The unit's explicit zero opening-stock declaration (PRD-LIF-003): stated by the person, never a default. */
function ZeroStock({ read, timeZone }: { read: UnitReadiness; timeZone: string }) {
  const [holdsNone, setHoldsNone] = useState(false);
  const declaring = useSubmission('declareZeroStock', READS);
  const declared = read.zeroStockDeclaration;
  return (
    <Card title="readiness.stock-plan.title">
      {declared === null ? (
        <p className="m-0 text-body-sm">{t('readiness.stock-plan.none')}</p>
      ) : (
        <p className="m-0 text-body-sm">
          {t('readiness.stock-plan.declared', {
            name: declared.declaredBy,
            at: formatDateTime(declared.declaredAt, timeZone),
          })}
        </p>
      )}
      {declaring.state.kind === 'refused' && <RefusalBanner refusal={declaring.state.refusal} />}
      {declared === null && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-body-sm" htmlFor="readiness-holds-no-stock">
            <input
              id="readiness-holds-no-stock"
              type="checkbox"
              checked={holdsNone}
              onChange={(event) => {
                setHoldsNone(event.target.checked);
              }}
            />
            {t('readiness.stock-plan.holds-none')}
          </label>
          <div>
            <Button
              label="readiness.stock-plan.declare"
              disabled={!holdsNone || declaring.state.kind === 'pending'}
              onClick={() => {
                void declaring.submit({
                  params: { businessUnitId: read.businessUnitId },
                  body: { holdsNoStock: true },
                });
              }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function UnitReadinessView({ unitId }: { unitId: string }) {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'readUnitReadiness', { params: { businessUnitId: unitId } }));
  return (
    <ListRead query={query} what="readiness.what">
      {(read) => (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge state={read.state === 'Active' ? 'active' : 'setting-up'} />
            <span className="text-body-sm">
              {t('readiness.site-state', {
                state: t(read.siteState === 'Active' ? 'state.active' : 'state.setting-up'),
              })}
            </span>
            <span className="flex-1" />
            <Button
              label="setup.refresh"
              onClick={() => {
                void query.refetch();
              }}
            />
            <AsOf asOf={read.asOf} timeZone={timeZone} />
          </div>
          <ZeroStock read={read} timeZone={timeZone} />
          {read.activities.map((each) => (
            <ActivityCard
              key={each.activity}
              unitId={unitId}
              activity={each.activity}
              granted={each.granted}
              latest={each.latest}
              timeZone={timeZone}
            />
          ))}
        </div>
      )}
    </ListRead>
  );
}

/** Setup › Site opening and closure. */
export function ReadinessScreen() {
  const units = useQuery(readQuery(api, 'listBusinessUnits', { query: {} }));
  const [unitId, setUnitId] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <ListRead query={units} what="readiness.what">
        {(list) =>
          list.records.length === 0 ? (
            <p className="m-0 text-body-sm text-text-2">{t('readiness.units.none')}</p>
          ) : (
            <Toolbar>
              <label className="flex flex-col gap-1" htmlFor="readiness-unit">
                <span className="text-body-sm font-semibold">{t('readiness.unit')}</span>
                <select
                  id="readiness-unit"
                  className={inputClass}
                  value={unitId}
                  onChange={(event) => {
                    setUnitId(event.target.value);
                  }}
                >
                  <option value="">{t('readiness.choose-unit')}</option>
                  {list.records.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {`${unit.code} · ${unit.versions[0]?.name ?? ''}`}
                    </option>
                  ))}
                </select>
              </label>
            </Toolbar>
          )
        }
      </ListRead>
      {unitId !== '' && <UnitReadinessView key={unitId} unitId={unitId} />}
    </div>
  );
}
