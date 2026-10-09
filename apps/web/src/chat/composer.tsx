import { ArrowUp, Square } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';

interface ComposerProps {
  /** May return a promise; the text stays in the field when it resolves to false (sending failed). */
  onSubmit: (text: string) => void | boolean | Promise<boolean | void>;
  /** Shown instead of the send button while a run is going; stops the run. */
  onStop?: () => void;
  running?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Controls shown left of the send button, like the template's mode picker. */
  toolbar?: ReactNode;
}

export function Composer({ onSubmit, onStop, running = false, disabled = false, placeholder, toolbar }: ComposerProps) {
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !disabled && !running;

  const send = () => {
    if (!canSend) return;
    void Promise.resolve(onSubmit(text.trim())).then((sent) => {
      if (sent !== false) setText('');
    });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  const round = 'flex size-8 shrink-0 items-center justify-center rounded-full';
  return (
    <div className="flex flex-col gap-3 rounded-[15px] bg-surface p-4">
      <textarea
        aria-label="Message"
        rows={1}
        value={text}
        placeholder={placeholder ?? 'What should be done?'}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="scroll-thin max-h-100 min-h-5 w-full resize-none bg-transparent text-[16px] leading-5 placeholder:text-muted focus-visible:outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">{toolbar}</div>
        {running ? (
          <button type="button" aria-label="Stop" onClick={onStop} className={`${round} bg-contrast text-on-contrast`}>
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Send"
            disabled={!canSend}
            onClick={send}
            className={`${round} ${canSend ? 'bg-contrast text-on-contrast' : 'border border-line text-muted'} disabled:cursor-not-allowed`}
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
