// Doc checker for Apparel OS: IDs, links, tables and the review gate.
// How to use it, and the change gate it enforces: AGENTS.md, "Checking the documents".
//
//   node tools/doc-check/check.mts [--base <git ref>]       run every check (default base: HEAD)
//   node tools/doc-check/check.mts packet [--out <file>]     review packet for stale sections
//   node tools/doc-check/check.mts review <section> --by <name> --reason <text>
//   node tools/doc-check/check.mts drop <section>            forget a record whose section is gone
//   node tools/doc-check/check.mts baseline --by <name> --reason <text>   once, on an empty record file
//   node tools/doc-check/check.mts list [<filter>]           sections and what they depend on
//
// The checker never writes review records on its own. Only `review`, `drop` and `baseline` do.

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

type Unit = {
  key: string;
  file: string;
  line: number;
  text: string;
  own: Set<string>; // IDs and source sections cited in the section itself
  refs: Set<string>; // other sections it points at (one hop)
  marker: boolean;
};

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
    const body = u.text.split('\n').slice(1).join('\n');
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
  for (const file of GATED.flatMap(walk)) {
    const text = read(file);
    if (file.endsWith('.md')) units.push(...markdownUnits(file, text, src));
    else if (file === BLUEPRINT) units.push(...blueprintUnits(file, text, src));
    else if (file === DESIGN_SYSTEM) {
      const page = designSystemPage(text);
      if (page === null) errors.push({ where: file, text: 'The __bundler/template block does not unpack to a page string.' });
      else units.push(makeUnit(`${file}#page`, file, 1, page, src));
    } else if (file.endsWith('.html')) units.push(makeUnit(`${file}#page`, file, 1, text, src));
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

type Staleness = { unit: Unit; reasons: string[]; sweep: string[] };

function staleness(unit: Unit, record: ReviewRecord | undefined, byKey: Map<string, Unit>, src: Sources): Staleness | null {
  if (!record) return { unit, reasons: ['Not reviewed yet.'], sweep: [] };
  const reasons: string[] = [];
  const sweep: string[] = [];
  const now = snapshot(unit, byKey, src);
  const via = effectiveDeps(unit, byKey);
  const tag = (id: string) => (via.get(id) ? ` (via ${via.get(id)!.split('#')[1]})` : '');
  if (now.unitHash !== record.unitHash) reasons.push('Section text changed since the last review.');
  for (const [id, dep] of Object.entries(now.deps)) {
    const old = record.deps[id];
    let changed = false;
    if (!old) {
      reasons.push(`${id}${tag(id)}: newly cited since the last review.`);
      changed = true;
    } else {
      if (old.hash !== dep.hash) {
        reasons.push(`${id}${tag(id)}: ${id.startsWith('DEC-') ? 'decision entry' : id.includes('#') ? 'source section' : 'rule text'} changed.`);
        changed = true;
      }
      const added = dep.decs.filter((d) => !old.decs.includes(d));
      if (added.length) {
        reasons.push(`${id}${tag(id)}: new decision ${added.join(', ')}.`);
        changed = true;
      }
    }
    if (changed && sweepNeeded(src, id)) sweep.push(id);
  }
  for (const id of Object.keys(record.deps)) if (!now.deps[id]) reasons.push(`${id}: no longer cited.`);
  return reasons.length ? { unit, reasons, sweep } : null;
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

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

// A PRD or policy bullet that changed since the base needs a decision entry added or edited
// since the last commit that touched the PRD or the policies (the entry comes first).
function checkDecisionLog(src: Sources, base: string): void {
  if (git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]) === null) {
    warnings.push({ where: base, text: 'Git base not found; skipped the decision-log check.' });
    return;
  }
  const at = (ref: string, path: string) => git(['show', `${ref}:${path}`]) ?? '';
  const old = parseSources(at(base, PRD), at(base, POLICIES), at(base, DECISIONS), false);
  const changed = [...src.rules.values()].filter((r) => old.rules.get(r.id)?.text !== r.text);
  const removed = [...old.rules.values()].filter((r) => !src.rules.has(r.id));
  for (const r of removed)
    if (!src.retired.has(r.id)) errors.push({ where: `${r.file}`, text: `${r.id} was removed but is not listed under "Retired IDs".` });
  if (!changed.length && !removed.length) return;
  const last = git(['log', '-1', '--format=%H', base, '--', PRD, POLICIES])?.trim();
  const before = last ? parseSources('', '', at(last, DECISIONS), false).decisions : new Map<string, Decision>();
  const pending = [...src.decisions.values()].filter((d) => before.get(d.id)?.text !== d.text);
  for (const r of [...changed, ...removed]) {
    if (pending.some((d) => extractIds(d.text).has(r.id))) continue;
    errors.push({ where: `${r.file}:${r.line}`, text: `${r.id} changed with no new or edited decision entry citing it. Log it in ${DECISIONS} first.` });
  }
}

