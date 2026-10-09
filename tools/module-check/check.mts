// Module-boundary checker for Apparel OS.
// Enforces module boundaries (PRD-MOD-002, PRD-SEC-015) and the downward-call tiers of
// docs/design/architecture/module-map.md, sections 2.1 and 3.
//
//   node tools/module-check/check.mts
//
// Zero dependencies. Node.js 22.18 or later runs the TypeScript directly (keep to erasable syntax).
//
// Units. A unit is `kernel` (apps/server/src/kernel) or a folder under apps/server/src/modules that
// holds an index.ts (for example `organisation`, `merchandise/catalogue`). A unit's folders do not nest.
// Files directly under apps/server/src (main.ts, app.module.ts) are the composition root: they may import
// any unit through its index, and no unit may import them.
//
// Rules, over every .ts file in apps/server/src (relative imports and tsconfig path aliases):
//   1. Another unit is imported only through its index. A deep import is an error.
//   2. A unit imports a lower-tier unit, or a same-tier unit on SAME_TIER_CALLS. Anything else is an error,
//      and so is a unit folder missing from TIERS.
//   3. Nothing under packages/ imports from apps/. Nothing under apps/web imports from apps/server.
//   4. The shared calculations (shared-calculations.md 2.1, 2.3): a source file of packages/calculations/src, other
//      than a test, imports only @apparel-os/domain and the package's own files; and nothing outside src/costing
//      imports into it, so the selling entry point never reaches the costing entry point (PRD-OFF-004).
//   5. The counter (offline-counter.md 5.1, 5.4): apps/counter imports no code of apps/server or apps/web; its src and
//      golden folders import only @apparel-os/domain, @apparel-os/schemas, @apparel-os/ui and the selling entry point of
//      @apparel-os/calculations (never ./costing), and no file outside the folder but the golden runner.
//
// Limit: imports are found by pattern, not by a parser. A regular expression literal that holds a quote
// character can hide the imports that follow it.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// ---- The rules, as data ----------------------------------------------------------------------------------

// Tiers from module-map.md section 2.1. A call goes to the same tier or a lower one, never upward.
const TIERS: Readonly<Record<string, number>> = {
  kernel: 0,
  // The calculations module is the package packages/calculations, not a server folder (shared-calculations.md 2.1);
  // the entry stays as a guard, so a server folder of that name could only be tier 0. Rule 4 checks the package.
  calculations: 0,

  access: 1,
  configuration: 1,
  audit: 1,
  numbering: 1,
  'files-imports': 1,
  inbox: 1,
  notifications: 1,
  'ai-gateway': 1,

  organisation: 2,
  'merchandise/catalogue': 2,
  'merchandise/parties': 2,
  exceptions: 2,
  'finance/books': 2,
  'finance/tax-rules': 2,

  'stock/ledger': 3,

  'merchandise/pt': 4,
  booking: 4,
  receiving: 4,
  'stock/documents': 4,
  'supplier-returns': 4,
  pos: 4,
  'ebo-imports': 4,
  offers: 4,

  'finance/operations': 5,
  partners: 5,
  hr: 5,
  planning: 5,
  'site-lifecycle': 5,

  reports: 6,
};

// Calls inside one tier that module-map.md allows. They come from the "Uses:" lines of section 4 and the
// "Calls on the foundation" column of section 5. Every other same-tier call is an error. A name that section 5
// gives without a part (`finance`, `merchandise`, `stock`) is read as the part in the lowest tier, so it needs
// no entry here. To allow a new call, change module-map.md first, then this table.
const SAME_TIER_CALLS: Readonly<Record<string, readonly string[]>> = {
  // Tier 1 (4.3 to 4.10)
  access: ['configuration', 'audit'],
  configuration: ['audit'],
  'files-imports': ['access', 'configuration', 'audit', 'ai-gateway'],
  inbox: ['access', 'audit'],
  notifications: ['access', 'configuration', 'audit'],
  'ai-gateway': ['access', 'audit'],
  // Tier 2 (4.12, 4.14)
  'merchandise/catalogue': ['organisation'],
  // The parties part reads brands through the catalogue's interface, one module (4.12; S1-F03-T03).
  'merchandise/parties': ['organisation', 'merchandise/catalogue'],
  'finance/books': ['organisation', 'exceptions'],
  'finance/tax-rules': ['organisation', 'exceptions'],
  // Tier 4 (section 5)
  'merchandise/pt': ['receiving'],
  receiving: ['booking'],
  pos: ['offers'],
};

