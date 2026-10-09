import { Inject, MiddlewareConsumer, Module, NestModule, OnModuleDestroy, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import passport from 'passport';
import { DataSource } from 'typeorm';
import type { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver.js';
import type { Env } from '../config/env.validation.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createThrottlerOptions } from '../security/throttler.options.js';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { AccountFlowsService } from './account-flows.service.js';
import { AccountToken } from './account-token.entity.js';
import { AccountTokensService } from './account-tokens.service.js';
import { AuthSessionsService } from './auth-sessions.service.js';
import { AuthController } from './auth.controller.js';
import './express-types.js';
import { LocalStrategy } from './local.strategy.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { createSessionMiddleware, createSessionStore } from './session.middleware.js';
import { SessionSerializer } from './session.serializer.js';

const SESSION_STORE = Symbol('SESSION_STORE');
type SessionStore = ReturnType<typeof createSessionStore>;

@Module({
  imports: [
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([AccountToken]),
    PassportModule.register({ session: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createThrottlerOptions({
          defaultPerMinute: config.get('THROTTLE_DEFAULT_PER_MINUTE', { infer: true }),
          authPerMinute: config.get('THROTTLE_AUTH_PER_MINUTE', { infer: true }),
        }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    LocalStrategy,
    SessionSerializer,
    AuthSessionsService,
    AccountTokensService,
    AccountFlowsService,
    {
      provide: SESSION_STORE,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => createSessionStore((dataSource.driver as PostgresDriver).master),
    },
    // Order matters: the throttler also protects the login itself, before the session guard looks at the user.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
  ],
})
export class AuthModule implements NestModule, OnModuleDestroy {
  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(SESSION_STORE) private readonly store: SessionStore,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    const env = {
      SESSION_SECRET: this.config.get('SESSION_SECRET', { infer: true }),
      SESSION_IDLE_MINUTES: this.config.get('SESSION_IDLE_MINUTES', { infer: true }),
      COOKIE_SECURE: this.config.get('COOKIE_SECURE', { infer: true }),
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
    };
    consumer
      .apply(createSessionMiddleware(env, this.store), passport.initialize(), passport.session())
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }

  onModuleDestroy() {
    this.store.close();
  }
}
