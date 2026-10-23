import type { CommandRefusal, RefusalBody } from '../../../kernel/index.js';

// The refusals `reports` answers (code-house-rules 12.3; goods-in 9.4; S2-F11-T01), one source each.

/** No business date while the Organisation has no timezone (code-house-rules 9, 12.14). */
export const BUSINESS_DATE_NOT_SET: CommandRefusal = {
  kind: 'unavailable',
  code: 'access.business-date-not-set',
  missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
};

/** More results than one export holds (STOCK_SEARCH_EXPORT_CAP, a technical cap): narrow the search. */
export const EXPORT_TOO_LARGE: CommandRefusal = { kind: 'refused', code: 'reports.export-too-large', missing: [] };

/** A cursor this search did not give: the request is invalid, naming where (code-house-rules 12.3). */
export const invalidCursor = (): RefusalBody => ({
  kind: 'invalid',
  code: 'kernel.invalid-request',
  issues: [{ path: ['query', 'after'], code: 'invalid_cursor' }],
});
