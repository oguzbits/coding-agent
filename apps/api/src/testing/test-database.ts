import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../database/data-source.options.js';

/** Wipes the test database and migrates it from scratch. Refuses to touch any database not ending in _test. */
export async function resetTestDatabase(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? '';
  if (!new URL(url).pathname.endsWith('_test'))
    throw new Error('Refusing to reset a database that is not a _test database');
  const dataSource = new DataSource(buildDataSourceOptions(url));
  await dataSource.initialize();
  try {
    await dataSource.dropDatabase();
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
