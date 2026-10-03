// Doc checker for Apparel OS: IDs, links, tables and the review gate.
// How to use it, and the change gate it enforces: AGENTS.md, "Checking the documents".
//
//   node tools/doc-check/check.mts [--base <git ref>]       run every check (default base: HEAD)
//   node tools/doc-check/check.mts impact <ID> [<ID> ...]    sections a change to these IDs would flag
//   node tools/doc-check/check.mts packet [--out <file>] [--split <n>] [--all] [--force]
//                                                            review packet for stale sections
//   node tools/doc-check/check.mts record <verdict file> [<file> ...] --by <name>   record the verdicts of a review
//   node tools/doc-check/check.mts review <section> --by <name> --reason <text> [--state <state>]
//   node tools/doc-check/check.mts drop <section>            forget a record whose section is gone
//   node tools/doc-check/check.mts baseline --by <name> --reason <text>   once, on an empty record file
//   node tools/doc-check/check.mts list [<filter>]           sections and what they depend on
//
// The checker never writes review records on its own. Only `review`, `record`, `drop` and `baseline` do.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PRD = 'docs/prd.md';
const POLICIES = 'docs/kdps-policies.md';
const DECISIONS = 'docs/decisions.md';
const REVIEWS = 'docs/reviews.json';
const BLUEPRINT = 'docs/design/ui/ui-blueprint.html';
const DESIGN_SYSTEM = 'docs/design/ui/design-system.html';

// Gated documents: every section is fingerprinted and must be reviewed again after it or its sources change.
const GATED = ['docs/design', 'docs/phases.md', 'docs/questions-for-kdps.md', 'AGENTS.md'];

// Frozen records of proposals: they may name IDs that were proposed and never added.
const FROZEN = ['docs/reports/alignment-sweep.md', 'docs/reports/decision-pack.md'];

// A change to one of these sources also asks for a broad sweep: stock, money and access rules
// can sit in sections that do not cite them.
const SWEEP_PRD_PREFIXES = ['STK', 'TRF', 'DMG', 'REC', 'LED', 'CSH', 'PAY', 'TAX', 'MOD', 'INT', 'ACS', 'SEC'];
const SWEEP_POLICIES = ['01', '02', '04', '09', '11'];

const ID_RE = /PRD-[A-Z]{3}-\d{3}|POL-\d{2}\.\d{2}|POL-\d{2}(?!\.\d|\d)|DEC-\d{3}/g;
const RANGE_RE = /`?(PRD-[A-Z]{3}-|POL-\d{2}\.|DEC-)(\d{2,3})`?\s*(?:to|–)\s*`?\1(\d{2,3})`?/g;
const RULE_LINE_RE = /^- `(PRD-[A-Z]{3}-\d{3}|POL-\d{2}\.\d{2})` (.*)$/;
const SOURCE_LINK_RE = /(?:^|[\s(/])((?:prd|kdps-policies)\.md)#([\w-]+)/g;
const MARKER_RE = /(?:<!--|\/\*)\s*deps:\s*none\b/;
// A section whose IDs a design header need not list, such as an ownership table: <!-- header: not listed — reason -->
const HEADER_MARKER_RE = /<!--\s*header:\s*not listed\b/;
const HEADER_LIST_RE = /^- (?:PRD IDs|Policies|Decisions):/;

// ---------- small helpers ----------

type Finding = { where: string; text: string; detail?: string[] };

const errors: Finding[] = [];
const warnings: Finding[] = [];

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function norm(text: string): string {
  return text.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function walk(path: string): string[] {
  const full = join(ROOT, path);
  if (!existsSync(full)) return [];
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full).sort().flatMap((name) => walk(posix.join(path, name)));
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

// GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens.
function slugify(heading: string): string {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

type Heading = { line: number; level: number; title: string; slug: string };

function headings(text: string): Heading[] {
  const out: Heading[] = [];
  const seen = new Map<string, number>();
  let fence = false;
  text.split('\n').forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) return;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (!m) return;
    const base = slugify(m[2]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ line: i + 1, level: m[1].length, title: m[2], slug: n ? `${base}-${n}` : base });
  });
  return out;
}

// ---------- sources: PRD and policy bullets, retired IDs, decision entries ----------

type Rule = { id: string; text: string; file: string; line: number };
type Decision = { id: string; title: string; line: number; text: string; cites: Set<string> };
type Sources = {
  rules: Map<string, Rule>;
  retired: Set<string>;
  decisions: Map<string, Decision>;
  touchedBy: Map<string, Set<string>>; // source ID -> decisions whose Choice or Changed line cites it
  policies: Map<string, string[]>; // '02' -> its bullet IDs
  sections: Map<string, string>; // 'docs/prd.md#stack' -> section text
};

function isKnown(src: Sources, id: string): boolean {
  if (src.rules.has(id) || src.retired.has(id) || src.decisions.has(id)) return true;
  const whole = /^POL-(\d{2})$/.exec(id);
  return Boolean(whole && src.policies.has(whole[1]));
}

function extractIds(text: string, src?: Sources): Set<string> {
  const ids = new Set(text.match(ID_RE) ?? []);
  for (const m of text.matchAll(RANGE_RE)) {
    const [, prefix, from, to] = m;
    for (let n = Number(from) + 1; n < Number(to); n++) {
      const id = prefix + String(n).padStart(from.length, '0');
      if (!src || isKnown(src, id)) ids.add(id);
    }
  }
  return ids;
}

function sourceSections(file: string, text: string, into: Map<string, string>): void {
  const lines = text.split('\n');
  const hs = headings(text);
  hs.forEach((h, i) => {
    const next = hs.slice(i + 1).find((o) => o.level <= h.level);
    into.set(`${file}#${h.slug}`, norm(lines.slice(h.line - 1, next ? next.line - 1 : lines.length).join('\n')));
  });
}

