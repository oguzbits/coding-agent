export class UsageLimitsDto {
  requestsPerMinute!: number;
  tokensPerMinute!: number;
  requestsPerDay!: number;
}

export class UsageDto {
  model!: string;
  /** The day (Pacific time) the counters belong to, as YYYY-MM-DD. */
  day!: string;
  requests!: number;
  tokens!: number;
  limits!: UsageLimitsDto;
}
