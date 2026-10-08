import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaticPolicy } from '../agent/static-policy.js';
import { SYSTEM_PROMPT } from '../agent/system-prompt.js';
import { createAppendNoteTool } from '../agent/tools/append-note.tool.js';
import { createReadFileTool } from '../agent/tools/read-file.tool.js';
import { Workspace } from '../agent/tools/workspace.js';
import { ProjectsModule } from '../projects/projects.module.js';
import type { AgentLimits, AgentTool } from '../agent/types.js';
import type { Env } from '../config/env.validation.js';
import { ModelModule } from '../model/model.module.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { Conversation } from './conversation.entity.js';
import { Message } from './message.entity.js';
import { RunEventsService } from './run-events.service.js';
import { Run } from './run.entity.js';
import { RunEventRecord } from './run-event.entity.js';
import {
  AGENT_LIMITS,
  AGENT_POLICY,
  AGENT_SYSTEM_PROMPT,
  CREATE_TOOLS,
  RunsService,
  type ToolFactory,
} from './runs.service.js';

type AppConfig = ConfigService<Env, true>;

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message, Run, RunEventRecord]), ModelModule, ProjectsModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    RunEventsService,
    RunsService,
    { provide: AGENT_SYSTEM_PROMPT, useValue: SYSTEM_PROMPT },
    { provide: AGENT_POLICY, useFactory: () => new StaticPolicy(['read_file']) },
    {
      provide: AGENT_LIMITS,
      inject: [ConfigService],
      useFactory: (config: AppConfig): AgentLimits => ({
        maxSteps: config.get('AGENT_MAX_STEPS', { infer: true }),
        historyTokenBudget: config.get('AGENT_HISTORY_TOKEN_BUDGET', { infer: true }),
        repeatFailureLimit: config.get('AGENT_REPEAT_FAILURE_LIMIT', { infer: true }),
        toolOutputMaxChars: config.get('AGENT_TOOL_OUTPUT_MAX_CHARS', { infer: true }),
      }),
    },
    {
      provide: CREATE_TOOLS,
      inject: [ConfigService],
      useFactory: (config: AppConfig): ToolFactory => {
        const readMaxBytes = config.get('AGENT_READ_MAX_BYTES', { infer: true });
        return (workspace: Workspace): AgentTool[] => [
          createReadFileTool(workspace, { maxBytes: readMaxBytes }),
          // Test tool that needs approval; goes away when the edit tools arrive.
          createAppendNoteTool(workspace),
        ];
      },
    },
  ],
})
export class ConversationsModule {}