// ---- Paths and files -------------------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname, '../..');
const SERVER_SRC = join(ROOT, 'apps/server/src');
const KERNEL_DIR = join(SERVER_SRC, 'kernel');
const MODULES_DIR = join(SERVER_SRC, 'modules');

const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', '.git']);

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function show(path: string): string {
  return toPosix(relative(ROOT, path));
}

function isInside(dir: string, path: string): boolean {
  return path === dir || path.startsWith(dir + sep);
}

function listCodeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) found.push(...listCodeFiles(path));
    } else if (CODE_FILE.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

// ---- Imports ---------------------------------------------------------------------------------------------

interface ImportRef {
  readonly specifier: string;
  readonly line: number;
}

// Replaces comments with spaces (keeping line breaks) so that text inside them is never read as code.
function blankComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source.charAt(i);
    const next = source.charAt(i + 1);
    if (ch === '/' && next === '/') {
      while (i < source.length && source.charAt(i) !== '\n') {
        out += ' ';
        i += 1;
      }
    } else if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < source.length && !(source.charAt(i) === '*' && source.charAt(i + 1) === '/')) {
        out += source.charAt(i) === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < source.length) {
        out += '  ';
        i += 2;
      }
    } else if (ch === "'" || ch === '"' || ch === '`') {
      out += ch;
      i += 1;
      while (i < source.length && source.charAt(i) !== ch) {
        if (source.charAt(i) === '\\') {
          out += source.charAt(i);
          i += 1;
        }
        if (ch !== '`' && source.charAt(i) === '\n') break;
        out += source.charAt(i);
        i += 1;
      }
      if (i < source.length && source.charAt(i) === ch) {
        out += ch;
        i += 1;
      }
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

const IMPORT_PATTERNS: readonly RegExp[] = [
  /\bfrom\s*(['"])([^'"\n]+)\1/g, // import x from '…', export … from '…'
  /\bimport\s*(['"])([^'"\n]+)\1/g, // import '…'
  /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g, // import('…')
  /\brequire\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g, // require('…')
];

function findImports(source: string): ImportRef[] {
  const text = blankComments(source);
  const lineBreaks: number[] = [];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lineBreaks.push(i);
  const lineAt = (index: number): number => lineBreaks.filter((b) => b < index).length + 1;

  const refs: ImportRef[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[2];
      if (specifier !== undefined) refs.push({ specifier, line: lineAt(match.index) });
    }
  }
  return refs.sort((a, b) => a.line - b.line);
}

// ---- tsconfig path aliases -------------------------------------------------------------------------------

interface Alias {
  readonly prefix: string;
  readonly suffix: string;
  readonly hasStar: boolean;
  readonly targets: readonly string[]; // absolute, may hold one `*`
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// tsconfig files may hold comments and trailing commas.
function readJsonc(path: string): Record<string, unknown> | undefined {
  const text = blankComments(readFileSync(path, 'utf8')).replace(/,(\s*[}\]])/g, '$1');
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

const aliasCache = new Map<string, readonly Alias[]>();

// The aliases a tsconfig declares, following `extends` to relative files. The nearest declaration wins.
function aliasesOfConfig(configPath: string): readonly Alias[] {
  const cached = aliasCache.get(configPath);
  if (cached) return cached;
  aliasCache.set(configPath, []); // guards against extends loops

  const config = readJsonc(configPath);
  let result: readonly Alias[] = [];
  if (config) {
    const options = asRecord(config.compilerOptions);
    const paths = asRecord(options?.paths);
    if (paths) {
      const baseUrl = typeof options?.baseUrl === 'string' ? options.baseUrl : '.';
      const baseDir = resolve(dirname(configPath), baseUrl);
      result = Object.entries(paths).map(([pattern, targets]) => {
        const star = pattern.indexOf('*');
        const list = Array.isArray(targets) ? targets.filter((t): t is string => typeof t === 'string') : [];
        return {
          prefix: star === -1 ? pattern : pattern.slice(0, star),
          suffix: star === -1 ? '' : pattern.slice(star + 1),
          hasStar: star !== -1,
          targets: list.map((t) => resolve(baseDir, t)),
        };
      });
    } else if (typeof config.extends === 'string' && config.extends.startsWith('.')) {
      const parent = resolve(dirname(configPath), config.extends);
      result = aliasesOfConfig(parent.endsWith('.json') ? parent : `${parent}.json`);
    }
  }
  aliasCache.set(configPath, result);
  return result;
}

function nearestTsconfig(file: string): string | undefined {
  for (let dir = dirname(file); isInside(ROOT, dir); dir = dirname(dir)) {
    const candidate = join(dir, 'tsconfig.json');
    if (existsSync(candidate)) return candidate;
    if (dir === ROOT) break;
  }
  return undefined;
}

function resolveAlias(file: string, specifier: string): string | undefined {
  const config = nearestTsconfig(file);
  if (!config) return undefined;
  for (const alias of aliasesOfConfig(config)) {
    const matches = alias.hasStar
      ? specifier.startsWith(alias.prefix) &&
        specifier.endsWith(alias.suffix) &&
        specifier.length >= alias.prefix.length + alias.suffix.length
      : specifier === alias.prefix;
    if (!matches) continue;
    const captured = alias.hasStar ? specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length) : '';
    const target = alias.targets[0];
    if (target !== undefined) return target.replace('*', captured);
  }
  return undefined;
}

// The absolute path an import points at, or undefined for a package from node_modules.
function resolveTarget(file: string, specifier: string): string | undefined {
  if (specifier.startsWith('.')) return resolve(dirname(file), specifier);
  if (specifier.startsWith('node:')) return undefined;
  return resolveAlias(file, specifier);
}

// ---- Units -----------------------------------------------------------------------------------------------

interface Unit {
  readonly id: string;
  readonly dir: string;
}

function discoverUnits(): Unit[] {
  const units: Unit[] = [];
  if (existsSync(KERNEL_DIR)) units.push({ id: 'kernel', dir: KERNEL_DIR });
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIPPED_DIRS.has(entry.name)) continue;
      const child = join(dir, entry.name);
      if (existsSync(join(child, 'index.ts'))) units.push({ id: toPosix(relative(MODULES_DIR, child)), dir: child });
      else visit(child);
    }
  };
  if (existsSync(MODULES_DIR)) visit(MODULES_DIR);
  return units;
}

