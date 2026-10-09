/** The token of the exceptions module's interface (ExceptionsInterface). Inject it with @Inject(EXCEPTIONS). */
export const EXCEPTIONS = 'exceptions.Exceptions';

/**
 * The token of the exception types the raising modules register, each with its resolution check (access-and-approvals
 * 12.1; module-map section 3, rule 6), a list of ExceptionTypeRegistration the composition root provides. While none
 * is provided, only the module's own type, the unfinished operation, is registered.
 */
export const EXCEPTION_TYPES = 'exceptions.ExceptionTypes';
