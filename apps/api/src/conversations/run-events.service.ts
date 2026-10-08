import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { RunEvent } from '../agent/types.js';
import { Conversation } from './conversation.entity.js';
import { RunEventRecord } from './run-event.entity.js';

export interface StoredEvent {
  seq: number;
  event: RunEvent;
}

type Listener = (event: StoredEvent) => void;

/** Stores run events with a number per conversation and hands them to open streams after they are stored. */
@Injectable()
export class RunEventsService {
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async append(conversationId: string, runId: string, event: RunEvent): Promise<StoredEvent> {
    const seq = await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(Conversation)
        .set({ lastEventSeq: () => 'last_event_seq + 1' })
        .where('id = :conversationId', { conversationId })
        .returning('last_event_seq')
        .execute();
      const next = (result.raw as { last_event_seq: number }[])[0]?.last_event_seq;
      if (next === undefined) throw new Error('The conversation no longer exists');
      await manager.save(
        Object.assign(new RunEventRecord(), { conversationId, seq: next, runId, type: event.type, payload: event }),
      );
      return next;
    });
    const stored = { seq, event };
    for (const listener of this.listeners.get(conversationId) ?? []) listener(stored);
    return stored;
  }

  async listAfter(conversationId: string, afterSeq: number): Promise<StoredEvent[]> {
    const rows = await this.dataSource
      .getRepository(RunEventRecord)
      .createQueryBuilder('e')
      .where('e.conversation_id = :conversationId AND e.seq > :afterSeq', { conversationId, afterSeq })
      .orderBy('e.seq', 'ASC')
      .getMany();
    return rows.map((row) => ({ seq: row.seq, event: row.payload }));
  }

  /**
   * Calls `write` with every event after `afterSeq`: first the stored ones, then live ones, each exactly once and
   * in order. Returns the function that ends the subscription.
   */
  async stream(conversationId: string, afterSeq: number, write: Listener): Promise<() => void> {
    let lastSent = afterSeq;
    let replaying = true;
    const buffered: StoredEvent[] = [];
    const deliver = (stored: StoredEvent) => {
      if (stored.seq <= lastSent) return;
      lastSent = stored.seq;
      write(stored);
    };
    const listener: Listener = (stored) => (replaying ? buffered.push(stored) : deliver(stored));
    const set = this.listeners.get(conversationId) ?? new Set<Listener>();
    this.listeners.set(conversationId, set);
    set.add(listener);
    const unsubscribe = () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(conversationId);
    };
    try {
      for (const stored of await this.listAfter(conversationId, afterSeq)) deliver(stored);
      buffered.forEach(deliver);
      replaying = false;
    } catch (error) {
      unsubscribe();
      throw error;
    }
    return unsubscribe;
  }
}
