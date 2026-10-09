import { Check, ChevronRight, Loader2, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/controls';
import type { ToolItem } from './chat-state';

/** The argument that says best what a call does. */
function summary(tool: ToolItem): string {
  const { path, command, pattern } = tool.args;
  const main = [path, command, pattern].find((value) => typeof value === 'string');
  return typeof main === 'string' ? main : '';
}

function StatusIcon({ status }: { status: ToolItem['status'] }) {
  if (status === 'done') return <Check size={14} className="text-success" aria-label="done" />;
  if (status === 'error') return <TriangleAlert size={14} className="text-danger" aria-label="failed" />;
  if (status === 'rejected') return <X size={14} className="text-muted" aria-label="rejected" />;
  return (
    <Loader2 size={14} className="animate-spin text-muted" aria-label={status === 'awaiting' ? 'waiting' : 'running'} />
  );
}

function Preview({ text }: { text: string }) {
  return (
    <pre className="scroll-thin max-h-72 overflow-auto rounded-field bg-deep p-3 font-mono text-xs">
      {text.split('\n').map((line, index) => {
        const tone = line.startsWith('+') ? 'text-success' : line.startsWith('-') ? 'text-danger' : '';
        return (
          <span key={index} className={`block ${tone}`}>
            {line || ' '}
          </span>
        );
      })}
    </pre>
  );
}

interface ToolCardProps {
  tool: ToolItem;
  onAnswer: (approved: boolean) => void;
  answering: boolean;
}

export function ToolCard({ tool, onAnswer, answering }: ToolCardProps) {
  const [open, setOpen] = useState(false);
  const awaiting = tool.status === 'awaiting';
  const expanded = open || awaiting;
  return (
    <div className="rounded-field border border-line-subtle bg-surface">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm"
      >
        <ChevronRight size={14} className={expanded ? 'rotate-90' : ''} />
        <span className="font-medium">{tool.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{summary(tool)}</span>
        <StatusIcon status={tool.status} />
      </button>
      {expanded ? (
        <div className="flex flex-col gap-2 border-t border-line-subtle p-3">
          {tool.preview ? <Preview text={tool.preview} /> : null}
          {tool.output ? <Preview text={tool.output} /> : null}
          {awaiting ? (
            <div className="flex gap-2">
              <Button variant="primary" disabled={answering} onClick={() => onAnswer(true)}>
                Approve
              </Button>
              <Button disabled={answering} onClick={() => onAnswer(false)}>
                Reject
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
