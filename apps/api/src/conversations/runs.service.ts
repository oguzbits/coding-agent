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
import { UsersService } from '../users/users.service.js';
import { ApprovalRegistry } from './approval-registry.js';
import { ConversationsService } from './conversations.service.js';
import { RunEventsService } from './run-events.service.js';
import { Run } from './run.entity.js';

export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');
export const AGENT_TOOLS = Symbol('AGENT_TOOLS');
export const AGENT_POLICY = Symbol('AGENT_POLICY');
export const AGENT_LIMITS = Symbol('AGENT_LIMITS');
export const AGENT_MODEL = Symbol('AGENT_MODEL');
export const AGENT_SYSTEM_PROMPT = Symbol('AGENT_SYSTEM_PROMPT');

interface ActiveRun {
  runId: string;
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
    private readonly users: UsersService,
    @Inject(MODEL_PROVIDER) private readonly provider: ModelProvider,
    @Inject(AGENT_TOOLS) private readonly tools: AgentTool[],
    @Inject(AGENT_POLICY) private readonly policy: ToolPolicy,
    @Inject(AGENT_LIMITS) private readonly limits: AgentLimits,
    @Inject(AGENT_MODEL) private readonly model: string,
    @Inject(AGENT_SYSTEM_PROMPT) private readonly systemPrompt: string,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
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
    if (this.active.has(userId)) throw new ConflictException('A run is already active. Stop it or wait until it ends.');

    const controller = new AbortController();
    const approvals = new ApprovalRegistry();
    let finish!: () => void;
    const active: ActiveRun = {
      runId: '',
      conversationId,
      controller,
      approvals,
      done: new Promise<void>((resolve) => (finish = resolve)),
    };
    this.active.set(userId, active);
    try {
      const history = await this.prepareHistory(conversationId, text);
      const run = await this.dataSource
        .getRepository(Run)
        .save({ conversationId, state: 'running', pendingApproval: null });
      active.runId = run.id;
      await this.events.append(conversationId, run.id, { type: 'run_started' });
      const apiKey = (await this.users.getGeminiKey(userId)) ?? '';
      void this.execute(userId, conversation.id, active, history, apiKey).finally(() => {
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

  private async prepareHistory(conversationId: string, text: string): Promise<HistoryEntry[]> {
    const stored = await this.conversations.loadHistory(conversationId);
    const repaired = repairHistory(stored, this.provider);
    if (JSON.stringify(repaired) !== JSON.stringify(stored)) {
      await this.conversations.replaceHistory(conversationId, repaired);
    }
    if (stored.length === 0) await this.conversations.titleFromFirstMessage(conversationId, text);
    return this.conversations.appendUserParts(conversationId, this.provider.userMessageParts(text));
  }

  private async execute(
    userId: string,
    conversationId: string,
    active: ActiveRun,
    history: HistoryEntry[],
    apiKey: string,
  ): Promise<void> {
    const { runId } = active;
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
            provider: this.provider,
            tools: this.tools,
            policy: this.policy,
            approvals: active.approvals,
            sink,
            limits: this.limits,
            systemPrompt: this.systemPrompt,
            signal: active.controller.signal,
          },
          { model: this.model, apiKey, history },
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
