// Writes openapi.json from the route table (code-house-rules 12.2). Run `pnpm --filter @apparel-os/schemas
// generate:openapi` after changing a route; a unit test fails while the committed document differs.
import { writeFileSync } from 'node:fs';
import { openApiText, routes } from '../dist/index.js';

writeFileSync(new URL('../openapi.json', import.meta.url), openApiText(routes));
