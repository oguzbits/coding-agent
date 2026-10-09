import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { ModelModule } from './model/model.module.js';

@Module({
  imports: [AppConfigModule, DatabaseModule, AuthModule, ConversationsModule, ModelModule, HealthModule, MetricsModule],
})
export class AppModule {}
