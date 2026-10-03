// Tests for the doc checker. Each test builds a small synthetic repository in a temporary
// directory and runs check.mts against it with --root. Run: node tools/doc-check/check.mts test
// (or node --test tools/doc-check/check.test.mts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check.mts');
// Git's own variables (a hook sets GIT_INDEX_FILE and GIT_DIR) must never reach the synthetic repositories.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

// Synthetic documents: the smallest set that passes every check.
const BASE: Record<string, string> = {
  'docs/prd.md': `# PRD

> Rank banner.
> - Retired IDs: \`PRD-STK-009\` (DEC-001).

## Stock

- \`PRD-STK-001\` Only a count creates stock.
- \`PRD-STK-002\` Stock moves by movements.

## Words used

- \`PRD-WRD-001\` Site means a place.
`,
  'docs/kdps-policies.md': `# Policies

## 1. Approvals

- \`POL-01.01\` The Owner approves.
- \`POL-01.02\` The Admin prepares.

## 2. Cash

- \`POL-02.01\` Count the till.

## 3. Returns

- \`POL-03.01\` Returns need a bill.
`,
  'docs/decisions.md': `# Decisions

## DEC-001 — Retire PRD-STK-009

- **Date:** 2026-10-01
- **Question.** Keep it?
- **Options.** Keep; retire.
- **Choice.** Retire \`PRD-STK-009\`.
- **Changed.** \`PRD-STK-009\` retired.

## DEC-002 — Counts

- **Date:** 2026-10-01
- **Question.** What creates stock?
- **Options.** Invoice; count.
- **Choice.** A count (\`PRD-STK-001\`).
- **Changed.** \`PRD-STK-001\` added.
- **Why.** Synthetic test entry.
`,
  'AGENTS.md': `# Agents

<!-- deps: none — synthetic fixture -->
Synthetic guide.
`,
  'docs/design/stock-ledger.md': `# Stock ledger

<!-- deps: none — title -->
Synthetic design.

## 1. Movements

Movements post stock (\`PRD-STK-002\`).

## 2. Counts

Counts create stock (\`PRD-STK-001\`). Movements are in section 1.

### 2.1 Count review

The Owner reviews the count (\`POL-01.01\`).

## 3. Open questions

| Code | Question | Decides |
| --- | --- | --- |
| SL-1 | Who prepares a count? (\`POL-01.02\`) | KDPS Owner |
`,
  'docs/design/module-map.md': `# Module map

<!-- deps: none — title -->
Synthetic map.

## 1. Stock module

The stock module posts movements as stock-ledger 2.1 says.
`,
};

const DEC_003 = (title: string, choice: string, changed: string) => `
## DEC-003 — ${title}

- **Date:** 2026-10-02
- **Question.** Synthetic question.
- **Options.** One; two.
- **Choice.** ${choice}
- **Changed.** ${changed}
`;

type Run = { code: number; out: string };

class Fixture {
  dir = mkdtempSync(join(tmpdir(), 'doc-check-test-'));

  constructor(files: Record<string, string> = BASE) {
    for (const [path, text] of Object.entries(files)) this.write(path, text);
    this.git('init', '-q', '-b', 'main');
  }

  write(path: string, text: string): void {
    mkdirSync(dirname(join(this.dir, path)), { recursive: true });
    writeFileSync(join(this.dir, path), text);
  }

  read(path: string): string {
    return readFileSync(join(this.dir, path), 'utf8');
  }

  edit(path: string, from: string | RegExp, to: string): void {
    const text = this.read(path);
    const next = text.replace(from, to);
    assert.notEqual(next, text, `edit of ${path} changed nothing`);
    this.write(path, next);
  }

