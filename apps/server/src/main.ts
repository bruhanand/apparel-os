import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, LOGGER, serveWebApp, type PinoLoggerService } from './kernel/index.js';

// Nest's own lines wait until the application's one logger is in place (code-house-rules 12.11).
const app = await NestFactory.create(AppModule, { bufferLogs: true });
const logger = app.get<PinoLoggerService>(LOGGER);
app.useLogger(logger);
configureApp(app);
// The web app from the same origin as the API (deployment.md section 3): apps/web/dist, which `pnpm build` makes beside
// this package's dist. The server refuses to start without it.
serveWebApp(app, fileURLToPath(new URL('../../web/dist', import.meta.url)));
// On SIGTERM from a deploy, close every database pool before the process ends (OrganisationRouter).
app.enableShutdownHooks();

const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
logger.log(`Listening on port ${String(port)}`, 'Bootstrap');
