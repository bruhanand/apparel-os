import { syntheticIdentifier } from './synthetic.js';

// The synthetic names of the stock ledger's tests (S1-F10-T02; stock-ledger 13.2, 15.3; code-house-rules 11.1): the
// caller's module and record type, the document's record type in the permission registry, and the approval action
// types. Each carries the synthetic label through `syntheticIdentifier`, and none is a KDPS value.

/** The synthetic caller's module (13.2). */
export const SYNTHETIC_MODULE = syntheticIdentifier('stock-ledger');
/** The record type the synthetic caller posts from (13.2). */
export const SYNTHETIC_RECORD_TYPE = 'document';
/** The synthetic document's record type in the permission registry: no scope fact, like the harness's (15.2). */
export const SYNTHETIC_DOCUMENT_TYPE = `${SYNTHETIC_MODULE}.document`;
/** A synthetic approval action type with no value basis (15.3). */
export const APPROVE_DOCUMENT = `${SYNTHETIC_MODULE}.approve-document`;
/** A synthetic approval action type with cost as its value basis (15.3). */
export const APPROVE_ON_COST = `${SYNTHETIC_MODULE}.approve-on-cost`;
/** A module no caller registers (13.2 `caller-not-registered`). */
export const UNREGISTERED_MODULE = syntheticIdentifier('other');
