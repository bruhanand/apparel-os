// Public interface of the exceptions module (module-map 4.13; access-and-approvals 12). Other code imports only from here.
export { ExceptionsModule } from './exceptions.module.js';
export { EXCEPTION_TYPES, EXCEPTIONS } from './tokens.js';
export { Exceptions, unfinishedOperation } from './exceptions.js';
export type { ExceptionsDependencies, ExceptionsInterface } from './exceptions.js';
export { EXCEPTION_CODE_KIND, EXCEPTION_CODE_SCOPE_KEY, EXCEPTION_RECORD_TYPE } from './domain/types.js';
export type { ExceptionTypeRegistration, ResolutionAnswer, ResolutionSubject } from './domain/types.js';
export type { ExceptionFacts, Raised, RaiseInput } from './commands/raise.js';
export type { Acting, Changed } from './commands/lifecycle.js';
export type { EvidenceAdded } from './commands/evidence.js';
export type { Outcome } from './commands/common.js';
export { EXCEPTIONS_IDENTITY, exceptionsConsumers, exceptionsJobKinds } from './jobs/jobs.js';
export { ROUTING_ACTION_TYPE, routingApprovals } from './commands/routing.js';
export { exceptionAssigned, exceptionRaised, exceptionReopened, exceptionResolved } from './events.js';
