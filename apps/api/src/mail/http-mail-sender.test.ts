import { HttpMailSender } from './http-mail-sender.js';

const mail = { to: 'a@example.com', subject: 'Confirm', text: 'Open https://app.example/confirm?token=SECRET' };

describe('HttpMailSender', () => {
  it('posts the mail to the provider with the key as bearer token', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    await new HttpMailSender('re_key_12345', 'Agent <agent@example.com>', fetchFn).send(mail);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_key_12345');
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'Agent <agent@example.com>',
      to: ['a@example.com'],
      subject: 'Confirm',
      text: mail.text,
    });
  });

  it('fails with the status only, so neither key nor mail text reach the log', async () => {
    const fetchFn = vi.fn(async () => new Response('bad token SECRET re_key_12345', { status: 401 }));
    const sending = new HttpMailSender('re_key_12345', 'agent@example.com', fetchFn).send(mail);
    await expect(sending).rejects.toThrow('Mail provider answered 401');
    await expect(sending).rejects.not.toThrow(/SECRET|re_key/);
  });

  it('gives up after the time limit instead of hanging', async () => {
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const sender = new HttpMailSender('re_key_12345', 'agent@example.com', fetchFn as typeof fetch, 20);
    await expect(sender.send(mail)).rejects.toThrow('aborted');
  });
});
