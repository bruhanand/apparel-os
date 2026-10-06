/**
 * The display form of an error's reference (code-house-rules 12.3 "Reference"; design-language 10.13): `ERR-` and the
 * last six hexadecimal digits of the request's correlation identifier, in capitals. The identifier is a UUIDv7 whose
 * last digits are random (12.11), so an operator finds the request's log lines by searching for an identifier that
 * ends in those six digits, ignoring case. The full identifier stays on the element for copying.
 */
export function displayReference(correlationId: string): string {
  return `ERR-${correlationId.replaceAll('-', '').slice(-6).toUpperCase()}`;
}
