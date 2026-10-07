import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ask, askWithSecrets } from './operator-prompt.js';

// S1-F01-T35: the operator prompt keeps every answer piped in at once (access-and-approvals 3.2, 9.11). The inputs are
// synthetic text, never real credentials.

function streams() {
  const input = new PassThrough();
  const written: string[] = [];
  const output = new PassThrough();
  output.on('data', (chunk: Buffer) => written.push(chunk.toString()));
  return { input, output, written };
}

describe('the operator prompt', () => {
  it('keeps every answer when all of them arrive in one chunk', async () => {
    const { input, output } = streams();
    input.end('first\nsecond\nthird\n');
    const answers = await ask(
      [
        { text: 'a: ', hidden: false },
        { text: 'b: ', hidden: true },
        { text: 'c: ', hidden: false },
      ],
      { input, output, terminal: false },
    );
    expect(answers).toEqual(['first', 'second', 'third']);
  });

  it('keeps every answer when the lines arrive one at a time', async () => {
    const { input, output } = streams();
    const pending = ask(
      [
        { text: 'a: ', hidden: false },
        { text: 'b: ', hidden: false },
      ],
      { input, output, terminal: false },
    );
    input.write('one\n');
    await new Promise((resolve) => setTimeout(resolve, 20));
    input.end('two\n');
    expect(await pending).toEqual(['one', 'two']);
  });

  it('answers an empty line for a question the input ended before', async () => {
    const { input, output } = streams();
    input.end('only\n');
    const answers = await ask(
      [
        { text: 'a: ', hidden: false },
        { text: 'b: ', hidden: true },
      ],
      { input, output, terminal: false },
    );
    expect(answers).toEqual(['only', '']);
  });

  it('takes the visible answers and both entries of each secret from one chunk, and never writes a secret', async () => {
    const { input, output, written } = streams();
    input.end('verified by phone\nSYNTHETIC-temp-1\nSYNTHETIC-temp-1\nSYNTHETIC-temp-2\nSYNTHETIC-other\n');
    const typed = await askWithSecrets(['Verified how'], ['First password', 'Second password'], {
      input,
      output,
      terminal: false,
    });
    expect(typed.visible).toEqual(['verified by phone']);
    expect(typed.secrets[0]?.reveal()).toBe('SYNTHETIC-temp-1');
    expect(typed.secrets[1]).toBeUndefined();
    const text = written.join('');
    expect(text).toContain('Verified how: ');
    expect(text).toContain('First password: ');
    expect(text).not.toContain('SYNTHETIC');
  });
});
