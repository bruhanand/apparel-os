// A total order on text by code unit, the order PostgreSQL gives a `uuid` and the order the books part sorts keys in
// (code-house-rules 8.2): negative, zero or positive, so two equal keys compare equal.

export function byText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
