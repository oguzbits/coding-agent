import { Injectable, Logger } from '@nestjs/common';
import { MailSender, type Mail } from './mail-sender.js';

/**
 * Local "mail catcher": writes the mail to the log so links can be copied during development.
 * In production the body stays out of the log, because it holds reset and confirmation links (credentials).
 */
@Injectable()
export class LogMailSender extends MailSender {
  private readonly logger = new Logger('Mail');

  constructor(private readonly production = false) {
    super();
  }

  async send(mail: Mail): Promise<void> {
    if (this.production) {
      this.logger.warn(`No mail provider configured; not sent. To: ${mail.to}\nSubject: ${mail.subject}`);
      return;
    }
    this.logger.log(`To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`);
  }
}
