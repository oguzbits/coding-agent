import { useEffect, useReducer } from 'react';
import { EVENT_TYPES, emptyChat, reduceChat, type ChatState, type RunEvent } from './chat-state';

/**
 * Follows the events of a conversation. The stream replays everything from the start, so the chat is rebuilt after a
 * reload; the browser sends Last-Event-ID by itself when it reconnects.
 */
export function useRunStream(conversationId: string): ChatState {
  const [state, dispatch] = useReducer(reduceChat, emptyChat);

  useEffect(() => {
    const source = new EventSource(`/api/conversations/${conversationId}/events`);
    const listener = (message: MessageEvent<string>) => {
      dispatch({ seq: Number(message.lastEventId), event: JSON.parse(message.data) as RunEvent });
    };
    for (const type of EVENT_TYPES) source.addEventListener(type, listener as EventListener);
    return () => {
      source.close();
    };
  }, [conversationId]);

  return state;
}
