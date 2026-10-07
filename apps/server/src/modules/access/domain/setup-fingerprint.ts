import { setupFingerprintFieldsSchema, type SetupRequest } from '@apparel-os/schemas';
import { canonicalJson, sha256Hex } from '../../../kernel/index.js';

/**
 * The version of the setup fingerprint's canonical form (access-and-approvals 9.11, 13.1; RR-211). A rerun whose
 * record keeps another version is refused as a change of version; two fingerprints made two ways are never compared.
 */
export const SETUP_FINGERPRINT_VERSION = 'setup-fingerprint/1';

/**
 * The fingerprint of a setup request's non-secret fields (access-and-approvals 9.11; RR-211): SHA-256, as hex, of the
 * canonical JSON (sorted keys, no insignificant space; code-house-rules 12.4) of the request parsed through
 * setupFingerprintFieldsSchema, which drops both temporary passwords, so no form of a secret reaches it
 * (PRD-SEC-014). The canonical form, version 1:
 *
 * - every field as the request gives it, after its schema has parsed it: the Organisation code and the database name
 *   exactly; each login exactly, its letter case kept, since the step writes the login as given (a request that
 *   differs only in a login's case is another request, and conflicts);
 * - personas in the order given, since their order is kept and the first sets the landing screen (personas.md 2);
 * - settings as parsed, every required one present (DEC-118), none null or a default; numbers as JSON numbers.
 */
export function setupFingerprint(request: SetupRequest): string {
  const fields = setupFingerprintFieldsSchema.parse(request);
  return sha256Hex(canonicalJson(fields));
}
