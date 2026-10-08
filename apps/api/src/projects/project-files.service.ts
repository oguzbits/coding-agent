import { readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZipFile } from 'yazl';
import { readTextFile, statOrUndefined } from '../agent/tools/file-access.js';
import { Workspace } from '../agent/tools/workspace.js';
import { ToolError } from '../agent/types.js';
import type { Env } from '../config/env.validation.js';
import { ProjectsService } from './projects.service.js';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size?: number;
}

const MAX_LISTED_ENTRIES = 2000;
/** Left out of the download: large, rebuilt by an install, and not what people want to take with them. */
const SKIPPED_IN_ARCHIVE = new Set(['node_modules']);

/** Read-only access to a project's files for the UI. Uses the same path guard and secret blocklist as the agent. */
@Injectable()
export class ProjectFilesService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(userId: string, projectId: string, relative = '.'): Promise<{ entries: FileEntry[]; truncated: boolean }> {
    const workspace = await this.workspaceOf(userId, projectId);
    const directory = await this.resolve(workspace, relative);
    const info = await statOrUndefined(directory);
    if (!info) throw new NotFoundException('Folder not found');
    if (!info.isDirectory()) throw new BadRequestException(`${relative} is not a folder.`);

    const dirents = await readdir(directory, { withFileTypes: true });
    const visible = dirents.filter(
      (entry) => !workspace.isProtected(workspace.display(path.join(directory, entry.name))),
    );
    const entries: FileEntry[] = [];
    for (const dirent of visible.slice(0, MAX_LISTED_ENTRIES)) {
      const absolute = path.join(directory, dirent.name);
      const entry: FileEntry = { name: dirent.name, path: workspace.display(absolute), type: 'file' };
      if (dirent.isDirectory()) entry.type = 'directory';
      else if (dirent.isSymbolicLink()) entry.type = 'symlink';
      else entry.size = (await lstat(absolute)).size;
      entries.push(entry);
    }
    entries.sort(
      (a, b) => Number(b.type === 'directory') - Number(a.type === 'directory') || (a.name < b.name ? -1 : 1),
    );
    return { entries, truncated: visible.length > MAX_LISTED_ENTRIES };
  }

  async read(
    userId: string,
    projectId: string,
    relative: string,
  ): Promise<{ path: string; content: string; truncated: boolean }> {
    const workspace = await this.workspaceOf(userId, projectId);
    const target = await this.resolve(workspace, relative);
    if (!(await statOrUndefined(target))) throw new NotFoundException('File not found');
    const { text } = await this.guard(() => readTextFile(workspace, relative));
    const limit = this.config.get('PROJECT_FILE_VIEW_MAX_BYTES', { infer: true });
    const bytes = Buffer.from(text);
    const truncated = bytes.length > limit;
    return { path: relative, content: truncated ? bytes.subarray(0, limit).toString() : text, truncated };
  }

  /** A zip of the project without secrets, git internals and dependency folders. Streams from disk. */
  async archive(userId: string, projectId: string): Promise<{ fileName: string; stream: NodeJS.ReadableStream }> {
    const project = await this.projects.getOwned(userId, projectId);
    const workspace = new Workspace(this.projects.directoryOf(userId, projectId));
    const root = await this.resolve(workspace, '.');
    const zip = new ZipFile();
    await this.addToArchive(zip, workspace, root);
    zip.end();
    return { fileName: `${project.name}.zip`, stream: zip.outputStream };
  }

  private async addToArchive(zip: ZipFile, workspace: Workspace, directory: string): Promise<void> {
    const dirents = await readdir(directory, { withFileTypes: true });
    for (const dirent of dirents.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const absolute = path.join(directory, dirent.name);
      const shown = workspace.display(absolute);
      if (workspace.isProtected(shown) || SKIPPED_IN_ARCHIVE.has(dirent.name)) continue;
      if (dirent.isDirectory()) {
        zip.addEmptyDirectory(shown);
        await this.addToArchive(zip, workspace, absolute);
      } else if (dirent.isFile()) {
        zip.addFile(absolute, shown);
      }
    }
  }

  private async workspaceOf(userId: string, projectId: string): Promise<Workspace> {
    await this.projects.getOwned(userId, projectId);
    return new Workspace(this.projects.directoryOf(userId, projectId));
  }

  private resolve(workspace: Workspace, relative: string): Promise<string> {
    return this.guard(() => workspace.resolve(relative));
  }

  /** The tools' errors are written for the model; here they become 400s with the same text. */
  private async guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ToolError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
