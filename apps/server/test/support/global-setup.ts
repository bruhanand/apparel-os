import type { TestProject } from 'vitest/node';
import { startPostgresServer } from './postgres-server.js';

// One PostgreSQL container for the whole integration run (postgres-server.ts). Each test file clones its own databases
// in it from the run's templates (support/postgres.ts) and drops them at its end.
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const started = await startPostgresServer();
  project.provide('postgres', started.server);
  return () => started.stop();
}
