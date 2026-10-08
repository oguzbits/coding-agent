import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { Env } from '../config/env.validation.js';
import { Project } from './project.entity.js';
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
        return new ProjectsService(projects, root);
      },
    },
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