function parseSources(prd: string, policies: string, decisions: string, report: boolean): Sources {
  const src: Sources = {
    rules: new Map(),
    retired: new Set(),
    decisions: new Map(),
    touchedBy: new Map(),
    policies: new Map(),
    sections: new Map(),
  };
  for (const [file, text, prefix] of [
    [PRD, prd, 'PRD'],
    [POLICIES, policies, 'POL'],
  ] as const) {
    sourceSections(file, text, src.sections);
    text.split('\n').forEach((l, i) => {
      if (/^> - Retired IDs:/.test(l)) for (const id of l.match(ID_RE) ?? []) src.retired.add(id);
      const m = RULE_LINE_RE.exec(l);
      if (!m) {
        if (report && /^- `(PRD|POL)-/.test(l)) errors.push({ where: `${file}:${i + 1}`, text: 'Malformed rule ID at the start of this bullet.' });
        return;
      }
      const [, id, body] = m;
      if (report && !id.startsWith(prefix)) errors.push({ where: `${file}:${i + 1}`, text: `${id} is defined in the wrong document.` });
      if (report && src.rules.has(id)) {
        const first = src.rules.get(id)!;
        errors.push({ where: `${file}:${i + 1}`, text: `Duplicate ID ${id} (first at ${first.file}:${first.line}).` });
        return;
      }
      src.rules.set(id, { id, text: body, file, line: i + 1 });
      if (id.startsWith('POL-')) {
        const p = id.slice(4, 6);
        src.policies.set(p, [...(src.policies.get(p) ?? []), id]);
      }
    });
  }
  if (report) for (const id of src.retired) if (src.rules.has(id)) errors.push({ where: POLICIES, text: `${id} is listed as retired but still defined.` });

  const lines = decisions.split('\n');
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (!l.startsWith('## DEC')) return;
    if (!/^## DEC-\d{3} — \S/.test(l)) {
      if (report) errors.push({ where: `${DECISIONS}:${i + 1}`, text: 'Decision heading must read "## DEC-NNN — title".' });
      return;
    }
    starts.push(i);
  });
  starts.forEach((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
    const id = lines[start].slice(3, 10);
    const body = lines.slice(start, end).join('\n');
    const field = (name: string) => lines.slice(start, end).find((l) => l.startsWith(`- **${name}`)) ?? '';
    const cites = extractIds(`${field('Choice.')}\n${field('Changed.')}`);
    cites.delete(id);
    src.decisions.set(id, { id, title: lines[start].slice(13), line: start + 1, text: norm(body), cites });
    if (report) {
      if (Number(id.slice(4)) !== k + 1) errors.push({ where: `${DECISIONS}:${start + 1}`, text: `Expected DEC-${String(k + 1).padStart(3, '0')} here; numbers run without gaps.` });
      if (start > 0 && lines[start - 1].trim() !== '') errors.push({ where: `${DECISIONS}:${start + 1}`, text: 'A blank line must come before each decision heading.' });
      for (const name of ['Date:', 'Question.', 'Options.', 'Choice.', 'Changed.'])
        if (!field(name)) errors.push({ where: `${DECISIONS}:${start + 1}`, text: `${id} has no "${name}" line.` });
    }
  });
  for (const d of src.decisions.values())
    for (const id of extractIds([...d.cites].join(' '), src)) {
      if (!src.touchedBy.has(id)) src.touchedBy.set(id, new Set());
      src.touchedBy.get(id)!.add(d.id);
    }
  return src;
}

// ---------- dependency fingerprints ----------

type Dep = { hash: string; decs: string[] };

function fingerprint(src: Sources, id: string): Dep | null {
  const touched = (key: string) => [...(src.touchedBy.get(key) ?? [])];
  const rule = src.rules.get(id);
  if (rule) return { hash: hash(norm(rule.text)), decs: sorted(touched(id)) };
  const whole = /^POL-(\d{2})$/.exec(id);
  if (whole) {
    const ids = src.policies.get(whole[1]);
    if (!ids) return null;
    return {
      hash: hash(ids.map((i) => `${i} ${norm(src.rules.get(i)!.text)}`).join('\n')),
      decs: sorted([...touched(id), ...ids.flatMap(touched)]),
    };
  }
  const dec = src.decisions.get(id);
  if (dec) return { hash: hash(dec.text), decs: sorted(touched(id)) };
  if (src.retired.has(id)) return { hash: 'retired', decs: sorted(touched(id)) };
  const section = src.sections.get(id);
  if (section !== undefined) return { hash: hash(section), decs: [] };
  return null;
}

function sweepNeeded(src: Sources, id: string): boolean {
  if (/^PRD-/.test(id)) return SWEEP_PRD_PREFIXES.includes(id.slice(4, 7));
  if (/^POL-/.test(id)) return SWEEP_POLICIES.includes(id.slice(4, 6));
  const dec = src.decisions.get(id);
  return Boolean(dec && [...dec.cites].some((c) => !c.startsWith('DEC-') && sweepNeeded(src, c)));
}

// ---------- gated sections ----------

type Pointer = { file: string; nums: string[] }; // numbered sections of a document named in words

type Unit = {
  key: string;
  file: string;
  line: number;
  text: string;
  own: Set<string>; // IDs and source sections cited in the section itself
  refs: Set<string>; // other sections it points at (one hop)
  pointers: Pointer[]; // "stock-ledger 10.4" and the like; turned into refs once every file is read
  marker: boolean;
};

// Documents a section can name in words. A one-word name counts only with ".md" ("personas.md 1");
// a hyphenated one also without it ("stock-ledger 10.4"). Names shared by two files (README) never count.
const DOC_BY_NAME = (() => {
  const all = [...walk('docs').filter((f) => f.endsWith('.md')), 'AGENTS.md'];
  const name = (f: string) => posix.basename(f, '.md');
  const count = (n: string) => all.filter((f) => name(f) === n).length;
  return new Map(all.filter((f) => count(name(f)) === 1).map((f) => [name(f), f]));
})();

// "stock-ledger 10.4", "stock-ledger.md section 7", "[module-map.md](module-map.md) 2, 3, 4.1", "stock-ledger 10.2 to 10.4".
const NUM = String.raw`\d{1,2}(?:\.\d{1,2})?`;
const DOC_NAMES = [...DOC_BY_NAME.keys()].sort((a, b) => b.length - a.length);
const POINTER_RE = new RegExp(
  String.raw`(?:\[[^\]]*\]\(([^)\s#]+\.md)\)|(?<![\w/.-])(?:(${DOC_NAMES.filter((n) => n.includes('-')).join('|')})(?:\.md)?|(${DOC_NAMES.join('|')})\.md))` +
    String.raw`(?:'s)?,?[ \t]+(?:sections?[ \t]+|§[ \t]*)?(${NUM}(?:(?:[ \t]*,[ \t]*|[ \t]+and[ \t]+|[ \t]+to[ \t]+|[ \t]*–[ \t]*)${NUM})*)(?![\w]|\.\d)`,
  'g',
);

// "2, 3, 4.1" -> 2, 3, 4.1; "10.2 to 10.4" -> 10.2, 10.3, 10.4; "4 to 6" -> 4, 5, 6.
function sectionNumbers(list: string): string[] {
  const parts = [...list.matchAll(new RegExp(String.raw`(${NUM})|to|–`, 'g'))].map((m) => m[1] ?? 'to');
  const out: string[] = [];
  parts.forEach((p, i) => {
    if (p === 'to') return;
    const from = parts[i - 1] === 'to' ? parts[i - 2] : undefined;
    const [a, b] = [from?.split('.').map(Number) ?? [], p.split('.').map(Number)];
    const level = a.length === 1 && b.length === 1 ? 0 : a.length === 2 && b.length === 2 && a[0] === b[0] ? 1 : -1;
    if (level < 0) out.push(p);
    else for (let n = a[level] + 1; n <= b[level]; n++) out.push(level ? `${a[0]}.${n}` : String(n));
  });
  return out;
}

// A pointer inside backticks is an example, not a pointer.
function pointers(file: string, text: string): Pointer[] {
  return [...text.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length)).matchAll(POINTER_RE)].flatMap((m) => {
    const target = m[1] ? posix.normalize(posix.join(posix.dirname(file), m[1])) : DOC_BY_NAME.get(m[2] ?? m[3]);
    return target ? [{ file: target, nums: sectionNumbers(m[4]) }] : [];
  });
}

// Numbered headings ("## 7. Cost", "### 7.6 Unknown cost") and the lines they span, subsections included.
function numberedSpans(text: string): Map<string, [number, number]> {
  const hs = headings(text);
  const end = text.split('\n').length + 1;
  const spans = new Map<string, [number, number]>();
  hs.forEach((h, i) => {
    const num = /^(\d+(?:\.\d+)*)\.?\s/.exec(h.title);
    if (!num || spans.has(num[1])) return;
    const next = hs.slice(i + 1).find((o) => o.level <= h.level);
    spans.set(num[1], [h.line, next ? next.line : end]);
  });
  return spans;
}

function sourceLinks(text: string): string[] {
  return [...text.matchAll(SOURCE_LINK_RE)].map((m) => `docs/${m[1]}#${m[2]}`);
}

function makeUnit(key: string, file: string, line: number, text: string, src: Sources): Unit {
  return {
    key,
    file,
    line,
    text,
    own: new Set([...extractIds(text, src), ...sourceLinks(text)]),
    refs: new Set(),
    pointers: pointers(file, text),
    marker: MARKER_RE.test(text),
  };
}

function markdownUnits(file: string, text: string, src: Sources): Unit[] {
  const lines = text.split('\n');
  const hs = headings(text);
  const cuts = hs.filter((h) => h.level >= 2 && h.level <= 4);
  const units: Unit[] = [];
  const numbered = new Map<string, string>();
  const parts: { key: string; line: number; text: string; heading: boolean }[] = [];
  parts.push({ key: `${file}#top`, line: 1, text: lines.slice(0, cuts.length ? cuts[0].line - 1 : lines.length).join('\n'), heading: false });
  cuts.forEach((h, i) => {
    const key = `${file}#${h.slug}`;
    const num = /^(\d+(?:\.\d+)+)\.?\s/.exec(h.title);
    if (num) numbered.set(num[1], key);
    parts.push({ key, line: h.line, text: lines.slice(h.line - 1, i + 1 < cuts.length ? cuts[i + 1].line - 1 : lines.length).join('\n'), heading: true });
  });
  for (const p of parts) {
    const body = p.text.split('\n').slice(1).filter((l) => l.trim() && !/^#{1,6}\s/.test(l));
    if (!body.length) continue; // nothing to review
    units.push(makeUnit(p.key, file, p.line, p.text, src));
  }
  const slugs = new Set(hs.map((h) => `${file}#${h.slug}`));
  for (const u of units) {
    // A number inside a pointer to a named document ("stock-ledger 2.3") is not a section of this one.
    const body = u.text.split('\n').slice(1).join('\n').replace(POINTER_RE, (m) => ' '.repeat(m.length));
    for (const m of body.matchAll(/(?<![\w.\-₹])(\d{1,2}\.\d{1,2})(?![\w]|\.\d)/g)) {
      const key = numbered.get(m[1]);
      if (key && key !== u.key) u.refs.add(key);
    }
    for (const m of body.matchAll(/\]\(([^)\s#]*)#([^)\s]+)\)/g)) {
      const target = m[1] ? posix.normalize(posix.join(posix.dirname(file), m[1])) : file;
      const key = `${target}#${m[2]}`;
      if (target === file && slugs.has(key) && key !== u.key) u.refs.add(key);
      else if (target !== file) u.refs.add(key);
    }
  }
  return units;
}

function blueprintUnits(file: string, text: string, src: Sources): Unit[] {
  const open = text.indexOf('<script type="text/x-dc" data-dc-script>');
  const close = text.indexOf('</script>', open);
  if (open < 0 || close < 0) {
    errors.push({ where: file, text: 'No <script type="text/x-dc" data-dc-script> block found.' });
    return [];
  }
  const start = open + '<script type="text/x-dc" data-dc-script>'.length;
  const script = text.slice(start, close);
  const offset = lineOf(text, start) - 1;
  const units = [makeUnit(`${file}#markup`, file, 1, text.slice(0, open) + text.slice(close), src)];
  const lines = script.split('\n');
  lines.forEach((l, i) => {
    const m = /^ {4}const (\w+) = [[{]/.exec(l);
    if (!m) return;
    let end = i + 1;
    while (end < lines.length && !/^ {4}(const|let|return)\b/.test(lines[end]) && !/^ {0,2}\S/.test(lines[end])) end++;
    units.push(makeUnit(`${file}#${m[1]}`, file, offset + i + 1, lines.slice(i, end).join('\n'), src));
  });
  const dir = mkdtempSync(join(tmpdir(), 'doc-check-'));
  try {
    writeFileSync(join(dir, 'blueprint.js'), script);
    const run = spawnSync(process.execPath, ['--check', join(dir, 'blueprint.js')], { encoding: 'utf8' });
    if (run.status !== 0) errors.push({ where: file, text: 'The data-dc-script block does not parse (node --check).', detail: [run.stderr.trim().split('\n').slice(0, 4).join(' ')] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return units;
}

function designSystemPage(text: string): string | null {
  const tag = '<script type="__bundler/template">';
  const open = text.indexOf(tag);
  const close = text.indexOf('</script>', open);
  if (open < 0 || close < 0) return null;
  try {
    const page = JSON.parse(text.slice(open + tag.length, close));
    return typeof page === 'string' ? page : null;
  } catch {
    return null;
  }
}

function gatedUnits(src: Sources): Unit[] {
  const units: Unit[] = [];
  const spans = new Map<string, Map<string, [number, number]>>();
  for (const file of GATED.flatMap(walk)) {
    const text = read(file);
    if (file.endsWith('.md')) {
      spans.set(file, numberedSpans(text));
      units.push(...markdownUnits(file, text, src));
    } else if (file === BLUEPRINT) units.push(...blueprintUnits(file, text, src));
    else if (file === DESIGN_SYSTEM) {
      const page = designSystemPage(text);
      if (page === null) errors.push({ where: file, text: 'The __bundler/template block does not unpack to a page string.' });
      else units.push(makeUnit(`${file}#page`, file, 1, page, src));
    } else if (file.endsWith('.html')) units.push(makeUnit(`${file}#page`, file, 1, text, src));
  }
  // "stock-ledger 10.4" points at that section; "stock-ledger section 7" at 7 and its subsections.
  for (const u of units)
    for (const p of u.pointers)
      for (const num of p.nums) {
        const span = spans.get(p.file)?.get(num);
        if (!span) continue;
        for (const o of units) if (o.file === p.file && o.key !== u.key && o.line >= span[0] && o.line < span[1]) u.refs.add(o.key);
      }
  return units;
}

// One hop: a section also depends on what the sections it points at cite.
function effectiveDeps(unit: Unit, byKey: Map<string, Unit>): Map<string, string | null> {
  const deps = new Map<string, string | null>();
  for (const id of unit.own) deps.set(id, null);
  for (const ref of unit.refs) {
    const other = byKey.get(ref);
    if (!other) continue;
    for (const id of other.own) if (!deps.has(id)) deps.set(id, ref);
  }
  return deps;
}

// ---------- review records ----------

type ReviewRecord = {
  status: 'reviewed' | 'baseline';
  by: string;
  date: string;
  reason: string;
  unitHash: string;
  deps: Record<string, Dep>;
};
type Records = { version: 1; units: Record<string, ReviewRecord> };

function loadRecords(): Records {
  if (!existsSync(join(ROOT, REVIEWS))) return { version: 1, units: {} };
  return JSON.parse(read(REVIEWS)) as Records;
}

function saveRecords(records: Records): void {
  const keys = Object.keys(records.units).sort();
  const out = ['{', '  "version": 1,', '  "units": {'];
  keys.forEach((key, i) => {
    const r = records.units[key];
    const ids = Object.keys(r.deps).sort();
    out.push(
      `    ${JSON.stringify(key)}: {`,
      `      "status": ${JSON.stringify(r.status)},`,
      `      "by": ${JSON.stringify(r.by)},`,
      `      "date": ${JSON.stringify(r.date)},`,
      `      "reason": ${JSON.stringify(r.reason)},`,
      `      "unitHash": ${JSON.stringify(r.unitHash)},`,
      ids.length ? '      "deps": {' : '      "deps": {}',
      ...ids.map((id, j) => `        ${JSON.stringify(id)}: ${JSON.stringify({ hash: r.deps[id].hash, decs: r.deps[id].decs })}${j < ids.length - 1 ? ',' : ''}`),
      ...(ids.length ? ['      }'] : []),
      `    }${i < keys.length - 1 ? ',' : ''}`,
    );
  });
  out.push('  }', '}', '');
  writeFileSync(join(ROOT, REVIEWS), out.join('\n'));
}

function snapshot(unit: Unit, byKey: Map<string, Unit>, src: Sources): { unitHash: string; deps: Record<string, Dep> } {
  const deps: Record<string, Dep> = {};
  for (const id of effectiveDeps(unit, byKey).keys()) {
    const fp = fingerprint(src, id);
    if (fp) deps[id] = fp;
  }
  return { unitHash: hash(norm(unit.text)), deps };
}

// The state a reviewer reads: the section text and every dependency fingerprint. A verdict is recorded
// only while the state is unchanged, so a review never stands for text or sources it did not see.
function stateOf(snap: { unitHash: string; deps: Record<string, Dep> }): string {
  const ids = Object.keys(snap.deps).sort();
  return hash([snap.unitHash, ...ids.map((id) => `${id} ${snap.deps[id].hash} ${snap.deps[id].decs.join(',')}`)].join('\n'));
}

type ChangedSource = { id: string; newDecs: string[] };
type Staleness = { unit: Unit; reasons: string[]; sweep: string[]; textChanged: boolean; changed: ChangedSource[]; state: string };

function staleness(unit: Unit, record: ReviewRecord | undefined, byKey: Map<string, Unit>, src: Sources): Staleness | null {
  const now = snapshot(unit, byKey, src);
  const state = stateOf(now);
  if (!record) return { unit, reasons: ['Not reviewed yet.'], sweep: [], textChanged: true, changed: [], state };
  const reasons: string[] = [];
  const sweep: string[] = [];
  const changedSources: ChangedSource[] = [];
  const via = effectiveDeps(unit, byKey);
  const tag = (id: string) => (via.get(id) ? ` (via ${via.get(id)!.split('#')[1]})` : '');
  const textChanged = now.unitHash !== record.unitHash;
  if (textChanged) reasons.push('Section text changed since the last review.');
  for (const [id, dep] of Object.entries(now.deps)) {
    const old = record.deps[id];
    let changed = false;
    let newDecs: string[] = [];
    if (!old) {
      reasons.push(`${id}${tag(id)}: newly cited since the last review.`); // the rule itself did not change: no sweep
      changedSources.push({ id, newDecs });
    } else {
      if (old.hash !== dep.hash) {
        reasons.push(`${id}${tag(id)}: ${id.startsWith('DEC-') ? 'decision entry' : id.includes('#') ? 'source section' : 'rule text'} changed.`);
        changed = true;
      }
      newDecs = dep.decs.filter((d) => !old.decs.includes(d));
      if (newDecs.length) {
        reasons.push(`${id}${tag(id)}: new decision ${newDecs.join(', ')}.`);
        changed = true;
      }
      if (changed) changedSources.push({ id, newDecs });
    }
    if (changed && sweepNeeded(src, id)) sweep.push(id);
  }
  for (const id of Object.keys(record.deps)) if (!now.deps[id]) reasons.push(`${id}: no longer cited.`);
  return reasons.length ? { unit, reasons, sweep, textChanged, changed: changedSources, state } : null;
}

// ---------- checks over every document ----------

function checkCitations(src: Sources, units: Unit[]): void {
  const files = [...walk('docs').filter((f) => f.endsWith('.md')), 'AGENTS.md'];
  const scan = (where: string, text: string, firstLine: number) => {
    for (const m of text.matchAll(ID_RE))
      if (!isKnown(src, m[0])) errors.push({ where: `${where}:${firstLine + lineOf(text, m.index!) - 1}`, text: `${m[0]} is not defined and not retired.` });
  };
  for (const f of files) if (!FROZEN.includes(f)) scan(f, read(f), 1);
  for (const u of units) if (!u.file.endsWith('.md')) scan(u.file, u.text, u.line);
  for (const u of units)
    for (const id of u.own)
      if (id.includes('#') && !src.sections.has(id)) errors.push({ where: `${u.file}:${u.line}`, text: `Link to ${id}: no such heading.` });
}

function checkLinks(): void {
  const files = [...walk('docs').filter((f) => f.endsWith('.md')), 'AGENTS.md'];
  const anchors = new Map<string, Set<string>>();
  const anchorsOf = (f: string) => {
    if (!anchors.has(f)) anchors.set(f, new Set(headings(read(f)).map((h) => h.slug)));
    return anchors.get(f)!;
  };
  for (const file of files) {
    let fence = false;
    read(file).split('\n').forEach((raw, i) => {
      if (/^\s*(```|~~~)/.test(raw)) fence = !fence;
      if (fence) return;
      const line = raw.replace(/`[^`]*`/g, '');
      for (const m of line.matchAll(/\[(?:[^\]\\]|\\.)*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const href = m[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
        const [path, anchor] = href.split('#');
        const target = path ? posix.normalize(posix.join(posix.dirname(file), decodeURI(path))) : file;
        const where = `${file}:${i + 1}`;
        if (!existsSync(join(ROOT, target))) {
          errors.push({ where, text: `Broken link: ${href}` });
          continue;
        }
        if (anchor && target.endsWith('.md') && !anchorsOf(target).has(anchor)) errors.push({ where, text: `Broken anchor: ${href}` });
      }
    });
  }
}

function checkTables(): void {
  const files = [...walk('docs').filter((f) => f.endsWith('.md')), 'AGENTS.md'];
  const cells = (row: string) => row.replace(/^\s*(?:>\s*)?\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).length;
  for (const file of files) {
    const lines = read(file).split('\n');
    let fence = false;
    let i = 0;
    while (i < lines.length) {
      if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
      if (fence || !/^\s*(?:>\s*)?\|/.test(lines[i])) {
        i++;
        continue;
      }
      const start = i;
      while (i < lines.length && /^\s*(?:>\s*)?\|/.test(lines[i])) i++;
      const block = lines.slice(start, i);
      const width = cells(block[0]);
      if (block.length < 2 || !/^\s*(?:>\s*)?\|?\s*:?-{3,}/.test(block[1])) {
        errors.push({ where: `${file}:${start + 1}`, text: 'Table has no separator row under its header.' });
        continue;
      }
      block.forEach((row, k) => {
        if (cells(row) !== width) errors.push({ where: `${file}:${start + k + 1}`, text: `Table row has ${cells(row)} cells; the header has ${width}.` });
      });
    }
  }
}

// A design document that lists its IDs in its header ("- PRD IDs:", "- Policies:", "- Decisions:")
// lists every ID its sections cite (AGENTS.md, "Alignment rules"). IDs in <!-- --> comments and in
// sections marked <!-- header: not listed — reason --> do not count.
function checkHeaders(src: Sources, units: Unit[]): void {
  for (const file of walk('docs/design').filter((f) => f.endsWith('.md'))) {
    const lines = read(file).split('\n');
    const end = lines.findIndex((l) => /^## /.test(l));
    const head = lines.slice(0, end < 0 ? lines.length : end);
    const listed = head.filter((l) => HEADER_LIST_RE.test(l));
    if (!listed.length) continue;
    const inHeader = extractIds(listed.join('\n'), src);
    const covered = (id: string) => {
      if (inHeader.has(id)) return true;
      const whole = /^POL-(\d{2})$/.exec(id);
      return Boolean(whole && [...inHeader].some((h) => h.startsWith(`POL-${whole[1]}`)));
    };
    const missing = new Map<string, string>();
    for (const u of units) {
      if (u.file !== file || u.key === `${file}#top` || HEADER_MARKER_RE.test(u.text)) continue;
      for (const id of extractIds(u.text.replace(/<!--[\s\S]*?-->/g, ''), src))
        if (!covered(id) && !missing.has(id)) missing.set(id, u.key.split('#')[1]);
    }
    if (missing.size)
      errors.push({
        where: `${file}:${head.findIndex((l) => HEADER_LIST_RE.test(l)) + 1}`,
        text: `${missing.size} ID(s) cited in the sections are missing from the header lists. List them, or mark an ownership-only section <!-- header: not listed — reason -->.`,
        detail: [[...missing].slice(0, 15).map(([id, at]) => `${id} (${at})`).join(', ') + (missing.size > 15 ? `, and ${missing.size - 15} more` : '')],
      });
  }
}

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

// A PRD or policy bullet that changed since the base needs a decision entry added or edited
// since the last commit that touched the PRD or the policies (the entry comes first).
// Returns the rules added since the base.
function checkDecisionLog(src: Sources, base: string): Rule[] {
  if (git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]) === null) {
    warnings.push({ where: base, text: 'Git base not found; skipped the decision-log check.' });
    return [];
  }
  const at = (ref: string, path: string) => git(['show', `${ref}:${path}`]) ?? '';
  const old = parseSources(at(base, PRD), at(base, POLICIES), at(base, DECISIONS), false);
  const changed = [...src.rules.values()].filter((r) => old.rules.get(r.id)?.text !== r.text);
  const removed = [...old.rules.values()].filter((r) => !src.rules.has(r.id));
  const added = changed.filter((r) => !old.rules.has(r.id));
  for (const r of removed)
    if (!src.retired.has(r.id)) errors.push({ where: `${r.file}`, text: `${r.id} was removed but is not listed under "Retired IDs".` });
  if (!changed.length && !removed.length) return added;
  const last = git(['log', '-1', '--format=%H', base, '--', PRD, POLICIES])?.trim();
  const before = last ? parseSources('', '', at(last, DECISIONS), false).decisions : new Map<string, Decision>();
  const pending = [...src.decisions.values()].filter((d) => before.get(d.id)?.text !== d.text);
  for (const r of [...changed, ...removed]) {
    if (pending.some((d) => extractIds(d.text).has(r.id))) continue;
    errors.push({ where: `${r.file}:${r.line}`, text: `${r.id} changed with no new or edited decision entry citing it. Log it in ${DECISIONS} first.` });
  }
  return added;
}

// ---------- commands ----------

function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

const SWITCHES = new Set(['all', 'force']); // flags that take no value

function options(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const name = args[i].slice(2);
      if (SWITCHES.has(name)) flags[name] = 'yes';
      else {
        flags[name] = args[i + 1] ?? '';
        i++;
      }
    } else positional.push(args[i]);
  }
  return { positional, flags };
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function load() {
  const src = parseSources(read(PRD), read(POLICIES), read(DECISIONS), true);
  const units = gatedUnits(src);
  const byKey = new Map(units.map((u) => [u.key, u]));
  return { src, units, byKey, records: loadRecords() };
}

function printFindings(title: string, list: Finding[]): void {
  if (!list.length) return;
  console.log(`\n${title}`);
  for (const f of list) {
    console.log(`  ${f.where} — ${f.text}`);
    for (const d of f.detail ?? []) console.log(`      ${d}`);
  }
}

// The cheap, exact checks. They run before any semantic review: each fix they ask for can change
// which sections are stale, so a review started before they pass would have to be repeated.
function deterministicChecks(loaded: ReturnType<typeof load>, base: string): void {
  const { src, units, byKey, records } = loaded;
  checkCitations(src, units);
  checkLinks();
  checkTables();
  checkHeaders(src, units);
  // A new rule flags no section until one cites it; only the broad sweep finds where it applies.
  const cited = new Set(units.flatMap((u) => [...effectiveDeps(u, byKey).keys()]));
  for (const r of checkDecisionLog(src, base))
    if (!cited.has(r.id))
      warnings.push({ where: `${r.file}:${r.line}`, text: `${r.id} is new and no gated section cites it yet. Run the broad sweep in tools/doc-check/ai-review.md to find where it applies.` });
  for (const u of units)
    if (!u.marker && !effectiveDeps(u, byKey).size)
      errors.push({ where: `${u.file}:${u.line}`, text: `${u.key} cites no rule. Cite the IDs it applies, or add <!-- deps: none — reason -->.` });
  for (const key of Object.keys(records.units))
    if (!byKey.has(key)) errors.push({ where: REVIEWS, text: `Record for ${key}, which no longer exists. Review the renamed section, then: check.mts drop "${key}"` });
}

function staleUnits(loaded: ReturnType<typeof load>): Staleness[] {
  const { src, units, byKey, records } = loaded;
  return units.flatMap((u) => staleness(u, records.units[u.key], byKey, src) ?? []);
}

function runCheck(flags: Record<string, string>): number {
  const loaded = load();
  const { units, records } = loaded;
  deterministicChecks(loaded, flags.base || 'HEAD');

  const sweep = new Set<string>();
  for (const stale of staleUnits(loaded)) {
    stale.sweep.forEach((id) => sweep.add(id));
    errors.push({ where: `${stale.unit.file}:${stale.unit.line}`, text: `Review required: ${stale.unit.key}`, detail: stale.reasons });
  }
  if (sweep.size)
    warnings.push({ where: 'broad sweep', text: `Stock, money or access sources changed: ${sorted(sweep).join(', ')}. Run the broad sweep in tools/doc-check/ai-review.md.` });

  const reviewed = units.filter((u) => records.units[u.key]?.status === 'reviewed').length;
  const baseline = units.filter((u) => records.units[u.key]?.status === 'baseline').length;
  printFindings('Errors', errors);
  printFindings('Warnings', warnings);
  console.log(`\nDoc check: ${errors.length} error(s), ${warnings.length} warning(s).`);
  console.log(`Sections: ${units.length} tracked — ${reviewed} reviewed, ${baseline} baseline only, ${units.length - reviewed - baseline} never recorded.`);
  if (errors.length) console.log('Next steps: AGENTS.md, "Checking the documents".');
  return errors.length ? 1 : 0;
}

// Sections already sent for review, with the state they were sent in. Kept in the git directory,
// never committed: it only stops the same unchanged sections going out twice.
function sentPath(): string | null {
  const p = git(['rev-parse', '--git-path', 'doc-check-sent.json'])?.trim();
  return p ? resolve(ROOT, p) : null;
}

function loadSent(): Record<string, string> {
  const p = sentPath();
  if (!p || !existsSync(p)) return {};
  try {
    return (JSON.parse(readFileSync(p, 'utf8')) as { sections: Record<string, string> }).sections ?? {};
  } catch {
    return {};
  }
}

function saveSent(sections: Record<string, string>): void {
  const p = sentPath();
  if (p) writeFileSync(p, `${JSON.stringify({ written: new Date().toISOString(), sections }, null, 2)}\n`);
}

function sourceEntry(src: Sources, c: ChangedSource): string[] {
  const choice = (d: Decision) => (d.text.split('\n').find((l) => l.startsWith('- **Choice.**')) ?? '').slice(0, 1500);
  const out: string[] = [];
  const rule = src.rules.get(c.id);
  const dec = src.decisions.get(c.id);
  if (rule) out.push(`- \`${c.id}\` (${rule.file}:${rule.line}): ${rule.text}`);
  else if (dec) out.push(`- \`${c.id}\` (${DECISIONS}:${dec.line}) — ${dec.title}`, `    ${choice(dec)}`);
  else if (c.id.includes('#')) out.push(`- \`${c.id}\`: read this heading of the source.`);
  else out.push(`- \`${c.id}\``);
  for (const d of c.newDecs) {
    const entry = src.decisions.get(d)!;
    out.push(`  - New decision ${d} (${DECISIONS}:${entry.line}) — ${entry.title}`, `    ${choice(entry)}`);
  }
  return out;
}

function sectionEntry(s: Staleness): string {
  const u = s.unit;
  return [
    `## ${u.key}`,
    '',
    `Location: ${u.file}:${u.line}`,
    `State: ${s.state}`,
    '',
    'Why flagged:',
    ...s.reasons.map((r) => `- ${r}`),
    '',
    'Section text:',
    '',
    '````',
    u.text.length > 12000 ? `${u.text.slice(0, 12000)}\n[… cut at 12,000 characters; read the file]` : u.text,
    '````',
    '',
  ].join('\n');
}

// Cut the sections into n parts of about equal size, keeping each document's sections together
// unless one document alone is much larger than a part.
function splitParts(list: Staleness[], n: number): Staleness[][] {
  const size = (s: Staleness) => sectionEntry(s).length;
  let left = list.reduce((a, s) => a + size(s), 0); // not yet placed
  const parts: Staleness[][] = [[]];
  let current = 0;
  list.forEach((s, i) => {
    const share = (current + left) / (n - parts.length + 1); // a fair size for the open part
    const newFile = i > 0 && list[i - 1].unit.file !== s.unit.file;
    if (parts.length < n && current && ((newFile && current >= share * 0.75) || current + size(s) > share * 1.25)) {
      parts.push([]);
      current = 0;
    }
    parts.at(-1)!.push(s);
    current += size(s);
    left -= size(s);
  });
  return parts;
}

function runPacket(flags: Record<string, string>): number {
  const loaded = load();
  const { src } = loaded;
  deterministicChecks(loaded, flags.base || 'HEAD');
  // A record left by a renamed or removed section changes nothing that is stale; every other error can.
  const blocking = errors.filter((e) => e.where !== REVIEWS);
  if (blocking.length && !flags.force) {
    printFindings('Errors', blocking);
    console.log(`\nNo packet written: fix these ${blocking.length} error(s) first. Each fix can change which sections are stale, so a review started now would be repeated. (--force writes it anyway.)`);
    return 1;
  }
  printFindings('Warnings', warnings);
  const stale = staleUnits(loaded);
  const sent = loadSent();
  const fresh = flags.all ? stale : stale.filter((s) => sent[s.unit.key] !== s.state);
  const held = stale.length - fresh.length;
  if (!stale.length) {
    console.log('Nothing is stale.');
    return 0;
  }
  if (!fresh.length) {
    console.log(`Nothing new to review: all ${held} stale section(s) went out in an earlier packet with the same text and sources. Record their verdicts with "record", or pass --all to send them again.`);
    return 0;
  }
  const n = Math.max(1, Math.min(Number(flags.split || 1) || 1, fresh.length));
  if (n > 1 && !flags.out) fail('--split needs --out <file>: the parts are written next to it.');
  const head = git(['rev-parse', '--short', 'HEAD'])?.trim() ?? 'no commit';
  const dirty = git(['status', '--porcelain', '--', 'docs', 'AGENTS.md'])?.trim() ? ', with uncommitted edits' : '';
  const written: string[] = [];
  splitParts(fresh, n).forEach((part, k) => {
    const sources = new Map<string, ChangedSource>();
    for (const s of part)
      for (const c of s.changed) {
        const seen = sources.get(c.id);
        sources.set(c.id, { id: c.id, newDecs: sorted([...(seen?.newDecs ?? []), ...c.newDecs]) });
      }
    const text = [
      `# Review packet${n > 1 ? ` ${k + 1} of ${n}` : ''}`,
      '',
      `Written ${today()} from ${head}${dirty}. ${part.length} section(s): ${part.filter((s) => s.textChanged).length} with changed or new text, ${part.filter((s) => !s.textChanged).length} flagged only by their sources.`,
      '',
      'Follow tools/doc-check/ai-review.md. For each section with no clash, write one line to your verdict file: the section key, a tab, its State, a tab, and the reason (what you compared and what you found). Write no line for a section with a finding; report the finding instead.',
      '',
      '# Changed sources',
      '',
      ...(sources.size ? [...sources.values()].flatMap((c) => sourceEntry(src, c)) : ['None: these sections changed themselves or are new.']),
      '',
      '# Sections',
      '',
      ...part.map(sectionEntry),
    ].join('\n');
    if (!flags.out) return console.log(text);
    const file = n > 1 ? resolve(flags.out).replace(/(\.md)?$/, (ext) => `-${k + 1}${ext || '.md'}`) : resolve(flags.out);
    writeFileSync(file, text);
    written.push(`${file} (${part.length} section(s), ${Math.round(text.length / 1000)}k characters)`);
  });
  saveSent({ ...Object.fromEntries(stale.filter((s) => sent[s.unit.key] === s.state).map((s) => [s.unit.key, s.state])), ...Object.fromEntries(fresh.map((s) => [s.unit.key, s.state])) });
  if (written.length) console.log(`Wrote ${fresh.length} section(s):\n${written.map((w) => `  ${w}`).join('\n')}`);
  if (held) console.log(`Left out ${held} section(s) already sent with the same text and sources. Record their verdicts, or pass --all.`);
  return 0;
}

function runImpact(positional: string[]): number {
  if (!positional.length) fail('impact <ID> [<ID> ...]: name the rules, decisions or source headings a change would touch.');
  const loaded = load();
  const { src, units, byKey } = loaded;
  positional = positional.map((id) => id.replace(/^(?:\.\/)?(?=(?:prd|kdps-policies)\.md#)/, 'docs/')); // prd.md#stack names docs/prd.md#stack
  const ids = new Set<string>(positional);
  for (const id of positional) for (const c of src.decisions.get(id)?.cites ?? []) ids.add(c); // a decision touches what its Choice and Changed lines cite
  const unknown = [...ids].filter((id) => !fingerprint(src, id));
  const stale = new Set(staleUnits(loaded).map((s) => s.unit.key));
  // A rule named here is reworded, which also changes every PRD or policy heading that holds it and so the
  // sections that link to that heading. A rule a decision only cites keeps its text.
  const holders = (id: string) =>
    positional.includes(id) ? [...src.sections].filter(([, text]) => text.includes(`- \`${id}\` `)).map(([key]) => key) : [];
  const hits: { u: Unit; via: string[] }[] = [];
  for (const u of units) {
    const deps = effectiveDeps(u, byKey);
    const via = [...ids].flatMap((id) => {
      const whole = /^POL-(\d{2})\.\d{2}$/.exec(id);
      const key = deps.has(id) ? id : whole && deps.has(`POL-${whole[1]}`) ? `POL-${whole[1]}` : (holders(id).find((h) => deps.has(h)) ?? null);
      if (!key) return [];
      const how = key === id ? '' : ` as ${key.replace('docs/', '')}`;
      return [deps.get(key) ? `${id}${how} via ${deps.get(key)!.split('#')[1]}` : `${id}${how}`];
    });
    if (via.length) hits.push({ u, via });
  }
  const files = sorted(hits.map((h) => h.u.file));
  for (const f of files) {
    const inFile = hits.filter((h) => h.u.file === f);
    console.log(`\n${f}: ${inFile.length} section(s)`);
    for (const h of inFile) console.log(`  ${h.u.key.split('#')[1]}${stale.has(h.u.key) ? '  [already stale]' : ''} — ${h.via.join(', ')}`);
  }
  const chars = hits.reduce((a, h) => a + h.u.text.length, 0);
  console.log(`\nImpact of ${sorted(ids).join(', ')}: ${hits.length} section(s) in ${files.length} document(s), about ${Math.round(chars / 1000)}k characters of section text; ${hits.filter((h) => stale.has(h.u.key)).length} already stale.`);
  if ([...ids].some((id) => sweepNeeded(src, id))) console.log('A stock, money or access rule is among them: the broad sweep applies too.');
  if (unknown.length) console.log(`Not found (a new rule or decision cites nothing yet): ${unknown.join(', ')}.`);
  return 0;
}

function runReview(positional: string[], flags: Record<string, string>): number {
  if (positional.length !== 1) fail('Review one section at a time: review <section> --by <name> --reason <text>.');
  const key = positional[0];
  if (/[*?]/.test(key)) fail('Wildcards are not allowed. Name one section.');
  const by = (flags.by ?? '').trim();
  const reason = (flags.reason ?? '').trim();
  if (!by) fail('--by is required: who checked this section.');
  if (!reason) fail('--reason is required: what you compared and why the section is right.');
  const { src, byKey, records } = load();
  const unit = byKey.get(key);
  if (!unit) fail(`No section ${key}. Use "list" to see section keys.`);
  const missing = [...effectiveDeps(unit, byKey).keys()].filter((id) => !fingerprint(src, id));
  if (missing.length) fail(`Fix these unknown citations first: ${missing.join(', ')}.`);
  const snap = snapshot(unit, byKey, src);
  if (flags.state && flags.state !== stateOf(snap)) fail(`${key} changed since state ${flags.state} was reviewed (now ${stateOf(snap)}). Review it again.`);
  records.units[key] = { status: 'reviewed', by, date: today(), reason, ...snap };
  saveRecords(records);
  console.log(`Recorded the review of ${key}.`);
  return 0;
}

// Records many verdicts at once, each for its own section with its own reason. A line is refused
// when its section changed after the reviewer read it, when its reason is too short, or when its
// reason is also given for another section (in these files or in another section's record) or
// repeats the section's previous record.
function runRecord(positional: string[], flags: Record<string, string>): number {
  if (!positional.length) fail('record <verdict file> [<file> ...] --by <name>. One line per section: key, tab, state, tab, reason.');
  const by = (flags.by ?? '').trim();
  if (!by) fail('--by is required: who checked these sections.');
  const { src, byKey, records } = load();
  const said = (r: string) => r.toLowerCase().replace(/\s+/g, ' ').trim();
  const rows = positional.flatMap((file) =>
    readFileSync(resolve(file), 'utf8')
      .split('\n')
      .map((l, i) => ({ line: `${posix.basename(file)}:${i + 1}`, fields: l.split('\t') }))
      .filter((r) => r.fields.join('').trim() && !r.fields[0].startsWith('#')),
  );
  const uses = new Map<string, number>();
  for (const r of rows) if (r.fields.length >= 3) uses.set(said(r.fields.slice(2).join(' ')), (uses.get(said(r.fields.slice(2).join(' '))) ?? 0) + 1);
  const recordedBy = new Map<string, string>(); // reason -> a section already recorded with it
  for (const [key, r] of Object.entries(records.units)) if (r.status === 'reviewed') recordedBy.set(said(r.reason), key);
  const refused: string[] = [];
  const current: string[] = [];
  const seen = new Set<string>();
  let recorded = 0;
  for (const { line, fields } of rows) {
    const no = (why: string) => refused.push(`${line} ${fields[0]}: ${why}`);
    if (fields.length < 3) {
      no('needs three fields: section key, state, reason.');
      continue;
    }
    const [key, state] = fields.map((f) => f.trim());
    const reason = fields.slice(2).join(' ').trim();
    const unit = byKey.get(key);
    if (!unit) {
      no('no such section.');
      continue;
    }
    if (seen.has(key)) {
      no('listed twice.');
      continue;
    }
    seen.add(key);
    const record = records.units[key];
    const stale = staleness(unit, record, byKey, src);
    const snap = snapshot(unit, byKey, src);
    if (stateOf(snap) !== state) {
      no(`changed since the review (reviewed state ${state}, now ${stateOf(snap)}). Review it again.`);
      continue;
    }
    if (!stale) {
      current.push(key);
      continue;
    }
    if (reason.split(/\s+/).length < 8) no('the reason is too short to say what was compared and found.');
    else if ((uses.get(said(reason)) ?? 0) > 1) no('the same reason is given for another section. Each section needs its own.');
    else if (recordedBy.has(said(reason)) && recordedBy.get(said(reason)) !== key) no(`the same reason is already recorded for ${recordedBy.get(said(reason))}. Each section needs its own.`);
    else if (record && said(record.reason) === said(reason)) no('the reason repeats the previous record word for word. Say what was compared this time.');
    else if ([...effectiveDeps(unit, byKey).keys()].some((id) => !fingerprint(src, id))) no('it cites an unknown ID. Fix the citation first.');
    else {
      records.units[key] = { status: 'reviewed', by, date: today(), reason, ...snap };
      recorded++;
    }
  }
  if (recorded) saveRecords(records);
  console.log(`Recorded ${recorded} review(s).`);
  if (current.length) console.log(`Already recorded for their current text and sources, left as they are: ${current.length}.`);
  if (refused.length) console.log(`Not recorded (${refused.length}):\n${refused.map((r) => `  ${r}`).join('\n')}`);
  return refused.length ? 1 : 0;
}

function runDrop(positional: string[]): number {
  if (positional.length !== 1) fail('Drop one record at a time: drop <section>.');
  const { byKey, records } = load();
  const key = positional[0];
  if (!records.units[key]) fail(`No record for ${key}.`);
  if (byKey.has(key)) fail(`${key} still exists. Records of live sections change only through "review".`);
  delete records.units[key];
  saveRecords(records);
  console.log(`Dropped the record for ${key}.`);
  return 0;
}

function runBaseline(flags: Record<string, string>): number {
  const by = (flags.by ?? '').trim();
  const reason = (flags.reason ?? '').trim();
  if (!by || !reason) fail('baseline needs --by and --reason.');
  const { src, units, byKey, records } = load();
  if (Object.keys(records.units).length) fail(`${REVIEWS} already has records. A baseline is taken once; use "review" from now on.`);
  for (const u of units) records.units[u.key] = { status: 'baseline', by, date: today(), reason, ...snapshot(u, byKey, src) };
  saveRecords(records);
  console.log(`Baseline recorded for ${units.length} sections. These are not reviews.`);
  return 0;
}

function runList(positional: string[]): number {
  const { units, byKey, records } = load();
  for (const u of units.filter((x) => !positional[0] || x.key.includes(positional[0]))) {
    const deps = effectiveDeps(u, byKey);
    const status = records.units[u.key]?.status ?? 'none';
    console.log(`${u.key}  [${status}]  ${u.file}:${u.line}${u.marker ? '  deps: none' : ''}`);
    if (deps.size) console.log(`    ${[...deps].map(([id, via]) => (via ? `${id}<${via.split('#')[1]}` : id)).join(' ')}`);
  }
  return 0;
}

const [first, ...restArgs] = process.argv.slice(2);
const command = !first || first.startsWith('--') ? 'check' : first;
const { positional, flags } = options(!first || first.startsWith('--') ? process.argv.slice(2) : restArgs);

const commands: Record<string, () => number> = {
  check: () => runCheck(flags),
  impact: () => runImpact(positional),
  packet: () => runPacket(flags),
  record: () => runRecord(positional, flags),
  review: () => runReview(positional, flags),
  drop: () => runDrop(positional),
  baseline: () => runBaseline(flags),
  list: () => runList(positional),
};
if (!commands[command]) fail(`Unknown command "${command}". Commands: ${Object.keys(commands).join(', ')}.`);
process.exit(commands[command]());
