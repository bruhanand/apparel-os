import { describe, expect, it } from 'vitest';
import { DEMO_SIGN_IN_VARIABLE, demoSignInFromEnvironment, findDemoPerson } from './demo-sign-in.js';

// S1-F01-T28: the test sign-in of the development environments only (POL-02.17, PRD-ACS-017; DEC-121;
// access-and-approvals 3.4). Every value is SYNTHETIC.

const LIST = JSON.stringify([
  { organisationCode: 'SYN-ORG-A', login: 'syn-admin-a', label: 'Admin · SYN-ORG-A' },
  { organisationCode: 'SYN-ORG-A', login: 'syn-approver-a', label: 'Approver · SYN-ORG-A' },
]);

describe('the test sign-in setting (DEC-121; POL-02.17)', () => {
  it('is off when the list is not set, in any environment', () => {
    expect(demoSignInFromEnvironment({})).toEqual({ enabled: false, people: [] });
    expect(demoSignInFromEnvironment({ AOS_ENVIRONMENT: 'kdps-test' })).toEqual({ enabled: false, people: [] });
  });

  it('POL-02.17 is on with the listed SYNTHETIC people on local and dev only', () => {
    for (const environment of ['local', 'dev']) {
      const settings = demoSignInFromEnvironment({ AOS_ENVIRONMENT: environment, [DEMO_SIGN_IN_VARIABLE]: LIST });
      expect(settings.enabled).toBe(true);
      expect(settings.people).toHaveLength(2);
      expect(settings.people[0]).toEqual({
        organisationCode: 'SYN-ORG-A',
        login: 'syn-admin-a',
        label: 'Admin · SYN-ORG-A',
      });
    }
  });

  it('POL-02.17 refuses to start with the list set outside the development environments', () => {
    for (const environment of ['kdps-test', 'production', '', undefined]) {
      expect(() => demoSignInFromEnvironment({ AOS_ENVIRONMENT: environment, [DEMO_SIGN_IN_VARIABLE]: LIST })).toThrow(
        /AOS_DEMO_SIGN_IN/,
      );
    }
  });

  it('refuses a person of an Organisation whose code is not SYNTHETIC', () => {
    const list = JSON.stringify([{ organisationCode: 'KDPS', login: 'owner', label: 'Owner' }]);
    expect(() => demoSignInFromEnvironment({ AOS_ENVIRONMENT: 'dev', [DEMO_SIGN_IN_VARIABLE]: list })).toThrow(/SYN-/);
  });

  it('refuses a list that is not the expected JSON, or is empty', () => {
    for (const value of ['not json', '{}', '[]', JSON.stringify([{ organisationCode: 'SYN-ORG-A' }])]) {
      expect(() => demoSignInFromEnvironment({ AOS_ENVIRONMENT: 'dev', [DEMO_SIGN_IN_VARIABLE]: value })).toThrow(
        /AOS_DEMO_SIGN_IN/,
      );
    }
  });

  it('finds a listed person by Organisation code and login, exactly as listed', () => {
    const settings = demoSignInFromEnvironment({ AOS_ENVIRONMENT: 'dev', [DEMO_SIGN_IN_VARIABLE]: LIST });
    expect(findDemoPerson(settings, 'SYN-ORG-A', 'syn-admin-a')).toBeDefined();
    expect(findDemoPerson(settings, 'SYN-ORG-B', 'syn-admin-a')).toBeUndefined();
    expect(findDemoPerson(settings, 'SYN-ORG-A', 'someone-else')).toBeUndefined();
  });
});
