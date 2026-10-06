import type { LoggerService } from '@nestjs/common';
import { pino, type Logger } from 'pino';

// Never write these keys. Pino replaces their values in structured log objects.
const REDACTED_KEYS = ['password', 'token', 'secret', 'authorization', 'cookie'];

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * A logger that writes named fields of their own on a line, such as the correlation identifier
 * (code-house-rules 12.11). Fields hold identifiers and codes only, never a secret, a restricted value or a body.
 */
export interface StructuredLogger {
  structured(level: LogLevel, fields: Readonly<Record<string, unknown>>, message: string, context: string): void;
}

/** Nest logger that writes one JSON object per line to stdout. */
export class PinoLoggerService implements LoggerService, StructuredLogger {
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger =
      logger ??
      pino({
        level: process.env.LOG_LEVEL ?? 'info',
        redact: { paths: REDACTED_KEYS.flatMap((key) => [key, `*.${key}`]), censor: '[redacted]' },
      });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  /** One line whose fields stand at the top level of the JSON object, beside the message and the context. */
  structured(level: LogLevel, fields: Readonly<Record<string, unknown>>, message: string, context: string): void {
    this.logger[level]({ ...fields, context }, message);
  }

  // Nest passes the context name as the last parameter and, for errors, a stack before it.
  private write(level: LogLevel, message: unknown, params: unknown[]): void {
    const last = params.at(-1);
    const context = typeof last === 'string' ? last : undefined;
    const rest = context === undefined ? params : params.slice(0, -1);
    const fields: Record<string, unknown> = {};
    if (context !== undefined) fields.context = context;
    if (level === 'error' || level === 'fatal') {
      const stack = rest.find((param): param is string => typeof param === 'string');
      if (stack !== undefined) fields.stack = stack;
    }
    if (message instanceof Error) {
      this.logger[level]({ ...fields, err: message }, message.message);
    } else if (typeof message === 'string') {
      this.logger[level](fields, message);
    } else {
      this.logger[level]({ ...fields, message });
    }
  }
}
