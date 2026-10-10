import { describe, expect, it } from 'vitest';
import { PRODUCTION_COMPOSITION } from '../../../kernel/index.js';
import { GateRegistry, type GatedOperation } from './gate.js';
import { deploymentEnvironmentOf, originAccepted } from './origins.js';

// The policy gate's own rules (module-map 4.4; code-house-rules 11.1, 12.14; DEC-116; S1-F04-T01).

const SYNTHETIC_ORGANISATION = ['SYN', 'ORG-A'].join('-');
const REAL_ORGANISATION = 'KDPS';

describe('where a value came from (code-house-rules 12.14; DEC-116)', () => {
  it.each([
    ['local', 'synthetic', SYNTHETIC_ORGANISATION, true],
    ['dev', 'synthetic', SYNTHETIC_ORGANISATION, true],
    ['dev', 'synthetic', REAL_ORGANISATION, false],
    ['kdps-test', 'synthetic', SYNTHETIC_ORGANISATION, false],
    ['production', 'synthetic', SYNTHETIC_ORGANISATION, false],
    ['kdps-test', 'test-setup', REAL_ORGANISATION, true],
    ['dev', 'test-setup', SYNTHETIC_ORGANISATION, false],
    ['production', 'test-setup', REAL_ORGANISATION, false],
    ['production', 'kdps', REAL_ORGANISATION, true],
  ] as const)('with %s, a %s value on %s is accepted: %s', (environment, origin, organisation, accepted) => {
    expect(originAccepted(deploymentEnvironmentOf({ AOS_ENVIRONMENT: environment }), origin, organisation)).toBe(
      accepted,
    );
  });

  it('accepts no synthetic or test-setup value where no environment is named', () => {
    const unnamed = deploymentEnvironmentOf({});
    expect(unnamed.name).toBeNull();
    expect(originAccepted(unnamed, 'synthetic', SYNTHETIC_ORGANISATION)).toBe(false);
    expect(originAccepted(unnamed, 'test-setup', REAL_ORGANISATION)).toBe(false);
    expect(originAccepted(deploymentEnvironmentOf({ AOS_ENVIRONMENT: '' }), 'synthetic', SYNTHETIC_ORGANISATION)).toBe(
      false,
    );
  });
});

describe('the operations and checks the modules declare (module-map 4.4; code-house-rules 11.1)', () => {
  const operation: GatedOperation = {
    code: 'test-syn-gate.effect',
    policy: 14,
    capability: 'test-syn-gate.feature',
    activity: null,
    checks: [],
  };

  it('refuses a synthetic operation outside a test composition', () => {
    expect(() => {
      new GateRegistry().registerOperation(operation, PRODUCTION_COMPOSITION);
    }).toThrow(/outside a test composition/);
    expect(() => {
      new GateRegistry().registerOperation(operation);
    }).toThrow(/outside a test composition/);
  });

  it('refuses an operation declared twice', () => {
    const registry = new GateRegistry();
    const real = { ...operation, code: 'site-lifecycle.publish-opening-data', capability: 'site-lifecycle.opening' };
    registry.registerOperation(real);
    expect(() => {
      registry.registerOperation(real);
    }).toThrow(/twice/);
    expect(registry.hasCapability('site-lifecycle.opening')).toBe(true);
    expect(registry.hasCapability('site-lifecycle.other')).toBe(false);
  });
});
