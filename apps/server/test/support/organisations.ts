import { SYNTHETIC_ORGANISATIONS, type SyntheticOrganisation } from '../fixtures/synthetic.js';
import { createTestDatabase, dropDatabase } from './postgres.js';

export interface SyntheticOrganisationDatabase extends SyntheticOrganisation {
  /** The Organisation's own database, a copy of the Organisation template. */
  readonly database: string;
}

/** The databases one test file works in: a directory and the two synthetic Organisations. */
export interface SyntheticWorld {
  readonly directory: string;
  readonly organisations: readonly [SyntheticOrganisationDatabase, SyntheticOrganisationDatabase];
  /** Drops every database of this world. Call it at the end of the test file. */
  reset(): Promise<void>;
}

/**
 * Creates a directory database and the two synthetic Organisations, each with its own database, for one test file,
 * so that every database test can show one Organisation not seeing the other (code-house-rules 11.2; deployment.md
 * section 4; PRD-MOD-001, PRD-ACS-020). Every database is a copy of the run's migrated template (11.3).
 *
 * The fewest rows they need are written directly until the real interfaces exist (11.2). Today that is none: no
 * migration has a business table yet. Organisation routing (S1-F01-T02) adds the directory table; this helper then
 * writes each Organisation's directory row. The setup step (S1-F01-T10) then replaces those direct writes, so the
 * Organisations obey the same rules as a real one (PRD-ACS-023).
 */
export async function createSyntheticOrganisations(label: string): Promise<SyntheticWorld> {
  const created: string[] = [];
  const make = async (set: 'directory' | 'organisation', suffix: string): Promise<string> => {
    const name = await createTestDatabase(set, `${label}_${suffix}`);
    created.push(name);
    return name;
  };
  const reset = async (): Promise<void> => {
    for (const name of created.splice(0)) await dropDatabase(name);
  };

  try {
    const directory = await make('directory', 'dir');
    const [first, second] = SYNTHETIC_ORGANISATIONS;
    const organisations = [
      { ...first, database: await make('organisation', 'org_a') },
      { ...second, database: await make('organisation', 'org_b') },
    ] as const;
    return { directory, organisations, reset };
  } catch (error) {
    await reset();
    throw error;
  }
}
