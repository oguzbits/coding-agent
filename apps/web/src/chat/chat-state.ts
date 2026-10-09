import type { Schemas } from '../api/client';

export type RunEvent =
  | Schemas['RunStartedEventDto']
  | Schemas['UserMessageEventDto']
  | Schemas['AssistantMessageEventDto']
  | Schemas['ToolCallEventDto']
  | Schemas['ApprovalRequestedEventDto']
  | Schemas['ApprovalResolvedEventDto']
  | Schemas['ToolResultEventDto']
  | Schemas['RunFinishedEventDto']
  | Schemas['RunAbortedEventDto']
  | Schemas['RunFailedEventDto'];

/** The event names of the stream; the browser needs each one registered. */
export const EVENT_TYPES: RunEvent['type'][] = [
  'run_started',
  'user_message',
  'assistant_message',
  'tool_call',
  'approval_requested',
  'approval_resolved',
  'tool_result',
  'run_finished',
  'run_aborted',
  'run_failed',
];

export interface StreamedEvent {
  seq: number;
  event: RunEvent;
}

type ToolStatus = 'running' | 'awaiting' | 'done' | 'error' | 'rejected';

export interface ToolItem {
  kind: 'tool';
  key: string;
  callId: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  preview?: string;
  output?: string;
  approved?: boolean;
}

export type ChatItem =
  | { kind: 'user'; key: string; text: string }
  | { kind: 'assistant'; key: string; text: string }
  | { kind: 'notice'; key: string; tone: 'info' | 'error'; text: string }
  | ToolItem;

export interface ChatState {
  items: ChatItem[];
  lastSeq: number;
  running: boolean;
  /** The tool call that waits for the user's decision. */
  pendingCallId?: string;
}

export const emptyChat: ChatState = { items: [], lastSeq: 0, running: false };

function updateTool(items: ChatItem[], callId: string, change: (tool: ToolItem) => ToolItem): ChatItem[] {
  return items.map((item) => (item.kind === 'tool' && item.callId === callId ? change(item) : item));
}

type LifecycleEvent = Extract<RunEvent, { type: 'run_started' | 'run_finished' | 'run_aborted' | 'run_failed' }>;

function isLifecycle(event: RunEvent): event is LifecycleEvent {
  return event.type.startsWith('run_');
}

function applyLifecycle(state: ChatState, key: string, event: LifecycleEvent): ChatState {
  const ended = { ...state, running: false, pendingCallId: undefined };
  switch (event.type) {
    case 'run_started':
      return { ...state, running: true };
    case 'run_finished':
      return ended;
    case 'run_aborted':
      return { ...ended, items: [...state.items, { kind: 'notice', key, tone: 'info', text: 'The run was stopped.' }] };
    case 'run_failed':
      return { ...ended, items: [...state.items, { kind: 'notice', key, tone: 'error', text: event.message }] };
  }
}

function applyEvent(state: ChatState, seq: number, event: RunEvent): ChatState {
  const key = `e${seq}`;
  if (isLifecycle(event)) return applyLifecycle(state, key, event);
  switch (event.type) {
    case 'user_message':
      return { ...state, items: [...state.items, { kind: 'user', key, text: event.text }] };
    case 'assistant_message':
      return { ...state, items: [...state.items, { kind: 'assistant', key, text: event.text }] };
    case 'tool_call':
      return {
        ...state,
        items: [
          ...state.items,
          { kind: 'tool', key, callId: event.callId, name: event.name, args: event.args, status: 'running' },
        ],
      };
    case 'approval_requested':
      return {
        ...state,
        pendingCallId: event.callId,
        items: updateTool(state.items, event.callId, (tool) => ({
          ...tool,
          status: 'awaiting',
          preview: event.preview,
        })),
      };
    case 'approval_resolved':
      return {
        ...state,
        pendingCallId: undefined,
        items: updateTool(state.items, event.callId, (tool) => ({
          ...tool,
          approved: event.approved,
          status: event.approved ? 'running' : 'rejected',
        })),
      };
    case 'tool_result':
      return {
        ...state,
        items: updateTool(state.items, event.callId, (tool) => ({
          ...tool,
          output: event.output,
          status: tool.status === 'rejected' ? 'rejected' : event.isError ? 'error' : 'done',
        })),
      };
  }
}

/** Folds one stored event into the chat. Events at or below the last seen number are skipped (replays after reconnecting). */
export function reduceChat(state: ChatState, { seq, event }: StreamedEvent): ChatState {
  if (seq <= state.lastSeq) return state;
  return { ...applyEvent(state, seq, event), lastSeq: seq };
}
