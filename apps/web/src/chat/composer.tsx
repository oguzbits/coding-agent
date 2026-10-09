import { ArrowUp, Square } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

interface ComposerProps {
  onSubmit: (text: string) => void;
  /** Shown instead of the send button while a run is going; stops the run. */
  onStop?: () => void;
  running?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function Composer({ onSubmit, onStop, running = false, disabled = false, placeholder }: ComposerProps) {
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !disabled && !running;

  const send = () => {
    if (!canSend) return;
    onSubmit(text.trim());
    setText('');
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="flex items-end gap-3 rounded-[15px] bg-surface p-4">
      <textarea
        aria-label="Message"
        rows={2}
        value={text}
        placeholder={placeholder ?? 'What should be done?'}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="scroll-thin max-h-60 min-h-10 flex-1 resize-none bg-transparent placeholder:text-muted focus-visible:outline-none"
      />
      {running ? (
        <button
          type="button"
          aria-label="Stop"
          onClick={onStop}
          className="flex size-8 items-center justify-center rounded-full bg-contrast text-on-contrast"
        >
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Send"
          disabled={!canSend}
          onClick={send}
          className="flex size-8 items-center justify-center rounded-full bg-contrast text-on-contrast disabled:opacity-40"
        >
          <ArrowUp size={18} />
        </button>
      )}
    </div>
  );
}
