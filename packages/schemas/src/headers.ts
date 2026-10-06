// The headers of the API's conventions (code-house-rules 12.4, 12.11), shared by the server and the typed client.

/** The key a client makes for one submission of a command, a UUIDv7 (code-house-rules 12.4; PRD-INT-002). */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
/** Set to `true` on the answer to a replay: the answer kept under the key (code-house-rules 12.4). */
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';
/** The request's correlation identifier, made by the server (code-house-rules 12.11). */
export const CORRELATION_ID_HEADER = 'X-Correlation-Id';