type Place =
  | { readonly kind: 'unit'; readonly unit: Unit }
  | { readonly kind: 'root' } // directly under apps/server/src
  | { readonly kind: 'orphan' } // under modules/ but in no unit
  | { readonly kind: 'outside' };

function placeOf(units: readonly Unit[], path: string): Place {
  const unit = units.find((u) => isInside(u.dir, path));
  if (unit) return { kind: 'unit', unit };
  if (isInside(MODULES_DIR, path)) return { kind: 'orphan' };
  if (isInside(SERVER_SRC, path)) return { kind: 'root' };
  return { kind: 'outside' };
}

// True when the path is the unit's index file, or the unit folder itself.
function isIndexOf(unit: Unit, path: string): boolean {
  const inside = toPosix(relative(unit.dir, path)).replace(CODE_FILE, '');
  return inside === '' || inside === 'index';
}

// ---- The checks ------------------------------------------------------------------------------------------

interface Finding {
  readonly where: string;
  readonly text: string;
}

function tierOf(unit: Unit): number | undefined {
  return TIERS[unit.id];
}

function checkTables(): Finding[] {
  const findings: Finding[] = [];
  const table = show(import.meta.filename);
  for (const [caller, callees] of Object.entries(SAME_TIER_CALLS)) {
    const callerTier = TIERS[caller];
    if (callerTier === undefined)
      findings.push({ where: table, text: `SAME_TIER_CALLS names "${caller}", which is not in TIERS` });
    for (const callee of callees) {
      const calleeTier = TIERS[callee];
      if (calleeTier === undefined)
        findings.push({ where: table, text: `SAME_TIER_CALLS names "${callee}", which is not in TIERS` });
      else if (callerTier !== undefined && calleeTier !== callerTier)
        findings.push({
          where: table,
          text: `SAME_TIER_CALLS lists "${caller}" -> "${callee}", but they are not in the same tier`,
        });
    }
  }
  return findings;
}

