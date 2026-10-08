import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source.options.js';

const url = process.env.TEST_DATABASE_URL ?? '';

describe('database migrations', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    // Guard: the next line wipes the schema, so it must never run against another database.
    expect(new URL(url).pathname).toMatch(/_test$/);
    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.dropDatabase();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('runs every migration on an empty database', async () => {
    await dataSource.runMigrations();
    expect(await dataSource.showMigrations()).toBe(false);
  });

  it('leaves no difference between the entities and the migrated schema', async () => {
    const pending = await dataSource.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
  });
});
