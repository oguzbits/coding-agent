import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { ToolError } from '../types.js';

const PROTECTED_SEGMENT = /^(?:\.git|\.env(?:\..*)?|id_(?:rsa|ed25519|ecdsa|dsa).*|.*\.(?:pem|key|p12|pfx))$/;
const ALLOWED_PROTECTED = new Set(['.env.example']);

const isProtected = (segment: string) => !ALLOWED_PROTECTED.has(segment) && PROTECTED_SEGMENT.test(segment);

/**
 * The directory the agent may touch. Every path from the model goes through `resolve`, which keeps it inside the
 * directory (symlinks included) and away from secrets and git internals.
 */
export class Workspace {
  private realRoot?: Promise<string>;
  private realRootPath?: string;

  constructor(readonly root: string) {}

  async resolve(requested: string): Promise<string> {
    if (!requested.trim() || requested.includes('\0')) throw new ToolError('The path is empty or invalid.');
    this.realRoot ??= realpath(this.root);
    const root = await this.realRoot;
    this.realRootPath = root;
    const lexical = path.resolve(root, requested);
    this.assertInside(root, lexical);
    this.assertNotProtected(root, lexical);
    const real = await this.realpathOfExisting(lexical);
    this.assertInside(root, real);
    this.assertNotProtected(root, real);
    return lexical;
  }

  /** Lexical check of a path relative to the root. Used to filter listings and search results. */
  isProtected(relative: string): boolean {
    return relative.split(/[\\/]/).some((segment) => isProtected(segment.normalize('NFC').toLowerCase()));
  }

  display(absolute: string): string {
    return path
      .relative(this.realRootPath ?? this.root, absolute)
      .split(path.sep)
      .join('/');
  }

  private assertInside(root: string, candidate: string) {
    const relative = path.relative(root, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ToolError('That path is outside the workspace.');
    }
  }

  private assertNotProtected(root: string, candidate: string) {
    if (this.isProtected(path.relative(root, candidate))) {
      throw new ToolError('That path is protected (secrets and git internals are off limits).');
    }
  }

  /** Real path of the longest existing prefix, with the missing tail appended, so new files are checked too. */
  private async realpathOfExisting(target: string): Promise<string> {
    const missing: string[] = [];
    let current = target;
    for (;;) {
      try {
        return path.join(await realpath(current), ...missing);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const parent = path.dirname(current);
        if (parent === current) throw error;
        missing.unshift(path.basename(current));
        current = parent;
      }
    }
  }
}
