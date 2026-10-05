import { z } from 'zod';

// PRD-SEC-006, PRD-SEC-014: a secret (a password, a temporary password, an authenticator secret) never reaches
// a log, an error, an audit record or a live update. A parsed secret is wrapped, so JSON, string conversion and
// Node's inspector show a placeholder; only an explicit reveal() gives the plaintext, at the one place that
// hashes, verifies or shows it once (access-and-approvals 3.2, 9.11).

const PLACEHOLDER = '[secret]';

// Node's util.inspect.custom, named through the global registry so this package needs no Node import and also
// runs in the browser.
const inspectCustom = Symbol.for('nodejs.util.inspect.custom');

export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** The plaintext. Call it only where the value is hashed, verified, or shown once to its owner. */
  reveal(): string {
    return this.#value;
  }

  toJSON(): string {
    return PLACEHOLDER;
  }

  toString(): string {
    return PLACEHOLDER;
  }

  [inspectCustom](): string {
    return PLACEHOLDER;
  }
}

/** Every schema made by secretString() is registered here, so a test or a logger can find the secret fields. */
export const secretRegistry = z.registry<{ secret: true }>();

/**
 * A secret string. It refuses only an absent value: the password rules are OPEN (GC3-5) and are a setting,
 * never a schema default. Zod reports no input value in its issues, so a refusal never echoes the secret.
 */
export function secretString() {
  const schema = z
    .string()
    .min(1)
    .transform((value) => new Secret(value));
  secretRegistry.add(schema, { secret: true });
  return schema;
}
