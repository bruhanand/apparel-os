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

/**
 * Every schema made by secretString() or shownOnceSecret() is registered here, so the OpenAPI generator, a test or a
 * logger can find the secret fields (code-house-rules 12.2). `shownOnce` marks a secret an answer shows once (12.6).
 */
export const secretRegistry = z.registry<{ secret: true; shownOnce?: true }>();

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

/**
 * A secret an answer shows once and never again: the authenticator secret at enrolment and a service identity's
 * secret (code-house-rules 12.6; DEC-113; access-and-approvals 2.3, 3.2). On the wire it is a plain string. It is a
 * codec between that string and a `Secret`: the server encodes the answer, revealing the value at that one place, and
 * the typed client decodes it back into a `Secret`, so the web app's state, logs and error reports show only the
 * placeholder until the screen shows it to the person (PRD-SEC-014).
 */
export function shownOnceSecret() {
  const schema = z.codec(z.string().min(1), z.instanceof(Secret), {
    decode: (value) => new Secret(value),
    encode: (secret) => secret.reveal(),
  });
  secretRegistry.add(schema, { secret: true, shownOnce: true });
  return schema;
}
