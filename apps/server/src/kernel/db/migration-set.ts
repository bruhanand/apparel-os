import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The two ordered migration sets (code-house-rules 4.1; PRD-MOD-001, DEC-093). */
export type MigrationSetName = 'directory' | 'organisation';

export interface MigrationFile {
  readonly number: number;
  readonly fileName: string;
  readonly sql: string;
  readonly checksumSha256: string;
}

// NNNN__<unit>__<what>.sql. A unit is `kernel` or a module, with `.` before a part: `merchandise.catalogue`.
const FILE_NAME = /^(\d{4})__([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)?)__([a-z0-9][a-z0-9_]*)\.sql$/;

// src/kernel/db and dist/kernel/db sit at the same depth, so the folder resolves the same way from both.
const MIGRATIONS_ROOT = fileURLToPath(new URL('../../../migrations/', import.meta.url));

/** The folder of one of the repository's migration sets. */
export function migrationSetFolder(set: MigrationSetName): string {
  return join(MIGRATIONS_ROOT, set);
}

/**
 * Checks the names of a set's SQL files and returns them in order. Refuses a name that does not follow
 * code-house-rules 4.1, a duplicate number, and a missing number: the numbers run 0001, 0002, … without a gap.
 */
export function orderMigrationFileNames(fileNames: readonly string[]): { number: number; fileName: string }[] {
  const files = fileNames.map((fileName) => {
    const match = FILE_NAME.exec(fileName);
    if (match?.[1] === undefined) {
      throw new Error(`Migration file name ${fileName} does not follow NNNN__<unit>__<what>.sql`);
    }
    return { number: Number(match[1]), fileName };
  });
  files.sort((a, b) => a.number - b.number);
  files.forEach((file, index) => {
    const previous = files[index - 1];
    if (previous?.number === file.number) {
      throw new Error(`Migration number ${String(file.number)} is taken by ${previous.fileName} and ${file.fileName}`);
    }
    if (file.number !== index + 1) {
      throw new Error(`Migration number ${String(index + 1)} is missing before ${file.fileName}`);
    }
  });
  return files;
}

/** Reads a set's SQL files from a folder, in order, with the SHA-256 checksum of each. Other files are ignored. */
export function readMigrationSet(folder: string): MigrationFile[] {
  const names = readdirSync(folder).filter((name) => name.endsWith('.sql'));
  return orderMigrationFileNames(names).map(({ number, fileName }) => {
    const bytes = readFileSync(join(folder, fileName));
    return {
      number,
      fileName,
      sql: bytes.toString('utf8'),
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });
}
