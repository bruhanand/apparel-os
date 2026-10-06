import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

/** The folder of one of the repository's migration sets. */
export function migrationSetFolder(set: MigrationSetName): string {
  return join(serverPackageRoot(), 'migrations', set);
}

// The migrations sit in the server package's root: the nearest folder above this file that holds package.json.
// Found by walking up, because the build (dist/kernel/db) and the seed build (dist-seed/src/kernel/db) put this file
// at different depths.
function serverPackageRoot(): string {
  let folder = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(folder, 'package.json'))) {
    const parent = dirname(folder);
    if (parent === folder) throw new Error('The server package root, holding package.json, was not found');
    folder = parent;
  }
  return folder;
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

/** The file every set holds beside its migrations: its table register (code-house-rules 3.2, 4.1). */
export const TABLE_REGISTER = 'tables.json';

/**
 * The file a set may hold beside its migrations: restricted maintenance the runner runs after the files on every run,
 * such as creating the audit partitions of the coming months (code-house-rules 4.3; numbering-and-audit 4.4; DEC-112,
 * CH-5). It is no migration: it is not recorded, and it must be safe to run any number of times.
 */
export const MAINTENANCE = 'maintenance.sql';

/** The set's maintenance SQL, or undefined when the set has none. */
export function readMaintenance(folder: string): string | undefined {
  const path = join(folder, MAINTENANCE);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/**
 * Reads a set's migrations from a folder, in order, with the SHA-256 checksum of each. Nothing in the folder is
 * passed over: an entry that is neither the table register, the maintenance file nor a well-named migration file, such as `0002__x.SQL`, a
 * backup or a subfolder, is refused, so no migration can be skipped by a slip in its name. A set without its
 * register or without any migration is refused too.
 */
export function readMigrationSet(folder: string): MigrationFile[] {
  const entries = readdirSync(folder, { withFileTypes: true });
  const unexpected = entries.filter(
    (entry) =>
      !entry.isFile() || (entry.name !== TABLE_REGISTER && entry.name !== MAINTENANCE && !FILE_NAME.test(entry.name)),
  );
  if (unexpected.length > 0) {
    const names = unexpected.map((entry) => entry.name).sort();
    throw new Error(
      `Migration set ${folder} holds ${names.join(', ')}: only ${TABLE_REGISTER}, ${MAINTENANCE} and files named NNNN__<unit>__<what>.sql belong there`,
    );
  }
  if (!entries.some((entry) => entry.name === TABLE_REGISTER)) {
    throw new Error(`Migration set ${folder} has no ${TABLE_REGISTER}`);
  }
  const names = entries.map((entry) => entry.name).filter((name) => name !== TABLE_REGISTER && name !== MAINTENANCE);
  if (names.length === 0) {
    throw new Error(`Migration set ${folder} holds no migration`);
  }
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
