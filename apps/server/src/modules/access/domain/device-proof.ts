import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { deviceProofMessage, type DeviceProofPurpose, type DevicePublicKey } from '@apparel-os/schemas';

// The device proof (offline-counter 3.2, 3.3; PRD-OFF-010): a device signs a one-time server challenge with its private
// key, ECDSA on curve P-256 with SHA-256, as WebCrypto signs, and the server checks the signature with the public key
// bound at enrolment. Plain functions only (code-house-rules 2).

/** 256 random bits from a cryptographically secure generator, as base64url without padding: one challenge. */
export function newChallenge(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Whether the signature is the device's over the message for this purpose, Organisation, device and challenge. A key
 * that is not a point of P-256, or a signature of the wrong form, verifies nothing; it never throws.
 */
export function proofVerifies(
  publicKey: DevicePublicKey,
  signature: string,
  proof: {
    readonly purpose: DeviceProofPurpose;
    readonly organisationCode: string;
    readonly deviceId: string;
    readonly challenge: string;
  },
): boolean {
  try {
    const key = createPublicKey({
      key: { kty: publicKey.kty, crv: publicKey.crv, x: publicKey.x, y: publicKey.y },
      format: 'jwk',
    });
    const message = deviceProofMessage(proof.purpose, proof.organisationCode, proof.deviceId, proof.challenge);
    return verify(
      'sha256',
      Buffer.from(message, 'utf8'),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}
