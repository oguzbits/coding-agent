import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

/** Total size in bytes of all files below a folder. Symlinks count as themselves and are not followed. */
export async function directorySize(directory: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  let total = 0;
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    try {
      total += entry.isDirectory() ? await directorySize(absolute) : (await lstat(absolute)).size;
    } catch (error) {
      // A file that disappeared while we were counting (a clone is writing here) is not an error.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return total;
}
