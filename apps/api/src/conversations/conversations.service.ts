import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { HistoryEntry, ProviderPart } from '../model/model-provider.js';
import { ProjectsService } from '../projects/projects.service.js';
import { Conversation } from './conversation.entity.js';
import { Message } from './message.entity.js';
import { Run } from './run.entity.js';

const DEFAULT_TITLE = 'New conversation';
const TITLE_FROM_MESSAGE_LENGTH = 60;

const newMessage = (conversationId: string, entry: HistoryEntry): Message =>
  Object.assign(new Message(), { conversationId, role: entry.role, parts: entry.parts });

export interface ActiveRunView {
  id: string;
  state: string;
  pendingApproval: Run['pendingApproval'];
}

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly projects: ProjectsService,
  ) {}

  async create(userId: string, projectId: string, title?: string): Promise<Conversation> {
    await this.projects.getOwned(userId, projectId);
    return this.conversations.save(this.conversations.create({ userId, projectId, title: title ?? DEFAULT_TITLE }));
  }

  list(userId: string, projectId?: string): Promise<Conversation[]> {
    return this.conversations.find({
      where: { userId, ...(projectId ? { projectId } : {}) },
      order: { updatedAt: 'DESC' },
    });
  }

  /** Throws NotFound for a conversation that does not exist and for one that belongs to somebody else. */
  async getOwned(userId: string, id: string): Promise<Conversation> {
    const conversation = await this.conversations.findOneBy({ id, userId });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async update(userId: string, id: string, changes: { title?: string; mode?: string }): Promise<Conversation> {
    const conversation = await this.getOwned(userId, id);
    if (changes.title !== undefined) conversation.title = changes.title;
    if (changes.mode !== undefined) conversation.mode = changes.mode;
    return this.conversations.save(conversation);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.conversations.delete({ id });
  }

  async activeRun(conversationId: string): Promise<ActiveRunView | null> {
    const run = await this.dataSource
      .getRepository(Run)
      .createQueryBuilder('r')
      .where('r.conversation_id = :conversationId AND r.state IN (:...states)', {
        conversationId,
        states: ['running', 'awaiting_approval'],
      })
      .orderBy('r.started_at', 'DESC')
      .getOne();
    return run ? { id: run.id, state: run.state, pendingApproval: run.pendingApproval } : null;
  }

  async loadHistory(conversationId: string): Promise<HistoryEntry[]> {
    const rows = await this.dataSource.getRepository(Message).find({ where: { conversationId }, order: { id: 'ASC' } });
    return rows.map((row) => ({ role: row.role, parts: row.parts }));
  }

  async appendEntry(conversationId: string, entry: HistoryEntry): Promise<void> {
    await this.dataSource.getRepository(Message).save(newMessage(conversationId, entry));
    await this.conversations.update({ id: conversationId }, { updatedAt: new Date() });
  }

  /**
   * Adds the user's message. If the history already ends with a user entry (tool answers of a run that stopped early),
   * the parts join that entry, because the model expects the roles to alternate.
   */
  async appendUserParts(conversationId: string, parts: ProviderPart[]): Promise<HistoryEntry[]> {
    return this.dataSource.transaction(async (manager) => {
      const messages = manager.getRepository(Message);
      const last = await messages.findOne({ where: { conversationId }, order: { id: 'DESC' } });
      if (last?.role === 'user') await messages.save(Object.assign(last, { parts: [...last.parts, ...parts] }));
      else await messages.save(newMessage(conversationId, { role: 'user', parts }));
      const rows = await messages.find({ where: { conversationId }, order: { id: 'ASC' } });
      return rows.map((row) => ({ role: row.role, parts: row.parts }));
    });
  }

  /** Replaces the stored history. Used only to repair histories that a crash left inconsistent. */
  async replaceHistory(conversationId: string, entries: HistoryEntry[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const messages = manager.getRepository(Message);
      await messages.delete({ conversationId });
      for (const entry of entries) await messages.save(newMessage(conversationId, entry));
    });
  }

  /** Gives a conversation that still has the default title a title taken from its first message. */
  async titleFromFirstMessage(conversationId: string, text: string): Promise<void> {
    const title = text.replace(/\s+/g, ' ').trim().slice(0, TITLE_FROM_MESSAGE_LENGTH);
    if (title) await this.conversations.update({ id: conversationId, title: DEFAULT_TITLE }, { title });
  }
}
