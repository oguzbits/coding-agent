import { useEffect, useRef } from 'react';
import type { ChatItem } from './chat-state';
import { ToolCard } from './tool-card';

interface MessageListProps {
  items: ChatItem[];
  onAnswer: (callId: string, approved: boolean) => void;
  answering: boolean;
}

export function MessageList({ items, onAnswer, answering }: MessageListProps) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [items.length]);

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[800px] flex-col gap-4 p-6">
        {items.map((item) => {
          switch (item.kind) {
            case 'user':
              return (
                <p
                  key={item.key}
                  className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-[15px] bg-surface px-4 py-2"
                >
                  {item.text}
                </p>
              );
            case 'assistant':
              return (
                <p key={item.key} className="whitespace-pre-wrap">
                  {item.text}
                </p>
              );
            case 'notice':
              return (
                <p
                  key={item.key}
                  role={item.tone === 'error' ? 'alert' : 'status'}
                  className={item.tone === 'error' ? 'text-danger' : 'text-muted'}
                >
                  {item.text}
                </p>
              );
            case 'tool':
              return (
                <ToolCard
                  key={item.key}
                  tool={item}
                  answering={answering}
                  onAnswer={(approved) => onAnswer(item.callId, approved)}
                />
              );
          }
        })}
        <div ref={end} />
      </div>
    </div>
  );
}
