import { createHmac } from 'node:crypto';

// The journey's own authenticator app: TOTP of RFC 6238 (HMAC-SHA-1, six digits, 30-second steps, the defaults every
// authenticator app reads from the setup link), written here from the RFCs rather than taken from the server, so the
// journey checks the server against the standard. The server accepts the step either side of now and never a step
// already used (access-and-approvals 3.1, 3.2), so each code is for a later step than the last one given.

const PERIOD_MS = 30_000;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 of RFC 4648 section 6, as the setup key shows it, spaces allowed. */
export function decodeBase32(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.replace(/[\s=]/g, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('The setup key is not base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function codeOf(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

export class Authenticator {
  private lastStep = Number.NEGATIVE_INFINITY;

  constructor(private readonly secret: Buffer) {}

  /**
   * A code for a step later than the last one given and inside the server's window: the step before now while there
   * is time to send it before the step changes, else now or the next; it waits when every step in reach is used.
   */
  async nextCode(): Promise<string> {
    for (;;) {
      const now = Date.now();
      const step = Math.floor(now / PERIOD_MS);
      const lowest = now % PERIOD_MS < PERIOD_MS - 10_000 ? step - 1 : step;
      const chosen = Math.max(lowest, this.lastStep + 1);
      if (chosen <= step + 1) {
        this.lastStep = chosen;
        return codeOf(this.secret, chosen);
      }
      await new Promise((resolve) => setTimeout(resolve, (step + 1) * PERIOD_MS - now + 50));
    }
  }
}
