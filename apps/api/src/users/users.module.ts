import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Env } from '../config/env.validation.js';
import { KeyEncryption } from './key-encryption.js';
import { PasswordHasher } from './password-hasher.js';
import { UserSettings } from './user-settings.entity.js';
import { User } from './user.entity.js';
import { UsersController } from './users.controller.js';
import { REGISTRATION_OPEN, UsersService } from './users.service.js';

export { REGISTRATION_OPEN };

@Module({
  imports: [TypeOrmModule.forFeature([User, UserSettings])],
  controllers: [UsersController],
  providers: [
    UsersService,
    PasswordHasher,
    {
      provide: KeyEncryption,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new KeyEncryption(
          Buffer.from(config.get('MASTER_KEY', { infer: true }), 'base64'),
          config.get('MASTER_KEY_VERSION', { infer: true }),
        ),
    },
    {
      provide: REGISTRATION_OPEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => config.get('REGISTRATION_OPEN', { infer: true }),
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