function checkServer(): Finding[] {
  const findings: Finding[] = [];
  const units = discoverUnits();

  if (!units.some((u) => u.id === 'kernel') || !existsSync(join(KERNEL_DIR, 'index.ts'))) {
    findings.push({ where: show(KERNEL_DIR), text: 'the kernel needs an index.ts as its public interface' });
  }
  for (const unit of units) {
    if (tierOf(unit) === undefined) {
      findings.push({
        where: show(unit.dir),
        text: `unknown unit "${unit.id}": add it to the tier table in tools/module-check/check.mts, after module-map.md places it`,
      });
    }
  }

  for (const file of listCodeFiles(SERVER_SRC)) {
    const here = placeOf(units, file);
    if (here.kind === 'orphan') {
      findings.push({
        where: show(file),
        text: 'this file is under modules/ but in no unit: give its folder an index.ts and add the unit to the tier table',
      });
      continue;
    }
    for (const ref of findImports(readFileSync(file, 'utf8'))) {
      const target = resolveTarget(file, ref.specifier);
      if (target === undefined) continue;
      const there = placeOf(units, target);
      const where = `${show(file)}:${String(ref.line)}`;

      if (there.kind === 'orphan') {
        findings.push({ where, text: `"${ref.specifier}" points into modules/ but not into any unit` });
        continue;
      }
      if (there.kind === 'root' && here.kind === 'unit') {
        findings.push({
          where,
          text: `unit "${here.unit.id}" imports the composition root ("${ref.specifier}"); calls go downward only`,
        });
        continue;
      }
      if (there.kind !== 'unit') continue;
      if (here.kind === 'unit' && here.unit.id === there.unit.id) continue;

      // Rule 1: through the index only.
      if (!isIndexOf(there.unit, target)) {
        findings.push({
          where,
          text: `deep import into unit "${there.unit.id}" ("${ref.specifier}"): import it through its index.ts`,
        });
      }
      // Rule 2: downward calls, and the same-tier allowlist. The composition root has no tier.
      if (here.kind !== 'unit') continue;
      const callerTier = tierOf(here.unit);
      const calleeTier = tierOf(there.unit);
      if (callerTier === undefined || calleeTier === undefined) continue; // reported as unknown units
      if (calleeTier > callerTier) {
        findings.push({
          where,
          text: `"${here.unit.id}" (tier ${String(callerTier)}) imports "${there.unit.id}" (tier ${String(calleeTier)}): calls go to the same tier or a lower one`,
        });
      } else if (calleeTier === callerTier && !(SAME_TIER_CALLS[here.unit.id] ?? []).includes(there.unit.id)) {
        findings.push({
          where,
          text: `"${here.unit.id}" imports "${there.unit.id}" in the same tier (${String(callerTier)}), which module-map.md does not allow`,
        });
      }
    }
  }
  return findings;
}

// Rule 3.
function checkIsolation(): Finding[] {
  const findings: Finding[] = [];

  // Workspace package name -> folder, for imports by package name.
  const packageDirs = new Map<string, string>();
  for (const group of ['apps', 'packages']) {
    const groupDir = join(ROOT, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      const manifest = join(groupDir, entry.name, 'package.json');
      if (!entry.isDirectory() || !existsSync(manifest)) continue;
      const name = asRecord(JSON.parse(readFileSync(manifest, 'utf8')))?.name;
      if (typeof name === 'string') packageDirs.set(name, join(groupDir, entry.name));
    }
  }

  const scopes = [
    {
      dir: join(ROOT, 'packages'),
      forbidden: join(ROOT, 'apps'),
      message: 'code under packages/ must not import from apps/',
    },
    {
      dir: join(ROOT, 'apps/web'),
      forbidden: join(ROOT, 'apps/server'),
      message: 'apps/web must not import from apps/server',
    },
    {
      dir: join(ROOT, 'apps/counter'),
      forbidden: join(ROOT, 'apps/server'),
      message: 'apps/counter must not import from apps/server',
    },
    {
      dir: join(ROOT, 'apps/counter'),
      forbidden: join(ROOT, 'apps/web'),
      message: 'apps/counter must not import from apps/web',
    },
  ];
  for (const scope of scopes) {
    for (const file of listCodeFiles(scope.dir)) {
      for (const ref of findImports(readFileSync(file, 'utf8'))) {
        let target = resolveTarget(file, ref.specifier);
        if (target === undefined) {
          for (const [name, dir] of packageDirs) {
            if (ref.specifier === name || ref.specifier.startsWith(`${name}/`)) target = dir;
          }
        }
        if (target !== undefined && isInside(scope.forbidden, target)) {
          findings.push({ where: `${show(file)}:${String(ref.line)}`, text: `${scope.message} ("${ref.specifier}")` });
        }
      }
    }
  }
  return findings;
}

