import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { LogMailSender } from './log-mail-sender.js';
import { MailSender } from './mail-sender.js';

@Module({
  providers: [
    {
      provide: MailSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new LogMailSender(config.get('NODE_ENV', { infer: true }) === 'production'),
    },
  ],
  exports: [MailSender],
})
export class MailModule {}
