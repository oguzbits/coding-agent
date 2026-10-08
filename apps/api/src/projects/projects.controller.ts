import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { Project } from './project.entity.js';
import { CreateProjectDto, ProjectDto, RenameProjectDto } from './projects.dto.js';
import { ProjectFilesService } from './project-files.service.js';
import { ProjectsService } from './projects.service.js';

const view = (project: Project): ProjectDto => ({
  id: project.id,
  name: project.name,
  origin: project.origin,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly files: ProjectFilesService,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: ProjectDto })
  async create(@CurrentUser() user: Express.User, @Body() dto: CreateProjectDto): Promise<ProjectDto> {
    return view(await this.projects.create(user.id, dto.name));
  }

  @Get()
  @ApiOkResponse({ type: [ProjectDto] })
  async list(@CurrentUser() user: Express.User): Promise<ProjectDto[]> {
    return (await this.projects.list(user.id)).map(view);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ProjectDto })
  async rename(
    @CurrentUser() user: Express.User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameProjectDto,
  ): Promise<ProjectDto> {
    return view(await this.projects.rename(user.id, id, dto.name));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: Express.User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.projects.remove(user.id, id);
  }

  @Get(':id/files')
  listFiles(
    @CurrentUser() user: Express.User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('path') path?: string,
  ): ReturnType<ProjectFilesService['list']> {
    return this.files.list(user.id, id, path || undefined);
  }

  @Get(':id/files/content')
  fileContent(
    @CurrentUser() user: Express.User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('path') path = '',
  ): ReturnType<ProjectFilesService['read']> {
    return this.files.read(user.id, id, path);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: Express.User,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { fileName, stream } = await this.files.archive(user.id, id);
    const plain = fileName.replace(/[^\w .-]/g, '_');
    res.status(200).set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
