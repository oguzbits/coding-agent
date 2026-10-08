import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { repairHistory } from '../agent/repair-history.js';
import { runAgent } from '../agent/agent-loop.js';
import type { AgentLimits, AgentTool, RunEvent, RunSink, RunState, ToolPolicy } from '../agent/types.js';
import { requestContext } from '../logging/request-context.js';
import type { HistoryEntry, ModelProvider } from '../model/model-provider.js';
import { ModelGateway, type PreparedModel } from '../model/model.gateway.js';
import { Workspace } from '../agent/tools/workspace.js';
import { ProjectsService } from '../projects/projects.service.js';
import { ApprovalRegistry } from './approval-registry.js';
import type { Conversation } from './conversation.entity.js';
import { ConversationsService } from './conversations.service.js';
import { RunEventsService } from './run-events.service.js';
import { Run } from './run.entity.js';

export const CREATE_TOOLS = Symbol('CREATE_TOOLS');
export type ToolFactory = (workspace: Workspace) => AgentTool[];
export const AGENT_POLICY = Symbol('AGENT_POLICY');
export const AGENT_LIMITS = Symbol('AGENT_LIMITS');
export const AGENT_SYSTEM_PROMPT = Symbol('AGENT_SYSTEM_PROMPT');

interface ActiveRun {
  runId: string;
  projectId: string;
  conversationId: string;
  controller: AbortController;
  approvals: ApprovalRegistry;
  done: Promise<void>;
}

const TERMINAL_STATES: RunState[] = ['finished', 'aborted', 'failed'];

