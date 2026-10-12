import { describe, expect, it } from 'vitest';
import { deploymentEnvironmentNames } from '../../../kernel/index.js';
import { OPENING_PUBLISHING, openingGate, PRODUCTION_HOSTING } from './opening-gate.js';

// S1-F13-T03: the publish gate of an opening batch (imports-and-opening-data 4.2, 10.1; PRD-SEC-017, PRD-UXP-003,
// PRD-LIF-011, PRD-LIF-026, POL-14.07, DEC-071; product owner, 13 Oct 2026: the hosting an allow-list). Every identifier
// is SYNTHETIC.

const UNIT = '01990000-0000-7000-8000-0000000000a1';
const SWITCH = '01990000-0000-7000-8000-0000000000b1';
/** A synthetic Organisation's code (DEC-118), and one that is not synthetic. */
const SYNTHETIC = 'SYN-OPENING';
const REAL = 'ORG-OPENING';
const POLICY_MISSING = [
  { kind: 'capability', capability: OPENING_PUBLISHING.capability },
  { kind: 'policy', policy: '14', lacks: 'signature' },
];

describe('the opening publish gate (4.2, 10.1)', () => {
  it('PRD-SEC-017 the operation is governed by policy 14, its capability off until switched on, with no activity', () => {
    expect(OPENING_PUBLISHING).toEqual({
      code: 'files-imports.publish-opening',
      policy: 14,
      capability: 'files-imports.opening-publishing',
      activity: null,
      checks: [],
    });
  });

  it('PRD-UXP-003 names everything missing: what Available lacks and the switch', () => {
    expect(
      openingGate({
        environment: 'local',
        organisationCode: SYNTHETIC,
        availability: POLICY_MISSING,
        opening: { kind: 'none' },
        unitId: UNIT,
      }),
    ).toEqual({ kind: 'unavailable', missing: [...POLICY_MISSING, { kind: 'opening-switch', businessUnitId: UNIT }] });
  });

  it('DEC-071 PRD-UXP-003 on kdps-test publishing is always unavailable, naming every thing missing with the hosting', () => {
    expect(
      openingGate({
        environment: 'kdps-test',
        organisationCode: SYNTHETIC,
        availability: POLICY_MISSING,
        opening: { kind: 'none' },
        unitId: UNIT,
      }),
    ).toEqual({
      kind: 'unavailable',
      missing: [
        ...POLICY_MISSING,
        { kind: 'hosting', environment: 'kdps-test' },
        { kind: 'opening-switch', businessUnitId: UNIT },
      ],
    });
    expect(
      openingGate({
        environment: 'kdps-test',
        organisationCode: SYNTHETIC,
        availability: [],
        opening: { kind: 'approved', switchId: SWITCH, cutover: 'open' },
        unitId: UNIT,
      }),
    ).toEqual({ kind: 'unavailable', missing: [{ kind: 'hosting', environment: 'kdps-test' }] });
  });

  it('PRD-LIF-026 DEC-071 the hosting is an allow-list: production, or local and dev with a synthetic Organisation only', () => {
    const at = (environment: string, organisationCode: string) =>
      openingGate({
        environment,
        organisationCode,
        availability: [],
        opening: { kind: 'approved', switchId: SWITCH, cutover: 'open' },
        unitId: UNIT,
      });
    const available = { kind: 'available', switchId: SWITCH };
    expect(at(PRODUCTION_HOSTING, REAL)).toEqual(available);
    expect(at('local', SYNTHETIC)).toEqual(available);
    expect(at('dev', SYNTHETIC)).toEqual(available);
    // Development work with an Organisation that is not synthetic: refused, naming the environment.
    expect(at('local', REAL)).toEqual({ kind: 'unavailable', missing: [{ kind: 'hosting', environment: 'local' }] });
    expect(at('dev', REAL)).toEqual({ kind: 'unavailable', missing: [{ kind: 'hosting', environment: 'dev' }] });
    // Any other environment, the test setup with a synthetic Organisation too, or one not yet named.
    expect(at('kdps-test', SYNTHETIC)).toEqual({
      kind: 'unavailable',
      missing: [{ kind: 'hosting', environment: 'kdps-test' }],
    });
    expect(at('staging', SYNTHETIC)).toEqual({
      kind: 'unavailable',
      missing: [{ kind: 'hosting', environment: 'staging' }],
    });
  });

  it('PRD-LIF-026 production hosting is an explicit environment value that no environment has yet', () => {
    expect(PRODUCTION_HOSTING).toBe('production');
    expect(deploymentEnvironmentNames).not.toContain(PRODUCTION_HOSTING);
  });

  it('POL-14.07 available with policy 14 Signed and validated at an approved switch whose cutover is open', () => {
    expect(
      openingGate({
        environment: 'dev',
        organisationCode: SYNTHETIC,
        availability: [],
        opening: { kind: 'approved', switchId: SWITCH, cutover: 'open' },
        unitId: UNIT,
      }),
    ).toEqual({ kind: 'available', switchId: SWITCH });
  });

  it('PRD-LIF-011 a unit whose cutover is complete is refused, whatever else is missing', () => {
    expect(
      openingGate({
        environment: 'kdps-test',
        organisationCode: REAL,
        availability: POLICY_MISSING,
        opening: { kind: 'approved', switchId: SWITCH, cutover: 'complete' },
        unitId: UNIT,
      }),
    ).toEqual({ kind: 'cutover-complete', switchId: SWITCH });
  });
});
