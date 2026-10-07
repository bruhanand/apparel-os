import { describe, expect, it } from 'vitest';
import { stateAfterRefusal } from './command';

// A refusal that only says the session is locked or over is not an error of the screen: the lock overlay or sign-in
// says so, and the screen's input is kept for after (access-and-approvals 3.3; design-language 10.12; visual review
// finding 2). SYNTHETIC values only.
const reference = '01900000-0000-7000-8000-0000000000aa';

describe('stateAfterRefusal (access-and-approvals 3.3)', () => {
  it('shows no refusal on the screen when the session is locked or over', () => {
    for (const code of ['access.session-locked', 'access.not-signed-in', 'access.session-not-found']) {
      expect(stateAfterRefusal({ kind: 'not-signed-in', code, reference })).toEqual({ kind: 'ready' });
    }
  });

  it('keeps every other refusal, with its envelope, for the screen to show', () => {
    const refusal = { kind: 'not-authorised', code: 'access.not-authorised', reference } as const;
    expect(stateAfterRefusal(refusal)).toEqual({ kind: 'refused', refusal });
  });
});
