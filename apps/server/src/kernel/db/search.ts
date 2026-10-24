// Text search in PostgreSQL (PRD Stack: Search, "PostgreSQL full-text and trigram search"; S2-F11-T01): a text a
// person types is found as a part of a code, ignoring case, by `ilike`, which a trigram index (`gin_trgm_ops`) serves.
// The pattern is a bound parameter (code-house-rules 3.4); the characters `%` and `_` the person types stand for
// themselves, escaped with the backslash, `ilike`'s escape character.

/** A text as a part of a value, for `ilike`: trimmed, with `%`, `_` and the escape itself escaped. */
export function containsPattern(text: string): string {
  return `%${text.trim().replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
