import { NestFactory } from '@nestjs/core';
import { LOGGER, WORKER, type PinoLoggerService, type Worker } from './kernel/index.js';
import { WorkerModule } from './worker.module.js';

// The worker's start command: the same build as the app (deployment.md section 2; code-house-rules 12.9). It serves
// no route; it runs pg-boss and the outbox processor in each Organisation database the directory lists.
const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
const logger = app.get<PinoLoggerService>(LOGGER);
app.useLogger(logger);
// On SIGTERM from a deploy, stop taking jobs, let the running ones end, then close every database pool.
app.enableShutdownHooks();
await app.get<Worker>(WORKER).start();
logger.log('The worker is running', 'Bootstrap');
