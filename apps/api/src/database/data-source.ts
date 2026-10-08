// Entry point for the TypeORM CLI (migration:generate, migration:run). The app itself builds its connection in the
// database module; both use the same options. The URL goes through the same validation as at app startup.
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation.js';
import { buildDataSourceOptions } from './data-source.options.js';

export default new DataSource(buildDataSourceOptions(validateEnv(process.env).DATABASE_URL));
