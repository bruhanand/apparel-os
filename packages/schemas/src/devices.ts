import { z } from 'zod';
import { businessDateSchema, idSchema, organisationCodeSchema, totpCodeSchema } from './common.js';
import { businessUnitKindSchema, masterCodeSchema } from './organisation.js';

// Billing devices, their enrolment and the device proof (offline-counter 3.1 to 3.4, 4.1, 12.1; access-and-approvals
// 2.4, 3.3; PRD-OFF-002, PRD-OFF-010, PRD-POS-020, POL-02.18; DEC-005, DEC-116; S1-F12-T01). Shared by the server, the
// web app's Setup › Devices, tills and bill series and the counter app's enrolment and sign-in pages.

/** 256 bits as base64url without padding: a challenge. */
const challengeTextSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** A P-256 coordinate, 32 bytes as base64url without padding. */
const coordinateSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** An ECDSA P-256 signature as WebCrypto gives it, r and s of 32 bytes each, as base64url without padding. */
const signatureSchema = z.string().regex(/^[A-Za-z0-9_-]{86}$/);

/**
 * A device's public key as WebCrypto exports it in JWK form: ECDSA on curve P-256 (offline-counter 3.2). Only the
 * public part: a JWK holding `d`, the private key, is refused, so a private key can never reach the server.
 */
export const devicePublicKeySchema = z.strictObject({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: coordinateSchema,
  y: coordinateSchema,
  ext: z.boolean().optional(),
  key_ops: z.array(z.literal('verify')).optional(),
});
export type DevicePublicKey = z.infer<typeof devicePublicKeySchema>;

/** What a device proves itself for: its enrolment, or a sign-in on it (offline-counter 3.2, 3.3). */
export const deviceProofPurposeSchema = z.enum(['enrol', 'sign-in']);
export type DeviceProofPurpose = z.infer<typeof deviceProofPurposeSchema>;

/**
 * The text a device signs (offline-counter 3.3): the purpose, the Organisation, the device and the server's one-time
 * challenge, so a signature made for one purpose, Organisation or device proves nothing for another. UTF-8, signed with
 * ECDSA P-256 and SHA-256. The server and the counter build it from this one function.
 */
export function deviceProofMessage(
  purpose: DeviceProofPurpose,
  organisationCode: string,
  deviceId: string,
  challenge: string,
): string {
  return ['apparel-os device proof 1', purpose, organisationCode, deviceId, challenge].join('\n');
}

/** A challenge is asked for on the sign-in path, before anyone is signed in (offline-counter 3.3). */
export const deviceChallengeRequestSchema = z.strictObject({ organisationCode: organisationCodeSchema });
export type DeviceChallengeRequestInput = z.input<typeof deviceChallengeRequestSchema>;

/** A one-time challenge to sign: no secret, used at most once. */
export const deviceChallengeSchema = z.strictObject({ challengeId: idSchema, challenge: challengeTextSchema });
export type DeviceChallenge = z.infer<typeof deviceChallengeSchema>;

/** A device's proof at sign-in: its signature over a challenge (offline-counter 3.3, 3.4; POL-02.18). */
export const deviceProofSchema = z.strictObject({
  deviceId: idSchema,
  challengeId: idSchema,
  signature: signatureSchema,
});
export type DeviceProof = z.infer<typeof deviceProofSchema>;

/** A device's code: unique in the Organisation, without regard to letter case (access-and-approvals 2.4). */
export const deviceCodeSchema = masterCodeSchema;

/**
 * Register a billing device (offline-counter 3.2 step 1): its code, label, Store and the whole-store and brand-counter
 * units of that Store it bills for, from today. It is Setting up until enrolled.
 */
export const billingDeviceDraftSchema = z.strictObject({
  code: deviceCodeSchema,
  label: z.string().regex(/\S/),
  storeId: idSchema,
  businessUnitIds: z.array(idSchema).min(1),
});
export type BillingDeviceDraft = z.infer<typeof billingDeviceDraftSchema>;

export const billingDeviceRegisteredSchema = z.strictObject({ deviceId: idSchema, state: z.literal('Setting up') });

/**
 * Enrol this browser as the device (offline-counter 3.2 steps 2 and 3): its public key, its signature over a
 * challenge, and the enrolling person's fresh authenticator code (GC8-8; access-and-approvals 3.3).
 */
export const deviceEnrolmentSchema = z.strictObject({
  publicKey: devicePublicKeySchema,
  challengeId: idSchema,
  signature: signatureSchema,
  totpCode: totpCodeSchema,
});
export type DeviceEnrolmentInput = z.input<typeof deviceEnrolmentSchema>;

/** The states of a device (offline-counter 3.1; GC8-7, DEC-116). */
export const deviceStateSchema = z.enum(['Setting up', 'Active', 'Revoked', 'Ended']);
export type DeviceState = z.infer<typeof deviceStateSchema>;

/** A device bill series as the devices screen shows it (offline-counter 4.1, 4.4). */
export const deviceSeriesSchema = z.strictObject({
  seriesId: idSchema,
  taxRegistrationId: idSchema,
  taxRegistrationCode: z.string().min(1),
  financialYear: z.string().min(1),
  state: z.enum(['Open', 'Paused', 'Closed']),
});
export type DeviceSeries = z.infer<typeof deviceSeriesSchema>;

/**
 * Why an enrolled device has no series yet (offline-counter 4.1, 11; DEC-116): no bill-number format, no financial
 * year for today, or a unit with no mapping in force. Its series come when the missing setting is defined (DEC-117).
 */
export const seriesMissingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('bill-format') }),
  z.strictObject({ kind: z.literal('financial-year'), date: businessDateSchema }),
  z.strictObject({ kind: z.literal('mapping'), businessUnitId: idSchema }),
]);
export type SeriesMissing = z.infer<typeof seriesMissingSchema>;

export const deviceEnrolledSchema = z.strictObject({
  deviceId: idSchema,
  state: z.literal('Active'),
  series: z.array(deviceSeriesSchema),
  seriesMissing: z.array(seriesMissingSchema),
});
export type DeviceEnrolled = z.infer<typeof deviceEnrolledSchema>;

/** A billing device as the devices screen and the counter's enrolment page list it. */
export const billingDeviceViewSchema = z.strictObject({
  deviceId: idSchema,
  code: z.string().min(1),
  label: z.string().min(1),
  state: deviceStateSchema,
  storeId: idSchema,
  units: z.array(z.strictObject({ businessUnitId: idSchema, code: z.string().min(1), kind: businessUnitKindSchema })),
  series: z.array(deviceSeriesSchema),
});
export type BillingDeviceView = z.infer<typeof billingDeviceViewSchema>;

export const billingDeviceListSchema = z.strictObject({
  asOf: z.iso.datetime(),
  devices: z.array(billingDeviceViewSchema),
});
export type BillingDeviceList = z.infer<typeof billingDeviceListSchema>;
