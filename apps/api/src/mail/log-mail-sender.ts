import { Injectable, Logger } from '@nestjs/common';
import { MailSender, type Mail } from './mail-sender.js';

/** Local "mail catcher": writes the mail to the log so links can be copied during development. */
@Injectable()
export class LogMailSender extends MailSender {
  private readonly logger = new Logger('Mail');

  async send(mail: Mail): Promise<void> {
    this.logger.log(`To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`);
  }
}
