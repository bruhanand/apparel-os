import type { BillingDeviceView, DeviceEnding, DeviceState } from '@apparel-os/schemas';
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
import { BillNumbering } from './BillNumbering';
import { useBusinessToday } from './business-date';
import { Card, GrantedButton, inputClass, ListRead, Toolbar, useGranted } from './parts';

// Setup › Devices, tills and bill series (ui-blueprint Setup; offline-counter 3.1, 3.2 step 1, 4.1, 4.4, 12.1;
// design-language 7; PRD-OFF-002, PRD-POS-020, PRD-ORG-005, PRD-UXP-003, POL-02.03; GC8-7, DEC-116; S1-F12-T01).
// Register a billing device for a Store and the whole-store and brand-counter units of that Store it bills for; it is
// Setting up until it is enrolled in the counter app at /counter/. Each device shows its state, its units and its bill
// series, one per tax registration and financial year. Nothing is chosen on the person's behalf: code, label, Store and
// units are all stated. A device leaves use by being revoked (lost) or retired, each final and confirmed first; a
// replacement does either and registers a new device for the same Store and units; an Active device's units change from
// a date, today or later (offline-counter 3.5, 12.1; S1-F12-T02). Above them, the financial years and the bill-number
// format, each changed by one person and approved by another, whose approval gives every Active device its missing
// series (offline-counter 4.3b; DEC-117; S1-F12-T03).

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

/**
 * Revoke a lost device or retire one taken out of use (offline-counter 3.5): final, so it is confirmed first. Its
 * sessions end at their next request and its series close (PRD-SEC-008).
 */
function EndDevice({ device, ending }: { device: BillingDeviceView; ending: DeviceEnding }) {
  const name = ending === 'revoke' ? 'revokeBillingDevice' : 'retireBillingDevice';
  const ended = useSubmission(name, READS);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <GrantedButton
        label={ending === 'revoke' ? 'devices.revoke' : 'devices.retire'}
        recordType="pos.billing_device"
        action="edit"
        onClick={() => {
          setConfirming(true);
        }}
      />
    );
  }
  return (
    <span className="flex flex-col gap-2">
      {ended.state.kind === 'refused' && <RefusalBanner refusal={ended.state.refusal} />}
      <span className="text-body-sm">
        {t(ending === 'revoke' ? 'devices.revoke.confirm' : 'devices.retire.confirm', { code: device.code })}
      </span>
      <span className="flex flex-wrap gap-2">
        <Button
          label={ending === 'revoke' ? 'devices.revoke.do' : 'devices.retire.do'}
          variant="destructive"
          disabled={ended.state.kind === 'pending'}
          onClick={() => {
            void ended.submit({ params: { deviceId: device.deviceId }, body: {} });
          }}
        />
        <Button
          label="devices.cancel"
          onClick={() => {
            setConfirming(false);
          }}
        />
      </span>
    </span>
  );
}

/**
 * Replace a device (offline-counter 3.5): how the old one leaves use, and the new device's code and label. The new one
 * is registered for the same Store and units, Setting up until it is enrolled with a new key, when it gets fresh series.
 */
function ReplaceDevice({ device }: { device: BillingDeviceView }) {
  const replacing = useSubmission('replaceBillingDevice', READS);
  const [open, setOpen] = useState(false);
  const [ending, setEnding] = useState<DeviceEnding | ''>('');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  if (!open) {
    return (
      <GrantedButton
        label="devices.replace"
        recordType="pos.billing_device"
        action="create"
        onClick={() => {
          setOpen(true);
        }}
      />
    );
  }
  const ready = ending !== '' && code.trim() !== '' && label.trim() !== '';
  const id = (what: string) => `device-${device.deviceId}-replace-${what}`;
  return (
    <fieldset className="flex flex-col gap-2 rounded-control border border-border p-3">
      <legend className="text-body-sm font-semibold">{t('devices.replace.title', { code: device.code })}</legend>
      {replacing.state.kind === 'refused' && <RefusalBanner refusal={replacing.state.refusal} />}
      <label className="flex flex-col gap-1" htmlFor={id('ending')}>
        <span className="text-body-sm font-semibold">{t('devices.replace.ending')}</span>
        <select
          id={id('ending')}
          className={inputClass}
          value={ending}
          onChange={(event) => {
            setEnding(event.target.value as DeviceEnding | '');
          }}
        >
          <option value="">{t('devices.replace.choose')}</option>
          <option value="revoke">{t('devices.replace.revoke')}</option>
          <option value="retire">{t('devices.replace.retire')}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1" htmlFor={id('code')}>
        <span className="text-body-sm font-semibold">{t('devices.replace.code')}</span>
        <input
          id={id('code')}
          className={inputClass}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor={id('label')}>
        <span className="text-body-sm font-semibold">{t('devices.replace.label')}</span>
        <input
          id={id('label')}
          className={inputClass}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
        />
      </label>
      <span className="flex flex-wrap gap-2">
        <Button
          label="devices.replace.do"
          variant="destructive"
          disabled={!ready || replacing.state.kind === 'pending'}
          onClick={() => {
            if (ending === '') return;
            void replacing.submit({
              params: { deviceId: device.deviceId },
              body: { ending, code: code.trim(), label: label.trim() },
            });
          }}
        />
        <Button
          label="devices.cancel"
          onClick={() => {
            setOpen(false);
          }}
        />
      </span>
    </fieldset>
  );
}

