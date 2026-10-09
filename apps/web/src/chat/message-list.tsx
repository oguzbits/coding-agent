import { useEffect, useRef } from 'react';
import type { ChatItem, ToolItem } from './chat-state';
import { ActionGroup, type ActionGroupProps } from './action-group';
import { MarkdownText } from './markdown';
import { ToolCard } from './tool-card';

type Block = Exclude<ChatItem, ToolItem> | { kind: 'tools'; key: string; tools: ToolItem[] };

/** Consecutive tool calls become one block, so a long run of actions does not bury the messages. */
function toBlocks(items: ChatItem[]): Block[] {
  const blocks: Block[] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    if (item.kind !== 'tool') blocks.push(item);
    else if (last?.kind === 'tools') last.tools.push(item);
    else blocks.push({ kind: 'tools', key: item.key, tools: [item] });
  }
  return blocks;
}

function ActionBlock({ tools, answering, onAnswer }: ActionGroupProps) {
  const [only] = tools;
  if (tools.length > 1 || !only) return <ActionGroup tools={tools} answering={answering} onAnswer={onAnswer} />;
  return <ToolCard tool={only} answering={answering} onAnswer={(approved) => onAnswer(only.callId, approved)} />;
}

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
        {toBlocks(items).map((item) => {
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
              return <MarkdownText key={item.key} text={item.text} />;
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
            case 'tools':
              return <ActionBlock key={item.key} tools={item.tools} answering={answering} onAnswer={onAnswer} />;
          }
        })}
        <div ref={end} />
      </div>
    </div>
  );
}
