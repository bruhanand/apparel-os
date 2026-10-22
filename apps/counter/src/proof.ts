import {
  createApiClient,
  deviceProofMessage,
  type ApiClient,
  devicePublicKeySchema,
  routes,
  type DeviceProofPurpose,
  type DevicePublicKey,
} from '@apparel-os/schemas';

// The device proof in the browser (offline-counter 3.2, 3.3; PRD-OFF-010; S1-F12-T01): ask the server for a one-time
// challenge and sign it, with the purpose, the Organisation and the device, using the device's private key. The key
// signs inside WebCrypto; no script ever reads it.

/** The typed client of the API, on the page's own origin (code-house-rules 12.1, 12.2; deployment.md section 3). */
// Named by its type, which the compiler then need not spell out in full as the route table grows (TS7056).
export const api: ApiClient<typeof routes> = createApiClient(routes, { baseUrl: '' });

/** The public key of a pair as the server takes it: a P-256 JWK holding the public part only. */
export async function publicKeyOf(pair: CryptoKeyPair): Promise<DevicePublicKey> {
  return devicePublicKeySchema.parse(await crypto.subtle.exportKey('jwk', pair.publicKey));
}

/** Bytes as base64url without padding. */
function base64url(bytes: ArrayBuffer): string {
  let text = '';
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A fresh challenge, signed: what an enrolment or a device sign-in sends, or undefined when none was given. */
export async function signedChallenge(
  privateKey: CryptoKey,
  purpose: DeviceProofPurpose,
  organisationCode: string,
  deviceId: string,
): Promise<{ readonly challengeId: string; readonly signature: string } | undefined> {
  const issued = await api.call('issueDeviceChallenge', { body: { organisationCode } });
  if (!issued.ok) return undefined;
  const message = new TextEncoder().encode(
    deviceProofMessage(purpose, organisationCode, deviceId, issued.data.challenge),
  );
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, message);
  return { challengeId: issued.data.challengeId, signature: base64url(signature) };
}
