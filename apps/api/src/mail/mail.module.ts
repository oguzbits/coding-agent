import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { HttpMailSender } from './http-mail-sender.js';
import { LogMailSender } from './log-mail-sender.js';
import { MailSender } from './mail-sender.js';

@Module({
  providers: [
    {
      provide: MailSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const apiKey = config.get('MAIL_API_KEY', { infer: true });
        const from = config.get('MAIL_FROM', { infer: true });
        if (apiKey && from) return new HttpMailSender(apiKey, from);
        return new LogMailSender(config.get('NODE_ENV', { infer: true }) === 'production');
      },
    },
  ],
  exports: [MailSender],
})
export class MailModule {}
