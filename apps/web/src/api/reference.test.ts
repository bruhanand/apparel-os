import { describe, expect, it } from 'vitest';
import { displayReference } from './reference';

describe('displayReference (code-house-rules 12.3 "Reference"; design-language 10.13)', () => {
  it('shows ERR- and the last six characters of the correlation identifier, so a log search still finds it', () => {
    expect(displayReference('0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7a8')).toBe('ERR-E6F7A8');
  });
});
