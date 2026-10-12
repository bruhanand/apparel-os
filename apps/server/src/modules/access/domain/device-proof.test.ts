import { webcrypto } from 'node:crypto';
import { deviceProofMessage, devicePublicKeySchema, type DevicePublicKey } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { newChallenge, proofVerifies } from './device-proof.js';

// The device proof as the counter makes it in the browser: a WebCrypto ECDSA P-256 key pair, the private key
// non-extractable, the public key exported as a JWK, a signature over the message of deviceProofMessage
// (offline-counter 3.2, 3.3; PRD-OFF-010). SYNTHETIC Organisation and device.

const ORGANISATION = 'SYN-DEVICE-PROOF';
const DEVICE = '01900000-0000-7000-8000-00000000d001';
const OTHER_DEVICE = '01900000-0000-7000-8000-00000000d002';

async function device() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicKey: DevicePublicKey = devicePublicKeySchema.parse(
    await webcrypto.subtle.exportKey('jwk', pair.publicKey),
  );
  const sign = async (purpose: 'enrol' | 'sign-in', deviceId: string, challenge: string) =>
    Buffer.from(
      await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        new TextEncoder().encode(deviceProofMessage(purpose, ORGANISATION, deviceId, challenge)),
      ),
    ).toString('base64url');
  return { publicKey, sign };
}

describe('the device proof (offline-counter 3.3)', () => {
  it('PRD-OFF-010 a signature by the device over its challenge verifies with its public key', async () => {
    const { publicKey, sign } = await device();
    const challenge = newChallenge();
    const signature = await sign('sign-in', DEVICE, challenge);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(
      proofVerifies(publicKey, signature, {
        purpose: 'sign-in',
        organisationCode: ORGANISATION,
        deviceId: DEVICE,
        challenge,
      }),
    ).toBe(true);
  });

  it('PRD-OFF-010 a signature by another key, for another purpose, device or challenge proves nothing', async () => {
    const one = await device();
    const other = await device();
    const challenge = newChallenge();
    const proof = { purpose: 'sign-in' as const, organisationCode: ORGANISATION, deviceId: DEVICE, challenge };
    expect(proofVerifies(one.publicKey, await other.sign('sign-in', DEVICE, challenge), proof)).toBe(false);
    expect(proofVerifies(one.publicKey, await one.sign('enrol', DEVICE, challenge), proof)).toBe(false);
    expect(proofVerifies(one.publicKey, await one.sign('sign-in', OTHER_DEVICE, challenge), proof)).toBe(false);
    expect(proofVerifies(one.publicKey, await one.sign('sign-in', DEVICE, newChallenge()), proof)).toBe(false);
  });

  it('a key that is not a point of the curve, or a signature of the wrong form, verifies nothing', async () => {
    const { publicKey, sign } = await device();
    const challenge = newChallenge();
    const signature = await sign('sign-in', DEVICE, challenge);
    const proof = { purpose: 'sign-in' as const, organisationCode: ORGANISATION, deviceId: DEVICE, challenge };
    expect(proofVerifies({ ...publicKey, x: 'A'.repeat(43) }, signature, proof)).toBe(false);
    expect(proofVerifies(publicKey, 'A'.repeat(86), proof)).toBe(false);
  });

  it('a challenge is 256 bits as base64url, new each time', () => {
    const first = newChallenge();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newChallenge()).not.toBe(first);
  });
});
