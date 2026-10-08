import { plainToInstance, Transform } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

const NODE_ENVS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

export class Env {
  @IsIn(NODE_ENVS)
  NODE_ENV: (typeof NODE_ENVS)[number] = 'development';

  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  HOST = '127.0.0.1';

  @IsString()
  @IsUrl({
    protocols: ['postgres', 'postgresql'],
    require_protocol: true,
    require_tld: false,
  })
  DATABASE_URL!: string;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: (typeof LOG_LEVELS)[number] = 'log';

  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((origin: string) => origin.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  ALLOWED_ORIGINS: string[] = ['http://localhost:5173'];
}

/** Validates the raw environment once at startup. Error messages name the variables, never their values. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const lines = errors.map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join('; ')}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return env;
}
