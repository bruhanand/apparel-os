import type { LoggerService } from '@nestjs/common';
import { pino, type Logger } from 'pino';

// Never write these keys. Pino replaces their values in structured log objects.
const REDACTED_KEYS = ['password', 'token', 'secret', 'authorization', 'cookie'];

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const SQLSTATE = /^[0-9A-Z]{5}$/;

/** The database error behind an error, looking through the causes a library wraps it in (such as Drizzle's). */
function databaseErrorOf(error: Error): (Error & { code: string }) | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current instanceof Error; depth += 1) {
    if ('code' in current && typeof current.code === 'string' && SQLSTATE.test(current.code)) {
      return current as Error & { code: string };
    }
    current = current.cause;
  }
  return undefined;
}

function textField(error: Error, key: 'constraint' | 'table' | 'schema'): string | undefined {
  const value = (error as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

/** Whether an error is a query wrapper, such as Drizzle's, whose message holds the query and its parameters. */
function wrapsQuery(error: Error): boolean {
  return 'query' in error || 'params' in error;
}

/**
 * What a log keeps of an error (code-house-rules 12.11; PRD-SEC-006, PRD-SEC-014). Of a database error, or one
 * wrapping it: its type, SQLSTATE, constraint, schema and table, never the database's message, detail, where, query,
 * bound parameters or stack, which can hold values. The message of the application's own wrapper, such as a failed
 * migration naming its file, is kept: the application never puts a database's words into it. Of any other error: its
 * type, message and stack.
 */
export function loggedError(error: Error): { readonly fields: Record<string, unknown>; readonly message: string } {
  const database = databaseErrorOf(error);
  if (database === undefined) {
    return { fields: { type: error.name, message: error.message, stack: error.stack }, message: error.message };
  }
  const fields: Record<string, unknown> = { type: error.constructor.name, sqlState: database.code };
  for (const key of ['constraint', 'schema', 'table'] as const) {
    const value = textField(database, key);
    if (value !== undefined) fields[key] = value;
  }
  const own = error !== database && !wrapsQuery(error);
  return { fields, message: own ? error.message : `A database error, SQLSTATE ${database.code}` };
}

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
      const logged = loggedError(message);
      this.logger[level]({ ...fields, error: logged.fields }, logged.message);
    } else if (typeof message === 'string') {
      this.logger[level](fields, message);
    } else {
      this.logger[level]({ ...fields, message });
    }
  }
}
