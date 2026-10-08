import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';

const src = join(import.meta.dirname, '..');

function filesBelow(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesBelow(join(dir, entry.name), suffix) : entry.name.endsWith(suffix) ? [entry.name] : [],
  );
}

describe('registration of entities and migrations', () => {
  it('lists every *.entity.ts file in ENTITIES', () => {
    expect(ENTITIES).toHaveLength(filesBelow(src, '.entity.ts').length);
  });

  it('lists every migration file in MIGRATIONS, in timestamp order', () => {
    const files = filesBelow(join(src, 'database', 'migrations'), '.ts').filter((name) => /^\d+-/.test(name));
    expect(MIGRATIONS).toHaveLength(files.length);
    const timestamps = MIGRATIONS.map((migration) => Number(migration.name.match(/\d+$/)?.[0]));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });
});
