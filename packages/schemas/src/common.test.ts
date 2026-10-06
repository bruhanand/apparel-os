import { paise } from '@apparel-os/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { maybeKnownPaiseSchema, paiseSchema } from './common.js';
import { myWorkSchema } from './work-item.js';

// PRD-MOD-014: an amount in paise decodes from the wire and encodes back to it, so an answer holding one passes the
// route contract's encoding (code-house-rules 12.2). Found by S1-F01-AT13 (S1-F01 review): a known exposure in My
// work failed to encode. Every value here is SYNTHETIC.

describe('paise on the wire (PRD-MOD-014)', () => {
  it('decodes a safe integer and refuses anything else', () => {
    expect(paiseSchema.parse(12_345)).toBe(paise(12_345));
    expect(paiseSchema.safeParse(1.5).success).toBe(false);
    expect(paiseSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
  });

  it('encodes an amount back to the same integer, alone and inside an answer', () => {
    expect(z.encode(paiseSchema, paise(12_345))).toBe(12_345);
    expect(z.encode(maybeKnownPaiseSchema, { kind: 'known', value: paise(500) })).toEqual({
      kind: 'known',
      value: 500,
    });
    const answer = {
      asOf: '2026-10-07T10:00:00.000Z',
      items: [
        {
          id: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f701',
          kind: 'task' as const,
          owner: {
            module: 'syn',
            recordType: 'syn.task',
            recordId: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f702',
            versionId: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f703',
          },
          due: { kind: 'none' as const },
          exposure: { kind: 'known' as const, amount: paise(90_000) },
          state: 'Open',
        },
      ],
    };
    expect(z.encode(myWorkSchema, answer).items[0]?.exposure).toEqual({ kind: 'known', amount: 90_000 });
  });
});
