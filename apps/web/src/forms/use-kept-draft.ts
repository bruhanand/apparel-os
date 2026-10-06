import { useEffect, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { browserDraftStore, discardDraft, readDraft, saveDraft, type DraftStore } from '../lock/kept-drafts';
import type { DeclaredFields } from '../lock/kept-input';
import { useSession } from '../shell/session';

/**
 * Keeps a form's unsaved input on the device while the person types, without its secret and restricted fields, and
 * offers it back after the next sign-in of the same user in the same Organisation, when a session ended with it
 * unsaved (access-and-approvals 3.3; PRD-ACS-017, PRD-UXP-003; S1-F01-T09). A screen shows KeptDraftBanner while
 * `offered` is set, and calls `forget` once the command has the input.
 */
export function useKeptDraft<Values extends FieldValues>(
  route: DeclaredFields,
  form: UseFormReturn<Values>,
  formId: string,
  store: DraftStore | null = browserDraftStore(),
) {
  const { session } = useSession();
  const organisationCode = session.state === 'signed-out' ? null : session.user.organisationCode;
  const userId = session.state === 'signed-out' ? null : session.user.userId;
  const [offered, setOffered] = useState<unknown>(() =>
    organisationCode === null || userId === null ? null : readDraft(store, { organisationCode, userId }, formId),
  );
  useEffect(() => {
    if (organisationCode === null || userId === null) return undefined;
    const owner = { organisationCode, userId };
    const watching = form.watch((values) => {
      saveDraft(store, owner, formId, route, values);
    });
    return () => {
      watching.unsubscribe();
    };
  }, [form, formId, route, store, organisationCode, userId]);
  const forget = () => {
    if (organisationCode !== null && userId !== null) discardDraft(store, { organisationCode, userId }, formId);
    setOffered(null);
  };
  return {
    offered,
    restore: () => {
      if (offered !== null) form.reset(offered as Values, { keepDefaultValues: true });
      setOffered(null);
    },
    discard: forget,
    forget,
  };
}