/** Starts, tracks and stops runs. A run lives in this process; the database holds what clients need to catch up. */
@Injectable()
export class RunsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RunsService.name);
  private readonly active = new Map<string, ActiveRun>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly conversations: ConversationsService,
    private readonly events: RunEventsService,
    private readonly gateway: ModelGateway,
    @Inject(CREATE_TOOLS) private readonly createTools: ToolFactory,
    private readonly projects: ProjectsService,
    @Inject(AGENT_POLICY) private readonly policy: ToolPolicy,
    @Inject(AGENT_LIMITS) private readonly limits: AgentLimits,
    @Inject(AGENT_SYSTEM_PROMPT) private readonly systemPrompt: string,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.projects.onBeforeRemove((userId, projectId) => this.stopProject(userId, projectId));
    await this.abortLeftoverRuns();
  }

  /** Runs that were running or waiting when the server stopped cannot continue; the conversation stays usable. */
  async abortLeftoverRuns(): Promise<void> {
    const leftovers = await this.dataSource
      .getRepository(Run)
      .find({ where: { state: In(['running', 'awaiting_approval']) } });
    for (const run of leftovers) {
      await this.dataSource
        .getRepository(Run)
        .update({ id: run.id }, { state: 'aborted', pendingApproval: null, endedAt: new Date(), endReason: 'restart' });
      await this.events.append(run.conversationId, run.id, { type: 'run_aborted' });
    }
  }

  async start(userId: string, conversationId: string, text: string): Promise<{ runId: string }> {
    const conversation = await this.conversations.getOwned(userId, conversationId);
    const prepared = await this.gateway.prepare(userId);
    if (this.active.has(userId)) throw new ConflictException('A run is already active. Stop it or wait until it ends.');

    const controller = new AbortController();
    const approvals = new ApprovalRegistry();
    let finish!: () => void;
    const active: ActiveRun = {
      runId: '',
      projectId: conversation.projectId,
      conversationId,
      controller,
      approvals,
      done: new Promise<void>((resolve) => (finish = resolve)),
    };
    this.active.set(userId, active);
    try {
      const history = await this.prepareHistory(conversationId, text, prepared.format);
      const run = await this.dataSource
        .getRepository(Run)
        .save({ conversationId, state: 'running', pendingApproval: null });
      active.runId = run.id;
      await this.events.append(conversationId, run.id, { type: 'run_started' });
      void this.execute(userId, conversation, active, history, prepared).finally(() => {
        this.active.delete(userId);
        finish();
      });
      return { runId: run.id };
    } catch (error) {
      this.active.delete(userId);
      finish();
      throw error;
    }
  }

  async resolveApproval(userId: string, conversationId: string, callId: string, approved: boolean): Promise<void> {
    await this.conversations.getOwned(userId, conversationId);
    const active = this.active.get(userId);
    if (active?.conversationId !== conversationId || !active.approvals.resolve(callId, approved)) {
      throw new NotFoundException('No such approval is waiting');
    }
  }

  /** Stops the user's run in this conversation, if there is one, and waits until it has ended. */
  async stop(userId: string, conversationId: string): Promise<void> {
    const active = this.active.get(userId);
    if (active?.conversationId !== conversationId) return;
    active.controller.abort();
    await active.done;
  }

  /** Stops the user's run if it works in this project. Used before a project is deleted. */
  async stopProject(userId: string, projectId: string): Promise<void> {
    const active = this.active.get(userId);
    if (active?.projectId !== projectId) return;
    active.controller.abort();
    await active.done;
  }

  private async prepareHistory(conversationId: string, text: string, format: ModelProvider): Promise<HistoryEntry[]> {
    const stored = await this.conversations.loadHistory(conversationId);
    const repaired = repairHistory(stored, format);
    if (JSON.stringify(repaired) !== JSON.stringify(stored)) {
      await this.conversations.replaceHistory(conversationId, repaired);
    }
    if (stored.length === 0) await this.conversations.titleFromFirstMessage(conversationId, text);
    return this.conversations.appendUserParts(conversationId, format.userMessageParts(text));
  }

  private async execute(
    userId: string,
    conversation: Conversation,
    active: ActiveRun,
    history: HistoryEntry[],
    prepared: PreparedModel,
  ): Promise<void> {
    const { runId } = active;
    const conversationId = conversation.id;
    const workspace = new Workspace(this.projects.directoryOf(userId, conversation.projectId));
    const runs = this.dataSource.getRepository(Run);
    let failureCode: string | undefined;
    let pending: Run['pendingApproval'] = null;

    const sink: RunSink = {
      emit: async (event: RunEvent) => {
        if (event.type === 'run_failed') failureCode = event.code;
        if (event.type === 'approval_requested')
          pending = { callId: event.callId, name: event.name, preview: event.preview };
        await this.events.append(conversationId, runId, event);
      },
      appendHistory: async (entry: HistoryEntry) => {
        await this.conversations.appendEntry(conversationId, entry);
        history.push(entry);
      },
      setState: async (state) => {
        const terminal = TERMINAL_STATES.includes(state);
        await runs.update(
          { id: runId },
          {
            state,
            pendingApproval: state === 'awaiting_approval' ? pending : null,
            ...(terminal
              ? { endedAt: new Date(), endReason: state === 'failed' ? (failureCode ?? 'internal') : state }
              : {}),
          },
        );
      },
    };

    try {
      await requestContext.run({ requestId: requestContext.getStore()?.requestId ?? runId, userId, runId }, () =>
        runAgent(
          {
            provider: prepared.forRun(runId),
            tools: this.createTools(workspace),
            policy: this.policy,
            approvals: active.approvals,
            sink,
            limits: this.limits,
            systemPrompt: this.systemPrompt,
            signal: active.controller.signal,
          },
          { model: prepared.model, apiKey: prepared.apiKey, history },
        ),
      );
    } catch (error) {
      this.logger.error(`Run ${runId} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      await this.markFailed(conversationId, runId);
    }
  }

  private async markFailed(conversationId: string, runId: string): Promise<void> {
    try {
      await this.events.append(conversationId, runId, {
        type: 'run_failed',
        code: 'internal',
        message: 'The run failed unexpectedly.',
      });
      await this.dataSource
        .getRepository(Run)
        .update({ id: runId }, { state: 'failed', pendingApproval: null, endedAt: new Date(), endReason: 'internal' });
    } catch (error) {
      this.logger.error(`Could not record the failure of run ${runId}: ${error instanceof Error ? error.message : ''}`);
    }
  }
}
