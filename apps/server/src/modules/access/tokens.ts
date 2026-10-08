/** The token of the access module's interface (AccessInterface). Inject it with @Inject(ACCESS). */
export const ACCESS = 'access.Access';

/** The token of the test sign-in setting, read at start (access-and-approvals 3.4; DEC-121). */
export const DEMO_SIGN_IN = 'access.DemoSignIn';

/**
 * The token of every module's approval rules and decision effects (access-and-approvals 8, 9.8b; module-map section 3,
 * rule 6), a `ModuleApprovals` the composition root provides. Required by AccessModule, so the application refuses
 * to start without it.
 */
export const MODULE_APPROVALS = 'access.ModuleApprovals';
