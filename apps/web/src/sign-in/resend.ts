// When a command's answer leaves it unknown whether the command ran, the same submission is sent again under the
// same idempotency key, so it is never applied twice; any other answer ends the submission, and the next press is a
// new one with a new key (code-house-rules 12.4; the typed client's CallInput).

const UNSETTLED_CODES: ReadonlySet<string> = new Set([
  'kernel.timed-out',
  'kernel.outcome-unknown',
  'kernel.request-in-progress',
]);

/** The key to send the next press under, or undefined for a new submission. */
export function keyToResend(
  result:
    | { readonly ok: true; readonly idempotencyKey: string | undefined }
    | { readonly ok: false; readonly idempotencyKey: string | undefined; readonly error: { readonly code: string } },
): string | undefined {
  if (result.ok) return undefined;
  return UNSETTLED_CODES.has(result.error.code) ? result.idempotencyKey : undefined;
}
