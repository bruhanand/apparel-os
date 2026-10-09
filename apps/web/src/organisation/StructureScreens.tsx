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
import { recordTypeOf, type Kind } from './kinds';
import { MasterTab } from './MasterTab';

// Setup › Organisation structure and Setup › Geography and groupings (structure-and-masters 8; ui-blueprint Setup;
// S1-F02-T01). Business units with their verified mappings, locations and default warehouses join the first screen
// with S1-F02-T02, and the Organisation's own classification kinds and values and grouping kinds with S1-F02-T04.

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
              type: recordTypeOf('legal_entity'),
              name: each.legalName,
              ...each,
            })),
            ...lists.taxRegistrations.map((each) => ({
              type: recordTypeOf('tax_registration'),
              name: each.registrationNumber,
              ...each,
            })),
            ...lists.accountingBooks.map((each) => ({ type: recordTypeOf('accounting_book'), ...each })),
            ...lists.sites.map((each) => ({ type: recordTypeOf('site'), ...each })),
            ...lists.stores.map((each) => ({ type: recordTypeOf('store'), ...each })),
            ...lists.countries.map((each) => ({ type: recordTypeOf('country'), ...each })),
            ...lists.states.map((each) => ({ type: recordTypeOf('state'), ...each })),
            ...lists.cities.map((each) => ({ type: recordTypeOf('city'), ...each })),
            ...lists.areas.map((each) => ({ type: recordTypeOf('area'), ...each })),
            ...lists.groupings.map((each) => ({ type: recordTypeOf('grouping'), ...each })),
            ...lists.businessUnits.map((each) => ({ type: recordTypeOf('business_unit'), ...each })),
            // A unit's mapping in force, with its verification state (structure-and-masters 3.4; POL-10.08).
            ...lists.businessUnitMappings.map((each) => ({
              type: recordTypeOf('business_unit_mapping'),
              ...each,
              name: t(
                each.verification === undefined
                  ? 'organisation.verification.unverified'
                  : 'organisation.verification.verified',
              ),
            })),
            ...lists.locations.map((each) => ({ type: recordTypeOf('location'), ...each })),
            // The Organisation's own kinds and values (structure-and-masters 3.1, 3.6; S1-F02-T04).
            ...lists.classificationKinds.map((each) => ({ type: recordTypeOf('classification_kind'), ...each })),
            ...lists.classificationValues.map((each) => ({ type: recordTypeOf('classification_value'), ...each })),
            ...lists.groupingKinds.map((each) => ({ type: recordTypeOf('grouping_kind'), ...each })),
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

/**
 * Setup › Organisation structure: legal entities, registrations, books, Sites, Stores, business units and their
 * mappings, locations, default warehouses, classification kinds and values, grouping kinds and the master lists.
 */
export function OrganisationStructureScreen() {
  return (
    <Tabs
      label="screen.setup.organisation-structure"
      tabs={[
        'legal_entity',
        'tax_registration',
        'accounting_book',
        'site',
        'store',
        'business_unit',
        'business_unit_mapping',
        'location',
        'store_default_warehouse',
        'classification_kind',
        'classification_value',
        'grouping_kind',
        'master-lists',
      ]}
    />
  );
}

/** Setup › Geography and groupings: Country, State, City, Area, and groupings of Stores of the Organisation's kinds. */
export function GeographyScreen() {
  return <Tabs label="screen.setup.geography" tabs={['country', 'state', 'city', 'area', 'grouping']} />;
}