  git(...args: string[]): string {
    return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: this.dir, encoding: 'utf8', env: ENV });
  }

  commit(message = 'synthetic'): void {
    this.git('add', '-A');
    this.git('commit', '-q', '--no-verify', '-m', message);
  }

  // Stages `text` as the content of `path` without touching the working tree.
  stage(path: string, text: string): void {
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: this.dir, input: text, encoding: 'utf8', env: ENV }).trim();
    this.git('update-index', '--add', '--cacheinfo', `100644,${blob},${path}`);
  }

  run(...args: string[]): Run {
    const r = spawnSync(process.execPath, [CHECK, ...args, '--root', this.dir], { encoding: 'utf8', env: ENV });
    return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
  }

  // Records every section as baseline and commits: the starting point of most tests.
  start(): this {
    const b = this.run('baseline', '--by', 'Test', '--reason', 'Synthetic baseline');
    assert.equal(b.code, 0, b.out);
    this.commit('baseline');
    return this;
  }

  review(key: string, reason = `Synthetic review of ${key}, compared with its sources.`): void {
    const r = this.run('review', key, '--by', 'Test', '--reason', reason);
    assert.equal(r.code, 0, r.out);
  }

  done(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

function withFixture(name: string, body: (f: Fixture) => void, files?: Record<string, string>): void {
  test(name, () => {
    const f = new Fixture(files);
    try {
      body(f);
    } finally {
      f.done();
    }
  });
}

const errorsOf = (out: string) => /Doc check: (\d+) error/.exec(out)?.[1];
const staleOf = (out: string) => [...out.matchAll(/Review required: (\S+)/g)].map((m) => m[1]).sort();
const stateIn = (packet: string, key: string) => new RegExp(`## ${key.replace(/[.#]/g, '\\$&')}\\n\\nLocation: .*\\nState: (\\w+)`).exec(packet)?.[1];

// Everything a run could change: the index file, git's view of the tree, and every file.
function fingerprintOf(dir: string): string {
  const h = createHash('sha256');
  const index = join(dir, '.git', 'index');
  if (existsSync(index)) h.update(readFileSync(index));
  h.update(execFileSync('git', ['status', '--porcelain=v2', '--untracked-files=all'], { cwd: dir, env: ENV }));
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name === '.git') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(`${p}\n`).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

// ---------- valid documents ----------

withFixture('valid documents pass', (f) => {
  f.start();
  const r = f.run();
  assert.equal(r.code, 0, r.out);
  assert.equal(errorsOf(r.out), '0');
  assert.match(r.out, /0 warning/);
});

withFixture('an edited section is flagged alone and passes once reviewed', (f) => {
  f.start();
  f.edit('docs/design/stock-ledger.md', 'Movements post stock', 'Every movement posts stock');
  const r = f.run();
  assert.equal(r.code, 1);
  assert.deepEqual(staleOf(r.out), ['docs/design/stock-ledger.md#1-movements']);
  assert.match(r.out, /Baseline record only/);
  f.review('docs/design/stock-ledger.md#1-movements');
  assert.equal(f.run().code, 0);
});

// ---------- new and changed rules ----------

withFixture('a new rule with no dependents asks for the broad sweep, and the packet lists it', (f) => {
  f.start();
  f.edit('docs/prd.md', '## Words used', '- `PRD-STK-003` Stock is counted yearly.\n\n## Words used');
  f.edit('docs/decisions.md', /$/, DEC_003('Yearly count', 'Yearly (`PRD-STK-003`).', '`PRD-STK-003` added.'));
  const r = f.run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /PRD-STK-003 is new since HEAD and no gated section cites it/);
  assert.match(r.out, /broad sweep — .*PRD-STK-003/);
  assert.match(f.run('packet').out, /Rules that no section cites[\s\S]*PRD-STK-003/);
});

withFixture('a new rule without a decision entry is an error', (f) => {
  f.start();
  f.edit('docs/prd.md', '## Words used', '- `PRD-STK-003` Stock is counted yearly.\n\n## Words used');
  const r = f.run();
  assert.equal(r.code, 1);
  assert.match(r.out, /PRD-STK-003 changed with no new or edited decision entry/);
});

