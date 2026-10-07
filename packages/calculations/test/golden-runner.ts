// The golden-case runner (shared-calculations 12.1, 12.2; PRD-ACP-018). Pure: it reads no file and imports no test
// framework, so the server suite and, later, the counter test page run every case through the same code. The caller
// passes the package as it imports it: the server passes both entry points, the counter only the selling one.
//
// Case file format (12.1): `id`, `title`, `synthetic: true`, `covers` (the PRD and policy IDs it proves), `function`,
// and either `input` with `expected` (the full result) or `refusal` (the refusals, each with its code and the line and
// input it names). A case whose 12.4 row runs the function more than once ("then", "both times", (a) to (c)) holds
// `runs`, each with its own `input` and `expected` or `refusal`. Three pointers keep a case from copying another's
// priced bill: `{"$pricedBill": "<case id>" | <bill input>}` is that bill priced, `{"$billReference": …}` is its
// reference (`pricedBillReference`), and `{"$billLine": {"bill": …, "line": "<line id>"}}` is one of its lines as a
// return reads it. A case named by a pointer holds every rule version it uses, so the pointing case does too. A case
// whose expected result depends on an open reading carries `pending`, the reason, and the runner reports it as
// pending, never as passed.

import type * as Selling from '@apparel-os/calculations';
import type * as Costing from '@apparel-os/calculations/costing';

export interface GoldenRun {
  readonly input: unknown;
  readonly expected?: unknown;
  readonly refusal?: unknown;
}

export interface GoldenCase extends Partial<GoldenRun> {
  readonly id: string;
  readonly title: string;
  readonly synthetic: true;
  readonly covers: readonly string[];
  readonly function: string;
  readonly runs?: readonly GoldenRun[];
  readonly pending?: string;
}

export interface GoldenApi {
  readonly selling: typeof Selling;
  /** Absent on the counter, whose bundle never holds the costing entry point (2.3). */
  readonly costing?: typeof Costing;
}

export type CaseOutcome =
  | { readonly status: 'passed' }
  | { readonly status: 'pending'; readonly reason: string }
  | { readonly status: 'server-only' }
  | { readonly status: 'failed'; readonly run: number; readonly expected: string; readonly actual: string };

const SELLING = [
  'priceBill',
  'listApplicableOffers',
  'checkTenders',
  'returnValue',
  'exchangeDifference',
  'splitRefund',
  'round',
];
/** The functions of the costing entry point, which the counter never gets (2.3). */
export const COSTING = ['costLine', 'ticketMargin'];
const ID = /^(PRD-[A-Z]{3}-\d{3}|POL-\d{2}\.\d{2}|DEC-\d{3})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The problems with a case file's shape; an empty list means it follows 12.1. */
export function caseShapeProblems(value: unknown, fileStem: string): string[] {
  if (!isRecord(value)) return ['not a JSON object'];
  const problems: string[] = [];
  if (value.id !== fileStem) problems.push(`id must equal the file name (${fileStem})`);
  if (typeof value.title !== 'string' || value.title === '') problems.push('title missing');
  if (value.synthetic !== true) problems.push('synthetic must be true');
  if (!Array.isArray(value.covers) || value.covers.length === 0) problems.push('covers must list the IDs it proves');
  else if (!value.covers.every((id) => typeof id === 'string' && ID.test(id)))
    problems.push('covers holds a malformed ID');
  if (typeof value.function !== 'string' || ![...SELLING, ...COSTING].includes(value.function)) {
    problems.push('function is not a calculation the runner knows');
  }
  const runs = Array.isArray(value.runs) ? (value.runs as unknown[]) : [value];
  if (Array.isArray(value.runs) && 'input' in value) problems.push('a case holds runs or a top-level input, not both');
  if (runs.length === 0) problems.push('runs is empty');
  runs.forEach((run, i) => {
    if (!isRecord(run) || !('input' in run)) problems.push(`run ${String(i + 1)} has no input`);
    else if ('expected' in run === 'refusal' in run && value.pending === undefined) {
      problems.push(`run ${String(i + 1)} needs exactly one of expected or refusal`);
    }
  });
  if (value.pending !== undefined && (typeof value.pending !== 'string' || value.pending === '')) {
    problems.push('pending must state its reason');
  }
  return problems;
}

const POINTERS = ['$pricedBill', '$billReference', '$billLine'];

