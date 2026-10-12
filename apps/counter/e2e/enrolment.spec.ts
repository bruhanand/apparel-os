// The counter's enrolment and device sign-in pages in Chromium (offline-counter 3.2 steps 2 and 3, 3.3, 3.4, 5.3,
// 14.1 test 11; PRD-OFF-010, POL-02.18; GC8-8; S1-F12-T01). The built counter runs under `vite preview` with no server
// behind it, so this test answers the API itself, as the server would: it checks each signature the page sends with
// the public key the page sent at enrolment, over the message of deviceProofMessage, and refuses one that does not
// verify. The server's own checks are proved in apps/server/test/billing-devices.int.test.ts. Every value is SYNTHETIC.
import { createPublicKey, verify } from 'node:crypto';
import { expect, test, type Page, type Route } from '@playwright/test';
import { deviceProofMessage, type DevicePublicKey } from '@apparel-os/schemas';
import { identityDatabaseName } from '../src/device-names.ts';

const ORGANISATION = 'SYN-COUNTER';
const DEVICE_ID = '01900000-0000-7000-8000-00000000c001';
const DEVICE_CODE = 'SYN-TILL-1';
const USER_ID = '01900000-0000-7000-8000-00000000c002';
const STORE_ID = '01900000-0000-7000-8000-00000000c003';
const UNIT_ID = '01900000-0000-7000-8000-00000000c004';
const REFERENCE = '01900000-0000-7000-8000-00000000c0ff';

/** What the test's stand-in for the server has seen: the bound key, and each challenge it gave. */
interface Server {
  publicKey: DevicePublicKey | undefined;
  readonly challenges: Map<string, string>;
  sessionDevice: boolean;
  readonly proofs: string[];
}