withFixture('a cited new rule gives no coverage warning', (f) => {
  f.start();
  f.edit('docs/prd.md', '## Words used', '- `PRD-WRD-002` Store means a shop.\n\n## Words used');
  f.edit('docs/decisions.md', /$/, DEC_003('Store', 'Store (`PRD-WRD-002`).', '`PRD-WRD-002` added.'));
  f.edit('docs/design/module-map.md', 'posts movements', 'posts movements for each Store (`PRD-WRD-002`)');
  const r = f.run();
  assert.doesNotMatch(r.out, /no gated section cites it/);
  assert.doesNotMatch(r.out, /broad sweep/); // WRD is not a stock, money or access prefix
});

withFixture('coverage lists rules that no section cites itself', (f) => {
  const r = f.run('coverage');
  assert.equal(r.code, 0);
  assert.match(r.out, /1 of 3 PRD bullets, 2 of 4 policy bullets/);
  assert.match(r.out, /PRD-WRD: 001/);
  assert.match(r.out, /POL-02: 01\n {2}POL-03: 01/);
});

// ---------- dependencies: one hop, decisions ----------

withFixture('a changed rule flags the sections that cite it and, one hop away, the sections that point at them', (f) => {
  f.start();
  f.edit('docs/kdps-policies.md', 'The Owner approves.', 'The Owner approves in writing.');
  f.edit('docs/decisions.md', /$/, DEC_003('Approval in writing', 'In writing (`POL-01.01`).', '`POL-01.01`.'));
  const r = f.run();
  assert.deepEqual(staleOf(r.out), ['docs/design/module-map.md#1-stock-module', 'docs/design/stock-ledger.md#21-count-review']);
  assert.match(r.out, /POL-01\.01 \(via 21-count-review\): rule text changed/);
  const i = f.run('impact', 'POL-01.01');
  assert.match(i.out, /Impact of POL-01\.01: 2 section\(s\)/);
});

withFixture('the checker follows one hop, not two', (f) => {
  f.edit('docs/design/stock-ledger.md', '## 3. Open questions', '## 4. Uses\n\nSee module-map 1 (`PRD-STK-002`).\n\n## 3. Open questions');
  f.start();
  const l = f.run('list', '4-uses');
  assert.match(l.out, /<1-stock-module|PRD-STK-002/);
  assert.doesNotMatch(l.out, /POL-01\.01/); // module-map 1 reaches POL-01.01 only through stock-ledger 2.1
});

withFixture('editing a decision entry flags the sections that cite the entry, not those that cite only its rules', (f) => {
  f.edit('docs/design/module-map.md', 'says.', 'says (DEC-002).');
  f.start();
  f.edit('docs/decisions.md', 'Synthetic test entry.', 'Synthetic test entry, reworded.');
  const r = f.run();
  assert.deepEqual(staleOf(r.out), ['docs/design/module-map.md#1-stock-module']);
  assert.match(r.out, /DEC-002: decision entry changed/);
});

withFixture('impact predicts exactly what a new decision flags', (f) => {
  f.start();
  const predicted = [...f.run('impact', 'PRD-STK-001').out.matchAll(/^ {2}(\S+)/gm)].map((m) => m[1]);
  f.edit('docs/decisions.md', /$/, DEC_003('Counts again', 'Counts by section (`PRD-STK-001`).', 'No PRD or policy bullet changed.'));
  const stale = staleOf(f.run().out).map((k) => k.split('#')[1]);
  assert.deepEqual(predicted.sort(), stale.sort());
});

// ---------- missing and ambiguous references ----------

withFixture('a pointer to a missing section of another document is reported', (f) => {
  f.edit('docs/design/module-map.md', 'stock-ledger 2.1 says', 'stock-ledger 9.9 says');
  const r = f.run();
  assert.match(r.out, /"stock-ledger 9\.9" points at section 9\.9 of docs\/design\/stock-ledger\.md, which has no section numbered 9\.9/);
});

