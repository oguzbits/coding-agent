import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { ModelGateway } from '../model.gateway.js';
import { pacificDay } from '../rate-limit/rate-limiter.js';
import { TypeOrmUsageStore } from './usage.stores.js';

class UsageDto {
  model!: string;
  day!: string;
  requests!: number;
  tokens!: number;
  limits!: { requestsPerMinute: number; tokensPerMinute: number; requestsPerDay: number };
}

/** What this application has spent today. Google reports no remaining quota, and the same key may be used elsewhere. */
@Controller('usage')
export class UsageController {
  constructor(
    private readonly gateway: ModelGateway,
    private readonly store: TypeOrmUsageStore,
  ) {}

  @Get()
  @ApiOkResponse({ type: UsageDto })
  async get(@CurrentUser() user: Express.User): Promise<UsageDto> {
    const { model, limits } = await this.gateway.effective(user.id);
    const day = pacificDay(Date.now());
    return { model, day, ...(await this.store.today(user.id, model, day)), limits };
  }
}
