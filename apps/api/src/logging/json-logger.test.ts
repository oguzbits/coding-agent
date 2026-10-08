import { JsonLogger } from './json-logger.js';
import { requestContext } from './request-context.js';

function capture(level: ConstructorParameters<typeof JsonLogger>[0] = 'log') {
  const lines: Record<string, unknown>[] = [];
  const logger = new JsonLogger(level, (line) => lines.push(JSON.parse(line)));
  return { logger, lines };
}

describe('JsonLogger', () => {
  it('writes one JSON object per call with level, context and message', () => {
    const { logger, lines } = capture();
    logger.log('server started', 'Bootstrap');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'log', context: 'Bootstrap', message: 'server started' });
    expect(typeof lines[0].time).toBe('string');
  });

  it('adds the ids of the current request context to every line', () => {
    const { logger, lines } = capture();
    requestContext.run({ requestId: 'req-1', userId: 'user-1', runId: 'run-1' }, () => logger.warn('slow'));
    expect(lines[0]).toMatchObject({ requestId: 'req-1', userId: 'user-1', runId: 'run-1' });
  });

  it('leaves out ids when there is no request context', () => {
    const { logger, lines } = capture();
    logger.log('boot');
    expect(lines[0]).not.toHaveProperty('requestId');
  });

  it('redacts values of secret-looking keys in object messages, at any depth', () => {
    const { logger, lines } = capture();
    logger.log({ event: 'login', password: 'hunter2', nested: { apiKey: 'AIza-secret', Authorization: 'Bearer x' } });
    const text = JSON.stringify(lines[0]);
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('AIza-secret');
    expect(text).not.toContain('Bearer x');
    expect(lines[0]).toMatchObject({ event: 'login' });
  });

  it('skips levels below the configured one', () => {
    const { logger, lines } = capture('warn');
    logger.debug('noise');
    logger.log('info');
    logger.warn('keep');
    logger.error('keep too');
    expect(lines.map((line) => line.level)).toEqual(['warn', 'error']);
  });

  it('puts the stack of an error trace into its own field', () => {
    const { logger, lines } = capture();
    logger.error('boom', 'Error: boom\n    at x', 'Ctx');
    expect(lines[0]).toMatchObject({ level: 'error', message: 'boom', stack: 'Error: boom\n    at x', context: 'Ctx' });
  });

  it('does not let an object message overwrite level or request id', () => {
    const { logger, lines } = capture();
    requestContext.run({ requestId: 'real' }, () => logger.log({ level: 'fatal', requestId: 'spoofed' }));
    expect(lines[0]).toMatchObject({ level: 'log', requestId: 'real' });
  });
});
