import type { CallResult, ErrorBody, routes, SessionView, SignInOutcome } from '@apparel-os/schemas';

// Which sign-in screen shows next (access-and-approvals 3.1 to 3.3; S1-F01-T15). The server decides every step: the
// screens only follow what sign-in answered and what the session read says is still to do. Until enrolment and the
// password change are done, the session reaches nothing else (access-and-approvals 3.2, 7.1 step 1).

export type SignInStage =
  /** The sign-in form, with the refusal of the last attempt or read, if any. */
  | { readonly stage: 'sign-in'; readonly refusal?: ErrorBody }
  /** Sign-in passed: the session read says who is signed in. */
  | { readonly stage: 'read-session' }
  | { readonly stage: 'enrolment' }
  | { readonly stage: 'password-change' }
  | { readonly stage: 'signed-in'; readonly view: SessionView };

/** Where a sign-in that passed goes (signInOutcomeSchema). */
export function stageAfterSignIn(outcome: SignInOutcome): SignInStage {
  switch (outcome.outcome) {
    case 'signed-in':
      return { stage: 'read-session' };
    case 'enrolment-required':
      return { stage: 'enrolment' };
    case 'password-change-required':
      return { stage: 'password-change' };
  }
}

/**
 * Where the session read goes: signed in; the first step of first sign-in still to do, which the server names in
 * `missing` (`access.sign-in-incomplete`); or the sign-in form, which shows any refusal other than "not signed in".
 */
export function stageOfSessionRead(result: CallResult<typeof routes.session>): SignInStage {
  if (result.ok) return { stage: 'signed-in', view: result.data };
  const { error } = result;
  if (error.code === 'access.not-signed-in') return { stage: 'sign-in' };
  if (error.code === 'access.sign-in-incomplete') {
    const step = error.missing?.find((item) => item.kind === 'sign-in-step')?.step;
    if (step === 'enrolment' || step === 'password-change') return { stage: step };
  }
  return { stage: 'sign-in', refusal: error };
}
