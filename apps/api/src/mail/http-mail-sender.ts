import { Injectable } from '@nestjs/common';
import { MailSender, type Mail } from './mail-sender.js';

const ENDPOINT = 'https://api.resend.com/emails';

/** Sends mails through the Resend HTTP API. Errors carry the status only: the answer may echo the key or the mail text. */
@Injectable()
export class HttpMailSender extends MailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {
    super();
  }

  async send(mail: Mail): Promise<void> {
    const response = await this.fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Mail provider answered ${response.status}`);
  }
}
