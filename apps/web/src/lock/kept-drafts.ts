import { keptInput, type DeclaredFields } from './kept-input';

// Unsaved input kept on the device across the end of a session (access-and-approvals 3.3; PRD-ACS-017, POL-02.18,
// PRD-UXP-003): when the absolute limit ends a session, or it is revoked, the screen's unsaved input is offered back
// after the next sign-in, to the same user in the same Organisation only. Restricted fields and secrets are never
// kept; the person enters them again (PRD-SEC-006, PRD-SEC-014). A draft already saved on the server stays a Draft
// record there and needs nothing here (S1-F01-T09).

/** The part of the browser's Storage a draft needs; null where the browser refuses one. */
export type DraftStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Whose draft: one user of one Organisation (PRD-ACS-020). */
export interface DraftOwner {
  readonly organisationCode: string;
  readonly userId: string;
}

function draftKey(owner: DraftOwner, formId: string): string {
  return `aos.kept-draft/1/${owner.organisationCode}/${owner.userId}/${formId}`;
}

/** Keeps a copy of a form's input, without its secret and restricted fields. Fails quietly where storage fails. */
export function saveDraft(
  store: DraftStore | null,
  owner: DraftOwner,
  formId: string,
  route: DeclaredFields,
  values: unknown,
): void {
  try {
    store?.setItem(draftKey(owner, formId), JSON.stringify(keptInput(route, values)));
  } catch {
    // A full or refused store keeps nothing; the work on screen is unaffected.
  }
}

/** The input kept for this owner and form, or null. */
export function readDraft(store: DraftStore | null, owner: DraftOwner, formId: string): unknown {
  try {
    const text = store?.getItem(draftKey(owner, formId)) ?? null;
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/** Forgets the kept input: once restored, discarded or submitted. */
export function discardDraft(store: DraftStore | null, owner: DraftOwner, formId: string): void {
  try {
    store?.removeItem(draftKey(owner, formId));
  } catch {
    // Nothing to forget where storage fails.
  }
}

/** The browser's local storage, or null where reading it throws (a private window, blocked site data). */
export function browserDraftStore(): DraftStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
