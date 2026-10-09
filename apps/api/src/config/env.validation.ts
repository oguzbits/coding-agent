import { plainToInstance, Transform } from 'class-transformer';
import {
  IsArray,
  IsBase64,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const NODE_ENVS = ['development', 'test', 'production'] as const;
const toBoolean = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const toNumber = ({ value }: { value: unknown }) => (value === undefined ? undefined : Number(value));

const MODEL_PROVIDERS = ['fake', 'gemini'] as const;
const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

export class Env {
  @IsIn(NODE_ENVS)
  NODE_ENV: (typeof NODE_ENVS)[number] = 'development';

  @Transform(toNumber)
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

  @IsString()
  @MinLength(32)
  @MaxLength(512)
  SESSION_SECRET!: string;

  /** Base64 of the 32-byte AES key that encrypts the users' Gemini keys. */
  @IsBase64()
  @Length(44, 44)
  MASTER_KEY!: string;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  MASTER_KEY_VERSION = 1;

  @Transform(toBoolean)
  @IsBoolean()
  REGISTRATION_OPEN = false;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  SESSION_IDLE_MINUTES = 480;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  SESSION_MAX_HOURS = 168;

  /** Unconfirmed accounts can log in, but cannot start a run. */
  @Transform(toBoolean)
  @IsBoolean()
  REQUIRE_EMAIL_CONFIRMATION = true;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  CONFIRM_TOKEN_HOURS = 24;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  RESET_TOKEN_MINUTES = 60;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  THROTTLE_DEFAULT_PER_MINUTE = 300;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_PER_MINUTE = 10;

  /** Defaults to true in production and false elsewhere. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  COOKIE_SECURE?: boolean;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: (typeof LOG_LEVELS)[number] = 'log';

  /** Which model backs the agent. `fake` answers from simple commands and needs no key. */
  @IsIn(MODEL_PROVIDERS)
  MODEL_PROVIDER: (typeof MODEL_PROVIDERS)[number] = 'fake';

  /** Used until the user sets a model in the profile. Model IDs live here and nowhere else in the code. */
  @IsString()
  @IsNotEmpty()
  GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';

  /** Free-tier limits of that model (Google AI Studio dashboard, 2026-10-09); users can override them in the profile. */
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  GEMINI_DEFAULT_REQUESTS_PER_MINUTE = 15;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  GEMINI_DEFAULT_TOKENS_PER_MINUTE = 250_000;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  GEMINI_DEFAULT_REQUESTS_PER_DAY = 500;

  /** Projects live in <WORKSPACES_DIR>/<user id>/<project id>. Created at startup if missing. */
  @IsString()
  @IsNotEmpty()
  WORKSPACES_DIR = '.workspaces';

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_MAX_STEPS = 25;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_REPEAT_FAILURE_LIMIT = 3;

  /** A run ends when a prompt exceeds this many tokens. */
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_HISTORY_TOKEN_BUDGET = 100_000;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_TOOL_OUTPUT_MAX_CHARS = 20_000;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_READ_MAX_BYTES = 100_000;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_READ_MAX_LINES = 2000;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_LIST_MAX_ENTRIES = 500;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_LIST_DEFAULT_DEPTH = 2;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_SEARCH_MAX_MATCHES = 100;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_SEARCH_LINE_MAX_CHARS = 300;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_SEARCH_TIMEOUT_SECONDS = 15;

  /** Largest file the agent may write in one call. */
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_WRITE_MAX_BYTES = 200_000;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_COMMAND_DEFAULT_TIMEOUT_SECONDS = 60;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_COMMAND_MAX_TIMEOUT_SECONDS = 300;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_COMMAND_OUTPUT_MAX_CHARS = 20_000;

  /** Between the polite stop (SIGTERM) and the kill (SIGKILL) of a command's process group. */
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  AGENT_COMMAND_KILL_GRACE_MS = 2000;

  /** Program used to clone repositories. */
  @IsString()
  @IsNotEmpty()
  GIT_BINARY = 'git';

  /** Oldest git that has the fixes for CVE-2024-32002 and CVE-2025-48384. Cloning is off when git is older. */
  @IsString()
  @IsNotEmpty()
  GIT_MIN_VERSION = '2.50.1';

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  PROJECT_CLONE_TIMEOUT_SECONDS = 120;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  PROJECT_CLONE_MAX_BYTES = 200_000_000;

  /** All projects of one user together. Checked when a repository is cloned. */
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  USER_STORAGE_MAX_BYTES = 1_000_000_000;

  /** Largest part of a file the project file viewer returns. */
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  PROJECT_FILE_VIEW_MAX_BYTES = 1_000_000;

  /** Files and folders that can run code later. In auto-edit mode, changing them still needs approval. */
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((entry: string) => entry.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  AGENT_SELF_EXECUTING_PATHS: string[] = ['package.json', '.github', '.husky', 'Makefile', '.npmrc'];

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  SSE_HEARTBEAT_SECONDS = 15;

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