/** Prices the bill a pointer names: another priceBill case by its ID, or a bill input given in place. */
function pricedFrom(argument: unknown, cases: ReadonlyMap<string, GoldenCase>, api: GoldenApi): Selling.PricedBill {
  let billInput: unknown = argument;
  if (typeof argument === 'string') {
    const source = cases.get(argument);
    if (source?.function !== 'priceBill' || source.input === undefined) {
      throw new Error(`${argument} is not a single-run priceBill case`);
    }
    billInput = source.input;
  }
  const priced = api.selling.priceBill(resolve(billInput, cases, api) as Selling.PriceBillInput);
  if (!priced.ok) throw new Error('A pointer priced a bill that was refused');
  return priced.value;
}

/** Replaces the `$pricedBill`, `$billReference` and `$billLine` pointers with what they stand for. */
function resolve(value: unknown, cases: ReadonlyMap<string, GoldenCase>, api: GoldenApi): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => resolve(item, cases, api));
  if (!isRecord(value)) return value;
  const keys = Object.keys(value);
  const pointer = keys.length === 1 ? keys[0] : undefined;
  if (pointer === '$pricedBill') return pricedFrom(value[pointer], cases, api);
  if (pointer === '$billReference') return api.selling.pricedBillReference(pricedFrom(value[pointer], cases, api));
  if (pointer === '$billLine') {
    // A bill line as its snapshot records it, for a return (7.1): the sold quantity and the paid value.
    const argument = value[pointer];
    if (!isRecord(argument) || typeof argument.line !== 'string') throw new Error('$billLine needs a bill and a line');
    const bill = pricedFrom(argument.bill, cases, api);
    // GC7-6: whether a bill's round-off counts in its lines' paid value is open, so no case may read a line of a
    // bill with a round-off as a return's snapshot (12.1).
    if (bill.roundOffUp !== 0 || bill.roundOffDown !== 0) throw new Error('$billLine names a bill with a round-off');
    const line = bill.lines.find((l) => l.id === argument.line);
    if (line === undefined) throw new Error(`$billLine: no line ${argument.line}`);
    return { id: line.id, soldQuantity: line.quantity, paidValue: line.amountPaid };
  }
  if (keys.some((key) => key.startsWith('$') && !POINTERS.includes(key))) throw new Error('Unknown pointer');
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, cases, api)]));
}

type AnyResult =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly refusals: readonly unknown[] };

function call(name: string, input: unknown, api: GoldenApi): AnyResult {
  const s = api.selling;
  switch (name) {
    case 'priceBill':
      return s.priceBill(input as Selling.PriceBillInput);
    case 'listApplicableOffers':
      return s.listApplicableOffers(input as Selling.ListOffersInput);
    case 'checkTenders':
      return s.checkTenders(input as Selling.CheckTendersInput);
    case 'returnValue':
      return s.returnValue(input as Selling.ReturnValueInput);
    case 'exchangeDifference':
      return s.exchangeDifference(input as Selling.ExchangeInput);
    case 'splitRefund':
      return s.splitRefund(input as Selling.SplitRefundInput);
    case 'round': {
      // CG-20a: an exact value in paise under one rounding rule.
      const { value, rule } = input as { value: string; rule: Selling.RoundingRule };
      return { ok: true, value: Number(s.roundByRule(s.parseDecimal(value), rule)) };
    }
    case 'costLine':
      if (api.costing === undefined) throw new Error('costing entry point not given');
      return api.costing.costLine(input as Costing.CostLineInput);
    case 'ticketMargin':
      if (api.costing === undefined) throw new Error('costing entry point not given');
      return api.costing.ticketMargin(input as Parameters<typeof Costing.ticketMargin>[0]);
    default:
      throw new Error(`Unknown function ${name}`);
  }
}

/** Runs one case and compares whole results exactly, versions included (12.2). */
export function runCase(goldenCase: GoldenCase, cases: ReadonlyMap<string, GoldenCase>, api: GoldenApi): CaseOutcome {
  if (goldenCase.pending !== undefined) return { status: 'pending', reason: goldenCase.pending };
  if (COSTING.includes(goldenCase.function) && api.costing === undefined) return { status: 'server-only' };
  const runs: readonly GoldenRun[] = goldenCase.runs ?? [goldenCase as GoldenRun];
  for (const [index, run] of runs.entries()) {
    const result = call(goldenCase.function, resolve(run.input, cases, api), api);
    const wanted = run.refusal === undefined ? { ok: true, value: run.expected } : { ok: false, refusals: run.refusal };
    const expected = api.selling.canonicalJson(wanted);
    const actual = api.selling.canonicalJson(result);
    if (expected !== actual) return { status: 'failed', run: index + 1, expected, actual };
  }
  return { status: 'passed' };
}
