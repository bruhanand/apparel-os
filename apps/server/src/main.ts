import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, PinoLoggerService } from './kernel/index.js';

const logger = new PinoLoggerService();
const app = await NestFactory.create(AppModule, { logger });
configureApp(app);
// On SIGTERM from a deploy, close every database pool before the process ends (OrganisationRouter).
app.enableShutdownHooks();

const port = Number(process.env.PORT ?? 3000);
await app.listen(port);
logger.log(`Listening on port ${String(port)}`, 'Bootstrap');