// Rule 4.
function checkCalculations(): Finding[] {
  const findings: Finding[] = [];
  const src = join(ROOT, 'packages/calculations/src');
  const costingDir = join(src, 'costing');
  for (const file of listCodeFiles(src)) {
    if (/\.test\.[cm]?[jt]sx?$/.test(file)) continue;
    for (const ref of findImports(readFileSync(file, 'utf8'))) {
      const where = `${show(file)}:${String(ref.line)}`;
      if (!ref.specifier.startsWith('.')) {
        if (ref.specifier !== '@apparel-os/domain') {
          findings.push({
            where,
            text: `packages/calculations imports only @apparel-os/domain, not "${ref.specifier}" (shared-calculations.md 2.1)`,
          });
        }
        continue;
      }
      const target = resolve(dirname(file), ref.specifier);
      if (!isInside(src, target)) {
        findings.push({ where, text: `"${ref.specifier}" points outside packages/calculations/src` });
      } else if (isInside(costingDir, target) && !isInside(costingDir, file)) {
        findings.push({
          where,
          text: `"${ref.specifier}" reaches the costing entry point from outside it; selling never imports costing (shared-calculations.md 2.3)`,
        });
      }
    }
  }
  return findings;
}

// Rule 5 (the part rule 3 does not cover).
function checkCounter(): Finding[] {
  const findings: Finding[] = [];
  const counter = join(ROOT, 'apps/counter');
  const runner = join(ROOT, 'packages/calculations/test/golden-runner.ts');
  const allowed = ['@apparel-os/domain', '@apparel-os/schemas', '@apparel-os/ui', '@apparel-os/calculations'];
  for (const folder of ['src', 'golden']) {
    for (const file of listCodeFiles(join(counter, folder))) {
      for (const ref of findImports(readFileSync(file, 'utf8'))) {
        const where = `${show(file)}:${String(ref.line)}`;
        if (ref.specifier.startsWith('@apparel-os/') && !allowed.includes(ref.specifier)) {
          findings.push({
            where,
            text: `apps/counter imports only the domain, schemas, ui and the selling entry point of calculations, not "${ref.specifier}" (offline-counter.md 5.1, 5.4)`,
          });
        }
        if (ref.specifier.startsWith('.')) {
          const target = resolve(dirname(file), ref.specifier).replace(/\.[cm]?[jt]sx?$/, '');
          if (!isInside(counter, target) && target !== runner.replace(/\.ts$/, '')) {
            findings.push({
              where,
              text: `"${ref.specifier}" points outside apps/counter; only the golden runner may (offline-counter.md 5.5)`,
            });
          }
        }
      }
    }
  }
  return findings;
}

// ---- Run -------------------------------------------------------------------------------------------------

const findings = [...checkTables(), ...checkServer(), ...checkIsolation(), ...checkCalculations(), ...checkCounter()];
if (findings.length > 0) {
  console.log('\nModule boundaries');
  for (const finding of findings) console.log(`  ${finding.where} — ${finding.text}`);
  console.log(`\nModule check: ${String(findings.length)} error(s).`);
  console.log('Rules: docs/design/architecture/module-map.md, sections 2.1 and 3.');
  process.exit(1);
}
console.log('Module check passed.');
