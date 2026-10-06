import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Secret } from '@apparel-os/schemas';

// The prompt of the operator commands (access-and-approvals 3.2, 9.11): a temporary password is typed here, never in
// the command's arguments, and is not echoed. A line piped into the command is read the same way, so the commands
// can be driven from a script that does not put the secret in its arguments either.

/** Asks each question in turn on the operator's terminal and answers what was typed. Hidden ones are not echoed. */
export async function ask(
  questions: readonly { readonly text: string; readonly hidden: boolean }[],
): Promise<string[]> {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (!muted) process.stderr.write(chunk);
      done();
    },
  });
  const terminal = process.stdin.isTTY;
  const lines = createInterface({ input: process.stdin, output, terminal });
  try {
    const answers: string[] = [];
    for (const question of questions) {
      process.stderr.write(question.text);
      muted = question.hidden;
      answers.push(await lines.question(''));
      muted = false;
      if (question.hidden && terminal) process.stderr.write('\n');
    }
    return answers;
  } finally {
    lines.close();
  }
}

/**
 * Asks for each secret twice, after the visible questions, in one prompt session (a second session could lose lines
 * piped to the first), and answers each only when both entries match, so a mistyped temporary password is never set.
 */
export async function askWithSecrets(
  visible: readonly string[],
  secrets: readonly string[],
): Promise<{ visible: string[]; secrets: (Secret | undefined)[] }> {
  const answers = await ask([
    ...visible.map((text) => ({ text: `${text}: `, hidden: false })),
    ...secrets.flatMap((name) => [
      { text: `${name}: `, hidden: true },
      { text: `${name}, again: `, hidden: true },
    ]),
  ]);
  const typed = answers.slice(visible.length);
  return {
    visible: answers.slice(0, visible.length),
    secrets: secrets.map((_name, index) => {
      const first = typed[index * 2];
      const second = typed[index * 2 + 1];
      return first === undefined || first === '' || first !== second ? undefined : new Secret(first);
    }),
  };
}