function verifies(server: Server, purpose: 'enrol' | 'sign-in', proof: Record<string, string>, key?: DevicePublicKey) {
  const publicKey = key ?? server.publicKey;
  const challenge = server.challenges.get(proof.challengeId ?? '');
  if (publicKey === undefined || challenge === undefined) return false;
  server.challenges.delete(proof.challengeId ?? '');
  return verify(
    'sha256',
    Buffer.from(deviceProofMessage(purpose, ORGANISATION, DEVICE_ID, challenge), 'utf8'),
    { key: createPublicKey({ key: { ...publicKey }, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(proof.signature ?? '', 'base64url'),
  );
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const refused = (route: Route, status: number, code: string, kind: string) =>
  json(route, status, { error: { kind, code, reference: REFERENCE } });

async function answerTheApi(page: Page, server: Server): Promise<void> {
  let challengeCount = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    if (path === '/api/access/device-challenges') {
      challengeCount += 1;
      const challengeId = `01900000-0000-7000-8000-0000000d${String(challengeCount).padStart(4, '0')}`;
      const challenge = Buffer.alloc(32, challengeCount).toString('base64url');
      server.challenges.set(challengeId, challenge);
      return json(route, 200, { challengeId, challenge });
    }
    if (path === '/api/access/sign-in') {
      const device = body.device as Record<string, string> | undefined;
      if (device !== undefined) {
        server.proofs.push(device.signature ?? '');
        if (device.deviceId !== DEVICE_ID || !verifies(server, 'sign-in', device)) {
          return refused(route, 401, 'access.sign-in-refused', 'not-signed-in');
        }
      }
      server.sessionDevice = device !== undefined;
      return json(route, 200, { outcome: 'signed-in' });
    }
    if (path === '/api/access/session') {
      return json(route, 200, {
        organisationCode: ORGANISATION,
        userId: USER_ID,
        displayName: 'SYNTHETIC Counter Person',
        personasHeld: [],
        grants: [],
        roleAssignmentInForce: true,
        timezone: 'Etc/UTC',
        idleLockSeconds: server.sessionDevice ? 300 : 1800,
        ...(server.sessionDevice ? { device: { deviceId: DEVICE_ID, code: DEVICE_CODE } } : {}),
      });
    }
    if (path === '/api/pos/billing-devices') {
      return json(route, 200, {
        asOf: new Date().toISOString(),
        devices: [
          {
            deviceId: DEVICE_ID,
            code: DEVICE_CODE,
            label: 'SYNTHETIC front till',
            state: server.publicKey === undefined ? 'Setting up' : 'Active',
            storeId: STORE_ID,
            units: [{ businessUnitId: UNIT_ID, code: 'SYN-UNIT', kind: 'whole-store' }],
            series: [],
            replacesDeviceId: null,
          },
        ],
      });
    }
    if (path === `/api/pos/billing-devices/${DEVICE_ID}/enrolment`) {
      const publicKey = body.publicKey as DevicePublicKey;
      if (server.publicKey !== undefined) {
        return refused(route, 422, 'access.device-already-enrolled', 'refused');
      }
      if (body.totpCode !== '123456' || !verifies(server, 'enrol', body as Record<string, string>, publicKey)) {
        return refused(route, 422, 'access.device-proof-refused', 'refused');
      }
      // A JWK holding `d` would be a private key leaving the browser (offline-counter 3.2).
      expect(Object.keys(publicKey).sort()).not.toContain('d');
      server.publicKey = publicKey;
      return json(route, 200, {
        deviceId: DEVICE_ID,
        state: 'Active',
        series: [],
        seriesMissing: [{ kind: 'bill-format' }],
      });
    }
    return refused(route, 404, 'kernel.not-found', 'not-found');
  });
}

async function signInWith(page: Page, organisation: boolean) {
  if (organisation) await page.getByLabel('Organisation code').fill(ORGANISATION);
  await page.getByLabel('Login').fill('SYN-COUNTER-PERSON');
  await page.getByLabel('Password').fill('SYNTHETIC-password-1');
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('PRD-OFF-010 GC-8 test 11 the page enrols with a non-extractable P-256 key, proves the device at sign-in, and no script can export the key', async ({
  page,
}) => {
  const server: Server = { publicKey: undefined, challenges: new Map(), sessionDevice: false, proofs: [] };
  await answerTheApi(page, server);
  await page.goto('/counter/');

  await test.step('an authorised person signs in and enrols this browser as the device, with a fresh code', async () => {
    await expect(page.getByRole('heading', { name: 'Enrol this browser as a billing device' })).toBeVisible();
    await signInWith(page, true);
    await expect(page.getByText('Signed in as SYNTHETIC Counter Person.')).toBeVisible();
    await page
      .getByRole('combobox', { name: /^Device/ })
      .selectOption({ label: `${DEVICE_CODE} · SYNTHETIC front till` });
    await page.getByLabel('Fresh authenticator code').fill('123456');
    await page.getByRole('button', { name: 'Enrol this browser' }).click();
    await expect(page.getByRole('status')).toHaveText(`This browser is now device ${DEVICE_CODE}.`);
    await expect(page.getByText('No bill series yet')).toBeVisible();
    expect(server.publicKey).toMatchObject({ kty: 'EC', crv: 'P-256' });
  });

  await test.step('GC-8 test 11: the private key kept in IndexedDB is non-extractable; exporting it fails', async () => {
    const outcome = await page.evaluate(
      async (name) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const opened = indexedDB.open(name);
          opened.onsuccess = () => {
            resolve(opened.result);
          };
          opened.onerror = () => {
            reject(new Error('open failed'));
          };
        });
        const stored = await new Promise<{ privateKey: CryptoKey }>((resolve, reject) => {
          const read = database.transaction('keys').objectStore('keys').get('device');
          read.onsuccess = () => {
            resolve(read.result as { privateKey: CryptoKey });
          };
          read.onerror = () => {
            reject(new Error('read failed'));
          };
        });
        database.close();
        const exported = [];
        for (const format of ['jwk', 'pkcs8'] as const) {
          exported.push(
            await crypto.subtle.exportKey(format, stored.privateKey).then(
              () => 'exported',
              (error: unknown) => (error instanceof Error ? error.name : 'refused'),
            ),
          );
        }
        return {
          extractable: stored.privateKey.extractable,
          algorithm: stored.privateKey.algorithm,
          usages: stored.privateKey.usages,
          exported,
        };
      },
      identityDatabaseName(ORGANISATION, DEVICE_ID),
    );
    expect(outcome).toEqual({
      extractable: false,
      algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
      usages: ['sign'],
      exported: ['InvalidAccessError', 'InvalidAccessError'],
    });
  });

  await test.step('POL-02.18 a sign-in on the device carries its proof and gives a shared POS session', async () => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: `Sign in on device ${DEVICE_CODE}` })).toBeVisible();
    await signInWith(page, false);
    await expect(page.getByRole('status')).toHaveText(`Signed in on device ${DEVICE_CODE}: a shared POS session.`);
    expect(server.proofs).toHaveLength(1);
  });

  await test.step('the identity survives a reload: the page offers the device sign-in, not enrolment', async () => {
    await page.reload();
    await expect(page.getByRole('heading', { name: `Sign in on device ${DEVICE_CODE}` })).toBeVisible();
  });
});
