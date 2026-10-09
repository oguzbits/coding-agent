import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { ToolItem } from './chat-state';
import { ToolCard } from './tool-card';

export interface ActionGroupProps {
  tools: ToolItem[];
  answering: boolean;
  onAnswer: (callId: string, approved: boolean) => void;
}

/** Several actions in a row fold into one line; an action that waits for a decision keeps the group open. */
export function ActionGroup({ tools, answering, onAnswer }: ActionGroupProps) {
  const [open, setOpen] = useState(false);
  const failed = tools.filter((tool) => tool.status === 'error').length;
  const waiting = tools.some((tool) => tool.status === 'awaiting');
  const expanded = open || waiting;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(!open)}
        className="flex h-8 items-center gap-2 rounded-field px-1 text-left text-sm text-muted hover:bg-hover"
      >
        <ChevronRight size={14} className={expanded ? 'rotate-90' : ''} />
        <span>{tools.length} actions</span>
        {failed > 0 ? <span className="text-danger">{failed} failed</span> : null}
      </button>
      {expanded
        ? tools.map((tool) => (
            <ToolCard
              key={tool.key}
              tool={tool}
              answering={answering}
              onAnswer={(approved) => onAnswer(tool.callId, approved)}
            />
          ))
        : null}
    </div>
  );
}
