import type { BillingDeviceView, DeviceState } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import type { StateId } from '../components/states';
import { AsOf } from '../history/AsOf';
import { t } from '../messages/catalogue';
import { useTimeZone } from '../shell/session';
import { RefusalBanner } from '../sign-in/RefusalBanner';
import { Card, GrantedButton, inputClass, ListRead, Toolbar, useGranted } from './parts';

// Setup › Devices, tills and bill series (ui-blueprint Setup; offline-counter 3.1, 3.2 step 1, 4.1, 4.4, 12.1;
// design-language 7; PRD-OFF-002, PRD-POS-020, PRD-ORG-005, PRD-UXP-003, POL-02.03; GC8-7, DEC-116; S1-F12-T01).
// Register a billing device for a Store and the whole-store and brand-counter units of that Store it bills for; it is
// Setting up until it is enrolled in the counter app at /counter/. Each device shows its state, its units and its bill
// series, one per tax registration and financial year. Nothing is chosen on the person's behalf: code, label, Store and
// units are all stated. Revoke, retire, replace and unit changes arrive with S1-F12-T02.

const READS = ['listBillingDevices'] as const;

const STATES: Readonly<Record<DeviceState, StateId>> = {
  'Setting up': 'setting-up',
  Active: 'active',
  Revoked: 'revoked',
  Ended: 'ended',
};

const SERIES_STATES: Readonly<Record<'Open' | 'Paused' | 'Closed', StateId>> = {
  Open: 'open',
  Paused: 'paused',
  Closed: 'closed',
};

/** Register a device: code, label, Store and units, each stated (offline-counter 3.2 step 1). */
function RegisterForm() {
  const stores = useQuery(readQuery(api, 'listStores', { query: {} }));
  const units = useQuery(readQuery(api, 'listBusinessUnits', { query: {} }));
  const registering = useSubmission('registerBillingDevice', READS);
  const granted = useGranted('pos.billing_device', 'create');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [storeId, setStoreId] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const storeUnits = (units.data?.records ?? []).filter((unit) => unit.storeId === storeId);
  const ready = code.trim() !== '' && label.trim() !== '' && storeId !== '' && unitIds.length > 0;
  return (
    <Card title="devices.register.title">
      <p className="m-0 text-body-sm text-text-2">{t('devices.register.intro')}</p>
      {registering.state.kind === 'refused' && <RefusalBanner refusal={registering.state.refusal} />}
      {registering.state.kind === 'done' && <Banner tone="success" role="status" message="devices.registered" />}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1" htmlFor="device-code">
          <span className="text-body-sm font-semibold">{t('devices.code')}</span>
          <input
            id="device-code"
            className={inputClass}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor="device-label">
          <span className="text-body-sm font-semibold">{t('devices.label')}</span>
          <input
            id="device-label"
            className={inputClass}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor="device-store">
          <span className="text-body-sm font-semibold">{t('devices.store')}</span>
          <select
            id="device-store"
            className={inputClass}
            value={storeId}
            onChange={(event) => {
              setStoreId(event.target.value);
              setUnitIds([]);
            }}
          >
            <option value="">{t('devices.choose-store')}</option>
            {(stores.data?.records ?? []).map((store) => (
              <option key={store.id} value={store.id}>
                {`${store.code} · ${store.versions[0]?.name ?? ''}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {storeId !== '' && (
        <fieldset className="flex flex-col gap-1 border-0 p-0">
          <legend className="text-body-sm font-semibold">{t('devices.units')}</legend>
          {storeUnits.length === 0 && <p className="m-0 text-body-sm text-text-2">{t('devices.units.none')}</p>}
          {storeUnits.map((unit) => (
            <label key={unit.id} className="flex items-center gap-2 text-body-sm" htmlFor={`device-unit-${unit.id}`}>
              <input
                id={`device-unit-${unit.id}`}
                type="checkbox"
                checked={unitIds.includes(unit.id)}
                onChange={(event) => {
                  setUnitIds(event.target.checked ? [...unitIds, unit.id] : unitIds.filter((each) => each !== unit.id));
                }}
              />
              {`${unit.code} · ${unit.versions[0]?.name ?? ''} · ${t(`devices.unit-kind.${unit.kind}`)}`}
            </label>
          ))}
        </fieldset>
      )}
      <div>
        {granted ? (
          <Button
            label="devices.register"
            variant="primary"
            disabled={!ready || registering.state.kind === 'pending'}
            onClick={() => {
              void registering
                .submit({ body: { code: code.trim(), label: label.trim(), storeId, businessUnitIds: unitIds } })
                .then((answer) => {
                  if (answer === undefined) return;
                  setCode('');
                  setLabel('');
                  setUnitIds([]);
                });
            }}
          />
        ) : (
          <GrantedButton
            label="devices.register"
            recordType="pos.billing_device"
            action="create"
            onClick={() => undefined}
          />
        )}
      </div>
    </Card>
  );
}

/** One device: its code, label, state, units and bill series (offline-counter 3.1, 4.4). */
function DeviceRow({ device }: { device: BillingDeviceView }) {
  return (
    <li
      className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0"
      aria-label={t('devices.device', { code: device.code })}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{device.code}</span>
        <span className="text-body-sm">{device.label}</span>
        <StatusBadge state={STATES[device.state]} />
      </span>
      <span className="text-body-sm">
        {t('devices.units.listed', { units: device.units.map((unit) => unit.code).join(', ') })}
      </span>
      {device.series.length === 0 ? (
        <span className="text-body-sm text-text-2">
          {t(device.state === 'Setting up' ? 'devices.series.after-enrolment' : 'devices.series.none')}
        </span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {device.series.map((series) => (
            <li key={series.seriesId} className="flex flex-wrap items-center gap-2 text-body-sm">
              {t('devices.series.one', { registration: series.taxRegistrationCode, year: series.financialYear })}
              <StatusBadge state={SERIES_STATES[series.state]} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Setup › Devices, tills and bill series. */
export function DevicesScreen() {
  const timeZone = useTimeZone();
  const devices = useQuery(readQuery(api, 'listBillingDevices', {}));
  return (
    <div className="flex flex-col gap-4">
      <RegisterForm />
      <ListRead query={devices} what="devices.what">
        {(read) => (
          <Card title="devices.list.title">
            <Toolbar>
              <span className="flex-1" />
              <Button
                label="setup.refresh"
                onClick={() => {
                  void devices.refetch();
                }}
              />
              <AsOf asOf={read.asOf} timeZone={timeZone} />
            </Toolbar>
            {read.devices.length === 0 ? (
              <p className="m-0 text-body-sm text-text-2">{t('devices.none')}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {read.devices.map((device) => (
                  <DeviceRow key={device.deviceId} device={device} />
                ))}
              </ul>
            )}
          </Card>
        )}
      </ListRead>
    </div>
  );
}
