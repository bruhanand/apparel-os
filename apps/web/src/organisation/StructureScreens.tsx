import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { readQuery } from '../api/query';
import { StatusBadge } from '../components/StatusBadge';
import { AsOf } from '../history/AsOf';
import { t, type MessageId } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { recordTypeName } from '../setup/describe';
import { inputClass, ListRead, Th } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { type Kind } from './kinds';
import { MasterTab } from './MasterTab';

// Setup › Organisation structure and Setup › Geography and groupings (structure-and-masters 8; ui-blueprint Setup;
// S1-F02-T01). Business units and locations join the first screen with S1-F02-T02.

type Tab = Kind | 'master-lists';

function Tabs({ tabs, label }: { tabs: readonly Tab[]; label: MessageId }) {
  const [current, setCurrent] = useState<Tab>(tabs[0] ?? 'master-lists');
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t(label)} className="flex flex-wrap gap-2 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`organisation-tab-${tab}`}
            aria-selected={current === tab}
            aria-controls="organisation-tab-panel"
            className={
              current === tab
                ? 'h-9 border-b-2 border-accent px-3 font-semibold text-text'
                : 'h-9 px-3 text-text-2 hover:text-accent'
            }
            onClick={() => {
              setCurrent(tab);
            }}
          >
            {t(`organisation.tab.${tab}`)}
          </button>
        ))}
      </div>
      <div id="organisation-tab-panel" role="tabpanel" aria-labelledby={`organisation-tab-${current}`}>
        {current === 'master-lists' ? <MasterLists /> : <MasterTab key={current} kind={current} />}
      </div>
    </div>
  );
}

/**
 * The master lists read model (module-map 4.11; phases.md stage 1 reports): each master's version in force on a chosen
 * date, with the time it was read; a list the reader may not view is named as not shown.
 */
function MasterLists() {
  const today = useBusinessToday();
  const timeZone = useTimeZone();
  const [date, setDate] = useState(today);
  const query = useQuery(readQuery(api, 'readMasterLists', { query: { date } }));
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-body-sm font-semibold">{t('organisation.master-lists.date')}</span>
        <input
          type="date"
          className={inputClass}
          value={date}
          onChange={(event) => {
            if (event.target.value !== '') setDate(event.target.value);
          }}
        />
      </label>
      <ListRead query={query} what="organisation.master-lists.what">
        {(lists) => {
          const rows = [
            ...lists.legalEntities.map((each) => ({
              type: 'organisation.legal_entity',
              name: each.legalName,
              ...each,
            })),
            ...lists.taxRegistrations.map((each) => ({
              type: 'organisation.tax_registration',
              name: each.registrationNumber,
              ...each,
            })),
            ...lists.accountingBooks.map((each) => ({ type: 'organisation.accounting_book', ...each })),
            ...lists.sites.map((each) => ({ type: 'organisation.site', ...each })),
            ...lists.stores.map((each) => ({ type: 'organisation.store', ...each })),
            ...lists.countries.map((each) => ({ type: 'organisation.country', ...each })),
            ...lists.states.map((each) => ({ type: 'organisation.state', ...each })),
            ...lists.cities.map((each) => ({ type: 'organisation.city', ...each })),
            ...lists.areas.map((each) => ({ type: 'organisation.area', ...each })),
            ...lists.groupings.map((each) => ({ type: 'organisation.grouping', ...each })),
          ];
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <AsOf asOf={lists.asOf} timeZone={timeZone} />
              </div>
              {lists.notShown.length > 0 && (
                <p className="m-0 text-body-sm text-text-2">
                  {t('organisation.master-lists.not-shown', {
                    types: lists.notShown.map((type) => recordTypeName(type)).join(', '),
                  })}
                </p>
              )}
              <div className="overflow-x-auto rounded-card border border-border bg-surface">
                <table className="w-full border-collapse text-body" aria-label={t('organisation.tab.master-lists')}>
                  <thead>
                    <tr>
                      <Th label="organisation.master-lists.type" />
                      <Th label="organisation.field.code" />
                      <Th label="organisation.field.name" />
                      <Th label="organisation.field.status" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.versionId} className="h-10 border-t border-border">
                        <td className="px-3">{recordTypeName(row.type)}</td>
                        <td className="px-3 font-mono">{row.code}</td>
                        <td className="px-3">{row.name}</td>
                        <td className="px-3">
                          {'status' in row && typeof row.status === 'string' && (
                            <StatusBadge state={stateIdOf(row.status)} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }}
      </ListRead>
    </div>
  );
}

/** Setup › Organisation structure: legal entities, registrations, books, Sites, Stores and the master lists. */
export function OrganisationStructureScreen() {
  return (
    <Tabs
      label="screen.setup.organisation-structure"
      tabs={['legal_entity', 'tax_registration', 'accounting_book', 'site', 'store', 'master-lists']}
    />
  );
}

/** Setup › Geography and groupings: Country, State, City, Area, and regions and clusters of Stores. */
export function GeographyScreen() {
  return <Tabs label="screen.setup.geography" tabs={['country', 'state', 'city', 'area', 'grouping']} />;
}
