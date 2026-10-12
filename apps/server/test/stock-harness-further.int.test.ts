import { afterAll, describe, expect, it } from 'vitest';
import { StockHarness } from './harness/stock/harness.js';
import { FURTHER_FOLDER, loadScenarios, runScenario } from './harness/stock/scenario.js';

// S1-F10-T06: the further golden scenarios G2 to G13 with G10a (stock-ledger 11.8; S1-F10 spec 3.5, 3.7) and the
// posting scenarios P2 to P5 of books-and-posting 16.4, each a scenario file run through the synthetic document driver
// in a world of its own: its own copies of the migrated template databases (code-house-rules 11.3), the two synthetic
// Organisations and fixtures made through the real modules (S1-F10 spec 3.3), with the checks of 11.7 and 16.5 after
// every command. G10b waits for the rounding rule (RR-124). Every value is SYNTHETIC; every expected value is in the
// scenario file, written by hand.

const worlds: StockHarness[] = [];

afterAll(async () => {
  for (const world of worlds) await world.stop();
});

const scenarios = loadScenarios(FURTHER_FOLDER);

describe('the further scenarios (stock-ledger 11.8; books-and-posting 16.4)', () => {
  it('labels every scenario file synthetic', () => {
    expect(scenarios.length).toBeGreaterThan(0);
    for (const { scenario } of scenarios) expect(scenario.synthetic).toBe(true);
  });

  it.each(scenarios.map(({ file, scenario }) => [scenario.id, file, scenario] as const))(
    '%s (%s) posts each step as written, with the checks of 11.7 and 16.5',
    async (_id, _file, scenario) => {
      const world = new StockHarness();
      worlds.push(world);
      await world.start('further');
      await runScenario(world, scenario);
    },
    600_000,
  );
});
