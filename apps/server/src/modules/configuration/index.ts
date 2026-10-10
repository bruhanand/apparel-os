// Public interface of the configuration module (module-map 4.4). Other code imports only from here: the Organisation's
// timezone (code-house-rules 9; RR-231) and the policy gate, with the policy status, the capabilities and the activity
// grants behind it (S1-F04-T01).
export { ConfigurationModule, ConfigurationTimezoneModule } from './configuration.module.js';
export { setUpTimezone } from './commands/set-up-timezone.js';
export { configurationTimezoneSource } from './queries/timezone.js';
export { CONFIGURATION, CONFIGURATION_ENVIRONMENT } from './tokens.js';
export { Configuration, OPEN_POLICY_READINESS, unavailableRefusal } from './configuration.js';
export type {
  AvailabilityAnswer,
  ConfigurationDependencies,
  ConfigurationInterface,
  PolicyReadinessRow,
} from './configuration.js';
export type { Outcome as ConfigurationOutcome, Recorder } from './commands/policy-status.js';
export type { PlaceAsked } from './queries/availability.js';
export type {
  ActivityNeeds,
  ConfiguredValue,
  GatedOperation,
  ValidityAnswer,
  ValidityCheck,
  ValiditySubject,
} from './domain/gate.js';
export { SYNTHETIC_GATE_PREFIX } from './domain/gate.js';
export { deploymentEnvironmentOf, ENVIRONMENT_VARIABLE } from './domain/origins.js';
export type { DeploymentEnvironment } from './domain/origins.js';
export { POLICY_EVIDENCE } from './contracts/policy-evidence.js';
export type { PolicyEvidence, PolicyEvidenceLink } from './contracts/policy-evidence.js';
export { activityChanged, capabilityChanged, policyStatusChanged } from './events.js';
export { ACTIVITY_GRANTER } from './commands/activity-grants.js';
export type { ActivityGranter, ActivityGrantRequest } from './commands/activity-grants.js';
