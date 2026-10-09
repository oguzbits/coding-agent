import { Logger } from '@nestjs/common';
import { LogMailSender } from './log-mail-sender.js';

const mail = {
  to: 'a@example.com',
  subject: 'Reset your password',
  text: 'Open https://app.example/reset?token=SECRET',
};

describe('LogMailSender', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes the whole mail to the log in development, so the link can be copied', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    await new LogMailSender(false).send(mail);
    expect(String(log.mock.calls[0]?.[0])).toContain('token=SECRET');
  });

  it('keeps links and tokens out of the log in production', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    await new LogMailSender(true).send(mail);
    const written = [...log.mock.calls, ...warn.mock.calls].map((call) => String(call[0])).join('\n');
    expect(written).not.toContain('SECRET');
    expect(written).toContain('a@example.com');
  });
});
