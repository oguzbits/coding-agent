import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { Env } from '../config/env.validation.js';
import { Project } from './project.entity.js';
import { GitCloner } from './git-cloner.js';
import { ProjectFilesService } from './project-files.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  controllers: [ProjectsController],
  providers: [
    ProjectFilesService,
    {
      provide: ProjectsService,
      inject: [getRepositoryToken(Project), ConfigService],
      useFactory: async (projects: Repository<Project>, config: ConfigService<Env, true>) => {
        const root = path.resolve(config.get('WORKSPACES_DIR', { infer: true }));
        await mkdir(root, { recursive: true });
        const cloner = new GitCloner({
          gitBinary: config.get('GIT_BINARY', { infer: true }),
          home: path.join(root, '.git-home'),
          limits: {
            timeoutMs: config.get('PROJECT_CLONE_TIMEOUT_SECONDS', { infer: true }) * 1000,
            maxBytes: config.get('PROJECT_CLONE_MAX_BYTES', { infer: true }),
            killGraceMs: config.get('AGENT_COMMAND_KILL_GRACE_MS', { infer: true }),
            minVersion: config.get('GIT_MIN_VERSION', { infer: true }),
          },
        });
        const git = await cloner.check();
        if (!git.ok) {
          new Logger('Projects').warn(
            `Git ${git.version ?? 'is missing'}; version ${config.get('GIT_MIN_VERSION', { infer: true })} or newer is needed. Cloning is switched off.`,
          );
        }
        return new ProjectsService(projects, root, {
          cloner,
          cloningAvailable: git.ok,
          userStorageMaxBytes: config.get('USER_STORAGE_MAX_BYTES', { infer: true }),
        });
      },
    },
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
