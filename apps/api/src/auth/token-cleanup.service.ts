import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AccountTokensService } from './account-tokens.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes used and expired account tokens once a day, so the table does not grow without bound. */
@Injectable()
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenCleanupService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly tokens: AccountTokensService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.run(), DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async run(): Promise<void> {
    try {
      const removed = await this.tokens.deleteExpiredAndUsed();
      if (removed > 0) this.logger.log(`Removed ${removed} used or expired account tokens`);
    } catch (error) {
      this.logger.error(`Token cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
