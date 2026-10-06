import type { ErrorKind, Issue, MissingItem } from '@apparel-os/schemas';

/** What an answer that is not a success says, before the reference is added (code-house-rules 12.3). */
export interface RefusalBody {
  readonly kind: ErrorKind;
  /** `<unit>.<reason>`, declared by its unit in `packages/schemas` with this kind. */
  readonly code: string;
  /** What blocks the action, as identifiers and codes only. Left out where a design asks for one refusal. */
  readonly missing?: readonly MissingItem[];
  readonly next?: string;
  /** For `invalid` only: the paths and issue codes that failed, never the input. */
  readonly issues?: readonly Issue[];
  /** The refusal kept under the idempotency key, answered again (code-house-rules 12.4). */
  readonly replayed?: boolean;
}

/**
 * A refusal a route answers in the error envelope (code-house-rules 12.3). A controller or the API conventions throw
 * it; the envelope filter adds the reference and the status of its kind. It holds identifiers and codes only, never
 * a restricted value, a secret, an input value or a database message (PRD-SEC-006, PRD-SEC-014).
 */
export class ApiRefusal extends Error {
  constructor(readonly body: RefusalBody) {
    super(`The request was answered ${body.kind}: ${body.code}`);
    this.name = 'ApiRefusal';
  }
}