/**
 * Change an Active device's units from a date, today or later (offline-counter 12.1): the whole list from that date. A
 * unit that brings a new registration gets the device's series for it (4.3); the answer says what is still missing.
 */
function ChangeUnits({ device }: { device: BillingDeviceView }) {
  const today = useBusinessToday();
  const units = useQuery(readQuery(api, 'listBusinessUnits', { query: {} }));
  const changing = useSubmission('changeBillingDeviceUnits', READS);
  const [open, setOpen] = useState(false);
  const [validFrom, setValidFrom] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>(device.units.map((unit) => unit.businessUnitId));
  if (!open) {
    return (
      <GrantedButton
        label="devices.units.change"
        recordType="pos.billing_device"
        action="edit"
        onClick={() => {
          setOpen(true);
        }}
      />
    );
  }
  const storeUnits = (units.data?.records ?? []).filter((unit) => unit.storeId === device.storeId);
  const id = (what: string) => `device-${device.deviceId}-units-${what}`;
  return (
    <fieldset className="flex flex-col gap-2 rounded-control border border-border p-3">
      <legend className="text-body-sm font-semibold">{t('devices.units.change.title', { code: device.code })}</legend>
      {changing.state.kind === 'refused' && <RefusalBanner refusal={changing.state.refusal} />}
      {changing.state.kind === 'done' && <Banner tone="success" role="status" message="devices.units.changed" />}
      <label className="flex flex-col gap-1" htmlFor={id('from')}>
        <span className="text-body-sm font-semibold">{t('devices.units.change.from')}</span>
        <input
          id={id('from')}
          type="date"
          min={today}
          className={inputClass}
          value={validFrom}
          onChange={(event) => {
            setValidFrom(event.target.value);
          }}
        />
      </label>
      {storeUnits.map((unit) => (
        <label key={unit.id} className="flex items-center gap-2 text-body-sm" htmlFor={id(unit.id)}>
          <input
            id={id(unit.id)}
            type="checkbox"
            checked={unitIds.includes(unit.id)}
            onChange={(event) => {
              setUnitIds(event.target.checked ? [...unitIds, unit.id] : unitIds.filter((each) => each !== unit.id));
            }}
          />
          {`${unit.code} · ${unit.versions[0]?.name ?? ''} · ${t(`devices.unit-kind.${unit.kind}`)}`}
        </label>
      ))}
      <span className="flex flex-wrap gap-2">
        <Button
          label="devices.units.change.do"
          variant="primary"
          disabled={validFrom === '' || unitIds.length === 0 || changing.state.kind === 'pending'}
          onClick={() => {
            void changing.submit({
              params: { deviceId: device.deviceId },
              body: { businessUnitIds: unitIds, validFrom },
            });
          }}
        />
        <Button
          label="devices.cancel"
          onClick={() => {
            setOpen(false);
          }}
        />
      </span>
    </fieldset>
  );
}

/** One device: its code, label, state, units and bill series (offline-counter 3.1, 4.4), and what may be done with it. */
function DeviceRow({ device }: { device: BillingDeviceView }) {
  const ended = device.state === 'Revoked' || device.state === 'Ended';
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
      {device.replacesDeviceId !== null && <span className="text-body-sm text-text-2">{t('devices.replaces')}</span>}
      {!ended && (
        <span className="flex flex-wrap items-start gap-2">
          <EndDevice device={device} ending="revoke" />
          <EndDevice device={device} ending="retire" />
          <ReplaceDevice device={device} />
          {device.state === 'Active' && <ChangeUnits device={device} />}
        </span>
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
      <BillNumbering />
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