withFixture('a bare decimal that is not a section stays silent', (f) => {
  f.edit('docs/design/stock-ledger.md', 'Movements are in section 1.', 'Contrast is 4.5 to 1. Movements are in section 1.');
  f.start();
  assert.equal(f.run().code, 0);
});

withFixture('a pointer to a name two documents share is ambiguous', (f) => {
  f.write('docs/design/README.md', '# Design\n\n<!-- deps: none — index -->\nIndex.\n');
  f.write('docs/README.md', '# Docs\n\nIndex.\n');
  f.edit('docs/design/module-map.md', 'as stock-ledger 2.1 says', 'as README.md section 2 says');
  assert.match(f.run().out, /"README\.md section 2" is ambiguous/);
});

withFixture('two sections with the same number are reported', (f) => {
  f.edit('docs/design/stock-ledger.md', '## 3. Open questions', '## 2. Open questions');
  assert.match(f.run().out, /Two sections are numbered 2/);
});

withFixture('a pointer inside backticks is an example', (f) => {
  f.edit('docs/design/module-map.md', 'as stock-ledger 2.1 says', 'as `stock-ledger 9.9` shows by format (`PRD-STK-002`)');
  f.start();
  const l = f.run('list', 'module-map.md#1-stock-module');
  assert.doesNotMatch(l.out, /9\.9|POL-01\.01/);
  assert.equal(f.run().code, 0);
});

withFixture('a range of whole policies cites the policies between', (f) => {
  f.edit('docs/design/module-map.md', 'says.', 'says, under `POL-01`–`POL-03`.');
  f.start();
  assert.match(f.run('list', 'module-map.md#1-stock-module').out, /POL-02/);
});

withFixture('a design header lists every ID its sections cite, unless a section is marked', (f) => {
  f.write('docs/design/flows.md', '# Flows\n\n- PRD IDs: `PRD-STK-001`.\n\n## 1. Counting\n\nCounts (`PRD-STK-001`, `PRD-STK-002`).\n');
  assert.match(f.run().out, /docs\/design\/flows\.md:3 — 1 ID\(s\) cited in the sections are missing from the header lists[\s\S]*PRD-STK-002 \(1-counting\)/);
  f.edit('docs/design/flows.md', 'Counts (', '<!-- header: not listed — synthetic ownership table -->\nCounts (');
  assert.doesNotMatch(f.run().out, /missing from the header lists/);
});

// ---------- retired rules and removed decisions ----------

withFixture('a rule that becomes retired flags the sections that cite it', (f) => {
  f.start();
  f.edit('docs/prd.md', '- `PRD-STK-002` Stock moves by movements.\n', '');
  f.edit('docs/prd.md', '`PRD-STK-009` (DEC-001)', '`PRD-STK-009` (DEC-001), `PRD-STK-002` (DEC-003)');
  f.edit('docs/decisions.md', /$/, DEC_003('Retire PRD-STK-002', 'Retire `PRD-STK-002`.', '`PRD-STK-002` retired.'));
  const r = f.run();
  assert.match(r.out, /PRD-STK-002: rule retired \(DEC-003\); cite what replaced it/);
  assert.doesNotMatch(r.out, /was removed but is not listed/);
});

withFixture('a retired ID cannot come back', (f) => {
  f.start();
  f.edit('docs/prd.md', '> - Retired IDs: `PRD-STK-009` (DEC-001).', '> - Retired IDs: none.');
  assert.match(f.run().out, /docs\/prd\.md — PRD-STK-009 was retired at HEAD and is no longer listed as retired/);
});

