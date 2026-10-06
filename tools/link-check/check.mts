// Link and ID check for the Apparel OS documents.
//
//   node tools/link-check/check.mts
//
// Two checks, no review records and no state:
//   1. Every relative link resolves: Markdown links in docs/ and AGENTS.md (with their #anchors), and
//      href/src attributes in the HTML pages under docs/.
//   2. Every cited PRD-, POL- and DEC- ID exists: defined in docs/prd.md, docs/kdps-policies.md or
//      docs/decisions.md, or listed there as retired.
// It reads the files git tracks or would track (ignored files, such as raw KDPS data, are left out).
// docs/history/ is skipped: it holds old reports kept as they were, and nobody maintains them.
//
// Zero dependencies. Node.js 22.18 or later runs the TypeScript directly (keep to erasable syntax).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP = 'docs/history/';

const ID_RE = /PRD-[A-Z]{3}-\d{3}|POL-\d{2}\.\d{2}|DEC-\d{3}/g;
// Anything shaped like an ID, so a malformed one (PRD-STK-0011, DEC-12) is reported instead of passing.
const CITED_RE = /(?<![\w-])(?:PRD-[A-Z]{2,}-\d+|POL-\d+\.\d+|DEC-\d+)[A-Za-z]*/g;
const RULE_LINE_RE = /^- `(PRD-[A-Z]{3}-\d{3}|POL-\d{2}\.\d{2})` /;
const DEC_HEADING_RE = /^## (DEC-\d{3}) /;
const MD_LINK_RE = /\[(?:[^\]\\]|\\.)*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HTML_LINK_RE = /\b(?:href|src)="([^"]+)"/g;
const FENCE_RE = /^\s*(```|~~~)/;

const errors: string[] = [];

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function documents(): string[] {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'docs', 'AGENTS.md'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return [...new Set(listed.split('\n'))]
    .filter((f) => (f.endsWith('.md') || f.endsWith('.html')) && !f.startsWith(SKIP) && existsSync(join(ROOT, f)))
    .sort();
}

// GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens, repeats numbered.
function anchors(text: string): Set<string> {
  const out = new Set<string>();
  const seen = new Map<string, number>();
  let fence = false;
  for (const line of text.split('\n')) {
    if (FENCE_RE.test(line)) fence = !fence;
    const title = fence ? undefined : /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)?.[1];
    if (title === undefined) continue;
    const base = title
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${String(n)}` : base);
  }
  return out;
}

const anchorCache = new Map<string, Set<string>>();

function anchorsOf(target: string): Set<string> {
  let found = anchorCache.get(target);
  if (!found) {
    found = anchors(read(target));
    anchorCache.set(target, found);
  }
  return found;
}

function checkLink(where: string, file: string, href: string): void {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return;
  if (href.startsWith('#')) {
    if (file.endsWith('.md') && !anchorsOf(file).has(href.slice(1))) errors.push(`${where}: broken anchor ${href}`);
    return;
  }
  const [path = '', anchor] = href.split('#');
  let decoded = path;
  try {
    decoded = decodeURI(path);
  } catch {
    // a malformed escape: keep the raw path
  }
  const target = posix.normalize(posix.join(posix.dirname(file), decoded));
  if (!existsSync(join(ROOT, target))) {
    errors.push(`${where}: broken link ${href}`);
    return;
  }
  if (anchor && target.endsWith('.md') && !anchorsOf(target).has(anchor))
    errors.push(`${where}: broken anchor ${href}`);
}

// IDs defined in the PRD and the policies (rule bullets and "Retired IDs" lines) and the decision headings.
function knownIds(): Set<string> {
  const known = new Set<string>();
  for (const file of ['docs/prd.md', 'docs/kdps-policies.md']) {
    for (const line of read(file).split('\n')) {
      const rule = RULE_LINE_RE.exec(line)?.[1];
      if (rule) known.add(rule);
      if (line.startsWith('> - Retired IDs:')) for (const id of line.match(ID_RE) ?? []) known.add(id);
    }
  }
  for (const line of read('docs/decisions.md').split('\n')) {
    const dec = DEC_HEADING_RE.exec(line)?.[1];
    if (dec) known.add(dec);
  }
  return known;
}

const files = documents();
const known = knownIds();

for (const file of files) {
  const isMd = file.endsWith('.md');
  let fence = false;
  read(file)
    .split('\n')
    .forEach((raw, i) => {
      if (isMd && FENCE_RE.test(raw)) fence = !fence;
      if (fence) return;
      const where = `${file}:${String(i + 1)}`;
      const links = isMd ? raw.replace(/`[^`]*`/g, '').matchAll(MD_LINK_RE) : raw.matchAll(HTML_LINK_RE);
      for (const m of links) if (m[1]) checkLink(where, file, m[1]);
      for (const m of raw.matchAll(CITED_RE))
        if (!known.has(m[0])) errors.push(`${where}: ${m[0]} is not defined and not retired`);
    });
}

if (errors.length) {
  for (const e of errors) console.error(e);
  console.error(`\nLink check: ${String(errors.length)} error(s).`);
  process.exit(1);
}
console.log(`Link check: ${String(files.length)} files, no broken links or unknown IDs.`);
