import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';

/** One place for the connection settings; `synchronize` stays off, the schema only changes through migrations. */
export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    uuidExtension: 'pgcrypto',
    synchronize: false,
    migrationsRun: false,
  };
}