withFixture('a removed decision entry is reported', (f) => {
  f.start();
  f.edit('docs/decisions.md', /\n## DEC-002[\s\S]*$/, '\n');
  assert.match(f.run().out, /DEC-002 existed at HEAD and is gone/);
});

withFixture('an explicit base that does not exist is an error, not a skip', (f) => {
  f.start();
  const r = f.run('--base', '0000000000000000000000000000000000000000');
  assert.equal(r.code, 1);
  assert.match(r.out, /Git base not found, so the decision log cannot be checked/);
});

// ---------- review records ----------

withFixture('a duplicated record from a merge is reported and blocks writes', (f) => {
  f.start();
  const text = f.read('docs/reviews.json');
  const block = /( {4}"docs\/design\/module-map\.md#1-stock-module": \{[\s\S]*?\n {4}\},?\n)/.exec(text)![1];
  f.write('docs/reviews.json', text.replace(block, block + block.replace(/\},?\n$/, '},\n')));
  assert.match(f.run().out, /not in the form the checker writes/);
  assert.equal(f.run('review', 'docs/design/module-map.md#1-stock-module', '--by', 'T', '--reason', 'R').code, 2);
});

withFixture('a record with an empty reason is reported', (f) => {
  f.start();
  f.edit('docs/reviews.json', '"reason": "Synthetic baseline"', '"reason": ""');
  assert.match(f.run().out, /"reason" is empty/);
});

