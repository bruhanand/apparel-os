/** The `conflict` codes the idempotency helper answers (code-house-rules 12.3, 12.4, 12.5, 12.6). */
export type IdempotencyConflictCode =
  | 'kernel.idempotency-key-reused'
  | 'kernel.request-in-progress'
  | 'kernel.secret-not-comparable'
  | 'kernel.answer-not-repeatable';

/**
 * A request the idempotency helper answers `conflict` (code-house-rules 12.3, 12.4). Its kind and code are those of
 * the error envelope, which `S1-F01-T05` declares in `packages/schemas` and answers with status 409. It holds the
 * code and the correlation identifier only: never a field value, a secret or which field differs (12.5).
 *
 * - `kernel.idempotency-key-reused`: the key was used with other content; the refused request is kept
 *   (`PRD-INT-002`). `formVersionChanged` says the key's row was made under another version of the canonical form,
 *   so the two hashes were not compared (12.4 "What is hashed").
 * - `kernel.request-in-progress`: the first request under the key is still running and the wait reached the lock
 *   limit (12.4 "Two at once"); the client sends the same key again later.
 * - `kernel.secret-not-comparable`: an identical replay whose new secret cannot be compared (12.5; CH-8); kept.
 * - `kernel.answer-not-repeatable`: the first answer showed a secret or a restricted value unmasked, so it is never
 *   repeated (12.6; DEC-113, DEC-114); the client starts again with a new key.
 */
export class IdempotencyConflict extends Error {
  readonly kind = 'conflict';

  constructor(
    readonly code: IdempotencyConflictCode,
    readonly correlationId: string,
    readonly formVersionChanged = false,
  ) {
    super(`The request was answered conflict: ${code}`);
    this.name = 'IdempotencyConflict';
  }
}
