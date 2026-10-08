import type { LoggerService } from '@nestjs/common';
import { requestContext } from './request-context.js';

type Level = 'verbose' | 'debug' | 'log' | 'warn' | 'error' | 'fatal';

const RANK: Record<Level, number> = { verbose: 0, debug: 1, log: 2, warn: 3, error: 4, fatal: 5 };
const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[redacted]' : redact(item, depth + 1)]),
  );
}

/** Structured logger behind the NestJS logger interface: one JSON object per line, ids from the request context. */
export class JsonLogger implements LoggerService {
  constructor(
    private readonly minLevel: Exclude<Level, 'fatal'> = 'log',
    private readonly write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
  ) {}

  log(message: unknown, context?: string) {
    this.emit('log', message, context);
  }
  warn(message: unknown, context?: string) {
    this.emit('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    this.emit('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    this.emit('verbose', message, context);
  }
  fatal(message: unknown, context?: string) {
    this.emit('fatal', message, context);
  }
  error(message: unknown, stack?: string, context?: string) {
    this.emit('error', message, context, stack);
  }

  private emit(level: Level, message: unknown, context?: string, stack?: string) {
    if (RANK[level] < RANK[this.minLevel]) return;
    const body = typeof message === 'object' && message !== null ? (redact(message) as object) : { message };
    this.write(
      JSON.stringify({ ...body, time: new Date().toISOString(), level, context, ...requestContext.getStore(), stack }),
    );
  }
}
