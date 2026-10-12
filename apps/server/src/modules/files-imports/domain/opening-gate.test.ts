import { describe, expect, it } from 'vitest';
import { OPENING_PUBLISHING, openingGate } from './opening-gate.js';

// S1-F13-T03: the publish gate of an opening batch (imports-and-opening-data 4.2, 10.1; PRD-SEC-017, PRD-UXP-003,
// PRD-LIF-011, PRD-LIF-026, POL-14.07, DEC-071). Every identifier is SYNTHETIC.

const UNIT = '01990000-0000-7000-8000-0000000000a1';
const SWITCH = '01990000-0000-7000-8000-0000000000b1';
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
      openingGate({ environment: 'local', availability: POLICY_MISSING, opening: { kind: 'none' }, unitId: UNIT }),
    ).toEqual({ kind: 'unavailable', missing: [...POLICY_MISSING, { kind: 'opening-switch', businessUnitId: UNIT }] });
  });

  it('DEC-071 on kdps-test publishing is always unavailable, even with policy 14 and a switch', () => {
    expect(
      openingGate({
        environment: 'kdps-test',
        availability: [],
        opening: { kind: 'approved', switchId: SWITCH, cutover: 'open' },
        unitId: UNIT,
      }),
    ).toEqual({ kind: 'unavailable', missing: [{ kind: 'hosting', environment: 'kdps-test' }] });
  });

  it('POL-14.07 available with policy 14 Signed and validated at an approved switch whose cutover is open', () => {
    expect(
      openingGate({
        environment: 'dev',
        availability: [],
        opening: { kind: 'approved', switchId: SWITCH, cutover: 'open' },
        unitId: UNIT,
      }),
    ).toEqual({ kind: 'available', switchId: SWITCH });
  });

  it('PRD-LIF-011 a unit whose cutover is complete is refused, whatever else is missing', () => {
    expect(
      openingGate({
        environment: 'local',
        availability: POLICY_MISSING,
        opening: { kind: 'approved', switchId: SWITCH, cutover: 'complete' },
        unitId: UNIT,
      }),
    ).toEqual({ kind: 'cutover-complete', switchId: SWITCH });
  });
});
