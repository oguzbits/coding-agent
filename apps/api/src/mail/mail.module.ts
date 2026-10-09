import { Module } from '@nestjs/common';
import { LogMailSender } from './log-mail-sender.js';
import { MailSender } from './mail-sender.js';

@Module({
  providers: [{ provide: MailSender, useClass: LogMailSender }],
  exports: [MailSender],
})
export class MailModule {}
