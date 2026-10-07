import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Secret } from '@apparel-os/schemas';

// The prompt of the operator commands (access-and-approvals 3.2, 9.11): a temporary password is typed here, never in
// the command's arguments, and is not echoed. A line piped into the command is read the same way, so the commands
// can be driven from a script that does not put the secret in its arguments either.

/** Where the prompt reads and writes: the operator's terminal unless a test gives its own streams. */
export interface PromptStreams {
  readonly input: NodeJS.ReadableStream;
  /** Receives the question texts and what is typed on a terminal, except what a hidden question mutes. */
  readonly output: NodeJS.WritableStream;
  readonly terminal: boolean;
}

function terminalStreams(): PromptStreams {
  return { input: process.stdin, output: process.stderr, terminal: process.stdin.isTTY };
}

/**
 * Asks each question in turn on the operator's terminal and answers what was typed. Hidden ones are not echoed.
 * Every line comes from one iterator over the input, created before anything is read, so lines that arrive in one
 * chunk are kept for the questions that follow; a question the input ended before is answered with an empty line.
 */
export async function ask(
  questions: readonly { readonly text: string; readonly hidden: boolean }[],
  streams: PromptStreams = terminalStreams(),
): Promise<string[]> {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (!muted) streams.output.write(chunk);
      done();
    },
  });
  const lines = createInterface({ input: streams.input, output, terminal: streams.terminal });
  const queue = lines[Symbol.asyncIterator]();
  try {
    const answers: string[] = [];
    for (const question of questions) {
      streams.output.write(question.text);
      muted = question.hidden;
      const next = await queue.next();
      answers.push(next.done === true ? '' : next.value);
      muted = false;
      if (question.hidden && streams.terminal) streams.output.write('\n');
    }
    return answers;
  } finally {
    lines.close();
  }
}

/**
 * Asks for each secret twice, after the visible questions, in one prompt session (a second session could lose lines
 * piped to the first, and one session now keeps every line piped in at once, S1-F01-T35), and answers each only when both entries match, so a mistyped temporary password is never set.
 */
export async function askWithSecrets(
  visible: readonly string[],
  secrets: readonly string[],
  streams?: PromptStreams,
): Promise<{ visible: string[]; secrets: (Secret | undefined)[] }> {
  const answers = await ask(
    [
      ...visible.map((text) => ({ text: `${text}: `, hidden: false })),
      ...secrets.flatMap((name) => [
        { text: `${name}: `, hidden: true },
        { text: `${name}, again: `, hidden: true },
      ]),
    ],
    streams,
  );
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