withFixture('a renamed section names its likely new key', (f) => {
  f.start();
  f.edit('docs/design/module-map.md', '## 1. Stock module', '## 1. The stock module');
  assert.match(f.run().out, /Record for docs\/design\/module-map.md#1-stock-module, which no longer exists\. It may now be docs\/design\/module-map.md#1-the-stock-module/);
});

// ---------- packet and record ----------

withFixture('packet waits for the deterministic errors, then is not sent twice', (f) => {
  f.start();
  f.edit('docs/design/stock-ledger.md', 'Movements post stock', 'Every movement posts stock');
  f.edit('docs/design/module-map.md', 'stock-ledger 2.1 says', 'stock-ledger 9.9 says');
  const out = join(f.dir, '..', `${f.dir.split('/').pop()}-packet.md`);
  const blocked = f.run('packet', '--out', out);
  assert.equal(blocked.code, 1);
  assert.match(blocked.out, /No packet written/);
  f.edit('docs/design/module-map.md', 'stock-ledger 9.9 says', 'stock-ledger 2.1 says');
  assert.match(f.run('packet', '--out', out).out, /Wrote 1 section/);
  assert.match(f.run('packet', '--out', out).out, /Nothing new to review/);
  assert.match(f.run('packet', '--out', out, '--all').out, /Wrote 1 section/);
  f.edit('docs/design/stock-ledger.md', 'Every movement', 'Each movement');
  assert.match(f.run('packet', '--out', out).out, /Wrote 1 section/);
  rmSync(out, { force: true });
});

withFixture('packet --split covers every stale section once', (f) => {
  f.start();
  f.edit('docs/kdps-policies.md', 'The Owner approves.', 'The Owner approves in writing.');
  f.edit('docs/decisions.md', /$/, DEC_003('Approval in writing', 'In writing (`POL-01.01`).', '`POL-01.01`.'));
  f.edit('docs/design/stock-ledger.md', 'Movements post stock', 'Every movement posts stock');
  const out = join(f.dir, '..', `${f.dir.split('/').pop()}-split.md`);
  const r = f.run('packet', '--out', out, '--split', '2');
  assert.match(r.out, /Wrote 3 section/);
  const parts = [1, 2].map((k) => readFileSync(out.replace(/\.md$/, `-${k}.md`), 'utf8'));
  const keys = parts.flatMap((p) => [...p.matchAll(/^## (\S+#\S+)$/gm)].map((m) => m[1])).sort();
  assert.deepEqual(keys, staleOf(f.run().out));
  for (const k of [1, 2]) rmSync(out.replace(/\.md$/, `-${k}.md`), { force: true });
});

withFixture('record keeps a verdict only for the state the reviewer read, with its own reason', (f) => {
  f.start();
  f.edit('docs/kdps-policies.md', 'The Owner approves.', 'The Owner approves in writing.');
  f.edit('docs/decisions.md', /$/, DEC_003('Approval in writing', 'In writing (`POL-01.01`).', '`POL-01.01`.'));
  const out = join(f.dir, '..', `${f.dir.split('/').pop()}-rec.md`);
  f.run('packet', '--out', out);
  const packet = readFileSync(out, 'utf8');
  const mm = 'docs/design/module-map.md#1-stock-module';
  const sl = 'docs/design/stock-ledger.md#21-count-review';
  const v1 = join(f.dir, '..', `${f.dir.split('/').pop()}-v1.tsv`);
  const v2 = join(f.dir, '..', `${f.dir.split('/').pop()}-v2.tsv`);
  const same = 'Compared with POL-01.01 as reworded; the section still holds in full.';
  writeFileSync(v1, `${mm}\t${stateIn(packet, mm)}\t${same}\n`);
  writeFileSync(v2, `${sl}\t${stateIn(packet, sl)}\t${same}\n`);
  const dup = f.run('record', v1, v2, '--by', 'Test');
  assert.equal(dup.code, 1);
  assert.match(dup.out, /Recorded 0[\s\S]*same reason is given for another section/);
  writeFileSync(v2, `${sl}\tdeadbeef0000\tCompared the count review with POL-01.01 in writing; it holds.\n`);
  assert.match(f.run('record', v2, '--by', 'Test').out, /changed since the review/);
  writeFileSync(v2, `${sl}\t${stateIn(packet, sl)}\tLooks fine.\n`);
  assert.match(f.run('record', v2, '--by', 'Test').out, /too short/);
  writeFileSync(v2, `${sl}\t${stateIn(packet, sl)}\tCompared the count review with POL-01.01 in writing; it holds.\n`);
  assert.match(f.run('record', v1, v2, '--by', 'Test').out, /Recorded 2 review/);
  f.edit('docs/design/module-map.md', 'posts movements', 'posts every movement');
  assert.equal(f.run('review', mm, '--by', 'Test', '--reason', 'Compared again after the edit.', '--state', stateIn(packet, mm)!).code, 2);
  writeFileSync(v1, `${mm}\t${/State: (\w+)/.exec(f.run('packet', '--all').out)![1]}\t${same}\n`);
  assert.match(f.run('record', v1, '--by', 'Test').out, /repeats the previous record word for word/);
  for (const p of [out, v1, v2]) rmSync(p, { force: true });
});

// ---------- the staged snapshot ----------

withFixture('--staged checks the staged files, not the working tree', (f) => {
  f.start();
  f.edit('docs/design/module-map.md', 'stock-ledger 2.1', 'stock-ledger 9.9');
  assert.equal(f.run().code, 1);
  assert.equal(f.run('--staged').code, 0);
  f.git('add', '-A');
  assert.equal(f.run('--staged').code, 1);
  // Staged wrong, working tree right: the staged copy decides.
  f.edit('docs/design/module-map.md', 'stock-ledger 9.9', 'stock-ledger 2.1');
  assert.equal(f.run().code, 0);
  assert.equal(f.run('--staged').code, 1);
});

withFixture('--staged sees a partly staged file as staged', (f) => {
  f.start();
  const text = f.read('docs/design/module-map.md');
  const broken = text.replace('stock-ledger 2.1', 'stock-ledger 9.9');
  const both = `${broken}\nA second, unstaged paragraph.\n`;
  f.write('docs/design/module-map.md', both); // working tree: both hunks
  f.stage('docs/design/module-map.md', `${text}\nA second, unstaged paragraph.\n`); // index: only the harmless hunk
  const ok = f.run('--staged');
  assert.equal(errorsOf(ok.out), '1', ok.out); // the harmless hunk changes the section: one review required
  assert.doesNotMatch(ok.out, /9\.9/);
  f.stage('docs/design/module-map.md', broken); // index: only the broken hunk
  assert.match(f.run('--staged').out, /"stock-ledger 9\.9" points at section 9\.9/);
});

withFixture('--staged sees staged additions and ignores unstaged ones', (f) => {
  f.start();
  f.write('docs/design/flows.md', '# Flows\n\n<!-- deps: none — title -->\nSynthetic.\n\n## 1. Counting\n\nCounts (`PRD-STK-001`).\n');
  assert.equal(f.run('--staged').code, 0); // untracked: not in the snapshot
  f.git('add', 'docs/design/flows.md');
  assert.deepEqual(staleOf(f.run('--staged').out), ['docs/design/flows.md#1-counting', 'docs/design/flows.md#top']);
});

withFixture('--staged sees staged deletions and ignores unstaged ones', (f) => {
  f.start();
  rmSync(join(f.dir, 'docs/design/module-map.md'));
  assert.match(f.run().out, /Record for docs\/design\/module-map.md#1-stock-module, which no longer exists/);
  assert.equal(f.run('--staged').code, 0); // deleted only in the working tree
  f.git('rm', '-q', '--cached', 'docs/design/module-map.md');
  assert.match(f.run('--staged').out, /Record for docs\/design\/module-map.md#1-stock-module, which no longer exists/);
});

withFixture('--staged sees a staged rename', (f) => {
  f.start();
  f.git('mv', 'docs/design/module-map.md', 'docs/design/modules.md');
  const r = f.run('--staged');
  assert.match(r.out, /Record for docs\/design\/module-map.md#1-stock-module, which no longer exists\. It may now be docs\/design\/modules.md#1-stock-module/);
  assert.deepEqual(staleOf(r.out), ['docs/design/modules.md#1-stock-module', 'docs/design/modules.md#top']);
});

withFixture('--staged leaves the index and the working tree as they were', (f) => {
  f.start();
  f.write('docs/design/module-map.md', f.read('docs/design/module-map.md').replace('says.', 'says, in full.'));
  f.stage('docs/design/stock-ledger.md', f.read('docs/design/stock-ledger.md').replace('Synthetic design.', 'Synthetic design, staged.'));
  f.write('docs/design/untracked.md', '# Untracked\n');
  const before = fingerprintOf(f.dir);
  f.run('--staged');
  f.run('list', '--staged');
  assert.equal(fingerprintOf(f.dir), before);
  assert.equal(f.run('review', 'docs/design/module-map.md#1-stock-module', '--by', 'T', '--reason', 'Never recorded from a snapshot.', '--staged').code, 2);
});

withFixture('--staged runs the staged checker', (f) => {
  mkdirSync(join(f.dir, 'tools/doc-check'), { recursive: true });
  copyFileSync(CHECK, join(f.dir, 'tools/doc-check/check.mts'));
  f.start();
  const own = f.read('tools/doc-check/check.mts');
  f.stage('tools/doc-check/check.mts', `console.log('STAGED CHECKER');\n${own}`);
  const local = join(f.dir, 'tools/doc-check/check.mts');
  const r = spawnSync(process.execPath, [local, '--staged'], { encoding: 'utf8', env: ENV });
  assert.match(r.stdout, /STAGED CHECKER/);
  assert.match(r.stdout, /Doc check: 0 error/);
});

withFixture('the hook result on the staged snapshot equals the CI result on the commit', (f) => {
  f.start();
  const ci = (sha: string) => {
    const clone = mkdtempSync(join(tmpdir(), 'doc-check-ci-'));
    try {
      execFileSync('git', ['clone', '-q', f.dir, clone], { env: ENV });
      execFileSync('git', ['checkout', '-q', sha], { cwd: clone, env: ENV });
      const r = spawnSync(process.execPath, [CHECK, '--root', clone, '--base', `${sha}~1`], { encoding: 'utf8', env: ENV });
      return { code: r.status, out: r.stdout.replace(clone, '<root>') };
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }
  };
  const lines = (out: string) => out.split('\n').filter((l) => /^ {2}\S| {6}\S|Doc check:/.test(l));
  // A failing commit: a staged edit nobody reviewed, plus an unstaged edit that must not count.
  f.edit('docs/design/stock-ledger.md', 'Movements post stock', 'Every movement posts stock');
  f.git('add', 'docs/design/stock-ledger.md');
  f.edit('docs/design/module-map.md', 'stock-ledger 2.1', 'stock-ledger 9.9');
  const hook = f.run('--staged');
  f.git('commit', '-q', '--no-verify', '-m', 'unreviewed edit');
  const c = ci(f.git('rev-parse', 'HEAD').trim());
  assert.equal(hook.code, 1);
  assert.equal(c.code, hook.code);
  assert.deepEqual(lines(c.out), lines(hook.out));
  // A passing commit: the review recorded and staged; the unstaged edit still left out.
  f.review('docs/design/stock-ledger.md#1-movements');
  f.git('add', 'docs/reviews.json');
  const hook2 = f.run('--staged');
  f.git('commit', '-q', '--no-verify', '-m', 'reviewed');
  const c2 = ci(f.git('rev-parse', 'HEAD').trim());
  assert.equal(hook2.code, 0, hook2.out);
  assert.equal(c2.code, 0, c2.out);
  assert.deepEqual(lines(c2.out), lines(hook2.out));
});

withFixture('the pre-commit hook blocks what is staged, not what is in the working tree', (f) => {
  const repo = join(dirname(CHECK), '../..');
  mkdirSync(join(f.dir, 'tools/doc-check'), { recursive: true });
  mkdirSync(join(f.dir, '.githooks'), { recursive: true });
  copyFileSync(CHECK, join(f.dir, 'tools/doc-check/check.mts'));
  copyFileSync(join(repo, '.githooks/pre-commit'), join(f.dir, '.githooks/pre-commit'));
  f.start();
  f.git('config', 'core.hooksPath', '.githooks');
  const commit = (m: string) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', m], { cwd: f.dir, encoding: 'utf8', env: ENV });
  f.edit('docs/design/module-map.md', 'stock-ledger 2.1', 'stock-ledger 9.9'); // unstaged and broken
  f.write('AGENTS.md', `${f.read('AGENTS.md')}More synthetic text.\n`);
  f.git('add', 'AGENTS.md');
  assert.notEqual(commit('unreviewed').status, 0); // AGENTS.md#top changed and is not reviewed
  f.review('AGENTS.md#top');
  f.git('add', 'docs/reviews.json');
  const ok = commit('reviewed');
  assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);
  assert.match(f.git('status', '--porcelain'), /M docs\/design\/module-map\.md/); // still only in the working tree
});

withFixture('git variables from an outer hook do not leak into the synthetic repositories', (f) => {
  f.start();
  const before = fingerprintOf(f.dir);
  const index = join(f.dir, '.git', 'index');
  const r = spawnSync(process.execPath, [CHECK, 'list', 'module-map'], { encoding: 'utf8', env: { ...ENV, GIT_DIR: join(f.dir, '.git'), GIT_INDEX_FILE: index } });
  assert.equal(r.status, 0, r.stderr);
  const inner = new Fixture(); // what a test does while GIT_* would be set, if ENV did not strip them
  try {
    process.env.GIT_DIR = join(f.dir, '.git');
    process.env.GIT_INDEX_FILE = index;
    inner.start();
  } finally {
    delete process.env.GIT_DIR;
    delete process.env.GIT_INDEX_FILE;
    inner.done();
  }
  assert.equal(fingerprintOf(f.dir), before);
});

// ---------- the real repository ----------

test('the real documents still parse', () => {
  const r = spawnSync(process.execPath, [CHECK, 'list', 'stock-ledger.md#1-'], { encoding: 'utf8', env: ENV });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /docs\/design\/stock\/stock-ledger\.md#1-what-the-ledger-is/);
});