// ---------- commands ----------

function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

function options(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1] ?? '';
      i++;
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

function runCheck(flags: Record<string, string>): number {
  const { src, units, byKey, records } = load();
  checkCitations(src, units);
  checkLinks();
  checkTables();
  checkDecisionLog(src, flags.base || 'HEAD');

  const sweep = new Set<string>();
  let reviewed = 0;
  let baseline = 0;
  for (const u of units) {
    if (!u.marker && !effectiveDeps(u, byKey).size)
      errors.push({ where: `${u.file}:${u.line}`, text: `${u.key} cites no rule. Cite the IDs it applies, or add <!-- deps: none — reason -->.` });
    const record = records.units[u.key];
    if (record?.status === 'reviewed') reviewed++;
    if (record?.status === 'baseline') baseline++;
    const stale = staleness(u, record, byKey, src);
    if (!stale) continue;
    stale.sweep.forEach((id) => sweep.add(id));
    errors.push({ where: `${u.file}:${u.line}`, text: `Review required: ${u.key}`, detail: stale.reasons });
  }
  for (const key of Object.keys(records.units))
    if (!byKey.has(key)) errors.push({ where: REVIEWS, text: `Record for ${key}, which no longer exists. Review the renamed section, then: check.mts drop "${key}"` });
  if (sweep.size)
    warnings.push({ where: 'broad sweep', text: `Stock, money or access sources changed: ${sorted(sweep).join(', ')}. Run the broad sweep in tools/doc-check/ai-review.md.` });

  printFindings('Errors', errors);
  printFindings('Warnings', warnings);
  console.log(`\nDoc check: ${errors.length} error(s), ${warnings.length} warning(s).`);
  console.log(`Sections: ${units.length} tracked — ${reviewed} reviewed, ${baseline} baseline only, ${units.length - reviewed - baseline} never recorded.`);
  if (errors.length) console.log('Next steps: AGENTS.md, "Checking the documents".');
  return errors.length ? 1 : 0;
}

function runPacket(flags: Record<string, string>): number {
  const { src, units, byKey, records } = load();
  const out: string[] = ['# Review packet', '', 'For each section: why it was flagged, its text, and the current text of every source that changed. Follow tools/doc-check/ai-review.md.', ''];
  let count = 0;
  for (const u of units) {
    const record = records.units[u.key];
    const stale = staleness(u, record, byKey, src);
    if (!stale) continue;
    count++;
    out.push(`## ${u.key}`, '', `Location: ${u.file}:${u.line}`, '', 'Why flagged:', ...stale.reasons.map((r) => `- ${r}`), '');
    out.push('Section text:', '', '````', u.text.length > 12000 ? `${u.text.slice(0, 12000)}\n[… cut at 12,000 characters; read the file]` : u.text, '````', '');
    const changedIds = new Set(stale.reasons.map((r) => r.split(/[ :]/)[0]).filter((id) => fingerprint(src, id)));
    if (changedIds.size) out.push('Changed sources:', '');
    for (const id of changedIds) {
      const rule = src.rules.get(id);
      const dec = src.decisions.get(id);
      if (rule) out.push(`- \`${id}\` (${rule.file}:${rule.line}): ${rule.text}`);
      else if (dec) out.push(`- \`${id}\` (${DECISIONS}:${dec.line}): ${dec.title}`);
      else out.push(`- \`${id}\``);
      const old = record?.deps[id]?.decs ?? [];
      for (const d of fingerprint(src, id)!.decs.filter((x) => !old.includes(x))) {
        const entry = src.decisions.get(d)!;
        const choice = entry.text.split('\n').find((l) => l.startsWith('- **Choice.**')) ?? '';
        out.push(`  - New decision ${d} (${DECISIONS}:${entry.line}) — ${entry.title}`, `    ${choice}`);
      }
    }
    out.push('');
  }
  if (!count) out.push('Nothing is stale.');
  const text = out.join('\n');
  if (flags.out) {
    writeFileSync(resolve(flags.out), text);
    console.log(`Wrote ${count} section(s) to ${flags.out}.`);
  } else console.log(text);
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
  records.units[key] = { status: 'reviewed', by, date: today(), reason, ...snapshot(unit, byKey, src) };
  saveRecords(records);
  console.log(`Recorded the review of ${key}.`);
  return 0;
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
  packet: () => runPacket(flags),
  review: () => runReview(positional, flags),
  drop: () => runDrop(positional),
  baseline: () => runBaseline(flags),
  list: () => runList(positional),
};
if (!commands[command]) fail(`Unknown command "${command}". Commands: ${Object.keys(commands).join(', ')}.`);
process.exit(commands[command]());
