import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { Project } from './project.entity.js';
import { CreateProjectDto, ProjectDto, RenameProjectDto } from './projects.dto.js';
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
  constructor(private readonly projects: ProjectsService) {}

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
}
