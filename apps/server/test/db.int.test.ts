import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DatabaseHandle } from '../src/kernel/index.js';

// Starts a real PostgreSQL in Docker. Run with: pnpm test:integration
describe('createDb', () => {
  let container: StartedPostgreSqlContainer;
  let handle: DatabaseHandle;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    handle = createDb(container.getConnectionUri());
  });

  afterAll(async () => {
    await handle.close();
    await container.stop();
  });

  it('connects and answers select 1', async () => {
    const result = await handle.db.execute<{ one: number }>(sql`select 1 as one`);
    expect(result.rows[0]?.one).toBe(1);
  });
});
