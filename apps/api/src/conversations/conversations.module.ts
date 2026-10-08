import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { rgPath } from '@vscode/ripgrep';
import { ModePolicy, PERMISSION_MODES, type PermissionMode } from '../agent/mode-policy.js';
import { SYSTEM_PROMPT } from '../agent/system-prompt.js';
import { createWorkspaceTools, type ToolLimits, type ToolSession } from '../agent/tools/create-tools.js';
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
  type PolicyFactory,
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
    {
      provide: AGENT_POLICY,
      inject: [ConfigService],
      useFactory: (config: AppConfig): PolicyFactory => {
        const selfExecuting = config.get('AGENT_SELF_EXECUTING_PATHS', { infer: true });
        return (mode) => {
          const known = (PERMISSION_MODES as readonly string[]).includes(mode);
          return new ModePolicy(known ? (mode as PermissionMode) : 'ask', selfExecuting);
        };
      },
    },
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
        const limits: ToolLimits = {
          readMaxLines: config.get('AGENT_READ_MAX_LINES', { infer: true }),
          readMaxBytes: config.get('AGENT_READ_MAX_BYTES', { infer: true }),
          listMaxEntries: config.get('AGENT_LIST_MAX_ENTRIES', { infer: true }),
          listDefaultDepth: config.get('AGENT_LIST_DEFAULT_DEPTH', { infer: true }),
          searchMaxMatches: config.get('AGENT_SEARCH_MAX_MATCHES', { infer: true }),
          searchLineMaxChars: config.get('AGENT_SEARCH_LINE_MAX_CHARS', { infer: true }),
          searchTimeoutMs: config.get('AGENT_SEARCH_TIMEOUT_SECONDS', { infer: true }) * 1000,
          writeMaxBytes: config.get('AGENT_WRITE_MAX_BYTES', { infer: true }),
          commandDefaultTimeoutMs: config.get('AGENT_COMMAND_DEFAULT_TIMEOUT_SECONDS', { infer: true }) * 1000,
          commandMaxTimeoutMs: config.get('AGENT_COMMAND_MAX_TIMEOUT_SECONDS', { infer: true }) * 1000,
          commandOutputMaxChars: config.get('AGENT_COMMAND_OUTPUT_MAX_CHARS', { infer: true }),
          commandKillGraceMs: config.get('AGENT_COMMAND_KILL_GRACE_MS', { infer: true }),
          rgPath,
        };
        return (workspace: Workspace, session: ToolSession): AgentTool[] =>
          createWorkspaceTools(workspace, session, limits);
      },
    },
  ],
})
export class ConversationsModule {}
